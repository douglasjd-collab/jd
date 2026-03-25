import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Função para:
 * 1. Encontrar conversas duplicadas (mesmo telefone em múltiplas conversas)
 * 2. Encontrar conversas com @lid
 * 3. Consolidar: manter a mais recente, deletar antigas
 * 4. Mover todas as mensagens para conversa final
 */

function normalizarTel(tel) {
  if (!tel) return null;
  const n = tel.replace(/\D/g, '');
  if (!n || n.includes('lid')) return null;
  // Se 13 dígitos BR (com 9 extra), remover o 9
  if (n.startsWith('55') && n.length === 13) return n.slice(0, 4) + n.slice(5);
  return n;
}

async function consolidarConversas(base44, empresaId, telefone, conversas) {
  if (conversas.length <= 1) return 0;
  
  // Ordenar por data (mais recente primeiro)
  conversas.sort((a, b) => {
    const dataA = new Date(a.data_ultima_mensagem || a.created_date || 0);
    const dataB = new Date(b.data_ultima_mensagem || b.created_date || 0);
    return dataB - dataA;
  });

  const conversaPrincipal = conversas[0];
  let deletadas = 0;

  // Mover mensagens de conversas antigas para a principal
  for (let i = 1; i < conversas.length; i++) {
    const convAntiga = conversas[i];
    try {
      // Buscar mensagens da conversa antiga
      const msgs = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
        { conversa_id: convAntiga.id },
        '-created_date',
        10000
      );

      // Atualizar conversa_id para a principal
      for (const msg of msgs) {
        try {
          await base44.asServiceRole.entities.MensagemWhatsapp.update(msg.id, {
            conversa_id: conversaPrincipal.id
          });
        } catch (e) {
          console.warn(`⚠️ Erro ao mover msg ${msg.id}: ${e.message}`);
        }
      }

      // Deletar conversa antiga
      await base44.asServiceRole.entities.ConversaWhatsapp.delete(convAntiga.id);
      deletadas++;
      console.log(`🗑️ Conversa duplicada deletada: ${convAntiga.id} (${telefone})`);
    } catch (e) {
      console.error(`❌ Erro ao consolidar ${convAntiga.id}: ${e.message}`);
    }
  }

  return deletadas;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id || '699696c2c9f5bffc2e67402b';

    console.log(`🔍 Iniciando detecção e correção de duplicatas...`);

    // 1. Buscar TODAS as conversas
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId },
      '-created_date',
      10000
    );

    console.log(`📊 Total de conversas: ${conversas.length}`);

    // 2. Agrupar por número normalizado
    const porTelefone = {};
    const comLid = [];

    for (const conv of conversas) {
      const tel = conv.cliente_telefone || '';
      
      // Detectar @lid
      if (tel.includes('@lid') || tel.includes('lid_')) {
        comLid.push(conv);
        continue;
      }

      const telNorm = normalizarTel(tel);
      if (!telNorm) {
        console.warn(`⚠️ Telefone inválido: ${tel} (conversa ${conv.id})`);
        continue;
      }

      if (!porTelefone[telNorm]) {
        porTelefone[telNorm] = [];
      }
      porTelefone[telNorm].push(conv);
    }

    console.log(`⚠️ ${comLid.length} conversas com @lid encontradas`);
    console.log(`📱 ${Object.keys(porTelefone).length} números únicos`);

    // 3. Contar duplicatas
    let duplicatasEncontradas = 0;
    let deletadas = 0;

    for (const [telefone, convs] of Object.entries(porTelefone)) {
      if (convs.length > 1) {
        console.log(`🔴 ${convs.length} conversas para ${telefone}`);
        duplicatasEncontradas++;
        deletadas += await consolidarConversas(base44, empresaId, telefone, convs);
      }
    }

    // 4. Deletar conversas @lid (sem recuperar mensagens — são inválidas)
    let deletadasLid = 0;
    for (const conv of comLid) {
      try {
        // Deletar mensagens @lid
        const msgs = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
          { conversa_id: conv.id },
          '-created_date',
          10000
        );
        for (const msg of msgs) {
          await base44.asServiceRole.entities.MensagemWhatsapp.delete(msg.id).catch(() => {});
        }

        // Deletar conversa @lid
        await base44.asServiceRole.entities.ConversaWhatsapp.delete(conv.id);
        deletadasLid++;
        console.log(`🗑️ Conversa @lid deletada: ${conv.id}`);
      } catch (e) {
        console.error(`❌ Erro ao deletar @lid ${conv.id}: ${e.message}`);
      }
    }

    return Response.json({
      ok: true,
      totalConversas: conversas.length,
      numerosUnicos: Object.keys(porTelefone).length,
      duplicatasEncontradas,
      duplicatasDeletadas: deletadas,
      conversasLidDeletadas: deletadasLid,
      totalDeletadas: deletadas + deletadasLid
    });
  } catch (error) {
    console.error('❌ Erro geral:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});