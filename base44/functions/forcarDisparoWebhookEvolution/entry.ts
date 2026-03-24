// Força a Evolution API a reenviar o webhook para a URL configurada
// Faz uma chamada na API para buscar mensagens recentes, simulando que chegou algo
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const JD_ID = '699696c2c9f5bffc2e67402b';
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: JD_ID });
    const empresa = empresas?.[0];
    
    const evolutionUrl = empresa.evolution_url?.replace(/\/$/, '');
    const evolutionKey = empresa.evolution_api_key;
    const instanceName = empresa.evolution_instance_name;

    // 1) Verificar configuração atual do webhook
    const webhookRes = await fetch(`${evolutionUrl}/webhook/find/${instanceName}`, {
      headers: { 'apikey': evolutionKey }
    });
    const webhookConfig = await webhookRes.json();
    console.log('Webhook atual:', JSON.stringify(webhookConfig));

    // 2) Buscar status da instância
    const statusRes = await fetch(`${evolutionUrl}/instance/connectionState/${instanceName}`, {
      headers: { 'apikey': evolutionKey }
    });
    const statusData = await statusRes.json();
    console.log('Status instância:', JSON.stringify(statusData));

    // 3) Buscar mensagens recentes diretamente da Evolution (últimas 5)
    // Isso confirma se a instância está conectada e recebendo
    const msgRes = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ where: { key: { fromMe: false } }, limit: 5 })
    });
    const msgData = msgRes.ok ? await msgRes.json() : { error: msgRes.status };
    console.log('Mensagens recentes Evolution:', JSON.stringify(msgData).substring(0, 500));

    return Response.json({
      ok: true,
      webhook_url: webhookConfig?.url || webhookConfig?.webhook?.url,
      webhook_base64: webhookConfig?.webhookBase64 ?? webhookConfig?.webhook?.webhookBase64,
      webhook_enabled: webhookConfig?.enabled ?? webhookConfig?.webhook?.enabled,
      instancia_status: statusData?.instance?.state || statusData?.state || statusData,
      mensagens_recentes_evolution: typeof msgData === 'object' ? 
        (Array.isArray(msgData) ? msgData.length : Object.keys(msgData)) : msgData
    });
  } catch (e) {
    return Response.json({ erro: e.message }, { status: 500 });
  }
});