import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";
import pdfParse from "npm:pdf-parse@1.1.1";

function chunkArray(arr, size = 25) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

function agruparPorGrupoEModalidade(registros) {
  const grupos = new Map();
  
  for (const reg of registros) {
    const key = `${reg.grupo}_${reg.modalidade}`;
    
    if (!grupos.has(key)) {
      grupos.set(key, {
        grupo: reg.grupo,
        modalidade: reg.modalidade,
        percentuais: []
      });
    }
    
    if (reg.lance_percent !== null) {
      grupos.get(key).percentuais.push(reg.lance_percent);
    }
  }
  
  const resumos = [];
  for (const [key, data] of grupos) {
    const percentuais = data.percentuais;
    const menor = percentuais.length > 0 ? Math.min(...percentuais) : null;
    const maior = percentuais.length > 0 ? Math.max(...percentuais) : null;
    
    resumos.push({
      grupo: data.grupo,
      modalidade: data.modalidade,
      menor_lance_percent: menor,
      maior_lance_percent: maior,
      qtd_ocorrencias: percentuais.length || 1
    });
  }
  
  return resumos;
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

    const buf = new Uint8Array(await fileRes.arrayBuffer());
    const parsed = await withTimeout(pdfParse(buf), 25000);
    const text = parsed.text || "";

    console.log('=== TEXTO PDF (primeiros 2000 chars) ===');
    console.log(text.substring(0, 2000));

    // Parse
    const linhas = limparLinhasPDF(text);
    console.log('[DEBUG] Total linhas limpas:', linhas.length);
    console.log('[DEBUG] Primeiras 20 linhas:');
    linhas.slice(0, 20).forEach((l, i) => console.log(`  [${i}] ${l}`));

    const registros = linhas.map(parseLinhaAssembleia).filter(Boolean);
    console.log('[DEBUG] Total registros parseados:', registros.length);
    console.log('[DEBUG] Primeiros 20 registros:');
    registros.slice(0, 20).forEach((r, i) => {
      console.log(`  [${i}] QT:${r.qt} Grupo:${r.grupo} Mod:${r.modalidade} Lance:${r.lance_percent}% Créd:${r.credito}`);
    });

    const totalGrupos = new Set(registros.map(r => r.grupo)).size;

    // Se não encontrou nada, salvar histórico vazio
    if (registros.length === 0) {
      const arquivo_nome = file_url.split('/').pop() || 'arquivo.pdf';
      
      const historico = await base44.asServiceRole.entities.HistoricoLanceGrupo.create({
        empresa_id,
        assembleia_data,
        chamada,
        arquivo_nome,
        total_grupos: 0,
        total_registros: 0,
        criado_em: new Date().toISOString(),
        usuario_id: user.id,
        usuario_nome: user.full_name || user.email
      });

      return Response.json({
        sucesso: true,
        aviso: "Nenhuma linha válida encontrada no PDF",
        historico_id: historico.id,
        total_lances: 0,
        total_grupos: 0
      });
    }

    const arquivo_nome = file_url.split('/').pop() || 'arquivo.pdf';

    // Criar histórico principal
    const historico = await base44.asServiceRole.entities.HistoricoLanceGrupo.create({
      empresa_id,
      assembleia_data,
      chamada,
      arquivo_nome,
      total_grupos: totalGrupos,
      total_registros: registros.length,
      criado_em: new Date().toISOString(),
      usuario_id: user.id,
      usuario_nome: user.full_name || user.email
    });

    // 🚀 Salvar detalhes em LOTE (bulkCreate - 1 request só)
    const detalhesParaCriar = registros.map(r => ({
      empresa_id,
      historico_id: historico.id,
      qt: r.qt,
      grupo: r.grupo,
      descricao: r.descricao,
      credito: r.credito,
      modalidade: r.modalidade,
      lance_percent: r.lance_percent
    }));
    
    await base44.asServiceRole.entities.HistoricoLanceDetalhe.bulkCreate(detalhesParaCriar);

    // 🔹 Identificar chamada
    const isSegundaChamada = chamada === 'Segunda';
    
    // Agrupar por grupo + modalidade
    const resumos = agruparPorGrupoEModalidade(registros);
    
    // 🔹 Buscar registros existentes (1 request)
    let registrosExistentes = [];
    
    if (isSegundaChamada) {
      const [ano, mes] = assembleia_data.split('-');
      const mesAno = `${ano}-${mes}`;
      
      // Buscar todos resumos da empresa no mesmo mês/ano
      const todosResumos = await base44.asServiceRole.entities.HistoricoLanceResumo.filter({
        empresa_id
      });
      
      // Filtrar por mês/ano em memória
      for (const r of todosResumos) {
        const hist = await base44.asServiceRole.entities.HistoricoLanceGrupo.filter({ id: r.historico_id });
        if (hist?.[0]?.assembleia_data) {
          const [anoHist, mesHist] = hist[0].assembleia_data.split('-');
          const mesAnoHist = `${anoHist}-${mesHist}`;
          
          if (mesAnoHist === mesAno) {
            registrosExistentes.push(r);
          }
        }
      }
    }
    
    // 🔹 Criar mapa de controle (MEMÓRIA)
    const mapaExistentes = {};
    for (const r of registrosExistentes) {
      const chave = `${r.grupo}_${r.modalidade}`;
      mapaExistentes[chave] = r;
    }
    
    // 🔹 Gerar payload FINAL (sem duplicar)
    const payloadCreate = [];
    const payloadUpdate = [];
    
    for (const r of resumos) {
      const chave = `${r.grupo}_${r.modalidade}`;
      
      if (isSegundaChamada && mapaExistentes[chave]) {
        // Segunda chamada e existe: atualizar
        const existente = mapaExistentes[chave];
        
        // 🔥 REGRA: Preservar o MAIOR lance entre primeira e segunda chamada
        const maiorFinal =
          existente.maior_lance_percent !== null && r.maior_lance_percent !== null
            ? Math.max(existente.maior_lance_percent, r.maior_lance_percent)
            : (existente.maior_lance_percent ?? r.maior_lance_percent ?? null);
        
        payloadUpdate.push({
          id: existente.id,
          menor_lance_percent: r.menor_lance_percent ?? existente.menor_lance_percent ?? null,
          maior_lance_percent: maiorFinal,
          qtd_ocorrencias: (existente.qtd_ocorrencias ?? 0) + (r.qtd_ocorrencias ?? 1)
        });
      } else {
        // Primeira chamada OU não existe: criar
        payloadCreate.push({
          empresa_id,
          historico_id: historico.id,
          grupo: r.grupo,
          modalidade: r.modalidade,
          menor_lance_percent: r.menor_lance_percent ?? null,
          maior_lance_percent: r.maior_lance_percent ?? null,
          qtd_ocorrencias: r.qtd_ocorrencias ?? 1
        });
      }
    }
    
    // 🔹 EXECUÇÃO SEM RATE LIMIT
    // ✅ CREATE EM LOTE (1 request)
    if (payloadCreate.length > 0) {
      await base44.asServiceRole.entities.HistoricoLanceResumo.bulkCreate(payloadCreate);
    }
    
    // ✅ UPDATE EM LOTE (chunked para evitar rate limit)
    if (payloadUpdate.length > 0) {
      const blocos = chunkArray(payloadUpdate, 25);
      
      for (const bloco of blocos) {
        await Promise.all(bloco.map(item => 
          base44.asServiceRole.entities.HistoricoLanceResumo.update(item.id, {
            menor_lance_percent: item.menor_lance_percent,
            maior_lance_percent: item.maior_lance_percent,
            qtd_ocorrencias: item.qtd_ocorrencias
          })
        ));
        
        if (blocos.length > 1) {
          await sleep(400); // Evita rate limit entre blocos
        }
      }
    }

    return Response.json({
      sucesso: true,
      historico_id: historico.id,
      total_lances: registros.length,
      total_grupos: totalGrupos,
      total_resumos_criados: payloadCreate.length,
      total_resumos_atualizados: payloadUpdate.length
    });

  } catch (e) {
    console.error("[importarResultadoAssembleia] ERRO:", e);
    return Response.json(
      { error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
});