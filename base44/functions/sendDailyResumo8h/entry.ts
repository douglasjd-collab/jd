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

    const start = new Date(); 
    start.setHours(0, 0, 0, 0);
    const end = new Date(); 
    end.setHours(23, 59, 59, 999);

    const items = await base44.asServiceRole.entities.Agenda.filter({
      telegram_chat_id: chatId,
      inicio: { $gte: start.toISOString(), $lte: end.toISOString() },
      status: { $in: ['agendado', 'confirmado', 'remarcado'] },
    }, 'inicio', 50);

    const header = `☀️ <b>Resumo 08:00</b>\n📅 ${start.toLocaleDateString('pt-BR')}\n`;

    if (!items?.length) {
      await sendTelegram(
        chatId, 
        `${header}\n✅ Hoje você não tem compromissos na agenda.\n\nDica: crie com\n<code>reuniao hoje 14:30 alinhamento</code>`
      );
      return Response.json({ success: true, count: 0 });
    }

    const lines = items.map(it => {
      const d = new Date(it.inicio);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `• <b>${hh}:${mm}</b> (${it.tipo}) <b>${it.titulo}</b> — <code>ID ${it.id}</code>`;
    });

    await sendTelegram(
      chatId, 
      `${header}\n<b>Agenda de hoje:</b>\n\n${lines.join('\n')}\n\n📌 Ver tudo: <code>agenda hoje</code>`
    );
    
    return Response.json({ success: true, count: items.length });
  } catch (e) {
    console.error('Erro ao enviar resumo diário:', e);
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
});