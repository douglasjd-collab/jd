import moment from 'moment';
import 'moment/locale/pt-br';
moment.locale('pt-br');

export const fmt = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtData = (d) => (d ? moment(d).format('DD/MM/YYYY') : '—');
export const fmtDataHora = (d) => (d ? moment(d).format('DD/MM/YYYY HH:mm') : '—');
export const fmtTamanho = (b) => {
  if (!b) return '';
  const kb = b / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
};

export const PERFIS_ADIANTAMENTO = [
  { value: 'parceiro', label: 'Parceiro' },
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'colaborador', label: 'Colaborador' },
  { value: 'colaborador_vendedor', label: 'Colaborador/Vendedor' },
  { value: 'gerente', label: 'Gerente' },
  { value: 'admin', label: 'Administrador' },
];

export const PESSOA_LABELS = Object.fromEntries(PERFIS_ADIANTAMENTO.map(p => [p.value, p.label]));

export const STATUS_FILTROS = [
  { value: 'todos', label: 'Todos os status' },
  { value: 'pendente', label: 'Pendentes' },
  { value: 'descontado', label: 'Descontados' },
  { value: 'cancelado', label: 'Cancelados' },
];

export const STATUS_LABEL = { pendente: 'Pendente', descontado: 'Descontado', cancelado: 'Cancelado' };

export const STATUS_BADGE = {
  pendente: 'bg-orange-100 text-orange-700 border-orange-200',
  descontado: 'bg-green-100 text-green-700 border-green-200',
  cancelado: 'bg-slate-100 text-slate-500 border-slate-200',
};

const TIPO_BADGE = {
  parceiro: 'bg-purple-100 text-purple-700',
  vendedor: 'bg-blue-100 text-blue-700',
  colaborador: 'bg-teal-100 text-teal-700',
  colaborador_vendedor: 'bg-indigo-100 text-indigo-700',
  gerente: 'bg-amber-100 text-amber-700',
  admin: 'bg-slate-200 text-slate-700',
};

export const tipoBadgeClass = (tipo) => TIPO_BADGE[tipo] || 'bg-slate-100 text-slate-600';

export const nomeRecebedor = (a) => a?.colaborador_nome || a?.parceiro_nome || '-';
export const labelTipoRecebedor = (a) => PESSOA_LABELS[a?.pessoa_tipo] || (a?.parceiro_id ? 'Parceiro' : 'Colaborador');
export const inicialRecebedor = (nome) => String(nome || '?').trim().charAt(0).toUpperCase();
export const observacoesAdiantamento = (a) => a?.observacoes || a?.observacao || '';

export function parseHistorico(a) {
  try {
    const lista = JSON.parse(a?.historico_descontos || '[]');
    return Array.isArray(lista) ? lista.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function parseComprovantes(a) {
  try {
    const lista = JSON.parse(a?.comprovantes_json || '[]');
    return Array.isArray(lista) ? lista.filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Regras de valores (idênticas ao comportamento atual das comissões):
 * - desconto parcial reduz o campo `valor` e registra a parte descontada no histórico;
 * - desconto total apenas marca o status como descontado (o valor permanece);
 * - cancelado nunca entra no saldo pendente.
 */
export function valoresAdiantamento(a) {
  const valorAtual = Number(a?.valor) || 0;
  const historico = parseHistorico(a);
  const descontadoHistorico = historico.reduce((s, h) => s + (Number(h.valor) || 0), 0);

  const descontado = a?.status === 'descontado' ? valorAtual + descontadoHistorico : descontadoHistorico;
  const saldoPendente = a?.status === 'pendente' ? valorAtual : 0;

  return {
    valorOriginal: valorAtual + descontadoHistorico,
    valorDescontado: descontado,
    saldoPendente,
    descontoParcial: descontadoHistorico > 0 && a?.status === 'pendente',
    historico,
  };
}

export const escapeRegex = (texto) => String(texto || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');