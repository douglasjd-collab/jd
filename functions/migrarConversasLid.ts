// Migra conversas com cliente_telefone = lid_XXXX para o número real de WhatsApp
// Usa o mapeamento já salvo em ContatoWhatsapp.lid_jid
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const JD_ID = '699696c2c9f5bffc2e67402b';

    // Buscar todas as conversas com telefone lid_
    const todasConversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: JD_ID }, '-created_date', 200
    );
    const conversasLid = todasConversas.filter(c => (c.cliente_telefone || '').startsWith('lid_'));

    console.log(`🔍 Encontradas ${conversasLid.length} conversas com lid_`);

    if (conversasLid.length === 0) {
      return Response.json({ ok: true, migradas: 0, sem_mapeamento: 0, message: 'Nenhuma conversa lid_ encontrada' });
    }

    // Buscar todos os ContatoWhatsapp com lid_jid preenchido
    const contatosComLid = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
      { empresa_id: JD_ID }, '-created_date', 200
    );
    // Montar mapa lid_numerico → telefone real
    const lidMap = {};
    for (const c of contatosComLid) {
      if (c.lid_jid && c.telefone) {
        lidMap[c.lid_jid] = c.telefone;
      }
    }
    console.log(`📒 Mapa lid_jid disponível: ${JSON.stringify(lidMap)}`);

    let migradas = 0;
    let semMapeamento = 0;
    const resultados = [];

    for (const conv of conversasLid) {
      const lidNumerico = (conv.cliente_telefone || '').replace('lid_', '');
      const telefoneReal = lidMap[lidNumerico];

      if (!telefoneReal) {
        semMapeamento++;
        resultados.push({ id: conv.id, lid: conv.cliente_telefone, status: 'sem_mapeamento' });
        console.warn(`⚠️ Sem mapeamento para ${conv.cliente_telefone}`);
        continue;
      }

      // Verificar se já existe conversa com o número real
      const conversaExistente = todasConversas.find(
        c => c.id !== conv.id && (c.cliente_telefone === telefoneReal || c.cliente_telefone === telefoneReal.slice(0, 4) + telefoneReal.slice(5))
      );

      if (conversaExistente) {
        // Migrar mensagens para a conversa existente e deletar a lid_
        const mensagensLid = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
          { conversa_id: conv.id }, 'data_envio', 500
        );
        for (const msg of mensagensLid) {
          await base44.asServiceRole.entities.MensagemWhatsapp.update(msg.id, {
            conversa_id: conversaExistente.id
          });
        }
        await base44.asServiceRole.entities.ConversaWhatsapp.delete(conv.id);
        console.log(`✅ ${mensagensLid.length} msgs migradas de ${conv.id} → ${conversaExistente.id} (${telefoneReal})`);
        resultados.push({ id: conv.id, lid: conv.cliente_telefone, telefone: telefoneReal, status: 'migrado_e_mesclado', msgs: mensagensLid.length });
      } else {
        // Atualizar a conversa lid_ com o número real
        await base44.asServiceRole.entities.ConversaWhatsapp.update(conv.id, {
          cliente_telefone: telefoneReal,
          cliente_nome: conv.cliente_nome?.startsWith('lid_') ? telefoneReal : conv.cliente_nome,
        });
        console.log(`✅ Conversa ${conv.id} atualizada: ${conv.cliente_telefone} → ${telefoneReal}`);
        resultados.push({ id: conv.id, lid: conv.cliente_telefone, telefone: telefoneReal, status: 'atualizado' });
      }

      migradas++;
    }

    return Response.json({ ok: true, migradas, sem_mapeamento: semMapeamento, resultados });

  } catch (e) {
    console.error('❌ Erro:', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
});