import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const JD_ID = '699696c2c9f5bffc2e67402b';
  const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: JD_ID });
  const empresa = empresas?.[0];
  const evolutionUrl = empresa.evolution_url.replace(/\/$/, '');
  const evolutionKey = empresa.evolution_api_key;
  const instanceName = empresa.evolution_instance_name;

  // Testar diferentes endpoints para mensagens
  const results = {};

  // 1) findMessages
  try {
    const r = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ where: { key: { fromMe: false } }, limit: 3 })
    });
    const txt = await r.text();
    results.findMessages = { status: r.status, preview: txt.substring(0, 500) };
  } catch (e) { results.findMessages = { error: e.message }; }

  // 2) fetchMessages (alternativo)
  try {
    const r2 = await fetch(`${evolutionUrl}/message/findMessages/${instanceName}`, {
      method: 'GET',
      headers: { 'apikey': evolutionKey }
    });
    const txt2 = await r2.text();
    results.messageFind = { status: r2.status, preview: txt2.substring(0, 500) };
  } catch (e) { results.messageFind = { error: e.message }; }

  // 3) Listar chats
  try {
    const r3 = await fetch(`${evolutionUrl}/chat/findChats/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const txt3 = await r3.text();
    results.findChats = { status: r3.status, preview: txt3.substring(0, 500) };
  } catch (e) { results.findChats = { error: e.message }; }

  return Response.json(results);
});