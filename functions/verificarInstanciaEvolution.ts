import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const JD_ID = '699696c2c9f5bffc2e67402b';

  const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: JD_ID });
  const empresa = empresas?.[0];
  const evolutionUrl = empresa.evolution_url.replace(/\/$/, '');
  const evolutionKey = empresa.evolution_api_key;
  const instanceName = empresa.evolution_instance_name;

  // 1. Status da instância
  const statusRes = await fetch(`${evolutionUrl}/instance/connectionState/${instanceName}`, {
    headers: { 'apikey': evolutionKey }
  });
  const statusData = await statusRes.json();

  // 2. Webhook atual
  const webhookRes = await fetch(`${evolutionUrl}/webhook/find/${instanceName}`, {
    headers: { 'apikey': evolutionKey }
  });
  const webhookData = await webhookRes.json();

  // 3. Buscar últimas mensagens recebidas da Evolution
  const msgsRes = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
    method: 'POST',
    headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ where: { key: { fromMe: false } }, limit: 5 })
  });
  const msgsData = await msgsRes.json();
  const msgs = Array.isArray(msgsData) ? msgsData : (msgsData.messages?.records || msgsData.messages || []);

  return Response.json({
    instancia: instanceName,
    conexao: statusData,
    webhook: webhookData,
    ultimas_msgs_recebidas: msgs.map(m => ({
      id: m.key?.id,
      remoteJid: m.key?.remoteJid,
      fromMe: m.key?.fromMe,
      pushName: m.pushName,
      texto: m.message?.conversation || m.message?.extendedTextMessage?.text || '(outro tipo)',
      timestamp: m.messageTimestamp
    }))
  });
});