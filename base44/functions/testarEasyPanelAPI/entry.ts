/**
 * Testa a conexão com o EasyPanel API e inspeciona o serviço configurado.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function epGet(baseUrl, token, path, queryInput = null) {
  let url = `${baseUrl.replace(/\/$/, '')}${path}`;
  if (queryInput !== null) {
    url += `?input=${encodeURIComponent(JSON.stringify(queryInput))}`;
  }
  const resp = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    signal: AbortSignal.timeout(10000),
  });
  const text = await resp.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (_) {}
  return { status: resp.status, ok: resp.ok, parsed, text: text.substring(0, 600) };
}

async function epPost(baseUrl, token, path, body) {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify({ json: body }),
    signal: AbortSignal.timeout(10000),
  });
  const text = await resp.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (_) {}
  return { status: resp.status, ok: resp.ok, parsed, text: text.substring(0, 600) };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const url = Deno.env.get('EASYPANEL_URL');
    const token = Deno.env.get('EASYPANEL_TOKEN');
    const project = Deno.env.get('EASYPANEL_PROJECT');
    const service = Deno.env.get('EASYPANEL_SERVICE');

    if (!url || !token) {
      return Response.json({ error: 'EASYPANEL_URL e EASYPANEL_TOKEN não configurados' }, { status: 400 });
    }

    const testes = [];

    // Teste 1: getUser
    const r1 = await epGet(url, token, '/api/trpc/auth.getUser', { json: null });
    testes.push({ endpoint: 'auth.getUser', ...r1 });

    // Teste 2: listar projetos
    const r2 = await epGet(url, token, '/api/trpc/projects.listProjects', { json: null });
    testes.push({ endpoint: 'projects.listProjects', ...r2 });

    // Teste 3: inspecionar serviço app (GET com query)
    if (project && service) {
      const r3 = await epGet(url, token, '/api/trpc/services.app.inspectService', {
        input: { json: { projectName: project, serviceName: service } }
      });
      testes.push({ endpoint: 'services.app.inspectService', ...r3 });
    }

    return Response.json({ config: { url, project, service }, testes });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});