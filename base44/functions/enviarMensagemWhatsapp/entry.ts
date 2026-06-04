import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  console.log('='.repeat(80));
  console.log('📤 ENVIAR MENSAGEM WHATSAPP');
  console.log('='.repeat(80));
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    console.log('👤 Usuário:', user?.email);

    if (!user) {
      console.error('❌ Usuário não autenticado');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ler payload
    const bodyText = await req.text();
    console.log('📥 Payload recebido:', bodyText);
    
    let payload;
    try {
      payload = JSON.parse(bodyText);
    } catch (e) {
      console.error('❌ Erro ao parsear JSON:', e.message);
      return Response.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const { conversa_id, mensagem_texto, numero_cliente, arquivo, forcar_api, resposta_para_texto, resposta_para_nome, resposta_para_message_id } = payload;
    
    console.log('📋 Parâmetros:');
    console.log('  - conversa_id:', conversa_id);
    console.log('  - mensagem_texto:', mensagem_texto?.substring(0, 50));
    console.log('  - numero_cliente:', numero_cliente);
    console.log('  - arquivo:', arquivo ? 'presente' : 'nenhum');
    console.log('📋 Payload completo:', JSON.stringify(payload).substring(0, 200));

    if (!conversa_id) {
      console.error('❌ conversa_id faltando');
      return Response.json({ error: 'conversa_id é obrigatório' }, { status: 400 });
    }
    
    if (!mensagem_texto?.trim() && !arquivo) {
      console.error('❌ mensagem_texto vazio e nenhum arquivo');
      return Response.json({ error: 'texto ou arquivo é obrigatório' }, { status: 400 });
    }
    
    if (!numero_cliente) {
      console.error('❌ numero_cliente faltando');
      return Response.json({ error: 'numero_cliente é obrigatório' }, { status: 400 });
    }

    // Buscar empresa e credenciais
    let evolutionApiKey, evolutionApiUrl, instanceName;
    let empresaId = payload.empresa_id || user.empresa_id;
    let empresa = null;

    // Buscar dados da conversa PRIMEIRO para poder usar o empresa_id da conversa como fallback
    let conversaDoBanco = null;
    try {
      conversaDoBanco = await base44.asServiceRole.entities.ConversaWhatsapp.get(conversa_id);
    } catch (_) {}

    // Garantir empresaId — usar da conversa se não veio no payload nem no user
    if (!empresaId && conversaDoBanco?.empresa_id) {
      empresaId = conversaDoBanco.empresa_id;
      console.log('📦 empresaId obtido da conversa:', empresaId);
    }

    if (empresaId) {
      try {
        empresa = await base44.asServiceRole.entities.Empresa.get(empresaId);
      } catch (e) {
        console.warn('⚠️ Erro ao buscar empresa:', e.message);
      }
      if (empresa) {
        instanceName = empresa.evolution_instance_name;
        evolutionApiKey = empresa.evolution_api_key;
        evolutionApiUrl = empresa.evolution_url;
        console.log('📦 Credenciais da empresa carregadas:', { instanceName, url: evolutionApiUrl });
      } else {
        console.warn('⚠️ Empresa não encontrada para id:', empresaId);
      }
    } else {
      console.warn('⚠️ empresaId não disponível');
    }

    // Fallback para variáveis de ambiente APENAS se empresa não tiver config própria
    if (!evolutionApiKey) evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    if (!evolutionApiUrl) evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    if (!instanceName) instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME');

    console.log('🔧 URL Evolution final:', evolutionApiUrl);
    console.log('🔧 Instance final:', instanceName);

    const instanciaConversa = conversaDoBanco?.instancia || '';
    const tipoConexaoConversa = conversaDoBanco?.tipo_conexao || '';

    // CANAL FIXO DO ATENDIMENTO
    // Esse campo define por onde a resposta deve sair.
    // Não deve ser alterado automaticamente por webhook.
    const canalAtendimento =
      conversaDoBanco?.canal_atendimento ||
      conversaDoBanco?.canal_preferencial ||
      conversaDoBanco?.provider_ativo ||
      tipoConexaoConversa ||
      'evolution';

    console.log('🧭 Canal atendimento fixo:', canalAtendimento);
    console.log('📥 Última origem/tipo_conexao:', tipoConexaoConversa);

    // ── INSTAGRAM DIRECT ──────────────────────────────────────────────────
    // Detectar Instagram independente do forcar_api enviado pelo frontend
    const conversaEhInstagram =
      tipoConexaoConversa === 'instagram' ||
      instanciaConversa === 'INSTAGRAM' ||
      String(payload.numero_cliente || '').startsWith('ig_');

    if (conversaEhInstagram) {
      console.log('📸 Conversa é Instagram Direct — usando API do Instagram');

      const igToken = empresa?.instagram_access_token;
      if (!igToken) {
        return Response.json({ error: 'Access Token do Instagram não configurado. Configure na aba Instagram das Configurações.' }, { status: 400 });
      }

      // numero_cliente para Instagram é no formato "ig_SENDER_ID"
      const recipientId = numero_cliente.replace(/^ig_/, '');

      let igPayload;
      if (mensagem_texto?.trim()) {
        igPayload = { recipient: { id: recipientId }, message: { text: mensagem_texto.trim() } };
      } else {
        return Response.json({ error: 'Apenas texto é suportado no Instagram Direct por enquanto.' }, { status: 400 });
      }

      console.log('📤 Enviando via Instagram API — recipientId:', recipientId);
      const igResp = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${igToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(igPayload)
      });

      const igText = await igResp.text();
      console.log('📥 Instagram API status:', igResp.status, igText.substring(0, 300));

      if (!igResp.ok) {
        let errMsg = 'Erro ao enviar mensagem via Instagram';
        try { errMsg = JSON.parse(igText)?.error?.message || errMsg; } catch (_) {}
        return Response.json({ error: errMsg, details: igText, success: false }, { status: 400 });
      }

      const igData = JSON.parse(igText);
      const msgId = igData.message_id || `ig_${Date.now()}`;

      // Buscar nome real do colaborador para Instagram também
      let nomeAtendenteIg = user?.full_name || user?.email || 'Atendente';
      try {
        const colabsIg = await base44.asServiceRole.entities.Colaborador.filter({ user_id: user.id }, '-created_date', 1);
        if (colabsIg?.length > 0) nomeAtendenteIg = colabsIg[0].nome || colabsIg[0].nome_completo || nomeAtendenteIg;
      } catch (_) {}

      // Salvar mensagem no banco
      const novaMensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create({
        conversa_id: conversa_id,
        empresa_id: empresaId,
        remetente: 'vendedor',
        usuario_id: user.id,
        usuario_nome: nomeAtendenteIg,
        atendente_nome: nomeAtendenteIg,
        tipo_conteudo: 'texto',
        texto: mensagem_texto.trim(),
        whatsapp_message_id: msgId,
        data_envio: new Date().toISOString(),
        status: 'enviada',
      });

      await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa_id, {
        ultima_mensagem: mensagem_texto.trim().substring(0, 100),
        data_ultima_mensagem: new Date().toISOString(),
        ultimo_remetente: 'vendedor',
      });

      console.log('✅ Mensagem Instagram enviada e salva:', novaMensagem.id);
      return Response.json({ success: true, message_id: novaMensagem.id, whatsapp_id: msgId });
    }
    // ── FIM INSTAGRAM ──────────────────────────────────────────────────────

    // ── DETERMINAR PROVEDOR PELO CANAL FIXO DO ATENDIMENTO ──────────────────
    // canalAtendimento é a fonte de verdade para envio — não muda automaticamente por webhook.
    const conversaEhMetaOficial =
      canalAtendimento === 'meta_oficial' ||
      canalAtendimento === 'META_OFICIAL';

    // Credenciais Meta: preferir phone_number_id da conversa (número específico que recebeu)
    const phoneNumberIdMeta = conversaDoBanco?.phone_number_id_meta || empresa?.whatsapp_phone_number_id;
    const accessTokenMeta = empresa?.whatsapp_access_token;

    const temCredenciaisMeta = !!(accessTokenMeta && phoneNumberIdMeta);
    const temCredenciaisEvolution = !!(evolutionApiKey && evolutionApiUrl && instanceName);

    let usaMetaOficial;
    if (conversaEhMetaOficial) {
      // Canal da conversa = Meta Oficial
      if (!temCredenciaisMeta) {
        return Response.json({
          error: 'Esta conversa é da API Oficial Meta, mas as credenciais Meta (token/phone_number_id) não estão configuradas. Configure em Configurações > WhatsApp Meta.',
          success: false
        }, { status: 400 });
      }
      usaMetaOficial = true;
      console.log('🟢 Provedor automático: API Oficial Meta (tipo_conexao:', tipoConexaoConversa, ' | phone_number_id:', phoneNumberIdMeta, ')');
    } else if (
      canalAtendimento === 'evolution' ||
      canalAtendimento === 'empresa' ||
      canalAtendimento === 'usuario' ||
      tipoConexaoConversa === 'empresa' ||
      tipoConexaoConversa === 'usuario' ||
      instanciaConversa
    ) {
      // Canal da conversa = Evolution API
      if (!temCredenciaisEvolution) {
        return Response.json({
          error: 'Esta conversa é da Evolution API, mas as credenciais Evolution não estão configuradas. Configure em Configurações > WhatsApp.',
          success: false
        }, { status: 400 });
      }
      usaMetaOficial = false;
      console.log('🟣 Provedor automático: Evolution API (instancia:', instanciaConversa || instanceName, ')');
    } else if (forcar_api === 'meta_oficial') {
      // Fallback explícito do frontend (legado)
      usaMetaOficial = temCredenciaisMeta;
    } else {
      // Fallback: preferência da empresa
      const apiPreferida = empresa?.whatsapp_api_preferida || 'auto';
      if (apiPreferida === 'meta_oficial') {
        usaMetaOficial = temCredenciaisMeta;
      } else if (apiPreferida === 'evolution') {
        usaMetaOficial = false;
      } else {
        usaMetaOficial = !temCredenciaisEvolution && temCredenciaisMeta;
      }
      console.log('⚙️ Provedor por preferência da empresa:', usaMetaOficial ? 'Meta' : 'Evolution');
    }

    console.log('🔌 Modo de envio:', usaMetaOficial ? '🟢 API Oficial Meta' : '🟣 Evolution API');

    // Formatar número
    const isGrupo = numero_cliente.includes('@g.us');
    const isLid = numero_cliente.startsWith('lid_') || numero_cliente.includes('@lid');
    let numeroFormatado;
    if (isGrupo) {
      numeroFormatado = numero_cliente;
    } else if (isLid) {
      // Contatos @lid: usar JID completo com @lid para a Evolution
      // Buscar whatsapp_id da conversa para obter o JID exato
      const lidNum = numero_cliente.replace('lid_', '').replace('@lid', '').replace(/\D/g, '');
      // Tentar buscar o whatsapp_id da conversa
      let whatsappJid = `${lidNum}@lid`;
      try {
        const conv = await base44.asServiceRole.entities.ConversaWhatsapp.get(conversa_id);
        if (conv?.whatsapp_id && conv.whatsapp_id.includes('@lid')) {
          whatsappJid = conv.whatsapp_id;
        }
      } catch (_) {}
      numeroFormatado = whatsappJid;
    } else {
      numeroFormatado = numero_cliente.replace(/\D/g, '');
    }
    console.log('📱 Número formatado:', numeroFormatado);

    if (!isGrupo && !isLid && numeroFormatado.length < 10) {
      return Response.json({ error: 'Número de telefone inválido', success: false }, { status: 400 });
    }

    let result;
    let messageIdEvolution = null;

    if (usaMetaOficial) {
      // ── ENVIO VIA API OFICIAL META ──────────────────────────────────────
      // Usar phone_number_id da CONVERSA (número específico que recebeu a msg) ou fallback da empresa
      const accessToken = accessTokenMeta;
      const phoneNumberId = phoneNumberIdMeta;
      const metaUrl = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
      console.log('📤 Meta — phone_number_id:', phoneNumberId, '| origem conversa:', conversaDoBanco?.phone_number_id_meta ? 'conversa' : 'empresa');

      let metaPayload;

      if (arquivo && arquivo.base64) {
        const tipo = arquivo.tipo || '';
        let mediaType = 'document';
        if (tipo.startsWith('image')) mediaType = 'image';
        else if (tipo.startsWith('video')) mediaType = 'video';
        else if (tipo.startsWith('audio')) mediaType = 'audio';

        const binaryStr = atob(arquivo.base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

        // Para áudio: Meta exige ogg/opus ou aac — webm não é suportado via link.
        // Solução: fazer upload direto para a Meta Media API e usar media_id.
        let mimeType = arquivo.tipo || 'application/octet-stream';
        let nomeArquivo = arquivo.nome || `arquivo_${Date.now()}`;

        if (mediaType === 'audio') {
          // Forçar MIME type compatível com Meta (ogg opus é aceito)
          mimeType = 'audio/ogg; codecs=opus';
          nomeArquivo = nomeArquivo.replace(/\.(webm|mp4|m4a)$/, '.ogg') || 'audio.ogg';
          if (!nomeArquivo.endsWith('.ogg')) nomeArquivo = 'audio.ogg';
        }

        // Upload direto para Meta Media API (mais confiável que link externo)
        const uploadFormData = new FormData();
        uploadFormData.append('messaging_product', 'whatsapp');
        uploadFormData.append('file', new Blob([bytes], { type: mimeType }), nomeArquivo);
        uploadFormData.append('type', mimeType);

        const metaUploadUrl = `https://graph.facebook.com/v19.0/${phoneNumberId}/media`;
        console.log('📤 Upload mídia para Meta Media API:', mediaType, mimeType);
        const uploadResp = await fetch(metaUploadUrl, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}` },
          body: uploadFormData,
        });
        const uploadText = await uploadResp.text();
        console.log('📥 Meta Media Upload status:', uploadResp.status, uploadText.substring(0, 200));

        let mediaId = null;
        if (uploadResp.ok) {
          const uploadData = JSON.parse(uploadText);
          mediaId = uploadData.id;
          console.log('✅ Media ID obtido:', mediaId);
        }

        // Se upload direto falhou, fallback por link público
        let mediaObj;
        if (mediaId) {
          mediaObj = { id: mediaId };
        } else {
          console.warn('⚠️ Upload direto falhou — tentando via link público');
          const fileObj = new File([bytes], nomeArquivo, { type: mimeType });
          const uploadRes = await base44.integrations.Core.UploadFile({ file: fileObj });
          const fileUrl = uploadRes?.file_url;
          if (!fileUrl) throw new Error('Falha ao fazer upload do arquivo para envio via Meta');
          mediaObj = { link: fileUrl };
          console.log('📎 Fallback link:', fileUrl);
        }

        // caption e filename apenas onde suportado
        if (mediaType === 'image' || mediaType === 'video') {
          if (mensagem_texto?.trim()) mediaObj.caption = mensagem_texto.trim();
        } else if (mediaType === 'document') {
          if (mensagem_texto?.trim()) mediaObj.caption = mensagem_texto.trim();
          if (arquivo.nome) mediaObj.filename = arquivo.nome;
        }
        // áudio: sem caption, sem filename

        metaPayload = {
          messaging_product: 'whatsapp',
          to: numeroFormatado,
          type: mediaType,
          [mediaType]: mediaObj
        };

        console.log('📤 Meta payload mídia:', JSON.stringify(metaPayload).substring(0, 400));
      } else {
        metaPayload = {
          messaging_product: 'whatsapp',
          to: numeroFormatado,
          type: 'text',
          text: { body: mensagem_texto.trim() }
        };
        // Reply/quoted — adicionar context se tiver message_id da mensagem original
        if (resposta_para_message_id) {
          metaPayload.context = { message_id: resposta_para_message_id };
        }
      }

      console.log('📤 Enviando via API Oficial Meta...');
      const metaResp = await fetch(metaUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metaPayload)
      });

      const metaText = await metaResp.text();
      console.log('📥 Status Meta:', metaResp.status, metaText.substring(0, 300));

      if (!metaResp.ok) {
        let errMsg = 'Erro ao enviar via API Oficial Meta';
        try {
          const errData = JSON.parse(metaText);
          errMsg = errData.error?.message || errMsg;
        } catch (_) {}
        return Response.json({ error: errMsg, details: metaText, success: false }, { status: 400 });
      }

      const metaData = JSON.parse(metaText);
      result = { key: { id: metaData.messages?.[0]?.id }, messageId: metaData.messages?.[0]?.id };
      console.log('✅ Mensagem enviada via Meta:', result.key?.id);

    } else {
      // ── ENVIO VIA EVOLUTION API ─────────────────────────────────────────
      console.log('🔐 Verificando credenciais Evolution:');
      console.log('  - URL:', evolutionApiUrl ? '✅' : '❌');
      console.log('  - Key:', evolutionApiKey ? '✅' : '❌');
      console.log('  - Instance:', instanceName ? '✅' : '❌');

      if (!evolutionApiKey || !evolutionApiUrl || !instanceName) {
        return Response.json({ 
          error: 'Nenhuma API configurada. Configure a API Oficial Meta ou a Evolution API na página de Configuração WhatsApp' 
        }, { status: 400 });
      }

      const baseUrl = evolutionApiUrl.replace(/\/$/, '');
      let endpoint, requestPayload;

      if (arquivo && arquivo.base64) {
        const tipo = arquivo.tipo || '';
        if (tipo.startsWith('image')) {
          endpoint = `${baseUrl}/message/sendMedia/${instanceName}`;
          requestPayload = { number: numeroFormatado, mediatype: 'image', media: arquivo.base64, fileName: arquivo.nome, caption: mensagem_texto || '' };
        } else if (tipo.startsWith('audio')) {
          endpoint = `${baseUrl}/message/sendWhatsAppAudio/${instanceName}`;
          // Evolution espera o base64 puro do áudio (sem prefixo data:) e encoding=true para converter
          requestPayload = { number: numeroFormatado, audio: arquivo.base64, encoding: true, delay: 1200 };
        } else if (tipo.startsWith('video')) {
          endpoint = `${baseUrl}/message/sendMedia/${instanceName}`;
          requestPayload = { number: numeroFormatado, mediatype: 'video', media: arquivo.base64, fileName: arquivo.nome, caption: mensagem_texto || '' };
        } else {
          endpoint = `${baseUrl}/message/sendMedia/${instanceName}`;
          requestPayload = { number: numeroFormatado, mediatype: 'document', media: arquivo.base64, fileName: arquivo.nome, caption: mensagem_texto || '' };
        }
      } else {
        endpoint = `${baseUrl}/message/sendText/${instanceName}`;
        requestPayload = { number: numeroFormatado, text: mensagem_texto.trim() };
        // Reply/quoted — adicionar quoted se tiver message_id da mensagem original
        if (resposta_para_message_id) {
          requestPayload.quoted = { key: { id: resposta_para_message_id } };
        }
      }

      console.log('🎯 Endpoint:', endpoint);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey },
        body: JSON.stringify(requestPayload)
      });

      const responseText = await response.text();
      console.log('📥 Status Evolution:', response.status, responseText.substring(0, 300));

      if (!response.ok) {
        let mensagemErro = 'Erro ao enviar via WhatsApp';
        try {
          const errorData = JSON.parse(responseText);
          if (response.status === 401) {
            mensagemErro = `API Key inválida ou expirada para a instância "${instanceName}". Verifique a chave API na Configuração WhatsApp.`;
          } else if (errorData.response?.message) {
            const msg = Array.isArray(errorData.response.message) ? errorData.response.message[0] : errorData.response.message;
            if (msg && msg.exists === false) mensagemErro = `Número ${msg.number} não possui WhatsApp ativo`;
            else if (typeof msg === 'string') mensagemErro = msg;
          } else if (errorData.message) {
            mensagemErro = errorData.message;
          }
        } catch (_) {}
        console.error(`❌ Evolution ${response.status}: ${mensagemErro}`);
        // Retornar erro para o frontend mostrar ao usuário
        return Response.json({ error: mensagemErro, details: responseText, success: false }, { status: 400 });
      }

      try {
        result = JSON.parse(responseText);
      } catch (e) {
        result = { raw: responseText };
      }
      
      // Extrair message ID de diferentes formatos da Evolution
      // Tentar todos os campos conhecidos — incluindo nested structures
      messageIdEvolution =
        result.key?.id ||
        result.message?.key?.id ||
        result.message?.id ||
        result.messageId ||
        result.id ||
        result.messages?.[0]?.key?.id ||
        result.messages?.[0]?.id ||
        null;
      
      console.log('📍 Message ID extraído:', messageIdEvolution || 'NÃO ENCONTRADO');
      console.log('📋 Response completo:', JSON.stringify(result).substring(0, 800));
      console.log('✅ Enviado via Evolution');
    }

    // Garantir que a conversa existe
    console.log('📋 Verificando se conversa existe...');
    let conversa = null;
    try {
      conversa = await base44.asServiceRole.entities.ConversaWhatsapp.get(conversa_id);
      console.log('✅ Conversa encontrada:', conversa.id);
    } catch (e) {
      console.log('⚠️ Conversa não encontrada, criando nova...');
      
      // Se não existir, criar a conversa
      const empresaIdFinal = empresaId || payload.empresa_id;
      const telefoneLimpo = numeroFormatado.replace(/\D/g, '');
      
      conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
        empresa_id: empresaIdFinal,
        cliente_telefone: telefoneLimpo,
        cliente_nome: payload.cliente_nome || telefoneLimpo,
        whatsapp_id: `conv_${Date.now()}`,
        status: 'ativa',
        ultima_mensagem: '',
        data_ultima_mensagem: new Date().toISOString(),
        tipo_conexao: 'empresa',
        canal_atendimento: usaMetaOficial ? 'meta_oficial' : 'evolution',
        canal_preferencial: usaMetaOficial ? 'meta_oficial' : 'evolution',
      });
      console.log('✅ Conversa criada:', conversa.id);
    }

    // Criar registro de mensagem no banco
    console.log('💾 Salvando mensagem no banco...');

    // Buscar nome real do colaborador (evita mostrar email ou nome do auth user)
    let nomeAtendente =
      user?.nome_perfil ||
      user?.full_name ||
      user?.name ||
      user?.email ||
      'Atendente';

    try {
      const colaboradores = await base44.asServiceRole.entities.Colaborador.filter({
        user_id: user.id
      }, '-created_date', 1);
      if (colaboradores?.length > 0) {
        nomeAtendente =
          colaboradores[0].nome ||
          colaboradores[0].nome_completo ||
          colaboradores[0].full_name ||
          nomeAtendente;
      }
    } catch (e) {
      console.warn('⚠️ Não foi possível buscar nome do colaborador:', e.message);
    }

    const empresaIdFinal = empresaId || payload.empresa_id;

    // Determinar tipo de conteúdo
    let tipo_conteudo = 'texto';
    let arquivo_url_permanente = null;

    if (arquivo && arquivo.base64) {
      const tipo = arquivo.tipo || '';
      if (tipo.startsWith('image')) tipo_conteudo = 'imagem';
      else if (tipo.startsWith('audio')) tipo_conteudo = 'audio';
      else if (tipo.startsWith('video')) tipo_conteudo = 'video';
      else tipo_conteudo = 'pdf';

      // Upload para Base44 para URL permanente
      try {
        const binaryStr = atob(arquivo.base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        const mimeUpload = arquivo.tipo || 'application/octet-stream';
        const nomeUpload = arquivo.nome || `arquivo_${Date.now()}`;
        const fileUpload = new File([bytes], nomeUpload, { type: mimeUpload });
        const uploadRes = await base44.integrations.Core.UploadFile({ file: fileUpload });
        if (uploadRes?.file_url) {
          arquivo_url_permanente = uploadRes.file_url;
          console.log('✅ Arquivo salvo permanentemente:', arquivo_url_permanente);
        }
      } catch (uploadErr) {
        console.error('⚠️ Erro ao fazer upload do arquivo:', uploadErr.message);
      }
    }

    let novaMensagem;
    try {
      const empresaIdParaSalvar = empresaIdFinal || conversa?.empresa_id;
      novaMensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create({
        conversa_id: conversa_id,
        empresa_id: empresaIdParaSalvar,
        remetente: 'vendedor',
        usuario_id: user.id,
        usuario_nome: nomeAtendente,
        atendente_nome: nomeAtendente,
        tipo_conteudo: tipo_conteudo,
        texto: mensagem_texto || (arquivo ? `📎 ${arquivo.nome}` : ''),
        arquivo_url: arquivo_url_permanente,
        arquivo_nome: arquivo?.nome || null,
        arquivo_tamanho: 0,
        resposta_para_texto: resposta_para_texto || null,
        resposta_para_nome: resposta_para_nome || null,
        whatsapp_message_id: (usaMetaOficial ? null : messageIdEvolution) || result?.key?.id || result?.messageId || result?.id || `temp_${Date.now()}`,
        data_envio: new Date().toISOString(),
        status: 'enviada'
      });

      // Atualizar última mensagem da conversa mantendo o tipo_conexao correto
      // CRÍTICO: não alterar tipo_conexao aqui — ele só deve mudar via ação manual do usuário
      await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa_id, {
        ultima_mensagem: (mensagem_texto || `📎 ${arquivo?.nome || 'arquivo'}`).substring(0, 200),
        data_ultima_mensagem: new Date().toISOString(),
        ultimo_remetente: 'vendedor',
      });

      console.log('✅ Mensagem salva:', novaMensagem.id);

      console.log('='.repeat(80));
      console.log('✅ SUCESSO!');
      console.log('='.repeat(80));

      return Response.json({ 
        success: true,
        message_id: novaMensagem.id,
        whatsapp_id: result.key?.id || result.messageId || result.id
      });
    } catch (dbError) {
      // Se salvou no banco, retornar sucesso mesmo com erro
      console.error('⚠️ Erro ao salvar mensagem no banco:', dbError.message);
      return Response.json({
        success: true,
        message_id: 'saved_but_error_logged',
        error_detail: dbError.message
      });
    }
  } catch (error) {
    console.log('='.repeat(80));
    console.log('❌ ERRO CRÍTICO');
    console.log('Mensagem:', error.message);
    console.log('Stack:', error.stack);
    console.log('='.repeat(80));
    
    return Response.json({
      success: false,
      error: error.message,
      details: error.stack
    }, { status: 500 });
  }
});