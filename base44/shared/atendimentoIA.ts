import { EMPRESA_TESTE_IA, conexaoTesteIA, telefoneTesteIA } from './escopoTesteIA.ts';
// Enquanto a IA atende, ela é a responsável exibida: "Gabriel IA", "Lucas IA" ou "Heitor IA".
export function nomeResponsavelIA(agente: any): string {
  let d: any = {};
  try { d = JSON.parse(agente?.dados_json || '{}'); } catch {}
  const nome = String(d.nome_atendimento || agente?.titulo || '').trim().slice(0, 76);
  if (!nome) return 'IA';
  return /\bIA$/i.test(nome) ? nome : nome + ' IA';
}
export function camposAtendimentoIA(agente: any) {
  let d: any = {};
  try { d = JSON.parse(agente?.dados_json || '{}'); } catch {}
  const ativo = Boolean(agente && d.ativo === true);
  return { ...(ativo ? { ia_aguardando_humano:false, ia_motivo_handoff:'', responsavel_nome: nomeResponsavelIA(agente) } : {}),
    ia_atendendo: ativo, ia_agente_id: ativo ? agente.id : '',
    ia_agente_nome: ativo ? String(d.nome_atendimento || agente.titulo || 'Atendimento JD').trim().slice(0, 80) : '',
    ia_agente_papel: ativo ? String(d.papel || '') : '', ia_atualizado_em: new Date().toISOString() };
}
// Marca apenas a reabertura por uma nova mensagem do contato de teste.
export function camposReaberturaIA(conversa: any, conexao: any, recebidoEm: any) {
  if (conversa?.empresa_id !== EMPRESA_TESTE_IA ||
      !conexaoTesteIA(conexao?.id) || conversa?.connection_id !== conexao?.id ||
      !telefoneTesteIA(conversa?.cliente_telefone)) return {};
  const quando = new Date(recebidoEm || Date.now());
  return { ia_sessao_id: crypto.randomUUID(), ia_sessao_inicio_em: Number.isFinite(quando.getTime()) ? quando.toISOString() : new Date().toISOString(),
    ...camposAtendimentoIA(null), ia_aguardando_humano:false, ia_motivo_handoff:'' };
}
export async function sincronizarEtiquetaIA(db: any, agente: any) {
  const conversas = await db.ConversaWhatsapp.filter({ empresa_id: agente.empresa_id, ia_agente_id: agente.id, ia_atendendo: true }, '-updated_date', 20);
  for (const c of conversas) await db.ConversaWhatsapp.update(c.id, camposAtendimentoIA(agente));
}