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
    const WEBHOOK_URL = 'https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp';

    console.log('✅ Autenticação funcionou! Testando endpoints de webhook...');

    // Endpoints para tentar registrar webhook
    const endpoints = [
      `/instance/${INSTANCE_NAME}/webhook`,
      `/webhook/${INSTANCE_NAME}`,
      `/webhook`,
      `/instance/webhook`,
    ];

    const payload = {
      url: WEBHOOK_URL,
      events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE']
    };

    const resultados = {};

    for (const ep of endpoints) {
      const url = baseUrl + ep;
      try {
        console.log(`\n📡 Testando: ${ep}`);
        
        const response = await fetch(url, {
          method: 'POST',
          headers: { 
            'apikey': EVOLUTION_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        let body = null;
        try {
          body = await response.json();
        } catch {
          body = await response.text();
        }

        resultados[ep] = {
          status: response.status,
          ok: response.ok,
          body: body
        };

        if (response.ok || response.status === 201) {
          console.log(`✅ SUCESSO! Status ${response.status}`);
          return Response.json({
            sucesso: true,
            endpoint: ep,
            status: response.status,
            resposta: body,
            webhook_url: WEBHOOK_URL
          });
        } else {
          console.log(`❌ Status ${response.status}`);
        }

      } catch (e) {
        resultados[ep] = { erro: e.message };
      }
    }

    return Response.json({
      sucesso: false,
      mensagem: 'Todos endpoints testados - nenhum retornou sucesso',
      resultados: resultados,
      dica: 'Verifique a resposta acima ou tente registrar manualmente no painel da Evolution API'
    }, { status: 400 });

  } catch (error) {
    return Response.json({ erro: error.message }, { status: 500 });
  }
});