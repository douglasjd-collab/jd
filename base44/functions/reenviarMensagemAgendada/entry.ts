import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import {
  normalizarTelefone,
  getMetaApiVersion,
  enviarViaMetaOficial,
  enviarViaDapi,
} from '../../shared/mensagensAgendadasShared.ts';

// Reenvio manual de uma mensagem agendada com falha.
// Reexecuta o envio pela mesma integração oficial (Cloud API / Graph API direta)
// SEM criar novo agendamento e SEM duplicar MensagemWhatsapp no histórico.
//
// Payload: { mensagem_id: "<id da MensagemAgendada>" }
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { mensagem_id } = body;
    if (!mensagem_id) {
      return Response.json({ error: 'mensagem_id é obrigatório' }, { status: 400 });
    }

    let msg: any;
    try {
      msg = await base44.entities.MensagemAgendada.get(mensagem_id);
    } catch (e) {
      return Response.json({ error: 'Agendamento não encontrado: ' + e.message }, { status: 404 });
    }

    // Marca novamente como "agendada" para indicar que está em processamento
    await base44.asServiceRole.entities.MensagemAgendada.update(mensagem_id, {
      status: 'agendada',
      erro_detalhe: '',
    });

    const apiPreferida = msg.api_preferida || 'dapi';

    try {
      let conversa = null;
      if (apiPreferida === 'meta_oficial' && msg.conversa_id) {
        try {
          conversa = await base44.asServiceRole.entities.ConversaWhatsapp.get(msg.conversa_id);
        } catch (_) {}
      }

      const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: msg.empresa_id });
      const empresa = empresas[0];
      if (!empresa) throw new Error('Empresa não encontrada');

      const telefone = normalizarTelefone(msg.telefone || '');
      let resultado;
      if (apiPreferida === 'meta_oficial') {
        const metaApiVersion = await getMetaApiVersion(base44, msg.empresa_id);
        resultado = await enviarViaMetaOficial(base44, empresa, conversa, msg, telefone, metaApiVersion);
      } else {
        resultado = await enviarViaDapi(base44, empresa, conversa, msg, telefone);
      }

      const { messageId, tipoConteudo, provider } = resultado;

      // Registra no histórico da conversa uma ÚNICA mensagem (envio efetivo).
      if (msg.conversa_id) {
        try {
          await base44.asServiceRole.entities.MensagemWhatsapp.create({
            conversa_id: msg.conversa_id,
            empresa_id: msg.empresa_id,
            remetente: 'vendedor',
            usuario_id: user.id,
            usuario_nome: user.full_name || msg.responsavel_nome || '',
            tipo_conteudo: tipoConteudo,
            texto: msg.mensagem,
            arquivo_url: msg.arquivo_url || '',
            arquivo_nome: msg.arquivo_nome || '',
            provider: provider,
            whatsapp_message_id: messageId,
            data_envio: new Date().toISOString(),
            status: 'enviada',
          });

          await base44.asServiceRole.entities.ConversaWhatsapp.update(msg.conversa_id, {
            ultima_mensagem: msg.mensagem,
            data_ultima_mensagem: new Date().toISOString(),
            ultimo_remetente: 'vendedor',
          });
        } catch (dbErr) {
          console.warn('Aviso: erro ao salvar mensagem no histórico do reenvio:', dbErr.message);
        }
      }

      await base44.asServiceRole.entities.MensagemAgendada.update(mensagem_id, {
        status: 'enviada',
        ultima_execucao: new Date().toISOString(),
        erro_detalhe: '',
      });

      return Response.json({
        success: true,
        mensagem_id,
        message_id: messageId,
        provider: provider,
      });
    } catch (err) {
      // Falhou novamente — preserva como 'falha' com erro atualizado, sem duplicar
      await base44.asServiceRole.entities.MensagemAgendada.update(mensagem_id, {
        status: 'falha',
        erro_detalhe: err.message,
      });
      return Response.json(
        { success: false, mensagem_id, error: err.message },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('❌ reenviarMensagemAgendada erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});