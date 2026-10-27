import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// ═══════════════════════════════════════════════════════════════════════════
// Autorização de WhatsApp por colaborador e por conexão.
//
// Regra central usada por todas as funções de backend e espelhada na RLS de
// ConversaWhatsapp/MensagemWhatsapp (campo whatsapp_permissoes_json do usuário):
//   - nenhuma configuração gravada  -> acesso ao comportamento anterior (livre)
//   - sem_acesso   -> nada daquela conexão
//   - atribuidas   -> somente conversas atribuídas/transferidas para ele
//   - todas        -> todas as conversas daquela conexão (nunca de outra)
//
// A conexão da conversa (connection_id) é sempre a fonte de verdade: o envio,
// o histórico, os anexos e os contadores seguem a conexão da conversa e nunca
// um seletor global.
// ═══════════════════════════════════════════════════════════════════════════

export type NivelWhatsapp = 'sem_acesso' | 'atribuidas' | 'todas';

export interface AcessoWhatsapp {
  irrestrito: boolean;
  mapa: Record<string, NivelWhatsapp>;
  conexoesPermitidas: string[];
  identidades: string[];
}

export function parseMapaPermissoes(bruto: any): Record<string, NivelWhatsapp> {
  try {
    const obj = typeof bruto === 'string' ? JSON.parse(bruto || '{}') : (bruto || {});
    if (!obj || typeof obj !== 'object') return {};
    const limpo: Record<string, NivelWhatsapp> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === 'sem_acesso' || v === 'atribuidas' || v === 'todas') limpo[k] = v;
    }
    return limpo;
  } catch (_) {
    return {};
  }
}

function parseLista(bruto: any): string[] {
  try {
    const arr = typeof bruto === 'string' ? JSON.parse(bruto || '[]') : (bruto || []);
    return Array.isArray(arr) ? arr.filter(Boolean).map(String) : [];
  } catch (_) {
    return [];
  }
}

// Identidades do usuário dentro do CRM: id de autenticação + ids de colaborador
// vinculados (as conversas guardam o responsável pelo id do Colaborador).
export async function resolverIdentidades(db: any, user: any, empresaId: string): Promise<string[]> {
  const ids = new Set<string>();
  if (user?.id) ids.add(String(user.id));
  if (user?.user_id) ids.add(String(user.user_id));
  if (user?.colaborador_id) ids.add(String(user.colaborador_id));
  try {
    const colabs = await db.Colaborador.filter({ user_id: user.id }, '-created_date', 20);
    for (const c of colabs) {
      if (!c?.id) continue;
      if (c.empresa_id && empresaId && c.empresa_id !== empresaId) continue;
      ids.add(String(c.id));
    }
  } catch (_) { /* sem colaborador vinculado */ }
  return [...ids];
}

// Carrega o nível de acesso do usuário por conexão. A fonte principal são os
// registros de PermissaoWhatsappColaborador; o mapa gravado no usuário serve de
// espelho para a RLS e como fallback quando a entidade não responde.
export async function carregarAcessoWhatsapp({ db, user, empresaId }: { db: any; user: any; empresaId: string }): Promise<AcessoWhatsapp> {
  const mapaUsuario = parseMapaPermissoes(user?.whatsapp_permissoes_json || user?.data?.whatsapp_permissoes_json);
  const identidades = await resolverIdentidades(db, user, empresaId);

  let configs: any[] = [];
  try {
    configs = await db.PermissaoWhatsappColaborador.filter(
      { empresa_id: empresaId, colaborador_user_id: user.id, ativo: true },
      '-updated_date',
      500
    );
  } catch (_) { configs = []; }

  const mapa: Record<string, NivelWhatsapp> = { ...mapaUsuario };
  for (const c of configs) {
    if (!c?.connection_id) continue;
    mapa[c.connection_id] = c.nivel_acesso;
  }

  const irrestrito = Object.keys(mapa).length === 0;
  const conexoesPermitidas = Object.entries(mapa)
    .filter(([, nivel]) => nivel !== 'sem_acesso')
    .map(([id]) => id);

  return { irrestrito, mapa, conexoesPermitidas, identidades };
}

export function nivelNaConexao(acesso: AcessoWhatsapp, connectionId?: string | null): NivelWhatsapp {
  if (acesso.irrestrito) return 'todas';
  const nivel = acesso.mapa[String(connectionId || '')];
  return nivel || 'sem_acesso';
}

// A conversa é acessível? Vale para listagem, histórico, anexos, busca,
// contadores e envio — sempre pela conexão da própria conversa.
export function podeAcessarConversa(acesso: AcessoWhatsapp, conversa: any): boolean {
  if (!conversa) return false;
  if (acesso.irrestrito) return true;

  const nivel = nivelNaConexao(acesso, conversa.connection_id);
  if (nivel === 'todas') return true;
  if (nivel !== 'atribuidas') return false;

  const meus = new Set(acesso.identidades);
  const tem = (v: any) => !!v && meus.has(String(v));

  if (tem(conversa.usuario_responsavel_id)) return true;
  // Conversa devolvida para a fila: sem responsável ativo, o acesso pontual
  // concedido por transferência não expõe mais a conversa.
  if (!conversa.responsavel_id) return false;
  if (tem(conversa.responsavel_id)) return true;
  if (tem(conversa.atendimento_transferido_para_id)) return true;
  return parseLista(conversa.acesso_pontual_user_ids_json).some(tem);
}

// Carrega a conversa com service role e valida o acesso do usuário.
// Retorna { conversa } ou { erro, status } para a função responder.
export async function carregarConversaAutorizada({ base44, user, conversaId }: { base44: any; user: any; conversaId: string }) {
  if (!conversaId) return { erro: 'conversa_id é obrigatório', status: 400 } as const;
  const conversa = await base44.asServiceRole.entities.ConversaWhatsapp.get(conversaId).catch(() => null);
  if (!conversa) return { erro: 'Conversa não encontrada', status: 404 } as const;

  const isGlobal = ['super_admin', 'master'].includes(user?.perfil || '');
  if (!isGlobal) {
    const empresaUsuario = user?.empresa_id || user?.data?.empresa_id || null;
    if (empresaUsuario && conversa.empresa_id !== empresaUsuario) {
      return { erro: 'Sem permissão para esta conversa', status: 403 } as const;
    }
    const acesso = await carregarAcessoWhatsapp({
      db: base44.asServiceRole.entities,
      user,
      empresaId: conversa.empresa_id,
    });
    if (!podeAcessarConversa(acesso, conversa)) {
      return { erro: 'Sem permissão para esta conversa', status: 403 } as const;
    }
  }

  return { conversa } as const;
}

// Responsável padrão das NOVAS conversas de uma conexão (definido na tela de
// permissões por colaborador). Sem configuração, a conversa nasce sem dono e
// segue a regra anterior.
export async function responsavelPadraoDaConexao(db: any, empresaId: string, connectionId: string) {
  try {
    const configs = await db.PermissaoWhatsappColaborador.filter(
      { empresa_id: empresaId, connection_id: connectionId, responsavel_padrao: true, ativo: true },
      '-updated_date',
      5
    );
    const cfg = configs?.[0];
    if (!cfg?.colaborador_id) return {};
    return {
      usuario_responsavel_id: cfg.colaborador_id,
      usuario_responsavel_nome: cfg.colaborador_nome || '',
      usuario_responsavel_user_id: cfg.colaborador_user_id || null,
    };
  } catch (_) {
    return {};
  }
}