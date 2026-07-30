// Helpers de filtros da etapa "Filtros" da nova campanha (1º disparo).
// Centraliza a lógica usada pela prévia e pelo submit para evitar duplicação.
import { base44 } from '@/api/base44Client';
import { normalizarTelefone } from './telefonesCliente';

// Cliente tem nome cadastrado em qualquer dos campos de nome (PF ou PJ).
export function temNomeCadastrado(c) {
  if (!c) return false;
  return !!(c.nome_completo || c.primeiro_nome || c.pj_razao_social || c.pj_nome_fantasia);
}

// Telefone válido para envio WhatsApp no padrão brasileiro.
// Aceita 10-13 dígitos; se 12 ou 13 dígitos, deve começar com 55 (DDI Brasil).
export function isTelefoneValidoParaEnvio(num) {
  const n = normalizarTelefone(num);
  if (!n || n.length < 10 || n.length > 13) return false;
  if ((n.length === 12 || n.length === 13) && !n.startsWith('55')) return false;
  return true;
}

// Aplica todos os filtros opcionais da etapa Filtros na lista de clientes.
// Retorna a lista reduzida (antes da verificação de telefone/envio).
// Não aplica regras automáticas (duplicados, inválidos, bloqueados) — estas
// são aplicadas na etapa de seleção de telefones.
export function aplicarFiltrosPublico(clientes, form) {
  if (!Array.isArray(clientes)) return [];
  let filtrados = clientes;

  // 1. Cidade (contains em residencial ou comercial)
  if (form.filtro_cidade) {
    const v = String(form.filtro_cidade).toLowerCase().trim();
    if (v) {
      filtrados = filtrados.filter(
        (c) =>
          (c.res_cidade || '').toLowerCase().includes(v) ||
          (c.com_cidade || '').toLowerCase().includes(v)
      );
    }
  }

  // 2. UF (exact, residencial ou comercial)
  if (form.filtro_uf) {
    const v = String(form.filtro_uf).toUpperCase().trim();
    if (v) {
      filtrados = filtrados.filter(
        (c) =>
          (c.res_uf || '').toUpperCase() === v ||
          (c.com_uf || '').toUpperCase() === v
      );
    }
  }

  // 3. Com nome cadastrado / 4. Sem nome cadastrado (mutuamente exclusivos)
  if (form.filtro_com_nome) filtrados = filtrados.filter(temNomeCadastrado);
  if (form.filtro_sem_nome) filtrados = filtrados.filter((c) => !temNomeCadastrado(c));

  // 5. Com telefone válido — exclui clientes sem nenhum telefone válido no
  //    cadastro (celular, pj_celular, telefone_fixo, pj_telefone_fixo).
  if (form.filtro_telefone_valido) {
    filtrados = filtrados.filter(
      (c) =>
        isTelefoneValidoParaEnvio(c.celular) ||
        isTelefoneValidoParaEnvio(c.pj_celular) ||
        isTelefoneValidoParaEnvio(c.telefone_fixo) ||
        isTelefoneValidoParaEnvio(c.pj_telefone_fixo)
    );
  }

  // 6. Apenas telefones WhatsApp — não exclui clientes, apenas redefine o
  //    modo de seleção de telefones (ver modoTelefoneParaCampanha).

  // 7. Vendedor responsável
  if (form.filtro_vendedor_id) {
    filtrados = filtrados.filter((c) => c.vendedor_id === form.filtro_vendedor_id);
  }

  // 8. Parceiro/origem do contato (created_by_id)
  if (form.filtro_parceiro_id) {
    filtrados = filtrados.filter((c) => c.created_by_id === form.filtro_parceiro_id);
  }

  return filtrados;
}

// Determina o modo de seleção de telefones considerando o filtro "Apenas WhatsApp".
export function modoTelefoneParaCampanha(form) {
  if (form.filtro_apenas_whatsapp) return 'whatsapp';
  return form.destino_telefones || 'principal';
}

// Carrega telefones de conversas bloqueadas (contatos que solicitaram não
// receber mensagens). Usado pelas regras automáticas (não aparece como filtro).
export async function carregarTelefonesBloqueados(empresaId) {
  if (!empresaId) return new Set();
  try {
    const conversas = await base44.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId, bloqueado: true },
      null,
      5000
    );
    const set = new Set();
    for (const conv of conversas || []) {
      const n = normalizarTelefone(conv.cliente_telefone || '');
      if (n.length >= 10) set.add(n);
    }
    return set;
  } catch (e) {
    console.warn('Erro ao carregar telefones bloqueados:', e?.message || e);
    return new Set();
  }
}

// Resumo textual dos filtros para exibição no resumo final.
export function resumoFiltros(form) {
  const partes = [];
  if (form.filtro_cidade) partes.push(`Cidade: ${form.filtro_cidade}`);
  if (form.filtro_uf) partes.push(`UF: ${form.filtro_uf}`);
  if (form.filtro_com_nome) partes.push('Com nome');
  if (form.filtro_sem_nome) partes.push('Sem nome');
  if (form.filtro_telefone_valido) partes.push('Telefone válido');
  if (form.filtro_apenas_whatsapp) partes.push('Apenas WhatsApp');
  if (form.filtro_vendedor_id) partes.push('Vendedor');
  if (form.filtro_parceiro_id) partes.push('Parceiro');
  return partes.length ? partes.join(' · ') : 'Nenhum';
}