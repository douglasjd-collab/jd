import { base44 } from '@/api/base44Client';

const chaveEmpresa = empresaId => 'status_por_setor_' + empresaId;
export function combinarConfigLegada(rows, setorIds) {
  const resultado = {};
  [...rows].sort((a, b) => String(a.updated_date || '').localeCompare(String(b.updated_date || ''))).forEach(row => {
    try {
      const valor = JSON.parse(row.valor || '{}');
      Object.entries(valor).forEach(([id, cfg]) => {
        if (setorIds.has(id) && cfg && typeof cfg === 'object') resultado[id] = cfg;
      });
    } catch {}
  });
  return resultado;
}
export async function carregarConfigStatusSetor(empresaId) {
  if (!empresaId) return {};
  const scoped = await base44.entities.ConfiguracaoSistema.filter({ chave: chaveEmpresa(empresaId) }, '-updated_date', 100);
  if (scoped.length) return JSON.parse(scoped[0].valor || '{}');
  const [legados, setores] = await Promise.all([
    base44.entities.ConfiguracaoSistema.filter({ chave: 'status_por_setor' }, '-updated_date', 1000),
    base44.entities.SetorTarefa.filter({ empresa_id: empresaId }, 'nome', 500),
  ]);
  return combinarConfigLegada(legados, new Set(setores.map(s => s.id)));
}
export async function salvarConfigStatusSetor(empresaId, novaConfig) {
  if (!empresaId) throw new Error('Empresa não identificada');
  const chave = chaveEmpresa(empresaId);
  const registros = await base44.entities.ConfiguracaoSistema.filter({ chave }, '-updated_date', 100);
  const valor = JSON.stringify(novaConfig);
  if (registros.length) await base44.entities.ConfiguracaoSistema.update(registros[0].id, { valor });
  else await base44.entities.ConfiguracaoSistema.create({ chave, valor, tipo: 'texto', descricao: 'Status das tarefas por setor da empresa ' + empresaId });
  return novaConfig;
}
