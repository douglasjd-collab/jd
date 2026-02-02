import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function normalizeStr(v) {
  return (v ?? "").toString().trim().toLowerCase();
}

function buildReplicaKey(data) {
  const parts = [
    normalizeStr(data.titulo),
    normalizeStr(data.categoria),
    normalizeStr(data.status),
    Number(data.valor_credito || 0).toFixed(2),
    Number(data.parcela || 0).toFixed(2),
    Number(data.entrada || 0).toFixed(2),
    Number(data.parcelas_total || 0),
    Number(data.comissao_percentual || 0),
  ];
  return parts.join("|");
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const rawRole = (user.perfil ?? user.role ?? "").toString();
    const role = rawRole.trim().toLowerCase();

    if (!["super_admin", "master"].includes(role)) {
      return Response.json(
        { error: "Forbidden", step: "permission", debug_role: rawRole },
        { status: 403 }
      );
    }

    const body = await req.json();
    const data = body?.data;

    if (!data) {
      return Response.json({ error: "Payload inválido", step: "validate_payload" }, { status: 400 });
    }

    if (!data.titulo || !String(data.titulo).trim()) {
      return Response.json({ error: "Título é obrigatório", step: "validate_fields" }, { status: 400 });
    }

    const comissao = Number(data.comissao_percentual ?? 1);
    if (comissao < 1 || comissao > 5) {
      return Response.json({ error: "Comissão deve ser entre 1 e 5", step: "validate_fields" }, { status: 400 });
    }

    const empresas = await base44.asServiceRole.entities.Empresa.list();
    if (!Array.isArray(empresas) || empresas.length === 0) {
      return Response.json({ error: "Nenhuma empresa encontrada", step: "get_empresas" }, { status: 400 });
    }

    const replica_key = buildReplicaKey(data);

    let criados = 0;
    let atualizados = 0;

    const created_ids = [];
    const updated_ids = [];
    const erros = [];

    for (const emp of empresas) {
      try {
        const existentes = await base44.asServiceRole.entities.CartaContemplada.filter({
          empresa_id: emp.id,
          replica_key,
        });

        const existente = Array.isArray(existentes) ? existentes[0] : null;

        const payload = {
          ...data,
          empresa_id: emp.id,
          replica_key,
          fonte: data.fonte ?? "manual",
          criado_por_user_id: user.id ?? null,
          criado_em: new Date().toISOString(),
        };

        if (existente?.id) {
          await base44.asServiceRole.entities.CartaContemplada.update(existente.id, payload);
          atualizados++;
          updated_ids.push(existente.id);
        } else {
          const created = await base44.asServiceRole.entities.CartaContemplada.create(payload);
          criados++;
          if (created?.id) created_ids.push(created.id);
        }
      } catch (e) {
        erros.push({
          empresa_id: emp.id,
          empresa_nome: emp.nome ?? null,
          error: e?.message ?? String(e),
        });
      }
    }

    return Response.json({
      ok: true,
      replica_key,
      replicado_para: empresas.length,
      criados,
      atualizados,
      created_ids,
      updated_ids,
      erros,
    });
  } catch (e) {
    return Response.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
});