import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    
    const { chat_id, text, parse_mode = "HTML" } = body;

    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!token) {
      return Response.json({ error: 'TELEGRAM_BOT_TOKEN não configurado' }, { status: 500 });
    }

    if (!chat_id || !text) {
      return Response.json({ error: 'chat_id e text são obrigatórios' }, { status: 400 });
    }

    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id, 
        text, 
        parse_mode, 
        disable_web_page_preview: true 
      }),
    });

    const data = await resp.json();
    return Response.json(data, { status: resp.ok ? 200 : 400 });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
});