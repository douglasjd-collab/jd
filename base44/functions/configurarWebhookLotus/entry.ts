import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Tenta configurar o webhook da instância LOTUS usando diferentes métodos
Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  const lotusKey = body.lotus_key || ''; // permite passar a key manualmente
  
  const evolutionUrl = 'https://jdpromotora.0ntuaf.easypanel.host';
  const globalKey = Deno.env.get('EVOLUTION_API_KEY') || '';
  const webhookUrl = 'https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=LOTUS';
  
  const payload = {
    webhook: {
      url: webhookUrl,
      enabled: true,
      byEvents: false,
      base64: false,
      events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE']
    }
  };

  const resultados = [];

  // Testar lista de keys possíveis
  const keysParaTestar = [
    { label: 'lotus_key_fornecida', key: lotusKey },
    { label: 'global_EVOLUTION_API_KEY', key: globalKey },
    // Keys alternativas comuns da Evolution API
    { label: 'tentativa_default', key: 'evolution_api_key_default' },
  ].filter(k => k.key && k.key.length > 3);

  for (const { label, key } of keysParaTestar) {
    // Testar leitura do webhook
    const resCheck = await fetch(`${evolutionUrl}/webhook/find/LOTUS`, {
      headers: { 'apikey': key }
    }).catch(e => ({ ok: false, status: 0, _err: e.message }));
    
    const checkStatus = resCheck.status;
    const checkOk = resCheck.ok;
    
    if (checkOk) {
      const checkData = await resCheck.json();
      resultados.push({ label, status_check: checkStatus, pode_ler: true, webhook_atual: checkData });
      
      // Configurar webhook
      const resSet = await fetch(`${evolutionUrl}/webhook/set/LOTUS`, {
        method: 'POST',
        headers: { 'apikey': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const setData = await resSet.json();
      resultados.push({ label: `${label}_SET`, status_set: resSet.status, sucesso: resSet.ok, resposta: setData });
      
      if (resSet.ok) {
        console.log(`✅ Webhook LOTUS configurado com key: ${label}`);
        return Response.json({ 
          sucesso: true, 
          key_usada: label,
          webhook_configurado: webhookUrl,
          resultados 
        });
      }
    } else {
      resultados.push({ label, status_check: checkStatus, pode_ler: false });
    }
  }

  // Se nenhuma key funcionou, listar instâncias com a global key para inspecionar
  console.log('⚠️ Nenhuma key funcionou — listando instâncias...');
  const resInstancias = await fetch(`${evolutionUrl}/instance/fetchInstances`, {
    headers: { 'apikey': globalKey }
  }).catch(e => ({ ok: false }));
  
  let instancias = null;
  if (resInstancias.ok) {
    instancias = await resInstancias.json();
  }

  return Response.json({ 
    sucesso: false, 
    mensagem: 'Nenhuma key funcionou para a instância LOTUS. Forneça a key correta no parâmetro lotus_key.',
    instancias_listadas: instancias,
    resultados 
  });
});