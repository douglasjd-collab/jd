Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();
  
  console.log('\n' + '='.repeat(100));
  console.log(`🔍 DEBUG WEBHOOK - ${timestamp}`);
  console.log('='.repeat(100));
  
  // Log básico
  console.log(`📍 URL: ${req.url}`);
  console.log(`📍 Método: ${req.method}`);
  console.log(`📍 Headers:`, Object.fromEntries(req.headers.entries()));
  
  // Ler body
  let body = '';
  try {
    body = await req.text();
    console.log(`📥 Body recebido (${body.length} bytes):`);
    console.log(body);
    
    // Tentar parsear JSON
    const json = JSON.parse(body);
    console.log(`✅ JSON válido! Estrutura:`);
    console.log(JSON.stringify(json, null, 2));
  } catch (e) {
    console.log(`❌ Erro ao parsear JSON:`, e.message);
  }
  
  console.log('='.repeat(100) + '\n');
  
  // Retornar sucesso
  return Response.json({
    success: true,
    timestamp,
    received_bytes: body.length,
    message: 'Webhook recebido - dados logados no console'
  });
});