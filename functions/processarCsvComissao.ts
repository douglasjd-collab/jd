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
      // strict_mode: false, ignore_errors: false
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
      
      // Validar se tem pelo menos 6 colunas
      if (values.length < 6) {
        console.log(`Linha ${i + 1} ignorada: apenas ${values.length} colunas`);
        continue;
      }
      
      // Mapeamento exato: Data, Contratro (typo), Grupo, Cota, Nº Parcela, Valor
      const [data_recebimento, contrato, grupo, cota, parcelaStr, valorStr] = values;
      
      // Validar se não é linha vazia
      if (!contrato.trim() && !grupo.trim()) {
        continue;
      }
      
      // NORMALIZAÇÃO DE PARCELA
      // Número da parcela recebida em numeral: 1, 2, 3, 4, 5, 800, 12
      let parcela = 0;
      try {
        const parcelaLimpa = parcelaStr.trim().replace(/[^\d]/g, '');
        parcela = parseInt(parcelaLimpa, 10);

        if (!parcela || isNaN(parcela) || parcela <= 0) {
          errors.push(`Linha ${i + 1}: Parcela inválida - valor original: "${parcelaStr}"`);
          continue;
        }
      } catch (e) {
        errors.push(`Linha ${i + 1}: Erro ao processar parcela - ${e.message}`);
        continue;
      }

      // NORMALIZAÇÃO DE VALOR MONETÁRIO
      // Ex: R$ 600,00 -> 600.00 | R$ 840,00 -> 840.00 | R$ 1.000,00 -> 1000.00
      let valor = 0;
      try {
        // Converter para string e limpar
        let valorLimpo = String(valorStr).trim();
        
        // Log do valor original para debug
        console.log(`Linha ${i + 1} - Valor original: "${valorStr}"`);

        // Remover R$ e variações
        valorLimpo = valorLimpo.replace(/R\$/gi, '').replace(/\$/gi, '');
        
        // Remover espaços
        valorLimpo = valorLimpo.replace(/\s+/g, '');
        
        // Remover aspas
        valorLimpo = valorLimpo.replace(/["']/g, '');

        // Remover APENAS pontos que são separadores de milhar
        // Mantém o último ponto/vírgula como separador decimal
        // Ex: "1.000,00" -> "1000,00"
        const lastComma = valorLimpo.lastIndexOf(',');
        const lastDot = valorLimpo.lastIndexOf('.');
        
        if (lastComma > lastDot) {
          // Vírgula é o separador decimal
          // Remove todos os pontos (são de milhar)
          valorLimpo = valorLimpo.replace(/\./g, '');
          // Substitui vírgula por ponto
          valorLimpo = valorLimpo.replace(',', '.');
        } else if (lastDot > lastComma) {
          // Ponto é o separador decimal
          // Remove vírgulas (são de milhar)
          valorLimpo = valorLimpo.replace(/,/g, '');
          // Ponto já está correto
        } else {
          // Sem separador decimal ou só um deles
          valorLimpo = valorLimpo.replace(/\./g, '').replace(',', '.');
        }

        valor = parseFloat(valorLimpo);
        
        console.log(`Linha ${i + 1} - Valor processado: ${valor}`);

        if (isNaN(valor) || valor <= 0) {
          errors.push(`Linha ${i + 1}: Valor inválido - valor original: "${valorStr}", processado: "${valorLimpo}"`);
          continue;
        }
      } catch (e) {
        errors.push(`Linha ${i + 1}: Erro ao processar valor - ${e.message}`);
        continue;
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