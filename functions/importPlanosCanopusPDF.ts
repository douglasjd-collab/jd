import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function j(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  let step = "init";
  const t0 = Date.now();

  try {
    step = "auth";
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return j(401, { error: "Unauthorized", step });

    step = "get_empresa";
    let empresaId = user.empresa_id;
    if (!empresaId) {
      const colabs = await base44.entities.Colaborador.filter({ user_id: user.id, status: "ativo" });
      if (colabs?.length) empresaId = colabs[0].empresa_id;
    }
    if (!empresaId) return j(400, { error: "Empresa não encontrada", step });

    step = "parse_form";
    const formData = await req.formData();
    const file = formData.get("file");
    const produtoId = formData.get("produto_id") || "101";

    if (!file) return j(400, { error: "PDF não fornecido", step });

    step = "upload_pdf";
    const uploadRes = await base44.integrations.Core.UploadFile({ file });
    const fileUrl = uploadRes.file_url;

    step = "extract_text";
    const extractRes = await base44.integrations.Core.InvokeLLM({
      prompt: `Extraia os dados da tabela de planos de consórcio deste PDF.

FORMATO DA TABELA:
- Coluna "NOME DO BEM": Código (ex: CR4205) + descrição (ex: AUTOMÓVEL LEVE 70%)
- Coluna "VALOR": Valor do crédito em R$
- Coluna "PRAZO": Prazo em meses (ex: 96)
- Coluna "1ª PARCELA": Valor da primeira parcela em R$
- Coluna "PLANO": Código + descrição (ex: "21 - PLANO EXCLUSIVO 70%")
- Coluna "TIPO DE VENDA": Código + descrição (ex: "62 - PARCELA GRADUAL")

Para cada linha da tabela, extraia:
- codigo: código do plano (ex: CR4205, CR4072, CR4301)
- nome_bem: descrição completa do bem (ex: "AUTOMÓVEL LEVE 70%", "AUTOMÓVEL LEVE 50%")
- valor_bem: valor do crédito (apenas número, sem R$)
- prazo_meses: prazo em meses (apenas número)
- primeira_parcela: valor da primeira parcela (apenas número, sem R$)
- plano: código e descrição do plano (ex: "21 - PLANO EXCLUSIVO 70%")
- tipo_venda: código e descrição do tipo de venda (ex: "62 - PARCELA GRADUAL", "114 - LINEAR")

Retorne um array de planos no formato JSON.`,
      file_urls: [fileUrl],
      response_json_schema: {
        type: "object",
        properties: {
          planos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                codigo: { type: "string" },
                nome_bem: { type: "string" },
                valor_bem: { type: "number" },
                prazo_meses: { type: "number" },
                primeira_parcela: { type: "number" },
                plano: { type: "string" },
                tipo_venda: { type: "string" }
              },
              required: ["codigo", "nome_bem", "valor_bem", "prazo_meses", "primeira_parcela"]
            }
          }
        }
      }
    });

    const planos = extractRes.planos || [];
    if (planos.length === 0) {
      return j(400, { 
        error: "Nenhum plano encontrado no PDF", 
        step,
        elapsed_ms: Date.now() - t0
      });
    }

    step = "save_planos";
    let criados = 0;
    let atualizados = 0;

    for (const plano of planos) {
      const hash = `${plano.codigo}_${plano.prazo_meses}`;
      
      const existe = await base44.entities.PlanoCanopus.filter({
        empresa_id: empresaId,
        external_hash: hash
      });

      const data = {
        empresa_id: empresaId,
        origem: "PDF_IMPORT",
        produto_id: produtoId,
        permite_reserva: "N",
        external_hash: hash,
        nome_bem: `${plano.codigo} - ${plano.nome_bem}`,
        valor_bem: plano.valor_bem,
        prazo_meses: plano.prazo_meses,
        parcela: plano.primeira_parcela,
        plano: plano.plano || "",
        tipo_venda: plano.tipo_venda || "",
        ultima_sincronizacao: new Date().toISOString(),
        status: "ativo"
      };

      if (existe?.length) {
        await base44.entities.PlanoCanopus.update(existe[0].id, data);
        atualizados++;
      } else {
        await base44.entities.PlanoCanopus.create(data);
        criados++;
      }
    }

    return j(200, {
      ok: true,
      criados,
      atualizados,
      total_planos: planos.length,
      elapsed_ms: Date.now() - t0
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return j(500, {
      error: "Erro ao processar PDF",
      step,
      message: msg,
      elapsed_ms: Date.now() - t0
    });
  }
});