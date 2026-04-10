import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    
    const isAdmin = ['admin', 'gerente', 'master', 'super_admin'].includes(user.perfil || user.role);
    if (!isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { configuracao_id } = body;

    const configs = await base44.asServiceRole.entities.ConfiguracaoApiBanco.filter({ id: configuracao_id });
    if (!configs || configs.length === 0) return Response.json({ error: 'Configuração não encontrada' }, { status: 404 });
    
    const config = configs[0];
    const baseUrl = new URL(config.base_url).origin;
    const finantoToken = Deno.env.get('FINANTOBANK_ACCESS_TOKEN') || '';

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${finantoToken}`,
    };

    const urls = [
      `${baseUrl}/loans`,
      `${baseUrl}/propostas`,
      `${baseUrl}/proposals`,
      config.propostas_url
    ].filter(Boolean);

    const results = {};

    for (const url of urls) {
      try {
        console.log(`[DEBUG] Testando: ${url}`);
        const res = await fetch(url, { method: 'GET', headers });
        const data = await res.json();
        
        results[url] = {
          status: res.status,
          contentType: res.headers.get('content-type'),
          responseKeys: typeof data === 'object' ? Object.keys(data).slice(0, 20) : 'não-é-objeto',
          responseSize: JSON.stringify(data).length,
          primeiros100Chars: JSON.stringify(data).slice(0, 100),
          isArray: Array.isArray(data),
          temData: !!data.data,
          temItems: !!data.items,
          temContent: !!data.content,
          temLoans: !!data.loans,
          temPropostas: !!data.propostas,
          temResult: !!data.result,
        };

        // Se for array
        if (Array.isArray(data)) {
          results[url].arrayLength = data.length;
          if (data.length > 0) {
            results[url].primeiroItemKeys = Object.keys(data[0]).slice(0, 15);
          }
        }
      } catch (e) {
        results[url] = { error: e.message };
      }
    }

    return Response.json({
      config_id: config.id,
      base_url: baseUrl,
      tem_token: !!finantoToken,
      resultados: results,
    });
  } catch (e) {
    console.error('[DEBUG] Erro:', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
});