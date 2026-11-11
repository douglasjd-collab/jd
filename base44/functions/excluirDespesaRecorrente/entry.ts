import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Exclusão de despesas do Meu Financeiro com tratamento de recorrência.
// Escopos: 'esta' (somente a parcela), 'proximas' (esta e as seguintes) e
// 'todas' (a recorrência inteira).
// A série é localizada pelo ID da recorrência (lançamento original) e inclui
// parcelas canceladas. Parcelas pagas NUNCA são excluídas: permanecem no
// histórico e na conciliação bancária, sendo apenas desvinculadas da série
// quando a origem deixa de existir.

const PERFIS_GESTAO = ['admin', 'gerente'];
const TAMANHO_LOTE = 8;

function perfilDoUsuario(user) {
  return user?.perfil || user?.role || '';
}

function podeGerenciar(user, despesa) {
  const perfil = perfilDoUsuario(user);
  if (perfil === 'master' || perfil === 'super_admin' || user?.role === 'super_admin') return true;
  if (despesa?.usuario_id && despesa.usuario_id === user.id) return true;
  const empresa = user?.empresa_id || user?.data?.empresa_id;
  return PERFIS_GESTAO.includes(perfil) && !!empresa && despesa?.empresa_id === empresa;
}

function estaPaga(despesa) {
  return despesa?.status === 'pago' || !!despesa?.data_pagamento;
}

const dataDe = (despesa) => despesa?.data_vencimento || despesa?.data || '';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const despesaId = body?.despesa_id;
    const escopo = ['esta', 'proximas', 'todas'].includes(body?.escopo) ? body.escopo : 'esta';
    if (!despesaId) return Response.json({ error: 'despesa_id é obrigatório' }, { status: 400 });

    const despesa = await base44.asServiceRole.entities.MeuFinanceiroDespesa
      .get(despesaId)
      .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!despesa) return Response.json({ error: 'Despesa não encontrada' }, { status: 404 });
    if (!podeGerenciar(user, despesa)) {
      return Response.json({ error: 'Sem permissão para excluir esta despesa' }, { status: 403 });
    }

    const origemId = despesa.recorrencia_origem_id || (despesa.tipo_lancamento === 'recorrente' ? despesa.id : null);

    let serie = [despesa];
    if (origemId) {
      const pagina = await base44.asServiceRole.entities.MeuFinanceiroDespesa.filter(
        {
          empresa_id: despesa.empresa_id,
          $or: [{ id: origemId }, { recorrencia_origem_id: origemId }],
        },
        { limit: 500 },
      );
      serie = Array.isArray(pagina) ? pagina : (pagina?.items || []);
      if (!serie.some((d) => d.id === despesa.id)) serie.push(despesa);
      if (serie.some((d) => !podeGerenciar(user, d))) {
        return Response.json({ error: 'Sem permissão para excluir lançamentos desta recorrência' }, { status: 403 });
      }
    }

    let alvo = [despesa];
    if (origemId && escopo === 'todas') {
      alvo = serie;
    } else if (origemId && escopo === 'proximas') {
      const referencia = dataDe(despesa);
      alvo = serie.filter((d) => dataDe(d) >= referencia);
    }

    const excluir = alvo.filter((d) => !estaPaga(d));
    const preservar = alvo.filter(estaPaga);

    if (!excluir.length) {
      return Response.json(
        {
          ok: false,
          motivo: 'pagamento_protegido',
          escopo,
          excluidos: 0,
          preservados: preservar.length,
          error: 'Nada pode ser excluído neste escopo: as parcelas estão pagas e são preservadas para manter pagamentos e a conciliação bancária.',
        },
        { status: 409 },
      );
    }

    const idsExcluir = excluir.map((d) => d.id);
    const falhasExclusao = [];

    for (let i = 0; i < idsExcluir.length; i += TAMANHO_LOTE) {
      const lote = idsExcluir.slice(i, i + TAMANHO_LOTE);
      const resultados = await Promise.allSettled(
        lote.map((id) => base44.asServiceRole.entities.MeuFinanceiroDespesa.delete(id)),
      );
      resultados.forEach((resultado, indice) => {
        if (resultado.status === 'rejected') {
          falhasExclusao.push({ id: lote[indice], erro: resultado.reason?.message || 'falha ao excluir' });
        }
      });
    }

    const excluidosComSucesso = idsExcluir.filter(
      (id) => !falhasExclusao.some((f) => f.id === id),
    );

    // Se a origem da recorrência foi excluída, as parcelas preservadas (pagas)
    // deixam de fazer parte da série para não ficarem órfãs.
    const falhasDesvinculo = [];
    if (origemId && excluidosComSucesso.includes(origemId)) {
      const restantes = serie.filter((d) => !excluidosComSucesso.includes(d.id));
      for (const restante of restantes) {
        try {
          await base44.asServiceRole.entities.MeuFinanceiroDespesa.update(restante.id, {
            tipo_lancamento: 'unico',
            recorrencia_origem_id: null,
          });
        } catch (erro) {
          falhasDesvinculo.push({ id: restante.id, erro: erro.message });
        }
      }
    }

    return Response.json({
      ok: falhasExclusao.length === 0,
      escopo,
      recorrencia_id: origemId,
      total_serie: serie.length,
      excluidos: excluidosComSucesso.length,
      preservados: preservar.length,
      valor_excluido: excluir.reduce((soma, d) => soma + (d.valor || 0), 0),
      falhas_exclusao: falhasExclusao,
      falhas_desvinculo: falhasDesvinculo,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}