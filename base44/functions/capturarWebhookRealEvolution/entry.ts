// Função para capturar o body RAW exato da Evolution API com webhookBase64=true
// Salva no banco para análise

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();
  
  if (req.method === 'GET') {
    return new Response('OK', { status: 200 });
  }

  const rawBody = await req.text();
  const headersObj = {};
  req.headers.forEach((v, k) => { headersObj[k] = v; });

  console.log('=== CAPTURA RAW EVOLUTION ===');
  console.log('Timestamp:', timestamp);
  console.log('Content-Type:', headersObj['content-type']);
  console.log('Body length:', rawBody.length);
  console.log('Body primeiros 500 chars:', rawBody.substring(0, 500));
  console.log('Body COMPLETO (até 3000):', rawBody.substring(0, 3000));

  // Tentar parsear de várias formas
  let parseAttempts = {};
  
  // 1) JSON direto
  try {
    const parsed = JSON.parse(rawBody);
    parseAttempts.json_direto = { ok: true, keys: Object.keys(parsed), event: parsed.event, instance: parsed.instance };
    // Se tem data como string
    if (typeof parsed.data === 'string') {
      parseAttempts.json_direto.data_type = 'string';
      parseAttempts.json_direto.data_preview = parsed.data.substring(0, 100);
      // Tentar base64
      try {
        const decoded = atob(parsed.data.trim());
        const bytes = new Uint8Array(decoded.split('').map(c => c.charCodeAt(0)));
        const decodedObj = JSON.parse(new TextDecoder('utf-8').decode(bytes));
        parseAttempts.json_direto.data_decoded = { ok: true, keys: Object.keys(decodedObj) };
      } catch (e) {
        parseAttempts.json_direto.data_decoded = { ok: false, err: e.message };
      }
    } else if (typeof parsed.data === 'object') {
      parseAttempts.json_direto.data_type = 'object';
      parseAttempts.json_direto.data_keys = Object.keys(parsed.data || {});
    }
  } catch (e) {
    parseAttempts.json_direto = { ok: false, err: e.message };
  }

  // 2) Body como base64 puro
  try {
    const decoded = atob(rawBody.trim());
    const bytes = new Uint8Array(decoded.split('').map(c => c.charCodeAt(0)));
    const obj = JSON.parse(new TextDecoder('utf-8').decode(bytes));
    parseAttempts.body_base64 = { ok: true, keys: Object.keys(obj) };
  } catch (e) {
    parseAttempts.body_base64 = { ok: false, err: e.message };
  }

  console.log('Parse attempts:', JSON.stringify(parseAttempts, null, 2));

  // Salvar no banco
  try {
    const base44 = createClientFromRequest(req);
    await base44.asServiceRole.entities.LogRecebimentoWebhook.create({
      empresa_id: '699696c2c9f5bffc2e67402b',
      tipo_evento: 'mensagem_recebida',
      telefone: 'CAPTURA_RAW_REAL',
      conteudo: `BODY(${rawBody.length}): ${rawBody.substring(0, 500)}`,
      status: 'sucesso',
      mensagem_erro: JSON.stringify(parseAttempts).substring(0, 500),
      instancia: 'CAPTURA_DIAGNOSTICO',
      timestamp
    });
  } catch (e) {
    console.error('Erro log:', e.message);
  }

  return Response.json({ 
    ok: true,
    body_length: rawBody.length,
    parse_attempts: parseAttempts
  });
});