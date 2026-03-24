import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";
import cheerio from "npm:cheerio@1.0.0-rc.12";

function j(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function fetchCanopus(url, cookie = "", method = "GET", body = null) {
  const headers = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "connection": "keep-alive",
  };
  if (cookie) headers["cookie"] = cookie;
  if (body) headers["content-type"] = "application/x-www-form-urlencoded";

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 20000);

  try {
    let lastErr;
    for (let i = 0; i < 3; i++) {
      try {
        const res = await fetch(url, {
          method,
          headers,
          body,
          redirect: "manual",
          signal: controller.signal,
        });
        return res;
      } catch (e) {
        lastErr = e;
        if (i < 2) await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)));
      }
    }
    throw lastErr;
  } finally {
    clearTimeout(t);
  }
}

function mergeCookies(prevCookie, setCookieHeader) {
  const jar = new Map();
  
  if (prevCookie) {
    prevCookie.split(";").forEach(kv => {
      const [k, ...v] = kv.split("=");
      if (k) jar.set(k.trim(), v.join("=").trim());
    });
  }
  
  if (setCookieHeader) {
    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    cookies.forEach(sc => {
      const part = sc.split(";")[0];
      const [k, ...v] = part.split("=");
      if (k) jar.set(k.trim(), v.join("=").trim());
    });
  }
  
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

Deno.serve(async (req) => {
  let step = "init";
  const t0 = Date.now();
  
  try {
    step = "base44_client";
    const base44 = createClientFromRequest(req);

    step = "auth";
    const user = await base44.auth.me();
    if (!user) return j(401, { error: "Unauthorized", step });

    step = "body";
    const bodyTxt = await req.text();
    const body = bodyTxt ? JSON.parse(bodyTxt) : {};
    const { id_tipo_produto = "101", permite_reserva = "N" } = body;

    step = "validate";
    if (!id_tipo_produto) return j(422, { error: "id_tipo_produto obrigatório", step });

    step = "get_empresa";
    let empresaId = user.empresa_id;
    if (!empresaId) {
      const colabs = await base44.entities.Colaborador.filter({ user_id: user.id, status: "ativo" });
      if (colabs?.length) empresaId = colabs[0].empresa_id;
    }
    if (!empresaId) return j(400, { error: "Empresa não encontrada", step });

    step = "get_credentials";
    const integs = await base44.entities.IntegracaoCanopus.filter({
      empresa_id: empresaId,
      origem: "CANOPUS",
      status: "ativo"
    });
    if (!integs?.length) return j(400, { error: "Credenciais Canopus não configuradas", step });

    const { usuario, senha, url = "https://afv.consorciocanopus.com.br/Sistema/" } = integs[0];

    let cookieJar = "";

    step = "visit_home";
    const homeRes = await fetchCanopus(url);
    cookieJar = mergeCookies(cookieJar, homeRes.headers.get("set-cookie"));

    step = "login_canopus";
    const loginBody = new URLSearchParams({ usuario, senha });
    const loginRes = await fetchCanopus(`${url}login`, cookieJar, "POST", loginBody);
    cookieJar = mergeCookies(cookieJar, loginRes.headers.get("set-cookie"));
    
    if (!cookieJar) {
      return j(400, { 
        error: "Falha no login - sem cookies", 
        step,
        status: loginRes.status,
        elapsed_ms: Date.now() - t0
      });
    }

    step = "fetch_planos";
    const planosRes = await fetchCanopus(
      `${url}planos?id_tipo_produto=${id_tipo_produto}&permite_reserva=${permite_reserva}`,
      cookieJar
    );

    if (!planosRes.ok) {
      const text = await planosRes.text();
      return j(502, {
        error: "Canopus respondeu com erro HTTP",
        step,
        http_status: planosRes.status,
        preview: text.slice(0, 500),
        elapsed_ms: Date.now() - t0,
      });
    }

    step = "parse_html";
    const html = await planosRes.text();
    const $ = cheerio.load(html);

    const planos = [];
    $("table tbody tr").each((_, row) => {
      const cols = $(row).find("td");
      if (cols.length >= 6) {
        planos.push({
          external_hash: $(cols[0]).text().trim(),
          nome: $(cols[1]).text().trim(),
          valor: parseFloat($(cols[2]).text().replace(/[^\d,]/g, "").replace(",", ".")) || 0,
          prazo: parseInt($(cols[3]).text()) || 0,
          primeira_parcela: parseFloat($(cols[4]).text().replace(/[^\d,]/g, "").replace(",", ".")) || 0,
          plano: $(cols[5]).text().trim(),
        });
      }
    });

    if (planos.length === 0) {
      return j(400, { 
        error: "Nenhum plano encontrado no HTML", 
        step, 
        preview: html.substring(0, 500),
        elapsed_ms: Date.now() - t0
      });
    }

    step = "save_db";
    let criados = 0;
    let atualizados = 0;

    for (const plano of planos) {
      const existe = await base44.entities.PlanoCanopus.filter({
        empresa_id: empresaId,
        external_hash: plano.external_hash
      });

      const data = {
        empresa_id: empresaId,
        origem: "CANOPUS",
        produto_id: id_tipo_produto,
        permite_reserva,
        external_hash: plano.external_hash,
        nome: plano.nome,
        valor: plano.valor,
        prazo: plano.prazo,
        primeira_parcela: plano.primeira_parcela,
        plano: plano.plano,
        tipo_venda: "",
        ultima_sincronizacao: new Date().toISOString(),
        status: "ativo",
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
      total: planos.length,
      elapsed_ms: Date.now() - t0
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const lower = msg.toLowerCase();

    if (lower.includes("connection reset") || lower.includes("reset by peer")) {
      return j(502, { 
        error: "Canopus rejeitou a conexão (reset by peer)", 
        step, 
        message: msg,
        elapsed_ms: Date.now() - t0
      });
    }

    if (lower.includes("aborted") || lower.includes("timeout")) {
      return j(504, { 
        error: "Timeout ao conectar no Canopus", 
        step, 
        message: msg,
        elapsed_ms: Date.now() - t0
      });
    }

    return j(500, { 
      error: "Erro interno na função", 
      step, 
      message: msg,
      elapsed_ms: Date.now() - t0
    });
  }
});