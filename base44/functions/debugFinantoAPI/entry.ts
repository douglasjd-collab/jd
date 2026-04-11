import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function extrairBaseUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    
    const isAdmin = ['admin', 'gerente', 'master', 'super_admin'].includes(user.perfil || user.role);
    if (!isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { url } = body;

    if (!url) return Response.json({ error: 'URL obrigatória' }, { status: 400 });

    const token = Deno.env.get('AJIN_API_KEY') || '';
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (token) {
      headers['apikey'] = token;
    }

    console.log(`[DEBUG] GET ${url}`);
    console.log(`[DEBUG] Headers:`, JSON.stringify(headers));

    const res = await fetch(url, { method: 'GET', headers });
    
    console.log(`[DEBUG] HTTP Status: ${res.status}`);
    console.log(`[DEBUG] Content-Type: ${res.headers.get('content-type')}`);

    let data;
    const texto = await res.text();

    try {
      data = JSON.parse(texto);
    } catch (e) {
      return Response.json({
        success: false,
        status: res.status,
        erro: 'Resposta não é JSON válido',
        resposta_tipo: res.headers.get('content-type'),
        resposta_primeiros_500_chars: texto.substring(0, 500),
      });
    }

    console.log(`[DEBUG] Response:`, JSON.stringify(data).substring(0, 1000));

    const chaves = Object.keys(data || {});
    const estrutura = {};
    
    for (const chave of chaves) {
      const valor = data[chave];
      if (Array.isArray(valor)) {
        estrutura[chave] = `Array[${valor.length}]`;
        if (valor.length > 0) {
          estrutura[`${chave}_primeiro_item`] = Object.keys(valor[0]);
        }
      } else if (typeof valor === 'object' && valor !== null) {
        estrutura[chave] = `Object{${Object.keys(valor).join(',')}}`;
      } else {
        estrutura[chave] = typeof valor;
      }
    }

    return Response.json({
      success: true,
      status: res.status,
      estrutura_resposta: estrutura,
      chaves_totais: chaves,
      resposta_completa_json: JSON.stringify(data),
      tamanho_bytes: texto.length,
    });

  } catch (e) {
    console.error(`[DEBUG] Erro:`, e.message);
    return Response.json({ 
      success: false, 
      error: e.message
    }, { status: 500 });
  }
});