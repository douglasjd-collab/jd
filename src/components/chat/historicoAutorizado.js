import { base44 } from '@/api/base44Client';

// Usuários com permissão restrita no WhatsApp não podem ler MensagemWhatsapp
// direto (a RLS nega). Para eles o histórico vem pela rota autorizada do
// backend, que valida a conversa e a conexão antes de devolver as mensagens.
export function usuarioRestritoWhatsapp(user) {
  if (!user) return false;
  if (user.whatsapp_restrito === true) return true;
  try {
    const mapa = JSON.parse(user.whatsapp_permissoes_json || '{}') || {};
    return Object.keys(mapa).length > 0;
  } catch (_) {
    return false;
  }
}

export async function carregarMensagensConversa({ user, conversaId, limite = 200, desde } = {}) {
  if (!conversaId) return [];

  if (usuarioRestritoWhatsapp(user)) {
    const resp = await base44.functions.invoke('buscarHistoricoConversa', {
      conversa_id: conversaId,
      limite,
      ...(desde ? { desde } : {}),
    });
    return resp?.data?.mensagens || [];
  }

  const filtro = desde
    ? { conversa_id: conversaId, updated_date: { $gte: desde } }
    : { conversa_id: conversaId };
  const msgs = await base44.entities.MensagemWhatsapp.filter(
    filtro,
    desde ? '-updated_date' : '-data_envio',
    limite
  );
  return msgs || [];
}