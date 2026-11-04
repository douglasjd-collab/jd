// Escopo único dos contatos autorizados; não depende do coordenador nem dos webhooks.
export const EMPRESA_TESTE_IA = '699696c2c9f5bffc2e67402b';
export const CONEXAO_TESTE_IA = '6a406c5e86664cdaac6f95cb';
export const TELEFONES_TESTE_IA = ['558781184956', '5587981184956', '5587991527083', '558791527083'];
export function telefoneCanonicoTesteIA(valor: any): string | null {
 const numero = String(valor || '').replace(/\D/g, '');
 if (['558781184956', '5587981184956'].includes(numero)) return '5587981184956';
 if (['5587991527083', '558791527083'].includes(numero)) return '5587991527083';
 return null;
}
// O novo contato só participa a partir desta liberação; não reprocessa conversas antigas.
export function inicioTesteContatoIA(valor: any, ativadoEm: string): string {
 const inicio = Date.parse(ativadoEm);
 if (telefoneCanonicoTesteIA(valor) !== '5587991527083' || !Number.isFinite(inicio)) return ativadoEm;
 return new Date(Math.max(inicio, Date.parse('2026-11-04T03:50:23.944Z'))).toISOString();
}
export const telefoneTesteIA = (valor: any) => telefoneCanonicoTesteIA(valor) !== null;
export function origemMemoriaTesteIA(valor: any): string {
 const numero = telefoneCanonicoTesteIA(valor);
 if (!numero) throw new Error('Contato fora do teste autorizado');
 // Preserva integralmente a memória histórica da Eduarda.
 return numero === '5587981184956' ? 'teste-eduarda:' + CONEXAO_TESTE_IA
  : 'teste-contato:' + CONEXAO_TESTE_IA + ':' + numero;
}
export const ORIGENS_MEMORIA_TESTE_IA = [...new Set(TELEFONES_TESTE_IA.map(origemMemoriaTesteIA))];
