import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Para automação agendada, usar service role
    const agora = new Date();
    const agoraISO = agora.toISOString();

    // Buscar todas agendadas com proxima_execucao <= agora
    const todas = await base44.asServiceRole.entities.MensagemAgendada.filter({ status: 'agendada' }, null, 500);
    const pendentes = todas.filter(m => m.proxima_execucao && m.proxima_execucao <= agoraISO);

    if (pendentes.length === 0) {
      return Response.json({ ok: true, processadas: 0, mensagem: 'Nenhuma mensagem pendente' });
    }

    let enviadas = 0;
    let falhas = 0;

    for (const msg of pendentes) {
      try {
        // Buscar configuração de WhatsApp da empresa
        const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: msg.empresa_id });
        const empresa = empresas[0];

        if (!empresa) {
          await base44.asServiceRole.entities.MensagemAgendada.update(msg.id, {
            status: 'falha',
            erro_detalhe: 'Empresa não encontrada',
          });
          falhas++;
          continue;
        }

        const evolutionUrl = empresa.evolution_url || Deno.env.get('EVOLUTION_API_URL');
        const evolutionKey = empresa.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY');
        const instancia = msg.instancia_whatsapp || empresa.evolution_instance_name || Deno.env.get('EVOLUTION_INSTANCE_NAME');

        if (!evolutionUrl || !evolutionKey || !instancia) {
          await base44.asServiceRole.entities.MensagemAgendada.update(msg.id, {
            status: 'falha',
            erro_detalhe: 'Configuração WhatsApp não encontrada',
          });
          falhas++;
          continue;
        }

        // Formatar telefone (remover caracteres especiais, garantir formato internacional)
        let telefone = (msg.telefone || '').replace(/\D/g, '');
        if (!telefone.startsWith('55')) telefone = '55' + telefone;
        const jid = telefone + '@s.whatsapp.net';

        // Enviar via Evolution API
        const resp = await fetch(`${evolutionUrl}/message/sendText/${instancia}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionKey,
          },
          body: JSON.stringify({
            number: jid,
            text: msg.mensagem,
          }),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error(`Evolution API error: ${resp.status} - ${errText}`);
        }

        const respData = await resp.json();
        const whatsappMsgId = respData?.key?.id || respData?.messageId || '';

        // Registrar mensagem no histórico da conversa
        await base44.asServiceRole.entities.MensagemWhatsapp.create({
          conversa_id: msg.conversa_id,
          empresa_id: msg.empresa_id,
          remetente: 'vendedor',
          usuario_id: msg.responsavel_id || '',
          usuario_nome: msg.responsavel_nome || 'Agendamento automático',
          tipo_conteudo: 'texto',
          texto: msg.mensagem,
          whatsapp_message_id: whatsappMsgId,
          data_envio: new Date().toISOString(),
          status: 'enviada',
        });

        // Atualizar última mensagem da conversa
        await base44.asServiceRole.entities.ConversaWhatsapp.update(msg.conversa_id, {
          ultima_mensagem: msg.mensagem,
          data_ultima_mensagem: new Date().toISOString(),
          ultimo_remetente: 'vendedor',
        });

        // Calcular próxima execução se for recorrente
        if (msg.tipo === 'recorrente' && msg.recorrencia === 'mensal') {
          const proximaData = new Date(msg.proxima_execucao);
          proximaData.setMonth(proximaData.getMonth() + 1);

          await base44.asServiceRole.entities.MensagemAgendada.update(msg.id, {
            status: 'agendada',
            ultima_execucao: new Date().toISOString(),
            proxima_execucao: proximaData.toISOString(),
          });
        } else {
          // Mensagem única: marcar como enviada
          await base44.asServiceRole.entities.MensagemAgendada.update(msg.id, {
            status: 'enviada',
            ultima_execucao: new Date().toISOString(),
          });
        }

        enviadas++;
      } catch (err) {
        console.error(`Erro ao processar msg ${msg.id}:`, err.message);
        await base44.asServiceRole.entities.MensagemAgendada.update(msg.id, {
          status: 'falha',
          erro_detalhe: err.message,
        });
        falhas++;
      }
    }

    return Response.json({
      ok: true,
      processadas: pendentes.length,
      enviadas,
      falhas,
      timestamp: agoraISO,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});