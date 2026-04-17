import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const globalKey = Deno.env.get('EVOLUTION_API_KEY') || '';
  const evolutionUrl = 'https://jdpromotora.0ntuaf.easypanel.host';

  const instancias = ['JDPROMOTORA', 'LOTUS', 'WAZECRM'];
  const resultados = [];

  for (const inst of instancias) {
    try {
      const res = await fetch(`${evolutionUrl}/webhook/find/${inst}`, {
        headers: { 'apikey': globalKey }
      });
      const data = await res.json();
      resultados.push({
        instancia: inst,
        status: res.status,
        webhook_url: data?.url || data?.webhook?.url || null,
        events: data?.events || data?.webhook?.events || [],
        enabled: data?.enabled ?? data?.webhook?.enabled ?? null,
        raw: data
      });
    } catch (e) {
      resultados.push({ instancia: inst, erro: e.message });
    }
  }

  return Response.json({ resultados, globalKey: globalKey ? '✅ definida' : '❌ vazia' });
});