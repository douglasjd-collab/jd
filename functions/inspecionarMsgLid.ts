import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const JD_ID = '699696c2c9f5bffc2e67402b';

  const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: JD_ID });
  const empresa = empresas?.[0];
  const evolutionUrl = empresa.evolution_url.replace(/\/$/, '');
  const evolutionKey = empresa.evolution_api_key;
  const instanceName = empresa.evolution_instance_name;

  // Buscar mensagens com @lid
  const res = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
    method: 'POST',
    headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ where: { key: { remoteJid: '123248767422595@lid' } }, limit: 3 })
  });
  const data = await res.json();
  const msgs = Array.isArray(data) ? data : (data.messages?.records || data.messages || []);

  // Retornar TUDO sem filtrar para ver campos disponíveis
  return Response.json({
    total: msgs.length,
    msgs_completas: msgs.slice(0, 2) // 2 primeiras completas
  });
});