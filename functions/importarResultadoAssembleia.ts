import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";
import pdfParse from "npm:pdf-parse@1.1.1";

function toNumberBRL(s: string) {
  const clean = s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

function toPercent(s: string) {
  const clean = s.replace("%", "").replace(/\./g, "").replace(",", ".");
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

function parseAssembleiaDate(fullText: string) {
  const m = fullText.match(/Assembleia\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (!m?.[1]) return null;
  const [dd, mm, yyyy] = m[1].split("/");
  return `${yyyy}-${mm}-${dd}`;
}

function parseOpcao(fullText: string) {
  const m = fullText.match(/(\d+)\s*ª\s*Opç/i);
  return m?.[1] ? Number(m[1]) : null;
}

function extrairGrupo(linha: string): string | null {
  if (!linha) return null;
  
  const texto = linha.replace(/\s+/g, ' ').trim();
  
  // Padrão: QT (1-3 dígitos) + GRUPO (6 dígitos)
  // Exemplo: "22 004109 MOTO FAIXA I ..."
  const match = texto.match(/^\d{1,3}\s+(\d{6})\s+/);
  
  return match ? match[1] : null;
}

function mapModalidade(texto: string): string {
  const t = texto.toLowerCase();
  if (t.includes("lance livre")) return "lance_livre";
  if (t.includes("lance limitado")) return "lance_limitado";
  if (t.includes("sorteio")) return "sorteio";
  if (t.includes("fixo 15") || t.includes("15%")) return "lance_fixo_15";
  if (t.includes("fixo 30") || t.includes("30%")) return "lance_fixo_30";
  if (t.includes("fixo 50") || t.includes("50%")) return "lance_fixo_50";
  return texto; // retorna original se não reconhecer
}

function parseRowsFromText(fullText: string) {
  const lines = fullText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const rows: Array<{
    qt: number | null;
    grupo: string;
    descricao: string;
    credito: number | null;
    modalidade: string;
    lance_percent: number | null;
  }> = [];

  console.log("[DEBUG] ========== INÍCIO DO PARSE ==========");
  console.log("[DEBUG] Total de linhas no PDF:", lines.length);
  console.log("[DEBUG] Primeiras 20 linhas do PDF:");
  lines.slice(0, 20).forEach((line, idx) => {
    console.log(`  [${idx}] "${line}"`);
  });

  // ETAPA 1: Remover lixo (cabeçalhos, legendas, separadores) - MAIS TOLERANTE
  const linhasLimpas = lines.filter(line => {
    // Mínimo de 10 caracteres (era 15)
    if (line.length < 10) return false;
    
    // Filtros mais específicos
    if (/Prováveis Contemplados/i.test(line)) return false;
    if (/^QT\.?\s*(GRUPO|DESCRIÇÃO)/i.test(line)) return false;
    if (/^Legendas:/i.test(line)) return false;
    if (/^(S|LL|LF|LFL)\s*[-–—]\s*Sorteio/i.test(line)) return false;
    if (/^\d+ª\s*Opção/i.test(line)) return false;
    if (/^Data\s+da\s+Assembleia/i.test(line)) return false;
    if (/^\s*[-–—]{3,}\s*$/i.test(line)) return false;
    
    return true;
  });

  console.log("[DEBUG] Linhas após limpeza:", linhasLimpas.length);
  console.log("[DEBUG] Primeiras 10 linhas limpas:");
  linhasLimpas.slice(0, 10).forEach((line, idx) => {
    console.log(`  [${idx}] "${line}"`);
  });

  // ETAPA 2: Identificar linhas válidas e extrair grupos ANTES do parse completo
  const linhasValidas = [];
  const gruposEncontrados = new Set();

  for (const line of linhasLimpas) {
    const grupo = extrairGrupo(line);
    if (grupo) {
      linhasValidas.push(line);
      gruposEncontrados.add(grupo); // Adiciona grupo ao Set
    }
  }

  console.log("[DEBUG] Linhas válidas identificadas:", linhasValidas.length);
  console.log("[DEBUG] Grupos únicos encontrados:", gruposEncontrados.size);
  console.log("[DEBUG] Grupos:", Array.from(gruposEncontrados).sort().join(', '));

  // ETAPA 3: Parser detalhado por linha
  for (let i = 0; i < linhasValidas.length; i++) {
    const line = linhasValidas[i];
    
    const prefixMatch = line.match(/^(\d{1,3})\s+(\d{6})\s+(.+)/);
    if (!prefixMatch) {
      console.log(`[DEBUG] ⚠️ Linha válida mas não deu match no parse: "${line}"`);
      continue;
    }

    const qt = parseInt(prefixMatch[1]);
    const grupo = prefixMatch[2];
    const resto = prefixMatch[3]; // tudo após o grupo

    console.log(`[DEBUG] Linha ${i} identificada: QT=${qt}, Grupo=${grupo}, Resto="${resto}"`);

    // ETAPA 3: Extrair todos os valores R$ da linha
    const valoresR$ = [];
    const regexValor = /R\$\s*:?\s*([\d\.\,]+)/gi;
    let matchValor;
    while ((matchValor = regexValor.exec(resto)) !== null) {
      const valor = toNumberBRL("R$ " + matchValor[1]);
      if (valor != null) valoresR$.push(valor);
    }

    // Crédito é o ÚLTIMO valor R$ (padrão mais comum)
    const credito = valoresR$.length > 0 ? valoresR$[valoresR$.length - 1] : null;

    // ETAPA 4: Extrair percentual (se existir)
    const percentMatch = resto.match(/([\d\.\,]+)\s*%/);
    const percentual = percentMatch ? toPercent(percentMatch[1] + "%") : null;

    // ETAPA 5: Identificar modalidade por palavras-chave
    let modalidade = "sorteio"; // default
    const restoLower = resto.toLowerCase();

    if (restoLower.includes("sorteio")) {
      modalidade = "sorteio";
    } else if (restoLower.includes("lance livre")) {
      modalidade = "lance_livre";
    } else if (restoLower.includes("lance limitado")) {
      modalidade = "lance_limitado";
    } else if (restoLower.includes("lance fixo") || restoLower.includes("fixo")) {
      if (percentual) {
        if (percentual >= 14 && percentual <= 16) modalidade = "lance_fixo_15";
        else if (percentual >= 28 && percentual <= 32) modalidade = "lance_fixo_30";
        else if (percentual >= 48 && percentual <= 52) modalidade = "lance_fixo_50";
        else modalidade = "lance_fixo_30";
      } else {
        if (restoLower.includes("15")) modalidade = "lance_fixo_15";
        else if (restoLower.includes("30")) modalidade = "lance_fixo_30";
        else if (restoLower.includes("50")) modalidade = "lance_fixo_50";
        else modalidade = "lance_fixo_30";
      }
    } else if (percentual !== null) {
      // Se tem percentual mas não identificou modalidade = Lance Livre
      modalidade = "lance_livre";
    }

    // ETAPA 6: Extrair descrição (remover valores R$, percentuais e modalidade)
    let descricao = resto
      .replace(/R\$\s*:?\s*[\d\.\,]+/gi, '') // Remove R$
      .replace(/[\d\.\,]+\s*%/g, '') // Remove percentuais
      .replace(/(Lance Livre|Lance Limitado|Sorteio|Lance Fixo)/gi, '') // Remove modalidade
      .replace(/\s+/g, ' ') // Normaliza espaços
      .trim();

    console.log(`[DEBUG] ✅ Processado: Grupo=${grupo}, Desc="${descricao}", Crédito=${credito}, Modalidade=${modalidade}, Lance=${percentual}%`);

    rows.push({
      qt,
      grupo,
      descricao,
      credito,
      modalidade,
      lance_percent: percentual,
    });
  }

  console.log("[DEBUG] ========== FIM DO PARSE ==========");
  console.log("[DEBUG] Total de linhas processadas com sucesso:", rows.length);
  console.log("[DEBUG] Total de linhas válidas encontradas:", linhasValidas.length);
  console.log("[DEBUG] Total de grupos únicos:", gruposEncontrados.size);
  
  return {
    rows,
    totalLinhasValidas: linhasValidas.length,
    totalGruposUnicos: gruposEncontrados.size,
    grupos: Array.from(gruposEncontrados).sort()
  };
}

function withTimeout<T>(promise: Promise<T>, ms = 25000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`Timeout após ${ms}ms`)), ms);
    promise.then(v => { clearTimeout(id); resolve(v); })
           .catch(e => { clearTimeout(id); reject(e); });
  });
}

async function chunked<T>(items: T[], size: number, fn: (chunk: T[]) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size));
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const role = (user.perfil || user.role || "").toLowerCase();
    if (!["super_admin", "master", "admin", "gerente"].includes(role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // Buscar empresa_id do usuário
    let empresa_id = user.empresa_id;
    if (!empresa_id) {
      const colabs = await base44.asServiceRole.entities.Colaborador.filter({ user_id: user.id, status: "ativo" });
      if (colabs?.[0]?.empresa_id) empresa_id = colabs[0].empresa_id;
    }
    if (!empresa_id) {
      return Response.json({ error: "Empresa não encontrada para o usuário" }, { status: 400 });
    }

    const body = await req.json();
    const { file_url, assembleia_data } = body;

    if (!file_url || !assembleia_data) {
      return Response.json({ error: "file_url e assembleia_data são obrigatórios" }, { status: 400 });
    }

    // Baixar arquivo
    const fileRes = await fetch(file_url);
    if (!fileRes.ok) {
      return Response.json({ error: "Falha ao baixar arquivo" }, { status: 400 });
    }

    const buf = new Uint8Array(await fileRes.arrayBuffer());
    const parsed = await withTimeout(pdfParse(buf), 25000);

    const text = parsed.text || "";
    const parseResult = parseRowsFromText(text);
    const rows = parseResult.rows || [];
    const totalLinhasValidas = parseResult.totalLinhasValidas || 0;
    const totalGruposUnicos = parseResult.totalGruposUnicos || 0;

    // Se não encontrou linhas válidas, salvar histórico vazio
    if (totalLinhasValidas === 0) {
      console.log("[WARN] Nenhuma linha processada, salvando histórico vazio");
      
      const arquivo_nome = file_url.split('/').pop() || 'arquivo.pdf';
      
      const historico = await base44.asServiceRole.entities.HistoricoLanceGrupo.create({
        empresa_id,
        assembleia_data,
        arquivo_nome,
        total_grupos: 0,
        total_registros: 0,
        criado_em: new Date().toISOString(),
        usuario_id: user.id,
        usuario_nome: user.full_name || user.email
      });

      return Response.json({
        sucesso: true,
        aviso: "PDF importado mas nenhuma linha estruturada foi encontrada",
        historico_id: historico.id,
        total_lances: 0,
        total_grupos: 0,
        total_resumos: 0
      });
    }

    const arquivo_nome = file_url.split('/').pop() || 'arquivo.pdf';

    // Criar registro HistoricoLanceGrupo com totais corretos
    const historico = await base44.asServiceRole.entities.HistoricoLanceGrupo.create({
      empresa_id,
      assembleia_data,
      arquivo_nome,
      total_grupos: totalGruposUnicos, // Total de grupos únicos encontrados
      total_registros: totalLinhasValidas, // Total de linhas válidas
      criado_em: new Date().toISOString(),
      usuario_id: user.id,
      usuario_nome: user.full_name || user.email
    });

    // Criar registros detalhados (HistoricoLanceDetalhe)
    await chunked(rows, 100, async (chunk) => {
      await Promise.all(
        chunk.map(row => base44.asServiceRole.entities.HistoricoLanceDetalhe.create({
          empresa_id,
          historico_id: historico.id,
          qt: row.qt,
          grupo: row.grupo,
          descricao: row.descricao,
          credito: row.credito,
          modalidade: row.modalidade,
          lance_percent: row.lance_percent
        }))
      );
    });

    // Extrair mês/ano da assembleia
    const [ano, mes] = assembleia_data.split('-');
    const mesAno = `${ano}-${mes}`;

    // Buscar resumos existentes do mês para verificar se é 1ª chamada
    const resumosExistentes = await base44.asServiceRole.entities.HistoricoLanceResumo.filter({
      empresa_id,
      grupo: rows.map(r => r.grupo)
    });

    // Agrupar existentes por grupo+modalidade+mês
    const existentesMap = new Map();
    for (const r of resumosExistentes) {
      // Buscar histórico para pegar assembleia_data
      const hist = await base44.asServiceRole.entities.HistoricoLanceGrupo.filter({ id: r.historico_id });
      if (hist?.[0]?.assembleia_data) {
        const [anoHist, mesHist] = hist[0].assembleia_data.split('-');
        const mesAnoHist = `${anoHist}-${mesHist}`;
        
        // Só considera se for do MESMO mês
        if (mesAnoHist === mesAno) {
          const key = `${r.grupo}_${r.modalidade}`;
          existentesMap.set(key, r);
        }
      }
    }

    // Agrupar por grupo + modalidade e calcular estatísticas
    const grupos = new Map();
    for (const row of rows) {
      const key = `${row.grupo}_${row.modalidade}`;
      if (!grupos.has(key)) {
        grupos.set(key, {
          grupo: row.grupo,
          modalidade: row.modalidade,
          percentuais: []
        });
      }
      if (row.lance_percent != null) {
        grupos.get(key).percentuais.push(row.lance_percent);
      }
    }

    // Criar/Atualizar registros HistoricoLanceResumo com regras corretas
    const resumos = [];
    for (const [key, data] of grupos) {
      const percentuais = data.percentuais;
      const novoMenor = percentuais.length > 0 ? Math.min(...percentuais) : null;
      const novoMaior = percentuais.length > 0 ? Math.max(...percentuais) : null;
      
      const existente = existentesMap.get(key);

      if (!existente) {
        // PRIMEIRA CHAMADA: salva maior e menor
        resumos.push({
          empresa_id,
          historico_id: historico.id,
          grupo: data.grupo,
          modalidade: data.modalidade,
          menor_lance_percent: novoMenor,
          maior_lance_percent: novoMaior,
          qtd_ocorrencias: percentuais.length || 1
        });
      } else {
        // CHAMADAS SEGUINTES: mantém o maior, atualiza só o menor
        const menorFinal = Math.min(existente.menor_lance_percent || 999999, novoMenor || 999999);
        
        await base44.asServiceRole.entities.HistoricoLanceResumo.update(existente.id, {
          menor_lance_percent: menorFinal === 999999 ? null : menorFinal,
          qtd_ocorrencias: (existente.qtd_ocorrencias || 0) + (percentuais.length || 1)
        });
      }
    }

    // Criar apenas os novos resumos (primeira chamada)
    await chunked(resumos, 100, async (chunk) => {
      await Promise.all(
        chunk.map(r => base44.asServiceRole.entities.HistoricoLanceResumo.create(r))
      );
    });

    return Response.json({
      sucesso: true,
      historico_id: historico.id,
      total_lances: rows.length,
      total_grupos: totalGruposUnicos,
      total_registros: totalLinhasValidas,
      total_resumos: resumos.length
    });

  } catch (e) {
    console.error("[importarResultadoAssembleia] ERRO:", e);
    return Response.json(
      { error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
});