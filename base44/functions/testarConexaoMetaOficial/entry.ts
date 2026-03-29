import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { phone_number_id, access_token } = await req.json();

  if (!phone_number_id || !access_token) {
    return Response.json({ success: false, error: 'phone_number_id e access_token são obrigatórios' });
  }

  // Testar chamada à API da Meta para buscar info do número
  const resp = await fetch(`https://graph.facebook.com/v19.0/${phone_number_id}?fields=display_phone_number,verified_name,quality_rating,account_mode`, {
    headers: { Authorization: `Bearer ${access_token}` }
  });

  const data = await resp.json();

  if (data.error) {
    return Response.json({ success: false, error: data.error.message, code: data.error.code });
  }

  return Response.json({
    success: true,
    phone_number: data.display_phone_number,
    verified_name: data.verified_name,
    quality_rating: data.quality_rating,
    account_mode: data.account_mode,
  });
});