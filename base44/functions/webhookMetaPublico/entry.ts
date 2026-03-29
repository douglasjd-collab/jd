import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const VERIFY_TOKEN = 'WAZE_CRM_WEBHOOK_2024';

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      }
    });
  }

  const url = new URL(req.url);

  // ── GET: Verificação do webhook pela Meta ─────────────────────────────
  if (req.method === 'GET') {
    const mode      = url.searchParams.get('hub.mode');
    const token     = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    console.log('🔎 Verificação Meta:', { mode, token, challenge });

    if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
      console.log('✅ Webhook VALIDADO!');
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response('Forbidden', { status: 403 });
  }

  // ── POST: Mensagem real enviada pela Meta ─────────────────────────────
  if (req.method === 'POST') {
    let body;
    try {
      body = await req.json();
    } catch (_) {
      return new Response('EVENT_RECEIVED', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    console.log('📨 Webhook Meta POST recebido:', JSON.stringify(body).slice(0, 400));

    // Criar cliente com o req original e processar em background
    const base44 = createClientFromRequest(req);
    processarMensagemMeta(body, base44).catch(err => console.error('Erro ao processar:', err.message));

    // Responder imediatamente (requisito da Meta)
    return new Response('EVENT_RECEIVED', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  return new Response('Method Not Allowed', { status: 405 });
});

async function processarMensagemMeta(body, base44) {
  // Só processar payloads do WhatsApp Business
  if (!body.entry || !Array.isArray(body.entry)) return;

  for (const entry of body.entry) {
    for (const change of (entry.changes || [])) {
      const value = change.value;

      // ── Processar mensagens recebidas ─────────────────────────────────
      const messages = value.messages || [];
      for (const message of messages) {
        await salvarMensagem(base44, value, message, false);
      }

      // ── Processar status de entrega/leitura ───────────────────────────
      const statuses = value.statuses || [];
      for (const status of statuses) {
        await atualizarStatusMensagem(base44, status);
      }
    }
  }
}

async function salvarMensagem(base44, value, message, fromMe) {
  const telefoneLimpo = String(message.from || '').replace(/\D/g, '');
  const msgId = message.id;
  const timestamp = message.timestamp;

  // Tipo e conteúdo
  let tipoConteudo = 'texto';
  let texto = null;
  let arquivoUrl = null;
  let arquivoNome = null;

  if (message.type === 'text') {
    texto = message.text?.body || '';
  } else if (message.type === 'image') {
    tipoConteudo = 'imagem';
    texto = message.image?.caption || '[Imagem]';
  } else if (message.type === 'audio' || message.type === 'voice') {
    tipoConteudo = 'audio';
    texto = '[Áudio]';
  } else if (message.type === 'video') {
    tipoConteudo = 'video';
    texto = message.video?.caption || '[Vídeo]';
  } else if (message.type === 'document') {
    tipoConteudo = 'documento';
    arquivoNome = message.document?.filename || 'documento';
    texto = message.document?.caption || `[Documento: ${arquivoNome}]`;
  } else {
    texto = `[${message.type || 'Mensagem'}]`;
  }

  console.log(`📱 Mensagem de ${telefoneLimpo}: ${(texto || '').slice(0, 60)}`);

  // Garantir empresa — primeiro pelo phone_number_id, depois pela primeira ativa
  const phoneNumberId = value.metadata?.phone_number_id;
  let empresas;
  if (phoneNumberId) {
    empresas = await base44.asServiceRole.entities.Empresa.filter({ whatsapp_phone_number_id: phoneNumberId }, null, 1);
  }
  if (!empresas || empresas.length === 0) {
    empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' }, null, 1);
  }
  if (!empresas || empresas.length === 0) {
    console.log('❌ Nenhuma empresa encontrada');
    return;
  }
  const empresa = empresas[0];
  const empresaId = empresa.id;

  // Garantir cliente
  let clientes = await base44.asServiceRole.entities.Cliente.filter({ empresa_id: empresaId, celular: telefoneLimpo }, null, 1);
  let cliente;
  if (clientes.length === 0) {
    const nomeContato = value.contacts?.[0]?.profile?.name || `Contato ${telefoneLimpo}`;
    cliente = await base44.asServiceRole.entities.Cliente.create({
      empresa_id: empresaId,
      tipo_pessoa: 'Física',
      celular: telefoneLimpo,
      nome_completo: nomeContato,
      status: 'ativo',
    });
    console.log(`✨ Cliente criado: ${cliente.id} (${nomeContato})`);
  } else {
    cliente = clientes[0];
  }

  // Garantir conversa
  let conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
    empresa_id: empresaId,
    cliente_id: cliente.id,
  }, null, 1);
  let conversa;
  if (conversas.length === 0) {
    conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
      empresa_id: empresaId,
      cliente_id: cliente.id,
      cliente_nome: cliente.nome_completo,
      cliente_telefone: telefoneLimpo,
      whatsapp_id: telefoneLimpo,
      status: 'ativa',
      tipo_conexao: 'empresa',
      instancia: 'META_OFICIAL',
    });
    console.log(`✨ Conversa criada: ${conversa.id}`);
  } else {
    conversa = conversas[0];
  }

  // Verificar duplicata
  const existentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
    conversa_id: conversa.id,
    whatsapp_message_id: String(msgId),
  }, null, 1);
  if (existentes.length > 0) {
    console.log('⏭️ Duplicata ignorada:', msgId);
    return;
  }

  // Salvar mensagem
  const mensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create({
    conversa_id: conversa.id,
    empresa_id: empresaId,
    remetente: fromMe ? 'vendedor' : 'cliente',
    tipo_conteudo: tipoConteudo,
    texto: String(texto || '').slice(0, 5000),
    arquivo_url: arquivoUrl,
    arquivo_nome: arquivoNome,
    whatsapp_message_id: String(msgId),
    data_envio: new Date(Number(timestamp) * 1000).toISOString(),
    status: 'entregue',
  });

  // Atualizar última mensagem da conversa
  await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
    ultima_mensagem: String(texto || '').slice(0, 100),
    data_ultima_mensagem: new Date().toISOString(),
    instancia: 'META_OFICIAL',
  });

  console.log(`✅ Mensagem salva: ${mensagem.id} | Conversa: ${conversa.id}`);
}

async function atualizarStatusMensagem(base44, status) {
  const msgId = status.id;
  if (!msgId) return;

  const statusMap = { sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'erro' };
  const novoStatus = statusMap[status.status];
  if (!novoStatus) return;

  const msgs = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
    whatsapp_message_id: String(msgId),
  }, null, 1);

  if (msgs.length > 0) {
    await base44.asServiceRole.entities.MensagemWhatsapp.update(msgs[0].id, { status: novoStatus });
    console.log(`📬 Status atualizado: ${msgId} → ${novoStatus}`);
  }
}