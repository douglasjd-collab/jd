import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id || '699696c2c9f5bffc2e67402b';
    const numeroDestino = body.numero_destino || '558781404486';

    // Buscar empresa
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId });
    if (!empresas || empresas.length === 0) {
      return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    const empresa = empresas[0];
    const evolutionUrl = (empresa.evolution_url || '').replace(/\/$/, '');
    const apiKey = empresa.evolution_api_key || '';
    const instanceName = empresa.evolution_instance_name || '';

    console.log(`🧪 Teste de Envio`);
    console.log(`📱 Número destino: ${numeroDestino}`);
    console.log(`🔗 Evolution URL: ${evolutionUrl}`);
    console.log(`📍 Instance: ${instanceName}`);

    // 1. Verificar status da instância
    const statusResp = await fetch(`${evolutionUrl}/instance/connectionState/${instanceName}`, {
      headers: { 'apikey': apiKey }
    });
    const status = await statusResp.json();
    console.log(`📡 Status: ${status.instance?.state}`);

    // 2. Tentar enviar mensagem de teste
    const payload = {
      number: numeroDestino,
      text: "🧪 Teste de mensagem - " + new Date().toISOString()
    };
    
    console.log(`📤 Enviando payload:`, JSON.stringify(payload));

    const sendResp = await fetch(`${evolutionUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      body: JSON.stringify(payload)
    });

    const sendData = await sendResp.json();
    console.log(`📨 Status HTTP: ${sendResp.status}`);
    console.log(`📨 Response:`, JSON.stringify(sendData));

    return Response.json({
      instancia: instanceName,
      numero_destino: numeroDestino,
      status_conexao: status.instance?.state,
      envio_status: sendResp.status,
      envio_response: sendData,
      sucesso: sendResp.status === 200 && !sendData.error
    });

  } catch (e) {
    console.error(`❌ Erro: ${e.message}`);
    return Response.json({ error: e.message }, { status: 500 });
  }
});