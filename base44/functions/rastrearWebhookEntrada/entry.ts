import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Webhook que rastreia TUDO o que entra, sem processar
Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = new URL(req.url);
  const path = url.pathname;
  const query = url.search;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`[${timestamp}] WEBHOOK RASTREADOR ATIVADO`);
  console.log(`METHOD: ${method}`);
  console.log(`PATH: ${path}`);
  console.log(`QUERY: ${query}`);
  console.log(`${'='.repeat(80)}`);

  try {
    // Capturar headers
    const headers = {};
    for (const [key, value] of req.headers.entries()) {
      headers[key] = value;
    }
    console.log('\n[HEADERS]');
    console.log(JSON.stringify(headers, null, 2));

    // Capturar body
    let body = null;
    let bodyText = '';
    try {
      bodyText = await req.clone().text();
      if (bodyText) {
        try {
          body = JSON.parse(bodyText);
        } catch {
          body = bodyText;
        }
      }
    } catch (e) {
      console.log('[ERRO ao ler body]:', e.message);
    }

    console.log('\n[BODY]');
    if (body) {
      console.log(JSON.stringify(body, null, 2));
    } else {
      console.log('(vazio)');
    }

    // Salvar registro no banco
    try {
      const base44 = createClientFromRequest(req);
      
      // Criar um log genérico na entidade apropriada se existir
      // Ou apenas logar localmente
      console.log('\n[TENTANDO SALVAR NO BANCO]');
      const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' }, null, 1);
      if (empresas && empresas.length > 0) {
        const empresaId = empresas[0].id;
        
        // Tentar criar um registro de log
        try {
          await base44.asServiceRole.entities.LogRecebimentoWebhook.create({
            empresa_id: empresaId,
            timestamp: timestamp,
            method: method,
            path: path,
            query: query,
            headers_json: JSON.stringify(headers),
            body_json: JSON.stringify(body || {}),
            event_type: body?.event || 'unknown',
          });
          console.log('✅ Log salvo no banco com sucesso');
        } catch (e) {
          console.log('⚠️ Erro ao salvar log:', e.message);
        }
      }
    } catch (e) {
      console.log('⚠️ Erro ao acessar banco:', e.message);
    }

    console.log(`\n${'='.repeat(80)}\n`);

    return Response.json({
      success: true,
      message: 'Webhook rastreado com sucesso',
      timestamp: timestamp,
      eventType: body?.event || 'unknown',
    });

  } catch (error) {
    console.error('[ERRO CRÍTICO]:', error.message);
    return Response.json({
      error: error.message,
    }, { status: 500 });
  }
});