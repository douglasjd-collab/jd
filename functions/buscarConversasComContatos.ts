import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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

    // Buscar conversas
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId },
      '-data_ultima_mensagem',
      100
    );

    // Para cada conversa, buscar o contato com foto_url
    const resultado = [];
    for (const conversa of conversas) {
      try {
        // Buscar contato pelo telefone
        const contatos = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
          {
            empresa_id: empresaId,
            telefone: conversa.cliente_telefone
          },
          '-created_date',
          1
        );

        const contato = contatos && contatos.length > 0 ? contatos[0] : null;

        resultado.push({
          id: conversa.id,
          cliente_nome: conversa.cliente_nome,
          cliente_telefone: conversa.cliente_telefone,
          ultima_mensagem: conversa.ultima_mensagem,
          data_ultima_mensagem: conversa.data_ultima_mensagem,
          status: conversa.status,
          contato: contato ? {
            id: contato.id,
            nome: contato.nome,
            telefone: contato.telefone,
            foto_url: contato.foto_url, // 👈 GARANTIR QUE VENHA
            ultima_atualizacao: contato.ultima_atualizacao
          } : null
        });
      } catch (e) {
        console.warn(`Erro ao buscar contato para conversa ${conversa.id}:`, e.message);
        resultado.push({
          ...conversa,
          contato: null
        });
      }
    }

    return Response.json({ conversas: resultado }, { status: 200 });
  } catch (error) {
    console.error('Erro em buscarConversasComContatos:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});