import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function extractHidden(html: string, name: string): string | null {
  const re1 = new RegExp(`name=["']${name}["'][^>]*value=["']([^"']+)["']`, "i");
  const re2 = new RegExp(`value=["']([^"']+)["'][^>]*name=["']${name}["']`, "i");
  return html.match(re1)?.[1] ?? html.match(re2)?.[1] ?? null;
}

function toNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  let step = "start";
  try {
    step = "auth.me";
    const me = await base44.auth.me();
    if (!me || !["admin", "super_admin", "master"].includes(me.perfil)) {
      return Response.json({ ok: false, step, error: "Acesso negado." }, { status: 403 });
    }

    step = "read.body";
    const body = await req.json().catch(() => ({}));
    const id_tipo_produto = String(body?.id_tipo_produto ?? "101");
    const permite_reserva = String(body?.permite_reserva ?? "N");
    const start = String(body?.start ?? "0");
    const length = String(body?.length ?? "200");

    step = "env.secrets";
    const user = Deno.env.get("CANOPUS_USER");
    const pass = Deno.env.get("CANOPUS_PASS");
    if (!user || !pass) {
      return Response.json(
        { ok: false, step, error: "Secrets CANOPUS_USER/CANOPUS_PASS não configurados neste ambiente." },
        { status: 500 },
      );
    }

    step = "fetch.login.get";
    const loginUrl = "https://afv.consorciocanopus.com.br/Sistema/";
    const r0 = await fetch(loginUrl, { method: "GET" });
    const html = await r0.text();

    step = "extract.tokens";
    const as_sfid = extractHidden(html, "as_sfid");
    const as_fid = extractHidden(html, "as_fid");
    if (!as_sfid || !as_fid) {
      return Response.json(
        { ok: false, step, error: "Não achei as_sfid/as_fid no HTML do login.", html_head: html.slice(0, 1000) },
        { status: 500 },
      );
    }

    step = "fetch.login.post";
    const form = new URLSearchParams();
    form.set("login", user);
    form.set("senha", pass);
    form.set("as_sfid", as_sfid);
    form.set("as_fid", as_fid);

    const r1 = await fetch(loginUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "origin": "https://afv.consorciocanopus.com.br",
        "referer": loginUrl,
      },
      body: form.toString(),
      redirect: "manual",
    });

    // ⚠️ Alguns runtimes não expõem Set-Cookie. Então vamos usar cookie de fallback temporário.
    // Crie um secret CANOPUS_COOKIE_FALLBACK com pelo menos AFVCanopus=...
    step = "cookie.fallback";
    const cookie = Deno.env.get("CANOPUS_COOKIE_FALLBACK");
    if (!cookie) {
      return Response.json(
        { ok: false, step, error: "Crie o secret CANOPUS_COOKIE_FALLBACK (ex.: AFVCanopus=...)." },
        { status: 500 },
      );
    }

    step = "fetch.planos";
    const planosUrl = new URL("https://afv.consorciocanopus.com.br/Sistema/planos/acoes/datatable_reload_planos.php");
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
        "cookie": cookie,
      },
    });

    const planosText = await rPlanos.text();
    step = "parse.planos";
    let parsed: any;
    try {
      parsed = JSON.parse(planosText);
    } catch {
      return Response.json(
        { ok: false, step, error: "Planos não retornou JSON (provável HTML/login).", body_head: planosText.slice(0, 500) },
        { status: 500 },
      );
    }

    const rows = Array.isArray(parsed?.data) ? parsed.data : [];
    step = "save.base44";

    // ⚠️ Aqui costuma quebrar se a entidade tiver outro nome, ou schema diferente.
    const empresa_id = me.empresa_id;
    let saved = 0;

    for (const r of rows) {
      const payload = {
        empresa_id,
        external_hash: r[0],
        produto_id: id_tipo_produto,
        permite_reserva,
        nome: r[1],
        valor: toNumber(r[2]),
        prazo: toNumber(r[3]),
        primeira_parcela: toNumber(r[4]),
        plano: r[5],
        tipo_venda: r[6],
      };

      // tente findMany (mais compatível)
      const list = await base44.entities.CanopusPlanos.findMany({
        filter: { empresa_id, external_hash: r[0] },
        limit: 1,
      });
      const existing = Array.isArray(list) ? list[0] : (list?.items?.[0] ?? null);

      if (existing?.id) await base44.entities.CanopusPlanos.update(existing.id, payload);
      else await base44.entities.CanopusPlanos.create(payload);

      saved++;
    }

    return Response.json({ ok: true, step: "done", total: rows.length, saved }, { status: 200 });
  } catch (e: any) {
    return Response.json(
      { ok: false, step, error: String(e?.message ?? e), stack: String(e?.stack ?? "") },
      { status: 500 },
    );
  }
});