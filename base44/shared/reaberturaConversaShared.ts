/**
 * Reabertura automática de conversas finalizadas no Bate-Papo.
 *
 * Regra: uma NOVA mensagem enviada ao cliente — pelo celular conectado (webhook
 * D-API) ou pelo CRM (enviarMensagemWhatsapp) — reabre a conversa que estava
 * "Finalizada" (status 'encerrada'). A MESMA conversa é reaproveitada: histórico,
 * responsável e canal de WhatsApp ficam preservados, nada é duplicado, e a estrela
 * de prioridade removida na finalização NÃO volta.
 *
 * Sincronização/carregamento de mensagens ANTIGAS não reabre a conversa: quando a
 * data da mensagem é informada e ela é anterior à última mensagem registrada na
 * conversa, a reabertura é ignorada. A tolerância cobre pequenos desvios de relógio
 * entre o aparelho e o servidor.
 */
const TOLERANCIA_RELOGIO_MS = 30 * 60 * 1000;

export function novaMensagemDeveReabrir(conversa: any, dataMensagem: string | null = null): boolean {
  if (!conversa || conversa.status !== 'encerrada') return false;

  // Ação do usuário agora (envio pelo CRM): sempre é mensagem nova.
  if (!dataMensagem) return true;

  const instanteMensagem = new Date(dataMensagem).getTime();
  if (!Number.isFinite(instanteMensagem)) return false;

  const instanteUltima = conversa.data_ultima_mensagem
    ? new Date(conversa.data_ultima_mensagem).getTime()
    : NaN;
  if (!Number.isFinite(instanteUltima)) return true;

  return instanteMensagem >= instanteUltima - TOLERANCIA_RELOGIO_MS;
}