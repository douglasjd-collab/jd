import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const NVOIP_BASE = 'https://api.nvoip.com.br/v2';
const BASIC_AUTH = 'Basic TnZvaXBBcGlWMjpUblp2YVhCQmNHbFdNakl3TWpFPQ==';

async function getNvoipConfig(base44, empresaId) {
  const configs = await base44.asServiceRole.entities.ConfiguracaoNvoip.filter({ empresa_id: empresaId });
  if (!configs || configs.length === 0) throw new Error('Configuração NVOIP não encontrada para esta empresa');
  return configs[0];
}

async function getValidToken(base44, config) {
  // Verifica se o token ainda é válido
  if (config.access_token && config.token_expires_at) {
    const expiresAt = new Date(config.token_expires_at);
    if (expiresAt > new Date(Date.now() + 60000)) {
      return config.access_token;
    }
  }

  // Gera novo token
  const body = new URLSearchParams();
  if (config.refresh_token) {
    body.append('grant_type', 'refresh_token');
    body.append('refresh_token', config.refresh_token);
  } else {
    body.append('username', config.numbersip);
    body.append('password', config.user_token);
    body.append('grant_type', 'password');
  }

  const res = await fetch(`${NVOIP_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      'Authorization': BASIC_AUTH,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    // Se refresh falhou, tenta com credenciais
    if (config.refresh_token) {
      const body2 = new URLSearchParams();
      body2.append('username', config.numbersip);
      body2.append('password', config.user_token);
      body2.append('grant_type', 'password');
      const res2 = await fetch(`${NVOIP_BASE}/oauth/token`, {
        method: 'POST',
        headers: { 'Authorization': BASIC_AUTH, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body2.toString(),
      });
      if (!res2.ok) throw new Error('Falha ao autenticar na NVOIP');
      const data2 = await res2.json();
      await base44.asServiceRole.entities.ConfiguracaoNvoip.update(config.id, {
        access_token: data2.access_token,
        refresh_token: data2.refresh_token,
        token_expires_at: new Date(Date.now() + data2.expires_in * 1000).toISOString(),
      });
      return data2.access_token;
    }
    throw new Error('Falha ao autenticar na NVOIP');
  }

  const data = await res.json();
  await base44.asServiceRole.entities.ConfiguracaoNvoip.update(config.id, {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    ativo: true,
  });
  return data.access_token;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const empresaId = user.empresa_id;
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    // Ação especial: salvar configuração
    if (action === 'salvarConfig') {
      const { numbersip, user_token, napikey } = body;
      const configs = await base44.asServiceRole.entities.ConfiguracaoNvoip.filter({ empresa_id: empresaId });

      const configData = { empresa_id: empresaId, numbersip, user_token, napikey, ativo: false, access_token: null, refresh_token: null, token_expires_at: null };

      if (configs.length > 0) {
        await base44.asServiceRole.entities.ConfiguracaoNvoip.update(configs[0].id, configData);
      } else {
        await base44.asServiceRole.entities.ConfiguracaoNvoip.create(configData);
      }
      return Response.json({ success: true });
    }

    // Ação: testar conexão
    if (action === 'testarConexao') {
      const { numbersip, user_token } = body;
      const bodyParams = new URLSearchParams();
      bodyParams.append('username', numbersip);
      bodyParams.append('password', user_token);
      bodyParams.append('grant_type', 'password');

      const res = await fetch(`${NVOIP_BASE}/oauth/token`, {
        method: 'POST',
        headers: { 'Authorization': BASIC_AUTH, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams.toString(),
      });
      const data = await res.json();
      if (!res.ok) return Response.json({ success: false, error: data });
      return Response.json({ success: true, access_token: data.access_token });
    }

    // Para as demais ações, precisamos da config
    const config = await getNvoipConfig(base44, empresaId);
    const token = await getValidToken(base44, config);
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    // Consultar saldo
    if (action === 'saldo') {
      const res = await fetch(`${NVOIP_BASE}/balance`, { headers });
      const data = await res.json();
      return Response.json(data);
    }

    // Realizar chamada
    if (action === 'realizarChamada') {
      const { caller, called } = body;
      const res = await fetch(`${NVOIP_BASE}/calls/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ caller, called }),
      });
      const data = await res.json();
      return Response.json(data);
    }

    // Consultar chamada
    if (action === 'consultarChamada') {
      const { callId } = body;
      const res = await fetch(`${NVOIP_BASE}/calls?callId=${callId}`, { headers });
      const data = await res.json();
      return Response.json(data);
    }

    // Encerrar chamada
    if (action === 'encerrarChamada') {
      const { callId } = body;
      const res = await fetch(`${NVOIP_BASE}/endcall?callId=${callId}`, { headers });
      const data = await res.json();
      return Response.json(data);
    }

    // Histórico de chamadas
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

    // Enviar SMS
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

    // Torpedo de voz
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

    // Listar usuários
    if (action === 'listarUsuarios') {
      const res = await fetch(`${NVOIP_BASE}/list/users`, { headers });
      const data = await res.json();
      return Response.json({ users: Array.isArray(data) ? data : [data] });
    }

    return Response.json({ error: 'Ação desconhecida' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});