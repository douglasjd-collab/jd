/**
 * Mensagens técnicas ficam registradas no histórico mas não viram balão próprio
 * no chat. É o caso do texto que acompanha um PDF: a D-API não aceita legenda em
 * documentos, então o texto é enviado em separado, porém já aparece dentro do
 * balão do arquivo — exibi-lo de novo duplicaria a mensagem na tela.
 */
export const filtrarMensagensVisiveis = (mensagens = []) => mensagens.filter(m => !m?.mensagem_tecnica);