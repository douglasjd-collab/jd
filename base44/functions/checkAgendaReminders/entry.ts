import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
    // Buscar compromissos nas próximas 65min E os que começaram há até 5 min
    const pastWindow = new Date(now.getTime() - 5 * 60 * 1000);
    const future = new Date(now.getTime() + 65 * 60 * 1000);

    const items = await base44.asServiceRole.entities.Agenda.filter({
      telegram_chat_id: chatId,
      status: { $in: ['agendado', 'confirmado', 'remarcado'] },
      inicio: { $gte: pastWindow.toISOString(), $lte: future.toISOString() },
    }, 'inicio', 200);

    let lembretes60 = 0;
    let lembretes20 = 0;
    let lembretes5 = 0;

    for (const it of (items || [])) {
      const start = new Date(it.inicio);
      const diffMin = (start.getTime() - now.getTime()) / 60000;

      // Formatar horário no fuso de Brasília
      const startBR = new Date(start.getTime() - 3 * 60 * 60 * 1000);
      const hh = String(startBR.getUTCHours()).padStart(2, '0');
      const mm = String(startBR.getUTCMinutes()).padStart(2, '0');

      const base = `📌 <b>${it.titulo}</b>\n🕐 Às ${hh}:${mm}${it.local ? `\n📍 ${it.local}` : ''}${it.descricao ? `\n📝 ${it.descricao}` : ''}`;

      // Lembrete de 1 hora (entre 65 e 55 min antes)
      if (diffMin <= 65 && diffMin > 55 && !it.lembrete_60_enviado_em) {
        await sendTelegram(chatId, `🕐 <b>Reunião em 1 hora!</b>\n\n${base}`);
        await base44.asServiceRole.entities.Agenda.update(it.id, { lembrete_60_enviado_em: new Date().toISOString() });
        lembretes60++;
      }

      // Lembrete de 20 minutos (entre 25 e 15 min antes)
      if (diffMin <= 25 && diffMin > 15 && !it.lembrete_30_enviado_em) {
        await sendTelegram(chatId, `⏰ <b>Reunião em 20 minutos!</b>\n\n${base}`);
        await base44.asServiceRole.entities.Agenda.update(it.id, { lembrete_30_enviado_em: new Date().toISOString() });
        lembretes20++;
      }

      // Lembrete de 5 minutos (entre 8 e 2 min antes)
      if (diffMin <= 8 && diffMin > 2 && !it.lembrete_10_enviado_em) {
        await sendTelegram(chatId, `🚨 <b>Reunião em 5 minutos!</b>\n\n${base}`);
        await base44.asServiceRole.entities.Agenda.update(it.id, { lembrete_10_enviado_em: new Date().toISOString() });
        lembretes5++;
      }
    }

    return Response.json({ 
      success: true, 
      count: items?.length || 0,
      lembretes_60: lembretes60,
      lembretes_20: lembretes20,
      lembretes_5: lembretes5,
    });
  } catch (e) {
    console.error('Erro ao verificar lembretes:', e);
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
});