import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

/**
 * Agente de IA — Recomendação de Grupos Ativos (Consórcio).
 * Analisa grupos ativos compatíveis com o perfil do cliente, considera o histórico
 * de assembleias e recomenda o melhor grupo. Não inventa dados.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      empresa_id,
      modalidade,             // automovel | imovel | motocicleta | servico | bens_moveis
      valor_credito,          // number
      prazo_desejado,         // number (opcional)
      tipo_lance,             // lance_livre | lance_limitado | lance_fixo_30 | lance_fixo_50 | sorteio
      percentual_lance,       // number (opcional)
      lance_embutido,         // boolean
      complementar_recurso    // boolean
    } = body;

    if (!empresa_id || !modalidade || !valor_credito) {
      return Response.json({
        error: 'Parâmetros obrigatórios: empresa_id, modalidade, valor_credito'
      }, { status: 400 });
    }

    const valorCredito = Number(valor_credito);

    // 1. Grupos ativos compatíveis com a modalidade
    const todosGrupos = await base44.asServiceRole.entities.GrupoConsorcio.filter({
      empresa_id,
      status: 'ativo',
      categoria_bem: modalidade
    }, '-created_date', 500);

    // Filtrar pela faixa de crédito
    const gruposCompativeis = todosGrupos.filter((g) => {
      const min = g.credito_minimo || 0;
      const max = g.credito_maximo || Number.MAX_SAFE_INTEGER;
      return valorCredito >= min && valorCredito <= max;
    });

    if (gruposCompativeis.length === 0) {
      return Response.json({
        ok: true,
        sem_grupos: true,
        mensagem: 'Nenhum grupo ativo compatível com a modalidade e o crédito informado.'
      });
    }

    // 2. Histórico de assembleias por grupo
    const gruposComHistorico = await Promise.all(
      gruposCompativeis.map(async (g) => {
        try {
          const assembleias = await base44.asServiceRole.entities.AssembleiaGrupoConsorcio.filter(
            { grupo_consorcio_id: g.id }, '-data_assembleia', 12
          );

          const lances = assembleias
            .map((a) => a.lance_livre_menor_percentual)
            .filter((x) => x != null);

          const menorAnterior = assembleias[0]?.lance_livre_menor_percentual ?? null;
          const ultimas3 = lances.slice(0, 3);
          const media3 = ultimas3.length
            ? ultimas3.reduce((s, x) => s + x, 0) / ultimas3.length
            : null;
          const mediaHistorica = lances.length
            ? lances.reduce((s, x) => s + x, 0) / lances.length
            : null;
          const maior = lances.length ? Math.max(...lances) : null;
          const menor = lances.length ? Math.min(...lances) : null;

          // Tendência (3 últimas, ordenadas decrescente — índice 0 = mais recente)
          const tendencia = (() => {
            if (ultimas3.length < 3) return 'Dados insuficientes';
            const [a, b, c] = ultimas3;
            if (a < b && b < c) return 'Queda';
            if (a > b && b > c) return 'Alta';
            return 'Estável';
          })();

          // Reduções consecutivas (do mais recente para trás)
          const reducoesConsecutivas = (() => {
            if (lances.length < 2) return 0;
            let count = 0;
            for (let i = 0; i < lances.length - 1; i++) {
              if (lances[i] < lances[i + 1]) count++;
              else break;
            }
            return count;
          })();

          const contempladosUltimoMes = assembleias[0]
            ? (assembleias[0].lance_livre_qtd_contemplados || 0) +
              (assembleias[0].lance_limitado_qtd_contemplados || 0) +
              (assembleias[0].lance_fixo_30_qtd_contemplados || 0) +
              (assembleias[0].lance_fixo_50_qtd_contemplados || 0) +
              (assembleias[0].sorteio_qtd_contemplados || 0)
            : 0;

          const totalContemplados = assembleias.reduce(
            (s, a) =>
              s +
              (a.lance_livre_qtd_contemplados || 0) +
              (a.lance_limitado_qtd_contemplados || 0) +
              (a.lance_fixo_30_qtd_contemplados || 0) +
              (a.lance_fixo_50_qtd_contemplados || 0) +
              (a.sorteio_qtd_contemplados || 0),
            0
          );

          return {
            grupo_id: g.id,
            numero_grupo: g.numero_grupo,
            nome_grupo: g.nome_grupo,
            administradora_nome: g.administradora_nome,
            categoria_bem: g.categoria_bem,
            credito_minimo: g.credito_minimo,
            credito_maximo: g.credito_maximo,
            prazo_maximo: g.prazo_maximo,
            qtd_participantes: g.qtd_participantes,
            prioridade_comercial: g.prioridade_comercial,
            qtd_assembleias_historico: assembleias.length,
            menor_lance_anterior: menorAnterior,
            media_3_meses: media3,
            media_historica: mediaHistorica,
            menor_lance_historico: menor,
            maior_lance_historico: maior,
            contemplados_ultimo_mes: contempladosUltimoMes,
            total_contemplados: totalContemplados,
            reducoes_consecutivas: reducoesConsecutivas,
            ultimos_lances: lances.slice(0, 6),
            tendencia_calculada: tendencia,
            assembleias: assembleias.slice(0, 12).map((a) => ({
              data: a.data_assembleia,
              lance_livre_menor: a.lance_livre_menor_percentual,
              lance_livre_qtd: a.lance_livre_qtd_contemplados || 0,
              lance_limitado_menor: a.lance_limitado_menor_percentual,
              lance_limitado_qtd: a.lance_limitado_qtd_contemplados || 0,
              lance_fixo_30_qtd: a.lance_fixo_30_qtd_contemplados || 0,
              lance_fixo_50_qtd: a.lance_fixo_50_qtd_contemplados || 0,
              sorteio_qtd: a.sorteio_qtd_contemplados || 0,
              total_contemplados: a.total_contemplados || 0
            }))
          };
        } catch (e) {
          return {
            grupo_id: g.id,
            numero_grupo: g.numero_grupo,
            erro_historico: e.message
          };
        }
      })
    );

    // 3. Prompt para o LLM
    const prompt = `Você é um agente de IA especialista em consórcio. Analise os grupos ativos compatíveis com o perfil do cliente e recomende o melhor grupo.

PERFIL DO CLIENTE:
- Modalidade: ${modalidade}
- Valor do crédito desejado: R$ ${valorCredito}
- Prazo desejado: ${prazo_desejado || 'não especificado'} meses
- Tipo de lance pretendido: ${tipo_lance}
- Percentual disponível para lance: ${percentual_lance != null ? percentual_lance + '%' : 'não informado'}
- Aceita lance embutido: ${lance_embutido ? 'sim' : 'não'}
- Pode complementar com recurso próprio: ${complementar_recurso ? 'sim' : 'não'}

GRUPOS COMPATÍVEIS E SEU HISTÓRICO (JSON):
${JSON.stringify(gruposComHistorico, null, 2)}

REGRAS DE ANÁLISE:
1. Não considere apenas o menor lance de um único mês. Compare o histórico de pelo menos 3 assembleias para evitar recomendar um grupo com redução isolada/atípica.
2. Priorize grupos com tendência estável ou de queda consistente.
3. Avalie a diferença entre o lance do cliente e o histórico do grupo.
4. Considere prazo restante, participantes ativos e contemplados.
5. Priorize grupos com histórico mais longo (6 a 12 assembleias) quando disponíveis.
6. Não invente dados. Se faltar histórico, informe "Dados insuficientes".

RETORNE:
- recomendacao_principal: o grupo mais compatível (use grupo_id exato).
- previsao: análise da tendência das próximas assembleias (faixa provável, confiança, fatores, qtd_assembleias_usadas, aviso de estimativa).
- comparacao: até 3 grupos alternativos ordenados por compatibilidade (posicao 1, 2, 3).
- mensagem_cliente: mensagem pronta para enviar ao cliente (saudação com {primeiro_nome} como espaço a preencher, citando número do grupo, valor do crédito, menor lance anterior e média recente, com aviso final).
- aviso_obrigatorio: o aviso obrigatório descrito abaixo.

Classificações de compatibilidade: "Alta", "Média" ou "Baixa".
Tendências: "Queda", "Estável", "Alta" ou "Dados insuficientes".

Aviso obrigatório a incluir em aviso_obrigatorio:
"Importante: a análise é baseada no histórico das assembleias. Os percentuais podem variar conforme as ofertas realizadas pelos participantes. A recomendação não garante contemplação e não deve ser apresentada ao cliente como promessa."`;

    const responseSchema = {
      type: 'object',
      properties: {
        recomendacao_principal: {
          type: 'object',
          properties: {
            grupo_id: { type: 'string' },
            numero_grupo: { type: 'string' },
            modalidade: { type: 'string' },
            valor_credito: { type: 'number' },
            prazo_maximo: { type: 'number' },
            prazo_restante: { type: 'number' },
            qtd_participantes: { type: 'number' },
            menor_lance_anterior: { type: 'number' },
            media_3_meses: { type: 'number' },
            contemplados_ultimo_mes: { type: 'number' },
            tipo_lance_analisado: { type: 'string' },
            percentual_cliente: { type: 'number' },
            diferenca_lance: { type: 'number' },
            compatibilidade: { type: 'string' },
            explicacao: { type: 'string' }
          }
        },
        previsao: {
          type: 'object',
          properties: {
            tendencia: { type: 'string' },
            faixa_estimada_min: { type: 'number' },
            faixa_estimada_max: { type: 'number' },
            confianca: { type: 'string' },
            fatores: { type: 'array', items: { type: 'string' } },
            qtd_assembleias_usadas: { type: 'number' },
            aviso: { type: 'string' }
          }
        },
        comparacao: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              posicao: { type: 'number' },
              grupo_id: { type: 'string' },
              numero_grupo: { type: 'string' },
              menor_lance_anterior: { type: 'number' },
              media_historica: { type: 'number' },
              tendencia: { type: 'string' },
              compatibilidade: { type: 'string' }
            }
          }
        },
        mensagem_cliente: { type: 'string' },
        aviso_obrigatorio: { type: 'string' }
      }
    };

    const analise = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: responseSchema,
      model: 'gpt_5_4'
    });

    return Response.json({
      ok: true,
      grupos_analisados: gruposCompativeis.length,
      grupos_com_historico: gruposComHistorico,
      analise
    });
  } catch (error) {
    console.error('[recomendarGruposConsorcio] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});