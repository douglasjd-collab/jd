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

    // 1. Extrair dados do PDF usando LLM
    const extractionResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Extraia TODOS os dados desta tabela de resultado de assembleia.

A tabela possui as colunas: QT. | GRUPO | DESCRIÇÃO | CRÉDITO | MODALIDADE | LANCE %

Para CADA LINHA da tabela, extraia:
- grupo: número do grupo (ex: "003102")
- modalidade: classifique EXATAMENTE como:
  * "lance_livre" se a coluna MODALIDADE for "Lance Livre"
  * "lance_limitado" se for "Lance Limitado"
  * "sorteio" se for "Sorteio"
  * "lance_fixo_15" se for "Lance Fixo" e o percentual for 15%
  * "lance_fixo_30" se for "Lance Fixo" e o percentual for 30%
  * "lance_fixo_50" se for "Lance Fixo" e o percentual for 50%
- lance_percentual: o valor numérico da coluna LANCE % (ex: se for "20,0000%" extraia como 20.0)
- quantidade: sempre 1 para cada linha (cada linha representa uma contemplação)

REGRAS IMPORTANTES:
1. Extraia TODAS as linhas da tabela
2. Para "Lance Fixo", verifique o percentual para classificar corretamente (15, 30 ou 50)
3. Converta percentuais corretamente (20,0000% = 20.0)
4. Agrupe por grupo+modalidade ao final

Retorne um array com TODAS as contemplações extraídas.`,
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
                modalidade: { 
                  type: "string",
                  enum: ["lance_livre", "lance_limitado", "sorteio", "lance_fixo_15", "lance_fixo_30", "lance_fixo_50"]
                },
                lance_percentual: { type: "number" },
                quantidade: { type: "integer" }
              },
              required: ["grupo", "modalidade", "lance_percentual", "quantidade"]
            }
          }
        },
        required: ["lances"]
      }
    });

    const dataLines = extractionResult.lances || [];
    
    if (dataLines.length === 0) {
      return Response.json({ error: 'Nenhum dado extraído do PDF' }, { status: 400 });
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

    // 4. Agrupar e processar dados extraídos
    const gruposSet = new Set();
    
    // Agrupar por grupo + modalidade e somar quantidades
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
      
      agrupado[chave].percentuais.push(lance.lance_percentual);
      agrupado[chave].quantidade += (lance.quantidade || 1);
    }

    // Criar resumos com menor e maior percentual
    const resumosToCreate = Object.values(agrupado).map(item => ({
      empresa_id: empresa_id || null,
      historico_id: historico.id,
      grupo: item.grupo,
      modalidade: item.modalidade,
      menor_lance_percent: Math.min(...item.percentuais),
      maior_lance_percent: Math.max(...item.percentuais),
      qtd_ocorrencias: item.quantidade
    }));

    // Criar todos os resumos em paralelo
    await Promise.all(
      resumosToCreate.map(data => base44.asServiceRole.entities.HistoricoLanceResumo.create(data))
    );

    const totalRegistros = resumosToCreate.length;

    // 5. Atualizar totais no histórico
    await base44.asServiceRole.entities.HistoricoLanceGrupo.update(historico.id, {
      total_grupos: gruposSet.size,
      total_registros: totalRegistros
    });

    return Response.json({
      success: true,
      historico_id: historico.id,
      total_grupos: gruposSet.size,
      total_registros: totalRegistros
    });

  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});