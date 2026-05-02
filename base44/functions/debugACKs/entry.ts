import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

Deno.serve(async (req) => {
  console.log(`📥 DEBUG ACK | ${req.method} | ${new Date().toISOString()}`);

  if (req.method !== 'POST') {
    return Response.json({ error: 'Método não suportado' }, { status: 405 });
  }

  const rawBody = await req.text();
  console.log(`📦 Body: ${rawBody}`);

  let parsed = null;
  try {
    parsed = JSON.parse(rawBody);
  } catch (e) {
    console.error('❌ JSON inválido:', e.message);
  }

  if (!parsed) {
    return Response.json({ error: 'Body inválido' }, { status: 400 });
  }

  const event = (parsed.event || parsed.type || '').toLowerCase();
  const data = parsed.data || parsed;

  console.log(`🔔 Event: "${event}"`);
  console.log(`📊 Data type: ${Array.isArray(data) ? 'array' : 'object'}`);
  console.log(`📊 Data: ${JSON.stringify(data)}`);

  if (Array.isArray(data)) {
    console.log(`📊 Array length: ${data.length}`);
    data.forEach((item, idx) => {
      console.log(`  [${idx}]:`, JSON.stringify(item));
    });
  }

  // Registrar no banco para análise
  const base44 = createClientFromRequest(req);
  try {
    await base44.asServiceRole.entities.LogRecebimentoWebhook.create({
      empresa_id: '699696c2c9f5bffc2e67402b',
      tipo_evento: `debug_${event}`,
      telefone: '',
      conteudo: JSON.stringify(data).substring(0, 500),
      status: 'debug',
      mensagem_erro: '',
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error('Erro ao registrar debug:', e.message);
  }

  return Response.json({ success: true, event, received: true });
});