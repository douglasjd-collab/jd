import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import * as cheerio from "npm:cheerio@1.0.0-rc.12";

function j(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

// Gerenciador de cookies simples e robusto (sem tough-cookie)
function createCookieJar() {
  const jar = new Map();

  function setCookiesFromHeader(setCookieHeader) {
    if (!setCookieHeader) return;
    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    for (const sc of cookies) {
      const part = sc.split(";")[0].trim();
      const eq = part.indexOf("=");
      if (eq < 0) continue;
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (name) jar.set(name, value);
    }
  }

  function getCookieString() {
    return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }

  return { setCookiesFromHeader, getCookieString };
}

// Fetch com retry (502/503/504 ou timeout)
async function fetchWithRetry(url, init = {}, maxRetries = 3) {
  let lastErr;
  for (let i = 0; i < maxRetries; i++) {
    if (i > 0) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i - 1)));
      console.log(`[Canopus Sync] Tentativa ${i + 1} de ${maxRetries} para: ${url}`);
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60000); // 60s timeout
      try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        if ([502, 503, 504].includes(res.status) && i < maxRetries - 1) {
          console.log(`[Canopus Sync] Recebido ${res.status}, aguardando para retry...`);
          lastErr = new Error(`HTTP ${res.status}`);
          continue;
        }
        return res;
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      lastErr = e;
      if (e.name === "AbortError") {
        lastErr = new Error("Timeout de 60s ao conectar na Canopus");
      }
      console.log(`[Canopus Sync] Erro na tentativa ${i + 1}: ${lastErr.message}`);
    }
  }
  throw lastErr;
}

function isLoginPage(html) {
  const h = (html || "").toLowerCase();
  return (
    h.includes('name="login"') ||
    h.includes("name='login'") ||
    h.includes("validar_login") ||
    h.includes("tela de login") ||
    (h.includes("senha") && h.includes("usuário") && !h.includes("plano"))
  );
}

function isCaptchaPage(html) {
  const h = (html || "").toLowerCase();
  return h.includes("captcha") || h.includes("recaptcha") || h.includes("g-recaptcha");
}

function moneyToNumber(v) {
  const s = (v || "")
    .replace("R$", "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  let step = "init";

  try {
    console.log("[Canopus Sync] Iniciando sincronização");

    step = "auth";
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return j(401, { error: "Não autenticado" });

    const isAdmin = ["admin", "super_admin", "master"].includes(user.role) ||
      ["admin", "super_admin", "master"].includes(user.perfil);
    if (!isAdmin) return j(403, { error: "Acesso restrito a administradores" });

    step = "body";
    let bodyData = {};
    try {
      const txt = await req.text();
      if (txt) bodyData = JSON.parse(txt);
    } catch (_) {}
    const { id_tipo_produto = "101", permite_reserva = "N" } = bodyData;

    // --- empresa_id ---
    step = "get_empresa";
    let empresaId = user.empresa_id;
    if (!empresaId) {
      const colabs = await base44.asServiceRole.entities.Colaborador.filter({ user_id: user.id, status: "ativo" });
      if (colabs?.length) empresaId = colabs[0].empresa_id;
    }
    if (!empresaId) return j(400, { error: "Empresa não encontrada" });

    // --- credenciais ---
    step = "get_credentials";
    console.log("[Canopus Sync] Buscando credenciais da empresa");

    const integs = await base44.asServiceRole.entities.IntegracaoCanopus.filter({
      empresa_id: empresaId,
      origem: "CANOPUS",
      status: "ativo",
    });

    if (!integs?.length) {
      return j(400, { error: "Credenciais da Canopus não configuradas.", step });
    }

    const { usuario, senha, url: configUrl } = integs[0];

    if (!usuario || !senha) {
      return j(400, { error: "Credenciais da Canopus não configuradas. Informe usuário e senha.", step });
    }

    const baseUrl = (configUrl || "https://afv.consorciocanopus.com.br/Sistema/").replace(/\/?$/, "/");
    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

    const cookies = createCookieJar();

    // --- 1) Acesso inicial para pegar cookies de sessão ---
    step = "visit_home";
    console.log("[Canopus Sync] Acessando tela de login");

    const homeRes = await fetchWithRetry(baseUrl, {
      method: "GET",
      headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8", "Accept-Language": "pt-BR,pt;q=0.9" },
      redirect: "follow",
    });

    cookies.setCookiesFromHeader(homeRes.headers.getSetCookie ? homeRes.headers.getSetCookie() : homeRes.headers.get("set-cookie"));
    const homeHtml = await homeRes.text();

    // --- 2) Extrair CSRF token se houver ---
    step = "csrf";
    let csrfToken = null;
    const $ = cheerio.load(homeHtml);

    const csrfInput = $('input[name="_token"], input[name="csrf_token"], input[name="token"], input[name="_csrf"]').first();
    if (csrfInput.length) {
      csrfToken = csrfInput.attr("value") || null;
    }

    if (csrfToken) {
      console.log("[Canopus Sync] CSRF token encontrado");
    } else {
      console.log("[Canopus Sync] CSRF token não utilizado");
    }

    // --- 3) Login ---
    step = "login";
    console.log("[Canopus Sync] Enviando login");

    const loginParams = new URLSearchParams({ login: String(usuario), senha: String(senha) });
    if (csrfToken) loginParams.set("_token", csrfToken);

    const loginUrl = baseUrl + "validar_login.php";
    const loginRes = await fetchWithRetry(loginUrl, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Referer": baseUrl,
        "Origin": new URL(baseUrl).origin,
        "Cookie": cookies.getCookieString(),
      },
      body: loginParams.toString(),
      redirect: "follow",
    });

    cookies.setCookiesFromHeader(loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : loginRes.headers.get("set-cookie"));
    const loginHtml = await loginRes.text();

    if (isCaptchaPage(loginHtml)) {
      return j(400, { error: "A sincronização automática foi bloqueada por verificação de segurança/captcha.", step });
    }

    if (isLoginPage(loginHtml)) {
      console.log("[Canopus Sync] Erro detalhado: retornou tela de login após POST");
      return j(400, {
        error: "Não foi possível acessar a Canopus. Verifique usuário e senha.",
        step,
        hint: "O sistema retornou a tela de login. Verifique as credenciais na configuração.",
      });
    }

    if (!cookies.getCookieString()) {
      return j(400, { error: "Sessão Canopus não foi mantida. Verificar cookies, CSRF ou redirecionamento.", step });
    }

    console.log("[Canopus Sync] Login realizado com sucesso");

    // --- 4) Buscar planos ---
    step = "fetch_planos";
    console.log("[Canopus Sync] Buscando planos disponíveis");

    const planosUrl = `${baseUrl}planos/listagem_planos.php`;
    const planosRes = await fetchWithRetry(planosUrl, {
      method: "GET",
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Referer": baseUrl,
        "Cookie": cookies.getCookieString(),
      },
      redirect: "follow",
    });

    if ([502, 503, 504].includes(planosRes.status)) {
      return j(502, {
        error: "A Canopus não respondeu corretamente no momento. Tente novamente ou verifique se o portal está disponível.",
        step,
        http_status: planosRes.status,
      });
    }

    const planosHtml = await planosRes.text();
    console.log("[Canopus Sync] HTML/JSON recebido");

    if (isCaptchaPage(planosHtml)) {
      return j(400, { error: "A sincronização automática foi bloqueada por verificação de segurança/captcha.", step });
    }

    if (isLoginPage(planosHtml)) {
      return j(400, {
        error: "Sessão Canopus não foi mantida. Verificar cookies, CSRF ou redirecionamento.",
        step,
      });
    }

    // --- 5) Parse do HTML ---
    step = "parse";
    const $p = cheerio.load(planosHtml);
    const planos = [];

    let rows = $p("#table_planos tbody tr");
    if (!rows.length) rows = $p("table tbody tr");

    rows.each((_, tr) => {
      const tds = $p(tr).find("td");
      if (tds.length < 5) return;

      const nome_bem = $p(tds[0]).text().trim();
      if (!nome_bem) return;

      const valor_bem = moneyToNumber($p(tds[1]).text().trim());
      const prazo_meses = parseInt($p(tds[2]).text().trim()) || 0;
      const parcela = moneyToNumber($p(tds[3]).text().trim());
      const plano = $p(tds[4]).text().trim();
      const tipo_venda = tds.length > 5 ? $p(tds[5]).text().trim() : "";
      const taxa_adm = tds.length > 6 ? moneyToNumber($p(tds[6]).text().trim()) : 0;

      const external_hash = `${empresaId}|${id_tipo_produto}|${permite_reserva}|${nome_bem}|${prazo_meses}|${plano}|${tipo_venda}`;

      planos.push({ nome_bem, valor_bem, prazo_meses, parcela, plano, tipo_venda, taxa_adm, external_hash });
    });

    console.log(`[Canopus Sync] Planos extraídos: ${planos.length}`);

    if (planos.length === 0) {
      return j(400, {
        error: "Nenhum plano encontrado na página. A estrutura HTML pode ter mudado ou não há planos disponíveis.",
        step,
        preview: planosHtml.slice(0, 800),
      });
    }

    // --- 6) Salvar no banco ---
    step = "save";
    let criados = 0;
    let atualizados = 0;

    for (const p of planos) {
      const existentes = await base44.asServiceRole.entities.PlanoCanopus.filter({
        empresa_id: empresaId,
        external_hash: p.external_hash,
      });

      const dados = {
        empresa_id: empresaId,
        origem: "CANOPUS",
        produto_id: id_tipo_produto,
        permite_reserva,
        external_hash: p.external_hash,
        nome_bem: p.nome_bem,
        valor_bem: p.valor_bem,
        prazo_meses: p.prazo_meses,
        parcela: p.parcela,
        plano: p.plano,
        tipo_venda: p.tipo_venda,
        taxa_adm: p.taxa_adm,
        status: "ativo",
        ultima_sincronizacao: new Date().toISOString(),
      };

      if (existentes?.length) {
        await base44.asServiceRole.entities.PlanoCanopus.update(existentes[0].id, dados);
        atualizados++;
      } else {
        await base44.asServiceRole.entities.PlanoCanopus.create(dados);
        criados++;
      }
    }

    console.log(`[Canopus Sync] Planos criados: ${criados}`);
    console.log(`[Canopus Sync] Planos atualizados: ${atualizados}`);
    console.log(`[Canopus Sync] Sincronização finalizada em ${Date.now() - t0}ms`);

    return j(200, {
      ok: true,
      criados,
      atualizados,
      total: planos.length,
      elapsed_ms: Date.now() - t0,
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const lower = msg.toLowerCase();

    console.error(`[Canopus Sync] Erro detalhado - step: ${step} | ${msg}`);

    if (lower.includes("502") || lower.includes("bad gateway")) {
      return j(502, { error: "A Canopus não respondeu corretamente no momento. Tente novamente ou verifique se o portal está disponível.", step, message: msg, elapsed_ms: Date.now() - t0 });
    }
    if (lower.includes("timeout") || lower.includes("aborted") || lower.includes("abort")) {
      return j(504, { error: "Timeout ao conectar na Canopus. O portal pode estar lento. Tente novamente.", step, message: msg, elapsed_ms: Date.now() - t0 });
    }
    if (lower.includes("connection reset") || lower.includes("econnreset")) {
      return j(502, { error: "A Canopus não respondeu corretamente no momento. Tente novamente ou verifique se o portal está disponível.", step, message: msg, elapsed_ms: Date.now() - t0 });
    }

    return j(500, { error: "Erro interno na sincronização. Tente novamente.", step, message: msg, elapsed_ms: Date.now() - t0 });
  }
});