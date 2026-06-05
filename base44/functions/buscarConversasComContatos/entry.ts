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

    // Buscar TODAS as conversas (exceto grupos bloqueados)
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId },
      '-data_ultima_mensagem',
      Math.max(limit, 10000)
    );

    // Filtrar grupos bloqueados
    const conversasValidas = conversas.filter(c => {
      // Se é grupo e está bloqueado, descartar
      const isGrupo = (c.cliente_telefone || '').includes('@g.us') || 
                      (c.whatsapp_id || '').includes('@g.us') ||
                      (c.cliente_telefone || '').includes('@broadcast') ||
                      (c.whatsapp_id || '').includes('@broadcast');
      if (isGrupo && (c.bloqueado === true || c.bloqueado === 'true')) {
        return false;
      }
      return true;
    });

    // Buscar todos os contatos da empresa
    const contatos = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
      { empresa_id: empresaId },
      '-created_date',
      10000
    );

    // Criar mapa de telefone -> contato para lookup O(1)
    // Indexar por múltiplas variações para maximizar match
    const contatoMap = {};
    const variantes = (tel) => {
      if (!tel) return [];
      const t = tel.replace(/\D/g, '');
      const vs = [t];
      if (t.startsWith('55') && t.length === 13) vs.push(t.slice(0, 4) + t.slice(5)); // sem 9
      if (t.startsWith('55') && t.length === 12) vs.push(t.slice(0, 4) + '9' + t.slice(4)); // com 9
      return vs;
    };
    for (const c of contatos) {
      if (c.telefone) {
        for (const v of variantes(c.telefone)) {
          if (!contatoMap[v]) contatoMap[v] = c;
        }
      }
    }

    // Normalizar telefone (sempre 12 dígitos como chave canônica)
    const normalizarTelefone = (tel) => {
      if (!tel || !tel.startsWith('55')) return tel;
      if (tel.length === 13) return tel.slice(0, 4) + tel.slice(5);
      return tel;
    };

    // ═══════════════════════════════════════════════════════════
    // PASSO 1: Deduplicar — manter a conversa mais recente por telefone
    // Sem buscar mensagens individuais (evita rate limit)
    // ═══════════════════════════════════════════════════════════
    console.log(`📊 Total conversas carregadas: ${conversas.length} | Válidas (não-bloqueadas): ${conversasValidas.length}`);
    const conversasPorTelNorm = {};
    for (const conversa of conversasValidas) {
      const tel = conversa.cliente_telefone || '';
      if (!tel || tel.trim() === '') {
        console.warn(`⚠️ Conversa sem telefone: ${conversa.id}`);
        continue;
      }
      const chave = normalizarTelefone(tel);
      if (!chave) {
        console.warn(`⚠️ Telefone inválido: ${tel} (conversa ${conversa.id})`);
        continue;
      }

      const existente = conversasPorTelNorm[chave];
      if (!existente) {
        conversasPorTelNorm[chave] = conversa;
      } else {
        // Manter a conversa com ultima_mensagem preenchida, ou a mais recente
        const existenteTemMsg = !!(existente.ultima_mensagem);
        const atualTemMsg = !!(conversa.ultima_mensagem);

        if (atualTemMsg && !existenteTemMsg) {
          conversasPorTelNorm[chave] = conversa;
        } else if (atualTemMsg === existenteTemMsg) {
          const dataExistente = new Date(existente.data_ultima_mensagem || existente.created_date || 0);
          const dataAtual = new Date(conversa.data_ultima_mensagem || conversa.created_date || 0);
          if (dataAtual > dataExistente) {
            conversasPorTelNorm[chave] = conversa;
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PASSO 2: Montar resultado final
    // ═══════════════════════════════════════════════════════════
    const resultado = Object.values(conversasPorTelNorm).map(conversa => {
      const tel = (conversa.cliente_telefone || '').replace(/\D/g, '');
      // Buscar contato por todas as variantes do número
      let contato = null;
      for (const v of variantes(tel)) {
        if (contatoMap[v]) { contato = contatoMap[v]; break; }
      }

      return {
        id: conversa.id || '',
        cliente_nome: conversa.cliente_nome || '',
        cliente_telefone: conversa.cliente_telefone || '',
        whatsapp_id: (conversa.whatsapp_id || '').toLowerCase(),
        ultima_mensagem: conversa.ultima_mensagem || '',
        data_ultima_mensagem: conversa.data_ultima_mensagem || new Date().toISOString(),
        status: conversa.status || 'ativa',
        ultimo_remetente: conversa.ultimo_remetente || null,
        responsavel_id: conversa.responsavel_id || null,
        responsavel_nome: conversa.responsavel_nome || null,
        responsavel_expira_em: conversa.responsavel_expira_em || null,
        usuario_responsavel_id: conversa.usuario_responsavel_id || null,
        usuario_responsavel_nome: conversa.usuario_responsavel_nome || null,
        tipo_conexao: conversa.tipo_conexao || null,
        canal_origem: conversa.canal_origem || null,
        provider: conversa.provider || null,
        instancia: conversa.instancia || null,
        phone_number_id_meta: conversa.phone_number_id_meta || null,
        locked_provider: conversa.locked_provider || false,
        bloqueado: conversa.bloqueado || false,
        foto_url: conversa.foto_url || null,
        contato: contato ? {
          id: contato.id,
          nome: contato.nome,
          telefone: contato.telefone,
          foto_url: contato.foto_url,
          ultima_atualizacao: contato.ultima_atualizacao
        } : null,
      };
    });

    // Ordenar por data_ultima_mensagem desc
    resultado.sort((a, b) =>
      new Date(b.data_ultima_mensagem || 0) - new Date(a.data_ultima_mensagem || 0)
    );

    console.log(`✅ Retornando ${resultado.length} conversas deduplicas`);
    return Response.json({ conversas: resultado }, { status: 200 });
  } catch (error) {
    console.error('Erro em buscarConversasComContatos:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});