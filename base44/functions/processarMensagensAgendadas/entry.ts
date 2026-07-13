import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const agora = new Date();
    const agoraISO = agora.toISOString();

    const todas = await base44.asServiceRole.entities.MensagemAgendada.filter({ status: 'agendada' }, null, 500);
    const pendentes = todas.filter(m => m.proxima_execucao && m.proxima_execucao <= agoraISO);

    if (pendentes.length === 0) {
      return Response.json({ ok: true, processadas: 0, mensagem: 'Nenhuma mensagem pendente' });
    }

    let enviadas = 0;
    let falhas = 0;

    for (const msg of pendentes) {
      try {
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

        // Por padrão, envio agendado deve usar D-API — buscar conexão D-API ativa da empresa
        const conexoesDapi = await base44.asServiceRole.entities.WhatsappConnection.filter({
          empresa_id: msg.empresa_id,
          provider_type: 'dapi',
          is_active: true,
        }, '-created_date', 1);
        const conexaoDapi = conexoesDapi[0];

        if (!conexaoDapi) {
          await base44.asServiceRole.entities.MensagemAgendada.update(msg.id, {
            status: 'falha',
            erro_detalhe: 'Nenhuma conexão D-API ativa encontrada para a empresa',
          });
          falhas++;
          continue;
        }

        // Formatar número — D-API espera apenas dígitos com DDI
        let telefone = (msg.telefone || '').replace(/\D/g, '');
        if (!telefone.startsWith('55') && telefone.length >= 10 && telefone.length <= 11) telefone = '55' + telefone;

        const tipoEnvio = msg.tipo_envio || 'texto';
        let tipoConteudo = 'texto';
        let dapiAction = 'sendText';
        let dapiActionParams = {};

        if (tipoEnvio === 'texto_imagem' && msg.arquivo_url) {
          dapiAction = 'sendImage';
          dapiActionParams = { imageUrl: msg.arquivo_url, caption: msg.mensagem };
          tipoConteudo = 'imagem';
        } else if (tipoEnvio === 'texto_video' && msg.arquivo_url) {
          dapiAction = 'sendVideo';
          dapiActionParams = { videoUrl: msg.arquivo_url, caption: msg.mensagem };
          tipoConteudo = 'video';
        } else {
          dapiAction = 'sendText';
          tipoConteudo = 'texto';
        }

        const respService = await base44.asServiceRole.functions.invoke('whatsappService', {
          connectionId: conexaoDapi.id,
          action: dapiAction,
          phoneNumber: telefone,
          text: msg.mensagem,
          ...dapiActionParams,
        });

        const serviceResult = respService?.data;
        if (!serviceResult?.success) {
          const erroDetalhes = serviceResult?.data?.error || serviceResult?.error || 'Erro desconhecido';
          throw new Error(`D-API error: ${erroDetalhes}`);
        }

        const whatsappMsgId = serviceResult?.data?.data?.messageId || serviceResult?.data?.messageId || '';

        // Registrar mensagem no histórico
        await base44.asServiceRole.entities.MensagemWhatsapp.create({
          conversa_id: msg.conversa_id,
          empresa_id: msg.empresa_id,
          remetente: 'vendedor',
          usuario_id: msg.responsavel_id || '',
          usuario_nome: msg.responsavel_nome || 'Agendamento automático',
          tipo_conteudo: tipoConteudo,
          texto: msg.mensagem,
          arquivo_url: msg.arquivo_url || '',
          arquivo_nome: msg.arquivo_nome || '',
          provider: 'dapi',
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

        // Recorrente: reagendar para o próximo mês
        if (msg.tipo === 'recorrente' && msg.recorrencia === 'mensal') {
          const proximaData = new Date(msg.proxima_execucao);
          proximaData.setMonth(proximaData.getMonth() + 1);

          await base44.asServiceRole.entities.MensagemAgendada.update(msg.id, {
            status: 'agendada',
            ultima_execucao: new Date().toISOString(),
            proxima_execucao: proximaData.toISOString(),
          });
        } else {
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

    return Response.json({ ok: true, processadas: pendentes.length, enviadas, falhas, timestamp: agoraISO });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});