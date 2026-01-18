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

    // Processar CSV linha por linha
    const lines = csvContent.split(/\r?\n/);
    
    const items = [];
    let startIndex = 0;
    
    // Detectar se primeira linha é cabeçalho
    if (lines.length > 0) {
      const firstLine = lines[0].toLowerCase();
      if (firstLine.includes('data') || firstLine.includes('contrato') || firstLine.includes('grupo')) {
        startIndex = 1; // Pular cabeçalho
      }
    }
    
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      
      // Pular linhas vazias
      if (!line.trim()) continue;
      
      // Parse CSV considerando aspas
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
      
      // Validar se tem pelo menos 6 colunas (Data;Contrato;Grupo;Cota;Nº Parcela;Valor)
      if (values.length < 6) {
        console.log(`Linha ${i + 1} ignorada: apenas ${values.length} colunas`);
        continue;
      }
      
      // Extrair dados (ordem: Data, Contrato, Grupo, Cota, Nº Parcela, Valor)
      const [data_recebimento, contrato, grupo, cota, parcelaStr, valorStr] = values;
      
      // Validar se não é linha vazia ou inválida
      if (!contrato.trim() && !grupo.trim()) {
        continue;
      }
      
      // Converter valor e parcela
      let valor = 0;
      let parcela = 0;
      
      try {
        // Limpar valor: remover R$, pontos de milhares, trocar vírgula por ponto
        const valorLimpo = valorStr.replace(/R\$\s*/g, '').replace(/\./g, '').replace(',', '.');
        valor = parseFloat(valorLimpo) || 0;
        
        parcela = parseInt(parcelaStr) || 0;
      } catch (e) {
        console.log(`Erro ao converter valores na linha ${i + 1}:`, e.message);
      }
      
      items.push({
        data_recebimento: data_recebimento.trim(),
        contrato: contrato.trim(),
        grupo: grupo.trim(),
        cota: cota.trim(),
        valor,
        parcela,
        administradora: administradora.trim()
      });
    }

    return Response.json({
      status: 'success',
      items,
      total: items.length
    });

  } catch (error) {
    console.error('Erro ao processar CSV:', error);
    return Response.json({ 
      status: 'error',
      error: error.message 
    }, { status: 500 });
  }
});