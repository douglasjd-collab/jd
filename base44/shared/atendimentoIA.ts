export function camposAtendimentoIA(agente: any) {
  let d: any = {};
  try { d = JSON.parse(agente?.dados_json || '{}'); } catch {}
  const ativo = Boolean(agente && d.ativo === true);
  return { ...(ativo ? { ia_aguardando_humano:false, ia_motivo_handoff:'' } : {}), ia_atendendo: ativo, ia_agente_id: ativo ? agente.id : '',
    ia_agente_nome: ativo ? String(d.nome_atendimento || agente.titulo || 'Atendimento JD').trim().slice(0, 80) : '',
    ia_agente_papel: ativo ? String(d.papel || '') : '', ia_atualizado_em: new Date().toISOString() };
}
// Marca apenas a reabertura por uma nova mensagem do contato de teste.
export function camposReaberturaIA(conversa: any, conexao: any, recebidoEm: any) {
  if (conversa?.empresa_id !== '699696c2c9f5bffc2e67402b' ||
      conexao?.id !== '6a406c5e86664cdaac6f95cb' ||
      !['558781184956','5587981184956'].includes(String(conversa?.cliente_telefone || '').replace(/\D/g,''))) return {};
  const quando = new Date(recebidoEm || Date.now());
  return { ia_sessao_id: crypto.randomUUID(), ia_sessao_inicio_em: Number.isFinite(quando.getTime()) ? quando.toISOString() : new Date().toISOString(),
    ...camposAtendimentoIA(null), ia_aguardando_humano:false, ia_motivo_handoff:'' };
}
export async function sincronizarEtiquetaIA(db: any, agente: any) {
  const conversas = await db.ConversaWhatsapp.filter({ empresa_id: agente.empresa_id, ia_agente_id: agente.id, ia_atendendo: true }, '-updated_date', 20);
  for (const c of conversas) await db.ConversaWhatsapp.update(c.id, camposAtendimentoIA(agente));
}
