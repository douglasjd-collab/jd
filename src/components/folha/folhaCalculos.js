export function moeda(valor) {
 if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
 let s = String(valor ?? '').trim().replace(/R\$|\s/g, '');
 if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
 const n = Number(s);
 return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
export const arredondar = n => Math.round((n + Number.EPSILON) * 100) / 100;
export function descontosTotal(f) {
 return Array.isArray(f.descontos_itens) ? arredondar(f.descontos_itens.reduce((s, i) => s + moeda(i.valor), 0)) : moeda(f.descontos);
}
export function liquido(f) {
 return arredondar(moeda(f.salario_base) + moeda(f.valor_comissao) + moeda(f.bonificacoes) - moeda(f.adiantamentos) - descontosTotal(f) - moeda(f.inss_valor));
}
export function pago(f) {
 if (Array.isArray(f.pagamentos) && f.pagamentos.length) return arredondar(f.pagamentos.reduce((s,p) => s + moeda(p.valor),0));
 return ['Paga','Assinada','Arquivada'].includes(f.status) ? moeda(f.valor_liquido) : 0;
}
export const saldo = f => arredondar(moeda(f.valor_liquido) - pago(f));
export function inssConfigurado(c, competencia) {
 const [mes, ano] = String(competencia || '').split('/');
 const ref = ano && mes ? ano + '-' + mes.padStart(2,'0') : '';
 return (c?.inss_configuracoes || []).filter(i => i.vigencia <= ref).sort((a,b) => b.vigencia.localeCompare(a.vigencia))[0] || null;
}