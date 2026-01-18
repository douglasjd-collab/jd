import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Descobrir empresa_id
    let empresaId = user.empresa_id;
    if (!empresaId) {
      const colabs = await base44.asServiceRole.entities.Colaborador.filter({
        user_id: user.id,
        status: "ativo",
      });
      if (colabs?.length) empresaId = colabs[0].empresa_id;
    }

    const diagnostico = {
      user_id: user.id,
      user_role: user.role,
      empresaId,
      timestamp: new Date().toISOString(),
      checks: {},
    };

    // Check 1: empresa_id existe?
    diagnostico.checks.empresa_id = !!empresaId;

    if (!empresaId) {
      return Response.json({
        error: "empresa_id não encontrado",
        diagnostico,
      }, { status: 400 });
    }

    // Check 2: IntegracaoCanopus existe?
    const integracoes = await base44.asServiceRole.entities.IntegracaoCanopus.filter({
      empresa_id: empresaId,
      origem: "CANOPUS",
      status: "ativo",
    });

    diagnostico.checks.integracao_existe = integracoes?.length > 0;
    diagnostico.integracao_count = integracoes?.length || 0;

    if (!integracoes?.length) {
      return Response.json({
        error: "Integração Canopus não configurada",
        diagnostico,
        hint: "Vá em Configurações → Integração Canopus e salve as credenciais",
      }, { status: 400 });
    }

    const integracao = integracoes[0];

    // Check 3: Credenciais preenchidas?
    diagnostico.checks.usuario = !!integracao.usuario;
    diagnostico.checks.senha = !!integracao.senha;
    diagnostico.checks.url = !!integracao.url;

    if (!integracao.usuario || !integracao.senha) {
      return Response.json({
        error: "Credenciais Canopus incompletas",
        diagnostico,
        hint: "Preencha USUÁRIO e SENHA na Integração Canopus",
      }, { status: 400 });
    }

    return Response.json({
      success: true,
      message: "Tudo OK para sincronizar!",
      diagnostico,
    });
  } catch (error) {
    return Response.json(
      { error: error?.message || String(error) },
      { status: 500 }
    );
  }
});