import { dataHistorico } from './dataHistorico';
// Mescla por ID sem apagar histórico nem regredir recibos atualizados em tempo real.
export function mesclarHistoricoMensagens(anteriores = [], novas = []) {
  const prioridade = {pendente: 0, enviada: 1, entregue: 2, lida: 3};
  const porId = new Map(anteriores.map(m => [m.id, m]));
  for (const msg of novas) {
    const anterior = porId.get(msg.id);
    const status = anterior && (prioridade[anterior.status] ?? -1) > (prioridade[msg.status] ?? -1)
      ? anterior.status : msg.status;
    const confirmado = !/^(tmp_|temp_)/.test(msg.id || '') &&
      ['enviada', 'entregue', 'lida'].includes(status);
    porId.set(msg.id, {...anterior, ...msg, status,
      ...(confirmado ? {
        fila_envio_estado: null, fila_envio_progresso: null, fila_envio_erro: null,
      } : {}),
    });
  }
  // Eco do webhook e resposta HTTP podem criar registros diferentes para o
  // mesmo envio. Somente o ID do WhatsApp é usado, nunca texto/horário.
  const unicas = new Map();
  for (const msg of porId.values()) {
    const key = msg.whatsapp_message_id
      ? JSON.stringify([msg.conversa_id, msg.remetente, msg.whatsapp_message_id])
      : msg.id;
    const anterior = unicas.get(key);
    if (!anterior) { unicas.set(key, msg); continue; }
    const status = (prioridade[anterior.status] ?? -1) > (prioridade[msg.status] ?? -1)
      ? anterior.status : msg.status;
    const preferida = msg.usuario_id || msg.usuario_nome ? msg : anterior;
    unicas.set(key, {...anterior, ...msg, ...preferida, status,
      arquivo_url: preferida.arquivo_url || msg.arquivo_url || anterior.arquivo_url,
      fila_envio_estado: null, fila_envio_progresso: null, fila_envio_erro: null,
    });
  }
  return [...unicas.values()].sort((a,b) =>
    dataHistorico(a.data_envio || a.created_date) - dataHistorico(b.data_envio || b.created_date)
  );
}
