import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    let empresaId = body.empresa_id || user.empresa_id;

    if (!empresaId) {
      const todasEmps = await base44.asServiceRole.entities.Empresa.filter({}, '-created_date', 50).catch(() => []);
      const empComEvo = todasEmps.find(e => e.evolution_url && e.evolution_api_key && e.evolution_instance_name);
      if (empComEvo) empresaId = empComEvo.id;
    }

    if (!empresaId) return Response.json({ error: 'empresa_id required' }, { status: 400 });

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId }).catch(() => []);
    const emp = empresas?.[0];
    if (!emp?.evolution_url || !emp?.evolution_api_key || !emp?.evolution_instance_name) {
      return Response.json({ error: 'Evolution não configurada para esta empresa' }, { status: 400 });
    }

    const evolutionUrl = emp.evolution_url.replace(/\/$/, '');
    const evolutionKey = emp.evolution_api_key;
    const instanceName = emp.evolution_instance_name;

    console.log(`📱 Buscando QR Code para ${instanceName} em ${evolutionUrl}...`);

    // Tentar buscar QR Code diretamente via /instance/connect
    const connectRes = await fetch(`${evolutionUrl}/instance/connect/${instanceName}`, {
      method: 'GET',
      headers: { 'apikey': evolutionKey }
    });

    console.log(`Connect status: ${connectRes.status}`);
    const connectData = await connectRes.json().catch(() => ({}));
    console.log(`Connect data: ${JSON.stringify(connectData)}`);

    // O QR pode vir em vários formatos dependendo da versão da Evolution API
    const qrBase64 = connectData?.base64 || connectData?.qrcode?.base64 || connectData?.qr?.base64 || connectData?.data?.base64;
    const qrCode = connectData?.code || connectData?.qrcode?.code || connectData?.qr?.code;

    if (qrBase64 || qrCode) {
      return Response.json({
        ok: true,
        base64: qrBase64,
        code: qrCode,
        mensagem: 'Escaneie com WhatsApp em Configurações > Aparelhos conectados'
      });
    }

    // Se não retornou QR, pode ser que a instância já esteja conectada
    const stateRes = await fetch(`${evolutionUrl}/instance/connectionState/${instanceName}`, {
      headers: { 'apikey': evolutionKey }
    });
    const stateData = await stateRes.json().catch(() => ({}));
    console.log(`State data: ${JSON.stringify(stateData)}`);

    const state = stateData?.instance?.state || stateData?.state || '';
    if (state === 'open') {
      return Response.json({
        ok: false,
        erro: 'Instância já está conectada ao WhatsApp. Desconecte primeiro para gerar um novo QR Code.',
        state: 'open'
      });
    }

    return Response.json({
      ok: false,
      erro: 'QR Code não disponível. Estado atual: ' + (state || 'desconhecido'),
      state,
      connectData
    });

  } catch (error) {
    console.error('Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});