import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * editarMensagemWhatsapp
 *
 * Edita uma mensagem enviada pelo atendente:
 *  1. Atualiza o texto no banco (CRM), preservando a versão anterior em `texto_anterior`
 *     para exibição com meia opacidade no front.
 *  2. Tenta refletir a edição no aparelho conectado (D-API / Evolution). A API Oficial
 *     Meta NÃO suporta edição de mensagens — nesses casos apenas o CRM é atualizado e
 *     `edicao_api_status` retorna "nao_aplicavel".
 *
 * Payload: { mensagem_id, novo_texto }
 */
Deno.serve(async (req) => {
  console.log('✏️ EDITAR MENSAGEM WHATSAPP');

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const bodyText = await req.text();
    const payload = JSON.parse(bodyText);
    const { mensagem_id, novo_texto } = payload;

    if (!mensagem_id) {
      return Response.json({ error: 'mensagem_id é obrigatório', success: false }, { status: 400 });
    }
    if (!novo_texto || !String(novo_texto).trim()) {
      return Response.json({ error: 'novo_texto é obrigatório', success: false }, { status: 400 });
    }

    // Buscar a mensagem
    const mensagem = await base44.asServiceRole.entities.MensagemWhatsapp.get(mensagem_id);
    if (!mensagem) {
      return Response.json({ error: 'Mensagem não encontrada', success: false }, { status: 404 });
    }

    // Só permite editar mensagens enviadas pelo vendedor e do tipo texto
    if (mensagem.remetente !== 'vendedor') {
      return Response.json({ error: 'Só é possível editar mensagens enviadas por você', success: false }, { status: 400 });
    }
    if (mensagem.tipo_conteudo && mensagem.tipo_conteudo !== 'texto') {
      return Response.json({ error: 'Apenas mensagens de texto podem ser editadas', success: false }, { status: 400 });
    }

    const novoTextoTrim = String(novo_texto).trim();
    const textoAnterior = mensagem.texto || '';

    // Não fazer nada se o texto for igual
    if (textoAnterior === novoTextoTrim) {
      return Response.json({ success: true, message: 'Texto não alterado', message_id: mensagem.id, unchanged: true });
    }

    // Pegar nome do atendente
    let nomeAtendente = user?.nome_perfil || user?.full_name || user?.email || 'Atendente';
    try {
      const colabs = await base44.asServiceRole.entities.Colaborador.filter({ user_id: user.id }, '-created_date', 1);
      if (colabs?.length > 0) nomeAtendente = colabs[0].nome || colabs[0].nome_completo || nomeAtendente;
    } catch (_) {}

    // Buscar conversa e empresa para detectar provider e credenciais
    let conversa = null;
    try {
      conversa = await base44.asServiceRole.entities.ConversaWhatsapp.get(mensagem.conversa_id);
    } catch (_) {}

    const empresaId = mensagem.empresa_id || conversa?.empresa_id || user.empresa_id;
    let empresa = null;
    if (empresaId) {
      try { empresa = await base44.asServiceRole.entities.Empresa.get(empresaId); } catch (_) {}
    }

    const providerSalvo = mensagem.provider || conversa?.provider || null;
    const canalOrigem = conversa?.canal_origem || null;
    const tipoConexaoConversa = conversa?.tipo_conexao || '';
    const phoneNumberIdMeta = conversa?.phone_number_id_meta || empresa?.whatsapp_phone_number_id || null;
    const accessTokenMeta = empresa?.whatsapp_access_token || null;

    // Resolver provider (igual ao enviarMensagemWhatsapp)
    const ehMeta = providerSalvo === 'whatsapp_meta' || canalOrigem === 'meta' || tipoConexaoConversa === 'meta_oficial' || conversa?.canal_atendimento === 'meta_oficial';
    const ehEvolution = providerSalvo === 'evolution' || canalOrigem === 'evolution' || tipoConexaoConversa === 'empresa' || tipoConexaoConversa === 'usuario';
    const ehDapi = providerSalvo === 'dapi' || canalOrigem === 'dapi' || tipoConexaoConversa === 'dapi';

    // Credenciais Evolution
    const evolutionApiKey = empresa?.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY');
    const evolutionApiUrl = empresa?.evolution_url || Deno.env.get('EVOLUTION_API_URL');
    const instanceName = empresa?.evolution_instance_name || Deno.env.get('EVOLUTION_INSTANCE_NAME') || conversa?.instancia || '';

    // Conexão D-API
    let conexaoDapi = null;
    if (ehDapi && empresaId) {
      try {
        if (conversa?.connection_id) {
          const cn = await base44.asServiceRole.entities.WhatsappConnection.get(conversa.connection_id);
          if (cn?.provider_type === 'dapi' && cn.is_active) conexaoDapi = cn;
        }
        if (!conexaoDapi) {
          const conexoes = await base44.asServiceRole.entities.WhatsappConnection.filter({
            empresa_id: empresaId, provider_type: 'dapi', is_active: true
          }, '-created_date', 1);
          conexaoDapi = conexoes[0] || null;
        }
      } catch (_) {}
    }

    // Telefone do destinatário (transformar numero_cliente da conversa em E.164 brasileiro)
    const numeroRaw = conversa?.cliente_telefone || '';
    let numeroEnvio = numeroRaw.replace(/\D/g, '').replace(/@.*$/, '');
    if (numeroEnvio && !numeroEnvio.startsWith('55') && numeroEnvio.length >= 10 && numeroEnvio.length <= 11) {
      numeroEnvio = '55' + numeroEnvio;
    }

    const whatsappId = mensagem.whatsapp_message_id || '';

    let apiStatus = 'nao_aplicavel';
    let apiErro = null;

    // ── TENTATIVA DE EDIÇÃO NO APARELHO CONECTADO ──────────────────────────
    // WhatsApp oficial (Meta) não suporta editar mensagens. Para D-API / Evolution
    // tentamos o endpoint de edição — se falhar, mantemos apenas o CRM atualizado.
    try {
      if (ehMeta) {
        // Meta não suporta edição de mensagens — apenas sinaliza
        apiStatus = 'nao_aplicavel';
        apiErro = 'API Oficial Meta não suporta edição de mensagens';
        console.log('⚠️ Meta API não suporta edição — atualizando apenas o CRM');
      } else if (ehDapi && conexaoDapi && numeroEnvio && whatsappId) {
        // Decifrar API key igual ao whatsappService
        let apiKeyDecrypted = conexaoDapi.api_key_encrypted || '';
        try {
          const decoded = atob(apiKeyDecrypted);
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded.trim())) {
            apiKeyDecrypted = decoded.trim();
          } else {
            apiKeyDecrypted = apiKeyDecrypted.trim();
          }
        } catch (_) { apiKeyDecrypted = apiKeyDecrypted.trim(); }

        const baseUrl = (conexaoDapi.base_url || 'https://api.d-api.cloud').replace(/\/$/, '');
        // Endpoint documentado pela D-API para editar mensagens
        const editUrl = `${baseUrl}/api/v1/messages/edit`;

        const editPayload = {
          sessionId: conexaoDapi.session_id,
          to: numeroEnvio,
          messageId: whatsappId,
          text: novoTextoTrim,
          fromMe: true
        };

        console.log('📡 D-API edit attempt:', editUrl, JSON.stringify(editPayload).substring(0, 200));
        const editResp = await fetch(editUrl, {
          method: 'POST',
          headers: { 'Authorization': apiKeyDecrypted, 'Content-Type': 'application/json' },
          body: JSON.stringify(editPayload)
        });
        const editText = await editResp.text();
        console.log('📥 D-API edit status:', editResp.status, editText.substring(0, 300));

        if (editResp.ok) {
          apiStatus = 'sucesso';
        } else {
          apiStatus = 'falhou';
          apiErro = `HTTP ${editResp.status}: ${editText.substring(0, 200)}`;
        }
      } else if (ehEvolution && evolutionApiKey && evolutionApiUrl && instanceName && numeroEnvio && whatsappId) {
        // Evolution API — endpoint de edição
        const baseUrl = evolutionApiUrl.replace(/\/$/, '');
        const editUrl = `${baseUrl}/message/editMessage/${instanceName}`;
        const editPayload = {
          number: numeroEnvio,
          key: { id: whatsappId, fromMe: true },
          text: novoTextoTrim
        };
        console.log('📡 Evolution edit attempt:', editUrl, JSON.stringify(editPayload).substring(0, 200));
        const editResp = await fetch(editUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey },
          body: JSON.stringify(editPayload)
        });
        const editText = await editResp.text();
        console.log('📥 Evolution edit status:', editResp.status, editText.substring(0, 300));

        if (editResp.ok) {
          apiStatus = 'sucesso';
        } else {
          apiStatus = 'falhou';
          apiErro = `HTTP ${editResp.status}: ${editText.substring(0, 200)}`;
        }
      } else {
        apiStatus = 'nao_aplicavel';
        apiErro = 'Nenhuma conexão ativa apta a editar mensagens encontrada para esta conversa';
      }
    } catch (e) {
      console.warn('⚠️ Erro ao tentar editar no aparelho (CRM será atualizado mesmo assim):', e.message);
      apiStatus = 'falhou';
      apiErro = e.message;
    }

    // ── MONTAR HISTÓRICO DE EDIÇÕES (auditoria) ─────────────────────────────
    let historicoArr = [];
    try {
      historicoArr = mensagem.historico_edicoes ? JSON.parse(mensagem.historico_edicoes) : [];
    } catch (_) {}
    historicoArr.push({
      texto: textoAnterior,
      data: new Date().toISOString(),
      editado_por_id: user.id,
      editado_por_nome: nomeAtendente
    });

    // ── ATUALIZAR O BANCO ──────────────────────────────────────────────────
    const proximoCount = (mensagem.edicao_count || 0) + 1;
    await base44.asServiceRole.entities.MensagemWhatsapp.update(mensagem_id, {
      texto: novoTextoTrim,
      texto_anterior: textoAnterior,
      editada: true,
      edicao_count: proximoCount,
      data_edicao: new Date().toISOString(),
      editado_por_id: user.id,
      editado_por_nome: nomeAtendente,
      historico_edicoes: JSON.stringify(historicoArr),
      edicao_api_status: apiStatus,
      edicao_api_erro: apiErro
    });

    // Atualizar a última mensagem da conversa caso tenha sido a última troca
    if (conversa && conversa.ultima_mensagem === textoAnterior) {
      try {
        await base44.asServiceRole.entities.ConversaWhatsapp.update(mensagem.conversa_id, {
          ultima_mensagem: novoTextoTrim.substring(0, 200)
        });
      } catch (_) {}
    }

    console.log('✅ Mensagem editada. CRM atualizado. API status:', apiStatus);

    return Response.json({
      success: true,
      message_id: mensagem_id,
      novo_texto: novoTextoTrim,
      texto_anterior: textoAnterior,
      editada: true,
      edicao_count: proximoCount,
      api_status: apiStatus,
      api_erro: apiErro
    });
  } catch (error) {
    console.error('❌ Erro ao editar mensagem:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});