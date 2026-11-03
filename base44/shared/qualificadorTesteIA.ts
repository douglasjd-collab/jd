// Compatibilidade com os dois webhooks D-API existentes.
// O coordenador escolhe um único responsável por conversa.
export { EMPRESA_TESTE_IA, CONEXAO_TESTE_IA, TELEFONES_TESTE_IA, parseIA, telefoneTesteIA,
  elegivelTesteIA, processarQualificadorTesteIA } from './agentesTesteIA.ts';
