import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function extrairBaseUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url;
  }
}

function mapearStatus(statusExterno) {
  if (!statusExterno) return 'pendente';
  const s = String(statusExterno).toLowerCase();
  if (s.includes('aprovado') || s.includes('approved')) return 'aprovado';
  if (s.includes('recusado') || s.includes('rejected') || s.includes('denied')) return 'recusado';
  if (s.includes('pago') || s.includes('paid') || s.includes('liberado')) return 'pago';
  if (s.includes('analise') || s.includes('analysis') || s.includes('em_analise')) return 'em_analise';
  return 'pendente';
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
    let propostasApi = [];
    let ultimoStatusHttp = 0;
    let ultimoResponseData = null;
    let endpointUsado = '';
    let propostasUrls = [];

    if (isAjin) {
      const apiKey = config.api_key || '';
      authHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json', 'apikey': apiKey };
      console.log(`[API] Modo Ajin.io`);
      
      const urls = config.propostas_url ? [config.propostas_url] : [`${baseUrl}/propostas`, `${baseUrl}/api/propostas`];
      propostasUrls = urls;
      
      for (const url of urls) {
        try {
          console.log(`[Ajin] GET ${url}`);
          const res = await fetch(url, { method: 'GET', headers: authHeaders });
          ultimoStatusHttp = res.status;
          console.log(`[Ajin] HTTP ${res.status}`);
          
          if (res.ok) {
            const data = await res.json();
            ultimoResponseData = data;
            propostasApi = Array.isArray(data) ? data : (data.data || data.propostas || data.items || []);
            endpointUsado = url;
            console.log(`[Ajin] ${propostasApi.length} propostas`);
            if (propostasApi.length > 0) break;
          }
        } catch (e) {
          console.log(`[Ajin] Erro: ${e.message}`);
        }
      }
    } else if (isFinanto) {
      const finantoToken = Deno.env.get('FINANTOBANK_ACCESS_TOKEN') || '';
      if (finantoToken) {
        authHeaders['Authorization'] = `Bearer ${finantoToken}`;
        console.log('[Finanto] Token de secret usado');
      } else if (config.username && config.password) {
        console.log('[Finanto] Tentando autenticação com Usuário e Senha');
        const loginUrls = config.login_url
          ? [config.login_url]
          : [
              `${baseUrl}/api/auth/login`,
              `${baseUrl}/auth/login`,
              `${baseUrl}/api/login`,
              `${baseUrl}/login`,
              `${baseUrl}/sign-in`,
              `${baseUrl}/auth`,
            ];
        
        for (const loginUrl of loginUrls) {
          try {
            console.log(`[Finanto] POST ${loginUrl}`);
            const loginRes = await fetch(loginUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: config.username, password: config.password }),
            });
            console.log(`[Finanto] Login HTTP ${loginRes.status}`);
            
            if (loginRes.ok) {
              const loginData = await loginRes.json();
              const token = loginData.token || loginData.access_token || loginData.accessToken || loginData.jwt || loginData.data?.token;
              if (token) {
                authHeaders['Authorization'] = `Bearer ${token}`;
                console.log(`[Finanto] Token obtido`);
                break;
              }
            }
          } catch (e) {
            console.log(`[Finanto] Login erro: ${e.message}`);
          }
        }
      }

      const urls = config.propostas_url ? [config.propostas_url] : [
        `${baseUrl}/mub-balances`,
        baseUrl,
        `${baseUrl}/main`,
        `${baseUrl}/api/loans`,
        `${baseUrl}/api/propostas`,
        `${baseUrl}/loans`,
        `${baseUrl}/propostas`,
      ];
      propostasUrls = urls;
      
      for (const url of urls) {
        try {
          console.log(`[Finanto] GET ${url}`);
          const res = await fetch(url, { method: 'GET', headers: authHeaders });
          ultimoStatusHttp = res.status;
          console.log(`[Finanto] HTTP ${res.status}`);
          
          if (res.ok) {
            let data;
            try {
              data = await res.json();
            } catch (parseErr) {
              console.log(`[Finanto] Parse error`);
              continue;
            }
            ultimoResponseData = data;
            
            // Extrair propostas
            if (Array.isArray(data)) {
              propostasApi = data;
            } else if (data.data && Array.isArray(data.data)) {
              propostasApi = data.data;
            } else if (data.propostas && Array.isArray(data.propostas)) {
              propostasApi = data.propostas;
            } else if (data.loans && Array.isArray(data.loans)) {
              propostasApi = data.loans;
            } else if (data.items && Array.isArray(data.items)) {
              propostasApi = data.items;
            } else if (data.records && Array.isArray(data.records)) {
              propostasApi = data.records;
            } else if (data.result && Array.isArray(data.result)) {
              propostasApi = data.result;
            } else {
              const chaves = Object.keys(data || {}).slice(0, 10);
              console.log(`[Finanto] Nenhuma chave array. Disponíveis: ${chaves.join(', ')}`);
              propostasApi = [];
            }
            
            endpointUsado = url;
            console.log(`[Finanto] ${propostasApi.length} propostas encontradas`);
            if (propostasApi.length > 0) break;
          }
        } catch (e) {
          console.log(`[Finanto] Erro fetch: ${e.message}`);
        }
      }
    }

    let importadas = 0, atualizadas = 0, clientesCriados = 0, erros = 0;
    
    await base44.asServiceRole.entities.LogIntegracaoBanco.create({
      empresa_id,
      banco_id: config.banco_id,
      configuracao_api_id: config.id,
      tipo_acao: 'importar_propostas',
      request_json: JSON.stringify({ baseUrl, endpointUsado, propostasUrls }),
      response_json: JSON.stringify(ultimoResponseData || {}).slice(0, 5000),
      status_http: ultimoStatusHttp,
      sucesso: propostasApi.length > 0,
      mensagem_erro: propostasApi.length === 0 ? `Nenhuma proposta. HTTP: ${ultimoStatusHttp}` : null,
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

    // Fetch propostas existentes
    const propostasExistentes = await base44.asServiceRole.entities.Proposta.filter({ configuracao_api_id: config.id });
    const codigosExistentes = new Set(propostasExistentes.map(p => p.codigo_proposta_banco));

    for (const item of propostasApi) {
      try {
        const codigoBanco = String(item.id || item.codigo || item.numero || item.contractNumber || '');
        if (!codigoBanco) continue;

        const statusExterno = item.status || item.statusCode || '';
        const statusInterno = mapearStatus(statusExterno);

        const clienteNome = item.customerName || item.nome_cliente || '';
        const clienteCpf = item.document || item.cpf || '';
        const valorCredito = parseFloat(item.amount || item.valor || 0);

        if (codigosExistentes.has(codigoBanco)) {
          const existente = propostasExistentes.find(p => p.codigo_proposta_banco === codigoBanco);
          if (existente && statusExterno && statusExterno !== existente.status_externo_atual) {
            await base44.asServiceRole.entities.Proposta.update(existente.id, {
              status_atual: statusInterno,
              status_externo_atual: statusExterno,
              data_status_atual: new Date().toISOString(),
              data_ultima_atualizacao_api: new Date().toISOString(),
              api_sincronizada: true,
            });
            atualizadas++;
          }
          continue;
        }

        await base44.asServiceRole.entities.Proposta.create({
          empresa_id, produto: 'emprestimo',
          cliente_nome: clienteNome, cliente_cpf: clienteCpf,
          administradora_id: config.banco_id, administradora_nome: config.banco_nome || '',
          banco_id: config.banco_id, configuracao_api_id: config.id,
          codigo_proposta_banco: codigoBanco,
          status: statusInterno || 'importado',
          status_atual: statusInterno, status_externo_atual: statusExterno,
          data_venda: new Date().toISOString().slice(0, 10),
          valor_credito: valorCredito,
          data_status_atual: new Date().toISOString(),
          data_ultima_atualizacao_api: new Date().toISOString(),
          api_sincronizada: true,
        });

        codigosExistentes.add(codigoBanco);
        importadas++;
      } catch (e) {
        erros++;
        console.error(`Erro ao processar item: ${e.message}`);
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
    console.error(`Erro geral: ${e.message}`);
    return Response.json({ success: false, error: e.message, importadas: 0, atualizadas: 0, clientes_criados: 0 });
  }
});