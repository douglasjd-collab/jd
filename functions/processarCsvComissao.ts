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
  let venda = await entity.findFirst({ 
    filter: { ...filterBase, grupo: String(grupo), cota: String(cota) } 
  });
  if (venda) return venda;

  const gNum = Number(grupo);
  const cNum = Number(cota);
  if (!Number.isNaN(gNum) && !Number.isNaN(cNum)) {
    venda = await entity.findFirst({ 
      filter: { ...filterBase, grupo: gNum, cota: cNum } 
    });
    if (venda) return venda;
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
    let vendaContrato = await mainTable.findFirst({ filter: { ...filterBase, contrato } });
    if (vendaContrato) return { venda: vendaContrato, motivo: null, produtoEncontrado: args.produto };

    vendaContrato = await mainTable.findFirst({ filter: { contrato } });
    if (vendaContrato) return { venda: vendaContrato, motivo: null, produtoEncontrado: args.produto };
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
    
    // Decodificar como ISO-8859-1 (Latin-1)
    const decoder = new TextDecoder('ISO-8859-1');
    const csvContent = decoder.decode(arrayBuffer);

    // Processar CSV linha por linha com encoding ISO-8859-1, delimiter ";"
    const lines = csvContent.split(/\r?\n/);
    
    const items = [];
    const errors = [];
    let headers = [];
    let startIndex = 0;
    
    // HEADER = TRUE: Primeira linha sempre é cabeçalho
    if (lines.length > 0) {
      const firstLine = lines[0];
      // Parse header
      const headerValues = [];
      let currentValue = '';
      let insideQuotes = false;
      
      for (let j = 0; j < firstLine.length; j++) {
        const char = firstLine[j];
        if (char === '"') {
          insideQuotes = !insideQuotes;
        } else if (char === ';' && !insideQuotes) {
          headerValues.push(currentValue.trim());
          currentValue = '';
        } else {
          currentValue += char;
        }
      }
      headerValues.push(currentValue.trim());
      
      headers = headerValues;
      startIndex = 1; // Pular cabeçalho
    }
    
    // Processar linhas de dados (ignore_errors: true, allow_multiline: true)
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      
      // Pular linhas vazias
      if (!line.trim()) continue;
      
      // Parse CSV com delimiter ";" e quote "\"" - permite multiline
      const values = [];
      let currentValue = '';
      let insideQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        
        if (char === '"') {
          insideQuotes = !insideQuotes;
        } else if (char === ';' && !insideQuotes) {
          values.push(currentValue);
          currentValue = '';
        } else {
          currentValue += char;
        }
      }
      values.push(currentValue);
      
      // Remover aspas e trim
      const cleanedValues = values.map(v => v.replace(/^"|"$/g, '').trim());
      
      console.log(`Linha ${i + 1}: ${cleanedValues.length} colunas - [${cleanedValues.slice(0, 6).join(' | ')}]`);
      
      // Validar se não é linha completamente vazia
      if (cleanedValues.every(v => !v)) {
        continue;
      }
      
      // strict_mode: false - aceitar qualquer quantidade de colunas
      // Mapeamento: Data, Contrato, Grupo, Cota, Valor, Nº Parcela
       const data_recebimento = cleanedValues[0] || '';
       const contratoRaw = cleanedValues[1] || '';
       const grupoRaw = cleanedValues[2] || '';
       const cotaRaw = cleanedValues[3] || '';
       const valorStr = cleanedValues[4] || '';
       const parcelaStr = cleanedValues[5] || '';

       // Normaliza contrato (remover espaços)
       const contrato = String(contratoRaw).trim();
      
      // Validar dados mínimos (ignore_errors: true - não bloqueia processamento)
       if (!contrato && !grupoRaw) {
         errors.push(`Linha ${i + 1}: Sem contrato nem grupo - dados: ${cleanedValues.slice(0, 6).join(', ')}`);
         // Adicionar mesmo assim para mostrar na pré-visualização
         items.push({
           data_recebimento,
           contrato,
           grupo: grupoRaw,
           cota: cotaRaw,
           valor: 0,
           parcela: 1,
           _error: 'Sem contrato nem grupo'
         });
         continue;
       }
      
      // NORMALIZAÇÃO DE VALOR (formato brasileiro: R$ 1.000,00)
      let valor = 0;
      let valorError = null;
      try {
        let valorLimpo = String(valorStr).trim();
        // 1. Remover "R$"
        valorLimpo = valorLimpo.replace(/R\$/g, '');
        // 2. Remover espaços
        valorLimpo = valorLimpo.replace(/\s/g, '');
        // 3. Remover pontos de milhar "."
        valorLimpo = valorLimpo.replace(/\./g, '');
        // 4. Substituir vírgula "," por ponto "."
        valorLimpo = valorLimpo.replace(',', '.');
        // 5. Converter para número (float)
        valor = parseFloat(valorLimpo);

        if (isNaN(valor) || valor <= 0) {
          valorError = `Valor inválido: "${valorStr}"`;
          valor = 0;
        }
      } catch (e) {
        valorError = `Erro ao processar valor: ${e.message}`;
        valor = 0;
      }
      
      // NORMALIZAÇÃO DE PARCELA (tolerar erros)
      let parcela = 1;
      try {
        const parcelaLimpa = String(parcelaStr).trim().replace(/[^\d]/g, '');
        const parcelaNum = parseInt(parcelaLimpa, 10);
        if (parcelaNum && !isNaN(parcelaNum) && parcelaNum > 0) {
          parcela = parcelaNum;
        }
      } catch (e) {
        // Usar padrão 1
      }
      
      const item = {
         data_recebimento,
         contrato,
         grupo: grupoRaw,
         cota: cotaRaw,
         valor,
         parcela
       };
      
      // Marcar erro se houver
      if (valorError) {
        item._error = valorError;
        errors.push(`Linha ${i + 1}: ${valorError}`);
      }
      
      items.push(item);
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