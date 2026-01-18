import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";
import cheerio from "npm:cheerio";
import * as cookie from "npm:tough-cookie";

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = ["admin", "super_admin", "master"].includes(user.role);
  if (!isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // ----------- SESSION COOKIE HANDLER ------------
  const cookieJar = new cookie.CookieJar();

  async function http(url, options = {}) {
    options.headers = options.headers || {};
    
    // Apply cookies
    const cookieStr = await cookieJar.getCookieString(url);
    if (cookieStr) options.headers["Cookie"] = cookieStr;

    const res = await fetch(url, options);

    // Save cookies from response
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) await cookieJar.setCookie(setCookie, url);

    return res;
  }

  // ----------- LOGIN ----------------
  const loginRes = await http(
    "https://afv.consorciocanopus.com.br/Sistema/validar_login.php",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        login: "0000022393",
        senha: "Canopus24@",
      }),
    }
  );

  if (!loginRes.ok) {
    return Response.json(
      { error: "Falha no login AFV", status: loginRes.status },
      { status: 400 }
    );
  }

  // ----------- FUNÇÃO PARA BUSCAR PLANOS ------------
  async function buscarPlanos(produto, reajuste) {
    const res = await http(
      "https://afv.consorciocanopus.com.br/Sistema/planos/listagem_planos.php",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          produto,
          valor: "Bem",
          modelo: "TODOS",
          marca: "TODAS",
          grupos: "TODOS",
          reajuste,
          reserva: "Sem reserva",
          filtrar: "1",
        }),
      }
    );

    const html = await res.text();
    const $ = cheerio.load(html);

    const planos = [];

    $("#table_planos tbody tr").each((_, tr) => {
      const tds = $(tr).find("td");

      const nome_bem = $(tds[0]).text().trim();
      const valor_bem = $(tds[1]).text().trim();
      const prazo = $(tds[2]).text().trim();
      const parcela = $(tds[3]).text().trim();
      const plano = $(tds[4]).text().trim();
      const tipo_venda = $(tds[5]).text().trim();

      if (!nome_bem) return;

      planos.push({
        nome_bem,
        valor_bem,
        prazo,
        parcela,
        plano,
        tipo_venda,
        produto,
        reajuste,
        origem: "CANOPUS",
      });
    });

    return planos;
  }

  // BUSCAR AUTOMÓVEIS + IPCA
  const autos = await buscarPlanos("AUTOMÓVEIS", "IPCA");

  // BUSCAR IMÓVEIS + INCC
  const imoveis = await buscarPlanos("IMÓVEIS", "INCC");

  const todos = [...autos, ...imoveis];

  // ----------- SALVAR NO BASE44 ----------------
  let criados = 0;
  let atualizados = 0;

  for (const p of todos) {
    const hash = `${p.nome_bem}|${p.prazo}|${p.plano}|${p.tipo_venda}|${p.produto}`;

    const existente = await base44.asServiceRole.entities.PlanoCanopus.filter({
      hash_chave: hash,
    });

    const dados = {
      origem: "CANOPUS",
      nome_bem: p.nome_bem,
      produto: p.produto,
      plano: p.plano,
      tipo_venda: p.tipo_venda,
      reajuste_tipo: p.reajuste,
      valor_bem: Number(p.valor_bem.replace("R$", "").replace(/\./g, "").replace(",", ".")),
      prazo_meses: Number(p.prazo),
      parcela: Number(p.parcela.replace("R$", "").replace(/\./g, "").replace(",", ".")),
      hash_chave: hash,
      status: "ativo",
      ultima_sincronizacao: new Date().toISOString(),
    };

    if (existente.length === 0) {
      await base44.asServiceRole.entities.PlanoCanopus.create(dados);
      criados++;
    } else {
      await base44.asServiceRole.entities.PlanoCanopus.update(existente[0].id, dados);
      atualizados++;
    }
  }

  return Response.json({
    sucesso: true,
    totais: {
      criados,
      atualizados,
      total: criados + atualizados,
    },
    mensagem: "Sincronização concluída com sucesso.",
  });
});