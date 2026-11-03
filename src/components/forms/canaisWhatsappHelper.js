// Regras de exibição e gravação dos canais de WhatsApp liberados para um usuário.
//
// Um colaborador sem nenhum registro de permissão acessa TODOS os canais
// (irrestrito). A partir do primeiro bloqueio, cada canal passa a precisar de um
// registro explícito — um canal sem registro é tratado como bloqueado. Por isso,
// ao sair do modo irrestrito, gravamos todos os canais de uma vez.

export const nivelEfetivo = (mapa, conexaoId, irrestrito) =>
  mapa?.[conexaoId] || (irrestrito ? 'todas' : 'sem_acesso');

export function montarPlano({ conexoes = [], mapa = {}, alvoId, ativo }) {
  const irrestrito = Object.keys(mapa || {}).length === 0;
  const desejado = {};

  conexoes.forEach((c) => {
    const atual = nivelEfetivo(mapa, c.id, irrestrito);
    if (c.id !== alvoId) {
      desejado[c.id] = atual;
      return;
    }
    desejado[c.id] = ativo ? (atual === 'sem_acesso' ? 'todas' : atual) : 'sem_acesso';
  });

  const plano = conexoes
    .filter((c) => irrestrito || desejado[c.id] !== nivelEfetivo(mapa, c.id, false))
    .map((c) => ({ connection_id: c.id, nivel_acesso: desejado[c.id] }));

  return { desejado, plano };
}

export const rotuloNivel = (nivel) => {
  if (nivel === 'todas') return 'Todas as conversas';
  if (nivel === 'atribuidas') return 'Somente atribuídas';
  return 'Bloqueado';
};