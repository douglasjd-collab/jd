import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verificar autenticação (apenas admin pode rodar manualmente)
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!TELEGRAM_BOT_TOKEN) {
      return Response.json({ error: 'TELEGRAM_BOT_TOKEN não configurado' }, { status: 500 });
    }

    const agora = new Date();
    const em30min = new Date(agora.getTime() + 30 * 60 * 1000);
    const em10min = new Date(agora.getTime() + 10 * 60 * 1000);

    // Buscar compromissos agendados ou confirmados
    const compromissos = await base44.asServiceRole.entities.Agenda.filter({
      status: { $in: ['agendado', 'confirmado'] }
    });

    let lembretes30Enviados = 0;
    let lembretes10Enviados = 0;
    const erros = [];

    for (const compromisso of compromissos) {
      try {
        const inicio = new Date(compromisso.inicio);
        const diffMinutos = Math.floor((inicio - agora) / (60 * 1000));

        // Lembrete de 30 minutos
        if (diffMinutos >= 25 && diffMinutos <= 35 && !compromisso.lembrete_30_enviado_em) {
          const mensagem = `🔔 *LEMBRETE - 30 minutos*\n\n` +
            `📅 *${compromisso.titulo}*\n` +
            `⏰ Início: ${new Date(compromisso.inicio).toLocaleString('pt-BR')}\n` +
            `📍 Local: ${compromisso.local || 'Não informado'}\n` +
            `📝 Tipo: ${compromisso.tipo === 'reuniao' ? 'Reunião' : 'Tarefa'}`;

          const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
          await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: compromisso.telegram_chat_id,
              text: mensagem,
              parse_mode: 'Markdown',
            }),
          });

          await base44.asServiceRole.entities.Agenda.update(compromisso.id, {
            lembrete_30_enviado_em: agora.toISOString(),
          });

          lembretes30Enviados++;
        }

        // Lembrete de 10 minutos
        if (diffMinutos >= 5 && diffMinutos <= 15 && !compromisso.lembrete_10_enviado_em) {
          const mensagem = `⚠️ *LEMBRETE URGENTE - 10 minutos*\n\n` +
            `📅 *${compromisso.titulo}*\n` +
            `⏰ Início: ${new Date(compromisso.inicio).toLocaleString('pt-BR')}\n` +
            `📍 Local: ${compromisso.local || 'Não informado'}\n` +
            `📝 Tipo: ${compromisso.tipo === 'reuniao' ? 'Reunião' : 'Tarefa'}`;

          const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
          await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: compromisso.telegram_chat_id,
              text: mensagem,
              parse_mode: 'Markdown',
            }),
          });

          await base44.asServiceRole.entities.Agenda.update(compromisso.id, {
            lembrete_10_enviado_em: agora.toISOString(),
          });

          lembretes10Enviados++;
        }
      } catch (err) {
        erros.push({ compromisso_id: compromisso.id, erro: err.message });
      }
    }

    return Response.json({
      success: true,
      lembretes_30_enviados: lembretes30Enviados,
      lembretes_10_enviados: lembretes10Enviados,
      total_verificados: compromissos.length,
      erros: erros.length > 0 ? erros : null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});