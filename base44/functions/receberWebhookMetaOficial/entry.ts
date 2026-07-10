Deno.serve(async (req) => {
  const VERIFY_TOKEN = 'QTKxBcm2UVQiHqM9CQW7Bx58gqSVmm74';

  // GET request - validação do webhook pela Meta
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { 
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    return new Response('Invalid token', { status: 403 });
  }

  // POST request - mensagens e status updates
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      
      // Responder imediatamente à Meta
      const response = Response.json({ received: true }, { status: 200 });
      
      // Processar em background (sem await)
      processarWebhook(body).catch(err => console.error('Erro ao processar webhook:', err));
      
      return response;
    } catch (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  return Response.json({ ok: false }, { status: 405 });
});

async function processarWebhook(body) {
  if (!body.entry || !Array.isArray(body.entry)) return;
  
  const entry = body.entry[0];
  if (!entry.changes || entry.changes.length === 0) return;
  
  const change = entry.changes[0];
  const value = change.value || {};
  const metadata = value.metadata || {};

  // Inicializar SDK service role
  const { createClientForServiceRole } = await import('npm:@base44/sdk@0.8.25');
  const appId = Deno.env.get('BASE44_APP_ID');
  const base44 = createClientForServiceRole ? createClientForServiceRole({ appId }) : null;
  if (!base44) {
    console.error('❌ Não foi possível criar cliente service role');
    return;
  }

  // === PROCESSAR STATUS UPDATES (entregue, lida, falha) ===
  if (value.statuses && Array.isArray(value.statuses) && value.statuses.length > 0) {
    await processarStatusUpdates(base44, value.statuses, metadata);
  }

  // === PROCESSAR MENSAGENS RECEBIDAS ===
  if (value.messages && Array.isArray(value.messages) && value.messages.length > 0) {
    await processarMensagensRecebidas(base44, value);
  }
}

async function processarStatusUpdates(base44, statuses, metadata) {
  const phoneNumberId = metadata.phone_number_id;
  if (!phoneNumberId) {
    console.warn('⚠️ Status update sem phone_number_id');
    return;
  }

  // Identificar empresa pelo phone_number_id
  const todasEmpresas = await base44.entities.Empresa.filter({}, null, 100);
  const empresa = todasEmpresas.find(e => e.whatsapp_phone_number_id === phoneNumberId);
  if (!empresa) {
    console.warn('⚠️ Empresa não encontrada para phone_number_id:', phoneNumberId);
    return;
  }

  for (const statusUpdate of statuses) {
    const wamid = statusUpdate.id;        // wamid.HXXX...
    const novoStatus = statusUpdate.status; // "sent", "delivered", "read", "failed"
    const timestamp = statusUpdate.timestamp;
    const recipientId = statusUpdate.recipient_id;

    console.log(`📊 Status update: ${wamid} → ${novoStatus} (para ${recipientId})`);

    // Mapear status Meta → status interno
    const statusMap = {
      'sent': 'enviada',
      'delivered': 'entregue',
      'read': 'lida',
      'failed': 'erro',
    };
    const statusInterno = statusMap[novoStatus];
    if (!statusInterno) {
      console.warn(`⚠️ Status desconhecido: ${novoStatus}`);
      continue;
    }

    try {
      // Buscar a MensagemWhatsapp pelo whatsapp_message_id
      const mensagens = await base44.entities.MensagemWhatsapp.filter({
        empresa_id: empresa.id,
        whatsapp_message_id: wamid,
      }, '-created_date', 1);

      if (mensagens.length === 0) {
        console.warn(`⚠️ Mensagem não encontrada para wamid: ${wamid}`);
        continue;
      }

      const mensagem = mensagens[0];

      // Só atualizar se status novo for "melhor" (progressão: enviada → entregue → lida)
      const ordemStatus = { 'enviada': 1, 'entregue': 2, 'lida': 3, 'erro': -1 };
      const statusAtual = mensagem.status || 'pendente';
      if (ordemStatus[statusInterno] !== undefined && ordemStatus[statusInterno] <= (ordemStatus[statusAtual] || 0)) {
        continue; // não regredir status
      }

      // Atualizar status da mensagem
      const updateData = { status: statusInterno };
      const dataTimestamp = timestamp ? new Date(parseInt(timestamp) * 1000).toISOString() : new Date().toISOString();

      if (novoStatus === 'delivered') {
        updateData.entregue_em = dataTimestamp;
      } else if (novoStatus === 'read') {
        updateData.lida_em = dataTimestamp;
      } else if (novoStatus === 'failed') {
        const errObj = statusUpdate.errors?.[0];
        updateData.erro_envio = errObj ? `${errObj.message}${errObj.error_data?.details ? ' — ' + errObj.error_data.details : ''} (code ${errObj.code})` : 'Falha no envio';
      }

      await base44.entities.MensagemWhatsapp.update(mensagem.id, updateData);
      console.log(`✅ Status atualizado: ${wamid} → ${statusInterno}`);

    } catch (e) {
      console.error(`❌ Erro ao processar status update ${wamid}:`, e.message);
    }
  }
}

async function processarMensagensRecebidas(base44, value) {
  const message = value.messages[0];
  const contacts = value.contacts || [];
  const metadata = value.metadata || {};
  console.log('📨 Mensagem recebida:', message);

  const telefone = message.from;
  const nomeContato = contacts[0]?.profile?.name || telefone;
  const phoneNumberId = metadata.phone_number_id;

  // Identificar empresa pelo phone_number_id
  const todasEmpresas = await base44.entities.Empresa.filter({}, null, 100);
  const empresa = todasEmpresas.find(e => e.whatsapp_phone_number_id === phoneNumberId);
  if (!empresa) {
    console.warn('⚠️ Empresa não encontrada para phone_number_id:', phoneNumberId);
    return;
  }

  // Buscar ou criar conversa
  let conversas = await base44.entities.ConversaWhatsapp.filter({
    empresa_id: empresa.id,
    cliente_telefone: telefone
  }, '-created_date', 1);

  let conversa;
  if (conversas.length > 0) {
    conversa = conversas[0];
    // Canal travado manualmente pelo usuário (seletor do chat) — nunca sobrescrever o canal de envio.
    const canalTravado = conversa.locked_provider === true;
    // Se a conversa estava como campanha e o cliente respondeu, promover para ativa
    if (conversa.status === 'campanha') {
      const updateCampanha = {
        status: 'ativa',
        cliente_respondeu: true,
        data_primeira_resposta: new Date().toISOString(),
      };
      if (!canalTravado) {
        updateCampanha.tipo_conexao = 'meta_oficial';
        updateCampanha.instancia = 'META_OFICIAL';
      }
      await base44.entities.ConversaWhatsapp.update(conversa.id, updateCampanha);
      Object.assign(conversa, updateCampanha);
      console.log(`🔄 Conversa promovida de campanha → ativa: ${conversa.id}`);
    } else if (!canalTravado && (conversa.tipo_conexao !== 'meta_oficial' || conversa.instancia !== 'META_OFICIAL')) {
      await base44.entities.ConversaWhatsapp.update(conversa.id, { tipo_conexao: 'meta_oficial', instancia: 'META_OFICIAL' });
      conversa.tipo_conexao = 'meta_oficial';
      conversa.instancia = 'META_OFICIAL';
    } else if (canalTravado) {
      console.log(`🔒 Canal travado manualmente (${conversa.provider || conversa.canal_origem}) — não sobrescrevendo tipo_conexao para conversa ${conversa.id}`);
    }
  } else {
    conversa = await base44.entities.ConversaWhatsapp.create({
      empresa_id: empresa.id,
      cliente_telefone: telefone,
      cliente_nome: nomeContato,
      whatsapp_id: `meta_${telefone}`,
      status: 'ativa',
      tipo_conexao: 'meta_oficial',
      instancia: 'META_OFICIAL',
      ultima_mensagem: '',
      data_ultima_mensagem: new Date().toISOString(),
      ultimo_remetente: 'cliente',
    });
  }

  // Processar conteúdo da mensagem
  let tipo_conteudo = 'texto';
  let texto = '';
  let arquivo_url = null;

  if (message.type === 'text') {
    tipo_conteudo = 'texto';
    texto = message.text?.body || '';
  } else if (message.type === 'image') {
    tipo_conteudo = 'imagem';
    texto = message.image?.caption || '';
    arquivo_url = message.image?.id || null;
  } else if (message.type === 'audio') {
    tipo_conteudo = 'audio';
    texto = 'Áudio';
    arquivo_url = message.audio?.id || null;
  } else if (message.type === 'video') {
    tipo_conteudo = 'video';
    texto = message.video?.caption || 'Vídeo';
    arquivo_url = message.video?.id || null;
  } else if (message.type === 'document') {
    tipo_conteudo = 'documento';
    texto = message.document?.filename || 'Documento';
    arquivo_url = message.document?.id || null;
  } else if (message.type === 'button') {
    tipo_conteudo = 'texto';
    texto = message.button?.text || message.button?.payload || 'Botão';
  } else if (message.type === 'interactive') {
    tipo_conteudo = 'texto';
    texto = message.interactive?.button_reply?.title
         || message.interactive?.list_reply?.title
         || message.interactive?.nfm_reply?.response_json
         || 'Interativo';
  } else {
    texto = message.type || 'Mensagem';
  }

  // Salvar mensagem
  await base44.entities.MensagemWhatsapp.create({
    conversa_id: conversa.id,
    empresa_id: empresa.id,
    remetente: 'cliente',
    tipo_conteudo,
    texto,
    arquivo_url,
    whatsapp_message_id: message.id,
    data_envio: new Date(parseInt(message.timestamp) * 1000).toISOString(),
    status: 'entregue',
  });

  // Atualizar última mensagem da conversa
  const canalAtualMeta = conversa.canal_atendimento || conversa.canal_preferencial || null;
  const canalTravadoMeta = conversa.locked_provider === true;

  const updateConversaMeta = {
    ultima_mensagem: texto,
    data_ultima_mensagem: new Date().toISOString(),
    ultimo_remetente: 'cliente',
    cliente_nome: nomeContato,
    ultima_origem_recebida: 'meta_oficial',
    phone_number_id_meta: phoneNumberId,
  };

  // Canal de ENVIO travado manualmente pelo usuário — não sobrescrever tipo_conexao/instancia.
  if (!canalTravadoMeta) {
    updateConversaMeta.tipo_conexao = 'meta_oficial';
    updateConversaMeta.instancia = 'META_OFICIAL';
  }

  if (!canalAtualMeta) {
    updateConversaMeta.canal_atendimento = 'meta_oficial';
    updateConversaMeta.canal_preferencial = 'meta_oficial';
  }

  await base44.entities.ConversaWhatsapp.update(conversa.id, updateConversaMeta);

  console.log('✅ Mensagem Meta Oficial salva para conversa:', conversa.id);
}