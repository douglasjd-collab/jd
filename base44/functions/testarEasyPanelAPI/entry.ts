/**
 * Testa a conexão com o EasyPanel API e lista os serviços disponíveis.
 * Use para verificar se o token e URL estão corretos.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function easypanelCall(easypanelUrl, token, procedure, input = {}) {
  const url = `${easypanelUrl.replace(/\/$/, '')}/api/trpc/${procedure}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ json: input }),
    signal: AbortSignal.timeout(10000),
  });
  const text = await resp.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (_) {}
  return { status: resp.status, ok: resp.ok, text: text.substring(0, 500), parsed };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['master', 'super_admin', 'admin'].includes(user.perfil)) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const easypanelUrl = Deno.env.get('EASYPANEL_URL');
    const easypanelToken = Deno.env.get('EASYPANEL_TOKEN');
    const easypanelProject = Deno.env.get('EASYPANEL_PROJECT');
    const easypanelService = Deno.env.get('EASYPANEL_SERVICE');

    if (!easypanelUrl || !easypanelToken) {
      return Response.json({ error: 'EASYPANEL_URL e EASYPANEL_TOKEN não configurados' }, { status: 400 });
    }

    const resultados = {
      config: { url: easypanelUrl, project: easypanelProject, service: easypanelService },
      testes: []
    };

    // Teste 1: Listar projetos
    const r1 = await easypanelCall(easypanelUrl, easypanelToken, 'projects.list', {});
    resultados.testes.push({ endpoint: 'projects.list', status: r1.status, ok: r1.ok, resposta: r1.parsed || r1.text });

    // Teste 2: Inspecionar serviço específico (se configurado)
    if (easypanelProject && easypanelService) {
      const r2 = await easypanelCall(easypanelUrl, easypanelToken, 'services.inspect', {
        projectName: easypanelProject,
        serviceName: easypanelService
      });
      resultados.testes.push({ endpoint: 'services.inspect', status: r2.status, ok: r2.ok, resposta: r2.parsed || r2.text });
    }

    // Teste 3: Verificar autenticação simples
    const r3 = await easypanelCall(easypanelUrl, easypanelToken, 'auth.me', {});
    resultados.testes.push({ endpoint: 'auth.me', status: r3.status, ok: r3.ok, resposta: r3.parsed || r3.text });

    return Response.json(resultados);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});