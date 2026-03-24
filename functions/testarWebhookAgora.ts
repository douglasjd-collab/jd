import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Função simples para aceitar qualquer coisa e logar
Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();
  
  console.log('\n\n');
  console.log('🚀🚀🚀 WEBHOOK DE DIAGNÓSTICO CHAMADO - ' + timestamp);
  console.log('URL:', req.url);
  console.log('Método:', req.method);
  
  const headers = {};
  req.headers.forEach((v, k) => { headers[k] = v; });
  console.log('Headers:', JSON.stringify(headers, null, 2));
  
  let body = '';
  try {
    body = await req.text();
    console.log('Body (length):', body.length);
    console.log('Body:', body.substring(0, 2000));
  } catch(e) {
    console.log('Erro ao ler body:', e.message);
  }

  // Salvar no banco para consultar depois
  try {
    const base44 = createClientFromRequest(req);
    await base44.asServiceRole.entities.LogRecebimentoWebhook.create({
      empresa_id: '699696c2c9f5bffc2e67402b',
      tipo_evento: 'mensagem_recebida',
      telefone: 'DIAGNOSTICO',
      conteudo: body.substring(0, 500),
      status: 'sucesso',
      mensagem_erro: `URL: ${req.url} | Método: ${req.method}`,
      instancia: 'DIAGNOSTICO',
      timestamp: new Date().toISOString()
    });
  } catch(e) {
    console.log('Erro ao salvar log:', e.message);
  }

  return Response.json({ 
    received: true, 
    timestamp,
    method: req.method,
    body_length: body.length
  });
});

console.log('✅ Webhook de diagnóstico pronto');