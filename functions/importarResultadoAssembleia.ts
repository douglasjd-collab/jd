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
    grupo: string;
    modalidade: string;
    lance_percent: number | null;
  }> = [];

  // Regex mais flexível que captura: QT GRUPO COTA VALOR MODALIDADE PERCENTUAL
  // Exemplos:
  // 1 8320 001 R$ 50.000,00 Lance Livre 35,00%
  // 2 8320 002 R$ 50.000,00 Sorteio 0,00%
  const re = /^(\d+)\s+(\d{3,})\s+(\d+)\s+(R\$\s*[\d\.\,]+)\s+(.+?)\s+([\d\.\,]+%)\s*$/;
  
  // Regex alternativa sem QT inicial
  const re2 = /^(\d{3,})\s+(\d+)\s+(R\$\s*[\d\.\,]+)\s+(.+?)\s+([\d\.\,]+%)\s*$/;

  console.log("[DEBUG] Total de linhas encontradas:", lines.length);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Ignorar cabeçalhos e linhas irrelevantes
    if (
      /Prováveis Contemplados/i.test(line) ||
      /^QT\.?\s*GRUPO/i.test(line) ||
      /Legendas/i.test(line) ||
      /^S\s*-\s*Sorteio/i.test(line) ||
      /^LL\s*-/i.test(line) ||
      /^LF\s*-/i.test(line) ||
      /^\d+ª\s*Opção/i.test(line) ||
      /Assembleia/i.test(line)
    ) {
      console.log(`[DEBUG] Linha ${i} ignorada (cabeçalho):`, line);
      continue;
    }

    // Tentar primeira regex (com QT)
    let m = line.match(re);
    if (m) {
      console.log(`[DEBUG] Linha ${i} match (formato 1):`, line);
      rows.push({
        grupo: m[2],
        modalidade: mapModalidade(m[5].trim()),
        lance_percent: toPercent(m[6]),
      });
      continue;
    }

    // Tentar segunda regex (sem QT)
    m = line.match(re2);
    if (m) {
      console.log(`[DEBUG] Linha ${i} match (formato 2):`, line);
      rows.push({
        grupo: m[1],
        modalidade: mapModalidade(m[4].trim()),
        lance_percent: toPercent(m[5]),
      });
      continue;
    }

    // Log de linhas não processadas que parecem relevantes
    if (/^\d+\s+\d{3,}/.test(line) || /^\d{3,}\s+\d+/.test(line)) {
      console.log(`[DEBUG] Linha ${i} NÃO processada (possível dado):`, line);
    }
  }

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