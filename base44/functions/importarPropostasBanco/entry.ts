import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function extrairBaseUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url;
  }
}

async function autenticarFinanto(baseUrl, username, password, apiKey, loginUrl) {
  if (username && password) {
    const bodyFormats = [
      { username, password },
      { login: username, senha: password },
      { login: username, password },
      { email: username, password },
      { usuario: username, senha: password },
    ];

    const loginUrlsToTry = loginUrl
      ? [loginUrl]
      : [
          `${baseUrl}/sign-in`, `${baseUrl}/finanto/sign-in`,
          `${baseUrl}/login`, `${baseUrl}/auth/login`, `${baseUrl}/api/login`,
        ];

    for (const fullLoginUrl of loginUrlsToTry) {
      for (const body of bodyFormats) {
        try {
          const res = await fetch(fullLoginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(body),
          });
          const contentType = res.headers.get('content-type') || '';
          console.log(`[Auth] ${fullLoginUrl} HTTP ${res.status}`);
          if (res.ok && contentType.includes('json')) {
            const data = await res.json();
            const token = data.token || data.access_token || data.accessToken || data.jwt ||
              data.data?.token || data.data?.access_token || data.result?.token;
            if (token) {
              console.log(`[Auth] Token obtido via ${fullLoginUrl}`);
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch (e) {
          console.log(`[Auth] Erro em ${fullLoginUrl}: ${e.message}`);
        }
      }
    }
  }

  if (apiKey && !apiKey.startsWith('http')) {
    return { Authorization: `Bearer ${apiKey}`, 'X-API-Key': apiKey };
  }

  return {};
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['admin', 'gerente', 'master', 'super_admin', 'colaborador'].includes(user.perfil)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { configuracao_id, empresa_id } = await req.json();

  const configs = await base44.asServiceRole.entities.ConfiguracaoApiBanco.filter({ id: configuracao_id });
  if (!configs || configs.length === 0) return Response.json({ error: 'Configuração não encontrada' }, { status: 404 });
  const config = configs[0];

  if (!config.integracao_ativa) return Response.json({ error: 'Integração inativa' }, { status: 400 });

  const baseUrl = extrairBaseUrl(config.base_url);
  console.log(`[API] Base URL: ${baseUrl}`);

  // Detecta tipo de API
  const isAjin = baseUrl.includes('ajin.io') || (config.propostas_url || '').includes('ajin.io');
  const isFinanto = baseUrl.includes('finanto') || baseUrl.includes('joinbank');

  // Monta headers de autenticação
  let authHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json' };

  if (isAjin) {
    const apiKey = config.api_key || '';
    authHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json', 'apikey': apiKey };
    console.log(`[API] Modo Ajin.io, apikey: ${apiKey ? 'OK' : 'VAZIO'}`);
  } else if (isFinanto) {
    // FinantoBank: usa o token salvo nos segredos
    const finantoToken = Deno.env.get('FINANTOBANK_ACCESS_TOKEN') || '';
    if (finantoToken) {
      authHeaders['Authorization'] = `Bearer ${finantoToken}`;
      console.log('[Finanto] Usando FINANTOBANK_ACCESS_TOKEN');
    } else {
      // Fallback: tenta login com credenciais da configuração
      try {
        const extraHeaders = await autenticarFinanto(baseUrl, config.username, config.password, config.api_key, config.login_url);
        authHeaders = { ...authHeaders, ...extraHeaders };
      } catch (authErr) {
        console.log(`[Finanto] Erro na autenticação: ${authErr.message}`);
      }
    }
  } else {
    try {
      const extraHeaders = await autenticarFinanto(baseUrl, config.username, config.password, config.api_key, config.login_url);
      authHeaders = { ...authHeaders, ...extraHeaders };
    } catch (authErr) {
      console.log(`[API] Erro na autenticação: ${authErr.message}`);
    }
  }

  // Busca mapeamentos de status e dados existentes
  const mapeamentos = await base44.asServiceRole.entities.MapeamentoStatusBanco.filter({ configuracao_api_id: config.id });
  const mapearStatus = (statusExterno) => {
    if (!statusExterno) return statusExterno;
    const mapa = mapeamentos.find(m => m.status_externo.toUpperCase() === String(statusExterno).toUpperCase());
    return mapa ? mapa.status_interno : statusExterno;
  };

  const [propostasExistentes, clientesExistentes] = await Promise.all([
    base44.asServiceRole.entities.Proposta.filter({ empresa_id, produto: 'emprestimo' }),
    base44.asServiceRole.entities.Cliente.filter({ empresa_id }),
  ]);

  const codigosExistentes = new Set(propostasExistentes.map(p => p.codigo_proposta_banco).filter(Boolean));

  const clientesPorCpf = {};
  for (const c of clientesExistentes) {
    const cpf = (c.cpf || c.pj_cnpj || '').replace(/\D/g, '');
    if (cpf) clientesPorCpf[cpf] = c;
  }

  const obterOuCriarCliente = async (clienteNome, clienteCpfRaw, celular, dataNasc) => {
    const cpfLimpo = (clienteCpfRaw || '').replace(/\D/g, '');
    if (!cpfLimpo && !clienteNome) return null;
    if (cpfLimpo && clientesPorCpf[cpfLimpo]) return { cliente: clientesPorCpf[cpfLimpo], criou: false };

    const novoCliente = await base44.asServiceRole.entities.Cliente.create({
      empresa_id,
      tipo_pessoa: 'Física',
      nome_completo: clienteNome || 'Cliente Importado',
      cpf: clienteCpfRaw || '',
      celular: celular || '',
      data_nascimento: dataNasc || '',
      status: 'ativo',
    });

    if (cpfLimpo) clientesPorCpf[cpfLimpo] = novoCliente;
    return { cliente: novoCliente, criou: true };
  };

  let importadas = 0;
  let atualizadas = 0;
  let clientesCriados = 0;
  let erros = 0;
  let propostasApi = [];
  let ultimoStatusHttp = null;
  let ultimoResponseData = null;
  let endpointUsado = null;

  // URLs de propostas a tentar
  const propostasUrls = config.propostas_url
    ? [config.propostas_url]
    : isAjin
      ? [`${baseUrl}/v3/loan-products/search/basic`]
      : isFinanto
        ? [`${baseUrl}/loans`, `${baseUrl}/propostas`, `${baseUrl}/proposals`]
        : [
            `${baseUrl}/propostas`, `${baseUrl}/proposals`,
            `${baseUrl}/contratos`, `${baseUrl}/emprestimos`, `${baseUrl}/loans`,
          ];

  try {
    for (const url of propostasUrls) {
      try {
        console.log(`[API] Tentando endpoint: ${url}`);

        const fetchOptions = isAjin
          ? { method: 'POST', headers: authHeaders, body: JSON.stringify({ offset: 0, limit: 500 }) }
          : { method: 'GET', headers: authHeaders };

        const res = await fetch(url, fetchOptions);
        ultimoStatusHttp = res.status;
        console.log(`[API] Status ${res.status} para ${url}`);

        if (res.ok) {
          const data = await res.json();
          ultimoResponseData = data;

          if (Array.isArray(data)) {
            propostasApi = data;
          } else if (data.data && Array.isArray(data.data)) {
            propostasApi = data.data;
          } else if (data.items && Array.isArray(data.items)) {
            propostasApi = data.items;
          } else if (data.content && Array.isArray(data.content)) {
            propostasApi = data.content;
          } else if (data.result && Array.isArray(data.result)) {
            propostasApi = data.result;
          } else if (data.propostas && Array.isArray(data.propostas)) {
            propostasApi = data.propostas;
          } else if (data.loans && Array.isArray(data.loans)) {
            propostasApi = data.loans;
          }

          endpointUsado = url;
          console.log(`[API] ${propostasApi.length} registros em ${url}`);
          if (propostasApi.length > 0) break;
        }
      } catch (endpointErr) {
        console.log(`[API] Erro no endpoint: ${endpointErr.message}`);
      }
    }

    await base44.asServiceRole.entities.LogIntegracaoBanco.create({
      empresa_id,
      banco_id: config.banco_id,
      configuracao_api_id: config.id,
      tipo_acao: 'importar_propostas',
      request_json: JSON.stringify({ baseUrl, endpointUsado, propostasUrls }),
      response_json: JSON.stringify(ultimoResponseData).slice(0, 5000),
      status_http: ultimoStatusHttp,
      sucesso: propostasApi.length > 0,
      mensagem_erro: propostasApi.length === 0 ? `Nenhuma proposta. HTTP: ${ultimoStatusHttp}. Endpoints: ${propostasUrls.join(', ')}` : null,
      executado_em: new Date().toISOString(),
    });

    if (propostasApi.length === 0) {
      await base44.asServiceRole.entities.ConfiguracaoApiBanco.update(config.id, {
        ultima_sincronizacao_em: new Date().toISOString(),
        ultimo_erro: `Nenhuma proposta retornada. HTTP: ${ultimoStatusHttp}. Endpoints: ${propostasUrls.join(', ')}`,
      });
      return Response.json({
        success: false,
        error: `Nenhuma proposta retornada pela API. HTTP: ${ultimoStatusHttp}. Endpoints tentados: ${propostasUrls.join(', ')}. Verifique token e URL.`,
        importadas: 0, atualizadas: 0, clientes_criados: 0,
      });
    }

    for (const item of propostasApi) {
      try {
        const codigoBanco = String(
          item.id || item.codigo || item.numero || item.contrato ||
          item.id_proposta || item.codigo_proposta || item.proposalId || item.contractNumber || ''
        );
        if (!codigoBanco) continue;

        const statusExterno = item.status || item.situacao || item.status_proposta || item.statusCode;
        const statusInterno = mapearStatus(statusExterno);

        const clienteNome = item.customer?.name || item.client?.name || item.cliente_nome || item.nomeCliente || '';
        const clienteCpf = item.customer?.document || item.customer?.cpf || item.client?.cpf || item.cpf || item.documento || '';
        const clienteCelular = item.customer?.phone || item.client?.phone || item.celular || item.telefone || '';
        const clienteDataNasc = item.customer?.birthDate || item.data_nascimento || '';

        const valorCredito = parseFloat(item.amount || item.valor || item.valor_credito || item.principal || 0);
        const valorLiquido = parseFloat(item.netAmount || item.valor_liquido || valorCredito || 0);

        const dataVenda = (item.createdAt || item.data_criacao || item.data_proposta || item.data || new Date().toISOString()).slice(0, 10);
        const dataLib = (item.releaseDate || item.data_liberacao || item.data_pagamento || '');

        const TIPO_AJIN_MAP = { 1: 'NOVO', 2: 'REFINANCIAMENTO', 3: 'PORTABILIDADE_PURA', 4: 'REFIN_PORTABILIDADE', 5: 'REFINANCIAMENTO' };
        const tipoEmprestimo = (item.operation?.code && TIPO_AJIN_MAP[item.operation.code]) || item.tipo || item.tipo_operacao || 'NOVO';

        const prazo = parseInt(item.installments || item.prazo || 0);
        const valorParcela = parseFloat(item.installmentAmount || item.valor_parcela || 0);
        const contrato = item.contractNumber || item.contrato || codigoBanco;
        const convenioNome = item.agreement?.name || item.convenio || item.orgao || '';
        const vendedorNome = item.agent?.name || item.vendedor || item.agente || '';
        const ade = item.ade || item.numero_ade || '';
        const beneficio = item.registrationNumber || item.matricula || item.numero_beneficio || '';

        if (codigosExistentes.has(codigoBanco)) {
          const existente = propostasExistentes.find(p => p.codigo_proposta_banco === codigoBanco);
          if (existente && statusExterno && statusExterno !== existente.status_externo_atual) {
            const updateData = {
              status_atual: statusInterno,
              status_externo_atual: statusExterno,
              data_status_atual: new Date().toISOString(),
              data_ultima_atualizacao_api: new Date().toISOString(),
              api_sincronizada: true,
              payload_ultima_resposta_json: JSON.stringify(item).slice(0, 3000),
            };

            if (!existente.cliente_id && clienteCpf) {
              const result = await obterOuCriarCliente(clienteNome, clienteCpf, clienteCelular, clienteDataNasc);
              if (result) {
                updateData.cliente_id = result.cliente.id;
                updateData.cliente_nome = result.cliente.nome_completo;
                updateData.cliente_cpf = clienteCpf;
                if (result.criou) clientesCriados++;
              }
            }

            await base44.asServiceRole.entities.Proposta.update(existente.id, updateData);
            await base44.asServiceRole.entities.HistoricoProposta.create({
              empresa_id, proposta_id: existente.id, banco_id: config.banco_id,
              configuracao_api_id: config.id, status: statusInterno, status_externo: statusExterno,
              data_status: new Date().toISOString(),
              descricao_evento: `Status atualizado via sincronização: ${statusExterno}`,
              origem: 'API_BANCO', payload_evento_json: JSON.stringify(item).slice(0, 3000),
            });
            atualizadas++;
          }
          continue;
        }

        let clienteId = '';
        let clienteNomeNorm = clienteNome;
        let clienteCpfNorm = clienteCpf;

        if (clienteCpf || clienteNome) {
          const result = await obterOuCriarCliente(clienteNome, clienteCpf, clienteCelular, clienteDataNasc);
          if (result) {
            clienteId = result.cliente.id;
            clienteNomeNorm = result.cliente.nome_completo || clienteNome;
            clienteCpfNorm = result.cliente.cpf || clienteCpf;
            if (result.criou) clientesCriados++;
          }
        }

        const novaProposta = await base44.asServiceRole.entities.Proposta.create({
          empresa_id, produto: 'emprestimo',
          cliente_id: clienteId, cliente_nome: clienteNomeNorm, cliente_cpf: clienteCpfNorm,
          administradora_id: config.banco_id, administradora_nome: config.banco_nome || '',
          banco_id: config.banco_id, configuracao_api_id: config.id,
          codigo_proposta_banco: codigoBanco, contrato,
          status: statusInterno || statusExterno || 'importado',
          status_atual: statusInterno, status_externo_atual: statusExterno,
          data_venda: dataVenda, valor_credito: valorCredito, valor_liquido: valorLiquido,
          emprestimo_tipo: tipoEmprestimo, emprestimo_prazo: prazo, emprestimo_valor_parcela: valorParcela,
          emprestimo_data_liberacao: dataLib ? String(dataLib).slice(0, 10) : '',
          emprestimo_convenio_nome: convenioNome, emprestimo_numero_ade: ade,
          emprestimo_numero_beneficio: beneficio, vendedor_nome: vendedorNome,
          data_status_atual: new Date().toISOString(), data_ultima_atualizacao_api: new Date().toISOString(),
          api_sincronizada: true, payload_ultima_resposta_json: JSON.stringify(item).slice(0, 3000),
        });

        codigosExistentes.add(codigoBanco);

        await base44.asServiceRole.entities.HistoricoProposta.create({
          empresa_id, proposta_id: novaProposta.id, banco_id: config.banco_id,
          configuracao_api_id: config.id, status: statusInterno || statusExterno,
          status_externo: statusExterno, data_status: new Date().toISOString(),
          descricao_evento: 'Proposta importada via API', origem: 'API_BANCO',
          payload_evento_json: JSON.stringify(item).slice(0, 3000),
        });

        importadas++;
      } catch (e) {
        erros++;
        console.error(`[API] Erro ao processar item: ${e.message}`);
      }
    }

    await base44.asServiceRole.entities.ConfiguracaoApiBanco.update(config.id, {
      ultima_sincronizacao_em: new Date().toISOString(),
      ultimo_erro: erros > 0 ? `${erros} erros durante importação` : null,
    });

    return Response.json({
      success: true,
      total_api: propostasApi.length,
      importadas, atualizadas, clientes_criados: clientesCriados, erros,
      endpoint_usado: endpointUsado, base_url_usada: baseUrl,
    });

  } catch (e) {
    console.error(`[API] Erro geral: ${e.message}`);
    await base44.asServiceRole.entities.LogIntegracaoBanco.create({
      empresa_id, banco_id: config.banco_id, configuracao_api_id: config.id,
      tipo_acao: 'importar_propostas', sucesso: false,
      mensagem_erro: e.message, executado_em: new Date().toISOString(),
    });
    return Response.json({ success: false, error: e.message, importadas: 0, atualizadas: 0, clientes_criados: 0 });
  }
});