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
//
// Garante:
//  - Lock contra processamento duplicado (status → 'processando' antes do envio);
//  - Canal fixo: usa api_preferida/official_connection_id salvos no agendamento,
//    independentemente do canal atualmente selecionado na conversa;
//  - Texto final resolvido ({{1}} → primeiro nome atual do cliente) no histórico.
// ─────────────────────────────────────────────────────────────────────────
export async function processarMensagemIndividual(base44, msg): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // 1) Lock atômico: só processa se status === 'agendada'. Troca para
  //    'processando' para impedir disparo duplicado caso a automação rode
  //    duas vezes no mesmo horário. Se já está em 'processando', pula.
  try {
    const atual = await base44.asServiceRole.entities.MensagemAgendada.get(msg.id);
    if (atual && atual.status !== 'agendada') {
      return { success: false, error: `Status atual ${atual.status} — não é 'agendada'` };
    }
  } catch (e) {
    // Se não conseguir fazer o get, segue com o objeto recebido.
  }
  try {
    await base44.asServiceRole.entities.MensagemAgendada.update(msg.id, {
      status: 'processando',
      erro_detalhe: '',
    });
  } catch (_) {}

  try {
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: msg.empresa_id });
    const empresa = empresas[0];
    if (!empresa) throw new Error('Empresa não encontrada');

    let conversa = null;
    const apiPreferida = msg.api_preferida || 'dapi';
    // Sempre carregamos a conversa (mesmo D-API) para atualizar canal/última
    // mensagem e garantir exibição correta no Bate-papo, com ou sem tela aberta.
    if (msg.conversa_id) {
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

    const { messageId, tipoConteudo, provider, textoResolvido, conexaoId, phoneNumberId } = resultado;
    const textoParaHistorico = textoResolvido || msg.mensagem || '';

    // Quando o template tem header de MÍDIA (VIDEO/IMAGE/DOCUMENT) com URL
    // pública, salvamos o histórico como JSON rico ({__template: true, ...})
    // para o MensagemItem do Bate-papo renderizar o vídeo/imagem do cabeçalho
    // EXATAMENTE como o cliente recebe no WhatsApp (vide parseTemplateMsg).
    const ti = (resultado as any).templateInfo;
    const ehTemplateRico =
      !!ti &&
      ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(ti.header_type) &&
      !!ti.header_url;
    const textoHistoricoFinal = ehTemplateRico ? JSON.stringify(ti) : textoParaHistorico;

    // 2) Histórico da conversa: usa o texto resolvido ({{1}} → primeiro nome)
    //    para o usuário ver exatamente o que foi enviado, sem duplicar.
    if (msg.conversa_id) {
      await base44.asServiceRole.entities.MensagemWhatsapp.create({
        conversa_id: msg.conversa_id,
        empresa_id: msg.empresa_id,
        remetente: 'vendedor',
        usuario_id: msg.responsavel_id || '',
        usuario_nome: msg.responsavel_nome || 'Agendamento automático',
        tipo_conteudo: ehTemplateRico ? 'texto' : tipoConteudo,
        texto: textoHistoricoFinal,
        arquivo_url: ehTemplateRico ? ti.header_url : (msg.arquivo_url || ''),
        arquivo_nome: msg.arquivo_nome || '',
        arquivo_tamanho: 0,
        provider: provider,
        download_status: 'nao_aplicavel',
        whatsapp_message_id: messageId,
        data_envio: new Date().toISOString(),
        status: 'enviada',
      }).catch((e) => console.warn('Aviso: erro ao salvar MensagemWhatsapp:', e.message));

      // 3) Atualiza a conversa para refletir o canal efetivamente usado no
      //    disparo (independente do canal que estava selecionado na tela).
      //    Para Meta template, marca API Oficial; para D-API, mantém/dapi.
      //    A prévia da última mensagem usa o corpo (texto resolvido) — o
      //    vídeo do header aparece na bolha do chat, não na listagem.
      const atualizacaoConversa: any = {
        ultima_mensagem: textoParaHistorico.substring(0, 200),
        data_ultima_mensagem: new Date().toISOString(),
        ultimo_remetente: 'vendedor',
      };
      if (apiPreferida === 'meta_oficial') {
        atualizacaoConversa.tipo_conexao = 'meta_oficial';
        atualizacaoConversa.canal_origem = 'meta';
        atualizacaoConversa.provider = 'whatsapp_meta';
        atualizacaoConversa.last_inbound_provider = 'whatsapp_meta';
        if (phoneNumberId) atualizacaoConversa.phone_number_id_meta = phoneNumberId;
        if (conexaoId) atualizacaoConversa.connection_id = conexaoId;
      } else {
        atualizacaoConversa.tipo_conexao = 'empresa';
        atualizacaoConversa.canal_origem = 'dapi';
        atualizacaoConversa.provider = 'dapi';
        if (conexaoId) atualizacaoConversa.connection_id = conexaoId;
      }
      await base44.asServiceRole.entities.ConversaWhatsapp.update(msg.conversa_id, atualizacaoConversa)
        .catch((e) => console.warn('Aviso: erro ao atualizar conversa:', e.message));
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