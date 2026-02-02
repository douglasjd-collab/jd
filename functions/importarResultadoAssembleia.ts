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
      prompt: `Extraia os dados de lances da assembleia deste PDF. 
      
Para cada grupo, identifique:
- Número do grupo
- Modalidade do lance (lance_livre, lance_limitado, sorteio, lance_fixo_30, lance_fixo_50)
- Menor lance em percentual (se aplicável)
- Maior lance em percentual (se aplicável)
- Quantidade de ocorrências

Retorne um array de objetos com os dados extraídos.`,
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
                menor_lance_percent: { type: "number" },
                maior_lance_percent: { type: "number" },
                quantidade: { type: "integer" }
              },
              required: ["grupo", "modalidade"]
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

    // 4. Processar dados extraídos e criar resumos
    const gruposSet = new Set();
    let totalRegistros = 0;

    for (const lance of dataLines) {
      const { grupo, modalidade, menor_lance_percent, maior_lance_percent, quantidade } = lance;

      if (!grupo || !modalidade) continue;

      gruposSet.add(grupo.toString());

      await base44.asServiceRole.entities.HistoricoLanceResumo.create({
        empresa_id: empresa_id || null,
        historico_id: historico.id,
        grupo: grupo.toString(),
        modalidade,
        menor_lance_percent: menor_lance_percent || null,
        maior_lance_percent: maior_lance_percent || null,
        qtd_ocorrencias: quantidade || 0
      });

      totalRegistros++;
    }

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