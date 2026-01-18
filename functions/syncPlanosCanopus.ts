import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";
import cheerio from "npm:cheerio@1.0.0-rc.12";
import { CookieJar } from "npm:tough-cookie@4.1.3";

Deno.serve(async (req) => {
  let base44;
  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const isAdmin =
      ["admin", "super_admin", "master"].includes(user.role) ||
      ["admin", "super_admin", "master"].includes(user.perfil);

    if (!isAdmin) {
      return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    // --- descobrir empresa_id ---
    let empresaId = user.empresa_id;

    if (!empresaId) {
      const colabs = await base44.asServiceRole.entities.Colaborador.filter({
        user_id: user.id,
        status: "ativo",
      });
      if (colabs?.length) empresaId = colabs[0].empresa_id;
    }

    if (!empresaId) {
      return Response.json(
        { error: "empresa_id não encontrado. Vincule o usuário a uma empresa." },
        { status: 400 }
      );
    }

    // --- carregar credenciais salvas no IntegracaoCanopus ---
    const integracoes = await base44.asServiceRole.entities.IntegracaoCanopus.filter({
      empresa_id: empresaId,
      origem: "CANOPUS",
      status: "ativo",
    });

    if (!integracoes?.length) {
      return Response.json(
        { error: "Integração Canopus não configurada (empresa sem credenciais ativas)." },
        { status: 400 }
      );
    }

    const integracao = integracoes[0];

    const baseUrl = (integracao.url || "https://afv.consorciocanopus.com.br/Sistema/").replace(/\/+$/, "/");
    const usuario = integracao.usuario;
    const senha = integracao.senha;

    if (!usuario || !senha) {
      return Response.json(
        { error: "Credenciais Canopus incompletas. Informe usuário e senha na Integração Canopus." },
        { status: 400 }
      );
    }

    // --- client HTTP com cookies + headers "de navegador" ---
    const jar = new CookieJar();

    const UA =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

    async function http(url, init = {}, retryCount = 0) {
      const headers = new Headers(init.headers || {});
      headers.set("User-Agent", UA);
      headers.set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
      headers.set("Accept-Language", "pt-BR,pt;q=0.9,en;q=0.8");

      const cookieStr = await jar.getCookieString(url);
      if (cookieStr) headers.set("Cookie", cookieStr);

      try {
        const res = await fetch(url, { ...init, headers, redirect: "follow", signal: AbortSignal.timeout(30000) });

        const sc = res.headers.get("set-cookie");
        if (sc) {
          const parts = sc.split(/,(?=\s*[A-Za-z0-9_\-]+=)/g);
          for (const c of parts) {
            try {
              await jar.setCookie(c, url);
            } catch (_) {}
          }
        }

        return res;
      } catch (err) {
        if (retryCount < 2 && (err.message?.includes("Connection reset") || err.message?.includes("ECONNRESET"))) {
          const delay = Math.pow(2, retryCount) * 1000;
          await new Promise(r => setTimeout(r, delay));
          return http(url, init, retryCount + 1);
        }
        throw err;
      }
    }

    function isLoginHtml(html) {
      const h = (html || "").toLowerCase();
      return (
        h.includes("name=\"login\"") ||
        h.includes("name='login'") ||
        h.includes("validar_login") ||
        h.includes("tela de login") ||
        (h.includes("senha") && h.includes("login"))
      );
    }

    // --- 1) GET no Sistema/ para pegar sessão/cookies ---
    const startRes = await http(baseUrl, { method: "GET" });
    await startRes.text();

    // --- 2) POST login ---
    const loginUrl = baseUrl + "validar_login.php";
    const loginBody = new URLSearchParams({ login: String(usuario), senha: String(senha) });

    const loginRes = await http(loginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": baseUrl,
        "Origin": baseUrl.replace(/\/Sistema\/$/, ""),
      },
      body: loginBody.toString(),
    });

    const loginHtml = await loginRes.text();

    // --- 3) validar se logou mesmo ---
    if (isLoginHtml(loginHtml)) {
      return Response.json(
        {
          error: "Falha ao autenticar no AFV (retornou tela de login).",
          hint: "Revise usuário/senha. Se estiver certo, pode haver bloqueio/2FA/validação extra no AFV.",
        },
        { status: 400 }
      );
    }

    // --- 4) buscar página de planos (com sessão ativa) ---
    async function buscarPlanos(produto, reajuste) {
      const urlPlanos = baseUrl + "planos/listagem_planos.php";

      const res = await http(urlPlanos, {
        method: "GET",
        headers: { Referer: baseUrl + "planos/listagem_planos.php" },
      });

      const html = await res.text();
      if (isLoginHtml(html)) {
        throw new Error("Sessão expirada/negada ao acessar planos (voltou para login).");
      }

      const $ = cheerio.load(html);

      let rows = $("#table_planos tbody tr");
      if (!rows.length) rows = $("table tbody tr");

      const planos = [];
      rows.each((_, tr) => {
        const tds = $(tr).find("td");
        if (tds.length < 6) return;

        const nome_bem = $(tds[0]).text().trim();
        const valor = $(tds[1]).text().trim();
        const prazo = $(tds[2]).text().trim();
        const primeira = $(tds[3]).text().trim();
        const plano = $(tds[4]).text().trim();
        const tipo = $(tds[5]).text().trim();

        if (!nome_bem) return;

        function moneyToNumber(v) {
          const s = (v || "")
            .replace("R$", "")
            .replace(/\s/g, "")
            .replace(/\./g, "")
            .replace(",", ".");
          const n = Number(s);
          return Number.isFinite(n) ? n : 0;
        }

        planos.push({
          origem: "CANOPUS",
          produto,
          reajuste_tipo: reajuste,
          nome_bem,
          valor_bem: moneyToNumber(valor),
          prazo_meses: Number(prazo) || 0,
          primeira_parcela: moneyToNumber(primeira),
          plano,
          tipo_venda: tipo,
        });
      });

      return planos;
    }

    const filtros = [
      { produto: "Automóvel", reajuste: "IPCA" },
      { produto: "Imóvel", reajuste: "INCC" },
    ];

    const coletados = [];
    for (const f of filtros) {
      try {
        const planos = await buscarPlanos(f.produto, f.reajuste);
        coletados.push(...planos);
      } catch (e) {
        return Response.json(
          { error: `Erro ao buscar planos (${f.produto})`, message: e?.message || String(e) },
          { status: 400 }
        );
      }
    }

    if (!coletados.length) {
      return Response.json(
        {
          error: "Não foi possível ler a tabela de planos (0 itens).",
          hint:
            "Pode ter mudado o HTML da página. Abra a página e verifique se existe uma tabela com as colunas (NOME DO BEM, VALOR, PRAZO, 1ª PARCELA, PLANO, TIPO DE VENDA).",
        },
        { status: 400 }
      );
    }

    // --- salvar no Base44 ---
    let criados = 0;
    let atualizados = 0;

    for (const p of coletados) {
      const hash = `${empresaId}|${p.produto}|${p.nome_bem}|${p.prazo_meses}|${p.plano}|${p.tipo_venda}|${p.reajuste_tipo}`;

      const existente = await base44.asServiceRole.entities.PlanoCanopus.filter({
        empresa_id: empresaId,
        hash_chave: hash,
      });

      const dados = {
        empresa_id: empresaId,
        origem: "CANOPUS",
        produto: p.produto,
        reajuste_tipo: p.reajuste_tipo,
        nome_bem: p.nome_bem,
        valor_bem: p.valor_bem,
        prazo_meses: p.prazo_meses,
        parcela: p.primeira_parcela,
        plano: p.plano,
        tipo_venda: p.tipo_venda,
        status: "ativo",
        hash_chave: hash,
        ultima_sincronizacao: new Date().toISOString(),
      };

      if (!existente?.length) {
        await base44.asServiceRole.entities.PlanoCanopus.create(dados);
        criados++;
      } else {
        await base44.asServiceRole.entities.PlanoCanopus.update(existente[0].id, dados);
        atualizados++;
      }
    }

    return Response.json({
      success: true,
      lidos: coletados.length,
      criados,
      atualizados,
      message: `Sincronização concluída. Lidos: ${coletados.length}, Criados: ${criados}, Atualizados: ${atualizados}`,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 }
    );
  }
});