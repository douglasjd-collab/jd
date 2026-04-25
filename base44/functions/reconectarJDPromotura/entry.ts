import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const EVOLUTION_URL = 'https://jdpromotora.0ntuaf.easypanel.host';
    const API_KEY = '72F05FA223C5-437A-B07B-31CEE2921192';
    const INSTANCE = 'JDPROMOTORA';

    // Tentar gerar QR Code para reconectar
    const qrRes = await fetch(`${EVOLUTION_URL}/instance/connect/${INSTANCE}`, {
      method: 'GET',
      headers: { 'apikey': API_KEY }
    });

    const qrData = await qrRes.json().catch(() => ({}));

    return Response.json({
      status: qrRes.status,
      data: qrData
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});