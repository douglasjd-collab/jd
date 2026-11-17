export const RATING = 'rating_bancrio';
export const PLANEJAMENTO = 'planejamento_de_compra_e_credito';
export const EMPRESA_RATING = '699696c2c9f5bffc2e67402b';
export const AGENTE_RATING = 'rating_followup';
export const millis = (v: any) => { const n = Date.parse(v || ''); return Number.isFinite(n) ? n : 0; };
export const cicloRating = (o: any) => [o.etapa_id, o.data_ultima_movimentacao || o.created_date, o.rating_followup_reiniciado_em || ''].join('|');
export const atrasoRating = (a: any) => Math.max(0, Number(a.tempo_disparo) || 0) * (a.tipo_tempo === 'minutos' ? 60000 : a.tipo_tempo === 'horas' ? 3600000 : 86400000);
export function dentroJanelaRating(a: any, data: Date) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone:'America/Sao_Paulo',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(data).map(p => [p.type,p.value]));
  const atual = Number(partes.hour) * 60 + Number(partes.minute);
  const minutos = (s: string) => { const m = /^(\d{2}):(\d{2})$/.exec(s || ''); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : NaN; };
  const inicio = minutos(a.horario_envio || '08:00'), fim = minutos(a.horario_fim || '18:00');
  return Number.isFinite(inicio) && Number.isFinite(fim) && fim > inicio && atual >= inicio && atual < fim &&
    (a.dias_uteis === false || !['Sat','Sun'].includes(partes.weekday));
}
export function proximaJanelaRating(a: any, data: Date) {
  const d = new Date(data);
  for (let i = 0; i < 8 * 24 * 4; i++, d.setTime(d.getTime() + 15 * 60000)) if (dentroJanelaRating(a,d)) return d.toISOString();
  return '';
}
export function proximaAcaoRating(o: any, automacoes: any[], historico: any[]) {
  const ciclo = cicloRating(o);
  const autos = automacoes.filter(a => a.ativo && a.motor === 'rating_v1' && a.funil === RATING && a.empresa_id === o.empresa_id && a.etapa_id === o.etapa_id)
    .sort((a,b) => atrasoRating(a) - atrasoRating(b) || (a.ordem || 0) - (b.ordem || 0));
  const feitos = historico.filter(h => h.ciclo_id === ciclo && ['enviado','alerta','ignorado','cancelado','processando','erro'].includes(h.status));
  const proximo = autos.find(a => !feitos.some(h => h.automacao_id === a.id));
  if (!proximo || o.status !== 'aberta' || o.rating_followup_pausa_manual ||
      (o.rating_followup_pausado && o.rating_followup_ciclo === ciclo)) return null;
  let base = Math.max(millis(o.data_ultima_movimentacao || o.created_date), millis(o.rating_followup_reiniciado_em), millis(proximo.inicio_vigencia_em || proximo.created_date));
  let quando = base + atrasoRating(proximo);
  const anterior = autos.slice(0, autos.indexOf(proximo)).reverse().map(a => ({a, h:feitos.find(h => h.automacao_id === a.id && ['enviado','alerta'].includes(h.status))})).find(x => x.h);
  if (anterior) quando = Math.max(quando, millis(anterior.h.enviado_em) + Math.max(3600000, atrasoRating(proximo) - atrasoRating(anterior.a)));
  return { auto:proximo, ciclo, total:autos.length, tentativa:autos.indexOf(proximo)+1, data:proximaJanelaRating(proximo,new Date(quando)), base };
}
export function resolverTextoRating(texto: string, o: any) {
  return String(texto || '').replace(/\{\{primeiro_nome\}\}/g, (o.cliente_nome || o.titulo || 'cliente').split(' ')[0])
    .replace(/\{\{nome\}\}/g, o.cliente_nome || o.titulo || 'cliente')
    .replace(/\{\{vendedor\}\}/g, o.vendedor_nome || 'equipe JD Promotora')
    .replace(/\{\{etapa\}\}/g, o.etapa_nome || '')
    .replace(/\{\{pendencias\}\}/g, [o.rating_pagamento_status !== 'pago' ? 'confirmação do pagamento' : '', o.rating_documentacao !== 'completa' ? (o.rating_documentos_pendentes || 'documentação ainda pendente') : ''].filter(Boolean).join(' e ') || 'pendências em conferência com a equipe');
}
export function motivoPausaRating(o: any, a: any, conversa: any, mensagens: any[], base: number, historico: any[], agora: Date) {
  if (conversa?.bloqueado || String(conversa?.whatsapp_id || '').includes('@g.us')) return 'Conversa bloqueada ou grupo';
  if (conversa?.ia_aguardando_humano) return 'Atendimento humano solicitado';
  if (a.parar_se_responder !== false && mensagens.some(m => m.remetente === 'cliente' && millis(m.data_envio) > base)) return 'Cliente respondeu: conferir retorno ou documentos e retomar quando necessário';
  const enviados = historico.filter(h => h.status === 'enviado').map(h => h.mensagem_enviada);
  if (a.parar_se_humano !== false && (mensagens.some(m => m.remetente === 'vendedor' && m.usuario_id !== AGENTE_RATING &&
      !enviados.includes(m.texto) && !String(m.usuario_nome || '').startsWith('IA •') && millis(m.data_envio) > base && m.status !== 'erro') ||
      (conversa?.responsavel_id && !conversa?.ia_atendendo && millis(conversa.responsavel_expira_em) > agora.getTime()))) return 'Responsável assumiu o atendimento';
  if (a.condicao_rating === 'pendencias' && o.rating_pagamento_status === 'pago' && o.rating_documentacao === 'completa') return 'Pagamento e documentação confirmados: encaminhar para análise';
  if (a.condicao_rating === 'apresentacao' && o.rating_resultado_apresentado) return 'Resultado apresentado: responsável pode concluir o serviço';
  return '';
}
