import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const evolutionUrl = 'https://jdpromotora.0ntuaf.easypanel.host';

  // Keys específicas de cada instância (do banco)
  const instancias = [
    { nome: 'JDPROMOTORA', key: '72F05FA223C5-437A-B07B-31CEE2921192' },
    { nome: 'LOTUS',       key: 'B81529F5C201-4489-B118-F10F5A0671A2' },
    { nome: 'WAZECRM',     key: Deno.env.get('EVOLUTION_API_KEY') || '' },
  ];
  const resultados = [];

  for (const { nome, key } of instancias) {
    try {
      const res = await fetch(`${evolutionUrl}/webhook/find/${nome}`, {
        headers: { 'apikey': key }
      });
      const data = await res.json();
      resultados.push({
        instancia: nome,
        status: res.status,
        webhook_url: data?.url || data?.webhook?.url || null,
        events: data?.events || data?.webhook?.events || [],
        enabled: data?.enabled ?? data?.webhook?.enabled ?? null,
        raw: data
      });
    } catch (e) {
      resultados.push({ instancia: nome, erro: e.message });
    }
  }

  return Response.json({ resultados });
});