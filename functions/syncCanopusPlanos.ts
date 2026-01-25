import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function firstCookiePart(setCookie) {
  // "NAME=VALUE; Path=/; ..." -> "NAME=VALUE"
  return setCookie.split(";")[0]?.trim();
}

function getSetCookies(resp) {
  // Deno/Fetch nem sempre expõe getSetCookie() em todos ambientes,
  // então coletamos manualmente.
  const cookies = [];
  for (const [k, v] of resp.headers.entries()) {
    if (k.toLowerCase() === "set-cookie" && v) cookies.push(v);
  }
  // alguns runtimes juntam múltiplos cookies em uma string — tenta separar com cuidado
  if (cookies.length === 0) {
    const sc = resp.headers.get("set-cookie");
    if (sc) cookies.push(sc);
  }
  return cookies;
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function extractHidden(html, name) {
  // procura <input ... name="as_sfid" value="...">
  const re = new RegExp(
    `name=["']${name}["'][^>]*value=["']([^"']+)["']`,
    "i",
  );
  const m = html.match(re);
  return m?.[1] ?? null;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Permissão (evita 403 em entidades sensíveis)
  const me = await base44.auth.me();
  if (!me || !["admin", "super_admin", "master"].includes(me.perfil)) {
    return Response.json({ error: "Acesso negado." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const id_tipo_produto = String(body?.id_tipo_produto ?? "101"); // 101 = automóveis (exemplo)
  const permite_reserva = String(body?.permite_reserva ?? "N");   // N = sem reserva, S = com reserva
  const start = String(body?.start ?? "0");
  const length = String(body?.length ?? "200"); // puxa mais por chamada

  const user = Deno.env.get("CANOPUS_USER");
  const pass = Deno.env.get("CANOPUS_PASS");
  if (!user || !pass) {
    return Response.json(
      { error: "Secrets CANOPUS_USER/CANOPUS_PASS não configurados." },
      { status: 500 },
    );
  }

  // 1) GET login page para capturar tokens hidden as_sfid/as_fid
  const loginPageUrl = "https://afv.consorciocanopus.com.br/Sistema/";
  const r0 = await fetch(loginPageUrl, { method: "GET" });
  const html = await r0.text();

  const as_sfid = extractHidden(html, "as_sfid");
  const as_fid = extractHidden(html, "as_fid");

  if (!as_sfid || !as_fid) {
    return Response.json(
      {
        error: "Não consegui localizar as_sfid/as_fid na página de login.",
        hint: "Pode ter mudado o HTML do AFV. Me envie um print do HTML (só a parte do form) se acontecer.",
      },
      { status: 500 },
    );
  }

  // cookies iniciais (se houver)
  const c0 = getSetCookies(r0).map(firstCookiePart).filter(Boolean);

  // 2) POST login
  const form = new URLSearchParams();
  form.set("login", user);
  form.set("senha", pass);
  form.set("as_sfid", as_sfid);
  form.set("as_fid", as_fid);

  const r1 = await fetch(loginPageUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "origin": "https://afv.consorciocanopus.com.br",
      "referer": loginPageUrl,
      ...(c0.length ? { cookie: c0.join("; ") } : {}),
    },
    body: form.toString(),
    redirect: "manual", // normalmente volta 302 -> timeline/timeline
  });

  const c1 = getSetCookies(r1).map(firstCookiePart).filter(Boolean);
  const cookieJar = [...c0, ...c1].filter(Boolean);

  // Se vier 302, segue o Location pra "assentar" a sessão
  const loc = r1.headers.get("location");
  if (loc) {
    const timelineUrl = new URL(loc, loginPageUrl).toString();
    const r2 = await fetch(timelineUrl, {
      method: "GET",
      headers: {
        cookie: cookieJar.join("; "),
        referer: loginPageUrl,
      },
    });
    const c2 = getSetCookies(r2).map(firstCookiePart).filter(Boolean);
    cookieJar.push(...c2);
  }

  // 3) Buscar planos (endpoint que você capturou)
  const planosUrl = new URL(
    "https://afv.consorciocanopus.com.br/Sistema/planos/acoes/datatable_reload_planos.php",
  );

  // DataTables (mínimo necessário)
  planosUrl.searchParams.set("checkbox", "false");
  planosUrl.searchParams.set("draw", "1");
  planosUrl.searchParams.set("start", start);
  planosUrl.searchParams.set("length", length);
  planosUrl.searchParams.set("search[value]", "");
  planosUrl.searchParams.set("search[regex]", "false");
  planosUrl.searchParams.set("order[0][column]", "2");
  planosUrl.searchParams.set("order[0][dir]", "asc");

  for (let i = 0; i <= 7; i++) {
    planosUrl.searchParams.set(`columns[${i}][data]`, String(i));
    planosUrl.searchParams.set(`columns[${i}][name]`, "");
    planosUrl.searchParams.set(`columns[${i}][searchable]`, "true");
    planosUrl.searchParams.set(`columns[${i}][orderable]`, i === 7 ? "false" : "true");
    planosUrl.searchParams.set(`columns[${i}][search][value]`, "");
    planosUrl.searchParams.set(`columns[${i}][search][regex]`, "false");
  }

  // Filtros AFV
  planosUrl.searchParams.set("id_tipo_produto", id_tipo_produto);
  planosUrl.searchParams.set("valor_bem_parcela", "bem");
  planosUrl.searchParams.set("valor_minimo", "");
  planosUrl.searchParams.set("valor_maximo", "");
  planosUrl.searchParams.set("id_marca", "");
  planosUrl.searchParams.set("id_modelo", "");
  planosUrl.searchParams.set("reajuste", "IPCA");
  planosUrl.searchParams.set("permite_reserva", permite_reserva);
  planosUrl.searchParams.set("select_grupos", "");

  const rPlanos = await fetch(planosUrl.toString(), {
    method: "GET",
    headers: {
      "accept": "application/json, text/javascript, */*; q=0.01",
      "x-requested-with": "XMLHttpRequest",
      "referer": "https://afv.consorciocanopus.com.br/Sistema/planos/listagem_planos.php",
      cookie: cookieJar.join("; "),
    },
  });

  if (!rPlanos.ok) {
    const t = await rPlanos.text().catch(() => "");
    return Response.json(
      { error: "Falha ao buscar planos", status: rPlanos.status, body: t.slice(0, 500) },
      { status: 500 },
    );
  }

  const json = await rPlanos.json();
  const rows = Array.isArray(json?.data) ? json.data : [];

  // 4) Salvar no Base44 (upsert por external_hash)
  const empresa_id = me.empresa_id;
  let created = 0;
  let updated = 0;

  for (const r of rows) {
    const external_hash = r[0];
    const nome = r[1];
    const valor = toNumber(r[2]);
    const prazo = toNumber(r[3]);
    const primeira_parcela = toNumber(r[4]);
    const plano = r[5];
    const tipo_venda = r[6];

    const payload = {
      empresa_id,
      external_hash,
      produto_id: id_tipo_produto,
      permite_reserva,
      nome,
      valor,
      prazo,
      primeira_parcela,
      plano,
      tipo_venda,
      raw: JSON.stringify(r),
    };

    const existing = await base44.asServiceRole.entities.CanopusPlanos.filter({
      empresa_id,
      external_hash,
    });

    if (existing.length > 0) {
      await base44.asServiceRole.entities.CanopusPlanos.update(existing[0].id, payload);
      updated++;
    } else {
      await base44.asServiceRole.entities.CanopusPlanos.create(payload);
      created++;
    }
  }

  return Response.json({
    ok: true,
    produto_id: id_tipo_produto,
    permite_reserva,
    total: rows.length,
    created,
    updated,
  });
});