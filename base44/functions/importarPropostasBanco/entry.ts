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
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    
    const isAdmin = ['admin', 'gerente', 'master', 'super_admin', 'colaborador'].includes(user.perfil || user.role);
    if (!isAdmin) {
      console.error(`[AUTH] Acesso negado. user.perfil=${user.perfil}, user.role=${user.role}`);
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { configuracao_id, empresa_id } = body;

    const configs = await base44.asServiceRole.entities.ConfiguracaoApiBanco.filter({ id: configuracao_id });
    if (!configs || configs.length === 0) return Response.json({ error: 'Configuração não encontrada' }, { status: 404 });
    const config = configs[0];

    if (!config.integracao_ativa) return Response.json({ error: 'Integração inativa' }, { status: 400 });

    const baseUrl = extrairBaseUrl(config.base_url);
    console.log(`[API] Base URL: ${baseUrl}`);

    const isAjin = baseUrl.includes('ajin.io') || (config.propostas_url || '').includes('ajin.io');
    const isFinanto = baseUrl.includes('finanto') || baseUrl.includes('joinbank');

    let authHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json' };

    if (isAjin) {
      const apiKey = config.api_key || '';
      authHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json', 'apikey': apiKey };
      console.log(`[API] Modo Ajin.io, apikey: ${apiKey ? 'OK' : 'VAZIO'}`);
    } else if (isFinanto) {
      const finantoToken = Deno.env.get('FINANTOBANK_ACCESS_TOKEN') || '';
      if (finantoToken) {
        authHeaders['Authorization'] = `Bearer ${finantoToken}`;
        console.log('[Finanto] Usando FINANTOBANK_ACCESS_TOKEN');
      } else if (config.username && config.password) {
        // Priorizar autenticação via usuário/senha para FinantoBank
        try {
          console.log('[Finanto] Tentando autenticação com Usuário e Senha');
          const loginUrls = config.login_url
            ? [config.login_url]
            : [
                `${baseUrl}/sign-in`,
                `${baseUrl}/login`,
                `${baseUrl}/api/login`,
                `${baseUrl}/auth/login`,
              ];
          
          for (const loginUrl of loginUrls) {
            try {
              console.log(`[Finanto] POST ${loginUrl}`);
              const loginRes = await fetch(loginUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: config.username, password: config.password }),
              });
              console.log(`[Finanto] ${loginUrl} HTTP ${loginRes.status}`);
              
              if (loginRes.ok) {
                const loginData = await loginRes.json();
                const token = loginData.token || loginData.access_token || loginData.accessToken || loginData.jwt || loginData.data?.token;
                if (token) {
                  authHeaders['Authorization'] = `Bearer ${token}`;
                  console.log(`[Finanto] Token obtido: ${token.slice(0, 20)}...`);
                  break;
                }
              }
            } catch (e) {
              console.log(`[Finanto] Erro em ${loginUrl}: ${e.message}`);
            }
          }
          if (!authHeaders['Authorization']) {
            console.log('[Finanto] Nenhum token obtido. Tentando acesso sem autenticação.');
          }
        } catch (authErr) {
          console.log(`[Finanto] Erro geral na autenticação: ${authErr.message}`);
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
    return Response.json({ success: false, error: e.message, importadas: 0, atualizadas: 0, clientes_criados: 0 });
  }
});