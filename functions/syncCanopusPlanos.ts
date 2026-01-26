import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";
import cheerio from "npm:cheerio@1.0.0-rc.12";

function extractHidden(html: string, name: string): string | null {
  const re1 = new RegExp(`name=["']${name}["'][^>]*value=["']([^"']+)["']`, "i");
  const re2 = new RegExp(`value=["']([^"']+)["'][^>]*name=["']${name}["']`, "i");
  return html.match(re1)?.[1] ?? html.match(re2)?.[1] ?? null;
}

function splitSetCookie(sc: string): string[] {
  return sc.split(/,(?=\s*[A-Za-z0-9_\-]+=)/g).map(s => s.trim()).filter(Boolean);
}

function cookieKV(setCookieLine: string): string {
  return setCookieLine.split(";")[0].trim();
}

function toNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
  let step = "init";

  try {
    step = "base44_client";
    const base44 = createClientFromRequest(req);

    step = "auth_me";
    const me = await base44.auth.me();
    if (!me) {
      return Response.json({ error: "Unauthorized", step }, { status: 401 });
    }

    step = "check_admin_role";
    const perfil = (me as any).perfil ?? (me as any).role ?? "";
    if (!["admin", "super_admin", "master"].includes(perfil)) {
      return Response.json(
        { error: "Acesso negado. Apenas admin.", perfil, step },
        { status: 403 }
      );
    }

    step = "parse_body";
    const body = await req.json().catch(() => ({}));
    const id_tipo_produto = String(body?.id_tipo_produto ?? "101");
    const permite_reserva = String(body?.permite_reserva ?? "N");
    const start = String(body?.start ?? "0");
    const length = String(body?.length ?? "200");

    step = "get_empresa_id";
    let empresaId = (me as any).empresa_id;
    if (!empresaId) {
      const colabsRes = await base44.asServiceRole.entities.Colaborador.list({
        filter: { user_id: (me as any).id, status: "ativo" },
        limit: 1,
      });
      const colabs = Array.isArray(colabsRes) ? colabsRes : (colabsRes?.items ?? []);
      if (colabs?.length) empresaId = colabs[0].empresa_id;
    }
    if (!empresaId) {
      return Response.json(
        { error: "empresa_id não encontrado. Vincule o usuário a uma empresa.", step },
        { status: 400 }
      );
    }

    step = "get_integracao_canopus";
    const integRes = await base44.asServiceRole.entities.IntegracaoCanopus.list({
      filter: { empresa_id: empresaId, origem: "CANOPUS", status: "ativo" },
      limit: 1,
    });
    const integracoes = Array.isArray(integRes) ? integRes : (integRes?.items ?? []);
    if (!integracoes?.length) {
      return Response.json(
        { error: "Integração Canopus não configurada (sem credenciais ativas).", step },
        { status: 400 }
      );
    }

    const integracao = integracoes[0];
    const baseUrl = String(integracao.url || "https://afv.consorciocanopus.com.br/Sistema/").replace(/\/+$/, "/");
    const usuario = integracao.usuario;
    const senha = integracao.senha;

    if (!usuario || !senha) {
      return Response.json(
        { error: "Credenciais Canopus incompletas. Preencha usuário e senha na Integração.", step },
        { status: 400 }
      );
    }

    // ---- LOGIN ----
    step = "fetch_login_page";
    const r0 = await fetch(baseUrl, { method: "GET" });
    const html0 = await r0.text();

    step = "extract_tokens";
    const as_sfid = extractHidden(html0, "as_sfid");
    const as_fid = extractHidden(html0, "as_fid");

    if (!as_sfid || !as_fid) {
      return Response.json({
        error: "Não consegui localizar as_sfid/as_fid no HTML do login.",
        step,
        html_preview: html0.slice(0, 800),
      }, { status: 500 });
    }

    step = "collect_initial_cookies";
    const jar: string[] = [];
    const sc0 = r0.headers.get("set-cookie");
    if (sc0) splitSetCookie(sc0).forEach(c => jar.push(cookieKV(c)));

    step = "post_login";
    const form = new URLSearchParams();
    form.set("login", String(usuario));
    form.set("senha", String(senha));
    form.set("as_sfid", as_sfid);
    form.set("as_fid", as_fid);

    const r1 = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "origin": "https://afv.consorciocanopus.com.br",
        "referer": baseUrl,
        ...(jar.length ? { cookie: jar.join("; ") } : {}),
      },
      body: form.toString(),
      redirect: "manual",
    });

    step = "collect_login_cookies";
    const sc1 = r1.headers.get("set-cookie");
    if (sc1) splitSetCookie(sc1).forEach(c => jar.push(cookieKV(c)));

    step = "follow_redirect";
    const loc = r1.headers.get("location");
    if (loc) {
      const timelineUrl = new URL(loc, baseUrl).toString();
      const r2 = await fetch(timelineUrl, {
        method: "GET",
        headers: { cookie: jar.join("; "), referer: baseUrl },
      });
      const sc2 = r2.headers.get("set-cookie");
      if (sc2) splitSetCookie(sc2).forEach(c => jar.push(cookieKV(c)));
    }

    step = "validate_session_cookie";
    if (!jar.join("; ").includes("AFVCanopus=")) {
      return Response.json({
        error: "Login não gerou cookie AFVCanopus (sessão não foi criada).",
        step,
        hint: "Pode haver validação extra/bloqueio. Teste login manual e confirme que não há CAPTCHA/2FA.",
      }, { status: 400 });
    }

    // ---- FETCH PLANOS ----
    step = "build_planos_url";
    const planosUrl = new URL(baseUrl + "planos/acoes/datatable_reload_planos.php");

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

    step = "fetch_planos";
    const rPlanos = await fetch(planosUrl.toString(), {
      method: "GET",
      headers: {
        "accept": "application/json, text/javascript, */*; q=0.01",
        "x-requested-with": "XMLHttpRequest",
        "referer": baseUrl + "planos/listagem_planos.php",
        "cookie": jar.join("; "),
      },
    });

    step = "read_planos_response";
    const text = await rPlanos.text();
    const status = rPlanos.status;
    const contentType = rPlanos.headers.get("content-type") || "";

    if (!rPlanos.ok) {
      return Response.json({
        error: "Falha ao buscar planos",
        step,
        http_status: status,
        contentType,
        body_preview: text.slice(0, 800),
      }, { status: 502 });
    }

    step = "parse_planos_json";
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return Response.json({
        error: "Retorno dos planos não é JSON (provável HTML/login).",
        step,
        contentType,
        body_preview: text.slice(0, 1200),
      }, { status: 422 });
    }

    step = "extract_rows";
    const rows = Array.isArray(parsed?.data) ? parsed.data : [];
    if (!rows.length) {
      return Response.json({
        success: true,
        lidos: 0,
        criados: 0,
        atualizados: 0,
        message: "0 planos retornados.",
        step,
        elapsed_ms: Date.now() - startedAt,
      });
    }

    // ---- UPSERT NO BASE44 ----
    step = "save_to_base44";
    let criados = 0;
    let atualizados = 0;

    for (const r of rows) {
      const external_hash = String(r[0]);
      const dados = {
        empresa_id: empresaId,
        origem: "CANOPUS",
        produto_id: id_tipo_produto,
        permite_reserva,
        external_hash,
        nome_bem: String(r[1] ?? ""),
        valor_bem: toNumber(r[2]),
        prazo_meses: toNumber(r[3]),
        parcela: toNumber(r[4]),
        plano: String(r[5] ?? ""),
        tipo_venda: String(r[6] ?? ""),
        status: "ativo",
        ultima_sincronizacao: new Date().toISOString(),
      };

      const existingRes = await base44.asServiceRole.entities.PlanoCanopus.list({
        filter: { empresa_id: empresaId, external_hash },
        limit: 1,
      });
      const existing = Array.isArray(existingRes) ? existingRes[0] : (existingRes?.items?.[0] ?? null);

      if (existing?.id) {
        await base44.asServiceRole.entities.PlanoCanopus.update(existing.id, dados);
        atualizados++;
      } else {
        await base44.asServiceRole.entities.PlanoCanopus.create(dados);
        criados++;
      }
    }

    step = "done";
    return Response.json({
      success: true,
      lidos: rows.length,
      criados,
      atualizados,
      message: `Sincronização concluída. Lidos: ${rows.length}, Criados: ${criados}, Atualizados: ${atualizados}`,
      step,
      elapsed_ms: Date.now() - startedAt,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;

    return Response.json(
      {
        error: "Internal Server Error",
        step,
        message,
        stack,
        elapsed_ms: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
});