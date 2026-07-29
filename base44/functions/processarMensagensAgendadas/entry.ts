import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import {
  normalizarTelefone,
  getMetaApiVersion,
  enviarViaMetaOficial,
  enviarViaDapi,
} from '../../shared/mensagensAgendadasShared.ts';

// ─────────────────────────────────────────────────────────────────────────
// Processa UMA mensagem agendada (envia + registra + atualiza status).
// Reutilizado pela automação agendada e pela função de reenvio manual.
// ─────────────────────────────────────────────────────────────────────────
export async function processarMensagemIndividual(base44, msg): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: msg.empresa_id });
    const empresa = empresas[0];
    if (!empresa) throw new Error('Empresa não encontrada');

    let conversa = null;
    const apiPreferida = msg.api_preferida || 'dapi';
    if (apiPreferida === 'meta_oficial' && msg.conversa_id) {
      try {
        conversa = await base44.asServiceRole.entities.ConversaWhatsapp.get(msg.conversa_id);
      } catch (_) {}
    }

    const telefone = normalizarTelefone(msg.telefone || '');

    let resultado;
    if (apiPreferida === 'meta_oficial') {
      const metaApiVersion = await getMetaApiVersion(base44, msg.empresa_id);
      resultado = await enviarViaMetaOficial(base44, empresa, conversa, msg, telefone, metaApiVersion);
    } else {
      resultado = await enviarViaDapi(base44, empresa, conversa, msg, telefone);
    }

    const { messageId, tipoConteudo, provider } = resultado;

    if (msg.conversa_id) {
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
        provider: provider,
        whatsapp_message_id: messageId,
        data_envio: new Date().toISOString(),
        status: 'enviada',
      }).catch((e) => console.warn('Aviso: erro ao salvar MensagemWhatsapp:', e.message));

      await base44.asServiceRole.entities.ConversaWhatsapp.update(msg.conversa_id, {
        ultima_mensagem: msg.mensagem,
        data_ultima_mensagem: new Date().toISOString(),
        ultimo_remetente: 'vendedor',
      }).catch((e) => console.warn('Aviso: erro ao atualizar conversa:', e.message));
    }

    if (msg.tipo === 'recorrente' && msg.recorrencia === 'mensal') {
      const proximaData = new Date(msg.proxima_execucao);
      proximaData.setMonth(proximaData.getMonth() + 1);
      await base44.asServiceRole.entities.MensagemAgendada.update(msg.id, {
        status: 'agendada',
        ultima_execucao: new Date().toISOString(),
        proxima_execucao: proximaData.toISOString(),
        erro_detalhe: '',
      });
    } else {
      await base44.asServiceRole.entities.MensagemAgendada.update(msg.id, {
        status: 'enviada',
        ultima_execucao: new Date().toISOString(),
        erro_detalhe: '',
      });
    }

    return { success: true, messageId };
  } catch (err) {
    console.error(`Erro ao processar msg ${msg.id}:`, err.message);
    await base44.asServiceRole.entities.MensagemAgendada.update(msg.id, {
      status: 'falha',
      erro_detalhe: err.message,
    }).catch(() => {});
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Handler principal — automação agendada
// ─────────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const agora = new Date();
    const agoraISO = agora.toISOString();

    const todas = await base44.asServiceRole.entities.MensagemAgendada.filter(
      { status: 'agendada' },
      null,
      500
    );
    const pendentes = todas.filter((m) => m.proxima_execucao && m.proxima_execucao <= agoraISO);

    if (pendentes.length === 0) {
      return Response.json({ ok: true, processadas: 0, mensagem: 'Nenhuma mensagem pendente' });
    }

    let enviadas = 0;
    let falhas = 0;

    for (const msg of pendentes) {
      const resultado = await processarMensagemIndividual(base44, msg);
      if (resultado.success) enviadas++;
      else falhas++;
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