import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function stripAccents(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeSpaces(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function smartNormalize(textRaw) {
  const original = normalizeSpaces(textRaw || '');
  let clean = stripAccents(original).toLowerCase();

  clean = clean.replace(/\b(\d{1,2})h(\d{2})\b/g, '$1:$2');
  clean = clean.replace(/\b(\d{1,2})h\b/g, '$1:00');
  clean = clean.replace(/\b(\d{1,2})(\d{2})\b/g, '$1:$2');

  clean = clean
    .replace(/\bmarcar\b/g, 'agendar')
    .replace(/\bcriar\b/g, 'agendar')
    .replace(/\bcompromisso\b/g, 'reuniao')
    .replace(/\bmeeting\b/g, 'reuniao');

  return { original, clean };
}

function parseDateTimeSmart(clean) {
  const now = new Date();

  const timeMatch = clean.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!timeMatch) return null;

  const hh = parseInt(timeMatch[1], 10);
  const mm = parseInt(timeMatch[2], 10);

  const base = new Date(now);
  base.setSeconds(0, 0);
  base.setHours(hh, mm, 0, 0);

  if (clean.includes('depois de amanha')) {
    base.setDate(base.getDate() + 2);
    return base;
  }
  if (clean.includes('amanha')) {
    base.setDate(base.getDate() + 1);
    return base;
  }
  if (clean.includes('hoje')) {
    return base;
  }

  const dm = clean.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (dm) {
    const dd = parseInt(dm[1], 10);
    const mo = parseInt(dm[2], 10) - 1;
    const yyRaw = dm[3];
    const yy = yyRaw
      ? (yyRaw.length === 2 ? 2000 + parseInt(yyRaw, 10) : parseInt(yyRaw, 10))
      : now.getFullYear();

    return new Date(yy, mo, dd, hh, mm, 0, 0);
  }

  return base;
}

function extractTitle(original, clean) {
  let t = original;

  t = t.replace(/depois de amanhã/ig, '');
  t = t.replace(/amanhã/ig, '');
  t = t.replace(/hoje/ig, '');

  t = t.replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, '');

  t = t.replace(/\b\d{1,2}:\d{2}\b/g, '');
  t = t.replace(/\b\d{1,2}h\d{2}\b/ig, '');
  t = t.replace(/\b\d{1,2}h\b/ig, '');
  t = t.replace(/\b\d{3,4}\b/g, '');

  t = t.replace(/\bagendar\b/ig, '');
  t = t.replace(/\bcriar\b/ig, '');
  t = t.replace(/\bmarcar\b/ig, '');
  t = t.replace(/\breuniao\b/ig, '');
  t = t.replace(/\btarefa\b/ig, '');
  t = t.replace(/\bagenda\b/ig, '');

  t = normalizeSpaces(t);
  return t || '(Sem título)';
}

async function sendTelegram(chat_id, text) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN não configurado');

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
}

function helpText() {
  return [
    '🤖 <b>Agenda inteligente</b>',
    '',
    '✅ <b>Agendar</b> (pode escrever natural)',
    '• <code>reunião amanhã 10h com João</code>',
    '• <code>marcar compromisso hoje 14:30 cliente</code>',
    '• <code>criar tarefa depois de amanhã 09:00 emitir nota</code>',
    '• <code>agenda 26/01 16:00 reunião com cliente</code>',
    '',
    '📋 <b>Listar</b>',
    '• <code>agenda hoje</code>',
    '• <code>agenda amanhã</code>',
    '',
    '✏️ <b>Ações</b>',
    '• <code>cancelar 123</code> (ou <code>cancelar 123 motivo ...</code>)',
    '• <code>remarcar 123 amanhã 10h</code>',
    '• <code>confirmar 123</code>',
    '• <code>concluir 123</code>',
  ].join('\n');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const chatAllowed = String(Deno.env.get('TELEGRAM_CHAT_ID') || '');
    if (!chatAllowed) {
      return Response.json({ error: 'TELEGRAM_CHAT_ID não configurado' }, { status: 500 });
    }

    const body = await req.json();
    const msg = body?.message || body?.edited_message;
    if (!msg) return Response.json({ ok: true });

    const chatId = String(msg.chat?.id || '');
    const textRaw = String(msg.text || '').trim();
    if (!chatId || !textRaw) return Response.json({ ok: true });

    if (chatId !== chatAllowed) return Response.json({ ok: true });

    const { original, clean } = smartNormalize(textRaw);

    if (clean === '/start' || clean === 'ajuda' || clean === 'help' || clean === '/help') {
      await sendTelegram(chatId, helpText());
      return Response.json({ ok: true });
    }

    // LISTAR hoje / amanha
    if (clean.startsWith('agenda hoje')) {
      const start = new Date(); start.setHours(0,0,0,0);
      const end = new Date(); end.setHours(23,59,59,999);

      const items = await base44.asServiceRole.entities.Agenda.filter({
        telegram_chat_id: chatId,
        inicio: { $gte: start.toISOString(), $lte: end.toISOString() },
        status: { $in: ['agendado','confirmado','remarcado'] },
      }, 'inicio', 50);

      if (!items?.length) {
        await sendTelegram(chatId, '📅 <b>Agenda de hoje</b>\nNenhum compromisso.');
        return Response.json({ ok: true });
      }

      const lines = items.map((it) => {
        const d = new Date(it.inicio);
        const hh = String(d.getHours()).padStart(2,'0');
        const mm = String(d.getMinutes()).padStart(2,'0');
        return `• <b>${hh}:${mm}</b> (${it.tipo}) <b>${it.titulo}</b> — <code>ID ${it.id}</code>`;
      });

      await sendTelegram(chatId, `📅 <b>Agenda de hoje</b>\n\n${lines.join('\n')}`);
      return Response.json({ ok: true });
    }

    if (clean.startsWith('agenda amanha')) {
      const start = new Date(); start.setDate(start.getDate()+1); start.setHours(0,0,0,0);
      const end = new Date(start); end.setHours(23,59,59,999);

      const items = await base44.asServiceRole.entities.Agenda.filter({
        telegram_chat_id: chatId,
        inicio: { $gte: start.toISOString(), $lte: end.toISOString() },
        status: { $in: ['agendado','confirmado','remarcado'] },
      }, 'inicio', 50);

      if (!items?.length) {
        await sendTelegram(chatId, '📅 <b>Agenda de amanhã</b>\nNenhum compromisso.');
        return Response.json({ ok: true });
      }

      const lines = items.map((it) => {
        const d = new Date(it.inicio);
        const hh = String(d.getHours()).padStart(2,'0');
        const mm = String(d.getMinutes()).padStart(2,'0');
        return `• <b>${hh}:${mm}</b> (${it.tipo}) <b>${it.titulo}</b> — <code>ID ${it.id}</code>`;
      });

      await sendTelegram(chatId, `📅 <b>Agenda de amanhã</b>\n\n${lines.join('\n')}`);
      return Response.json({ ok: true });
    }

    // CANCELAR
    if (clean.startsWith('cancelar ')) {
      const m = original.match(/^cancelar\s+(\S+)(?:\s+motivo[:\s]+(.+))?$/i);
      const id = m?.[1];
      const motivo = m?.[2]?.trim() || null;

      if (!id) {
        await sendTelegram(chatId, '❌ Use: <code>cancelar 123</code> ou <code>cancelar 123 motivo ...</code>');
        return Response.json({ ok: true });
      }

      const item = await base44.asServiceRole.entities.Agenda.get(id);
      if (!item || String(item.telegram_chat_id) !== chatId) {
        await sendTelegram(chatId, '⚠️ Não encontrei esse ID na sua agenda.');
        return Response.json({ ok: true });
      }

      await base44.asServiceRole.entities.Agenda.update(id, {
        status: 'cancelado',
        cancelado_em: new Date().toISOString(),
        cancelado_motivo: motivo,
      });

      await sendTelegram(chatId, `✅ Cancelado: <b>${item.titulo}</b> — <code>ID ${id}</code>${motivo ? `\nMotivo: <i>${motivo}</i>` : ''}`);
      return Response.json({ ok: true });
    }

    // REMARCAR
    if (clean.startsWith('remarcar ')) {
      const m = clean.match(/^remarcar\s+(\S+)\s+(.+)$/i);
      const id = m?.[1];
      const rest = m?.[2];

      if (!id || !rest) {
        await sendTelegram(chatId, '❌ Use: <code>remarcar 123 amanha 10h</code> ou <code>remarcar 123 26/01 16:00</code>');
        return Response.json({ ok: true });
      }

      const newDt = parseDateTimeSmart(rest);
      if (!newDt) {
        await sendTelegram(chatId, '⚠️ Não entendi a data/hora. Ex: <code>amanhã 10h</code> ou <code>26/01 16:00</code>.');
        return Response.json({ ok: true });
      }

      const item = await base44.asServiceRole.entities.Agenda.get(id);
      if (!item || String(item.telegram_chat_id) !== chatId) {
        await sendTelegram(chatId, '⚠️ Não encontrei esse ID na sua agenda.');
        return Response.json({ ok: true });
      }

      await base44.asServiceRole.entities.Agenda.update(id, {
        remarcado_de: item.inicio,
        inicio: newDt.toISOString(),
        status: 'remarcado',
        lembrete_30_enviado_em: null,
        lembrete_10_enviado_em: null,
        cancelado_em: null,
        cancelado_motivo: null,
      });

      await sendTelegram(chatId, `✅ Remarcado: <b>${item.titulo}</b>\n📅 Novo horário: <b>${newDt.toLocaleString('pt-BR')}</b>\n<code>ID ${id}</code>`);
      return Response.json({ ok: true });
    }

    // CONFIRMAR / CONCLUIR
    if (clean.startsWith('confirmar ')) {
      const id = clean.split(' ')[1];
      const item = await base44.asServiceRole.entities.Agenda.get(id);
      if (!item || String(item.telegram_chat_id) !== chatId) {
        await sendTelegram(chatId, '⚠️ Não encontrei esse ID na sua agenda.');
        return Response.json({ ok: true });
      }
      await base44.asServiceRole.entities.Agenda.update(id, { status: 'confirmado' });
      await sendTelegram(chatId, `✅ Confirmado: <b>${item.titulo}</b> — <code>ID ${id}</code>`);
      return Response.json({ ok: true });
    }

    if (clean.startsWith('concluir ')) {
      const id = clean.split(' ')[1];
      const item = await base44.asServiceRole.entities.Agenda.get(id);
      if (!item || String(item.telegram_chat_id) !== chatId) {
        await sendTelegram(chatId, '⚠️ Não encontrei esse ID na sua agenda.');
        return Response.json({ ok: true });
      }
      await base44.asServiceRole.entities.Agenda.update(id, { status: 'concluido' });
      await sendTelegram(chatId, `✅ Concluído: <b>${item.titulo}</b> — <code>ID ${id}</code>`);
      return Response.json({ ok: true });
    }

    // AGENDAR "inteligente"
    const hasTime = /\b\d{1,2}:\d{2}\b/.test(clean) || /\b\d{1,2}h\b/.test(clean) || /\b\d{3,4}\b/.test(clean);
    if (hasTime) {
      const dt = parseDateTimeSmart(clean);
      if (!dt) {
        await sendTelegram(chatId, '⚠️ Entendi que você quer agendar, mas não consegui ler a hora. Ex: <code>amanhã 10h</code> ou <code>hoje 14:30</code>.');
        return Response.json({ ok: true });
      }

      let tipo = 'reuniao';
      if (clean.includes('tarefa')) tipo = 'tarefa';
      if (clean.includes('reuniao')) tipo = 'reuniao';

      const titulo = extractTitle(original, clean);

      // Buscar o usuário pelo chat_id do Telegram
      let usuarioId = null;
      let empresaId = 'TELEGRAM_BOT';
      
      try {
        const colaboradores = await base44.asServiceRole.entities.Colaborador.filter(
          { telegram_chat_id: chatId, status: 'ativo' },
          '-created_date',
          1
        );
        
        if (colaboradores && colaboradores.length > 0) {
          usuarioId = colaboradores[0].user_id;
          empresaId = colaboradores[0].empresa_id || 'TELEGRAM_BOT';
        }
      } catch (err) {
        console.error('Erro ao buscar colaborador:', err);
      }

      const created = await base44.asServiceRole.entities.Agenda.create({
        empresa_id: empresaId,
        titulo,
        tipo,
        inicio: dt.toISOString(),
        status: 'agendado',
        telegram_chat_id: chatId,
        usuario_id: usuarioId,
        usuario_nome: null,
        lembrete_30_enviado_em: null,
        lembrete_10_enviado_em: null,
      });

      await sendTelegram(
        chatId,
        `✅ Agendado: <b>${created.titulo}</b>\n📅 ${dt.toLocaleString('pt-BR')}\n📌 Tipo: <b>${created.tipo}</b>\n<code>ID ${created.id}</code>`
      );
      return Response.json({ ok: true });
    }

    await sendTelegram(chatId, 'Não entendi. Digite <code>ajuda</code>.\n\nEx: <code>reunião amanhã 10h com João</code>');
    return Response.json({ ok: true });

  } catch (e) {
    console.error('Erro no webhook:', e);
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
});