import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as XLSX from 'npm:xlsx@0.18.5';

// Helper: normaliza grupo/cota (remove não-numéricos)
function normDigits(v) {
  const s = String(v ?? '').trim();
  const d = s.replace(/\D/g, '');
  return d.length ? d : null;
}

// Tenta encontrar a venda com flexibilidade de tipos
async function findFirstFlexible(entity, filterBase, grupo, cota) {
  let results = await entity.filter({ ...filterBase, grupo: String(grupo), cota: String(cota) });
  if (results.length > 0) return results[0];

  const gNum = Number(grupo);
  const cNum = Number(cota);
  if (!Number.isNaN(gNum) && !Number.isNaN(cNum)) {
    results = await entity.filter({ ...filterBase, grupo: gNum, cota: cNum });
    if (results.length > 0) return results[0];
  }

  return null;
}

// Busca venda com fallback entre múltiplas tabelas
async function buscarVendaFlex(base44, args) {
  const grupo = normDigits(args.grupo);
  const cota = normDigits(args.cota);
  const contrato = args.contrato ? String(args.contrato).trim() : null;

  if (!grupo && !cota && !contrato) {
    return { venda: null, motivo: "Grupo/cota inválidos no arquivo", produtoEncontrado: null };
  }

  const filterBase = args.empresa_id ? { empresa_id: args.empresa_id } : {};

  const tables = {
    consorcio: base44.entities.Venda,
    financiamento: base44.entities.VendaFinanciamento ?? base44.entities.Venda,
    emprestimos: base44.entities.VendaConsignado ?? base44.entities.Venda,
  };

  // 0) Tenta por contrato primeiro (com e sem empresa_id)
  if (contrato) {
    const mainTable = tables[args.produto] ?? tables.consorcio;
    let res = await mainTable.filter({ ...filterBase, contrato });
    if (res.length > 0) return { venda: res[0], motivo: null, produtoEncontrado: args.produto };

    res = await mainTable.filter({ contrato });
    if (res.length > 0) return { venda: res[0], motivo: null, produtoEncontrado: args.produto };
  }

  if (!grupo || !cota) {
    return { venda: null, motivo: "Grupo/cota inválidos no arquivo", produtoEncontrado: null };
  }

  // Se veio produto, tenta primeiro a tabela certa (com empresa)
  if (args.produto && tables[args.produto]) {
    const venda = await findFirstFlexible(tables[args.produto], filterBase, grupo, cota);
    if (venda) return { venda, motivo: null, produtoEncontrado: args.produto };
  }

  // Fallback SEM empresa_id (para super_admin ou divergências)
  const filterBaseGlobal = {};
  if (args.produto && tables[args.produto]) {
    const vendaGlobal = await findFirstFlexible(tables[args.produto], filterBaseGlobal, grupo, cota);
    if (vendaGlobal) return { venda: vendaGlobal, motivo: null, produtoEncontrado: args.produto };
  }

  // Fallback final: tenta nas 3 tabelas (sem filtro empresa)
  const [vC, vF, vE] = await Promise.all([
    findFirstFlexible(tables.consorcio, filterBaseGlobal, grupo, cota),
    findFirstFlexible(tables.financiamento, filterBaseGlobal, grupo, cota),
    findFirstFlexible(tables.emprestimos, filterBaseGlobal, grupo, cota),
  ]);

  const found = [
    { produto: "consorcio", venda: vC },
    { produto: "financiamento", venda: vF },
    { produto: "emprestimos", venda: vE },
  ].filter(x => x.venda);

  if (found.length === 1) {
    return { venda: found[0].venda, motivo: null, produtoEncontrado: found[0].produto };
  }
  if (found.length > 1) {
    return { venda: null, motivo: "Ambíguo: encontrado em mais de uma tabela", produtoEncontrado: null };
  }

  return { venda: null, motivo: "Venda não encontrada por grupo/cota (nenhuma tabela)", produtoEncontrado: null };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { file_url, produto, empresa_id } = await req.json();

    if (!file_url) {
      return Response.json({ error: 'file_url é obrigatório' }, { status: 400 });
    }

    if (!produto || !['consorcio', 'financiamento', 'emprestimos'].includes(produto)) {
      return Response.json({ error: 'Produto inválido. Use: consorcio, financiamento ou emprestimos' }, { status: 400 });
    }

    // Baixar o arquivo
    const fileResponse = await fetch(file_url);
    if (!fileResponse.ok) {
      return Response.json({ error: 'Erro ao baixar arquivo' }, { status: 400 });
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    // Detecta se é Excel (.xlsx/.xls) ou CSV pelo magic bytes
    const isXlsx = uint8[0] === 0x50 && uint8[1] === 0x4B; // PK = ZIP (xlsx)
    const isXls  = uint8[0] === 0xD0 && uint8[1] === 0xCF; // OLE2 (xls)
    const isExcel = isXlsx || isXls;

    const items = [];
    const errors = [];

    // ── Função auxiliar: normalizar valor monetário ──────────────────────────
    const parseValor = (raw) => {
      let s = String(raw ?? '').trim().replace(/R\$/g, '').replace(/\s/g, '');
      // Se já é número (Excel numérico)
      if (typeof raw === 'number') return raw > 0 ? raw : 0;
      s = s.replace(/\./g, '').replace(',', '.');
      const n = parseFloat(s);
      return isNaN(n) || n <= 0 ? 0 : n;
    };

    // ── Função auxiliar: normalizar data ─────────────────────────────────────
    const parseData = (raw) => {
      if (!raw) return '';
      // Excel date serial
      if (typeof raw === 'number') {
        const date = XLSX.SSF.parse_date_code(raw);
        if (date) {
          const mm = String(date.m).padStart(2, '0');
          const dd = String(date.d).padStart(2, '0');
          return `${date.y}-${mm}-${dd}`;
        }
      }
      const s = String(raw).trim();
      // dd/mm/yyyy
      const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m) return `${m[3]}-${m[2]}-${m[1]}`;
      // yyyy-mm-dd
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      return s;
    };

    // ── Função auxiliar: processar array de linhas [col0..col5] ──────────────
    const processarLinhas = (rows, startRow = 1) => {
      for (let i = startRow; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        // Pular linhas completamente vazias ou que parecem ser cabeçalho extra
        const rowStr = row.join('').trim();
        if (!rowStr) continue;

        const data_recebimento = parseData(row[0] ?? '');
        const contratoRaw      = String(row[1] ?? '').trim();
        const grupoRaw         = String(row[2] ?? '').trim();
        const cotaRaw          = String(row[3] ?? '').trim();
        const valorRaw         = row[4] ?? '';
        const parcelaRaw       = row[5] ?? '';

        const contrato = contratoRaw === '-' ? '' : contratoRaw;

        // Linha completamente vazia?
        if (!data_recebimento && !contrato && !grupoRaw && !cotaRaw) continue;
        
        // Pular linhas de cabeçalho repetido
        if (contratoRaw?.toLowerCase() === 'contrato' || grupoRaw?.toLowerCase() === 'grupo') continue;

        const valor   = parseValor(valorRaw);
        const parcela = parseInt(String(parcelaRaw).replace(/\D/g, ''), 10) || 1;

        items.push({ data_recebimento, contrato, grupo: grupoRaw, cota: cotaRaw, valor, parcela });
      }
    };

    if (isExcel) {
      // ── Ler Excel com XLSX (lê TODAS as linhas) ───────────────────────────
      const workbook = XLSX.read(uint8, { type: 'array', cellDates: false, raw: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      // sheet_to_json com header: 1 retorna array de arrays — nunca perde linhas
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
      console.log(`Excel: ${rows.length} linhas brutas na aba "${sheetName}"`);
      processarLinhas(rows, 1); // linha 0 = cabeçalho

    } else {
      // ── Ler CSV — tenta UTF-8 primeiro, fallback ISO-8859-1 ──────────────
      let csvContent = '';
      try {
        csvContent = new TextDecoder('utf-8', { fatal: true }).decode(uint8);
      } catch {
        csvContent = new TextDecoder('ISO-8859-1').decode(uint8);
      }
      
      // Remove BOM se existir
      csvContent = csvContent.replace(/^\uFEFF/, '');
      
      const lines = csvContent.split(/\r?\n/).filter(l => l.trim() !== '');
      console.log(`CSV: ${lines.length} linhas brutas`);

      // Detectar delimitador (semicolon, comma, tab)
      const firstLine = lines[0] || '';
      const delimiter = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';

      const parseLine = (line) => {
        const values = [];
        let cur = '', inQ = false;
        for (const ch of line) {
          if (ch === '"') { inQ = !inQ; }
          else if (ch === delimiter && !inQ) { values.push(cur.replace(/^"|"$/g, '').trim()); cur = ''; }
          else { cur += ch; }
        }
        values.push(cur.replace(/^"|"$/g, '').trim());
        return values;
      };

      const rows = lines.map(l => parseLine(l));
      processarLinhas(rows, 1); // linha 0 = cabeçalho
    }

    return Response.json({
      status: 'success',
      items,
      total: items.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Erro ao processar CSV:', error);
    return Response.json({ 
      status: 'error',
      error: error.message 
    }, { status: 500 });
  }
});