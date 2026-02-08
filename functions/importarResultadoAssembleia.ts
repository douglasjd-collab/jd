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

function extrairPercentual(linha: string): number | null {
  if (!linha) return null;
  
  const texto = linha.replace(/\s+/g, ' ').trim();
  
  // Percentual aparece como: 32,50% ou 15,00% ou 100,00%
  const match = texto.match(/(\d{1,3},\d{2})%/);
  
  if (!match) return null;
  
  // Converte "32,50" → 32.5
  return parseFloat(match[1].replace(',', '.'));
}

function extrairValorCredito(linha: string): number | null {
  if (!linha) return null;
  
  const match = linha.match(/R\$\s?:?\s?([\d.]+,\d{2})/);
  if (!match) return null;
  
  return parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
}

function extrairValorLance(linha: string): number | null {
  if (!linha) return null;
  
  const matches = [...linha.matchAll(/R\$\s?:?\s?([\d.]+,\d{2})/g)];
  
  // Normalmente o segundo valor é o lance
  if (matches.length < 2) return null;
  
  return parseFloat(matches[1][1].replace(/\./g, '').replace(',', '.'));
}

function limparTextoPDF(texto: string): string[] {
  return texto
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l =>
      l.length > 10 &&
      !l.startsWith('QT.') &&
      !l.startsWith('QT ') &&
      !l.startsWith('Legendas') &&
      !l.startsWith('-') &&
      !l.includes('Legenda') &&
      !l.includes('TOTAL')
    );
}

function parseLinhaAssembleia(linha: string) {
  const grupo = extrairGrupo(linha);
  if (!grupo) return null;
  
  const percentual = extrairPercentual(linha);
  const valorCredito = extrairValorCredito(linha);
  const valorLance = extrairValorLance(linha);
  
  // Identificar modalidade
  const linhaLower = linha.toLowerCase();
  let modalidade = "sorteio";
  
  if (percentual !== null) {
    if (linhaLower.includes("lance livre")) {
      modalidade = "lance_livre";
    } else if (linhaLower.includes("lance limitado")) {
      modalidade = "lance_limitado";
    } else if (linhaLower.includes("lance fixo") || linhaLower.includes("fixo")) {
      if (percentual >= 14 && percentual <= 16) modalidade = "lance_fixo_15";
      else if (percentual >= 28 && percentual <= 32) modalidade = "lance_fixo_30";
      else if (percentual >= 48 && percentual <= 52) modalidade = "lance_fixo_50";
      else modalidade = "lance_fixo_30";
    } else {
      modalidade = "lance_livre";
    }
  }
  
  // Extrair QT e descrição
  const prefixMatch = linha.match(/^(\d{1,3})\s+\d{6}\s+(.+)/);
  const qt = prefixMatch ? parseInt(prefixMatch[1]) : null;
  
  let descricao = prefixMatch ? prefixMatch[2] : "";
  descricao = descricao
    .replace(/R\$\s?:?\s?[\d.]+,\d{2}/g, '')
    .replace(/[\d.]+,\d{2}%/g, '')
    .replace(/(Lance Livre|Lance Limitado|Sorteio|Lance Fixo)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  return {
    qt,
    grupo,
    descricao,
    credito: valorCredito,
    modalidade,
    lance_percent: percentual
  };
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
  console.log("[DEBUG] ========== INÍCIO DO PARSE ==========");
  console.log("[DEBUG] Tamanho do texto:", fullText.length);

  // ETAPA 1: Limpeza inicial
  const linhasLimpas = limparTextoPDF(fullText);
  console.log("[DEBUG] Linhas após limpeza:", linhasLimpas.length);
  console.log("[DEBUG] Primeiras 10 linhas limpas:");
  linhasLimpas.slice(0, 10).forEach((line, idx) => {
    console.log(`  [${idx}] "${line}"`);
  });

  // ETAPA 2: Parser de cada linha
  const registros = linhasLimpas
    .map(parseLinhaAssembleia)
    .filter(Boolean);

  // ETAPA 3: Contagem de grupos únicos
  const grupos = registros.map(r => r.grupo).filter(Boolean);
  const totalGrupos = new Set(grupos).size;
  const totalLinhasValidas = linhasLimpas.filter(l => extrairGrupo(l)).length;

  console.log("[DEBUG] ========== FIM DO PARSE ==========");
  console.log("[DEBUG] Total de linhas válidas encontradas:", totalLinhasValidas);
  console.log("[DEBUG] Total de registros parseados:", registros.length);
  console.log("[DEBUG] Total de grupos únicos:", totalGrupos);
  console.log("[DEBUG] Grupos:", Array.from(new Set(grupos)).sort().join(', '));
  
  return {
    rows: registros,
    totalLinhasValidas,
    totalGruposUnicos: totalGrupos,
    grupos: Array.from(new Set(grupos)).sort()
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