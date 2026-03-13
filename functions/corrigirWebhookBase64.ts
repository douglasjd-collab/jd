import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Corrige o webhook desativando webhookBase64 e garantindo os eventos corretos
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const JD_ID = '699696c2c9f5bffc2e67402b';
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: JD_ID });
    const empresa = empresas?.[0];
    
    if (!empresa) return Response.json({ erro: 'Empresa não encontrada' }, { status: 404 });
    
    const evolutionUrl = empresa.evolution_url;
    const evolutionKey = empresa.evolution_api_key;
    const instanceName = empresa.evolution_instance_name;
    const baseUrl = evolutionUrl.endsWith('/') ? evolutionUrl.slice(0, -1) : evolutionUrl;
    const webhookUrl = `https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=${instanceName}`;
    
    console.log('Atualizando webhook para', instanceName);
    
    const response = await fetch(`${baseUrl}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': evolutionKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: webhookUrl,
        enabled: true,
        webhookBase64: false,  // DESATIVAR base64 — enviar JSON puro
        webhookByEvents: false,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE'
        ]
      })
    });
    
    const result = await response.json();
    console.log('Resultado:', JSON.stringify(result));
    
    return Response.json({
      ok: response.ok,
      status: response.status,
      resultado: result,
      mensagem: response.ok ? '✅ Webhook corrigido! webhookBase64 desativado.' : '❌ Erro ao atualizar'
    });
    
  } catch (e) {
    console.error('Erro:', e.message);
    return Response.json({ erro: e.message }, { status: 500 });
  }
});