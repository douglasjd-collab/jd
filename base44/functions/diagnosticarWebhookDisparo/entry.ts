import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id || '699696c2c9f5bffc2e67402b';

    console.log(`🔍 Diagnosticando disparo do webhook...`);

    // Buscar empresa
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId });
    if (!empresas || empresas.length === 0) {
      return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    const empresa = empresas[0];
    const evolutionUrl = (empresa.evolution_url || '').replace(/\/$/, '');
    const apiKey = empresa.evolution_api_key || '';
    const instanceName = empresa.evolution_instance_name || '';

    // 1. Verificar status da instância
    const statusResp = await fetch(`${evolutionUrl}/instance/connectionState/${instanceName}`, {
      headers: { 'apikey': apiKey }
    });
    const status = await statusResp.json();
    console.log(`📡 Status: ${status.instance?.state}`);

    // 2. Buscar TODOS os chats
    const chatsResp = await fetch(`${evolutionUrl}/chat/findChats/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ where: {} })
    });
    const chats = await chatsResp.json();
    console.log(`💬 Total de chats: ${chats.length}`);

    // 3. Analisar cada chat
    const chatAnalise = [];
    for (const chat of chats.slice(0, 10)) {
      const remoteJid = chat.id || '';
      const messages = chat.messages || [];
      const ultimaMensagem = messages[messages.length - 1];
      
      chatAnalise.push({
        numero: remoteJid.replace('@s.whatsapp.net', ''),
        total_mensagens: messages.length,
        última_msg_recebida: ultimaMensagem && !ultimaMensagem.key?.fromMe ? 'SIM' : 'NÃO',
        timestamp_ultima: ultimaMensagem?.messageTimestamp ? new Date(ultimaMensagem.messageTimestamp * 1000).toISOString() : null
      });
    }

    // 4. Verificar webhook config
    const webhookResp = await fetch(`${evolutionUrl}/webhook/find/${instanceName}`, {
      headers: { 'apikey': apiKey }
    });
    const webhook = await webhookResp.json();

    // 5. Verificar logs de webhook na Evolution (se disponível)
    let webhookLogs = null;
    try {
      const logsResp = await fetch(`${evolutionUrl}/webhook/find/${instanceName}/logs`, {
        headers: { 'apikey': apiKey }
      });
      if (logsResp.ok) {
        webhookLogs = await logsResp.json();
      }
    } catch (e) {
      console.log('⚠️ Logs de webhook não disponíveis na Evolution API');
    }

    // 6. Verificar logs no banco de dados
    const logsDb = await base44.asServiceRole.entities.LogRecebimentoWebhook.filter(
      { empresa_id: empresaId },
      '-timestamp',
      20
    );

    return Response.json({
      instancia: instanceName,
      status_instancia: status.instance?.state,
      webhook_url: webhook.url || webhook?.webhook?.url,
      webhook_enabled: webhook.enabled || webhook?.webhook?.enabled,
      webhook_events: webhook.events || webhook?.webhook?.events,
      total_chats: chats.length,
      chats_analise: chatAnalise,
      webhook_logs_evolution: webhookLogs?.slice(0, 5) || 'Não disponível',
      logs_banco_dados: logsDb.length,
      ultimos_logs_db: logsDb.map(l => ({ tipo: l.tipo_evento, telefone: l.telefone, status: l.status, data: l.timestamp }))
    });

  } catch (e) {
    console.error(`❌ Erro: ${e.message}`);
    return Response.json({ error: e.message }, { status: 500 });
  }
});