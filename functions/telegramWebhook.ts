import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function normalizeText(s) {
  return (s || '').trim();
}

function parseDateTimeSmart(text) {
  const t = normalizeText(text).toLowerCase();
  const now = new Date();

  const timeMatch = t.match(/(\d{1,2}):(\d{2})/);
  if (!timeMatch) return null;
  
  const hh = parseInt(timeMatch[1], 10);
  const mm = parseInt(timeMatch[2], 10);

  let base = new Date(now);
  base.setSeconds(0, 0);
  base.setHours(hh, mm, 0, 0);

  if (t.includes('aman')) {
    base.setDate(base.getDate() + 1);
    return base;
  }
  if (t.includes('hoje')) {
    return base;
  }

  const dm = t.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (dm) {
    const dd = parseInt(dm[1], 10);
    const mo = parseInt(dm[2], 10) - 1;
    const yyRaw = dm[3];
    const yy = yyRaw ? (yyRaw.length === 2 ? 2000 + parseInt(yyRaw, 10) : parseInt(yyRaw, 10)) : now.getFullYear();
    const d = new Date(yy, mo, dd, hh, mm, 0, 0);
    return d;
  }

  return null;
}

async function send(chat_id, text) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
}

function helpText() {
  return [
    '🤖 <b>Comandos da Agenda</b>',
    '',
    '✅ <b>Criar</b>',
    '• <code>reuniao hoje 14:30 alinhamento com João</code>',
    '• <code>tarefa amanhã 09:00 emitir NF Clarice</code>',
    '• <code>agenda 26/01 16:00 reunião com cliente</code> (cria como reunião)',
    '',
    '📋 <b>Listar</b>',
    '• <code>agenda hoje</code>',
    '• <code>agenda amanhã</code>',
    '',
    '✏️ <b>Editar</b>',
    '• <code>remarcar 123 amanhã 10:00</code>',
    '• <code>confirmar 123</code>',
    '• <code>concluir 123</code>',
    '',
    '❌ <b>Cancelar</b>',
    '• <code>cancelar 123</code>',
    '• <code>cancelar 123 motivo cliente desmarcou</code>',
  ].join('\n');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    
    const msg = body?.message || body?.edited_message;
    if (!msg) return new Response('ok', { status: 200 });

    const chatId = String(msg.chat?.id || '');
    const allowedChat = String(Deno.env.get('TELEGRAM_CHAT_ID') || '');
    
    if (!allowedChat) {
      return Response.json({ error: 'TELEGRAM_CHAT_ID não configurado' }, { status: 500 });
    }

    if (chatId !== allowedChat) {
      return new Response('forbidden', { status: 200 });
    }

    const text = normalizeText(msg.text || '');
    if (!text) return new Response('ok', { status: 200 });

    const lower = text.toLowerCase();

    // Ajuda
    if (lower === '/start' || lower === 'ajuda' || lower === 'help' || lower === '/help') {
      await send(chatId, helpText());
      return new Response('ok', { status: 200 });
    }

    // LISTAR (hoje)
    if (lower.startsWith('agenda hoje')) {
      const start = new Date(); start.setHours(0,0,0,0);
      const end = new Date(); end.setHours(23,59,59,999);

      const items = await base44.asServiceRole.entities.Agenda.filter({
        telegram_chat_id: chatId,
        inicio: { $gte: start.toISOString(), $lte: end.toISOString() },
        status: { $in: ['agendado','confirmado','remarcado'] },
      }, 'inicio', 50);

      if (!items?.length) {
        await send(chatId, '📅 <b>Agenda de hoje</b>\nNenhum compromisso.');
        return new Response('ok', { status: 200 });
      }

      const lines = items.map(it => {
        const d = new Date(it.inicio);
        const hh = String(d.getHours()).padStart(2,'0');
        const mm = String(d.getMinutes()).padStart(2,'0');
        return `• <b>${hh}:${mm}</b> (${it.tipo}) <b>${it.titulo}</b> — <code>ID ${it.id}</code> — <i>${it.status}</i>`;
      });

      await send(chatId, `📅 <b>Agenda de hoje</b>\n\n${lines.join('\n')}`);
      return new Response('ok', { status: 200 });
    }

    // LISTAR (amanhã)
    if (lower.startsWith('agenda amanhã') || lower.startsWith('agenda amanha')) {
      const start = new Date(); start.setDate(start.getDate()+1); start.setHours(0,0,0,0);
      const end = new Date(start); end.setHours(23,59,59,999);

      const items = await base44.asServiceRole.entities.Agenda.filter({
        telegram_chat_id: chatId,
        inicio: { $gte: start.toISOString(), $lte: end.toISOString() },
        status: { $in: ['agendado','confirmado','remarcado'] },
      }, 'inicio', 50);

      if (!items?.length) {
        await send(chatId, '📅 <b>Agenda de amanhã</b>\nNenhum compromisso.');
        return new Response('ok', { status: 200 });
      }

      const lines = items.map(it => {
        const d = new Date(it.inicio);
        const hh = String(d.getHours()).padStart(2,'0');
        const mm = String(d.getMinutes()).padStart(2,'0');
        return `• <b>${hh}:${mm}</b> (${it.tipo}) <b>${it.titulo}</b> — <code>ID ${it.id}</code> — <i>${it.status}</i>`;
      });

      await send(chatId, `📅 <b>Agenda de amanhã</b>\n\n${lines.join('\n')}`);
      return new Response('ok', { status: 200 });
    }

    // CANCELAR
    if (lower.startsWith('cancelar ')) {
      const m = text.match(/^cancelar\s+(\S+)(?:\s+motivo[:\s]+(.+))?$/i);
      const id = m?.[1];
      const motivo = m?.[2]?.trim() || null;

      if (!id) {
        await send(chatId, '❌ Use: <code>cancelar 123</code> ou <code>cancelar 123 motivo cliente desmarcou</code>');
        return new Response('ok', { status: 200 });
      }

      const item = await base44.asServiceRole.entities.Agenda.get(id);
      if (!item || String(item.telegram_chat_id) !== chatId) {
        await send(chatId, '⚠️ Não encontrei esse ID na sua agenda.');
        return new Response('ok', { status: 200 });
      }

      await base44.asServiceRole.entities.Agenda.update(id, {
        status: 'cancelado',
        cancelado_em: new Date().toISOString(),
        cancelado_motivo: motivo,
      });

      await send(chatId, `✅ Cancelado: <b>${item.titulo}</b> — <code>ID ${id}</code>${motivo ? `\nMotivo: <i>${motivo}</i>` : ''}`);
      return new Response('ok', { status: 200 });
    }

    // REMARCAR
    if (lower.startsWith('remarcar ')) {
      const m = text.match(/^remarcar\s+(\S+)\s+(.+)$/i);
      const id = m?.[1];
      const rest = m?.[2];

      if (!id || !rest) {
        await send(chatId, '❌ Use: <code>remarcar 123 amanhã 10:00</code> ou <code>remarcar 123 26/01 16:00</code>');
        return new Response('ok', { status: 200 });
      }

      const newDt = parseDateTimeSmart(rest);
      if (!newDt) {
        await send(chatId, '⚠️ Não entendi a data/hora. Ex: <code>amanhã 10:00</code> ou <code>26/01 16:00</code>.');
        return new Response('ok', { status: 200 });
      }

      const item = await base44.asServiceRole.entities.Agenda.get(id);
      if (!item || String(item.telegram_chat_id) !== chatId) {
        await send(chatId, '⚠️ Não encontrei esse ID na sua agenda.');
        return new Response('ok', { status: 200 });
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

      await send(chatId, `✅ Remarcado: <b>${item.titulo}</b>\n📅 Novo horário: <b>${newDt.toLocaleString('pt-BR')}</b>\n<code>ID ${id}</code>`);
      return new Response('ok', { status: 200 });
    }

    // CONFIRMAR
    if (lower.startsWith('confirmar ')) {
      const id = text.split(/\s+/)[1];
      const item = await base44.asServiceRole.entities.Agenda.get(id);
      if (!item || String(item.telegram_chat_id) !== chatId) {
        await send(chatId, '⚠️ Não encontrei esse ID na sua agenda.');
        return new Response('ok', { status: 200 });
      }
      await base44.asServiceRole.entities.Agenda.update(id, { status: 'confirmado' });
      await send(chatId, `✅ Confirmado: <b>${item.titulo}</b> — <code>ID ${id}</code>`);
      return new Response('ok', { status: 200 });
    }

    // CONCLUIR
    if (lower.startsWith('concluir ')) {
      const id = text.split(/\s+/)[1];
      const item = await base44.asServiceRole.entities.Agenda.get(id);
      if (!item || String(item.telegram_chat_id) !== chatId) {
        await send(chatId, '⚠️ Não encontrei esse ID na sua agenda.');
        return new Response('ok', { status: 200 });
      }
      await base44.asServiceRole.entities.Agenda.update(id, { status: 'concluido' });
      await send(chatId, `✅ Concluído: <b>${item.titulo}</b> — <code>ID ${id}</code>`);
      return new Response('ok', { status: 200 });
    }

    // CRIAR (reuniao/tarefa/agenda)
    const createMatch = text.match(/^(reuniao|tarefa|agenda)\s+(.+)$/i);
    if (createMatch) {
      const cmd = createMatch[1].toLowerCase();
      const rest = createMatch[2];

      const dt = parseDateTimeSmart(rest);
      if (!dt) {
        await send(chatId, '⚠️ Não consegui ler data/hora. Exemplos:\n• <code>reuniao hoje 14:30 alinhamento</code>\n• <code>tarefa amanhã 09:00 emitir NF</code>\n• <code>agenda 26/01 16:00 reunião cliente</code>');
        return new Response('ok', { status: 200 });
      }

      const title = rest
        .replace(/hoje|amanh[aã]/ig, '')
        .replace(/\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/g, '')
        .replace(/\d{1,2}:\d{2}/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      const tipo = cmd === 'agenda' ? 'reuniao' : cmd;

      const created = await base44.asServiceRole.entities.Agenda.create({
        empresa_id: 'TELEGRAM_BOT',
        titulo: title || '(Sem título)',
        tipo,
        inicio: dt.toISOString(),
        status: 'agendado',
        telegram_chat_id: chatId,
        lembrete_30_enviado_em: null,
        lembrete_10_enviado_em: null,
      });

      await send(chatId, `✅ Criado: <b>${created.titulo}</b>\n📅 ${dt.toLocaleString('pt-BR')}\n📌 Tipo: <b>${created.tipo}</b>\n<code>ID ${created.id}</code>`);
      return new Response('ok', { status: 200 });
    }

    await send(chatId, 'Não entendi. Digite <code>ajuda</code> para ver os comandos.');
    return new Response('ok', { status: 200 });

  } catch (e) {
    console.error('Erro no webhook:', e);
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
});