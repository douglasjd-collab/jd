import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['admin', 'gerente', 'master', 'super_admin', 'colaborador'].includes(user.perfil)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { configuracao_id, empresa_id } = await req.json();

  // Busca configuração
  const configs = await base44.asServiceRole.entities.ConfiguracaoApiBanco.filter({ id: configuracao_id });
  if (!configs || configs.length === 0) return Response.json({ error: 'Configuração não encontrada' }, { status: 404 });
  const config = configs[0];

  if (!config.integracao_ativa) return Response.json({ error: 'Integração inativa' }, { status: 400 });

  // Monta headers de autenticação
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (config.auth_type === 'Bearer' && config.token_atual) {
    headers['Authorization'] = `Bearer ${config.token_atual}`;
  } else if (config.auth_type === 'ApiKey' && config.api_key) {
    headers['X-API-Key'] = config.api_key;
    headers['Authorization'] = `Bearer ${config.api_key}`;
  } else if (config.auth_type === 'Basic' && config.username) {
    headers['Authorization'] = `Basic ${btoa(`${config.username}:${config.password}`)}`;
  }

  // Busca mapeamentos de status
  const mapeamentos = await base44.asServiceRole.entities.MapeamentoStatusBanco.filter({ configuracao_api_id: config.id });
  const mapearStatus = (statusExterno) => {
    if (!statusExterno) return statusExterno;
    const mapa = mapeamentos.find(m => m.status_externo.toUpperCase() === String(statusExterno).toUpperCase());
    return mapa ? mapa.status_interno : statusExterno;
  };

  // Busca propostas já existentes da empresa para evitar duplicatas
  const propostasExistentes = await base44.asServiceRole.entities.Proposta.filter({ empresa_id, produto: 'emprestimo' });
  const codigosExistentes = new Set(propostasExistentes.map(p => p.codigo_proposta_banco).filter(Boolean));

  let importadas = 0;
  let atualizadas = 0;
  let erros = 0;
  let responseData = null;
  let statusHttp = null;

  try {
    // Tenta buscar propostas da API do banco
    // Tenta endpoints comuns: /propostas, /contratos, /operacoes
    const endpoints = ['/propostas', '/contratos', '/operacoes', '/emprestimos'];
    let propostasApi = [];

    for (const endpoint of endpoints) {
      try {
        const url = `${config.base_url}${endpoint}`;
        const res = await fetch(url, { method: 'GET', headers });
        statusHttp = res.status;

        if (res.ok) {
          const data = await res.json();
          responseData = data;

          // A API pode retornar array diretamente ou { data: [...], propostas: [...], contratos: [...] }
          if (Array.isArray(data)) {
            propostasApi = data;
          } else if (data.data && Array.isArray(data.data)) {
            propostasApi = data.data;
          } else if (data.propostas && Array.isArray(data.propostas)) {
            propostasApi = data.propostas;
          } else if (data.contratos && Array.isArray(data.contratos)) {
            propostasApi = data.contratos;
          } else if (data.operacoes && Array.isArray(data.operacoes)) {
            propostasApi = data.operacoes;
          }

          if (propostasApi.length > 0) break; // encontrou dados, para de tentar
        }
      } catch (_) {
        // tenta próximo endpoint
      }
    }

    // Log da chamada principal
    await base44.asServiceRole.entities.LogIntegracaoBanco.create({
      empresa_id,
      banco_id: config.banco_id,
      configuracao_api_id: config.id,
      tipo_acao: 'importar_propostas',
      response_json: JSON.stringify(responseData),
      status_http: statusHttp,
      sucesso: propostasApi.length > 0,
      mensagem_erro: propostasApi.length === 0 ? 'Nenhuma proposta retornada pela API' : null,
      executado_em: new Date().toISOString(),
    });

    // Processa cada proposta retornada
    for (const item of propostasApi) {
      try {
        // Tenta extrair campos comuns de diferentes formatos de API
        const codigoBanco = String(
          item.id || item.codigo || item.numero || item.contrato ||
          item.id_proposta || item.codigo_proposta || item.numero_contrato || ''
        );

        if (!codigoBanco) continue;

        const statusExterno = item.status || item.situacao || item.status_proposta || item.situacao_proposta;
        const statusInterno = mapearStatus(statusExterno);

        const clienteNome = item.cliente_nome || item.nome_cliente || item.devedor || item.beneficiario || '';
        const clienteCpf = item.cpf || item.cpf_cliente || item.documento || '';
        const valorCredito = parseFloat(item.valor || item.valor_emprestimo || item.valor_credito || item.valor_contrato || 0);
        const valorLiquido = parseFloat(item.valor_liquido || item.valor_liberado || item.valor_liquido_liberado || valorCredito || 0);
        const dataVenda = item.data_criacao || item.data_proposta || item.data_contrato || item.data || new Date().toISOString().slice(0, 10);
        const dataLib = item.data_liberacao || item.data_pagamento || item.data_liberado || '';
        const prazo = parseInt(item.prazo || item.prazo_meses || item.parcelas || 0);
        const valorParcela = parseFloat(item.valor_parcela || item.parcela || 0);
        const contrato = item.contrato || item.numero_contrato || item.numero || codigoBanco;
        const convenioNome = item.convenio || item.convenio_nome || item.orgao || '';
        const vendedorNome = item.vendedor || item.agente || item.corretor || '';
        const ade = item.ade || item.numero_ade || item.ade_numero || '';
        const beneficio = item.matricula || item.numero_beneficio || item.beneficio || '';

        if (codigosExistentes.has(codigoBanco)) {
          // Atualiza status se mudou
          const existente = propostasExistentes.find(p => p.codigo_proposta_banco === codigoBanco);
          if (existente && statusExterno && statusExterno !== existente.status_externo_atual) {
            await base44.asServiceRole.entities.Proposta.update(existente.id, {
              status_atual: statusInterno,
              status_externo_atual: statusExterno,
              data_status_atual: new Date().toISOString(),
              data_ultima_atualizacao_api: new Date().toISOString(),
              api_sincronizada: true,
              payload_ultima_resposta_json: JSON.stringify(item),
            });

            await base44.asServiceRole.entities.HistoricoProposta.create({
              empresa_id,
              proposta_id: existente.id,
              banco_id: config.banco_id,
              configuracao_api_id: config.id,
              status: statusInterno,
              status_externo: statusExterno,
              data_status: new Date().toISOString(),
              descricao_evento: `Status atualizado via importação: ${statusExterno}`,
              origem: 'API_BANCO',
              payload_evento_json: JSON.stringify(item),
            });

            atualizadas++;
          }
          continue;
        }

        // Cria nova proposta
        const novaProposta = await base44.asServiceRole.entities.Proposta.create({
          empresa_id,
          produto: 'emprestimo',
          cliente_nome: clienteNome,
          cliente_cpf: clienteCpf,
          administradora_id: config.banco_id,
          administradora_nome: config.banco_nome || '',
          banco_id: config.banco_id,
          configuracao_api_id: config.id,
          codigo_proposta_banco: codigoBanco,
          contrato,
          status: statusInterno || statusExterno || 'importado',
          status_atual: statusInterno,
          status_externo_atual: statusExterno,
          data_venda: dataVenda.slice(0, 10),
          valor_credito: valorCredito,
          valor_liquido: valorLiquido,
          emprestimo_prazo: prazo,
          emprestimo_valor_parcela: valorParcela,
          emprestimo_data_liberacao: dataLib ? dataLib.slice(0, 10) : '',
          emprestimo_convenio_nome: convenioNome,
          emprestimo_numero_ade: ade,
          emprestimo_numero_beneficio: beneficio,
          vendedor_nome: vendedorNome,
          data_status_atual: new Date().toISOString(),
          data_ultima_atualizacao_api: new Date().toISOString(),
          api_sincronizada: true,
          payload_ultima_resposta_json: JSON.stringify(item),
        });

        codigosExistentes.add(codigoBanco);

        // Histórico inicial
        await base44.asServiceRole.entities.HistoricoProposta.create({
          empresa_id,
          proposta_id: novaProposta.id,
          banco_id: config.banco_id,
          configuracao_api_id: config.id,
          status: statusInterno || statusExterno,
          status_externo: statusExterno,
          data_status: new Date().toISOString(),
          descricao_evento: 'Proposta importada via API',
          origem: 'API_BANCO',
          payload_evento_json: JSON.stringify(item),
        });

        importadas++;
      } catch (e) {
        erros++;
        console.error('Erro ao processar item:', e.message, JSON.stringify(item));
      }
    }

    // Atualiza data da última sync
    await base44.asServiceRole.entities.ConfiguracaoApiBanco.update(config.id, {
      ultima_sincronizacao_em: new Date().toISOString(),
      ultimo_erro: erros > 0 ? `${erros} erros durante importação` : null,
    });

    return Response.json({
      success: true,
      total_api: propostasApi.length,
      importadas,
      atualizadas,
      erros,
    });

  } catch (e) {
    await base44.asServiceRole.entities.LogIntegracaoBanco.create({
      empresa_id,
      banco_id: config.banco_id,
      configuracao_api_id: config.id,
      tipo_acao: 'importar_propostas',
      sucesso: false,
      mensagem_erro: e.message,
      executado_em: new Date().toISOString(),
    });

    return Response.json({ success: false, error: e.message, importadas: 0, atualizadas: 0 });
  }
});