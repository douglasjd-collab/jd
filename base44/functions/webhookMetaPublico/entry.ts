import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const VERIFY_TOKEN = 'WAZE_CRM_WEBHOOK_2024';

Deno.serve(async (req) => {
  const url = new URL(req.url);

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

  // ── GET: Verificação do webhook pela Meta ─────────────────────────────
  // CRÍTICO: deve ser a PRIMEIRA coisa — sem criar cliente Base44
  if (req.method === 'GET') {
    // Tentar ler do body também (alguns proxies convertem GET → body)
    const mode      = url.searchParams.get('hub.mode');
    const token     = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    console.log('🔎 Verificação Meta GET:', { mode, token, challenge, url: req.url });

    if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
      console.log('✅ Webhook VALIDADO! Retornando challenge:', challenge);
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    // Retornar 200 mesmo em caso de token incorreto para diagnóstico
    console.log('❌ Verificação falhou — mode:', mode, '| token recebido:', token, '| esperado:', VERIFY_TOKEN);
    return new Response('Token verification failed', { status: 403 });
  }

  // ── POST: Mensagem real enviada pela Meta ─────────────────────────────
  if (req.method === 'POST') {
    let body;
    try {
      body = await req.json();
    } catch (_) {
      return new Response('EVENT_RECEIVED', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    console.log('📨 Webhook Meta POST recebido. Entries:', body?.entry?.length || 0);

    // Criar cliente apenas para o POST (precisa salvar no banco)
    const base44 = createClientFromRequest(req);

    try {
      await processarMensagemMeta(body, base44);
    } catch (err) {
      console.error('❌ Erro ao processar:', err.message);
    }

    return new Response('EVENT_RECEIVED', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  return new Response('Method Not Allowed', { status: 405 });
});

async function processarMensagemMeta(body, base44) {
  console.log('🔄 Iniciando processamento...');

  if (!body.entry || !Array.isArray(body.entry)) {
    console.log('⚠️ Payload sem entry, ignorando');
    return;
  }

  for (const entry of body.entry) {
    for (const change of (entry.changes || [])) {
      const value = change.value;

      const messages = value.messages || [];
      console.log(`📬 ${messages.length} mensagem(ns) para processar`);
      for (const message of messages) {
        await salvarMensagem(base44, value, message);
      }

      const statuses = value.statuses || [];
      for (const status of statuses) {
        await atualizarStatusMensagem(base44, status);
      }
    }
  }
  console.log('✅ Processamento concluído');
}

async function salvarMensagem(base44, value, message) {
  const telefoneLimpo = String(message.from || '').replace(/\D/g, '');
  const msgId = message.id;
  const timestamp = message.timestamp;

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

  console.log(`📱 Mensagem de ${telefoneLimpo}: "${(texto || '').slice(0, 60)}"`);

  // Buscar empresa pelo phone_number_id
  const phoneNumberId = String(value.metadata?.phone_number_id || '').trim();
  let empresas = [];

  if (phoneNumberId) {
    // Buscar todas empresas com access_token configurado e comparar phone_number_id
    const todasEmpresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' }, null, 50);
    const match = todasEmpresas.filter(e => String(e.whatsapp_phone_number_id || '').trim() === phoneNumberId);
    if (match.length > 0) {
      empresas = match;
      console.log(`🏢 Empresa encontrada por phone_number_id (${phoneNumberId}): ${match[0].nome}`);
    } else {
      console.log(`⚠️ Nenhuma empresa com phone_number_id=${phoneNumberId}. IDs cadastrados: ${todasEmpresas.map(e => e.whatsapp_phone_number_id).join(', ')}`);
      // fallback: pegar a que tem access_token configurado
      const comToken = todasEmpresas.filter(e => e.whatsapp_access_token && e.whatsapp_phone_number_id);
      empresas = comToken.length > 0 ? [comToken[0]] : [todasEmpresas[0]];
      console.log(`🏢 Fallback empresa: ${empresas[0]?.nome}`);
    }
  } else {
    empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' }, null, 1);
    console.log(`🏢 Empresa por status ativa (sem phone_number_id no payload): ${empresas?.length || 0}`);
  }
  if (!empresas || empresas.length === 0) {
    console.log('❌ Nenhuma empresa encontrada');
    return;
  }
  const empresa = empresas[0];
  const empresaId = empresa.id;
  console.log(`🏢 Empresa: ${empresa.nome} (${empresaId})`);

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
    console.log(`✨ Cliente criado: ${cliente.id}`);
  } else {
    cliente = clientes[0];
    console.log(`👤 Cliente: ${cliente.id} (${cliente.nome_completo})`);
  }

  // Variações do telefone (com/sem nono dígito)
  const tel12 = telefoneLimpo.startsWith('55') && telefoneLimpo.length === 13
    ? telefoneLimpo.slice(0, 4) + telefoneLimpo.slice(5) : null;
  const tel13 = telefoneLimpo.startsWith('55') && telefoneLimpo.length === 12
    ? telefoneLimpo.slice(0, 4) + '9' + telefoneLimpo.slice(4) : null;
  const variacoes = [telefoneLimpo, tel12, tel13].filter(Boolean);

  // Buscar TODAS as conversas do número (pode ter duplicatas) — pegar a mais ANTIGA (primeira criada)
  const todasConversasEmpresa = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
    empresa_id: empresaId,
  }, 'created_date', 500); // ordem crescente = mais antigas primeiro

  const conversasDoNumero = todasConversasEmpresa.filter(c => {
    const t = String(c.cliente_telefone || '').replace(/\D/g, '');
    return variacoes.includes(t);
  });

  let conversa = null;

  if (conversasDoNumero.length > 0) {
    // Usar a conversa mais ANTIGA como principal
    conversa = conversasDoNumero[0];

    // Se houver duplicatas, migrar mensagens para a mais antiga e arquivar as outras
    if (conversasDoNumero.length > 1) {
      console.log(`⚠️ ${conversasDoNumero.length} conversas duplicadas encontradas para ${telefoneLimpo} — consolidando...`);
      for (const dup of conversasDoNumero.slice(1)) {
        // Migrar mensagens
        const msgsDup = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
          { conversa_id: dup.id }, null, 500
        );
        for (const m of msgsDup) {
          await base44.asServiceRole.entities.MensagemWhatsapp.update(m.id, { conversa_id: conversa.id });
        }
        // Arquivar duplicata
        await base44.asServiceRole.entities.ConversaWhatsapp.update(dup.id, { status: 'arquivada' });
        console.log(`🗄️ Conversa ${dup.id} arquivada (${msgsDup.length} msgs migradas)`);
      }
    }

    // Garantir dados atualizados na conversa principal
    const update = { instancia: 'META_OFICIAL', tipo_conexao: 'meta_oficial', status: 'ativa' };
    if (!conversa.cliente_telefone || conversa.cliente_telefone !== telefoneLimpo) update.cliente_telefone = telefoneLimpo;
    if (!conversa.cliente_id && cliente?.id) update.cliente_id = cliente.id;
    if (!conversa.cliente_nome && cliente?.nome_completo) update.cliente_nome = cliente.nome_completo;
    await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, update);
    console.log(`💬 Conversa principal: ${conversa.id}`);
  } else {
    // Nenhuma conversa — criar
    conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
      empresa_id: empresaId,
      cliente_id: cliente?.id,
      cliente_nome: cliente?.nome_completo || telefoneLimpo,
      cliente_telefone: telefoneLimpo,
      whatsapp_id: telefoneLimpo,
      status: 'ativa',
      tipo_conexao: 'meta_oficial',
      instancia: 'META_OFICIAL',
    });
    console.log(`✨ Conversa criada: ${conversa.id}`);
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
    remetente: 'cliente',
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

  console.log(`✅ Mensagem salva! ID: ${mensagem.id}`);
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
    console.log(`📬 Status: ${msgId} → ${novoStatus}`);
  }
}