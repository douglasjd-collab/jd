import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const NVOIP_BASE = 'https://api.nvoip.com.br/v2';
const BASIC_AUTH = 'Basic TnZvaXBBcGlWMjpUblp2YVhCQmNHbFdNakl3TWpFPQ==';

async function getEmpresaEColab(base44, user) {
  let empresaId = user.empresa_id;
  let colaboradorId = user.colaborador_id;

  if (!empresaId || !colaboradorId) {
    const colabs = await base44.asServiceRole.entities.Colaborador.filter({ user_id: user.id });
    if (colabs && colabs.length > 0) {
      const colab = colabs.find(c => c.empresa_id && c.status === 'ativo') || colabs[0];
      if (colab) {
        empresaId = empresaId || colab.empresa_id;
        colaboradorId = colaboradorId || colab.id;
      }
    }
  }

  if (!empresaId) throw new Error('Empresa não encontrada para este usuário');
  return { empresaId, colaboradorId };
}

// Retorna config do usuário (prioritária) ou config da empresa (fallback)
async function getConfigParaUsuario(base44, user, empresaId, colaboradorId) {
  // 1. Tenta config pessoal do usuário
  if (colaboradorId) {
    const userConfigs = await base44.asServiceRole.entities.ConfiguracaoNvoipUsuario.filter({
      colaborador_id: colaboradorId,
      ativo: true,
    });
    if (userConfigs && userConfigs.length > 0 && userConfigs[0].numbersip && userConfigs[0].user_token) {
      return { config: userConfigs[0], tipo: 'usuario' };
    }
  }

  // 2. Fallback: config da empresa
  const empConfigs = await base44.asServiceRole.entities.ConfiguracaoNvoip.filter({ empresa_id: empresaId });
  if (empConfigs && empConfigs.length > 0) {
    return { config: empConfigs[0], tipo: 'empresa' };
  }

  throw new Error('Nenhuma configuração NVOIP encontrada. Configure seu ramal em Call Center → Configurar.');
}

async function getValidToken(base44, config, isUsuarioConfig) {
  const entityName = isUsuarioConfig ? 'ConfiguracaoNvoipUsuario' : 'ConfiguracaoNvoip';

  if (config.access_token && config.token_expires_at) {
    const expiresAt = new Date(config.token_expires_at);
    if (expiresAt > new Date(Date.now() + 60000)) {
      return config.access_token;
    }
  }

  if (config.refresh_token) {
    const bodyRefresh = new URLSearchParams();
    bodyRefresh.append('grant_type', 'refresh_token');
    bodyRefresh.append('refresh_token', config.refresh_token);
    const resRefresh = await fetch(`${NVOIP_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Authorization': BASIC_AUTH, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyRefresh.toString(),
    });
    if (resRefresh.ok) {
      const d = await resRefresh.json();
      await base44.asServiceRole.entities[entityName].update(config.id, {
        access_token: d.access_token,
        refresh_token: d.refresh_token || config.refresh_token,
        token_expires_at: new Date(Date.now() + (d.expires_in || 3600) * 1000).toISOString(),
      });
      return d.access_token;
    }
  }

  if (!config.numbersip || !config.user_token) {
    throw new Error('NumberSIP e User Token são obrigatórios para autenticar na NVOIP');
  }

  const bodyPwd = new URLSearchParams();
  bodyPwd.append('grant_type', 'password');
  bodyPwd.append('username', config.numbersip);
  bodyPwd.append('password', config.user_token);

  const res = await fetch(`${NVOIP_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Authorization': BASIC_AUTH, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: bodyPwd.toString(),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const errMsg = errData.error_description || errData.message || errData.error || JSON.stringify(errData);
    throw new Error(`Falha ao autenticar na NVOIP: ${errMsg}. Verifique o NumberSIP e User Token.`);
  }

  const data = await res.json();
  await base44.asServiceRole.entities[entityName].update(config.id, {
    access_token: data.access_token,
    refresh_token: data.refresh_token || null,
    token_expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
    ativo: true,
  });
  return data.access_token;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    // Testar conexão: não precisa de empresa salva
    if (action === 'testarConexao') {
      const { numbersip, user_token } = body;
      if (!numbersip || !user_token) {
        return Response.json({ success: false, error: 'NumberSIP e User Token são obrigatórios' });
      }
      const bodyParams = new URLSearchParams();
      bodyParams.append('username', numbersip);
      bodyParams.append('password', user_token);
      bodyParams.append('grant_type', 'password');

      const res = await fetch(`${NVOIP_BASE}/oauth/token`, {
        method: 'POST',
        headers: { 'Authorization': BASIC_AUTH, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams.toString(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = data.error_description || data.message || data.error || `HTTP ${res.status}`;
        return Response.json({ success: false, error: `Credenciais inválidas: ${errMsg}` });
      }
      return Response.json({ success: true, message: 'Conexão NVOIP estabelecida com sucesso!' });
    }

    const { empresaId, colaboradorId } = await getEmpresaEColab(base44, user);

    // Salvar configuração DA EMPRESA (admin)
    if (action === 'salvarConfig') {
      const { numbersip, user_token, napikey, sip_password, numero_did, numero_chip } = body;
      const configs = await base44.asServiceRole.entities.ConfiguracaoNvoip.filter({ empresa_id: empresaId });

      const configData = {
        empresa_id: empresaId,
        numbersip,
        sip_password: sip_password || null,
        numero_did: numero_did || null,
        numero_chip: numero_chip || null,
        user_token,
        napikey: napikey || null,
        ativo: false,
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
      };

      if (configs.length > 0) {
        await base44.asServiceRole.entities.ConfiguracaoNvoip.update(configs[0].id, configData);
      } else {
        await base44.asServiceRole.entities.ConfiguracaoNvoip.create(configData);
      }
      return Response.json({ success: true });
    }

    // Salvar configuração PESSOAL do usuário
    if (action === 'salvarConfigUsuario') {
      const { numbersip, user_token, napikey, sip_password, numero_did, numero_chip, colaborador_nome } = body;

      if (!colaboradorId) {
        return Response.json({ success: false, error: 'Colaborador não encontrado para este usuário' });
      }

      const existentes = await base44.asServiceRole.entities.ConfiguracaoNvoipUsuario.filter({
        colaborador_id: colaboradorId,
      });

      const configData = {
        empresa_id: empresaId,
        colaborador_id: colaboradorId,
        user_id: user.id,
        colaborador_nome: colaborador_nome || user.full_name || '',
        numbersip,
        sip_password: sip_password || null,
        numero_did: numero_did || null,
        numero_chip: numero_chip || null,
        user_token,
        napikey: napikey || null,
        ativo: true,
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
      };

      if (existentes.length > 0) {
        await base44.asServiceRole.entities.ConfiguracaoNvoipUsuario.update(existentes[0].id, configData);
      } else {
        await base44.asServiceRole.entities.ConfiguracaoNvoipUsuario.create(configData);
      }
      return Response.json({ success: true });
    }

    // Buscar config do usuário para exibir no modal
    if (action === 'buscarConfigUsuario') {
      // 1. Tenta config pessoal do usuário
      if (colaboradorId) {
        const existentes = await base44.asServiceRole.entities.ConfiguracaoNvoipUsuario.filter({
          colaborador_id: colaboradorId,
        });
        if (existentes.length > 0 && existentes[0].numbersip && existentes[0].user_token) {
          return Response.json({ config: existentes[0], tipo: 'usuario' });
        }
      }
      // 2. Fallback: config da empresa
      const empConfigs = await base44.asServiceRole.entities.ConfiguracaoNvoip.filter({ empresa_id: empresaId });
      if (empConfigs.length > 0 && empConfigs[0].numbersip) {
        return Response.json({ config: empConfigs[0], tipo: 'empresa' });
      }
      return Response.json({ config: null });
    }

    // Para todas as outras ações, pega a config com prioridade para o usuário
    let config, tipo;
    try {
      const result = await getConfigParaUsuario(base44, user, empresaId, colaboradorId);
      config = result.config;
      tipo = result.tipo;
    } catch (err) {
      return Response.json({ 
        error: err.message, 
        _error_type: 'sem_configuracao' 
      }, { status: 200 });
    }
    const token = await getValidToken(base44, config, tipo === 'usuario');
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    if (action === 'saldo') {
      const res = await fetch(`${NVOIP_BASE}/balance`, { headers });
      const data = await res.json();
      return Response.json(data);
    }

    if (action === 'realizarChamada') {
      const { called } = body;

      // OBRIGATÓRIO: ramal SIP como caller (origem)
      const caller = config.numbersip;
      if (!caller) {
        return Response.json({
          error: 'Ramal SIP não configurado. Acesse Call Center → Meu Ramal para configurar.',
          _error_type: 'ramal_nao_configurado',
        }, { status: 200 });
      }

      // Valida número destino
      let calledFormatado = (called || '').replace(/\D/g, '');
      if (!calledFormatado || calledFormatado.length < 8) {
        return Response.json({ error: 'Número de destino inválido. Informe DDD + número.', _error_type: 'numero_invalido' }, { status: 200 });
      }
      if (!calledFormatado.startsWith('55') && calledFormatado.length <= 11) {
        calledFormatado = '55' + calledFormatado;
      }

      // Chamada: caller = ramal SIP, callerId = DID (opcional)
      console.log(`[NVOIP] realizarChamada:`);
      console.log(`  caller (ramal SIP)   = ${caller}`);
      console.log(`  callerId (DID)       = ${config.numero_did || 'não configurado'}`);
      console.log(`  called (cliente)     = ${calledFormatado}`);

      const callBody = {
        caller,
        called: calledFormatado
      };
      if (config.numero_did) {
        callBody.callerId = config.numero_did.replace(/\D/g, '');
      }
      console.log(`[NVOIP] POST /v2/calls/ body:`, JSON.stringify(callBody));

      const res = await fetch(`${NVOIP_BASE}/calls/`, {
        method: 'POST',
        headers,
        body: JSON.stringify(callBody),
      });
      const data = await res.json();
      console.log(`[NVOIP] resposta chamada: ${res.status}`, JSON.stringify(data));

      if (!res.ok) {
        const errMsg = data.message || data.error || `HTTP ${res.status}`;
        return Response.json({
          error: `Falha ao iniciar chamada: ${errMsg}`,
          _error_type: 'chamada_falhou',
          _debug: data,
          _tipo_config: tipo,
          _caller: caller,
        }, { status: 200 });
      }

      return Response.json({ ...data, _tipo_config: tipo, _caller: caller, _called: calledFormatado, _callerId: config.numero_did });
    }

    if (action === 'consultarChamada') {
      const { callId } = body;
      const res = await fetch(`${NVOIP_BASE}/calls?callId=${callId}`, { headers });
      const data = await res.json();
      return Response.json(data);
    }

    if (action === 'encerrarChamada') {
      const { callId } = body;
      const res = await fetch(`${NVOIP_BASE}/endcall?callId=${callId}`, { headers });
      const data = await res.json();
      return Response.json(data);
    }

    if (action === 'historicoChamadas') {
      const { type, date } = body;
      let url = `${NVOIP_BASE}/calls/history`;
      const params = [];
      if (type) params.push(`type=${type}`);
      if (date) params.push(`date=${date}`);
      if (params.length > 0) url += '?' + params.join('&');
      const res = await fetch(url, { headers });
      const data = await res.json();
      return Response.json({ calls: Array.isArray(data) ? data : [data] });
    }

    if (action === 'enviarSMS') {
      const { numberPhone, message, flashSms } = body;
      const res = await fetch(`${NVOIP_BASE}/sms`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ numberPhone, message, flashSms: flashSms || false }),
      });
      const data = await res.json();
      return Response.json(data);
    }

    if (action === 'torpedoVoz') {
      const { caller, called, mensagem } = body;
      const res = await fetch(`${NVOIP_BASE}/torpedo/voice`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          caller: caller || config.numbersip,
          called,
          audios: [{ audio: mensagem, positionAudio: 1 }],
          dtmfs: [],
        }),
      });
      const data = await res.json();
      return Response.json(data);
    }

    if (action === 'listarUsuarios') {
      const res = await fetch(`${NVOIP_BASE}/list/users`, { headers });
      const data = await res.json();
      return Response.json({ users: Array.isArray(data) ? data : [data] });
    }

    if (action === 'debugUpdateSip') {
      const { numbersip: nsip, callForward: cf, sip_password: sp } = body;
      const sipNum = nsip || config.numbersip;
      const senha = sp || config.sip_password;

      const resLista = await fetch(`${NVOIP_BASE}/list/users`, { headers });
      const listaData = await resLista.json().catch(() => []);
      const sipEnc = Array.isArray(listaData) ? listaData.find(u => String(u.numbersip) === String(sipNum)) : null;

      const basePayload = {
        name: sipEnc?.name || '',
        email: sipEnc?.email || '',
        webphone: true,
        office: 0, department: 0, subDepartment: 0,
        login2fa: false, chat: false, voice: true, permissions: [],
        callForward: cf || '558132998470',
      };

      // Testa 1: com senha real
      const p1 = { ...basePayload, password: senha };
      const r1 = await fetch(`${NVOIP_BASE}/update/users?numbersip=${sipNum}`, { method: 'PUT', headers, body: JSON.stringify(p1) });
      const d1 = await r1.json().catch(() => ({}));

      // Testa 2: sem campo password
      const r2 = await fetch(`${NVOIP_BASE}/update/users?numbersip=${sipNum}`, { method: 'PUT', headers, body: JSON.stringify(basePayload) });
      const d2 = await r2.json().catch(() => ({}));

      // Testa 3: com password mascarado *****
      const p3 = { ...basePayload, password: '*****' };
      const r3 = await fetch(`${NVOIP_BASE}/update/users?numbersip=${sipNum}`, { method: 'PUT', headers, body: JSON.stringify(p3) });
      const d3 = await r3.json().catch(() => ({}));

      // Testa 4: apenas callForward
      const p4 = { callForward: cf || '558132998470' };
      const r4 = await fetch(`${NVOIP_BASE}/update/users?numbersip=${sipNum}`, { method: 'PUT', headers, body: JSON.stringify(p4) });
      const d4 = await r4.json().catch(() => ({}));

      return Response.json({
        sip_encontrado: sipEnc,
        resultados: {
          'com senha real': { status: r1.status, body: d1 },
          'sem campo password': { status: r2.status, body: d2 },
          'com password *****': { status: r3.status, body: d3 },
          'apenas callForward': { status: r4.status, body: d4 },
        }
      });
    }

    if (action === 'buscarUsuarioSip') {
      const { numbersip: nsip } = body;
      const res = await fetch(`${NVOIP_BASE}/get/users?numbersip=${nsip || config.numbersip}`, { headers });
      const data = await res.json();
      return Response.json(data);
    }

    if (action === 'atualizarEncaminhamento') {
      const { numbersip: nsip, callForward } = body;
      const sipNum = nsip || config.numbersip;

      // Buscar via /list/users e filtrar
      const resLista = await fetch(`${NVOIP_BASE}/list/users`, { headers });
      const listaData = await resLista.json().catch(() => []);
      const sipEncontrado = Array.isArray(listaData) ? listaData.find(u => String(u.numbersip) === String(sipNum)) : null;

      if (!sipEncontrado) {
        return Response.json({
          error: `SIP ${sipNum} não encontrado na conta NVOIP`,
          _sips_disponiveis: Array.isArray(listaData) ? listaData.map(u => u.numbersip) : [],
        });
      }

      const putUrl = `${NVOIP_BASE}/update/users?numbersip=${sipNum}`;
      const payload = {
        name: sipEncontrado.name,
        password: config.sip_password,
        email: sipEncontrado.email || '',
        webphone: sipEncontrado.webphone !== undefined ? sipEncontrado.webphone : true,
        office: sipEncontrado.office || 0,
        department: sipEncontrado.department || 0,
        subDepartment: sipEncontrado.subDepartment || 0,
        login2fa: false,
        chat: false,
        voice: true,
        permissions: [],
        callForward,
      };
      for (const key of Object.keys(sipEncontrado)) {
        if (!(key in payload) && key !== 'status') payload[key] = sipEncontrado[key];
      }

      console.log(`[NVOIP] atualizarEncaminhamento PUT: ${putUrl}`);
      const res = await fetch(putUrl, { method: 'PUT', headers, body: JSON.stringify(payload) });
      const data = await res.json();
      console.log(`[NVOIP] PUT resposta HTTP ${res.status}:`, JSON.stringify(data));
      return Response.json({ ...data, _endpoint: putUrl, _status: res.status });
    }

    if (action === 'listarNumeros') {
      const res = await fetch(`${NVOIP_BASE}/list/dids`, { headers });
      const data = await res.json();
      return Response.json({ numbers: Array.isArray(data) ? data : (data ? [data] : []) });
    }

    return Response.json({ error: 'Ação desconhecida' }, { status: 400 });
  } catch (error) {
    const msg = error.message || 'Erro interno';
    if (msg.includes('autenticar') || msg.includes('token') || msg.includes('Token')) {
      return Response.json({ error: `Falha de autenticação NVOIP: ${msg}` }, { status: 200 });
    }
    if (msg.includes('Empresa') || msg.includes('configuração') || msg.includes('ramal')) {
      return Response.json({ error: msg }, { status: 200 });
    }
    return Response.json({ error: msg }, { status: 500 });
  }
});