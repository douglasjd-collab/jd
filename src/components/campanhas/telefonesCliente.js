// Helpers compartilhados de deteção/classificação/seleção de múltiplos telefones por cliente.
//acente: campos legados do Cliente + registros individuais em ClienteTelefone.

import { base44 } from '@/api/base44Client';

export const normalizarTelefone = (s = '') => String(s || '').replace(/\D/g, '');

const HEADERS_WHATSAPP = ['whatsapp', 'whats', 'zap'];
const HEADERS_RESIDENCIAL = ['residencial', 'fixo', 'casa'];
const HEADERS_COMERCIAL = ['comercial', 'commercial', 'empresa', 'trabalho'];
const HEADERS_RECADO = ['recado', 'mensagem'];
const HEADERS_PHONE_BASE = ['telefone', 'tel', 'celular', 'cel', 'whatsapp', 'whats', 'fone', 'numero', 'número', 'phone'];

export function isColunaTelefone(header) {
  const h = String(header || '').toLowerCase().trim();
  if (!h) return false;
  return HEADERS_PHONE_BASE.some((k) => h === k || h.includes(k));
}

function classificarHeader(header) {
  const h = String(header || '').toLowerCase().trim();
  if (HEADERS_WHATSAPP.some((k) => h.includes(k))) return 'whatsapp';
  if (HEADERS_COMERCIAL.some((k) => h.includes(k))) return 'comercial';
  if (HEADERS_RESIDENCIAL.some((k) => h.includes(k))) return 'residencial';
  if (HEADERS_RECADO.some((k) => h.includes(k))) return 'recado';
  if (h.includes('celular') || h.includes('cel')) return 'celular';
  if (h === 'telefone' || h === 'tel' || h.includes('telefone') || h.includes('tel')) return 'telefone';
  return 'telefone';
}

// Detecta todas as colunas de telefone no header
export function detectarColunasTelefone(headers) {
  const found = [];
  headers.forEach((rawHeader, idx) => {
    if (!isColunaTelefone(rawHeader)) return;
    const tipo = classificarHeader(rawHeader);
    const is_whatsapp = tipo === 'whatsapp' || tipo === 'celular';
    found.push({
      idx,
      header: String(rawHeader || '').trim(),
      tipo,
      is_whatsapp,
      is_principal: false,
    });
  });
  const idxPrincipal = found.findIndex((c) => c.tipo === 'celular' || c.tipo === 'whatsapp');
  if (idxPrincipal >= 0) found[idxPrincipal].is_principal = true;
  else if (found.length > 0) found[0].is_principal = true;
  return found;
}

const HEADERS_CIDADE = ['cidade', 'municipio', 'município', 'city'];

export function detectarColunaCidade(headers) {
  const norm = headers.map((h) => String(h || '').trim().toLowerCase());
  for (const key of HEADERS_CIDADE) {
    const idx = norm.findIndex((h) => h === key);
    if (idx >= 0) return idx;
  }
  for (const key of HEADERS_CIDADE) {
    const idx = norm.findIndex((h) => h.includes(key));
    if (idx >= 0) return idx;
  }
  return -1;
}

// ----- Mapeamento de colunas detectadas → campos existentes no Cliente -----

const CAMPOS_DISPONIVEIS = ['celular', 'telefone_fixo', 'pj_celular', 'pj_telefone_fixo'];

function campoPreferido(header) {
  const h = String(header || '').toLowerCase();
  if (HEADERS_COMERCIAL.some((k) => h.includes(k))) return ['pj_telefone_fixo', 'telefone_fixo'];
  if (HEADERS_WHATSAPP.some((k) => h.includes(k))) return ['celular', 'pj_celular', 'telefone_fixo'];
  if (h.includes('celular') || h.includes('cel')) return ['celular', 'pj_celular', 'telefone_fixo'];
  if (HEADERS_RESIDENCIAL.some((k) => h.includes(k))) return ['telefone_fixo', 'pj_telefone_fixo'];
  if (HEADERS_RECADO.some((k) => h.includes(k))) return ['celular', 'pj_celular', 'telefone_fixo'];
  return CAMPOS_DISPONIVEIS;
}

// Atribui cada coluna detectada a um dos 4 campos do Cliente (sem repetir).
// As colunas excedentes Retornam em nao_mapeadas.
export function mapearColunasParaCampos(colTelefones) {
  const usados = new Set();
  const map = {}; // header -> campo
  const nao_mapeadas = [];
  for (const c of colTelefones) {
    const pre = campoPreferido(c.header);
    const disp = pre.find((f) => !usados.has(f)) || CAMPOS_DISPONIVEIS.find((f) => !usados.has(f));
    if (disp) {
      usados.add(disp);
      map[c.header] = disp;
    } else {
      nao_mapeadas.push(c.header);
    }
  }
  return { map, nao_mapeadas };
}

// ----- Leitura dos telefones a partir de um Cliente existente -----

//telefonesExtra = lista de registros de ClienteTelefone (ou objetos {numero, tipo, is_whatsapp, is_principal})
export function telefonesDoCliente(cliente, telefonesExtra = []) {
  if (!cliente) return [];
  const vistos = new Set();
  const out = [];
  const push = (num, tipo, is_whatsapp, is_principal) => {
    const n = normalizarTelefone(num);
    if (n.length < 10) return;
    if (vistos.has(n)) return;
    vistos.add(n);
    out.push({ numero: n, tipo: tipo || 'celular', is_whatsapp: !!is_whatsapp, is_principal: !!is_principal });
  };
  // Campos legados do Cliente
  push(cliente.celular, 'celular', true, true);
  push(cliente.telefone_fixo, 'residencial', false, false);
  push(cliente.pj_celular, 'celular', true, false);
  push(cliente.pj_telefone_fixo, 'comercial', false, false);
  // Extras de ClienteTelefone (sem limite por cliente)
  let extraPrincipal = null;
  for (const t of (telefonesExtra || [])) {
    const n = normalizarTelefone(t.telefone || t.numero || '');
    if (n.length < 10) continue;
    const tipo = t.tipo || 'celular';
    const isWhats = t.is_whatsapp != null ? !!t.is_whatsapp : (tipo === 'celular' || tipo === 'whatsapp');
    if (t.is_principal && !extraPrincipal) extraPrincipal = n;
    push(n, tipo, isWhats, false);
  }
  // Resolve principal: extra explícito > primeiro whatsapp/celular > primeiro
  out.forEach((t) => { t.is_principal = false; });
  let prin = extraPrincipal ? out.find((t) => t.numero === extraPrincipal) : null;
  if (!prin) prin = out.find((t) => t.is_whatsapp) || out[0];
  if (prin) prin.is_principal = true;
  return out;
}

// ----- Seleção de telefones para envio na campanha conforme o modo -----

export function selecionarTelefonesParaCampanha(cliente, modo, telefonesExtra = []) {
  const todos = telefonesDoCliente(cliente, telefonesExtra);
  if (todos.length === 0) return [];
  const m = modo || 'principal';
  if (m === 'todos') {
    const vistos = new Set();
    const out = [];
    for (const t of todos) {
      if (t.numero.length < 10) continue;
      if (vistos.has(t.numero)) continue;
      vistos.add(t.numero);
      out.push(t.numero);
    }
    return out;
  }
  if (m === 'whatsapp') {
    const vistos = new Set();
    const out = [];
    for (const t of todos) {
      if (!t.is_whatsapp || t.numero.length < 10) continue;
      if (vistos.has(t.numero)) continue;
      vistos.add(t.numero);
      out.push(t.numero);
    }
    if (out.length === 0) {
      const prin = todos.find((t) => t.is_principal && t.numero.length >= 10) || todos.find((t) => t.numero.length >= 10);
      if (prin) out.push(prin.numero);
    }
    return out;
  }
  // principal (padrão)
  const prin = todos.find((t) => t.is_principal && t.numero.length >= 10) || todos.find((t) => t.numero.length >= 10);
  return prin ? [prin.numero] : [];
}

// ----- Carrega todos os ClienteTelefone da empresa agrupados por cliente_id -----
// Usado pela prévia/envio da campanha para expandir múltiplos números por cliente.
export async function carregarTelefonesPorCliente(empresaId) {
  if (!empresaId) return new Map();
  try {
    const r = await base44.entities.ClienteTelefone.filter({ empresa_id: empresaId }, null, 10000);
    const m = new Map();
    for (const t of r || []) {
      if (!t.cliente_id || t.status === 'inativo') continue;
      if (!m.has(t.cliente_id)) m.set(t.cliente_id, []);
      m.get(t.cliente_id).push(t);
    }
    return m;
  } catch (e) {
    console.warn('Erro ao buscar ClienteTelefone:', e?.message || e);
    return new Map();
  }
}