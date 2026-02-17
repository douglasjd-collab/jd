import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

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
    
    if (reg.lance_percent !== null && reg.lance_percent !== undefined) {
      let valor = reg.lance_percent;

      // Se vier como string tipo "61.6789%" ou "61,6789%"
      if (typeof valor === "string") {
        valor = valor
          .replace('%', '')
          .replace(',', '.')
          .trim();
      }

      const numero = parseFloat(valor);

      if (!isNaN(numero)) {
        grupos.get(key).percentuais.push(numero);
      }
    }
  }
  
  const resumos = [];
  for (const [key, data] of grupos) {
    const percentuais = data.percentuais;
    const menor = percentuais.length > 0 ? Math.min(...percentuais) : null;
    const maior = percentuais.length > 0 ? Math.max(...percentuais) : null;
    
    // Calcular média
    const soma = percentuais.reduce((acc, val) => acc + val, 0);
    const media = percentuais.length > 0 ? soma / percentuais.length : null;
    
    resumos.push({
      grupo: data.grupo,
      modalidade: data.modalidade,
      menor_lance_percent: menor,
      maior_lance_percent: maior,
      media_lance_percent: media,
      qtd_ocorrencias: percentuais.length || 1
    });
  }
  
  return resumos;
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

    const body = await req.json();
    const { importacao_id, offset = 0, limit = 10 } = body;

    if (!importacao_id) {
      return Response.json({ error: "importacao_id é obrigatório" }, { status: 400 });
    }

    // Buscar importação
    const importacao = await base44.asServiceRole.entities.ImportacaoAssembleia.filter({ id: importacao_id });
    if (!importacao || importacao.length === 0) {
      return Response.json({ error: "Importação não encontrada" }, { status: 404 });
    }

    const imp = importacao[0];
    const registros = JSON.parse(imp.payload_json || '[]');
    
    // Usar o historico_id que já foi criado na etapa 1 (importarResultadoAssembleia)
    let historico_id = imp.historico_id;
    
    if (!historico_id) {
      return Response.json({ error: "historico_id não encontrado na importação" }, { status: 400 });
    }
    
    // Se é a primeira chamada (offset = 0), atualizar os totais do histórico
    if (offset === 0) {
      const totalGrupos = new Set(registros.map(r => r.grupo)).size;
      
      await base44.asServiceRole.entities.HistoricoLanceGrupo.update(historico_id, {
        total_grupos: totalGrupos,
        total_registros: registros.length
      });
      
      // Atualizar status da importação
      await base44.asServiceRole.entities.ImportacaoAssembleia.update(imp.id, {
        status: 'PROCESSANDO'
      });
    }

    // 🟢 ETAPA 2: Processar SLICE de registros
    const slice = registros.slice(offset, offset + limit);
    
    if (slice.length === 0) {
      // Concluído
      await base44.asServiceRole.entities.ImportacaoAssembleia.update(imp.id, {
        status: 'CONCLUIDO',
        registros_processados: registros.length
      });
      
      return Response.json({
        sucesso: true,
        concluido: true,
        total_registros: registros.length,
        registros_processados: registros.length
      });
    }

    // Salvar detalhes
    const detalhesParaCriar = slice.map(r => ({
      empresa_id: imp.empresa_id,
      historico_id,
      qt: r.qt,
      grupo: r.grupo,
      descricao: r.descricao,
      credito: r.credito,
      modalidade: r.modalidade,
      lance_percent: r.lance_percent
    }));
    
    await base44.asServiceRole.entities.HistoricoLanceDetalhe.bulkCreate(detalhesParaCriar);

    // Atualizar resumos (apenas do slice atual)
    const resumos = agruparPorGrupoEModalidade(slice);
    
    const isSegundaChamada = ['Segunda', 'Terceira', 'Quarta', 'Quinta', 'Sexta', 'Sétima'].includes(imp.chamada);
    
    // Buscar resumos existentes da primeira chamada (se segunda chamada)
    let resumosPrimeiraChamada = [];
    if (isSegundaChamada) {
      const [ano, mes] = imp.assembleia_data.split('-');
      const mesAno = `${ano}-${mes}`;
      
      const todosHistoricos = await base44.asServiceRole.entities.HistoricoLanceGrupo.filter({
        empresa_id: imp.empresa_id,
        chamada: 'Primeira'
      });
      
      for (const hist of todosHistoricos) {
        const [anoHist, mesHist] = hist.assembleia_data.split('-');
        const mesAnoHist = `${anoHist}-${mesHist}`;
        
        if (mesAnoHist === mesAno) {
          const resumosHist = await base44.asServiceRole.entities.HistoricoLanceResumo.filter({
            historico_id: hist.id
          });
          resumosPrimeiraChamada.push(...resumosHist);
        }
      }
    }
    
    const mapaPrimeiraChamada = {};
    for (const r of resumosPrimeiraChamada) {
      const chave = `${r.grupo}_${r.modalidade}`;
      mapaPrimeiraChamada[chave] = r;
    }
    
    // Buscar resumos já criados para este historico_id
    const resumosAtuais = await base44.asServiceRole.entities.HistoricoLanceResumo.filter({
      historico_id
    });
    
    const mapaAtuais = {};
    for (const r of resumosAtuais) {
      const chave = `${r.grupo}_${r.modalidade}`;
      mapaAtuais[chave] = r;
    }
    
    const payloadCreate = [];
    const payloadUpdate = [];
    
    for (const r of resumos) {
      const chave = `${r.grupo}_${r.modalidade}`;
      
      if (mapaAtuais[chave]) {
        // Já existe resumo para este historico_id, atualizar
        const existente = mapaAtuais[chave];
        // Recalcular média combinando os dados
        const qtdExistente = existente.qtd_ocorrencias ?? 0;
        const qtdNova = r.qtd_ocorrencias ?? 1;
        const somaExistente = (existente.media_lance_percent ?? 0) * qtdExistente;
        const somaNova = (r.media_lance_percent ?? 0) * qtdNova;
        const novaMedia = (somaExistente + somaNova) / (qtdExistente + qtdNova);
        
        payloadUpdate.push({
          id: existente.id,
          menor_lance_percent: Math.min(existente.menor_lance_percent ?? 999, r.menor_lance_percent ?? 999),
          maior_lance_percent: Math.max(existente.maior_lance_percent ?? 0, r.maior_lance_percent ?? 0),
          media_lance_percent: novaMedia,
          qtd_ocorrencias: qtdExistente + qtdNova
        });
      } else {
        // Criar novo resumo para este historico_id
        let menor_final = r.menor_lance_percent;
        let maior_final = r.maior_lance_percent;
        
        // Se segunda chamada, comparar com valores da primeira e usar o melhor (menor lance, maior lance)
        if (isSegundaChamada && mapaPrimeiraChamada[chave]) {
          const primeiraChamada = mapaPrimeiraChamada[chave];
          menor_final = Math.min(
            primeiraChamada.menor_lance_percent ?? 999,
            r.menor_lance_percent ?? 999
          );
          maior_final = Math.max(
            primeiraChamada.maior_lance_percent ?? 0,
            r.maior_lance_percent ?? 0
          );
          // Limpar valores inválidos
          if (menor_final >= 999) menor_final = null;
          if (maior_final <= 0) maior_final = null;
        }
        
        payloadCreate.push({
          empresa_id: imp.empresa_id,
          historico_id,
          grupo: r.grupo,
          modalidade: r.modalidade,
          menor_lance_percent: menor_final ?? null,
          maior_lance_percent: maior_final ?? null,
          media_lance_percent: r.media_lance_percent ?? null,
          qtd_ocorrencias: r.qtd_ocorrencias ?? 1
        });
      }
    }
    
    if (payloadCreate.length > 0) {
      await base44.asServiceRole.entities.HistoricoLanceResumo.bulkCreate(payloadCreate);
    }
    
    if (payloadUpdate.length > 0) {
      await Promise.all(payloadUpdate.map(item => 
        base44.asServiceRole.entities.HistoricoLanceResumo.update(item.id, {
          menor_lance_percent: item.menor_lance_percent,
          maior_lance_percent: item.maior_lance_percent,
          media_lance_percent: item.media_lance_percent,
          qtd_ocorrencias: item.qtd_ocorrencias
        })
      ));
    }

    // Atualizar progresso
    const novoProcessados = offset + slice.length;
    await base44.asServiceRole.entities.ImportacaoAssembleia.update(imp.id, {
      registros_processados: novoProcessados
    });

    return Response.json({
      sucesso: true,
      concluido: false,
      total_registros: registros.length,
      registros_processados: novoProcessados,
      proximo_offset: offset + limit
    });

  } catch (e) {
    console.error("[processarImportacaoAssembleia] ERRO:", e);
    return Response.json(
      { error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
});