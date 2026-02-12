import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  console.log('='.repeat(100));
  console.log('🧪 TESTE DE WEBHOOK - Função chamada!');
  console.log('='.repeat(100));
  console.log('⏰ Timestamp:', new Date().toISOString());
  console.log('🔗 URL completa:', req.url);
  console.log('📝 Método:', req.method);
  console.log('📋 Headers:', Object.fromEntries(req.headers));
  
  if (req.method === 'POST') {
    const bodyText = await req.text();
    console.log('📥 Body recebido:', bodyText);
    console.log('📊 Tamanho:', bodyText.length, 'bytes');
  }

  console.log('='.repeat(100));
  
  return Response.json({
    success: true,
    message: '✅ WEBHOOK RECEBIDO COM SUCESSO!',
    timestamp: new Date().toISOString(),
    url_recebida: req.url,
    metodo: req.method
  });
});