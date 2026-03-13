import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { getDocument } from "npm:pdfjs-dist@4.9.155/legacy/build/pdf.mjs";

function limparLinhasPDF(texto) {
  return texto
    .split('\n')
    .map(l => l.trim())
    .filter(l => {
      if (!l || l.length < 10) return false;
      
      // Ignorar headers conhecidos
      if (l.match(/^QT\s+GRUPO/i)) return false;
      if (l.match(/Legendas:/i)) return false;
      if (l.match(/Prováveis Contemplados/i)) return false;
      if (l.match(/^\s*Página/i)) return false;
      if (l.match(/^\s*Data:/i)) return false;
      
      // Aceitar linhas que contenham grupo de 6 dígitos
      if (/\d{6}/.test(l)) return true;
      
      return false;
    });
}

function parseLinhaAssembleia(linha) {
  if (!linha) return null;
  
  // Formato: "1003102SERVIÇOS FAIXA IR$ 22.964,10Lance Livre20,0000%"
  
  // 1. QT (1-3 dígitos no início)
  const qtMatch = linha.match(/^(\d{1,3})/);
  const qt = qtMatch ? parseInt(qtMatch[1]) : null;
  
  // 2. GRUPO (6 dígitos após QT)
  const grupoMatch = linha.match(/^\d{1,3}(\d{6})/);
  const grupo = grupoMatch ? grupoMatch[1] : null;
  
  if (!grupo) return null;
  
  // 3. PERCENTUAL (número com vírgula seguido de %)
  const percentMatch = linha.match(/(\d{1,3},\d{2,4})%/);
  const percentual = percentMatch ? parseFloat(percentMatch[1].replace(',', '.')) : null;
  
  // 4. CRÉDITO (último R$ encontrado)
  const creditoMatches = [...linha.matchAll(/R\$\s*:?\s*([\d.]+,\d{2})/g)];
  const credito = creditoMatches.length > 0 
    ? parseFloat(creditoMatches[creditoMatches.length - 1][1].replace(/\./g, '').replace(',', '.'))
    : null;
  
  // 5. MODALIDADE
  let modalidade = "sorteio";
  
  if (linha.includes("Lance Livre")) {
    modalidade = "lance_livre";
  } else if (linha.includes("Lance Limitado")) {
    modalidade = "lance_limitado";
  } else if (linha.includes("Lance Fixo")) {
    if (percentual !== null) {
      if (percentual >= 14 && percentual <= 16) modalidade = "lance_fixo_15";
      else if (percentual >= 28 && percentual <= 32) modalidade = "lance_fixo_30";
      else if (percentual >= 48 && percentual <= 52) modalidade = "lance_fixo_50";
      else modalidade = "lance_fixo_30";
    }
  }
  
  // 6. DESCRIÇÃO
  let descricao = linha
    .replace(/^\d{1,3}\d{6}/, '') // Remove QT + grupo
    .split(/R\$/)[0] // Antes do R$
    .replace(/(Lance Livre|Lance Limitado|Sorteio|Lance Fixo)/g, '')
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

    const role = (user.perfil || user.role || "").toLowerCase();
    if (!["super_admin", "master", "admin", "gerente"].includes(role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    let empresa_id = user.empresa_id;
    if (!empresa_id) {
      const colabs = await base44.asServiceRole.entities.Colaborador.filter({ user_id: user.id, status: "ativo" });
      if (colabs?.[0]?.empresa_id) empresa_id = colabs[0].empresa_id;
    }
    if (!empresa_id) {
      return Response.json({ error: "Empresa não encontrada para o usuário" }, { status: 400 });
    }

    const body = await req.json();
    const { file_url, assembleia_data, chamada } = body;

    if (!file_url || !assembleia_data || !chamada) {
      return Response.json({ error: "file_url, assembleia_data e chamada são obrigatórios" }, { status: 400 });
    }

    // Baixar PDF
    const fileRes = await fetch(file_url);
    if (!fileRes.ok) {
      return Response.json({ error: "Falha ao baixar arquivo" }, { status: 400 });
    }

    const buf = await fileRes.arrayBuffer();

    // Extrair texto com pdfjs-dist
    const loadingTask = getDocument({ data: buf });
    const pdfDoc = await withTimeout(loadingTask.promise, 25000);
    
    let text = "";
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      // Agrupar itens por linha usando transform[5] (y-coordinate)
      let lastY = null;
      let line = "";
      for (const item of content.items) {
        const y = item.transform ? item.transform[5] : null;
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          text += line + "\n";
          line = item.str;
        } else {
          line += item.str;
        }
        lastY = y;
      }
      if (line) text += line + "\n";
    }

    console.log('=== TEXTO PDF (primeiros 2000 chars) ===');
    console.log(text.substring(0, 2000));

    // Parse
    const linhas = limparLinhasPDF(text);
    console.log('[DEBUG] Total linhas limpas:', linhas.length);

    const registros = linhas.map(parseLinhaAssembleia).filter(Boolean);
    console.log('[DEBUG] Total registros parseados:', registros.length);

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