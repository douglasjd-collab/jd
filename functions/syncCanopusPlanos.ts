import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";
import cheerio from "npm:cheerio@1.0.0-rc.12";

// Retry com backoff exponencial
async function fetchRetry(url, opts, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, opts);
      return r;
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) {
        await new Promise(res => setTimeout(res, 500 * Math.pow(2, i)));
      }
    }
  }
  throw lastErr;
}

// Merge cookies manualmente
function mergeCookies(prevCookie, setCookieHeader) {
  const jar = new Map();
  
  // Cookies anteriores
  if (prevCookie) {
    prevCookie.split(";").forEach(kv => {
      const [k, ...v] = kv.split("=");
      if (k) jar.set(k.trim(), v.join("=").trim());
    });
  }
  
  // Novos cookies
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
  
  try {
    step = "auth";
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: "Usuário não autenticado" }, { status: 401 });
    }

    step = "read_body";
    const body = await req.json().catch(() => ({}));
    const { id_tipo_produto = "101", permite_reserva = "N" } = body;

    // Buscar empresa_id
    step = "get_empresa";
    let empresaId = user.empresa_id;
    if (!empresaId) {
      const colabs = await base44.entities.Colaborador.filter({ user_id: user.id, status: "ativo" });
      if (colabs?.length) empresaId = colabs[0].empresa_id;
    }

    if (!empresaId) {
      return Response.json({ error: "Empresa não encontrada" }, { status: 400 });
    }

    // Buscar credenciais
    step = "get_credentials";
    const integs = await base44.entities.IntegracaoCanopus.filter({
      empresa_id: empresaId,
      origem: "CANOPUS",
      status: "ativo"
    });

    if (!integs?.length) {
      return Response.json({ error: "Credenciais Canopus não configuradas" }, { status: 400 });
    }

    const { usuario, senha, url = "https://afv.consorciocanopus.com.br/Sistema/" } = integs[0];

    // Headers realistas
    const browserHeaders = {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      "accept-encoding": "gzip, deflate, br",
      "connection": "keep-alive",
    };

    let cookieJar = "";

    // Passo 1: Visitar página inicial para pegar cookies iniciais
    step = "visit_home";
    const homeRes = await fetchRetry(url, {
      headers: browserHeaders,
      redirect: "manual",
    });
    cookieJar = mergeCookies(cookieJar, homeRes.headers.get("set-cookie"));

    // Passo 2: Login no Canopus
    step = "login_canopus";
    const loginRes = await fetchRetry(`${url}login`, {
      method: "POST",
      headers: {
        ...browserHeaders,
        "content-type": "application/x-www-form-urlencoded",
        "referer": url,
        "origin": url.replace(/\/$/, ""),
        "cookie": cookieJar,
      },
      body: new URLSearchParams({
        usuario,
        senha,
      }),
      redirect: "manual",
    });

    cookieJar = mergeCookies(cookieJar, loginRes.headers.get("set-cookie"));
    
    if (!cookieJar) {
      return Response.json({ 
        error: "Falha no login - sem cookies", 
        status: loginRes.status,
        headers: Object.fromEntries(loginRes.headers.entries())
      }, { status: 400 });
    }

    // Passo 3: Buscar planos
    step = "fetch_planos";
    const planosRes = await fetchRetry(
      `${url}planos?id_tipo_produto=${id_tipo_produto}&permite_reserva=${permite_reserva}`,
      {
        headers: {
          ...browserHeaders,
          "cookie": cookieJar,
          "referer": `${url}login`,
        },
      }
    );

    if (!planosRes.ok) {
      return Response.json({ error: `Erro ao buscar planos: ${planosRes.status}` }, { status: 400 });
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
      return Response.json({ error: "Nenhum plano encontrado no HTML", avisoHTML: html.substring(0, 500) }, { status: 400 });
    }

    // Salvar no banco
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

    return Response.json({ 
      ok: true, 
      criados, 
      atualizados,
      total: planos.length 
    });

  } catch (e) {
    console.error(`[syncCanopusPlanos] Erro no step: ${step}`, e);
    return Response.json({
      error: "crash",
      step,
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : null,
    }, { status: 500 });
  }
});