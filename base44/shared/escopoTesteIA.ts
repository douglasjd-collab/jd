// Escopo único dos contatos autorizados; não depende do coordenador nem dos webhooks.
export const EMPRESA_TESTE_IA = '699696c2c9f5bffc2e67402b';
// Instâncias D-API do teste: Douglas, Comercial e a conexão principal J D Promotora (98119-4149).
export const CONEXOES_TESTE_IA = ['6afe4455f2b7e0a226ee5c6e', '6afe44544bd3d55e63407c54', '6afe4455300e325d0579fdd4'];
export const TELEFONES_TESTE_IA = ['558781184956', '5587981184956', '5587991527083', '558791527083', '558781275628'];
export const conexaoTesteIA = (valor: any): boolean => CONEXOES_TESTE_IA.includes(String(valor || ''));
export function telefoneCanonicoTesteIA(valor: any): string | null {
 const numero = String(valor || '').replace(/\D/g, '');
 if (['558781184956', '5587981184956'].includes(numero)) return '5587981184956';
 if (['5587991527083', '558791527083'].includes(numero)) return '5587991527083';
 if (numero === '558781275628') return '558781275628';
 return null;
}
// Contatos liberados depois do início do teste só participam a partir da liberação.
const INICIO_POR_CONTATO: Record<string, string> = {
 '5587991527083': '2026-11-04T03:50:23.944Z',
 '558781275628': '2026-11-19T02:25:00.000Z',
};
export function inicioTesteContatoIA(valor: any, ativadoEm: string): string {
 const inicio = Date.parse(ativadoEm);
 const piso = INICIO_POR_CONTATO[telefoneCanonicoTesteIA(valor) || ''];
 if (!piso || !Number.isFinite(inicio)) return ativadoEm;
 return new Date(Math.max(inicio, Date.parse(piso))).toISOString();
}
export const telefoneTesteIA = (valor: any) => telefoneCanonicoTesteIA(valor) !== null;
// Memória sempre vinculada ao canal e ao contato: nenhum resumo atravessa conexões.
export function origemMemoriaTesteIA(valor: any, conexaoId: any): string {
 const numero = telefoneCanonicoTesteIA(valor);
 if (!numero) throw new Error('Contato fora do teste autorizado');
 if (!conexaoTesteIA(conexaoId)) throw new Error('Conexão fora do teste autorizado');
 return 'teste:' + conexaoId + ':' + numero;
}
// Cada par conexão + contato é uma memória independente; o laço de follow-up e o
// monitor de atendimento percorrem exatamente estes pares.
export const PARES_TESTE_IA = CONEXOES_TESTE_IA.flatMap((conexao_id) =>
 [...new Set(TELEFONES_TESTE_IA.map(telefoneCanonicoTesteIA))].filter(Boolean).map((telefone) =>
  ({ conexao_id, telefone: telefone as string, origem: origemMemoriaTesteIA(telefone, conexao_id) })));
export const ORIGENS_MEMORIA_TESTE_IA = PARES_TESTE_IA.map((par) => par.origem);