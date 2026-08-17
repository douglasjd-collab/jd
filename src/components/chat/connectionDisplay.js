// Helpers visuais para o seletor de conexão no Bate-Papo.
//
// IMPORTANTE: estas funções afetam APENAS a camada de exibição (label, emoji,
// cor do badge). NÃO alteram IDs de sessão, UUIDs, nomes técnicos salvos no
// banco, webhooks, tokens, rotas de envio, Phone Number ID, WABA ID ou a
// estrutura da integração. Toda a lógica que escolhe a conexão de envio
// permanece no backend (enviarMensagemWhatsapp).

// Cloud API D-API oficial: session_id começa com "cloud" ou nome contém "oficial".
// Conexões "meta_oficial" também aparecem como API Oficial.
export function isConnectionOficial(c) {
  if (!c) return false;
  const providerType = String(c.provider_type || '');
  if (providerType === 'meta_oficial') return true;
  if (providerType === 'dapi') {
    const sid = String(c.session_id || '').toLowerCase();
    const nome = String(c.nome || '').toLowerCase();
    return sid.startsWith('cloud') || nome.includes('oficial');
  }
  return false;
}

// A alternativa "D-API – Douglas | JD Promotora" aceita somente D-API
// não oficial. Evolution foi removida integralmente do Bate-papo.
export function isConnectionDapiAlternative(c) {
  if (!c) return false;
  if (isConnectionOficial(c)) return false;
  return String(c.provider_type || '') === 'dapi';
}

// Nome amigável exibido no badge do topo e nos itens do dropdown.
export function displayConnectionName(c) {
  if (!c) return '';
  if (isConnectionOficial(c)) return 'API Oficial';
  if (isConnectionDapiAlternative(c)) {
    const nome = String(c.nome || c.session_id || 'D-API');
    return `D-API – ${nome.replace('Douglas | ', '').trim() || nome}`;
  }
  return c.nome || c.session_id || '';
}

// Emoji visual ao lado do item no dropdown (só exibição).
export function connectionLabelEmoji(c) {
  if (!c) return '⬜';
  if (isConnectionOficial(c)) return '🟢';
  if (String(c.provider_type || '') === 'dapi') return '🟦';
  return '⬜';
}