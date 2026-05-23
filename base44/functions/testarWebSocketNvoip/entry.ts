import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Testa se sip.nvoip.com.br aceita WebSocket upgrade nas portas comuns
    // Para WebSocket SIP, o servidor precisa aceitar o header Upgrade: websocket
    const tests = [];

    const sipHost = 'sip.nvoip.com.br';
    const ports = [443, 8089, 5067, 5065, 8443];

    for (const port of ports) {
      const url = `https://${sipHost}:${port}/`;
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: {
            'Upgrade': 'websocket',
            'Connection': 'Upgrade',
            'Sec-WebSocket-Version': '13',
            'Sec-WebSocket-Key': btoa(String(Math.random()).substring(2, 18)),
            'Sec-WebSocket-Protocol': 'sip',
          },
        });
        clearTimeout(timeout);
        // Status 101 = WebSocket upgrade aceito
        // Status 400/403/426 = servidor HTTP existe mas não aceita WS
        // Status 200 = HTTP normal
        tests.push({ url, status: res.status, statusText: res.statusText, wsUpgrade: res.status === 101 });
      } catch (e) {
        const msg = e.message;
        // connection reset pode significar que a porta existe mas não faz HTTP
        tests.push({ 
          url, 
          error: msg.includes('aborted') ? 'TIMEOUT' : msg.includes('reset') ? 'CONNECTION_RESET (porta existe, não é HTTP)' : msg.split(':')[0]
        });
      }
    }

    // Tenta também com TCP diretamente na porta 5060 (SIP padrão)
    try {
      const conn = await Deno.connect({ hostname: sipHost, port: 5060, transport: 'tcp' });
      tests.push({ url: `tcp://${sipHost}:5060`, connected: true });
      conn.close();
    } catch (e) {
      tests.push({ url: `tcp://${sipHost}:5060`, error: e.message.split(':')[0] });
    }

    // Porta 5061 (SIP TLS)
    try {
      const conn = await Deno.connectTls({ hostname: sipHost, port: 5061 });
      tests.push({ url: `tls://${sipHost}:5061`, connected: true });
      conn.close();
    } catch (e) {
      tests.push({ url: `tls://${sipHost}:5061`, error: e.message.split(':')[0] });
    }

    return Response.json({ host: sipHost, tests });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});