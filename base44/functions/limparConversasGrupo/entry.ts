import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const empresaId = body.empresa_id;

    if (!empresaId) {
      return Response.json({ error: 'empresa_id required' }, { status: 400 });
    }

    // Buscar todas as conversas da empresa
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId },
      '-created_date',
      1000
    );

    // Filtrar conversas falsas com @lid (números inválidos do WhatsApp)
    const conversasFalsas = conversas.filter(c => {
      const tel = (c.cliente_telefone || '').replace(/\D/g, '');
      const wid = c.whatsapp_id || '';
      // @lid são contatos com privacidade ativada - não são números válidos
      return wid.includes('@lid') || tel.includes('lid') || tel.startsWith('lid');
    });

    if (grupos.length === 0) {
      return Response.json({ 
        message: 'Nenhuma conversa de grupo encontrada para limpar',
        total: 0,
        excluidas: 0
      });
    }

    // Excluir mensagens de todos os grupos em uma operação
    const grupoIds = grupos.map(g => g.id);
    const todasMensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
      { conversa_id: { $in: grupoIds } },
      '-created_date',
      5000
    );

    // Excluir mensagens em lotes
    for (let i = 0; i < todasMensagens.length; i += 100) {
      const lote = todasMensagens.slice(i, i + 100);
      for (const msg of lote) {
        await base44.asServiceRole.entities.MensagemWhatsapp.delete(msg.id);
      }
      // Pequeno delay entre lotes para evitar rate limit
      if (i + 100 < todasMensagens.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Excluir conversas de grupo
    let excluidas = 0;
    for (const grupo of grupos) {
      await base44.asServiceRole.entities.ConversaWhatsapp.delete(grupo.id);
      excluidas++;
    }

    return Response.json({
      message: `${excluidas} conversas de grupo excluídas com sucesso`,
      total: grupos.length,
      excluidas: excluidas
    });
  } catch (error) {
    console.error('Erro em limparConversasGrupo:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});