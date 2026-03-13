import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Função de diagnóstico — captura TUDO que chega sem nenhum filtro
Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();
  
  const headersObj = {};
  req.headers.forEach((v, k) => { headersObj[k] = v; });
  
  const rawBody = await req.text();
  
  console.log('=== DIAGNÓSTICO RAW WEBHOOK ===');
  console.log('Timestamp:', timestamp);
  console.log('Método:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', JSON.stringify(headersObj, null, 2));
  console.log('Body:', rawBody.substring(0, 2000));
  console.log('Body tamanho:', rawBody.length);
  
  // Salvar no banco para análise posterior
  try {
    const base44 = createClientFromRequest(req);
    await base44.asServiceRole.entities.LogRecebimentoWebhook.create({
      empresa_id: '699696c2c9f5bffc2e67402b',
      tipo_evento: 'mensagem_recebida',
      telefone: 'DIAGNOSTICO_RAW',
      conteudo: `HEADERS: ${JSON.stringify(headersObj).substring(0, 200)} | BODY: ${rawBody.substring(0, 300)}`,
      status: 'sucesso',
      instancia: 'DIAGNOSTICO',
      timestamp
    });
  } catch (e) {
    console.error('Erro ao salvar log:', e.message);
  }
  
  return Response.json({ 
    ok: true, 
    method: req.method,
    body_length: rawBody.length,
    headers: headersObj
  });
});