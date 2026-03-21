import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// Extrai a base URL raiz (remove caminhos como /sign-in, /login, etc.)
function extrairBaseUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url;
  }
}

// Tenta autenticar na Finanto / JoinBank e retornar o token
async function autenticarFinanto(baseUrl, username, password, apiKey) {
  // Se tiver username/password, faz login para obter token
  if (username && password) {
    // Tenta vários formatos de body que APIs brasileiras costumam usar
    const bodyFormats = [
      { username, password },
      { login: username, senha: password },
      { login: username, password },
      { user: username, password },
      { cpf: username, senha: password },
      { email: username, password },
      { usuario: username, senha: password },
    ];

    const loginEndpoints = ['/sign-in', '/login', '/auth', '/auth/login', '/api/login', '/api/auth', '/authenticate'];

    for (const endpoint of loginEndpoints) {
      for (const body of bodyFormats) {
        try {
          const res = await fetch(`${baseUrl}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(body),
          });

          const contentType = res.headers.get('content-type') || '';
          console.log(`[Finanto] Login ${endpoint} com campos ${JSON.stringify(Object.keys(body))}: HTTP ${res.status}, ContentType: ${contentType}`);

          if (res.ok && contentType.includes('application/json')) {
            const data = await res.json();
            console.log(`[Finanto] Login response keys: ${JSON.stringify(Object.keys(data))}`);
            const token =
              data.token ||
              data.access_token ||
              data.accessToken ||
              data.jwt ||
              data.id_token ||
              data.data?.token ||
              data.data?.access_token ||
              data.data?.accessToken ||
              data.result?.token ||
              data.auth?.token ||
              data.user?.token;
            if (token) {
              console.log(`[Finanto] ✅ Token obtido via ${endpoint} com campos ${JSON.stringify(Object.keys(body))}`);
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch (e) {
          console.log(`[Finanto] Erro em ${endpoint}: ${e.message}`);
        }
      }
    }
    console.log(`[Finanto] ⚠️ Não foi possível obter token com as credenciais fornecidas`);
  }

  // Se tiver apiKey real (não é uma URL), usa diretamente
  if (apiKey && !apiKey.startsWith('http')) {
    return {
      Authorization: `Bearer ${apiKey}`,
      'X-API-Key': apiKey,
    };
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

  // Busca configuração
  const configs = await base44.asServiceRole.entities.ConfiguracaoApiBanco.filter({ id: configuracao_id });
  if (!configs || configs.length === 0) return Response.json({ error: 'Configuração não encontrada' }, { status: 404 });
  const config = configs[0];

  if (!config.integracao_ativa) return Response.json({ error: 'Integração inativa' }, { status: 400 });

  // Extrai a base URL correta (sem /sign-in ou outros caminhos)
  const baseUrl = extrairBaseUrl(config.base_url);
  console.log(`[Finanto] Base URL extraída: ${baseUrl} (original: ${config.base_url})`);

  // Monta headers de autenticação
  let authHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json' };

  try {
    const extraHeaders = await autenticarFinanto(baseUrl, config.username, config.password, config.api_key);
    authHeaders = { ...authHeaders, ...extraHeaders };
    console.log(`[Finanto] Auth headers montados: ${JSON.stringify(Object.keys(authHeaders))}`);
  } catch (authErr) {
    console.log(`[Finanto] Erro na autenticação: ${authErr.message}`);
  }

  // Busca mapeamentos de status
  const mapeamentos = await base44.asServiceRole.entities.MapeamentoStatusBanco.filter({ configuracao_api_id: config.id });
  const mapearStatus = (statusExterno) => {
    if (!statusExterno) return statusExterno;
    const mapa = mapeamentos.find(m => m.status_externo.toUpperCase() === String(statusExterno).toUpperCase());
    return mapa ? mapa.status_interno : statusExterno;
  };

  // Busca propostas e clientes existentes da empresa
  const [propostasExistentes, clientesExistentes] = await Promise.all([
    base44.asServiceRole.entities.Proposta.filter({ empresa_id, produto: 'emprestimo' }),
    base44.asServiceRole.entities.Cliente.filter({ empresa_id }),
  ]);

  const codigosExistentes = new Set(propostasExistentes.map(p => p.codigo_proposta_banco).filter(Boolean));

  // Mapa CPF -> cliente para lookup rápido
  const clientesPorCpf = {};
  for (const c of clientesExistentes) {
    const cpf = (c.cpf || c.pj_cnpj || '').replace(/\D/g, '');
    if (cpf) clientesPorCpf[cpf] = c;
  }

  // Função para buscar ou criar cliente
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

  // Tenta endpoints comuns da Finanto/JoinBank
  const endpoints = [
    '/propostas',
    '/proposals',
    '/contratos',
    '/contracts',
    '/operacoes',
    '/operations',
    '/emprestimos',
    '/loans',
  ];

  try {
    for (const endpoint of endpoints) {
      try {
        const url = `${baseUrl}${endpoint}`;
        console.log(`[Finanto] Tentando endpoint: ${url}`);
        const res = await fetch(url, { method: 'GET', headers: authHeaders });
        ultimoStatusHttp = res.status;
        console.log(`[Finanto] Status ${res.status} para ${url}`);

        if (res.ok) {
          const data = await res.json();
          ultimoResponseData = data;

          if (Array.isArray(data)) {
            propostasApi = data;
          } else if (data.data && Array.isArray(data.data)) {
            propostasApi = data.data;
          } else if (data.propostas && Array.isArray(data.propostas)) {
            propostasApi = data.propostas;
          } else if (data.contratos && Array.isArray(data.contratos)) {
            propostasApi = data.contratos;
          } else if (data.result && Array.isArray(data.result)) {
            propostasApi = data.result;
          } else if (data.items && Array.isArray(data.items)) {
            propostasApi = data.items;
          } else if (data.content && Array.isArray(data.content)) {
            propostasApi = data.content;
          }

          endpointUsado = endpoint;
          console.log(`[Finanto] Encontrou ${propostasApi.length} propostas em ${endpoint}`);

          if (propostasApi.length > 0) break;
        }
      } catch (endpointErr) {
        console.log(`[Finanto] Erro no endpoint: ${endpointErr.message}`);
      }
    }

    // Log da chamada principal
    await base44.asServiceRole.entities.LogIntegracaoBanco.create({
      empresa_id,
      banco_id: config.banco_id,
      configuracao_api_id: config.id,
      tipo_acao: 'importar_propostas',
      request_json: JSON.stringify({ baseUrl, endpointUsado, endpoints }),
      response_json: JSON.stringify(ultimoResponseData).slice(0, 5000),
      status_http: ultimoStatusHttp,
      sucesso: propostasApi.length > 0,
      mensagem_erro: propostasApi.length === 0 ? `Nenhuma proposta retornada. Base URL: ${baseUrl}. Endpoints tentados: ${endpoints.join(', ')}. Status HTTP: ${ultimoStatusHttp}` : null,
      executado_em: new Date().toISOString(),
    });

    if (propostasApi.length === 0) {
      await base44.asServiceRole.entities.ConfiguracaoApiBanco.update(config.id, {
        ultima_sincronizacao_em: new Date().toISOString(),
        ultimo_erro: `Nenhuma proposta retornada. Verifique a URL e credenciais. HTTP: ${ultimoStatusHttp}`,
      });
      return Response.json({
        success: false,
        error: `Nenhuma proposta retornada pela API. Base URL usada: ${baseUrl}. HTTP status: ${ultimoStatusHttp}. Verifique as credenciais na Configuração API.`,
        importadas: 0,
        atualizadas: 0,
        clientes_criados: 0,
      });
    }

    // Processa cada proposta
    for (const item of propostasApi) {
      try {
        const codigoBanco = String(
          item.id || item.codigo || item.numero || item.contrato ||
          item.id_proposta || item.codigo_proposta || item.numero_contrato ||
          item.proposalId || item.contractNumber || ''
        );

        if (!codigoBanco) continue;

        const statusExterno = item.status || item.situacao || item.status_proposta || item.situacao_proposta || item.statusCode;
        const statusInterno = mapearStatus(statusExterno);

        const clienteNome = item.cliente_nome || item.nome_cliente || item.devedor || item.beneficiario ||
          item.nomeCliente || item.nomeBeneficiario || item.customer?.name || item.client?.name || '';
        const clienteCpf = item.cpf || item.cpf_cliente || item.documento || item.documentoCliente ||
          item.cpfCliente || item.customer?.cpf || item.client?.cpf || item.customer?.document || '';
        const clienteCelular = item.celular || item.telefone || item.phone || item.customer?.phone || item.client?.phone || '';
        const clienteDataNasc = item.data_nascimento || item.dataNascimento || item.customer?.birthDate || '';

        const valorCredito = parseFloat(item.valor || item.valor_emprestimo || item.valor_credito ||
          item.valor_contrato || item.valorCredito || item.amount || item.principal || 0);
        const valorLiquido = parseFloat(item.valor_liquido || item.valor_liberado || item.valorLiquido ||
          item.netAmount || valorCredito || 0);
        const dataVenda = item.data_criacao || item.data_proposta || item.data_contrato || item.data ||
          item.dataCriacao || item.createdAt || new Date().toISOString().slice(0, 10);
        const dataLib = item.data_liberacao || item.data_pagamento || item.dataLiberacao || item.releaseDate || '';
        const prazo = parseInt(item.prazo || item.prazo_meses || item.parcelas || item.installments || 0);
        const valorParcela = parseFloat(item.valor_parcela || item.parcela || item.installmentAmount || 0);
        const contrato = item.contrato || item.numero_contrato || item.contractNumber || codigoBanco;
        const convenioNome = item.convenio || item.convenio_nome || item.orgao || item.agreement || '';
        const vendedorNome = item.vendedor || item.agente || item.corretor || item.agent || item.seller || '';
        const ade = item.ade || item.numero_ade || item.adeNumber || '';
        const beneficio = item.matricula || item.numero_beneficio || item.beneficio || item.registrationNumber || '';
        const tipoEmprestimo = item.tipo || item.tipo_operacao || item.operationType || 'NOVO';

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
              empresa_id,
              proposta_id: existente.id,
              banco_id: config.banco_id,
              configuracao_api_id: config.id,
              status: statusInterno,
              status_externo: statusExterno,
              data_status: new Date().toISOString(),
              descricao_evento: `Status atualizado via importação: ${statusExterno}`,
              origem: 'API_BANCO',
              payload_evento_json: JSON.stringify(item).slice(0, 3000),
            });
            atualizadas++;
          }
          continue;
        }

        // Busca ou cria o cliente
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

        // Cria nova proposta
        const novaProposta = await base44.asServiceRole.entities.Proposta.create({
          empresa_id,
          produto: 'emprestimo',
          cliente_id: clienteId,
          cliente_nome: clienteNomeNorm,
          cliente_cpf: clienteCpfNorm,
          administradora_id: config.banco_id,
          administradora_nome: config.banco_nome || '',
          banco_id: config.banco_id,
          configuracao_api_id: config.id,
          codigo_proposta_banco: codigoBanco,
          contrato,
          status: statusInterno || statusExterno || 'importado',
          status_atual: statusInterno,
          status_externo_atual: statusExterno,
          data_venda: String(dataVenda).slice(0, 10),
          valor_credito: valorCredito,
          valor_liquido: valorLiquido,
          emprestimo_tipo: tipoEmprestimo,
          emprestimo_prazo: prazo,
          emprestimo_valor_parcela: valorParcela,
          emprestimo_data_liberacao: dataLib ? String(dataLib).slice(0, 10) : '',
          emprestimo_convenio_nome: convenioNome,
          emprestimo_numero_ade: ade,
          emprestimo_numero_beneficio: beneficio,
          vendedor_nome: vendedorNome,
          data_status_atual: new Date().toISOString(),
          data_ultima_atualizacao_api: new Date().toISOString(),
          api_sincronizada: true,
          payload_ultima_resposta_json: JSON.stringify(item).slice(0, 3000),
        });

        codigosExistentes.add(codigoBanco);

        await base44.asServiceRole.entities.HistoricoProposta.create({
          empresa_id,
          proposta_id: novaProposta.id,
          banco_id: config.banco_id,
          configuracao_api_id: config.id,
          status: statusInterno || statusExterno,
          status_externo: statusExterno,
          data_status: new Date().toISOString(),
          descricao_evento: 'Proposta importada via API Finanto',
          origem: 'API_BANCO',
          payload_evento_json: JSON.stringify(item).slice(0, 3000),
        });

        importadas++;
      } catch (e) {
        erros++;
        console.error(`[Finanto] Erro ao processar item: ${e.message}`);
      }
    }

    await base44.asServiceRole.entities.ConfiguracaoApiBanco.update(config.id, {
      ultima_sincronizacao_em: new Date().toISOString(),
      ultimo_erro: erros > 0 ? `${erros} erros durante importação` : null,
    });

    return Response.json({
      success: true,
      total_api: propostasApi.length,
      importadas,
      atualizadas,
      clientes_criados: clientesCriados,
      erros,
      endpoint_usado: endpointUsado,
      base_url_usada: baseUrl,
    });

  } catch (e) {
    console.error(`[Finanto] Erro geral: ${e.message}`);
    await base44.asServiceRole.entities.LogIntegracaoBanco.create({
      empresa_id,
      banco_id: config.banco_id,
      configuracao_api_id: config.id,
      tipo_acao: 'importar_propostas',
      sucesso: false,
      mensagem_erro: e.message,
      executado_em: new Date().toISOString(),
    });

    return Response.json({ success: false, error: e.message, importadas: 0, atualizadas: 0, clientes_criados: 0 });
  }
});