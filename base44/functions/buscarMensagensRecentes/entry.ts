import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id || '699696c2c9f5bffc2e67402b';

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId });
    if (!empresas || empresas.length === 0) {
      return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    const empresa = empresas[0];
    const evolutionUrl = (empresa.evolution_url || '').replace(/\/$/, '');
    const apiKey = empresa.evolution_api_key || '';
    const instanceName = empresa.evolution_instance_name || '';

    // 1. Verificar status da conexão
    const statusResp = await fetch(`${evolutionUrl}/instance/connectionState/${instanceName}`, {
      headers: { 'apikey': apiKey }
    });
    const status = await statusResp.json();
    console.log(`📡 Status instância: ${JSON.stringify(status)}`);

    // 2. Listar TODOS os chats
    const chatsResp = await fetch(`${evolutionUrl}/chat/findChats/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ where: {} })
    });
    const chats = await chatsResp.json();
    console.log(`💬 Todos os chats: ${JSON.stringify(chats)}`);

    // 3. Verificar webhook atual
    const webhookResp = await fetch(`${evolutionUrl}/webhook/find/${instanceName}`, {
      headers: { 'apikey': apiKey }
    });
    const webhook = await webhookResp.json();
    console.log(`🔗 Webhook: ${JSON.stringify(webhook)}`);

    return Response.json({
      instancia: instanceName,
      status_conexao: status,
      todos_chats: Array.isArray(chats) ? chats : chats,
      webhook_config: webhook
    });

  } catch (e) {
    console.error(`❌ Erro: ${e.message}`);
    return Response.json({ error: e.message }, { status: 500 });
  }
});