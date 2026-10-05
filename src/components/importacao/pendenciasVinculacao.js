import { base44 } from '@/api/base44Client';
import { normalizarDescricaoTipo, resolverTipoImportacao } from './tiposEmprestimoMatch';

// Registra (ou atualiza) as pendências de vinculação de tipo de empréstimo de uma importação.
// Agrupa ocorrências da mesma descrição + origem para não criar pendências repetidas.
//
// ocorrencias: [{
//   descricaoOriginal, descricaoChave, origem, origemChave, semDescricao,
//   recebimento_id, proposta_id, contrato, cliente_nome, data_recebimento, valor_recebido
// }]
export async function registrarPendenciasVinculacao({ empresa_id, importacao_id, ocorrencias }) {
  if (!ocorrencias?.length) return { pendencias: 0, registros: 0 };

  const grupos = new Map();
  for (const o of ocorrencias) {
    const chave = `${o.origemChave || ''}|${o.descricaoChave || ''}`;
    if (!grupos.has(chave)) grupos.set(chave, { ...o, registros: [] });
    grupos.get(chave).registros.push({
      recebimento_id: o.recebimento_id || null,
      proposta_id: o.proposta_id || null,
      contrato: o.contrato || null,
      cliente_nome: o.cliente_nome || null,
      data_recebimento: o.data_recebimento || null,
      valor_recebido: o.valor_recebido || 0,
    });
  }

  let existentes = [];
  try {
    existentes = await base44.entities.PendenciaVinculacaoTipo.filter(
      { empresa_id, status: 'pendente' }, '-ultima_ocorrencia', 500
    );
  } catch (e) {
    existentes = [];
  }
  const porChave = new Map(existentes.map(p => [`${p.origem_chave || ''}|${p.descricao_chave || ''}`, p]));

  let criadas = 0;
  let atualizadas = 0;
  let registros = 0;

  for (const [chave, grupo] of grupos) {
    const agora = new Date().toISOString();
    const existente = porChave.get(chave);

    if (existente) {
      let anteriores = [];
      try { anteriores = JSON.parse(existente.registros_json || '[]'); } catch { anteriores = []; }
      const jaRegistrados = new Set(anteriores.map(r => r.recebimento_id));
      const novos = grupo.registros.filter(r => !jaRegistrados.has(r.recebimento_id));

      await base44.entities.PendenciaVinculacaoTipo.update(existente.id, {
        descricao_original: grupo.descricaoOriginal,
        quantidade: (existente.quantidade || 0) + novos.length,
        ultima_ocorrencia: agora,
        registros_json: JSON.stringify([...anteriores, ...novos]),
        ...(importacao_id ? { ultima_importacao_id: importacao_id } : {}),
      });
      atualizadas++;
      registros += novos.length;
    } else {
      await base44.entities.PendenciaVinculacaoTipo.create({
        empresa_id,
        descricao_original: grupo.descricaoOriginal,
        descricao_chave: grupo.descricaoChave,
        origem: grupo.origem || null,
        origem_chave: grupo.origemChave || '',
        sem_descricao: !!grupo.semDescricao,
        quantidade: grupo.registros.length,
        primeira_ocorrencia: agora,
        ultima_ocorrencia: agora,
        registros_json: JSON.stringify(grupo.registros),
        ultima_importacao_id: importacao_id || null,
        status: 'pendente',
      });
      criadas++;
      registros += grupo.registros.length;
    }
  }

  return { pendencias: grupos.size, criadas, atualizadas, registros };
}

/**
 * Resolve o tipo de cada recebimento criado pela importação, registra as descrições não
 * reconhecidas como pendências de vinculação e devolve, por proposta, o tipo a aplicar.
 * Nenhum valor financeiro é alterado aqui.
 */
export async function processarTiposDaImportacao({ empresa_id, importacao_id, origemPadrao, items, recebimentos, indiceTipos }) {
  const porVenda = new Map();
  const ocorrencias = [];

  (recebimentos || []).forEach((rec, ri) => {
    const item = items?.[ri] || {};
    const origem = item.banco || origemPadrao || '';
    const resolucao = resolverTipoImportacao({ descricao: item.tipo_consignado, origem, indice: indiceTipos });

    const atual = porVenda.get(rec.venda_id) || { slugs: new Set(), pendentes: [] };
    if (resolucao.tipo) {
      atual.slugs.add(resolucao.tipo.slug);
    } else {
      atual.pendentes.push(resolucao.descricaoOriginal);
      ocorrencias.push({
        descricaoOriginal: resolucao.descricaoOriginal,
        descricaoChave: resolucao.descricaoChave,
        origem,
        origemChave: normalizarDescricaoTipo(origem),
        semDescricao: resolucao.semDescricao,
        recebimento_id: rec.id,
        proposta_id: rec.venda_id,
        contrato: rec.contrato,
        cliente_nome: rec.cliente_nome,
        data_recebimento: rec.data_recebimento,
        valor_recebido: rec.valor_recebido,
      });
    }
    porVenda.set(rec.venda_id, atual);
  });

  // Só aplica o tipo quando existe uma única correspondência e nenhuma descrição pendente
  const tipoPorVenda = new Map();
  let conflitos = 0;
  for (const [vendaId, info] of porVenda) {
    if (info.slugs.size === 1 && info.pendentes.length === 0) {
      tipoPorVenda.set(vendaId, { slug: [...info.slugs][0] });
    } else {
      if (info.slugs.size > 1) conflitos++;
      tipoPorVenda.set(vendaId, {
        pendente: true,
        descricaoOriginal: info.pendentes.join(' | ') || [...info.slugs].join(' | '),
      });
    }
  }

  const resultado = await registrarPendenciasVinculacao({ empresa_id, importacao_id, ocorrencias });

  return {
    tipoPorVenda,
    registrosPendentes: ocorrencias.length,
    conflitos,
    totalPendentes: resultado.pendencias || 0,
  };
}

// Aplica (ou apenas marca como pendente) o tipo reconhecido na atualização da proposta.
export function aplicarTipoNaProposta(upd, resolucao) {
  if (!resolucao) return;
  if (resolucao.slug) {
    upd.emprestimo_tipo = resolucao.slug;
    upd.pendente_vinculacao_tipo = false;
  } else {
    // Descrição nova ou conflitante: mantém o tipo atual da proposta e sinaliza a pendência
    upd.pendente_vinculacao_tipo = true;
    upd.tipo_importacao_original = resolucao.descricaoOriginal;
  }
}