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
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
    
    const items = [];
    
    for (let i = 0; i < lines.length; i++) {
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
        } else if (char === ',' && !insideQuotes) {
          values.push(currentValue.trim());
          currentValue = '';
        } else {
          currentValue += char;
        }
      }
      values.push(currentValue.trim());
      
      // Validar se tem pelo menos 7 colunas
      if (values.length < 7) {
        console.log(`Linha ${i + 1} ignorada: menos de 7 colunas`);
        continue;
      }
      
      // Extrair dados
      const [data_recebimento, contrato, grupo, cota, valorStr, parcelaStr, administradora] = values;
      
      // Pular linha de cabeçalho
      if (i === 0 && (data_recebimento.toLowerCase().includes('data') || contrato.toLowerCase().includes('contrato'))) {
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