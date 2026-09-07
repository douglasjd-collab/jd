const FONTES = {
  fraga_bitello: {
    nome: "Fraga & Bitello",
    contemplados: "https://fragaebitelloconsorcios.com.br/api/json/contemplados",
    desagios: "https://fragaebitelloconsorcios.com.br/api/json/desagios",
  },
  jobs_consorcios: {
    nome: "Consórcios Digital / Jobs",
    token: "https://api.consorcios.digital/v1/token",
    cartas: "https://api.consorcios.digital/v1/jobs/vendas/cartas?adm=CI",
  },
};

const num = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const raw = (v ?? "").toString().trim().replace(/R\$|\s/g, "");
  if (!raw) return 0;
  const normalizado = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(normalizado.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const texto = (v: unknown) => (v ?? "").toString().trim();

const normalizaStatus = (v: unknown) => {
  const s = texto(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!s || s === "reservar" || s.includes("dispon")) return "disponivel";
  if (s.includes("reservad")) return "reservada";
  if (s.includes("vend")) return "vendida";
  if (s.includes("indisp")) return "indisponivel";
  return "disponivel";
};

const normalizaCarta = (item: any, origem: "contemplados" | "desagios") => ({
  id: `fraga_bitello:${origem}:${item.id}`,
  codigo: texto(item.id),
  fornecedor: "fraga_bitello",
  fornecedor_nome: "Fraga & Bitello",
  origem,
  categoria: texto(item.categoria) || "Outros",
  administradora: texto(item.administradora) || "Não informada",
  administradora_img: texto(item.administradora_img),
  valor_credito: num(item.valor_credito),
  valor_credito_original: num(item.valor_credito_original),
  entrada_api: num(item.entrada),
  entrada_sem_comissao: num(item.entrada_sem_comissao),
  percentual_comissao_entrada: 5,
  entrada: num(item.entrada_sem_comissao) > 0
    ? Math.round((num(item.entrada_sem_comissao) + num(item.valor_credito) * 0.05) * 100) / 100
    : num(item.entrada),
  parcelas: Math.max(0, Math.trunc(num(item.parcelas))),
  valor_parcela: num(item.valor_parcela),
  saldo_devedor: num(item.saldo_devedor),
  taxa_transferencia: num(item.taxa_transferencia),
  seguro: num(item.seguro),
  fundo: num(item.fundo),
  prox_reajuste: item.prox_reajuste || null,
  status: normalizaStatus(item.reserva),
  disponibilidade_original: texto(item.reserva),
  // A API F&B não fornece uma taxa percentual explícita.
  taxa: null,
});

async function carregarFragaBitello(tipo: "contemplados" | "desagios") {
  const url = FONTES.fraga_bitello[tipo];
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Fraga & Bitello respondeu HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("Resposta inválida da Fraga & Bitello");
  return data.map((item) => normalizaCarta(item, tipo));
}

let tokenJobsCache: { valor: string; expiraEm: number } | null = null;

const primeiro = (item: any, campos: string[]) => {
  for (const campo of campos) {
    let valor = item;
    for (const parte of campo.split(".")) valor = valor?.[parte];
    if (valor !== undefined && valor !== null && texto(valor) !== "") return valor;
  }
  return undefined;
};

const extrairListaJobs = (data: any): any[] | null => {
  if (Array.isArray(data)) return data;
  const candidatos = [
    data?.data, data?.cartas, data?.items, data?.results, data?.resultado, data?.dados,
    data?.data?.cartas, data?.data?.items, data?.data?.results,
  ];
  return candidatos.find(Array.isArray) || null;
};

const normalizaCartaJobs = (item: any, indice: number) => {
  const codigo = texto(primeiro(item, [
    "id", "codigo", "código", "id_carta", "idCarta", "numero", "grupo_cota",
  ])) || String(indice + 1);
  const valorCredito = num(primeiro(item, [
    "valor_credito", "valorCredito", "credito", "crédito", "valor_carta",
    "valorCarta", "credito_atual", "creditoAtual",
  ]));
  const entrada = num(primeiro(item, [
    "entrada", "valor_entrada", "valorEntrada", "lance", "agio", "ágio",
  ]));
  const taxaOriginal = primeiro(item, [
    "taxa", "taxa_percentual", "taxaPercentual", "percentual_taxa",
  ]);

  return {
    id: `jobs_consorcios:contemplados:${codigo}`,
    codigo,
    fornecedor: "jobs_consorcios",
    fornecedor_nome: FONTES.jobs_consorcios.nome,
    origem: "contemplados",
    categoria: texto(primeiro(item, [
      "categoria", "tipo", "segmento", "bem", "tipo_bem", "tipoBem",
    ])) || "Outros",
    administradora: texto(primeiro(item, [
      "administradora", "administradora_nome", "administradoraNome", "adm",
    ])) || "Consórcios Digital",
    administradora_img: texto(primeiro(item, [
      "administradora_img", "administradoraImagem", "logo", "logo_url",
    ])),
    valor_credito: valorCredito,
    valor_credito_original: num(primeiro(item, [
      "valor_credito_original", "valorCreditoOriginal", "credito_original",
    ])) || valorCredito,
    entrada_api: entrada,
    entrada_sem_comissao: entrada,
    percentual_comissao_entrada: 0,
    entrada,
    parcelas: Math.max(0, Math.trunc(num(primeiro(item, [
      "parcelas", "prazo", "parcelas_restantes", "parcelasRestantes",
      "quantidade_parcelas", "quantidadeParcelas",
    ])))),
    valor_parcela: num(primeiro(item, [
      "valor_parcela", "valorParcela", "parcela", "parcela_atual",
    ])),
    saldo_devedor: num(primeiro(item, [
      "saldo_devedor", "saldoDevedor", "saldo", "saldo_atual",
    ])),
    taxa_transferencia: num(primeiro(item, [
      "taxa_transferencia", "taxaTransferencia", "transferencia",
    ])),
    seguro: num(primeiro(item, ["seguro", "valor_seguro", "valorSeguro"])),
    fundo: num(primeiro(item, ["fundo", "fundo_reserva", "fundoReserva"])),
    prox_reajuste: primeiro(item, [
      "prox_reajuste", "proximo_reajuste", "proximoReajuste",
    ]) || null,
    status: normalizaStatus(primeiro(item, [
      "status", "situacao", "situação", "disponibilidade", "reserva",
    ])),
    disponibilidade_original: texto(primeiro(item, [
      "status", "situacao", "situação", "disponibilidade", "reserva",
    ])),
    taxa: taxaOriginal === undefined ? null : num(taxaOriginal),
  };
};

async function obterTokenJobs() {
  if (tokenJobsCache && tokenJobsCache.expiraEm > Date.now() + 30000) return tokenJobsCache.valor;

  const username = Deno.env.get("CONSORCIOS_DIGITAL_USERNAME");
  const password = Deno.env.get("CONSORCIOS_DIGITAL_PASSWORD");
  if (!username || !password) {
    throw new Error("Credenciais da Consórcios Digital não configuradas nos Secrets");
  }

  const response = await fetch(FONTES.jobs_consorcios.token, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ username, password }),
    signal: AbortSignal.timeout(15000),
  });
  const respostaTexto = await response.text();
  if (!response.ok) throw new Error(`Autenticação JOBS respondeu HTTP ${response.status}`);

  let data: any = respostaTexto;
  try { data = JSON.parse(respostaTexto); } catch { /* token em texto puro */ }
  const token = texto(
    typeof data === "string" ? data :
      data?.access_token || data?.token || data?.accessToken ||
      data?.data?.access_token || data?.data?.token,
  ).replace(/^Bearer\s+/i, "");

  if (!token) throw new Error("A autenticação JOBS não retornou um token válido");
  tokenJobsCache = { valor: token, expiraEm: Date.now() + 50 * 60 * 1000 };
  return token;
}

async function carregarJobsConsorcios() {
  const token = await obterTokenJobs();
  const response = await fetch(FONTES.jobs_consorcios.cartas, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) tokenJobsCache = null;
    throw new Error(`Consórcios Digital / JOBS respondeu HTTP ${response.status}`);
  }

  const data = await response.json().catch(() => {
    throw new Error("A Consórcios Digital / JOBS retornou uma resposta inválida");
  });
  const lista = extrairListaJobs(data);
  if (!lista) throw new Error("Formato da lista de cartas da JOBS não reconhecido");
  return lista.map(normalizaCartaJobs).filter((c) => c.valor_credito > 0);
}

const normalizaTexto = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const normalizeAdmin = (v: string) => {
  const base = normalizaTexto(v)
    .replace(/\b(consorcios?|administradora|administradora de consorcios|seguro)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const aliases: Record<string, string> = {
    "hs": "hs",
    "magalu": "magalu",
    "magazine luiza": "magalu",
    "itau": "itau",
    "bradesco": "bradesco",
    "porto": "porto",
    "racon": "racon",
    "canopus": "canopus",
    "embracon": "embracon",
  };
  return aliases[base] || base;
};

function combinarPorAdministradora(cartas: any[], maxCartas: number, alvo: number, toleranciaPct: number) {
  const disponiveis = cartas.filter((c) => c.status === "disponivel" && c.valor_credito > 0);
  const grupos = new Map<string, any[]>();

  for (const carta of disponiveis) {
    const key = normalizeAdmin(carta.administradora || "");
    if (!key) continue;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key)!.push(carta);
  }

  const tolerancia = alvo > 0 ? Math.max(alvo * (toleranciaPct / 100), 1) : Infinity;
  const min = alvo > 0 ? Math.max(0, alvo - tolerancia) : 0;
  const max = alvo > 0 ? alvo + tolerancia : Infinity;
  const resultados: any[] = [];

  const adiciona = (itens: any[]) => {
    const credito = itens.reduce((s, c) => s + c.valor_credito, 0);
    if (alvo > 0 && (credito < min || credito > max)) return;
    const taxaValores = itens.map((c) => c.taxa).filter((v) => Number.isFinite(Number(v)));
    resultados.push({
      id: itens.map((c) => c.id).join("+"),
      administradora: itens[0]?.administradora || "Não informada",
      quantidade_cartas: itens.length,
      cartas: itens,
      valor_credito: credito,
      entrada: itens.reduce((s, c) => s + c.entrada, 0),
      valor_parcela: itens.reduce((s, c) => s + c.valor_parcela, 0),
      saldo_devedor: itens.reduce((s, c) => s + Number(c.saldo_devedor || 0), 0),
      parcelas: Math.max(...itens.map((c) => c.parcelas || 0)),
      taxa: taxaValores.length === itens.length && taxaValores.length > 0
        ? taxaValores.reduce((s, v) => s + Number(v), 0) / taxaValores.length
        : null,
      diferenca_alvo: alvo > 0 ? Math.abs(credito - alvo) : 0,
    });
  };

  for (const arrOriginal of grupos.values()) {
    // Limita o conjunto por administradora aos itens mais próximos do alvo para evitar explosão combinatória.
    const arr = [...arrOriginal]
      .sort((a, b) => Math.abs(a.valor_credito - alvo) - Math.abs(b.valor_credito - alvo))
      .slice(0, 45);

    for (let i = 0; i < arr.length; i++) adiciona([arr[i]]);
    if (maxCartas >= 2) {
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) adiciona([arr[i], arr[j]]);
      }
    }
    if (maxCartas >= 3) {
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          for (let k = j + 1; k < arr.length; k++) adiciona([arr[i], arr[j], arr[k]]);
        }
      }
    }
  }

  const unicos = new Map<string, any>();
  for (const r of resultados) unicos.set(r.id, r);
  return [...unicos.values()];
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 204 });
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const tipo = body?.tipo === "desagios" ? "desagios" : "contemplados";
    const creditoDesejado = Math.max(0, num(body?.credito_desejado));
    const toleranciaPct = Math.min(50, Math.max(0, num(body?.tolerancia_percentual ?? 10)));
    const maxCartas = Math.min(3, Math.max(1, Math.trunc(num(body?.max_cartas ?? 3))));
    const categoria = texto(body?.categoria).toLowerCase();
    const administradora = texto(body?.administradora).toLowerCase();

    const statusFontes: any[] = [];
    let cartas: any[] = [];

    try {
      const fb = await carregarFragaBitello(tipo);
      cartas.push(...fb);
      statusFontes.push({ fonte: "fraga_bitello", nome: "Fraga & Bitello", status: "conectada", quantidade: fb.length });
    } catch (error) {
      statusFontes.push({ fonte: "fraga_bitello", nome: "Fraga & Bitello", status: "erro", erro: error?.message || String(error), quantidade: 0 });
    }

    // A Play Consórcios não disponibiliza API pública. Não tentamos um endpoint inexistente,
    // evitando erro falso no CRM. A próxima etapa dessa fonte deve usar integração via site
    // (ou importação estruturada), separada da integração JSON da F&B.
    statusFontes.push({
      fonte: "play_consorcios",
      nome: "Play Consórcios",
      status: "site_sem_api",
      quantidade: 0,
      detalhe: tipo === "contemplados" ? "Fonte via site — sem API pública" : "Deságios não disponíveis via API",
    });

    if (tipo === "contemplados") {
      try {
        const jobs = await carregarJobsConsorcios();
        cartas.push(...jobs);
        statusFontes.push({
          fonte: "jobs_consorcios",
          nome: FONTES.jobs_consorcios.nome,
          status: "conectada",
          quantidade: jobs.length,
        });
      } catch (error) {
        const mensagem = error?.message || String(error);
        const credenciaisPendentes = mensagem.includes("não configuradas");
        statusFontes.push({
          fonte: "jobs_consorcios",
          nome: FONTES.jobs_consorcios.nome,
          status: credenciaisPendentes ? "pendente" : "erro",
          erro: credenciaisPendentes ? undefined : mensagem,
          detalhe: mensagem,
          quantidade: 0,
        });
      }
    } else {
      statusFontes.push({
        fonte: "jobs_consorcios",
        nome: FONTES.jobs_consorcios.nome,
        status: "pendente",
        quantidade: 0,
        detalhe: "O endpoint fornecido pela JOBS contempla somente cartas contempladas",
      });
    }

    if (categoria && categoria !== "todas") {
      const cat = normalizaTexto(categoria);
      cartas = cartas.filter((c) => normalizaTexto(c.categoria || "").includes(cat));
    }
    if (administradora) {
      const adm = normalizaTexto(administradora);
      cartas = cartas.filter((c) => normalizaTexto(c.administradora || "").includes(adm));
    }

    const combinacoes = combinarPorAdministradora(cartas, maxCartas, creditoDesejado, toleranciaPct);
    const porProximidade = [...combinacoes].sort((a, b) => a.diferenca_alvo - b.diferenca_alvo || a.entrada - b.entrada);
    const porEntrada = [...combinacoes].sort((a, b) => a.entrada - b.entrada || a.diferenca_alvo - b.diferenca_alvo);
    const porParcela = [...combinacoes].sort((a, b) => a.valor_parcela - b.valor_parcela || a.diferenca_alvo - b.diferenca_alvo);
    const porMenorSaldoEntrada = [...combinacoes].sort((a, b) =>
      a.saldo_devedor - b.saldo_devedor ||
      a.entrada - b.entrada ||
      a.diferenca_alvo - b.diferenca_alvo
    );

    return Response.json({
      ok: true,
      tipo,
      atualizado_em: new Date().toISOString(),
      credito_desejado: creditoDesejado,
      tolerancia_percentual: toleranciaPct,
      total_cartas_recebidas: cartas.length,
      total_combinacoes: combinacoes.length,
      fontes: statusFontes,
      recomendacoes: {
        menor_entrada: porEntrada[0] || null,
        menor_parcela: porParcela[0] || null,
        menor_taxa: porMenorSaldoEntrada[0] || null,
        mais_proxima: porProximidade[0] || null,
      },
      resultados: porProximidade.slice(0, 150),
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
});
