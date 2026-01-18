import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
    
    // Processar linhas de dados
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      
      // Pular linhas vazias
      if (!line.trim()) continue;
      
      // Parse CSV com delimiter ";" e quote "\""
      const values = [];
      let currentValue = '';
      let insideQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        
        if (char === '"') {
          insideQuotes = !insideQuotes;
        } else if (char === ';' && !insideQuotes) {
          values.push(currentValue.trim());
          currentValue = '';
        } else {
          currentValue += char;
        }
      }
      values.push(currentValue.trim());
      
      console.log(`Linha ${i + 1}: ${values.length} colunas - [${values.join(', ')}]`);
      
      // Validar se não é linha completamente vazia
      if (values.every(v => !v)) {
        console.log(`Linha ${i + 1} ignorada: vazia`);
        continue;
      }
      
      // Aceitar linhas com 6 ou mais colunas (strict_mode: false)
      if (values.length < 6) {
        console.log(`Linha ${i + 1} ignorada: apenas ${values.length} colunas`);
        continue;
      }
      
      // Mapeamento: Data, Contrato, Grupo, Cota, Valor, Nº Parcela
      const data_recebimento = values[0] || '';
      const contrato = values[1] || '';
      const grupo = values[2] || '';
      const cota = values[3] || '';
      const valorStr = values[4] || '';
      const parcelaStr = values[5] || '';
      
      // Validar se tem dados mínimos
      if (!contrato && !grupo) {
        console.log(`Linha ${i + 1} ignorada: sem contrato nem grupo`);
        continue;
      }
      
      // NORMALIZAÇÃO DE VALOR
      let valor = 0;
      try {
        const valorLimpo = String(valorStr).trim().replace(',', '.');
        valor = parseFloat(valorLimpo);

        if (isNaN(valor) || valor <= 0) {
          errors.push(`Linha ${i + 1}: Valor inválido - "${valorStr}"`);
          continue;
        }
      } catch (e) {
        errors.push(`Linha ${i + 1}: Erro ao processar valor - ${e.message}`);
        continue;
      }
      
      // NORMALIZAÇÃO DE PARCELA
      let parcela = 1;
      try {
        const parcelaLimpa = String(parcelaStr).trim().replace(/[^\d]/g, '');
        parcela = parseInt(parcelaLimpa, 10);

        if (!parcela || isNaN(parcela) || parcela <= 0) {
          parcela = 1;
        }
      } catch (e) {
        parcela = 1;
      }
      
      items.push({
        data_recebimento: data_recebimento.trim(),
        contrato: contrato.trim(),
        grupo: grupo.trim(),
        cota: cota.trim(),
        valor,
        parcela
      });
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