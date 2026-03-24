import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// Statuses que indicam proposta finalizada (para de sincronizar)
const STATUS_FINAIS = ['pago', 'paga', 'cancelado', 'cancelada', 'recusado', 'recusada', 'finalizado', 'finalizada'];

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['admin', 'gerente', 'master', 'super_admin'].includes(user.perfil)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { configuracao_id, empresa_id } = await req.json();

  const configs = await base44.asServiceRole.entities.ConfiguracaoApiBanco.filter({
    id: configuracao_id,
    empresa_id,
  });
  if (!configs || configs.length === 0) return Response.json({ error: 'Configuração não encontrada' }, { status: 404 });
  const config = configs[0];

  if (!config.integracao_ativa) return Response.json({ error: 'Integração inativa' }, { status: 400 });

  // Busca propostas ativas com esse banco que ainda não estão finalizadas
  const propostas = await base44.asServiceRole.entities.Proposta.filter({
    empresa_id,
    administradora_id: config.banco_id,
  });

  const ativas = propostas.filter(p => {
    if (!p.codigo_proposta_banco) return false;
    const statusBaixo = (p.status_atual || p.status || '').toLowerCase();
    return !STATUS_FINAIS.includes(statusBaixo);
  });

  let atualizadas = 0;
  let erros = 0;

  // Busca mapeamentos de status
  const mapeamentos = await base44.asServiceRole.entities.MapeamentoStatusBanco.filter({
    configuracao_api_id: config.id,
  });

  const mapearStatus = (statusExterno) => {
    const mapa = mapeamentos.find(m => m.status_externo.toUpperCase() === statusExterno.toUpperCase());
    return mapa ? mapa.status_interno : statusExterno;
  };

  // Headers de autenticação
  const headers = { 'Content-Type': 'application/json' };
  if (config.auth_type === 'Bearer' && config.token_atual) {
    headers['Authorization'] = `Bearer ${config.token_atual}`;
  } else if (config.auth_type === 'ApiKey' && config.api_key) {
    headers['X-API-Key'] = config.api_key;
  } else if (config.auth_type === 'Basic') {
    headers['Authorization'] = `Basic ${btoa(`${config.username}:${config.password}`)}`;
  }

  for (const proposta of ativas) {
    try {
      const url = `${config.base_url}/propostas/${proposta.codigo_proposta_banco}/status`;
      const res = await fetch(url, { method: 'GET', headers });
      const data = await res.json();

      const statusExterno = data.status || data.situacao || data.codigo_status;
      const statusInterno = statusExterno ? mapearStatus(statusExterno) : null;

      if (statusExterno && statusExterno !== proposta.status_externo_atual) {
        // Atualiza proposta
        await base44.asServiceRole.entities.Proposta.update(proposta.id, {
          status_atual: statusInterno,
          status_externo_atual: statusExterno,
          data_status_atual: new Date().toISOString(),
          data_ultima_atualizacao_api: new Date().toISOString(),
          api_sincronizada: true,
          api_ultimo_erro: null,
          payload_ultima_resposta_json: JSON.stringify(data),
        });

        // Grava histórico
        await base44.asServiceRole.entities.HistoricoProposta.create({
          empresa_id,
          proposta_id: proposta.id,
          banco_id: config.banco_id,
          configuracao_api_id: config.id,
          status: statusInterno,
          status_externo: statusExterno,
          data_status: new Date().toISOString(),
          descricao_evento: `Status atualizado via sincronização: ${statusExterno}`,
          origem: 'API_BANCO',
          payload_evento_json: JSON.stringify(data),
        });

        atualizadas++;
      }

      // Log
      await base44.asServiceRole.entities.LogIntegracaoBanco.create({
        empresa_id,
        banco_id: config.banco_id,
        configuracao_api_id: config.id,
        proposta_id: proposta.id,
        tipo_acao: 'consultar_status',
        response_json: JSON.stringify(data),
        status_http: res.status,
        sucesso: res.ok,
        executado_em: new Date().toISOString(),
      });

    } catch (e) {
      erros++;
      await base44.asServiceRole.entities.Proposta.update(proposta.id, {
        api_ultima_tentativa: new Date().toISOString(),
        api_ultimo_erro: e.message,
      });
    }
  }

  // Atualiza última sincronização
  await base44.asServiceRole.entities.ConfiguracaoApiBanco.update(config.id, {
    ultima_sincronizacao_em: new Date().toISOString(),
    ultimo_erro: erros > 0 ? `${erros} erros na última sincronização` : null,
  });

  return Response.json({ success: true, total: ativas.length, atualizadas, erros });
});