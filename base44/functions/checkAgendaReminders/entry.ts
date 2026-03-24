import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function sendTelegram(chat_id, text) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      chat_id, 
      text, 
      parse_mode: 'HTML', 
      disable_web_page_preview: true 
    }),
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const chatId = String(Deno.env.get('TELEGRAM_CHAT_ID') || '');
    if (!chatId) {
      return Response.json({ error: 'TELEGRAM_CHAT_ID não configurado' }, { status: 500 });
    }

    const now = new Date();
    const future = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2h

    const items = await base44.asServiceRole.entities.Agenda.filter({
      telegram_chat_id: chatId,
      status: { $in: ['agendado', 'confirmado', 'remarcado'] },
      inicio: { $gte: now.toISOString(), $lte: future.toISOString() },
    }, 'inicio', 200);

    let lembretes30 = 0;
    let lembretes10 = 0;

    for (const it of (items || [])) {
      const start = new Date(it.inicio);
      const diffMs = start.getTime() - now.getTime();
      const diffMin = Math.floor(diffMs / 60000);

      // Lembrete de 30 minutos
      if (diffMin <= 30 && diffMin > 10 && !it.lembrete_30_enviado_em) {
        const hh = String(start.getHours()).padStart(2, '0');
        const mm = String(start.getMinutes()).padStart(2, '0');

        await sendTelegram(
          chatId,
          `⏰ <b>Lembrete (30 min)</b>\n<b>${it.titulo}</b>\n📅 Hoje ${hh}:${mm} • <i>${it.tipo}</i>\n\n✅ confirmar: <code>confirmar ${it.id}</code>\n❌ cancelar: <code>cancelar ${it.id}</code>`
        );

        await base44.asServiceRole.entities.Agenda.update(it.id, { 
          lembrete_30_enviado_em: new Date().toISOString() 
        });
        lembretes30++;
      }

      // Lembrete de 10 minutos
      if (diffMin <= 10 && diffMin >= 0 && !it.lembrete_10_enviado_em) {
        const hh = String(start.getHours()).padStart(2, '0');
        const mm = String(start.getMinutes()).padStart(2, '0');

        await sendTelegram(
          chatId,
          `🚨 <b>Falta 10 min</b>\n<b>${it.titulo}</b>\n📅 Hoje ${hh}:${mm} • <i>${it.tipo}</i>\n\n✅ confirmar: <code>confirmar ${it.id}</code>\n❌ cancelar: <code>cancelar ${it.id}</code>`
        );

        await base44.asServiceRole.entities.Agenda.update(it.id, { 
          lembrete_10_enviado_em: new Date().toISOString() 
        });
        lembretes10++;
      }
    }

    return Response.json({ 
      success: true, 
      count: items?.length || 0,
      lembretes_30: lembretes30,
      lembretes_10: lembretes10
    });
  } catch (e) {
    console.error('Erro ao verificar lembretes:', e);
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
});