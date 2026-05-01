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

  // POST request - mensagens reais
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      
      // Responder imediatamente à Meta
      const response = Response.json({ received: true }, { status: 200 });
      
      // Processar mensagem em background (sem await)
      processarMensagem(body).catch(err => console.error('Erro ao processar:', err));
      
      return response;
    } catch (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  return Response.json({ ok: false }, { status: 405 });
});

async function processarMensagem(body) {
  if (!body.entry || !Array.isArray(body.entry)) return;
  
  const entry = body.entry[0];
  if (!entry.changes || entry.changes.length === 0) return;
  
  const change = entry.changes[0];
  if (!change?.value?.messages) return;
  
  const message = change.value.messages[0];
  const contacts = change.value.contacts || [];
  const metadata = change.value.metadata || {};
  console.log('📨 Mensagem recebida:', message);

  const { createClientFromRequest: _unused, ...sdk } = await import('npm:@base44/sdk@0.8.25').then(m => m);
  const { createClientForServiceRole } = await import('npm:@base44/sdk@0.8.25');
  
  // Usar service role para salvar
  const appId = Deno.env.get('BASE44_APP_ID');
  const base44 = createClientForServiceRole ? createClientForServiceRole({ appId }) : null;
  if (!base44) {
    console.error('❌ Não foi possível criar cliente service role');
    return;
  }

  const telefone = message.from; // número sem +
  const nomeContato = contacts[0]?.profile?.name || telefone;
  const phoneNumberId = metadata.phone_number_id;

  // Identificar empresa pelo phone_number_id
  const todasEmpresas = await base44.entities.Empresa.filter({}, null, 100);
  const empresa = todasEmpresas.find(e => e.whatsapp_phone_number_id === phoneNumberId);
  if (!empresa) {
    console.warn('⚠️ Empresa não encontrada para phone_number_id:', phoneNumberId);
    return;
  }

  // Buscar ou criar conversa com tipo_conexao = 'meta_oficial'
  let conversas = await base44.entities.ConversaWhatsapp.filter({
    empresa_id: empresa.id,
    cliente_telefone: telefone
  }, '-created_date', 1);

  let conversa;
  if (conversas.length > 0) {
    conversa = conversas[0];
    // Garantir que tipo_conexao está correto
    if (conversa.tipo_conexao !== 'meta_oficial') {
      await base44.entities.ConversaWhatsapp.update(conversa.id, { tipo_conexao: 'meta_oficial' });
    }
  } else {
    conversa = await base44.entities.ConversaWhatsapp.create({
      empresa_id: empresa.id,
      cliente_telefone: telefone,
      cliente_nome: nomeContato,
      whatsapp_id: `meta_${telefone}`,
      status: 'ativa',
      tipo_conexao: 'meta_oficial',
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
    arquivo_url = message.image?.url || null;
  } else if (message.type === 'audio') {
    tipo_conteudo = 'audio';
    texto = 'Áudio';
  } else if (message.type === 'video') {
    tipo_conteudo = 'video';
    texto = message.video?.caption || 'Vídeo';
  } else if (message.type === 'document') {
    tipo_conteudo = 'documento';
    texto = message.document?.filename || 'Documento';
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
  await base44.entities.ConversaWhatsapp.update(conversa.id, {
    ultima_mensagem: texto,
    data_ultima_mensagem: new Date().toISOString(),
    ultimo_remetente: 'cliente',
    cliente_nome: nomeContato,
  });

  console.log('✅ Mensagem Meta Oficial salva para conversa:', conversa.id);
}