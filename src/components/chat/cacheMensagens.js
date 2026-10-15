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
  return [...porId.values()].sort((a,b) =>
    dataHistorico(a.data_envio || a.created_date) - dataHistorico(b.data_envio || b.created_date)
  );
}
