import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    let empresaId = body.empresa_id || user.empresa_id;

    if (!empresaId && user.perfil === 'super_admin') {
      const todasEmps = await base44.asServiceRole.entities.Empresa.filter({}, '-created_date', 50).catch(() => []);
      const empComEvo = todasEmps.find(e => e.evolution_url && e.evolution_api_key && e.evolution_instance_name);
      if (empComEvo) empresaId = empComEvo.id;
    }

    if (!empresaId) return Response.json({ error: 'empresa_id required' }, { status: 400 });

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId }).catch(() => []);
    const emp = empresas?.[0];
    if (!emp?.evolution_url || !emp?.evolution_api_key || !emp?.evolution_instance_name) {
      return Response.json({ error: 'Evolution não configurada' }, { status: 400 });
    }

    const evolutionUrl = emp.evolution_url.replace(/\/$/, '');
    const evolutionKey = emp.evolution_api_key;
    const instanceName = emp.evolution_instance_name;

    console.log(`📱 Gerando QR Code para ${instanceName}...`);

    // Reiniciar instância para gerar novo QR Code
    const restartRes = await fetch(`${evolutionUrl}/instance/restart/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey }
    });

    if (!restartRes.ok) {
      return Response.json({ erro: 'Erro ao reiniciar instância' }, { status: 400 });
    }

    console.log(`⏳ Aguardando QR Code...`);
    await new Promise(r => setTimeout(r, 3000));

    // Buscar QR Code
    const infoRes = await fetch(`${evolutionUrl}/instance/info/${instanceName}`, {
      headers: { 'apikey': evolutionKey }
    });

    if (!infoRes.ok) {
      return Response.json({ erro: 'Erro ao buscar QR Code' }, { status: 400 });
    }

    const infoData = await infoRes.json();
    const qrcode = infoData?.qrcode;

    if (!qrcode) {
      return Response.json({
        erro: 'QR Code não gerado',
        status: infoData?.instance?.status || 'desconhecido'
      }, { status: 400 });
    }

    console.log(`✅ QR Code gerado com sucesso`);

    return Response.json({
      ok: true,
      qrcode: qrcode,
      mensagem: 'Escaneie com WhatsApp em Configurações > Aparelhos conectados'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});