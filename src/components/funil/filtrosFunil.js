// Shared matching rules for the board, counters and search.
export const normalizarBusca = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function idsResponsaveis(o) {
  let extras = o.responsaveis_ids;
  if (typeof extras === 'string') {
    try { extras = JSON.parse(extras); } catch { extras = []; }
  }
  return [...new Set([o.vendedor_id, ...(Array.isArray(extras) ? extras : [])].filter(id => typeof id === 'string' && id.trim()))];
}

export function correspondeResponsavel(o, pessoa) {
  const ids = [pessoa?.id, pessoa?.user_id, pessoa?.auth_id, pessoa?.colaborador_id].filter(id => id && id !== 'pending');
  return idsResponsaveis(o).some(id => ids.includes(id));
}

export function produtoDaOportunidade(o, etapas) {
  return o.produto || etapas.find(e => e.id === o.etapa_id)?.produto || 'consorcio';
}

export function correspondeBusca(o, busca) {
  const texto = normalizarBusca(busca);
  if (!texto) return true;
  if ([o.titulo, o.cliente_nome, o.telefone_lead, o.cliente_telefone].some(v => normalizarBusca(v).includes(texto))) return true;
  const digitos = texto.replace(/\D/g, '');
  return digitos.length > 0 && /^[\d\s()+.\-]+$/.test(texto) &&
    [o.telefone_lead, o.cliente_telefone].some(v => String(v || '').replace(/\D/g, '').includes(digitos));
}

export function diaLocal(value) {
  if (!value) return '';
  const texto = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  // Base44 serializes some UTC timestamps without the timezone suffix.
  const date = new Date(/T/.test(texto) && !/(Z|[+-]\d{2}:?\d{2})$/.test(texto) ? texto + 'Z' : texto);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(date);
}

export function correspondeRapido(o, filtro, etapas, agora = new Date()) {
  if (!filtro) return true;
  const hoje = diaLocal(agora.toISOString());
  const data = diaLocal(o.data_cadastro_lead || o.created_date);
  const inicioSemana = new Date(hoje + 'T12:00:00Z');
  inicioSemana.setUTCDate(inicioSemana.getUTCDate() - inicioSemana.getUTCDay());
  const semana = inicioSemana.toISOString().slice(0, 10);
  const etapa = etapas.find(e => e.id === o.etapa_id);
  const status = etapa?.tipo === 'ganho' ? 'ganha' : etapa?.tipo === 'perdida' ? 'perdida' : (o.status || 'aberta');
  const aberta = status === 'aberta';
  const movimento = o.data_ultima_movimentacao || o.created_date;
  const dias = movimento ? (agora - new Date(movimento)) / 86400000 : 0;
  if (filtro === 'hoje') return data === hoje;
  if (filtro === 'esta_semana') return !!data && data >= semana && data <= hoje;
  if (filtro === 'este_mes') return !!data && data.slice(0, 7) === hoje.slice(0, 7) && data <= hoje;
  if (filtro === 'atrasados') return aberta && !!o.data_fechamento_prevista && diaLocal(o.data_fechamento_prevista) < hoje;
  if (filtro === 'sem_resposta') return aberta && dias >= 1;
  if (filtro.startsWith('sem_movimento_')) return aberta && dias >= Number(filtro.split('_').pop());
  if (filtro === 'quentes') return aberta && Number(o.valor_estimado || 0) > 50000;
  if (filtro === 'ganhos') return status === 'ganha';
  if (filtro === 'perdidos') return status === 'perdida';
  if (filtro === 'em_negociacao') return aberta;
  if (filtro === 'sem_responsavel') return idsResponsaveis(o).length === 0;
  return true;
}

export async function carregarPaginas(entidade, filtro, ordem, tamanho = 200) {
  const registros = [];
  const vistos = new Set();
  for (let skip = 0; ; skip += tamanho) {
    const pagina = await entidade.filter(filtro, ordem, tamanho, skip);
    const novos = pagina.filter(r => !vistos.has(r.id));
    novos.forEach(r => { vistos.add(r.id); registros.push(r); });
    if (pagina.length < tamanho) return registros;
    if (!novos.length) throw new Error('A paginação do funil não avançou. Tente atualizar.');
  }
}
