export function camposAtendimentoIA(agente: any) {
  let d: any = {};
  try { d = JSON.parse(agente?.dados_json || '{}'); } catch {}
  const ativo = Boolean(agente && d.ativo === true);
  return { ia_atendendo: ativo, ia_agente_id: ativo ? agente.id : '',
    ia_agente_nome: ativo ? String(d.nome_atendimento || agente.titulo || 'Atendimento JD').trim().slice(0, 80) : '',
    ia_agente_papel: ativo ? String(d.papel || '') : '', ia_atualizado_em: new Date().toISOString() };
}
export async function sincronizarEtiquetaIA(db: any, agente: any) {
  const conversas = await db.ConversaWhatsapp.filter({ empresa_id: agente.empresa_id, ia_agente_id: agente.id, ia_atendendo: true }, '-updated_date', 20);
  for (const c of conversas) await db.ConversaWhatsapp.update(c.id, camposAtendimentoIA(agente));
}
