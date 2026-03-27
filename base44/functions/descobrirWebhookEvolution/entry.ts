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

    console.log('🔍 Descobrindo endpoint correto de webhook...');

    // Muitas variações de endpoints possíveis
    const endpoints = [
      { path: `/webhook/save/${INSTANCE_NAME}`, method: 'POST', desc: 'webhook/save com instance' },
      { path: `/webhook`, method: 'POST', desc: 'webhook simples' },
      { path: `/instance/${INSTANCE_NAME}/webhook`, method: 'POST', desc: 'instance/webhook' },
      { path: `/webhooks/${INSTANCE_NAME}`, method: 'POST', desc: 'webhooks com instance' },
      { path: `/webhook/set`, method: 'POST', desc: 'webhook/set sem instance' },
      { path: `/message/webhook`, method: 'POST', desc: 'message/webhook' },
    ];

    const payload = {
      url: WEBHOOK_URL,
      events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE']
    };

    const resultados = {};

    for (const ep of endpoints) {
      const url = `${baseUrl}${ep.path}?apikey=${EVOLUTION_API_KEY}`;
      try {
        console.log(`\n📡 Testando: ${ep.desc}`);
        console.log(`   URL: ${ep.path}`);
        
        const response = await fetch(url, {
          method: ep.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        let body = null;
        try {
          body = await response.json();
        } catch {
          body = await response.text();
        }

        resultados[ep.desc] = {
          status: response.status,
          ok: response.ok,
          body: body
        };

        if (response.ok) {
          console.log('✅ SUCESSO!');
          return Response.json({
            sucesso: true,
            endpoint: ep.desc,
            path: ep.path,
            status: response.status,
            resposta: body
          });
        }

      } catch (e) {
        resultados[ep.desc] = { erro: e.message };
      }
    }

    return Response.json({
      sucesso: false,
      mensagem: 'Nenhum endpoint funcionou - veja resultados abaixo',
      resultados: resultados,
      sugestao: 'Verifique EVOLUTION_API_URL ou contate suporte da Evolution API'
    }, { status: 400 });

  } catch (error) {
    return Response.json({ erro: error.message }, { status: 500 });
  }
});