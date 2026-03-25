import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Normalizar telefone BR para 12 dígitos (sem 9 extra)
function normalizarTel(tel) {
  if (!tel || typeof tel !== 'string') return null;
  const n = tel.replace(/\D/g, '');
  if (!n.startsWith('55') || n.length < 12) return null;
  // Se 13 dígitos com 9 no terceiro dígito, remover
  if (n.length === 13 && n.charAt(2) === '9') return n.slice(0, 2) + n.slice(3);
  return n;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id || '699696c2c9f5bffc2e67402b';

    console.log('🔍 Validando sincronização de números...');

    // Buscar todas as conversas e contatos CRM
    const [conversas, contatosCRM] = await Promise.all([
      base44.asServiceRole.entities.ConversaWhatsapp.filter({ empresa_id: empresaId }, '-created_date', 5000).catch(() => []),
      base44.asServiceRole.entities.ContatoWhatsapp.filter({ empresa_id: empresaId }, '-created_date', 5000).catch(() => [])
    ]);

    let erros = [];
    let corrigidos = 0;

    // Validação 1: Conversas com números duplicados (com e sem 9)
    const conversasMap = {};
    for (const conv of conversas) {
      const tel = (conv.cliente_telefone || '').replace(/\D/g, '');
      if (!tel) continue;

      const norm = normalizarTel(conv.cliente_telefone);
      if (!norm) {
        erros.push(`❌ Conversa ${conv.id}: número inválido "${conv.cliente_telefone}"`);
        continue;
      }

      if (!conversasMap[norm]) {
        conversasMap[norm] = [];
      }
      conversasMap[norm].push(conv);
    }

    // Procurar duplicatas (mesma normalização, mas IDs diferentes)
    for (const [telNorm, convs] of Object.entries(conversasMap)) {
      if (convs.length > 1) {
        console.log(`⚠️ DUPLICATA: ${telNorm} tem ${convs.length} conversas`);
        // Manter a mais recente, deletar as antigas
        convs.sort((a, b) => new Date(b.data_ultima_mensagem || b.created_date) - new Date(a.data_ultima_mensagem || a.created_date));
        for (let i = 1; i < convs.length; i++) {
          await base44.asServiceRole.entities.ConversaWhatsapp.delete(convs[i].id).catch(() => {});
          console.log(`🗑️ Deletada conversa duplicada: ${convs[i].id}`);
          corrigidos++;
        }
      }
    }

    // Validação 2: Contatos CRM com números inválidos ou duplicados
    const contatosMap = {};
    for (const contato of contatosCRM) {
      const tel = (contato.telefone || '').replace(/\D/g, '');
      if (!tel) continue;

      const norm = normalizarTel(contato.telefone);
      if (!norm) {
        erros.push(`❌ Contato ${contato.id}: número inválido "${contato.telefone}"`);
        continue;
      }

      if (!contatosMap[norm]) {
        contatosMap[norm] = [];
      }
      contatosMap[norm].push(contato);
    }

    // Procurar duplicatas nos contatos
    for (const [telNorm, contatos] of Object.entries(contatosMap)) {
      if (contatos.length > 1) {
        console.log(`⚠️ DUPLICATA CRM: ${telNorm} tem ${contatos.length} contatos`);
        contatos.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
        for (let i = 1; i < contatos.length; i++) {
          await base44.asServiceRole.entities.ContatoWhatsapp.delete(contatos[i].id).catch(() => {});
          console.log(`🗑️ Deletado contato duplicado: ${contatos[i].id}`);
          corrigidos++;
        }
      }
    }

    // Validação 3: Comparar conversas vs contatos CRM
    let sincronizados = 0;
    for (const conv of conversas) {
      const telNorm = normalizarTel(conv.cliente_telefone);
      if (!telNorm) continue;

      const contatoExiste = contatosCRM.find(c => normalizarTel(c.telefone) === telNorm);
      if (!contatoExiste) {
        // Criar contato para esta conversa
        await base44.asServiceRole.entities.ContatoWhatsapp.create({
          empresa_id: empresaId,
          telefone: telNorm,
          nome: conv.cliente_nome || `Cliente ${telNorm}`,
          ultima_atualizacao: new Date().toISOString()
        }).catch(err => {
          erros.push(`❌ Erro ao criar contato para ${telNorm}: ${err.message}`);
        });
        sincronizados++;
        console.log(`✅ Contato criado para conversa: ${telNorm}`);
      }
    }

    // Validação 4: Garantir que todas as conversas têm o número normalizado (sem variações)
    for (const conv of conversas) {
      const telNorm = normalizarTel(conv.cliente_telefone);
      if (!telNorm) continue;

      const telAtual = (conv.cliente_telefone || '').replace(/\D/g, '');
      if (telAtual !== telNorm) {
        // Atualizar conversa com número normalizado
        await base44.asServiceRole.entities.ConversaWhatsapp.update(conv.id, {
          cliente_telefone: telNorm,
          whatsapp_id: `${telNorm}@s.whatsapp.net`
        }).catch(() => {});
        console.log(`✅ Conversa normalizada: ${telAtual} → ${telNorm}`);
        corrigidos++;
      }
    }

    return Response.json({
      ok: true,
      status: 'VALIDAÇÃO COMPLETA',
      conversas_total: conversas.length,
      contatos_total: contatosCRM.length,
      duplicatas_removidas: corrigidos,
      contatos_criados: sincronizados,
      erros: erros.length > 0 ? erros : null,
      mensagem: `✅ ${corrigidos} correções | ${sincronizados} novos contatos CRM | ${erros.length} erros`
    });
  } catch (error) {
    console.error('Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});