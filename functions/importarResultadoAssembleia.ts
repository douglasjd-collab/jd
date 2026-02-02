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
      prompt: `Analise este PDF de resultado de assembleia e extraia TODOS os lances por grupo.

FORMATO DE SAÍDA: Array JSON com cada lance.

Para cada lance extraído, retorne:
- grupo: número do grupo (string)
- modalidade: tipo do lance - use EXATAMENTE um desses valores:
  * "lance_livre" para Lance Livre
  * "lance_limitado" para Lance Limitado
  * "sorteio" para Sorteio
  * "lance_fixo_30" para Lance Fixo 30%
  * "lance_fixo_50" para Lance Fixo 50%
- menor_lance_percent: menor lance em % (número, ex: 25.5) ou null
- maior_lance_percent: maior lance em % (número, ex: 45.0) ou null
- quantidade: número de ocorrências (inteiro)

IMPORTANTE: Extraia TODOS os grupos e lances do documento. Seja preciso nos percentuais.`,
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
                menor_lance_percent: { type: ["number", "null"] },
                maior_lance_percent: { type: ["number", "null"] },
                quantidade: { type: "integer" }
              },
              required: ["grupo", "modalidade", "quantidade"]
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

    // 4. Processar dados extraídos e criar resumos em paralelo
    const gruposSet = new Set();
    
    const resumosToCreate = dataLines
      .filter(lance => lance.grupo && lance.modalidade)
      .map(lance => {
        gruposSet.add(lance.grupo.toString());
        return {
          empresa_id: empresa_id || null,
          historico_id: historico.id,
          grupo: lance.grupo.toString(),
          modalidade: lance.modalidade,
          menor_lance_percent: lance.menor_lance_percent || null,
          maior_lance_percent: lance.maior_lance_percent || null,
          qtd_ocorrencias: lance.quantidade || 0
        };
      });

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