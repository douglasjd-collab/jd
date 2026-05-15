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
    // Buscar compromissos nas próximas 2h E os que começaram há até 5 min (para o lembrete "na hora")
    const pastWindow = new Date(now.getTime() - 5 * 60 * 1000);
    const future = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const items = await base44.asServiceRole.entities.Agenda.filter({
      telegram_chat_id: chatId,
      status: { $in: ['agendado', 'confirmado', 'remarcado'] },
      inicio: { $gte: pastWindow.toISOString(), $lte: future.toISOString() },
    }, 'inicio', 200);

    let lembretes30 = 0;
    let lembretes10 = 0;
    let lembretesNaHora = 0;

    for (const it of (items || [])) {
      const start = new Date(it.inicio);
      const diffMs = start.getTime() - now.getTime();
      const diffMin = diffMs / 60000; // com decimais para maior precisão

      const hh = String(start.getHours()).padStart(2, '0');
      const mm = String(start.getMinutes()).padStart(2, '0');

      // Lembrete de 30 minutos (entre 31 e 25 min antes)
      if (diffMin <= 31 && diffMin > 10 && !it.lembrete_30_enviado_em) {
        await sendTelegram(
          chatId,
          `⏰ <b>Lembrete — 30 minutos</b>\n\n📌 <b>${it.titulo}</b>\n🕐 Hoje às ${hh}:${mm}\n📋 Tipo: <i>${it.tipo}</i>${it.local ? `\n📍 Local: ${it.local}` : ''}${it.descricao ? `\n📝 ${it.descricao}` : ''}`
        );
        await base44.asServiceRole.entities.Agenda.update(it.id, { 
          lembrete_30_enviado_em: new Date().toISOString() 
        });
        lembretes30++;
      }

      // Lembrete de 10 minutos (entre 11 e 2 min antes)
      if (diffMin <= 11 && diffMin > 1 && !it.lembrete_10_enviado_em) {
        await sendTelegram(
          chatId,
          `🚨 <b>Lembrete — 10 minutos</b>\n\n📌 <b>${it.titulo}</b>\n🕐 Hoje às ${hh}:${mm}\n📋 Tipo: <i>${it.tipo}</i>${it.local ? `\n📍 Local: ${it.local}` : ''}${it.descricao ? `\n📝 ${it.descricao}` : ''}`
        );
        await base44.asServiceRole.entities.Agenda.update(it.id, { 
          lembrete_10_enviado_em: new Date().toISOString() 
        });
        lembretes10++;
      }

      // Lembrete NA HORA (entre 1 min antes e 5 min depois)
      if (diffMin <= 1 && diffMin >= -5 && !it.lembrete_0_enviado_em) {
        await sendTelegram(
          chatId,
          `🔔 <b>Está começando AGORA!</b>\n\n📌 <b>${it.titulo}</b>\n🕐 Hoje às ${hh}:${mm}\n📋 Tipo: <i>${it.tipo}</i>${it.local ? `\n📍 Local: ${it.local}` : ''}${it.descricao ? `\n📝 ${it.descricao}` : ''}`
        );
        await base44.asServiceRole.entities.Agenda.update(it.id, { 
          lembrete_0_enviado_em: new Date().toISOString() 
        });
        lembretesNaHora++;
      }
    }

    return Response.json({ 
      success: true, 
      count: items?.length || 0,
      lembretes_30: lembretes30,
      lembretes_10: lembretes10,
      lembretes_na_hora: lembretesNaHora
    });
  } catch (e) {
    console.error('Erro ao verificar lembretes:', e);
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
});