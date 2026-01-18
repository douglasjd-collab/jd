import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const empresa_id = user.empresa_id;
  if (!empresa_id) {
    return Response.json({ error: "empresa_id não encontrado" }, { status: 400 });
  }

  const regras = [
    { prazo_meses: 96, taxa_adm: 20.8 },
    { prazo_meses: 86, taxa_adm: 19.8 },
    { prazo_meses: 76, taxa_adm: 18.8 },
    { prazo_meses: 66, taxa_adm: 16.8 },
    { prazo_meses: 56, taxa_adm: 15.8 },
    { prazo_meses: 46, taxa_adm: 13.8 },
    { prazo_meses: 36, taxa_adm: 12.8 },
  ];

  let criados = 0;
  let atualizados = 0;

  for (const r of regras) {
    const filtro = await base44.asServiceRole.entities.TabelaTaxaAdm.filter({
      empresa_id,
      produto: "Automóvel",
      valor_min: 25000,
      valor_max: 50000,
      prazo_meses: r.prazo_meses,
      status: "ativo",
    });

    const payload = {
      empresa_id,
      produto: "Automóvel",
      valor_min: 25000,
      valor_max: 50000,
      prazo_meses: r.prazo_meses,
      taxa_adm: r.taxa_adm,
      status: "ativo",
      observacao: "Auto-aplicação na importação (AFV print)",
    };

    if (!filtro.length) {
      await base44.asServiceRole.entities.TabelaTaxaAdm.create(payload);
      criados++;
    } else {
      await base44.asServiceRole.entities.TabelaTaxaAdm.update(filtro[0].id, payload);
      atualizados++;
    }
  }

  return Response.json({
    success: true,
    criados,
    atualizados,
    message: `Tabela de taxa ADM (Automóvel 25–50k) pronta. Criados: ${criados}, Atualizados: ${atualizados}`,
  });
});