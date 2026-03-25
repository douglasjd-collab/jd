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

    // Buscar conversas ativas de hoje (criadas ou com mensagem hoje)
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0); // Início do dia
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1); // Fim do dia
    
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { 
        empresa_id: empresaId,
        status: 'ativa' // Apenas conversas ativas
      },
      '-data_ultima_mensagem',
      2000
    );
    
    // Filtrar apenas conversas de hoje (criadas ou com última mensagem hoje)
    const conversasHoje = conversas.filter(c => {
      const dataMsg = c.data_ultima_mensagem ? new Date(c.data_ultima_mensagem) : null;
      const dataCriacao = c.created_date ? new Date(c.created_date) : null;
      const dataRef = dataMsg || dataCriacao;
      return dataRef && dataRef >= hoje && dataRef < amanha;
    });

    // Buscar todos os contatos da empresa de uma vez
    const contatos = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
      { empresa_id: empresaId },
      '-created_date',
      2000
    );

    // Criar mapa de telefone -> contato para lookup O(1)
    const contatoMap = {};
    for (const c of contatos) {
      if (c.telefone) {
        contatoMap[c.telefone] = c;
      }
    }

    // Normalizar telefone para deduplicação (sempre usar versão de 12 dígitos como chave canônica)
    const normalizarTelefone = (tel) => {
      if (!tel || !tel.startsWith('55')) return tel;
      // Se 13 dígitos (com 9 extra), remover o 9 para normalizar
      if (tel.length === 13) return tel.slice(0, 4) + tel.slice(5);
      return tel;
    };

    // Deduplicar conversas do mesmo telefone — manter a mais recente
    const conversasPorTelNorm = {};
    for (const conversa of conversasHoje) {
      const tel = conversa.cliente_telefone || '';
      const chave = normalizarTelefone(tel);
      if (!chave) continue; // Apenas descartar se vazio
      const existente = conversasPorTelNorm[chave];
      if (!existente) {
        conversasPorTelNorm[chave] = conversa;
      } else {
        // Manter a mais recente por data_ultima_mensagem
        const dataExistente = new Date(existente.data_ultima_mensagem || existente.created_date || 0);
        const dataAtual = new Date(conversa.data_ultima_mensagem || conversa.created_date || 0);
        if (dataAtual > dataExistente) {
          conversasPorTelNorm[chave] = conversa;
        }
      }
    }

    // Buscar mensagens de TODAS as conversas de hoje
    const mensagensMap = {};
    for (const conversa of conversasHoje) {
      try {
        const msgs = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
          { conversa_id: conversa.id },
          'data_envio',
          300
        );
        mensagensMap[conversa.id] = msgs || [];
      } catch (e) {
        console.warn(`⚠️ Erro ao buscar mensagens da conversa ${conversa.id}:`, e.message);
        mensagensMap[conversa.id] = [];
      }
    }

    // Montar resultado com histórico de mensagens
    const resultado = Object.values(conversasPorTelNorm).map(conversa => {
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
        whatsapp_id: conversa.whatsapp_id || '',
        ultima_mensagem: conversa.ultima_mensagem,
        data_ultima_mensagem: conversa.data_ultima_mensagem,
        status: conversa.status,
        usuario_responsavel_id: conversa.usuario_responsavel_id || null,
        usuario_responsavel_nome: conversa.usuario_responsavel_nome || null,
        contato: contato ? {
          id: contato.id,
          nome: contato.nome,
          telefone: contato.telefone,
          foto_url: contato.foto_url,
          ultima_atualizacao: contato.ultima_atualizacao
        } : null,
        mensagens: mensagensMap[conversa.id] || []
      };
    });

    // Ordenar por data_ultima_mensagem desc
    resultado.sort((a, b) =>
      new Date(b.data_ultima_mensagem || 0) - new Date(a.data_ultima_mensagem || 0)
    );

    return Response.json({ conversas: resultado }, { status: 200 });
  } catch (error) {
    console.error('Erro em buscarConversasComContatos:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});