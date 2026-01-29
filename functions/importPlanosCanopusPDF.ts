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

    step = "parse_body";
    const body = await req.json();
    const { file_url, produto_id = "101" } = body;

    if (!file_url) return j(400, { error: "URL do arquivo não fornecida", step });

    const produtoId = produto_id;
    const fileUrl = file_url;

    step = "extract_text";
    const extractRes = await base44.integrations.Core.InvokeLLM({
      prompt: `Extraia TODOS os dados da tabela de planos de consórcio deste PDF.

IMPORTANTE: Ao clicar em cada linha da tabela, aparecem MÚLTIPLAS OPÇÕES de prazo e parcela para o mesmo bem.
Exemplo: CR4072 pode ter opções de 96, 86, 76, 66, 56, 46 e 36 meses com parcelas diferentes.

VOCÊ DEVE EXTRAIR TODAS AS VARIAÇÕES DE PRAZO/PARCELA PARA CADA BEM!

FORMATO DA TABELA:
- Linha principal: Código (ex: CR4205) + Descrição (ex: AUTOMÓVEL LEVE 70%) + Valor do crédito
- Ao expandir: Múltiplas opções com formato "Plano de X meses / 1ª parcela de R$ Y,YY | Grupo: ZZZZZ"

Para cada VARIAÇÃO de prazo/parcela, extraia um registro separado:
- codigo: código do plano (ex: CR4205, CR4072, CR4301)
- nome_bem: descrição do bem (ex: "AUTOMÓVEL LEVE 70%", "AUTOMÓVEL LEVE 50%")
- valor_bem: valor do crédito (apenas número, sem R$)
- prazo_meses: prazo em meses (ex: 96, 86, 76, 66, 56, 46, 36)
- primeira_parcela: valor da primeira parcela (apenas número, sem R$)
- grupo: código do grupo (ex: "008120")
- plano: código e descrição do plano da linha principal (ex: "3000 - GRUPO 3000 PARTICIPANTES")
- tipo_venda: código e descrição do tipo de venda (ex: "114 - LINEAR", "62 - PARCELA GRADUAL")

EXEMPLO de saída esperada para CR4072 com valor R$ 25.000,00:
[
  { codigo: "CR4072", nome_bem: "AUTOMÓVEL LEVE", valor_bem: 25000, prazo_meses: 96, primeira_parcela: 326.78, grupo: "008120", ... },
  { codigo: "CR4072", nome_bem: "AUTOMÓVEL LEVE", valor_bem: 25000, prazo_meses: 86, primeira_parcela: 360.35, grupo: "008120", ... },
  { codigo: "CR4072", nome_bem: "AUTOMÓVEL LEVE", valor_bem: 25000, prazo_meses: 76, primeira_parcela: 402.80, grupo: "008120", ... },
  ... (todas as variações)
]

Retorne um array de planos no formato JSON com TODAS as variações.`,
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
                grupo: { type: "string" },
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
        plano: `${plano.grupo || ""} | ${plano.plano || ""}`.trim(),
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