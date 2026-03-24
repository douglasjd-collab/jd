import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { mensagem, chatId } = await req.json();

    if (!mensagem) {
      return Response.json({ error: 'Mensagem é obrigatória' }, { status: 400 });
    }

    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const defaultChatId = Deno.env.get('TELEGRAM_CHAT_ID');
    const targetChatId = chatId || defaultChatId;

    if (!botToken || !targetChatId) {
      return Response.json({ 
        error: 'Telegram não configurado. Configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID.' 
      }, { status: 400 });
    }

    // Enviar mensagem via Telegram Bot API
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: mensagem,
        parse_mode: 'HTML'
      })
    });

    const result = await response.json();

    if (!result.ok) {
      return Response.json({ 
        error: 'Erro ao enviar mensagem', 
        details: result 
      }, { status: 500 });
    }

    return Response.json({ 
      success: true, 
      message: 'Notificação enviada com sucesso!' 
    });

  } catch (error) {
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});