import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const NVOIP_BASE = 'https://api.nvoip.com.br/v2';
// Basic auth para o endpoint OAuth2 da NVOIP API v2
// Credenciais de aplicação: NvoipApiV2 / TnZvaXBBcGlWMjpUblp2YVhCQmNHbFdNakl3TWpFPQ==
const BASIC_AUTH = 'Basic TnZvaXBBcGlWMjpUblp2YVhCQmNHbFdNakl3TWpFPQ==';

async function getEmpresaId(base44, user) {
  // Tenta pegar empresa_id do user (caso já venha populado)
  if (user.empresa_id) return user.empresa_id;

  // Busca pelo colaborador vinculado ao user
  const colabs = await base44.asServiceRole.entities.Colaborador.filter({ user_id: user.id });
  if (colabs && colabs.length > 0) {
    const colab = colabs.find(c => c.empresa_id && c.status === 'ativo') || colabs[0];
    if (colab && colab.empresa_id) return colab.empresa_id;
  }

  throw new Error('Empresa não encontrada para este usuário');
}

async function getNvoipConfig(base44, empresaId) {
  const configs = await base44.asServiceRole.entities.ConfiguracaoNvoip.filter({ empresa_id: empresaId });
  if (!configs || configs.length === 0) throw new Error('Configuração NVOIP não encontrada para esta empresa');
  return configs[0];
}

async function getValidToken(base44, config) {
  // Token ainda válido (com 60s de margem)
  if (config.access_token && config.token_expires_at) {
    const expiresAt = new Date(config.token_expires_at);
    if (expiresAt > new Date(Date.now() + 60000)) {
      return config.access_token;
    }
  }

  // Tenta usar refresh_token primeiro
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
      await base44.asServiceRole.entities.ConfiguracaoNvoip.update(config.id, {
        access_token: d.access_token,
        refresh_token: d.refresh_token || config.refresh_token,
        token_expires_at: new Date(Date.now() + (d.expires_in || 3600) * 1000).toISOString(),
        ativo: true,
      });
      return d.access_token;
    }
  }

  // Autentica com user_token (password grant)
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
  await base44.asServiceRole.entities.ConfiguracaoNvoip.update(config.id, {
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

    // Testar conexão não precisa de empresa salva
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

    // Buscar empresa_id do colaborador
    const empresaId = await getEmpresaId(base44, user);

    // Salvar configuração
    if (action === 'salvarConfig') {
      const { numbersip, user_token, napikey, sip_password, numero_did } = body;
      const configs = await base44.asServiceRole.entities.ConfiguracaoNvoip.filter({ empresa_id: empresaId });

      const configData = {
        empresa_id: empresaId,
        numbersip,
        sip_password: sip_password || null,
        numero_did: numero_did || null,
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

    const config = await getNvoipConfig(base44, empresaId);
    const token = await getValidToken(base44, config);
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    if (action === 'saldo') {
      const res = await fetch(`${NVOIP_BASE}/balance`, { headers });
      const data = await res.json();
      return Response.json(data);
    }

    if (action === 'realizarChamada') {
      const { called } = body;
      // O caller deve ser o numbersip (ramal SIP) — a NVOIP liga para o ramal primeiro, depois para o destino
      const caller = config.numbersip;

      const res = await fetch(`${NVOIP_BASE}/calls/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ caller, called }),
      });
      const data = await res.json();
      if (!res.ok) {
        return Response.json({ error: data.message || data.error || `HTTP ${res.status}`, _debug: data }, { status: 200 });
      }
      return Response.json(data);
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

    if (action === 'listarNumeros') {
      const res = await fetch(`${NVOIP_BASE}/list/dids`, { headers });
      const data = await res.json();
      return Response.json({ numbers: Array.isArray(data) ? data : (data ? [data] : []) });
    }

    return Response.json({ error: 'Ação desconhecida' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});