import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const baseUrl = 'https://jdpromotora.0ntuaf.easypanel.host';
  const globalKey = '72F05FA223C5-437A-B07B-31CEE2921192'; // key que funciona

  // Listar todas instâncias
  const r = await fetch(`${baseUrl}/instance/fetchInstances`, {
    headers: { 'apikey': globalKey }
  });
  const instancias = await r.json();

  // Para cada instância, pegar o token dela
  const resultado = Array.isArray(instancias) ? instancias.map(i => ({
    nome: i.name,
    status: i.connectionStatus,
    token: i.token,
    ownerJid: i.ownerJid,
  })) : instancias;

  return Response.json({ total: Array.isArray(instancias) ? instancias.length : 0, instancias: resultado });
});