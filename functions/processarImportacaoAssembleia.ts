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
    const { importacao_id, offset = 0, limit = 20 } = body;

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
    
    // Se é a primeira chamada (offset = 0), criar histórico principal
    let historico_id = imp.historico_id;
    
    if (offset === 0) {
      const totalGrupos = new Set(registros.map(r => r.grupo)).size;
      
      const historico = await base44.asServiceRole.entities.HistoricoLanceGrupo.create({
        empresa_id: imp.empresa_id,
        assembleia_data: imp.assembleia_data,
        chamada: imp.chamada,
        arquivo_nome: imp.arquivo_nome,
        total_grupos: totalGrupos,
        total_registros: registros.length,
        criado_em: new Date().toISOString(),
        usuario_id: imp.usuario_id,
        usuario_nome: imp.usuario_nome
      });
      
      historico_id = historico.id;
      
      // Atualizar importação com historico_id
      await base44.asServiceRole.entities.ImportacaoAssembleia.update(imp.id, {
        historico_id: historico.id,
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
    
    const isSegundaChamada = imp.chamada === 'Segunda';
    
    // Buscar registros existentes (se segunda chamada)
    let registrosExistentes = [];
    if (isSegundaChamada) {
      const [ano, mes] = imp.assembleia_data.split('-');
      const mesAno = `${ano}-${mes}`;
      
      const todosResumos = await base44.asServiceRole.entities.HistoricoLanceResumo.filter({
        empresa_id: imp.empresa_id
      });
      
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
    
    const mapaExistentes = {};
    for (const r of registrosExistentes) {
      const chave = `${r.grupo}_${r.modalidade}`;
      mapaExistentes[chave] = r;
    }
    
    const payloadCreate = [];
    const payloadUpdate = [];
    
    for (const r of resumos) {
      const chave = `${r.grupo}_${r.modalidade}`;
      
      if (isSegundaChamada && mapaExistentes[chave]) {
        const existente = mapaExistentes[chave];
        
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
        payloadCreate.push({
          empresa_id: imp.empresa_id,
          historico_id,
          grupo: r.grupo,
          modalidade: r.modalidade,
          menor_lance_percent: r.menor_lance_percent ?? null,
          maior_lance_percent: r.maior_lance_percent ?? null,
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