import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

/**
 * Agente de IA — Recomendação de Grupos Ativos (Consórcio).
 * Consulta o HISTÓRICO DE LANCES (HistoricoLanceResumo + HistoricoLanceDetalhe +
 * HistoricoLanceGrupo) — a fonte real dos resultados de assembleias importados —
 * analisa grupos ativos compatíveis com o perfil do cliente e recomenda o melhor.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      empresa_id,
      modalidade,
      valor_credito,
      prazo_desejado,
      tipo_lance,
      percentual_lance,
      lance_embutido,
      complementar_recurso
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

    const norm = (s) => (s || '').toString().replace(/[.\s\-_]/g, '').replace(/^0+/, '') || '';

    // 2. Carregar o histórico de lances importado (resumos + detalhes + assembleias)
    let resumos = [];
    let detalhes = [];
    let historicoGrupos = [];
    try {
      resumos = await base44.asServiceRole.entities.HistoricoLanceResumo.filter(
        { empresa_id }, '-created_date', 5000
      );
    } catch (e) {
      console.log('[recomendarGruposConsorcio] Sem resumos:', e.message);
    }
    try {
      detalhes = await base44.asServiceRole.entities.HistoricoLanceDetalhe.filter(
        { empresa_id }, '-created_date', 5000
      );
    } catch (e) {
      console.log('[recomendarGruposConsorcio] Sem detalhes:', e.message);
    }
    try {
      historicoGrupos = await base44.asServiceRole.entities.HistoricoLanceGrupo.filter(
        { empresa_id }, '-assembleia_data', 500
      );
    } catch (e) {
      console.log('[recomendarGruposConsorcio] Sem histórico de grupos:', e.message);
    }

    const histMap = new Map(historicoGrupos.map((h) => [h.id, h]));

    // 3. Para cada grupo compatível, montar histórico por assembleia
    const gruposComHistorico = gruposCompativeis.map((g) => {
      const numeroNorm = norm(g.numero_grupo);

      // Detalhes pertencentes a este grupo
      const detalhesDoGrupo = detalhes.filter((d) => norm(d.grupo) === numeroNorm);
      // Resumos pertencentes a este grupo
      const resumosDoGrupo = resumos.filter((r) => norm(r.grupo) === numeroNorm);

      // Mapa: historico_id -> { data, chamada, modalidades: { mod: {menor, maior, media, qtd} } }
      const porAssembleia = {};

      const obterOuCriar = (historico_id) => {
        if (!porAssembleia[historico_id]) {
          const hg = histMap.get(historico_id);
          porAssembleia[historico_id] = {
            historico_id,
            assembleia_data: hg?.assembleia_data || null,
            chamada: hg?.chamada || null,
            modalidades: {}
          };
        }
        return porAssembleia[historico_id];
      };

      // 3a. Agregar detalhes (linhas individuais) por assembly+modalidade
      for (const d of detalhesDoGrupo) {
        if (!d.historico_id) continue;
        const ass = obterOuCriar(d.historico_id);
        const mod = d.modalidade || 'nao_identificado';
        const pct = d.lance_percent == null ? null : Number(d.lance_percent);
        if (pct == null || isNaN(pct)) continue;
        if (!ass.modalidades[mod]) {
          ass.modalidades[mod] = { lances: [], menor: Infinity, maior: -Infinity, soma: 0, qtd: 0 };
        }
        const m = ass.modalidades[mod];
        m.lances.push(pct);
        if (pct < m.menor) m.menor = pct;
        if (pct > m.maior) m.maior = pct;
        m.soma += pct;
        m.qtd++;
      }

      // 3b. Sobrescrever/mergear com resumos pré-agregados (mais confiável quando presentes)
      for (const r of resumosDoGrupo) {
        if (!r.historico_id || !r.modalidade) continue;
        const ass = obterOuCriar(r.historico_id);
        ass.modalidades[r.modalidade] = {
          menor: r.menor_lance_percent,
          maior: r.maior_lance_percent,
          media: r.media_lance_percent,
          qtd: r.qtd_ocorrencias || 0
        };
      }

      // 3c. Finalizar médias e limpar Infinity
      const assembleias = Object.values(porAssembleia).sort((a, b) =>
        (b.assembleia_data || '').localeCompare(a.assembleia_data || '')
      );
      for (const ass of assembleias) {
        for (const key of Object.keys(ass.modalidades)) {
          const m = ass.modalidades[key];
          if (m.menor === Infinity || m.maior === -Infinity) {
            delete ass.modalidades[key];
            continue;
          }
          if (m.media == null && m.qtd > 0) m.media = m.soma / m.qtd;
        }
      }

      // 3d. Sequência de menores lances da modalidade analisada (do mais recente p/ o mais antigo)
      const modal = tipo_lance || 'lance_livre';
      const seqMinimos = assembleias
        .map((a) => a.modalidades?.[modal]?.menor)
        .filter((x) => x != null && !isNaN(x));

      const ultimas3 = seqMinimos.slice(0, 3);
      const media3 = ultimas3.length ? ultimas3.reduce((s, x) => s + x, 0) / ultimas3.length : null;
      const mediaHistorica = seqMinimos.length ? seqMinimos.reduce((s, x) => s + x, 0) / seqMinimos.length : null;
      const menor = seqMinimos.length ? Math.min(...seqMinimos) : null;
      const maior = seqMinimos.length ? Math.max(...seqMinimos) : null;
      const menorAnterior = seqMinimos[0] ?? null;

      const tendencia = (() => {
        if (ultimas3.length < 3) return 'Dados insuficientes';
        const [a, b, c] = ultimas3;
        if (a < b && b < c) return 'Queda';
        if (a > b && b > c) return 'Alta';
        return 'Estável';
      })();

      const reducoesConsecutivas = (() => {
        if (seqMinimos.length < 2) return 0;
        let count = 0;
        for (let i = 0; i < seqMinimos.length - 1; i++) {
          if (seqMinimos[i] < seqMinimos[i + 1]) count++;
          else break;
        }
        return count;
      })();

      // Total de contemplados (qtd de lances individuais) por assembleia
      const contempladosUltimo = assembleias[0]
        ? Object.values(assembleias[0].modalidades).reduce((s, m) => s + (m.qtd || 0), 0)
        : 0;

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
        modalidade_analisada: modal,
        qtd_assembleias_historico: assembleias.length,
        menor_lance_anterior: menorAnterior,
        media_3_meses: media3,
        media_historica: mediaHistorica,
        menor_lance_historico: menor,
        maior_lance_historico: maior,
        contemplados_ultimo_mes: contempladosUltimo,
        reducoes_consecutivas: reducoesConsecutivas,
        sequencia_ultimos_minimos: seqMinimos.slice(0, 12),
        tendencia_calculada: tendencia,
        assembleias: assembleias.slice(0, 12).map((a) => ({
          data: a.assembleia_data,
          chamada: a.chamada,
          modalidades: a.modalidades
        }))
      };
    });

    console.log(
      `[recomendarGruposConsorcio] Grupos compatíveis: ${gruposCompativeis.length} | ` +
      `resumos: ${resumos.length} | detalhes: ${detalhes.length} | histórico-grupos: ${historicoGrupos.length}`
    );
    const comHist = gruposComHistorico.filter((g) => g.qtd_assembleias_historico > 0).length;
    console.log(`[recomendarGruposConsorcio] Grupos com histórico de lances: ${comHist}/${gruposCompativeis.length}`);

    // 4. Prompt para o LLM
    const prompt = `Você é um agente de IA especialista em consórcio. Analise o HISTÓRICO DE LANCES dos grupos ativos compatíveis com o perfil do cliente e recomende o melhor grupo.

PERFIL DO CLIENTE:
- Modalidade: ${modalidade}
- Valor do crédito desejado: R$ ${valorCredito}
- Prazo desejado: ${prazo_desejado || 'não especificado'} meses
- Tipo de lance pretendido: ${tipo_lance}
- Percentual disponível para lance: ${percentual_lance != null ? percentual_lance + '%' : 'não informado'}
- Aceita lance embutido: ${lance_embutido ? 'sim' : 'não'}
- Pode complementar com recurso próprio: ${complementar_recurso ? 'sim' : 'não'}

RESULTADO DE ASSEMBLEIAS / HISTÓRICO DE LANCES POR GRUPO (JSON):
${JSON.stringify(gruposComHistorico, null, 2)}

Estrutura de cada grupo:
- assembleias: lista de {data, chamada, modalidades: {lance_livre, lance_limitado, lance_fixo_30, lance_fixo_50, sorteio: {menor, maior, media, qtd}}}
- sequencia_ultimos_minimos: menores lances da modalidade "${tipo_lance}", do mais recente para o mais antigo
- media_3_meses, media_historica, menor_lance_anterior, tendencia_calculada
- qtd_assembleias_historico: número de assembleias com histórico (0 = sem dados)

REGRAS DE ANÁLISE:
1. NÃO considere apenas o menor lance de um único mês. Compare o histórico de pelo menos 3 assembleias para evitar recomendar um grupo com redução isolada/atípica.
2. Priorize grupos com tendência estável ou de queda consistente nos lances.
3. Avalie a diferença entre o lance do cliente e o histórico do grupo.
4. Considere prazo restante, participantes ativos e qtd de contemplados por assembleia.
5. Priorize grupos com histórico mais longo (6 a 12 assembleias) quando disponíveis.
6. NÃO invente dados. Se um grupo tiver qtd_assembleias_historico === 0, informe "Dados insuficientes" na tendência e na previsão, e use compatibilidade "Baixa".
7. Use somente os percentuais e contagens presentes no JSON — não calcule valores não suportados pelos dados.

RETORNE:
- recomendacao_principal: o grupo mais compatível (use o campo "grupo_id" EXATO do JSON).
- previsao: análise da tendência das próximas assembleias (faixa provável em %, confiança, fatores, qtd_assembleias_usadas, aviso).
- comparacao: até 3 grupos alternativos ordenados por compatibilidade (posicao 1, 2, 3) — use grupo_id exato.
- mensagem_cliente: mensagem pronta para o cliente (saudação com {primeiro_nome} como espaço a preencher, citando número do grupo, valor do crédito, menor lance anterior e média recente, com aviso final).
- aviso_obrigatorio: o aviso descrito abaixo.

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
      total_resumos_lances: resumos.length,
      total_detalhes_lances: detalhes.length,
      total_assembleias_importadas: historicoGrupos.length,
      grupos_com_historico: gruposComHistorico,
      analise
    });
  } catch (error) {
    console.error('[recomendarGruposConsorcio] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});