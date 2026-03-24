import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Buscar configuração da empresa JD
    const JD_ID = '699696c2c9f5bffc2e67402b';
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: JD_ID });
    const empresa = empresas?.[0];
    
    if (!empresa) {
      return Response.json({ erro: 'Empresa não encontrada' }, { status: 404 });
    }
    
    const evolutionUrl = empresa.evolution_url;
    const evolutionKey = empresa.evolution_api_key;
    const instanceName = empresa.evolution_instance_name;
    
    console.log('Config empresa:', { evolutionUrl, instanceName, keyOk: !!evolutionKey });
    
    if (!evolutionUrl || !evolutionKey || !instanceName) {
      return Response.json({ 
        erro: 'Configuração incompleta',
        evolution_url: evolutionUrl || 'AUSENTE',
        instance_name: instanceName || 'AUSENTE',
        api_key: evolutionKey ? 'OK' : 'AUSENTE'
      });
    }
    
    // Consultar configuração atual do webhook na Evolution API
    const baseUrl = evolutionUrl.endsWith('/') ? evolutionUrl.slice(0, -1) : evolutionUrl;
    
    const response = await fetch(`${baseUrl}/webhook/find/${instanceName}`, {
      method: 'GET',
      headers: {
        'apikey': evolutionKey,
        'Content-Type': 'application/json'
      }
    });
    
    const webhookConfig = await response.json();
    console.log('Webhook config atual:', JSON.stringify(webhookConfig));
    
    const urlEsperada = `https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=${instanceName}`;
    const urlAtual = webhookConfig?.url || webhookConfig?.webhook?.url || '';
    const urlCorreta = urlAtual.includes('receberWebhookWhatsApp');
    const eventosMESSAGES = webhookConfig?.events?.includes('MESSAGES_UPSERT') || 
                            webhookConfig?.webhook?.events?.includes('MESSAGES_UPSERT') ||
                            JSON.stringify(webhookConfig).includes('MESSAGES_UPSERT');
    
    return Response.json({
      ok: true,
      empresa: empresa.nome,
      instance_name: instanceName,
      webhook_atual: webhookConfig,
      url_atual: urlAtual,
      url_esperada: urlEsperada,
      url_correta: urlCorreta,
      tem_messages_upsert: eventosMESSAGES,
      problema: !urlCorreta ? 'URL incorreta ou webhook não configurado' : (!eventosMESSAGES ? 'Evento MESSAGES_UPSERT não ativo' : 'Configuração OK')
    });
    
  } catch (e) {
    console.error('Erro:', e.message);
    return Response.json({ erro: e.message }, { status: 500 });
  }
});