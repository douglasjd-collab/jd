import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID');

    if (!botToken || !chatId) {
      return Response.json({ 
        error: 'Telegram não configurado' 
      }, { status: 400 });
    }

    const hoje = new Date().toISOString().split('T')[0];
    const notificacoes = [];

    // 1. Verificar despesas vencendo hoje
    const despesas = await base44.asServiceRole.entities.Despesa.filter({ data: hoje });
    
    if (despesas.length > 0) {
      let msgDespesas = `🔴 <b>DESPESAS VENCENDO HOJE</b> (${hoje})\n\n`;
      let totalDespesas = 0;
      
      for (const desp of despesas) {
        totalDespesas += desp.valor || 0;
        msgDespesas += `• ${desp.categoria} - ${desp.descricao}\n`;
        msgDespesas += `  Valor: R$ ${(desp.valor || 0).toFixed(2)}\n`;
        msgDespesas += `  Responsável: ${desp.responsavel_nome}\n\n`;
      }
      
      msgDespesas += `<b>Total: R$ ${totalDespesas.toFixed(2)}</b>`;
      notificacoes.push(msgDespesas);
    }

    // 2. Verificar cards atrasados no funil (oportunidades sem movimentação há mais de 7 dias)
    const seteDiasAtras = new Date();
    seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
    const dataLimite = seteDiasAtras.toISOString();

    const oportunidades = await base44.asServiceRole.entities.Oportunidade.filter({});
    const oportunidadesAtrasadas = oportunidades.filter(op => {
      if (op.status === 'ganha' || op.status === 'perdida') return false;
      const dataAtualizacao = new Date(op.updated_date);
      return dataAtualizacao < seteDiasAtras;
    });

    if (oportunidadesAtrasadas.length > 0) {
      let msgFunil = `⏰ <b>CARDS ATRASADOS NO FUNIL</b>\n`;
      msgFunil += `<i>Sem movimentação há mais de 7 dias</i>\n\n`;
      
      for (const op of oportunidadesAtrasadas.slice(0, 10)) { // Limitar a 10
        const diasAtrasado = Math.floor((Date.now() - new Date(op.updated_date)) / (1000 * 60 * 60 * 24));
        msgFunil += `• ${op.titulo}\n`;
        msgFunil += `  Cliente: ${op.cliente_nome}\n`;
        msgFunil += `  Etapa: ${op.etapa_nome || 'N/A'}\n`;
        msgFunil += `  Atrasado: ${diasAtrasado} dias\n\n`;
      }
      
      if (oportunidadesAtrasadas.length > 10) {
        msgFunil += `<i>... e mais ${oportunidadesAtrasadas.length - 10} cards atrasados</i>`;
      }
      
      notificacoes.push(msgFunil);
    }

    // 3. Enviar notificações se houver algo a reportar
    if (notificacoes.length === 0) {
      return Response.json({ 
        success: true, 
        message: 'Nenhuma notificação pendente hoje' 
      });
    }

    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const resultados = [];

    for (const mensagem of notificacoes) {
      const response = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: mensagem,
          parse_mode: 'HTML'
        })
      });

      const result = await response.json();
      resultados.push({ sucesso: result.ok, detalhes: result });
    }

    return Response.json({ 
      success: true, 
      notificacoes_enviadas: notificacoes.length,
      resultados 
    });

  } catch (error) {
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});