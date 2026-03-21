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
async function autenticarFinanto(baseUrl, username, password, apiKey, loginUrl) {
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

    // Se loginUrl direto foi fornecido, usa ele primeiro (apenas como URL completa)
    const loginUrlsToTry = loginUrl
      ? [loginUrl] // URL explícita tem prioridade
      : [
          `${baseUrl}/sign-in`, `${baseUrl}/finanto/sign-in`,
          `${baseUrl}/login`, `${baseUrl}/finanto/login`,
          `${baseUrl}/auth/login`, `${baseUrl}/api/login`,
        ];

    for (const fullLoginUrl of loginUrlsToTry) {
      for (const body of bodyFormats) {
        // Tenta JSON
        try {
          const res = await fetch(fullLoginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(body),
          });

          const contentType = res.headers.get('content-type') || '';
          console.log(`[Finanto] Login ${fullLoginUrl} JSON ${JSON.stringify(Object.keys(body))}: HTTP ${res.status}, CT: ${contentType}`);

          if (res.ok && contentType.includes('json')) {
            const data = await res.json();
            console.log(`[Finanto] Login JSON response keys: ${JSON.stringify(Object.keys(data))}`);
            const token =
              data.token || data.access_token || data.accessToken || data.jwt ||
              data.id_token || data.data?.token || data.data?.access_token ||
              data.data?.accessToken || data.result?.token || data.auth?.token || data.user?.token;
            if (token) {
              console.log(`[Finanto] ✅ Token obtido via ${fullLoginUrl} JSON`);
              return { Authorization: `Bearer ${token}` };
            }
          }

        } catch (e) {
          console.log(`[Finanto] Erro em ${fullLoginUrl} JSON: ${e.message}`);
        }

        // Tenta form-urlencoded
        try {
          const formBody = new URLSearchParams(body).toString();
          const resForm = await fetch(fullLoginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
            body: formBody,
          });
          const ctForm = resForm.headers.get('content-type') || '';
          console.log(`[Finanto] Login ${fullLoginUrl} FORM ${JSON.stringify(Object.keys(body))}: HTTP ${resForm.status}, CT: ${ctForm}`);
          if (resForm.ok && ctForm.includes('json')) {
            const dataForm = await resForm.json();
            const tokenForm =
              dataForm.token || dataForm.access_token || dataForm.accessToken || dataForm.jwt ||
              dataForm.id_token || dataForm.data?.token || dataForm.data?.access_token ||
              dataForm.data?.accessToken || dataForm.result?.token;
            if (tokenForm) {
              console.log(`[Finanto] ✅ Token obtido via ${fullLoginUrl} FORM`);
              return { Authorization: `Bearer ${tokenForm}` };
            }
          }
        } catch (e) {
          console.log(`[Finanto] Erro em ${fullLoginUrl} FORM: ${e.message}`);
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
    const extraHeaders = await autenticarFinanto(baseUrl, config.username, config.password, config.api_key, config.login_url);
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

  // Detecta se é API Ajin.io (verifica base_url ou propostas_url)
  const isAjin = baseUrl.includes('ajin.io') || (config.propostas_url || '').includes('ajin.io');

  // Monta headers corretos para cada tipo de API
  if (isAjin) {
    // Ajin.io usa header "apikey" diretamente (não precisa de login/token)
    const apiKey = config.api_key || '';
    authHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json', 'apikey': apiKey };
    console.log(`[API] Modo Ajin.io detectado, usando header apikey: ${apiKey ? 'OK' : 'VAZIO!'}`);
  }

  // Se tem URL de propostas explícita, usa ela. Senão monta conforme o tipo de API.
  const propostasUrls = config.propostas_url
    ? [config.propostas_url]
    : isAjin
      ? [`${baseUrl}/v3/loan-products/search/basic`]
      : [
          `${baseUrl}/propostas`, `${baseUrl}/proposals`,
          `${baseUrl}/contratos`, `${baseUrl}/contracts`,
          `${baseUrl}/operacoes`, `${baseUrl}/operations`,
          `${baseUrl}/emprestimos`, `${baseUrl}/loans`,
        ];

  try {
    for (const url of propostasUrls) {
      try {
        console.log(`[API] Tentando endpoint: ${url}`);

        // Ajin.io usa POST com body de paginação
        const fetchOptions = isAjin
          ? {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({ offset: 0, limit: 500 }),
            }
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
          } else if (data.contratos && Array.isArray(data.contratos)) {
            propostasApi = data.contratos;
          }

          endpointUsado = url;
          console.log(`[API] Encontrou ${propostasApi.length} registros em ${url}`);

          if (propostasApi.length > 0) break;
        }
      } catch (endpointErr) {
        console.log(`[API] Erro no endpoint: ${endpointErr.message}`);
      }
    }

    // Log da chamada principal
    await base44.asServiceRole.entities.LogIntegracaoBanco.create({
      empresa_id,
      banco_id: config.banco_id,
      configuracao_api_id: config.id,
      tipo_acao: 'importar_propostas',
      request_json: JSON.stringify({ baseUrl, endpointUsado, propostasUrls }),
      response_json: JSON.stringify(ultimoResponseData).slice(0, 5000),
      status_http: ultimoStatusHttp,
      sucesso: propostasApi.length > 0,
      mensagem_erro: propostasApi.length === 0 ? `Nenhuma proposta retornada. Base URL: ${baseUrl}. Endpoints tentados: ${propostasUrls.join(', ')}. Status HTTP: ${ultimoStatusHttp}` : null,
      executado_em: new Date().toISOString(),
    });

    if (propostasApi.length === 0) {
      await base44.asServiceRole.entities.ConfiguracaoApiBanco.update(config.id, {
        ultima_sincronizacao_em: new Date().toISOString(),
        ultimo_erro: `Nenhuma proposta retornada. Verifique a URL e credenciais. HTTP: ${ultimoStatusHttp}`,
      });
      return Response.json({
        success: false,
        error: `Nenhuma proposta retornada pela API. Base URL usada: ${baseUrl}. HTTP status: ${ultimoStatusHttp}. Endpoints tentados: ${propostasUrls.join(', ')}. Verifique as credenciais na Configuração API.`,
        importadas: 0,
        atualizadas: 0,
        clientes_criados: 0,
      });
    }

    // Processa cada proposta
    for (const item of propostasApi) {
      try {
        // Mapeamento de campos — suporta Ajin.io e formato genérico
        const codigoBanco = String(
          item.id || item.codigo || item.numero || item.contrato ||
          item.id_proposta || item.codigo_proposta || item.numero_contrato ||
          item.proposalId || item.contractNumber || ''
        );

        if (!codigoBanco) continue;

        const statusExterno = item.status || item.situacao || item.status_proposta || item.situacao_proposta || item.statusCode;
        const statusInterno = mapearStatus(statusExterno);

        // Cliente — Ajin.io: item.customer
        const clienteNome = item.customer?.name || item.cliente_nome || item.nome_cliente || item.devedor ||
          item.beneficiario || item.nomeCliente || item.nomeBeneficiario || item.client?.name || '';
        const clienteCpf = item.customer?.document || item.customer?.cpf || item.cpf || item.cpf_cliente ||
          item.documento || item.documentoCliente || item.cpfCliente || item.client?.cpf || '';
        const clienteCelular = item.customer?.phone || item.celular || item.telefone || item.phone || item.client?.phone || '';
        const clienteDataNasc = item.customer?.birthDate || item.data_nascimento || item.dataNascimento || '';

        // Valores — Ajin.io: item.amount / item.netAmount
        const valorCredito = parseFloat(item.amount || item.valor || item.valor_emprestimo || item.valor_credito ||
          item.valor_contrato || item.valorCredito || item.principal || 0);
        const valorLiquido = parseFloat(item.netAmount || item.valor_liquido || item.valor_liberado ||
          item.valorLiquido || valorCredito || 0);

        // Datas — Ajin.io: item.createdAt / item.releaseDate
        const dataVenda = item.createdAt || item.data_criacao || item.data_proposta || item.data_contrato ||
          item.data || item.dataCriacao || new Date().toISOString().slice(0, 10);
        const dataLib = item.releaseDate || item.data_liberacao || item.data_pagamento || item.dataLiberacao || '';

        // Tipo de operação — Ajin.io: item.operation.code (1=Novo,2=Refin,3=Port,4=Port+Refin,5=Refin Port)
        const TIPO_AJIN = { 1: 'NOVO', 2: 'REFINANCIAMENTO', 3: 'PORTABILIDADE_PURA', 4: 'REFIN_PORTABILIDADE', 5: 'REFINANCIAMENTO' };
        const operationCode = item.operation?.code;
        const tipoEmprestimo = (operationCode && TIPO_AJIN[operationCode]) ||
          item.tipo || item.tipo_operacao || item.operationType || 'NOVO';

        const prazo = parseInt(item.installments || item.prazo || item.prazo_meses || item.parcelas || 0);
        const valorParcela = parseFloat(item.installmentAmount || item.valor_parcela || item.parcela || 0);
        const contrato = item.contractNumber || item.contrato || item.numero_contrato || codigoBanco;
        const convenioNome = item.agreement?.name || item.convenio || item.convenio_nome || item.orgao || '';
        const vendedorNome = item.agent?.name || item.vendedor || item.agente || item.corretor || item.seller || '';
        const ade = item.ade || item.numero_ade || item.adeNumber || '';
        const beneficio = item.registrationNumber || item.matricula || item.numero_beneficio || item.beneficio || '';

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