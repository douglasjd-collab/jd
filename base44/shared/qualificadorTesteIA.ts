// Compatibilidade com os dois webhooks D-API existentes.
// O coordenador escolhe um único responsável por conversa, sempre dentro do canal da conversa.
export { EMPRESA_TESTE_IA, CONEXOES_TESTE_IA, conexaoTesteIA, TELEFONES_TESTE_IA, parseIA, telefoneTesteIA,
  elegivelTesteIA, processarQualificadorTesteIA } from './agentesTesteIA.ts';