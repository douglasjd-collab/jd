const FONTES = {
  fraga_bitello: {
    nome: "Fraga & Bitello",
    contemplados: "https://fragaebitelloconsorcios.com.br/api/json/contemplados",
    desagios: "https://fragaebitelloconsorcios.com.br/api/json/desagios",
  },
  play_consorcios: {
    nome: "Play Consórcios",
    catalogo: "https://playconsorcios.com.br/api/public/catalog.json",
  },
};

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const texto = (v: unknown) => (v ?? "").toString().trim();

const normalizaStatus = (v: unknown) => {
  const s = texto(v).toLowerCase();
  if (!s) return "disponivel";
  if (s.includes("reserv")) return "reservada";
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
  entrada: num(item.entrada),
  parcelas: Math.max(0, Math.trunc(num(item.parcelas))),
  valor_parcela: num(item.valor_parcela),
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

const normalizaCartaPlay = (item: any) => ({
  id: `play_consorcios:contemplados:${item.id || item.codigo}`,
  codigo: texto(item.codigo || item.id),
  fornecedor: "play_consorcios",
  fornecedor_nome: "Play Consórcios",
  origem: "contemplados",
  categoria: texto(item.segmento) || "outros",
  administradora: texto(item.administradora) || "Não informada",
  administradora_img: "",
  valor_credito: num(item.credito),
  valor_credito_original: num(item.credito),
  entrada: num(item.entrada),
  parcelas: Math.max(0, Math.trunc(num(item.parcelas_qtd))),
  valor_parcela: num(item.parcela_valor),
  fundo: 0,
  prox_reajuste: null,
  status: normalizaStatus(item.status),
  disponibilidade_original: texto(item.status),
  saldo_devedor: item.saldo_devedor === null || item.saldo_devedor === undefined ? null : num(item.saldo_devedor),
  taxa_transferencia: item.taxa_transferencia === null || item.taxa_transferencia === undefined ? null : num(item.taxa_transferencia),
  taxa_analise: item.taxa_analise === null || item.taxa_analise === undefined ? null : num(item.taxa_analise),
  proximo_vencimento: item.proximo_vencimento || null,
  observacoes: texto(item.observacoes),
  tipo_carta: texto(item.tipo_carta),
  // A Play expõe taxas operacionais em valor quando disponíveis, não uma taxa percentual comparável.
  taxa: null,
});

async function carregarPlay() {
  const response = await fetch(FONTES.play_consorcios.catalogo, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Play Consórcios respondeu HTTP ${response.status}`);
  const data = await response.json();
  const cartas = Array.isArray(data) ? data : data?.cartas;
  if (!Array.isArray(cartas)) throw new Error("Resposta inválida da Play Consórcios");
  return cartas.map(normalizaCartaPlay);
}

const normalizaTexto = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const normalizeAdmin = normalizaTexto;

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

    if (tipo === "contemplados") {
      try {
        const play = await carregarPlay();
        cartas.push(...play);
        statusFontes.push({ fonte: "play_consorcios", nome: "Play Consórcios", status: "conectada", quantidade: play.length });
      } catch (error) {
        statusFontes.push({ fonte: "play_consorcios", nome: "Play Consórcios", status: "erro", erro: error?.message || String(error), quantidade: 0 });
      }
    } else {
      statusFontes.push({ fonte: "play_consorcios", nome: "Play Consórcios", status: "nao_disponivel", quantidade: 0 });
    }

    statusFontes.push({ fonte: "jobs_consorcios", nome: "Consórcios Digital / Jobs", status: "pendente", quantidade: 0 });

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
    const comTaxa = combinacoes.filter((r) => Number.isFinite(Number(r.taxa)));
    const porTaxa = [...comTaxa].sort((a, b) => a.taxa - b.taxa || a.diferenca_alvo - b.diferenca_alvo);

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
        menor_taxa: porTaxa[0] || null,
        mais_proxima: porProximidade[0] || null,
      },
      resultados: porProximidade.slice(0, 150),
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
});
