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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Ignorar cabeçalhos, legendas e linhas irrelevantes
    if (
      line.length < 15 ||
      /Prováveis Contemplados/i.test(line) ||
      /^QT\.?\s*(GRUPO|DESCRIÇÃO)/i.test(line) ||
      /^(Legendas|MODALIDADE|CRÉDITO|LANCE)/i.test(line) ||
      /^(S|LL|LF|LFL)\s*[-–—]/i.test(line) ||
      /^\d+ª\s*Opção/i.test(line) ||
      /Assembleia/i.test(line) ||
      /^\s*[-–—]+\s*$/i.test(line)
    ) {
      continue;
    }

    // Regex flexível: QT GRUPO DESCRIÇÃO R$ VALOR [MODALIDADE] [PERCENTUAL%]
    // Captura linha começando com número, seguido de grupo (5-6 dígitos)
    const regex = /^(\d+)\s+(\d{5,6})\s+(.+?)\s+R\$\s*([\d\.\,]+)(?:\s+(.+?))?(?:\s+([\d\.\,]+)%)?$/i;
    const match = line.match(regex);
    
    if (!match) {
      // Log apenas se parece ser uma linha de dados
      if (/^\d+\s+\d{5,6}/.test(line)) {
        console.log(`[DEBUG] ⚠️ Linha ${i} não processada:`, line);
      }
      continue;
    }

    const qt = parseInt(match[1]);
    const grupo = match[2];
    let descricao = match[3].trim();
    const credito = toNumberBRL("R$ " + match[4]);
    const modalidadeTexto = (match[5] || "").trim();
    const percentualStr = match[6];
    
    // Limpar descrição (remover valores R$ duplicados)
    descricao = descricao.replace(/\s*R\$\s*[\d\.\,]+/g, '').trim();

    // Determinar modalidade e percentual
    let modalidade = "sorteio"; // default quando não tem lance
    let percentual: number | null = null;

    if (percentualStr) {
      percentual = toPercent(percentualStr + "%");
    }

    // Analisar texto da modalidade
    if (modalidadeTexto) {
      const modalidadeLower = modalidadeTexto.toLowerCase();
      
      if (modalidadeLower.includes("sorteio") || modalidadeLower.includes("sort")) {
        modalidade = "sorteio";
        percentual = null; // Sorteio não tem lance
      } else if (modalidadeLower.includes("lance livre") || modalidadeLower.includes("livre")) {
        modalidade = "lance_livre";
      } else if (modalidadeLower.includes("lance limitado") || modalidadeLower.includes("limitado")) {
        modalidade = "lance_limitado";
      } else if (modalidadeLower.includes("lance fixo") || modalidadeLower.includes("fixo")) {
        // Identificar tipo de fixo pelo percentual
        if (percentual) {
          if (percentual >= 14 && percentual <= 16) modalidade = "lance_fixo_15";
          else if (percentual >= 28 && percentual <= 32) modalidade = "lance_fixo_30";
          else if (percentual >= 48 && percentual <= 52) modalidade = "lance_fixo_50";
          else modalidade = "lance_fixo_30"; // fallback
        } else {
          // Tentar extrair do texto: "Lance Fixo 30%"
          if (modalidadeLower.includes("15")) modalidade = "lance_fixo_15";
          else if (modalidadeLower.includes("30")) modalidade = "lance_fixo_30";
          else if (modalidadeLower.includes("50")) modalidade = "lance_fixo_50";
          else modalidade = "lance_fixo_30";
        }
      }
    }

    // Se não tem modalidade e não tem percentual = Sorteio
    if (!modalidadeTexto && !percentualStr) {
      modalidade = "sorteio";
    }

    console.log(`[DEBUG] ✅ Linha ${i}: QT=${qt}, Grupo=${grupo}, Desc="${descricao}", Crédito=R$${credito}, Modalidade=${modalidade}, Lance=${percentual || 0}%`);
    
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
  console.log("[DEBUG] Total de linhas processadas:", rows.length);
  
  return rows;
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
    const rows = parseRowsFromText(text);

    if (!rows.length) {
      return Response.json({ error: "Nenhuma linha de histórico encontrada no PDF" }, { status: 422 });
    }

    const arquivo_nome = file_url.split('/').pop() || 'arquivo.pdf';

    // Criar registro HistoricoLanceGrupo
    const historico = await base44.asServiceRole.entities.HistoricoLanceGrupo.create({
      empresa_id,
      assembleia_data,
      arquivo_nome,
      total_grupos: 0,
      total_registros: rows.length,
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

    // Atualizar total de grupos
    const gruposUnicos = new Set(rows.map(l => l.grupo)).size;
    await base44.asServiceRole.entities.HistoricoLanceGrupo.update(historico.id, {
      total_grupos: gruposUnicos
    });

    return Response.json({
      sucesso: true,
      historico_id: historico.id,
      total_lances: rows.length,
      total_grupos: gruposUnicos,
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