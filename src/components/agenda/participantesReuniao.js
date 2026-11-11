// Participantes da reunião — todos recebem o aviso no WhatsApp.
// Ordem de leitura: participantes_json (novo) → responsaveis_ids (legado)
// → usuario_id (responsável único antigo).
export function participantesDoCompromisso(comp) {
  if (!comp) return [];

  let lista = [];
  for (const bruto of [comp.participantes_json, comp.responsaveis_ids]) {
    if (!bruto) continue;
    try {
      const parsed = typeof bruto === 'string' ? JSON.parse(bruto) : bruto;
      if (Array.isArray(parsed) && parsed.length) {
        lista = parsed;
        break;
      }
    } catch {
      // formato inválido: segue para a próxima origem
    }
  }
  if (!lista.length && comp.usuario_id) {
    lista = [{ user_id: comp.usuario_id, nome: comp.usuario_nome }];
  }

  const vistos = new Set();
  return lista.reduce((acc, item) => {
    const alvo = typeof item === 'string' ? { id: item } : (item || {});
    const chave = alvo.user_id || alvo.id;
    if (!chave || vistos.has(chave)) return acc;
    vistos.add(chave);
    acc.push(alvo);
    return acc;
  }, []);
}

export function dadosDoParticipante(participante, colaboradores = []) {
  const colab = colaboradores.find(c =>
    (participante.user_id && c.user_id === participante.user_id) ||
    (participante.id && c.id === participante.id)
  );
  const telefone = String(colab?.telefone || participante.telefone || '').replace(/\D/g, '');
  return {
    nome: colab?.nome || participante.nome || 'Participante',
    telefone,
    temTelefone: telefone.length >= 10,
  };
}

export function formatarTelefone(valor = '') {
  const digits = String(valor).replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}