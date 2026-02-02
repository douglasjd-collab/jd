import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verificar permissão (admin ou gerente)
    if (!['super_admin', 'master', 'admin', 'gerente'].includes(user.perfil)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { file_url, assembleia_data, empresa_id, usuario_id, usuario_nome } = await req.json();

    if (!file_url || !assembleia_data) {
      return Response.json({ error: 'Parâmetros obrigatórios: file_url, assembleia_data' }, { status: 400 });
    }

    // 1. Extrair dados do PDF usando LLM com OCR
    const extractionResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Tabela: QT | GRUPO | DESCRIÇÃO | CRÉDITO | MODALIDADE | LANCE %

Para cada linha:
- grupo: código (ex: "003102")
- modalidade: "lance_livre", "lance_limitado", "sorteio", "lance_fixo_15", "lance_fixo_30" ou "lance_fixo_50"
- percentual: número da coluna LANCE % (20,0000% = 20.0)

Retorne array JSON direto.`,
      file_urls: [file_url],
      response_json_schema: {
        type: "object",
        properties: {
          lances: {
            type: "array",
            items: {
              type: "object",
              properties: {
                grupo: { type: "string" },
                modalidade: { type: "string" },
                percentual: { type: "number" }
              },
              required: ["grupo", "modalidade"]
            }
          }
        },
        required: ["lances"]
      }
    });

    console.log('Extraction result:', JSON.stringify(extractionResult, null, 2));
    
    const dataLines = extractionResult?.lances || [];
    
    console.log('Total linhas extraídas:', dataLines.length);
    
    if (dataLines.length === 0) {
      return Response.json({ 
        error: 'Nenhum dado extraído do PDF. Resultado completo: ' + JSON.stringify(extractionResult) 
      }, { status: 400 });
    }

    // 3. Criar registro de histórico
    // empresa_id pode ser null para importações globais (super_admin)
    const historico = await base44.asServiceRole.entities.HistoricoLanceGrupo.create({
      empresa_id: empresa_id || null,
      assembleia_data,
      arquivo_nome: file_url.split('/').pop(),
      total_grupos: 0,
      total_registros: 0,
      criado_em: new Date().toISOString(),
      usuario_id,
      usuario_nome
    });

    // 4. Agrupar dados
    const gruposSet = new Set();
    const agrupado = {};
    
    for (const lance of dataLines) {
      if (!lance.grupo || !lance.modalidade) continue;
      
      const chave = `${lance.grupo}_${lance.modalidade}`;
      gruposSet.add(lance.grupo.toString());
      
      if (!agrupado[chave]) {
        agrupado[chave] = {
          grupo: lance.grupo.toString(),
          modalidade: lance.modalidade,
          percentuais: [],
          quantidade: 0
        };
      }
      
      if (lance.percentual != null) {
        agrupado[chave].percentuais.push(lance.percentual);
      }
      agrupado[chave].quantidade += 1;
    }

    const resumosToCreate = Object.values(agrupado).map(item => ({
      empresa_id: empresa_id || null,
      historico_id: historico.id,
      grupo: item.grupo,
      modalidade: item.modalidade,
      menor_lance_percent: item.percentuais.length > 0 ? Math.min(...item.percentuais) : null,
      maior_lance_percent: item.percentuais.length > 0 ? Math.max(...item.percentuais) : null,
      qtd_ocorrencias: item.quantidade
    }));

    // Criar todos os resumos em paralelo
    await Promise.all(
      resumosToCreate.map(data => base44.asServiceRole.entities.HistoricoLanceResumo.create(data))
    );

    const totalRegistros = resumosToCreate.length;

    console.log('Grupos únicos:', gruposSet.size);
    console.log('Total registros a criar:', totalRegistros);
    console.log('Resumos:', JSON.stringify(resumosToCreate, null, 2));

    // 5. Atualizar totais no histórico
    await base44.asServiceRole.entities.HistoricoLanceGrupo.update(historico.id, {
      total_grupos: gruposSet.size,
      total_registros: totalRegistros
    });

    return Response.json({
      success: true,
      historico_id: historico.id,
      total_grupos: gruposSet.size,
      total_registros: totalRegistros,
      debug: {
        linhas_extraidas: dataLines.length,
        grupos_unicos: Array.from(gruposSet),
        resumos_criados: resumosToCreate.length
      }
    });

  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});