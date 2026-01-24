import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verificar se é admin
    const user = await base44.auth.me();
    if (!user || !['admin', 'super_admin', 'master'].includes(user.perfil)) {
      return Response.json({ error: 'Acesso negado. Apenas administradores.' }, { status: 403 });
    }

    const body = await req.json();
    const { url } = body;
    
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!token) {
      return Response.json({ error: 'TELEGRAM_BOT_TOKEN não configurado' }, { status: 500 });
    }
    
    if (!url) {
      return Response.json({ error: 'Campo url é obrigatório' }, { status: 400 });
    }

    const resp = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const data = await resp.json();
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
});