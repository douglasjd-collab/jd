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

    // Buscar conversas (1 query apenas)
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId },
      '-data_ultima_mensagem',
      100
    );

    // Buscar todos os contatos da empresa de uma vez (1 query apenas)
    const contatos = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
      { empresa_id: empresaId },
      '-created_date',
      200
    );

    // Criar mapa de telefone -> contato para lookup O(1)
    const contatoMap = {};
    for (const c of contatos) {
      if (c.telefone) {
        contatoMap[c.telefone] = c;
      }
    }

    // Montar resultado sem queries adicionais
    const resultado = conversas.map(conversa => {
      const tel = conversa.cliente_telefone || '';
      // Tentar telefone exato, depois variação com/sem 9 dígito BR
      let contato = contatoMap[tel] || null;
      if (!contato && tel.startsWith('55')) {
        const variacao = tel.length === 13
          ? tel.slice(0, 4) + tel.slice(5)   // remove o 9
          : tel.slice(0, 4) + '9' + tel.slice(4); // adiciona o 9
        contato = contatoMap[variacao] || null;
      }

      return {
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
          foto_url: contato.foto_url,
          ultima_atualizacao: contato.ultima_atualizacao
        } : null
      };
    });

    return Response.json({ conversas: resultado }, { status: 200 });
  } catch (error) {
    console.error('Erro em buscarConversasComContatos:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});