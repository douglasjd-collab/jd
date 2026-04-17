import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const payload = await req.json().catch(() => ({}));
  const keyTeste = payload.key || Deno.env.get('EVOLUTION_API_KEY');
  const baseUrl = 'https://jdpromotora.0ntuaf.easypanel.host';
  const instanceName = 'LOTUS';

  const resultados = {};

  // Testar a key em diferentes endpoints
  const endpoints = [
    `/instance/connectionState/${instanceName}`,
    `/instance/fetchInstances`,
    `/webhook/find/${instanceName}`,
  ];

  for (const ep of endpoints) {
    const r = await fetch(`${baseUrl}${ep}`, {
      headers: { 'apikey': keyTeste }
    });
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text.substring(0, 200); }
    resultados[ep] = { status: r.status, ok: r.ok, body };
  }

  // Também tentar com a key da empresa LOTUS no banco
  const empresa = await base44.asServiceRole.entities.Empresa.get('698379444cac84bdec53ea61');
  const keyEmpresa = empresa?.evolution_api_key;

  const resultadosEmpresa = {};
  for (const ep of endpoints) {
    const r = await fetch(`${baseUrl}${ep}`, {
      headers: { 'apikey': keyEmpresa }
    });
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text.substring(0, 200); }
    resultadosEmpresa[ep] = { status: r.status, ok: r.ok, body };
  }

  return Response.json({
    key_testada: keyTeste ? keyTeste.substring(0, 8) + '...' : 'nenhuma',
    key_empresa: keyEmpresa ? keyEmpresa.substring(0, 8) + '...' : 'nenhuma',
    resultados_key_testada: resultados,
    resultados_key_empresa: resultadosEmpresa,
  });
});