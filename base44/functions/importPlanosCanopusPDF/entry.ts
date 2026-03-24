import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "*";
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json",
  };

  // Handle preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Headers": "content-type, authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  const t0 = Date.now();

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    // ✅ Role robusta
    const rawRole = (user.perfil ?? user.role ?? user.papel ?? "").toString();
    const userRole = rawRole.trim().toLowerCase();

    // ✅ Permissões aceitas
    const allowed = ["super_admin", "master", "admin", "gerente"];
    if (!allowed.includes(userRole)) {
      return Response.json(
        { error: "Forbidden: Requires admin or manager access", debug_role: rawRole },
        { status: 403, headers: corsHeaders }
      );
    }

    // ✅ super_admin/master = distribui para todas as empresas
    const isDistributor = ["super_admin", "master"].includes(userRole);

    // ✅ Ler body
    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "JSON inválido", step: "parse_body" }, { status: 400, headers: corsHeaders });
    }

    const file_url = body?.file_url;
    const produto_id = (body?.produto_id ?? "101").toString().trim();

    if (!file_url) {
      return Response.json({ error: "file_url é obrigatório", step: "validate_input" }, { status: 400, headers: corsHeaders });
    }

    // ✅ Definir empresas alvo
    let empresasAlvo = [];

    if (isDistributor) {
      // 🔥 Distribui para todas as empresas ativas
      const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
      empresasAlvo = (empresas ?? []).map(e => ({ id: e.id, nome: e.nome }));

      // Se não houver empresas, permitir importação sem empresa (para super_admin)
      if (empresasAlvo.length === 0) {
        empresasAlvo = [{ id: "sem_empresa", nome: "Sem Empresa (Global)" }];
      }
    } else {
      // Usuário comum: exige empresa
      let empresaId = user.empresa_id ?? user.empresaId ?? user.empresa ?? null;
      
      if (!empresaId) {
        const colabs = await base44.asServiceRole.entities.Colaborador.filter({ user_id: user.id, status: "ativo" });
        if (colabs?.length) empresaId = colabs[0].empresa_id;
      }

      if (!empresaId) {
        return Response.json(
          { error: "Empresa não encontrada", step: "get_empresa", debug_role: rawRole },
          { status: 400, headers: corsHeaders }
        );
      }

      const empresa = await base44.asServiceRole.entities.Empresa.get(empresaId);
      if (!empresa) {
        return Response.json(
          { error: "Empresa não encontrada", step: "get_empresa", debug_empresaId: empresaId },
          { status: 400, headers: corsHeaders }
        );
      }

      empresasAlvo = [{ id: empresaId, nome: empresa.nome }];
    }

    // ✅ 1) Extrair planos do PDF
    const extractRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Extraia TODOS os dados da tabela de planos de consórcio deste PDF.

IMPORTANTE: Ao clicar em cada linha da tabela, aparecem MÚLTIPLAS OPÇÕES de prazo e parcela para o mesmo bem.
Exemplo: CR4072 pode ter opções de 96, 86, 76, 66, 56, 46 e 36 meses com parcelas diferentes.

VOCÊ DEVE EXTRAIR TODAS AS VARIAÇÕES DE PRAZO/PARCELA PARA CADA BEM!

FORMATO DA TABELA:
- Linha principal: Código (ex: CR4205) + Descrição (ex: AUTOMÓVEL LEVE 70%) + Valor do crédito
- Ao expandir: Múltiplas opções com formato "Plano de X meses / 1ª parcela de R$ Y,YY | Grupo: ZZZZZ"
- TAXA DE ADMINISTRAÇÃO: Está na coluna "TAXA ADM. MENSAL" da tabela expandida, geralmente aparece como percentual (ex: "18.20 %", "17.00 %", "16.50 %")

Para cada VARIAÇÃO de prazo/parcela, extraia um registro separado:
- codigo: código do plano (ex: CR4205, CR4072, CR4301)
- nome_bem: descrição do bem (ex: "AUTOMÓVEL LEVE 70%", "AUTOMÓVEL LEVE 50%")
- valor_bem: valor do crédito (apenas número, sem R$)
- prazo_meses: prazo em meses (ex: 96, 86, 76, 66, 56, 46, 36)
- primeira_parcela: valor da primeira parcela (apenas número, sem R$)
- taxa_adm: taxa de administração em percentual EXTRAÍDA DA COLUNA "TAXA ADM. MENSAL" (apenas número, ex: 18.20 para 18.20%, 20.8 para 20.8%). OBRIGATÓRIO!
- grupo: código do grupo (ex: "008120", "8.320")
- plano: código e descrição do plano da linha principal (ex: "3000 - GRUPO 3000 PARTICIPANTES", "Grupo: 8.320")
- tipo_venda: código e descrição do tipo de venda (ex: "114 - LINEAR", "62 - PARCELA GRADUAL")

ATENÇÃO ESPECIAL PARA TAXA DE ADMINISTRAÇÃO:
- A taxa ADM está na tabela expandida, geralmente na coluna ao lado das parcelas
- Pode aparecer como "18.20 %", "17.00 %", etc.
- Extraia APENAS o número (ex: 18.20, 17.00, 16.50)
- Se a taxa for "Total" seguida de percentual (ex: "Total 18.20 %"), pegue o número do percentual
- SEMPRE extraia esta informação quando disponível na tabela

EXEMPLO de saída esperada para CR4072 com valor R$ 25.000,00 e taxa ADM 18.20%:
[
  { codigo: "CR4072", nome_bem: "AUTOMÓVEL LEVE", valor_bem: 25000, prazo_meses: 96, primeira_parcela: 326.78, taxa_adm: 18.20, grupo: "008120", ... },
  { codigo: "CR4072", nome_bem: "AUTOMÓVEL LEVE", valor_bem: 25000, prazo_meses: 86, primeira_parcela: 360.35, taxa_adm: 17.00, grupo: "008120", ... },
  { codigo: "CR4072", nome_bem: "AUTOMÓVEL LEVE", valor_bem: 25000, prazo_meses: 76, primeira_parcela: 402.80, taxa_adm: 16.50, grupo: "008120", ... },
  ... (todas as variações)
]

Retorne um array de planos no formato JSON com TODAS as variações e suas respectivas taxas de administração.`,
      file_urls: [file_url],
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
                taxa_adm: { type: "number" },
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

    const planosBase = extractRes.planos || [];
    if (planosBase.length === 0) {
      return Response.json(
        { error: "Nenhum plano encontrado no PDF", step: "parse_pdf", elapsed_ms: Date.now() - t0 },
        { status: 400, headers: corsHeaders }
      );
    }

    // ✅ 2) Replicar / Upsert por (empresa_id + external_hash) - OTIMIZADO
    const Plan = base44.asServiceRole.entities.PlanoCanopus;

    let criados = 0;
    let atualizados = 0;
    const erros = [];

    for (const emp of empresasAlvo) {
      try {
        // Buscar TODOS os planos existentes da empresa de uma vez
        const existentes = await Plan.filter({ empresa_id: emp.id });
        const existentesMap = new Map();
        existentes.forEach(p => {
          if (p.external_hash) existentesMap.set(p.external_hash, p);
        });

        const planosParaCriar = [];
        const planosParaAtualizar = [];

        // Preparar dados para operações em lote
        for (const plano of planosBase) {
          const external_hash = `${plano.codigo}_${plano.prazo_meses}`;
          const existente = existentesMap.get(external_hash);

          const payload = {
            empresa_id: emp.id,
            origem: "PDF_IMPORT",
            produto_id,
            permite_reserva: "N",
            external_hash,
            nome_bem: `${plano.codigo} - ${plano.nome_bem}`,
            valor_bem: plano.valor_bem,
            prazo_meses: plano.prazo_meses,
            parcela: plano.primeira_parcela,
            taxa_adm: plano.taxa_adm || null,
            plano: `${plano.grupo || ""} | ${plano.plano || ""}`.trim(),
            tipo_venda: plano.tipo_venda || "",
            ultima_sincronizacao: new Date().toISOString(),
            status: "ativo"
          };

          if (existente) {
            planosParaAtualizar.push({ id: existente.id, ...payload });
          } else {
            planosParaCriar.push(payload);
          }
        }

        // Operações em lote
        if (planosParaCriar.length > 0) {
          await Plan.bulkCreate(planosParaCriar);
          criados += planosParaCriar.length;
        }

        if (planosParaAtualizar.length > 0) {
          // Atualizar em paralelo (mais rápido que sequencial)
          await Promise.all(
            planosParaAtualizar.map(p => Plan.update(p.id, p))
          );
          atualizados += planosParaAtualizar.length;
        }
      } catch (e) {
        erros.push({
          empresa_id: emp.id,
          error: e?.message ?? String(e),
          detalhes: "Erro na operação em lote"
        });
      }
    }

    return Response.json({
      sucesso: true,
      role: userRole,
      modo: isDistributor ? "distribuir_todas_empresas" : "somente_minha_empresa",
      empresas_alvo: empresasAlvo.length,
      total_planos: planosBase.length,
      criados,
      atualizados,
      erros,
      message: isDistributor 
        ? `Distribuição concluída: ${criados} criados, ${atualizados} atualizados em ${empresasAlvo.length} empresa(s)`
        : `Importação concluída: ${criados} criados, ${atualizados} atualizados`,
      elapsed_ms: Date.now() - t0
    }, { headers: corsHeaders });

  } catch (error) {
    return Response.json(
      { error: error?.message ?? String(error), elapsed_ms: Date.now() - t0 },
      { status: 500, headers: corsHeaders }
    );
  }
});