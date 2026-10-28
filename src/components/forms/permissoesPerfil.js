// Menus liberados por padrão para cada perfil com acesso fixo.
// Para o parceiro apenas "Meu Financeiro" é liberado; as demais opções ficam bloqueadas.
export const MENUS_PADRAO_PARCEIRO = ['meu_financeiro'];

export function menusPadraoDoPerfil(perfil) {
  return perfil === 'parceiro' ? [...MENUS_PADRAO_PARCEIRO] : null;
}