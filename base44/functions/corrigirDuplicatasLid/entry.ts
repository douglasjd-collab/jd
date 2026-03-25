import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Normaliza telefone BR para 12 dígitos (sem 9 dígito extra)
function normalizarTel(tel) {
  if (!tel || typeof tel !== 'string') return null;
  const n = tel.replace(/\D/g, '');
  if (!n || n.includes('lid')) return null;
  // Se 13 dígitos BR (com 9 extra), remover o 9
  if (n.startsWith('55') && n.length === 13) return n.slice(0, 4) + n.slice(5);
  return n;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id;
    if (!empresaId) return Response.json({ error: 'empresa_id required' }, { status: 400 });

    // 1. Buscar TODAS as conversas
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId }, '-data_ultima_mensagem', 2000
    );

    // 2. Buscar TODOS os contatos (incluindo lid_jid mapeados)
    const contatos = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
      { empresa_id: empresaId }, '-created_date', 2000
    );

    // Mapas de lookup
    const contatoPorLid = {};
    const contatoPorTel = {};
    for (const c of contatos) {
      if (c.lid_jid) contatoPorLid[c.lid_jid] = c;
      if (c.telefone && !c.telefone.includes('lid')) {
        const norm = normalizarTel(c.telefone);
        if (norm) contatoPorTel[norm] = c;
      }
    }

    let corrigidasLid = 0;
    let excluidasDuplicatas = 0;

    // 3. Corrigir conversas com @lid no telefone ou whatsapp_id
    const conversasLid = conversas.filter(c =>
      (c.cliente_telefone || '').includes('lid') ||
      (c.whatsapp_id || '').includes('@lid')
    );

    for (const conv of conversasLid) {
      const lidRaw = (conv.cliente_telefone || '').replace(/\D/g, '');
      const whatsappIdRaw = (conv.whatsapp_id || '').replace(/\D/g, '');

      // Procurar contato resolvido nos dois campos (@lid)
      let contatoResolvido = contatoPorLid[lidRaw] || contatoPorLid[whatsappIdRaw];

      // Se nenhum contato foi encontrado por @lid, verificar se há conversa com mesmo telefone certo
      if (!contatoResolvido) {
        for (const c of contatos) {
          if (c.telefone && !c.telefone.includes('lid')) {
            const norm = normalizarTel(c.telefone);
            // Se encontrar conversas duplicadas com mesmo telefone, usar esse número
            if (norm) contatoResolvido = c;
          }
        }
      }

      if (contatoResolvido && contatoResolvido.telefone && !contatoResolvido.telefone.includes('lid')) {
        // Corrigir conversa: trocar @lid ou número inválido por número correto
        await base44.asServiceRole.entities.ConversaWhatsapp.update(conv.id, {
          cliente_telefone: contatoResolvido.telefone,
          cliente_nome: conv.cliente_nome || contatoResolvido.nome || contatoResolvido.telefone,
          whatsapp_id: contatoResolvido.telefone + '@s.whatsapp.net'
        });
        console.log(`✅ @lid corrigido: ${conv.cliente_telefone} → ${contatoResolvido.telefone}`);
        corrigidasLid++;
      } else {
        // @lid não foi resolvido — marcar para possível ajuste manual
        console.warn(`⚠️ @lid não resolvido: ${conv.cliente_telefone} | Conversa: ${conv.id}`);
      }
    }

    // 4. Deduplicar conversas do mesmo telefone (manter a mais recente)
    // Re-buscar após correções
    const conversasAtualizadas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId }, '-data_ultima_mensagem', 2000
    );

    const porTelNorm = {};
    for (const conv of conversasAtualizadas) {
      const tel = (conv.cliente_telefone || '').replace(/\D/g, '');
      if (!tel || tel.includes('lid')) continue;
      const norm = normalizarTel(tel) || tel;
      if (!porTelNorm[norm]) {
        porTelNorm[norm] = conv;
      } else {
        // Manter a mais recente
        const existente = porTelNorm[norm];
        const dataExistente = new Date(existente.data_ultima_mensagem || existente.created_date || 0);
        const dataAtual = new Date(conv.data_ultima_mensagem || conv.created_date || 0);
        if (dataAtual > dataExistente) {
          // conv é mais recente — excluir a antiga
          console.log(`🗑️ Excluindo duplicata mais antiga: ${existente.id} (${tel})`);
          await base44.asServiceRole.entities.ConversaWhatsapp.delete(existente.id).catch(() => {});
          excluidasDuplicatas++;
          porTelNorm[norm] = conv;
        } else {
          // existente é mais recente — excluir a atual
          console.log(`🗑️ Excluindo duplicata mais antiga: ${conv.id} (${tel})`);
          await base44.asServiceRole.entities.ConversaWhatsapp.delete(conv.id).catch(() => {});
          excluidasDuplicatas++;
        }
      }
    }

    return Response.json({
      ok: true,
      corrigidasLid,
      excluidasDuplicatas,
      totalConversas: conversasAtualizadas.length
    });
  } catch (error) {
    console.error('Erro em corrigirDuplicatasLid:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});