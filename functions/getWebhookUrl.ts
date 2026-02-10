import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const appDomain = url.hostname;
    
    // Tentar carregar config da entidade primeiro
    let evolutionUrl = '';
    let instanceName = '';
    let apiKey = '';

    try {
      const configs = await base44.asServiceRole.entities.ConfiguracaoSistema.filter(
        { chave: 'whatsapp_config' }
      );
      
      if (configs && configs.length > 0) {
        const config = JSON.parse(configs[0].valor || '{}');
        evolutionUrl = config.evolutionUrl || '';
        instanceName = config.instanceName || '';
        apiKey = config.apiKey || '';
      }
    } catch (e) {
      console.log('Usando env variables para WhatsApp config');
    }

    // Fallback para variáveis de ambiente
    if (!evolutionUrl) evolutionUrl = Deno.env.get('EVOLUTION_API_URL') || '';
    if (!instanceName) instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'default';
    if (!apiKey) apiKey = Deno.env.get('EVOLUTION_API_KEY') || '';
    
    const webhookUrl = `https://${appDomain}/functions/receberWebhookWhatsApp?instance=${instanceName}`;
    
    return Response.json({
      webhookUrl,
      appDomain,
      instanceName,
      evolutionUrl,
      apiKey: apiKey ? '***' : ''
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});