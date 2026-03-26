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
    const limit = body.limit || 10000;

    if (!empresaId) {
      return Response.json({ error: 'empresa_id required' }, { status: 400 });
    }

    // Buscar TODAS as conversas
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId },
      '-data_ultima_mensagem',
      Math.max(limit, 10000)
    );

    // Buscar todos os contatos da empresa
    const contatos = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
      { empresa_id: empresaId },
      '-created_date',
      10000
    );

    // Criar mapa de telefone -> contato para lookup O(1)
    const contatoMap = {};
    for (const c of contatos) {
      if (c.telefone) {
        contatoMap[c.telefone] = c;
      }
    }

    // Normalizar telefone (sempre 12 dígitos como chave canônica)
    const normalizarTelefone = (tel) => {
      if (!tel || !tel.startsWith('55')) return tel;
      if (tel.length === 13) return tel.slice(0, 4) + tel.slice(5);
      return tel;
    };

    // ═══════════════════════════════════════════════════════════
    // PASSO 1: Buscar mensagens de TODAS as conversas PRIMEIRO
    // Isso garante que a deduplicação mantenha a conversa com mensagens
    // ═══════════════════════════════════════════════════════════
    const mensagensMap = {};
    for (const conversa of conversas) {
      try {
        const msgs = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
          { conversa_id: conversa.id },
          'data_envio',
          500
        );
        mensagensMap[conversa.id] = msgs || [];
      } catch (e) {
        console.warn(`⚠️ Erro mensagens conversa ${conversa.id}:`, e.message);
        mensagensMap[conversa.id] = [];
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PASSO 2: Deduplicar — manter a conversa com MAIS mensagens
    // Em empate, manter a mais recente
    // ═══════════════════════════════════════════════════════════
    const conversasPorTelNorm = {};
    for (const conversa of conversas) {
      const tel = conversa.cliente_telefone || '';
      const chave = normalizarTelefone(tel);
      if (!chave) continue;

      const existente = conversasPorTelNorm[chave];
      if (!existente) {
        conversasPorTelNorm[chave] = conversa;
      } else {
        const msgsExistente = mensagensMap[existente.id]?.length || 0;
        const msgsAtual = mensagensMap[conversa.id]?.length || 0;

        if (msgsAtual > msgsExistente) {
          // Preferir a que tem mais mensagens
          conversasPorTelNorm[chave] = conversa;
        } else if (msgsAtual === msgsExistente) {
          // Empate: manter a mais recente
          const dataExistente = new Date(existente.data_ultima_mensagem || existente.created_date || 0);
          const dataAtual = new Date(conversa.data_ultima_mensagem || conversa.created_date || 0);
          if (dataAtual > dataExistente) {
            conversasPorTelNorm[chave] = conversa;
          }
        }
        // Se existente tem mais mensagens, mantém (não faz nada)
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PASSO 3: Montar resultado final
    // ═══════════════════════════════════════════════════════════
    const resultado = Object.values(conversasPorTelNorm).map(conversa => {
      const tel = conversa.cliente_telefone || '';
      let contato = contatoMap[tel] || null;
      if (!contato && tel.startsWith('55')) {
        const variacao = tel.length === 13
          ? tel.slice(0, 4) + tel.slice(5)
          : tel.slice(0, 4) + '9' + tel.slice(4);
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