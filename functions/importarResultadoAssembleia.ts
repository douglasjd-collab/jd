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

  const re = /^(\d+)\s+(\d{3,})\s+(.+?)\s+(R\$\s*[\d\.\,]+)\s+([A-Za-zÀ-ÿ\s]+?)\s+([\d\.\,]+%)$/;

  for (const line of lines) {
    if (
      /Prováveis Contemplados/i.test(line) ||
      /^QT\.\s*GRUPO/i.test(line) ||
      /Legendas/i.test(line) ||
      /^S\s*-\s*Sorteio/i.test(line)
    ) continue;

    const m = line.match(re);
    if (!m) continue;

    rows.push({
      grupo: m[2],
      modalidade: mapModalidade(m[5].trim()),
      lance_percent: toPercent(m[6]),
    });
  }

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

    // Criar registros HistoricoLanceResumo
    const resumos = [];
    for (const [, data] of grupos) {
      const percentuais = data.percentuais;
      const menor = percentuais.length > 0 ? Math.min(...percentuais) : null;
      const maior = percentuais.length > 0 ? Math.max(...percentuais) : null;
      
      resumos.push({
        empresa_id,
        historico_id: historico.id,
        grupo: data.grupo,
        modalidade: data.modalidade,
        menor_lance_percent: menor,
        maior_lance_percent: maior,
        qtd_ocorrencias: percentuais.length || 1
      });
    }

    // Criar resumos em batch
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