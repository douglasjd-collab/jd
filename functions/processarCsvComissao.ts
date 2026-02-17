import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Helper: normaliza grupo/cota (remove não-numéricos)
function normalizeGC(value) {
  const s = String(value ?? '').trim();
  const onlyDigits = s.replace(/\D/g, '');
  return onlyDigits || null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { file_url } = await req.json();

    if (!file_url) {
      return Response.json({ error: 'file_url é obrigatório' }, { status: 400 });
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
      const contrato = cleanedValues[1] || '';
      const grupo = cleanedValues[2] || '';
      const cota = cleanedValues[3] || '';
      const valorStr = cleanedValues[4] || '';
      const parcelaStr = cleanedValues[5] || '';
      
      // Validar dados mínimos (ignore_errors: true - não bloqueia processamento)
      if (!contrato && !grupo) {
        errors.push(`Linha ${i + 1}: Sem contrato nem grupo - dados: ${cleanedValues.slice(0, 6).join(', ')}`);
        // Adicionar mesmo assim para mostrar na pré-visualização
        items.push({
          data_recebimento,
          contrato,
          grupo,
          cota,
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
        grupo,
        cota,
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