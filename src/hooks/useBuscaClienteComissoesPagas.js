import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/** Chave do agrupamento "legado" (propostas pagas sem lote) usada na página de Comissões Pagas. */
export const chaveLegadoProposta = (p) =>
  `legado_${p?.vendedor_id || 'sv'}_${p?.comissao_vendedor_data_pagamento || 'sem-data'}`;

const semAcento = (v) =>
  String(v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const digitos = (v) => String(v ?? '').replace(/\D/g, '');

/** Compara o termo digitado com os valores do registro (texto sem acento e também números). */
function combina(termo, termoDigitos, valores) {
  const t = semAcento(termo);
  for (const valor of valores) {
    if (valor === null || valor === undefined || valor === '') continue;
    if (t && semAcento(valor).includes(t)) return true;
    if (termoDigitos.length >= 3 && digitos(valor).includes(termoDigitos)) return true;
  }
  return false;
}

/**
 * Busca o cliente (nome, CPF ou contrato) dentro dos lotes de comissão pagos exibidos na tela.
 *
 * Os lotes guardam apenas o lote; o cliente fica nos itens de comissão
 * (ComissaoEmprestimoPaga / ComissaoAPagar) e o CPF na Proposta vinculada.
 * Por isso, com a busca ativa, os itens dos lotes visíveis são carregados de uma vez
 * (limitados ao período exibido) e comparados com o termo digitado.
 *
 * @returns {{ empLoteIds: Set<string>, consLoteIds: Set<string>, legadoKeys: Set<string>, buscando: boolean }}
 */
export function useBuscaClienteComissoesPagas({ ativo, termo = '', lotesEmp = [], lotesConsorcio = [], propostasLegado = [] }) {
  const termoDigitos = digitos(termo);

  const idsEmp = useMemo(
    () => lotesEmp.map((l) => l.id).filter(Boolean).sort(),
    [lotesEmp]
  );

  // Itens de consórcio vêm no JSON comissoes_ids de cada lote
  const { idsCons, mapaCons } = useMemo(() => {
    const ids = [];
    const mapa = {};
    lotesConsorcio.forEach((lote) => {
      let lista = [];
      try { lista = JSON.parse(lote.comissoes_ids || '[]'); } catch { lista = []; }
      lista.forEach((itemId) => {
        if (itemId) { ids.push(itemId); mapa[itemId] = lote.id; }
      });
    });
    return { idsCons: ids.sort(), mapaCons: mapa };
  }, [lotesConsorcio]);

  const { data, isFetching } = useQuery({
    queryKey: ['busca-cliente-comissoes-pagas', termo, idsEmp.join(','), idsCons.join(',')],
    enabled: ativo,
    throwOnError: false,
    staleTime: 60000,
    queryFn: async () => {
      const itensEmp = idsEmp.length
        ? await base44.entities.ComissaoEmprestimoPaga.filter({ lote_pagamento_id: { $in: idsEmp } }, null, 2000)
        : [];
      const itensCons = idsCons.length
        ? await base44.entities.ComissaoAPagar.filter({ id: { $in: idsCons } }, null, 2000)
        : [];
      const propostaIds = [...new Set(itensEmp.map((i) => i.proposta_id).filter(Boolean))].slice(0, 500);
      const propostas = propostaIds.length
        ? await base44.entities.Proposta.filter({ id: { $in: propostaIds } }, null, 500)
        : [];
      return { itensEmp, itensCons, propostas };
    },
  });

  const resultado = useMemo(() => {
    const empLoteIds = new Set();
    const consLoteIds = new Set();
    const legadoKeys = new Set();
    if (!ativo || !data) return { empLoteIds, consLoteIds, legadoKeys };

    const cpfPorProposta = {};
    data.propostas.forEach((p) => { cpfPorProposta[p.id] = p.cliente_cpf; });

    data.itensEmp.forEach((item) => {
      if (combina(termo, termoDigitos, [item.cliente_nome, item.contrato, cpfPorProposta[item.proposta_id]])) {
        empLoteIds.add(item.lote_pagamento_id);
      }
    });

    data.itensCons.forEach((item) => {
      const loteId = mapaCons[item.id];
      if (!loteId) return;
      const grupoCota = item.grupo && item.cota ? `${item.grupo}/${item.cota}` : null;
      if (combina(termo, termoDigitos, [item.cliente_nome, item.contrato, grupoCota, item.grupo, item.cota])) {
        consLoteIds.add(loteId);
      }
    });

    // Propostas legadas já estão carregadas na página
    propostasLegado.forEach((p) => {
      if (combina(termo, termoDigitos, [p.cliente_nome, p.cliente_cpf, p.contrato])) {
        legadoKeys.add(chaveLegadoProposta(p));
      }
    });

    return { empLoteIds, consLoteIds, legadoKeys };
  }, [ativo, data, termo, termoDigitos, propostasLegado, mapaCons]);

  return { ...resultado, buscando: ativo && isFetching };
}

export default useBuscaClienteComissoesPagas;