// Helpers compartilhados entre as funções de link de proposta de simulação.
// Reutiliza o mesmo padrão de envio de WhatsApp da processarLembretesAgendaWhatsApp
// (conexão D-API ativa da empresa via whatsappService).

export function normalizarTelefone(telefone) {
  let numero = String(telefone || '').replace(/\D/g, '');
  if (!numero.startsWith('55') && numero.length >= 10 && numero.length <= 11) {
    numero = '55' + numero;
  }
  return numero;
}

// Envia uma notificação WhatsApp ao vendedor usando a conexão D-API ativa da empresa.
// Best-effort: lança erro se não houver conexão D-API (o chamador decide se ignora).
export async function enviarWhatsAppVendedor(base44, empresaId, telefone, mensagem) {
  if (!telefone) throw new Error('Telefone do vendedor não informado');
  const conexoes = await base44.asServiceRole.entities.WhatsappConnection.filter(
    { empresa_id: empresaId, provider_type: 'dapi', is_active: true },
    '-created_date',
    1
  );
  const conexao = conexoes?.[0];
  if (!conexao) throw new Error('Nenhuma conexão D-API ativa para esta empresa');
  const numero = normalizarTelefone(telefone);
  return await base44.functions.invoke('whatsappService', {
    connectionId: conexao.id,
    action: 'sendText',
    phoneNumber: numero,
    text: mensagem
  });
}