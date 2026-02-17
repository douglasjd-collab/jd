import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";
import pdfParse from "npm:pdf-parse@1.1.1";

function onlyDigits(s) {
  return (s || "").replace(/\D+/g, "");
}

function brMoneyToNumber(v) {
  // "110.000,00" -> 110000
  const clean = (v || "").replace(/\./g, "").replace(",", ".");
  const num = Number(clean);
  return Number.isFinite(num) ? num : null;
}

function pickFirst(text, patterns) {
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function normalizeSpaces(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function parseCanopus(textRaw) {
  const text = normalizeSpaces(textRaw);

  // Nº proposta
  const numeroProposta = pickFirst(text, [
    /\bProposta\s+(\d{6,})\b/i,
    /\b(\d{6,})\b(?=\s+JD\s+PROMOTORA|\s+MARIA|\s+NOME\/DENOMINAÇÃO)/i,
  ]);

  // Nome (em Canopus costuma estar em caixa alta e perto do CPF)
  const nome = pickFirst(text, [
    /\b(\p{L}[\p{L}\s]+?)\s+\d{3}\.\d{3}\.\d{3}-\d{2}\b/iu,
  ]);

  // CPF
  const cpf = pickFirst(text, [
    /\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/,
  ]);

  // Nascimento dd/mm/aaaa
  const dataNascimento = pickFirst(text, [
    /\b(\d{2}\/\d{2}\/\d{4})\b/,
  ]);

  // Email
  const email = pickFirst(text, [
    /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i,
  ]);

  // Telefone (pega o primeiro - mantém formatação)
  const telefone = pickFirst(text, [
    /\((\d{2})\)\s*(\d{4,5})-(\d{4})/,
  ]);
  const telefoneFormatado = telefone ? `(${telefone.match(/\d{2}/)}) ${telefone.match(/\d{4,5}/)}-${telefone.match(/\d{4}$/)}` : null;

  // Plano: CR#### (ex. CR5502)
  const planoCodigo = pickFirst(text, [
    /\b(CR\d{4})\b/i,
  ])?.toUpperCase() ?? null;

  // Produto/descrição (linha com AUTOMÓVEL ... - R$ 110.000,00)
  const produto = pickFirst(text, [
    /(AUTOM[ÓO]VEL[^-]{0,80}-\s*R\$\s*\d{1,3}(\.\d{3})*,\d{2})/i,
    /(MOTO[^-]{0,80}-\s*R\$\s*\d{1,3}(\.\d{3})*,\d{2})/i,
    /(IM[ÓO]VEL[^-]{0,80}-\s*R\$\s*\d{1,3}(\.\d{3})*,\d{2})/i,
  ]);

  // Valor do crédito (pega o maior "110.000,00" que aparece)
  const creditoStr = pickFirst(text, [
    /\bR\$\s*(\d{1,3}(\.\d{3})*,\d{2})\b/,
    /\b(\d{1,3}(\.\d{3})*,\d{2})\s*cento\b/i,
  ]);
  const valorCredito = creditoStr ? brMoneyToNumber(creditoStr) : null;

  // 1ª parcela (no PDF: "902,40 novecentos e dois reais...")
  const parcela1Str = pickFirst(text, [
    /\b(\d{1,3}(\.\d{3})*,\d{2})\s+novecentos\b/i,
    /\bValor da 1ª parcela[^0-9]*(\d{1,3}(\.\d{3})*,\d{2})\b/i,
  ]);
  const parcela1 = parcela1Str ? brMoneyToNumber(parcela1Str) : null;

  // Taxa adm total (no PDF: "... 50 16,50")
  const taxaAdmTotalStr = pickFirst(text, [
    /\bTaxa de Administra[cç][aã]o\s*Total[^0-9]*(\d{1,2},\d{2})\b/i,
    /\b(\d{1,2},\d{2})\b(?=\s*IPCA\/IBGE)/i,
  ]);
  const taxaAdmTotal = taxaAdmTotalStr ? Number(taxaAdmTotalStr.replace(",", ".")) : null;

  // Prazos (no PDF aparecem como 140 138 86 perto do bloco do plano)
  let prazoGrupo = null;
  let prazoContrato = null;
  let prazoCota = null;
  const mPrazos = text.match(/\b(\d{2,3})\s+(\d{2,3})\s+(\d{2,3})\b\s+\d{1,2},\d{4}\b/i);
  if (mPrazos) {
    prazoGrupo = Number(mPrazos[1]);
    prazoContrato = Number(mPrazos[2]);
    prazoCota = Number(mPrazos[3]);
  }

  // Endereço
  const enderecoLinha = pickFirst(text, [
    /(ESTRADA[^@]+?\b\d{5}-\d{3}\b)/i,
    /([A-ZÇÃÕÉÍÓÚÂÊÔ0-9 ,\-\/]+)\s+\b(\d{5}-\d{3})\b/,
  ]);

  // CEP
  const cep = pickFirst(text, [/\b(\d{5}-\d{3})\b/]);

  // Grupo (tenta extrair)
  const grupo = pickFirst(text, [
    /\bGrupo[:\s]+([A-Z0-9]+)/i,
    /\bGRP[:\s]+([A-Z0-9]+)/i,
  ]);

  return {
    numeroProposta,
    nome,
    cpf,
    dataNascimento,
    email,
    telefone,
    planoCodigo,
    produto,
    valorCredito,
    parcela1,
    taxaAdmTotal,
    prazoGrupo,
    prazoContrato,
    prazoCota,
    enderecoLinha,
    cep,
    grupo,
    textRaw: textRaw?.slice(0, 20000) ?? "",
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Buscar perfil do colaborador
    const colabs = await base44.entities.Colaborador.filter(
      { user_id: user.id, status: 'ativo' },
      '-created_date',
      1
    );
    
    if (!colabs?.length) {
      return Response.json({ 
        error: "Usuário não vinculado a um colaborador." 
      }, { status: 403 });
    }
    
    const colab = colabs[0];
    const userPerfil = colab.perfil;
    const empresaId = colab.empresa_id;
    const colaboradorId = colab.id;

    if (!["super_admin", "master", "admin", "gerente", "vendedor"].includes(userPerfil)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!empresaId) {
      return Response.json({ error: "Empresa não configurada" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { file_url } = body;

    if (!file_url) {
      return Response.json({ error: "file_url é obrigatório" }, { status: 400 });
    }

    // 1) Baixar PDF
    const pdfResp = await fetch(file_url);
    if (!pdfResp.ok) {
      return Response.json(
        { error: "Falha ao baixar PDF", detail: { status: pdfResp.status } },
        { status: 400 }
      );
    }
    const ab = await pdfResp.arrayBuffer();
    const data = new Uint8Array(ab);

    // 2) Extrair texto do PDF
    const parsed = await pdfParse(data);
    const text = parsed?.text || "";
    if (!text || text.trim().length < 50) {
      return Response.json(
        { 
          error: "Não consegui extrair texto do PDF (pode ser imagem/scan).",
          hint: "Se for scan, precisamos OCR."
        },
        { status: 422 }
      );
    }

    // 3) Parser Canopus
    const info = parseCanopus(text);

    if (!info.cpf || onlyDigits(info.cpf).length !== 11) {
      return Response.json(
        { 
          error: "CPF não encontrado/inválido no PDF.",
          extracted: { 
            cpf: info.cpf,
            nome: info.nome,
            numeroProposta: info.numeroProposta 
          }
        },
        { status: 422 }
      );
    }

    // 4) Upsert Cliente por CPF
    const cpfDigits = onlyDigits(info.cpf);
    const clientes = await base44.entities.Cliente.filter({ cpf: cpfDigits });

    let clienteId;

    if (clientes?.length) {
      clienteId = clientes[0].id;

      // Atualizar dados do cliente
      await base44.entities.Cliente.update(clienteId, {
        nome_completo: info.nome ?? clientes[0].nome_completo,
        cpf: cpfDigits,
        data_nascimento: info.dataNascimento ? info.dataNascimento.split("/").reverse().join("-") : clientes[0].data_nascimento,
        email: info.email || clientes[0].email,
        celular: info.telefone || clientes[0].celular,
        res_cep: info.cep || clientes[0].res_cep,
        res_endereco: info.enderecoLinha || clientes[0].res_endereco,
      });
    } else {
      // Criar novo cliente - usar asServiceRole para garantir permissão
      const created = await base44.asServiceRole.entities.Cliente.create({
        empresa_id: empresaId,
        tipo_pessoa: "Física",
        nome_completo: info.nome,
        cpf: cpfDigits,
        data_nascimento: info.dataNascimento ? info.dataNascimento.split("/").reverse().join("-") : null,
        email: info.email,
        celular: info.telefone,
        res_cep: info.cep,
        res_endereco: info.enderecoLinha,
        status: "ativo"
      });

      clienteId = created?.id;
      if (!clienteId) {
        return Response.json({ error: "Falha ao criar Cliente." }, { status: 500 });
      }
    }

    // 5) Buscar administradora Canopus
    const admins = await base44.entities.Administradora.filter({
      empresa_id: empresaId
    });

    // Buscar por nome (case insensitive)
    const adminCanopus = admins.find(a => 
      a.nome_fantasia?.toLowerCase().includes('canopus') || 
      a.razao_social?.toLowerCase().includes('canopus')
    );

    let administradoraId = adminCanopus?.id;
    
    if (!administradoraId) {
      // Criar se não existir
      const newAdmin = await base44.asServiceRole.entities.Administradora.create({
        empresa_id: empresaId,
        razao_social: "Consórcio Canopus",
        nome_fantasia: "Canopus",
        cnpj: "00000000000000",
        tipoEmpresa: "LTDA",
        status: "ativa"
      });
      administradoraId = newAdmin?.id;
    }

    // 6) Buscar ou criar tabela padrão Canopus
    const tabelas = await base44.entities.TabelaConsorcio.filter({
      empresa_id: empresaId,
      administradora_id: administradoraId
    });

    let tabelaId = tabelas?.[0]?.id;
    
    if (!tabelaId) {
      // Criar tabela padrão
      const newTabela = await base44.asServiceRole.entities.TabelaConsorcio.create({
        empresa_id: empresaId,
        nomeTabela: "Canopus - Importação PDF",
        administradora_id: administradoraId,
        administradora_nome: "Canopus",
        status: "ativa"
      });
      tabelaId = newTabela?.id;
    }

    // 7) Evitar duplicidade por contrato
    if (info.numeroProposta) {
      const existing = await base44.entities.Venda.filter({
        contrato: String(info.numeroProposta)
      });

      if (existing?.length) {
        return Response.json({
          ok: true,
          message: "Proposta já existe. Nada foi duplicado.",
          venda_id: existing[0].id,
          cliente_id: clienteId
        });
      }
    }

    // 8) Criar Venda (cota em branco) - usar asServiceRole
    const venda = await base44.asServiceRole.entities.Venda.create({
      empresa_id: empresaId,
      cliente_id: clienteId,
      cliente_nome: info.nome,
      cliente_cpf: cpfDigits,
      administradora_id: administradoraId,
      administradora_nome: "Canopus",
      tabela_id: tabelaId,
      tabela_nome: "Canopus - Importação PDF",
      tipo: info.produto?.toLowerCase().includes("moto") ? "motocicleta" : 
            info.produto?.toLowerCase().includes("imóvel") ? "imovel" : "automovel",
      grupo: info.grupo || "",
      cota: "", // Sempre em branco conforme solicitado
      contrato: info.numeroProposta ? String(info.numeroProposta) : null,
      prazo: info.prazoContrato || info.prazoGrupo || 0,
      valorCredito: info.valorCredito || 0,
      taxaAdministracao: info.taxaAdmTotal || 0,
      vendedor_id: colaboradorId,
      vendedor_nome: colab.nome,
      data_venda: new Date().toISOString().split('T')[0],
      status: "pendente",
      origem_importacao: "PDF Canopus",
      arquivo_contrato_url: file_url
    });

    if (!venda?.id) {
      return Response.json({ error: "Falha ao criar Venda." }, { status: 500 });
    }

    // Auditoria
    try {
      await base44.asServiceRole.entities.LogAuditoria.create({
        usuario_id: user.id,
        usuario_nome: user.full_name,
        acao: `Importação de proposta PDF Canopus - Contrato ${info.numeroProposta}`,
        entidade: "Venda",
        entidade_id: venda.id,
        dados_novos: JSON.stringify({
          cliente: info.nome,
          cpf: info.cpf,
          valor: info.valorCredito,
          plano: info.planoCodigo
        }),
        tipo: "criacao"
      });
    } catch (e) {
      console.log("Erro ao criar log:", e);
    }

    return Response.json({
      ok: true,
      cliente_id: clienteId,
      venda_id: venda.id,
      extraido: {
        numero_proposta: info.numeroProposta,
        nome: info.nome,
        cpf: info.cpf,
        plano: info.planoCodigo,
        valor_credito: info.valorCredito,
        taxa_adm_total: info.taxaAdmTotal,
        prazos: {
          grupo: info.prazoGrupo,
          contrato: info.prazoContrato,
          cota: info.prazoCota
        },
      },
    });
  } catch (e) {
    console.error("Erro na importação:", e);
    return Response.json(
      { error: "Internal Server Error", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
});