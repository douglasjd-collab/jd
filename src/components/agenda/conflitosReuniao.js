import { participantesDoCompromisso } from './participantesReuniao';

export function conflitosReuniao(compromissos, inicio, fim, participantes, ignorarId = null) {
  const comeco = new Date(inicio).getTime();
  const termino = fim ? new Date(fim).getTime() : comeco + 60 * 60 * 1000;
  if (!Number.isFinite(comeco) || !Number.isFinite(termino)) return [];
  const chaves = new Set(participantes.flatMap(p => [p.user_id, p.id].filter(Boolean)));
  if (!chaves.size) return [];
  return compromissos.filter(c => {
    if (c.id === ignorarId || ['cancelado', 'concluido'].includes(c.status)) return false;
    const a = new Date(c.inicio).getTime();
    const b = c.fim ? new Date(c.fim).getTime() : a + 60 * 60 * 1000;
    if (!(comeco < b && termino > a)) return false;
    return participantesDoCompromisso(c).some(p => chaves.has(p.user_id) || chaves.has(p.id));
  });
}
