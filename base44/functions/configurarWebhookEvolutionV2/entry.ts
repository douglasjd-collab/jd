import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL');
    const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY');
    const INSTANCE_NAME = 'PROMOTORAJD';

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return Response.json({ erro: 'Variáveis não configuradas' }, { status: 500 });
    }

    const baseUrl = EVOLUTION_API_URL.endsWith('/') ? EVOLUTION_API_URL.slice(0, -1) : EVOLUTION_API_URL;
    const WEBHOOK_URL = 'https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=PROMOTORAJD';

    console.log('🔧 Tentando configurar webhook...');
    console.log('URL Base:', baseUrl);
    console.log('Instance:', INSTANCE_NAME);
    console.log('Webhook URL:', WEBHOOK_URL);

    // Tentar POST direto para /webhook/set com query param
    const urls = [
      `${baseUrl}/webhook/set/${INSTANCE_NAME}?apikey=${EVOLUTION_API_KEY}`,
      `${baseUrl}/instance/webhook?apikey=${EVOLUTION_API_KEY}`,
    ];

    const payload = {
      url: WEBHOOK_URL,
      events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE']
    };

    for (const url of urls) {
      try {
        console.log(`\n📡 Tentando URL: ${url.split('?')[0]}...`);
        
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        let body = null;
        try {
          body = await response.json();
        } catch {
          body = await response.text();
        }

        if (response.ok) {
          console.log('✅ Sucesso!');
          return Response.json({
            sucesso: true,
            url_funcionou: url.split('?')[0],
            status: response.status,
            resposta: body
          });
        } else {
          console.log(`❌ Status ${response.status}`);
        }

      } catch (e) {
        console.log(`Erro: ${e.message}`);
      }
    }

    return Response.json({
      sucesso: false,
      erro: 'Nenhuma URL funcionou',
      urls_testadas: urls.map(u => u.split('?')[0]),
      proxima_opcao: 'Verifique EVOLUTION_API_URL e EVOLUTION_API_KEY no painel'
    }, { status: 400 });

  } catch (error) {
    return Response.json({ erro: error.message }, { status: 500 });
  }
});