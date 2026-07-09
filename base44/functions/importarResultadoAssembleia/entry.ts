import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
import { getDocumentProxy } from "npm:unpdf@0.12.1";

function limparLinhasPDF(texto) {
  return texto
    .split('\n')
    .map(l => l.trim())
    .filter(l => {
      if (!l || l.length < 5) return false;
      
      // Ignorar headers conhecidos
      if (l.match(/^QT[\s.]+GRUPO/i)) return false;
      if (l.match(/Legendas/i)) return false;
      if (l.match(/Prováveis Contemplados/i)) return false;
      if (l.match(/Pedra Chave/i)) return false;
      if (l.match(/Qtd\.\s*Participantes/i)) return false;
      if (l.match(/^\s*Página/i)) return false;
      if (l.match(/^\s*Data:/i)) return false;
      if (l.match(/^S\s*[-|]/i)) return false;
      
      // Aceitar linhas que contenham grupo de 6 dígitos
      if (/\d{6}/.test(l)) return true;
      
      return false;
    });
}

function parseLinhaAssembleia(linha) {
  if (!linha) return null;
  
  // Suporta múltiplos formatos:
  // Formato A (sem espaço): "1003102SERVIÇOS FAIXA IR$ 22.964,10Lance Livre20,0000%"
  // Formato B (com espaço): "1 003103 SERVIÇOS FAIXA I R$ 10.531,96 Lance Livre 50,0000%"
  // Formato C (com pontos no grupo): "1 003.103 SERVIÇOS FAIXA I R$ 10.531,96 Lance Livre 50,0000%"
  
  // 1. Extrair QT e GRUPO
  let qt = null;
  let grupo = null;
  let resto = linha;

  // Formato C: número, espaço, 3 dígitos, ponto, 3 dígitos
  const formatoCMatch = linha.match(/^(\d{1,3})\s+(\d{3})\.(\d{3})\s+(.*)/);
  if (formatoCMatch) {
    qt = parseInt(formatoCMatch[1]);
    grupo = formatoCMatch[2] + formatoCMatch[3];
    resto = formatoCMatch[4];
  }
  // Formato B: número, espaço, 6 dígitos
  else {
    const formatoBMatch = linha.match(/^(\d{1,3})\s+(\d{6})\s+(.*)/);
    if (formatoBMatch) {
      qt = parseInt(formatoBMatch[1]);
      grupo = formatoBMatch[2];
      resto = formatoBMatch[3];
    } else {
      // Formato A: QT colado ao GRUPO
      const formatoAMatch = linha.match(/^(\d{1,3})(\d{6})(.*)/);
      if (formatoAMatch) {
        qt = parseInt(formatoAMatch[1]);
        grupo = formatoAMatch[2];
        resto = formatoAMatch[3];
      }
    }
  }
  
  if (!grupo) return null;
  
  // 2. CRÉDITO (último R$ encontrado)
  const creditoMatches = [...linha.matchAll(/R\$\s*:?\s*([\d.]+,\d{2})/g)];
  const credito = creditoMatches.length > 0 
    ? parseFloat(creditoMatches[creditoMatches.length - 1][1].replace(/\./g, '').replace(',', '.'))
    : null;
  
  // 3. PERCENTUAL (número com vírgula ou ponto seguido de %)
  const percentMatch = linha.match(/(\d{1,3}[,.]\d{2,4})\s*%/);
  const percentual = percentMatch ? parseFloat(percentMatch[1].replace(',', '.')) : null;
  
  // 4. MODALIDADE
  let modalidade = "sorteio";
  if (linha.match(/Lance\s*Livre/i)) {
    modalidade = "lance_livre";
  } else if (linha.match(/Lance\s*Limitado/i)) {
    modalidade = "lance_limitado";
  } else if (linha.match(/Lance\s*Fixo/i)) {
    if (percentual !== null) {
      if (percentual >= 14 && percentual <= 16) modalidade = "lance_fixo_15";
      else if (percentual >= 28 && percentual <= 32) modalidade = "lance_fixo_30";
      else if (percentual >= 48 && percentual <= 52) modalidade = "lance_fixo_50";
      else modalidade = "lance_fixo_30";
    }
  }
  
  // 5. DESCRIÇÃO: tudo entre o grupo e o primeiro R$
  let descricao = resto
    .split(/R\$/)[0]
    .replace(/(Lance\s*Livre|Lance\s*Limitado|Sorteio|Lance\s*Fixo)/gi, '')
    .trim();
  
  return {
    qt,
    grupo,
    descricao,
    credito,
    modalidade,
    lance_percent: percentual
  };
}

function withTimeout(promise, ms = 25000) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`Timeout após ${ms}ms`)), ms);
    promise.then(v => { clearTimeout(id); resolve(v); })
           .catch(e => { clearTimeout(id); reject(e); });
  });
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Buscar colaborador para verificar perfil real
    let colab = null;
    let empresa_id = user.empresa_id;
    const colabs = await base44.asServiceRole.entities.Colaborador.filter({ user_id: user.id });
    if (colabs?.length) {
      colab = colabs.find(c => c.status === 'ativo') || colabs[0];
      empresa_id = colab?.empresa_id || empresa_id;
    }

    const perfil = colab?.perfil || user.perfil || user.role || '';
    if (!["super_admin", "master", "admin", "gerente"].includes(perfil.toLowerCase())) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { file_url, assembleia_data, chamada } = body;

    if (!empresa_id) {
      return Response.json({ error: "Empresa não encontrada para o usuário" }, { status: 400 });
    }

    if (!file_url || !assembleia_data || !chamada) {
      return Response.json({ error: "file_url, assembleia_data e chamada são obrigatórios" }, { status: 400 });
    }

    // Baixar PDF
    const fileRes = await fetch(file_url);
    if (!fileRes.ok) {
      return Response.json({ error: "Falha ao baixar arquivo" }, { status: 400 });
    }

    const buf = await fileRes.arrayBuffer();

    // Extrair texto com unpdf (wrapper do pdfjs-dist sem worker, compatível com Deno)
    const pdfDoc = await withTimeout(getDocumentProxy(new Uint8Array(buf)), 25000);
    
    let text = "";
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      // Agrupar itens por linha usando transform[5] (y-coordinate)
      // E ordenar por x (transform[4]) dentro de cada linha
      const rawItems = content.items.filter(it => it.str && it.str.trim());
      const linesMap = new Map();
      for (const item of rawItems) {
        const y = item.transform ? Math.round(item.transform[5]) : 0;
        const x = item.transform ? item.transform[4] : 0;
        if (!linesMap.has(y)) linesMap.set(y, []);
        linesMap.get(y).push({ str: item.str, x });
      }
      // Ordenar linhas por y (decrescente = de cima para baixo no PDF)
      const sortedYs = [...linesMap.keys()].sort((a, b) => b - a);
      for (const y of sortedYs) {
        const items = linesMap.get(y);
        // Ordenar itens dentro da linha por x (esquerda para direita)
        items.sort((a, b) => a.x - b.x);
        text += items.map(it => it.str).join('') + "\n";
      }
    }

    // Parse
    const linhas = limparLinhasPDF(text);
    const registros = linhas.map(parseLinhaAssembleia).filter(Boolean);
    console.log('[importarResultadoAssembleia] Total registros parseados:', registros.length);

    const arquivo_nome = file_url.split('/').pop() || 'arquivo.pdf';

    // 🟢 ETAPA 1: Criar histórico vazio e salvar payload
    const historico = await base44.asServiceRole.entities.HistoricoLanceGrupo.create({
      empresa_id,
      assembleia_data,
      chamada,
      arquivo_nome,
      status: 'ATIVO',
      total_grupos: 0,
      total_registros: 0,
      criado_em: new Date().toISOString(),
      usuario_id: user.id,
      usuario_nome: user.full_name || user.email
    });

    const importacao = await base44.asServiceRole.entities.ImportacaoAssembleia.create({
      empresa_id,
      assembleia_data,
      chamada,
      arquivo_nome,
      file_url,
      status: 'PARSE_OK',
      payload_json: JSON.stringify(registros),
      total_registros: registros.length,
      registros_processados: 0,
      historico_id: historico.id,
      usuario_id: user.id,
      usuario_nome: user.full_name || user.email
    });

    return Response.json({
      sucesso: true,
      importacao_id: importacao.id,
      historico_id: historico.id,
      total_registros: registros.length,
      mensagem: 'Parse concluído. Inicie o processamento no frontend.'
    });

  } catch (e) {
    console.error("[importarResultadoAssembleia] ERRO:", e);
    return Response.json(
      { error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
});