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

    // Detectar grupos
    const isGrupo = (c) => {
      const tel = (c.cliente_telefone || '').replace(/\D/g, '');
      const wid = c.whatsapp_id || '';
      return wid.includes('@g.us') || tel.endsWith('@g.us') || wid.endsWith('-') || tel.length > 13;
    };

    // Filtrar apenas grupos
    const grupos = conversas.filter(c => isGrupo(c));

    if (grupos.length === 0) {
      return Response.json({ 
        message: 'Nenhuma conversa de grupo encontrada para limpar',
        total: 0,
        excluidas: 0
      });
    }

    // Excluir mensagens e conversas de cada grupo
    let excluidas = 0;
    for (const grupo of grupos) {
      // Excluir todas as mensagens do grupo
      const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
        { conversa_id: grupo.id }
      );

      for (const msg of mensagens) {
        await base44.asServiceRole.entities.MensagemWhatsapp.delete(msg.id);
      }

      // Excluir a conversa
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