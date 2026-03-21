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

  // Busca propostas e clientes existentes da empresa para evitar duplicatas
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

    // Tenta encontrar por CPF
    if (cpfLimpo && clientesPorCpf[cpfLimpo]) {
      return clientesPorCpf[cpfLimpo];
    }

    // Cria novo cliente
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
    return novoCliente;
  };

  let importadas = 0;
  let atualizadas = 0;
  let clientesCriados = 0;
  let erros = 0;
  let responseData = null;
  let statusHttp = null;

  try {
    // Tenta buscar propostas da API do banco
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
          } else if (data.result && Array.isArray(data.result)) {
            propostasApi = data.result;
          }

          if (propostasApi.length > 0) break;
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
      response_json: JSON.stringify(responseData).slice(0, 5000),
      status_http: statusHttp,
      sucesso: propostasApi.length > 0,
      mensagem_erro: propostasApi.length === 0 ? 'Nenhuma proposta retornada pela API' : null,
      executado_em: new Date().toISOString(),
    });

    // Processa cada proposta retornada
    for (const item of propostasApi) {
      try {
        // Extrai campos comuns de diferentes formatos de API (incluindo Finanto)
        const codigoBanco = String(
          item.id || item.codigo || item.numero || item.contrato ||
          item.id_proposta || item.codigo_proposta || item.numero_contrato ||
          item.proposalId || item.contractNumber || ''
        );

        if (!codigoBanco) continue;

        const statusExterno = item.status || item.situacao || item.status_proposta || item.situacao_proposta || item.statusCode;
        const statusInterno = mapearStatus(statusExterno);

        // Dados do cliente (campos comuns da Finanto e outros bancos)
        const clienteNome = item.cliente_nome || item.nome_cliente || item.devedor || item.beneficiario ||
          item.nomeCliente || item.nomeBeneficiario || item.customer?.name || item.client?.name || '';
        const clienteCpf = item.cpf || item.cpf_cliente || item.documento || item.documentoCliente ||
          item.cpfCliente || item.customer?.cpf || item.client?.cpf || item.customer?.document || '';
        const clienteCelular = item.celular || item.telefone || item.phone || item.customer?.phone || item.client?.phone || '';
        const clienteDataNasc = item.data_nascimento || item.dataNascimento || item.customer?.birthDate || '';

        // Dados financeiros
        const valorCredito = parseFloat(item.valor || item.valor_emprestimo || item.valor_credito ||
          item.valor_contrato || item.valorCredito || item.amount || item.principal || 0);
        const valorLiquido = parseFloat(item.valor_liquido || item.valor_liberado || item.valorLiquido ||
          item.netAmount || item.valorLiquidoLiberado || valorCredito || 0);
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
          // Atualiza status se mudou
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

            // Tenta vincular cliente se ainda não vinculado
            if (!existente.cliente_id && clienteCpf) {
              const cliente = await obterOuCriarCliente(clienteNome, clienteCpf, clienteCelular, clienteDataNasc);
              if (cliente) {
                updateData.cliente_id = cliente.id;
                updateData.cliente_nome = cliente.nome_completo;
                updateData.cliente_cpf = clienteCpf;
                if (!clientesPorCpf[(clienteCpf || '').replace(/\D/g, '')]) clientesCriados++;
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

        // Busca ou cria o cliente antes de criar a proposta
        let clienteId = '';
        let clienteNomeNormalizado = clienteNome;
        let clienteCpfNormalizado = clienteCpf;

        if (clienteCpf || clienteNome) {
          const clienteAntes = clientesPorCpf[(clienteCpf || '').replace(/\D/g, '')];
          const cliente = await obterOuCriarCliente(clienteNome, clienteCpf, clienteCelular, clienteDataNasc);
          if (cliente) {
            clienteId = cliente.id;
            clienteNomeNormalizado = cliente.nome_completo || clienteNome;
            clienteCpfNormalizado = cliente.cpf || clienteCpf;
            if (!clienteAntes) clientesCriados++;
          }
        }

        // Cria nova proposta com cliente vinculado
        const novaProposta = await base44.asServiceRole.entities.Proposta.create({
          empresa_id,
          produto: 'emprestimo',
          cliente_id: clienteId,
          cliente_nome: clienteNomeNormalizado,
          cliente_cpf: clienteCpfNormalizado,
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

        // Histórico inicial
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
        console.error('Erro ao processar item:', e.message, JSON.stringify(item).slice(0, 500));
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
      clientes_criados: clientesCriados,
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

    return Response.json({ success: false, error: e.message, importadas: 0, atualizadas: 0, clientes_criados: 0 });
  }
});