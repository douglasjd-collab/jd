// Chamadas de voz recebidas na sessão D-API (eventos call.offer / call.ended / call.rejected).
//
// O popup de chamada recebida do CRM escuta a entidade ChamadaVozWhatsapp em tempo real
// (evento de criação). Sem este registro a ligação só toca no celular e o CRM não sabe dela.
// Compartilhado entre os webhooks da D-API (webhookDapi e receberWebhookDapi).

function entidades(base44: any) {
  return base44?.asServiceRole?.entities || base44?.entities;
}

// Extrai telefone e callId dos formatos possíveis do payload da D-API.
function extrairDadosChamada(data: any) {
  const fromRaw = data?.from?.jid || data?.from || data?.peerJid || data?.callerPn || data?.callerJid || '';
  const telefone = String(fromRaw).replace(/@.*/g, '').replace(/\D/g, '');
  const callId = data?.callId || data?.call_id || data?.id || data?.call?.id || null;
  return { telefone, callId: callId ? String(callId) : null };
}

/**
 * Registra a oferta de chamada: cria o registro em ChamadaVozWhatsapp (popup do CRM)
 * e a linha "📞 Chamada de voz recebida" no histórico da conversa.
 */
export async function registrarChamadaRecebidaDapi(base44: any, connection: any, data: any) {
  try {
    if (!connection) return { handled: false, reason: 'connection not found' };
    if (data?.isGroup === true || String(data?.from?.jid || data?.from || '').includes('@g.us')) {
      return { handled: false, reason: 'chamada de grupo' };
    }

    const { telefone, callId } = extrairDadosChamada(data);
    if (!telefone || !callId) {
      console.error('❌ [Chamada D-API] call.offer sem telefone ou callId');
      return { handled: false, reason: 'sem telefone ou callId' };
    }

    const empresaId = connection.empresa_id;
    const db = entidades(base44);

    // Webhook pode ser reenviado pela D-API — não duplicar a mesma chamada.
    const existentes = await db.ChamadaVozWhatsapp.filter(
      { empresa_id: empresaId, call_id: callId },
      '-created_date',
      1
    );
    if (existentes && existentes.length > 0) {
      return { handled: true, duplicate: true, callId, conversaId: existentes[0].conversa_id };
    }

    const timestamp = new Date().toISOString();
    const conversas = await db.ConversaWhatsapp.filter(
      { empresa_id: empresaId, cliente_telefone: telefone },
      '-created_date',
      1
    );

    let conversa = conversas?.[0];
    if (!conversa) {
      conversa = await db.ConversaWhatsapp.create({
        empresa_id: empresaId,
        cliente_telefone: telefone,
        cliente_nome: data?.from?.name || telefone,
        whatsapp_id: data?.from?.jid || `${telefone}@s.whatsapp.net`,
        provider: 'dapi',
        canal_origem: 'dapi',
        tipo_conexao: 'usuario',
        connection_id: connection.id,
        instancia: connection.session_id,
        status: 'ativa',
        ultima_mensagem: '',
        data_ultima_mensagem: timestamp,
        ultimo_remetente: 'cliente',
      });
    }

    const textoChamada = '📞 Chamada de voz recebida';

    await db.MensagemWhatsapp.create({
      empresa_id: empresaId,
      conversa_id: conversa.id,
      remetente: 'cliente',
      tipo_conteudo: 'texto',
      texto: textoChamada,
      provider: 'dapi',
      whatsapp_message_id: `call_${callId}`,
      data_envio: timestamp,
      status: 'entregue',
    });

    await db.ConversaWhatsapp.update(conversa.id, {
      ultima_mensagem: textoChamada,
      data_ultima_mensagem: timestamp,
      ultimo_remetente: 'cliente',
      cliente_respondeu: true,
    });

    await db.ChamadaVozWhatsapp.create({
      empresa_id: empresaId,
      conversa_id: conversa.id,
      connection_id: connection.id,
      call_id: callId,
      cliente_telefone: telefone,
      cliente_nome: conversa.cliente_nome || telefone,
      status: 'recebida',
    });

    console.log('✅ [Chamada D-API] Chamada de voz registrada:', { callId, conversaId: conversa.id });
    return { handled: true, callId, conversaId: conversa.id };
  } catch (error: any) {
    console.error('❌ [Chamada D-API] Erro ao registrar chamada:', error?.message);
    return { handled: false, error: error?.message };
  }
}

/**
 * Encerra a oferta de chamada (atendida, recusada ou perdida) para o popup não
 * continuar aparecendo como disponível.
 */
export async function finalizarChamadaDapi(base44: any, connection: any, data: any) {
  try {
    if (!connection) return { handled: false, reason: 'connection not found' };
    const { callId } = extrairDadosChamada(data);
    if (!callId) return { handled: false, reason: 'sem callId' };

    const db = entidades(base44);
    await db.ChamadaVozWhatsapp.updateMany(
      { empresa_id: connection.empresa_id, call_id: callId, status: 'recebida' },
      { $set: { status: 'visualizada' } }
    );
    return { handled: true, callId };
  } catch (error: any) {
    console.error('❌ [Chamada D-API] Erro ao finalizar chamada:', error?.message);
    return { handled: false, error: error?.message };
  }
}