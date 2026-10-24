import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { gerarRelatorioComissaoConsorcioHTML, anexarComprovanteHTML } from '../../shared/relatorioComissaoConsorcioShared.ts';

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d) {
  if (!d) return '-';
  const dateStr = String(d).length <= 10 ? d + 'T12:00:00' : d;
  return new Date(dateStr).toLocaleDateString('pt-BR');
}

function fmtDateTime(d) {
  return new Date(d).toLocaleString('pt-BR');
}

const TIPO_LABELS = {
  'NOVO': 'Novo', 'novo': 'Novo',
  'REFINANCIAMENTO': 'Refin', 'refinanciamento': 'Refin',
  'PORTABILIDADE': 'Portabilidade', 'portabilidade': 'Portabilidade',
  'CARTAO_CONSIGNADO': 'Cartão', 'cartao_consignado': 'Cartão',
  'REFIN_PORTABILIDADE': 'Refin/Port', 'refin_portabilidade': 'Refin/Port',
};
const getTipoLabel = (tipo) => TIPO_LABELS[tipo] || tipo || '-';

// Reconstrói o relatório de comissão de consórcio a partir dos registros que
// compõem o lote (usado quando o lote não guardou o HTML no momento do pagamento).
async function reconstruirRelatorioConsorcio(base44, lote) {
  // Itens do lote: vêm dos IDs das comissões gravados no próprio lote
  let ids = [];
  try { ids = JSON.parse(lote.comissoes_ids || '[]'); } catch (_) { ids = []; }

  let comissoes = [];
  if (ids.length > 0) {
    const encontradas = await base44.asServiceRole.entities.ComissaoAPagar.filter({ id: { $in: ids } }, null, 500);
    const porId = new Map(encontradas.map((c) => [c.id, c]));
    comissoes = ids.map((id) => porId.get(id)).filter(Boolean);
  }
  if (comissoes.length === 0) {
    comissoes = await base44.asServiceRole.entities.ComissaoAPagar.filter({ protocolo: lote.lote_code }, null, 500);
  }
  if (comissoes.length === 0) return null;

  // Crédito de cada venda (para o % sobre o crédito)
  const vendaIds = [...new Set(comissoes.map((c) => c.venda_id).filter(Boolean))];
  const creditos = {};
  if (vendaIds.length > 0) {
    try {
      const vendas = await base44.asServiceRole.entities.Venda.filter({ id: { $in: vendaIds } }, null, 500);
      vendas.forEach((v) => { creditos[v.id] = v.valorCredito || 0; });
    } catch (_) {}
  }

  // Nome/CPF/PIX do vendedor
  let vendedorNome = lote.vendedor_nome || '-';
  let vendedorCpf = '';
  let pix = '';
  if (lote.vendedor_id) {
    try {
      let colabs = await base44.asServiceRole.entities.Colaborador.filter({ id: lote.vendedor_id });
      if (!colabs || colabs.length === 0) {
        colabs = await base44.asServiceRole.entities.Colaborador.filter({ user_id: lote.vendedor_id });
      }
      if (colabs && colabs.length > 0) {
        vendedorNome = colabs[0].nome || vendedorNome;
        vendedorCpf = colabs[0].cpf || '';
        pix = colabs[0].pix_chave || colabs[0].chave_pix || '';
      }
    } catch (_) {}
  }

  // Adiantamentos descontados neste lote
  let adiantamentosLote = [];
  try {
    adiantamentosLote = await base44.asServiceRole.entities.Adiantamento.filter({ lote_pagamento_id: lote.lote_code });
  } catch (_) { adiantamentosLote = []; }

  // Logo configurada e nome da empresa
  let logoUrl = null;
  try {
    const configs = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({ chave: 'logo_url' });
    if (configs && configs.length > 0 && configs[0].valor) logoUrl = configs[0].valor;
  } catch (_) {}
  let empresaNome = 'JD PROMOTORA';
  try {
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: lote.empresa_id });
    if (empresas && empresas.length > 0) empresaNome = empresas[0].nome_fantasia || empresas[0].nome || empresaNome;
  } catch (_) {}

  const itens = comissoes.map((c) => {
    const credito = creditos[c.venda_id] || 0;
    return {
      cliente: c.cliente_nome || '-',
      grupoCota: c.grupo && c.cota ? `${c.grupo}/${c.cota}` : (c.contrato || '-'),
      parcela: c.parcela_numero ? `${c.parcela_numero}º` : '-',
      dataRecebimento: c.data_recebimento,
      credito,
      percentual: credito && c.valor_a_pagar ? (c.valor_a_pagar / credito) * 100 : 0,
      valor: c.valor_a_pagar || 0,
      administradora: c.administradora_nome || '-',
    };
  });

  const subtotal = itens.reduce((acc, i) => acc + i.valor, 0);
  const totalAdiantamentos = adiantamentosLote.reduce((acc, a) => acc + (a.valor || 0), 0) || (lote.descontos || 0);
  const acrescimos = lote.acrescimos || 0;
  const impostoPercentual = lote.imposto_percentual || 0;
  const impostoValor = lote.imposto_valor || 0;
  const totalLiquido = Math.max(0, subtotal - totalAdiantamentos - impostoValor + acrescimos);

  return gerarRelatorioComissaoConsorcioHTML({
    loteCode: lote.lote_code,
    vendedorNome,
    vendedorCpf,
    pix,
    dataPagamento: lote.data_pagamento,
    formaPagamento: lote.forma_pagamento,
    observacao: lote.observacao,
    geradoPor: lote.gerado_por_nome,
    geradoEm: new Date().toLocaleString('pt-BR'),
    logoUrl,
    empresaNome,
    itens,
    subtotal,
    totalAdiantamentos,
    impostoPercentual,
    impostoValor,
    acrescimos,
    totalLiquido,
    adiantamentos: adiantamentosLote.map((a) => ({ valor: a.valor, data: a.data_desconto || a.data, motivo: a.motivo })),
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lote_id, tipo, vendedor_id, data_pagamento } = await req.json();
    if (!lote_id || !tipo) return Response.json({ error: 'lote_id e tipo sao obrigatorios' }, { status: 400 });

    // ─── CONSÓRCIO: retorna o relatorio_html armazenado ────────────────────────
    if (tipo === 'consorcio') {
      const lotes = await base44.asServiceRole.entities.PagamentoComissaoLote.filter({ id: lote_id });
      const l = lotes?.[0];
      if (!l) return Response.json({ error: 'Lote nao encontrado' }, { status: 404 });

      let html = l.relatorio_html || null;

      // Lotes pagos antes deste recurso não guardaram o HTML: reconstrói o mesmo
      // relatório a partir dos registros do pagamento e passa a guardá-lo no lote,
      // garantindo que a 2ª via devolva sempre o relatório original.
      if (!html) {
        try {
          html = await reconstruirRelatorioConsorcio(base44, l);
          if (html) await base44.asServiceRole.entities.PagamentoComissaoLote.update(l.id, { relatorio_html: html });
        } catch (e) {
          console.error('Falha ao reconstruir relatorio do lote', lote_id, e?.message);
        }
      }

      if (!html) return Response.json({ error: 'Relatorio nao disponivel para este lote' }, { status: 404 });

      // Se houver comprovante, anexar como página seguinte
      html = anexarComprovanteHTML(html, l.comprovante_url);

      return Response.json({ relatorio_html: html });
    }

    // ─── EMPRÉSTIMOS: busca lote + snapshots ComissaoEmprestimoPaga ────────────
    if (tipo === 'emp' || tipo === 'emp-legado') {
      const legado = tipo === 'emp-legado';
      let propostasLegado = [];
      let lote;
      if (legado) {
        if (!vendedor_id || !data_pagamento) return Response.json({ error: 'Vendedor e data do pagamento antigo são obrigatórios.' }, { status: 400 });
        // Usa o cliente autenticado: permissões de leitura das propostas são preservadas.
        const filter = { produto: 'emprestimo', vendedor_id, comissao_vendedor_paga: true, comissao_vendedor_data_pagamento: data_pagamento };
        if (user.empresa_id) filter.empresa_id = user.empresa_id;
        propostasLegado = (await base44.entities.Proposta.filter(filter, '-data_venda', 1000)).filter(p => !p.lote_pagamento_id);
        if (!propostasLegado.length) return Response.json({ error: 'Pagamento antigo não encontrado ou sem acesso.' }, { status: 404 });
        lote = { empresa_id: propostasLegado[0].empresa_id, vendedor_id, vendedor_nome: propostasLegado[0].vendedor_nome,
          data_pagamento, lote_codigo: `LEG-${String(vendedor_id).slice(-4)}-${data_pagamento.replace(/-/g, '')}`,
          valor_total: propostasLegado.reduce((sum, p) => sum + (p.valor_comissao_vendedor_pago ?? p.valor_comissao ?? 0), 0),
          comprovante_url: propostasLegado.find(p => p.comissao_vendedor_comprovante_url)?.comissao_vendedor_comprovante_url,
          quantidade_propostas: propostasLegado.length, acrescimos: 0, descontos: 0 };
      } else {
        const lotes = await base44.asServiceRole.entities.LotePagamentoComissaoEmprestimo.filter({ id: lote_id });
        lote = lotes?.[0];
      }
      if (!lote) return Response.json({ error: 'Lote nao encontrado' }, { status: 404 });

      // Buscar snapshots dos itens do lote (novo sistema)
      let loteItens = legado ? [] : await base44.asServiceRole.entities.ComissaoEmprestimoPaga.filter(
        { lote_pagamento_id: lote_id }, '-created_date', 500
      );

      // Fallback: lotes antigos não têm ComissaoEmprestimoPaga, busca nas Propostas
      if (loteItens.length === 0 && lote.vendedor_id && lote.data_pagamento) {
        const propostasLote = legado ? propostasLegado : await base44.asServiceRole.entities.Proposta.filter({
          empresa_id: lote.empresa_id,
          vendedor_id: lote.vendedor_id,
          comissao_vendedor_paga: true,
          comissao_vendedor_data_pagamento: lote.data_pagamento,
        }, '-data_venda', 500);
        loteItens = propostasLote
          .filter(p => p.produto === 'emprestimo' || p.emprestimo_tipo)
          .map(p => ({
            proposta_id: p.id,
            cliente_nome: p.cliente_nome,
            cliente_cpf: p.cliente_cpf,
            contrato: p.contrato,
            emprestimo_tipo: p.emprestimo_tipo,
            banco: p.administradora_nome || p.empresa_parceira_nome,
            data_liberacao: p.emprestimo_data_liberacao || p.data_venda,
            valor_credito: p.valor_credito || 0,
            valor_liquido: p.valor_liquido || null,
            valor_parcela: p.emprestimo_valor_parcela || null,
            emprestimo_prazo: p.emprestimo_prazo || null,
            percentual_vendedor_pago: p.percentual_comissao_vendedor || 0,
            valor_vendedor_pago: p.valor_comissao_vendedor_pago ?? p.valor_comissao ?? 0,
          }));
      }

      // Prazo do contrato: não faz parte do snapshot do item, vem da Proposta vinculada
      let prazoPorPropostaId = {};
      let prazoPorContrato = {};
      const prazoPropostaIds = [...new Set(loteItens.map(i => i.proposta_id).filter(Boolean))];
      if (prazoPropostaIds.length > 0) {
        try {
          const propostasPrazo = await base44.asServiceRole.entities.Proposta.filter(
            { id: { $in: prazoPropostaIds } }, null, 500
          );
          propostasPrazo.forEach(p => {
            if (!p.emprestimo_prazo) return;
            prazoPorPropostaId[p.id] = p.emprestimo_prazo;
            if (p.contrato) prazoPorContrato[String(p.contrato)] = p.emprestimo_prazo;
          });
        } catch (e) {
          console.error('Falha ao buscar o prazo dos contratos do lote', e?.message);
        }
      }
      const prazoDoItem = (item) =>
        item.emprestimo_prazo || prazoPorPropostaId[item.proposta_id] || prazoPorContrato[String(item.contrato || '')] || null;

      // Buscar adiantamentos descontados neste lote
      let adiantamentosDesc = [];
      try {
        adiantamentosDesc = await base44.asServiceRole.entities.Adiantamento.filter({ lote_pagamento_id: lote_id });
      } catch (_) { adiantamentosDesc = []; }

      const subtotal = loteItens.reduce((acc, item) => acc + (item.valor_vendedor_pago || 0), 0);
      const totalAdiantamentos = adiantamentosDesc.reduce((acc, a) => acc + (a.valor || 0), 0);
      const totalLiquido = lote.valor_total ?? Math.max(0, subtotal - totalAdiantamentos);

      // Buscar logo configurada e dados do vendedor para manter o mesmo
      // padrão visual e informativo do relatório de consórcio.
      let logoConfigurada = null;
      try {
        const configs = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({ chave: 'logo_url' });
        if (configs && configs.length > 0 && configs[0].valor) logoConfigurada = configs[0].valor;
      } catch (_) {}

      let vendedorNome = lote.vendedor_nome || '-';
      let vendedorCpf = '';
      let vendedorPix = '';
      if (lote.vendedor_id) {
        try {
          let colabs = await base44.asServiceRole.entities.Colaborador.filter({ id: lote.vendedor_id });
          if (!colabs || colabs.length === 0) {
            colabs = await base44.asServiceRole.entities.Colaborador.filter({ user_id: lote.vendedor_id });
          }
          if (colabs && colabs.length > 0) {
            vendedorNome = colabs[0].nome || vendedorNome;
            vendedorCpf = colabs[0].cpf || '';
            vendedorPix = colabs[0].pix_chave || colabs[0].chave_pix || '';
          }
        } catch (_) {}
      }

      // Mesmo relatório do consórcio: usa o mesmo gerador de HTML, mudando
      // apenas as colunas da tabela principal.
      let empresaNome = 'JD PROMOTORA';
      try {
        const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: lote.empresa_id });
        if (empresas && empresas.length > 0) empresaNome = empresas[0].nome_fantasia || empresas[0].nome || empresaNome;
      } catch (_) {}

      const tabela = {
        colunas: ['Cliente', 'CPF', 'Contrato', 'Tipo', 'Banco', 'Data Lib.', 'Prazo', 'Vl. Bruto', 'Vl. Líquido', 'Vl. Parcela', '% Vendedor', 'Vl. a Pagar'],
        alinhamentos: ['left', 'left', 'left', 'left', 'left', 'left', 'right', 'right', 'right', 'right', 'right', 'right'],
        colunaDestaque: 11,
        linhas: loteItens.map((item) => {
          const prazo = prazoDoItem(item);
          return [
            item.cliente_nome || '-',
            item.cliente_cpf || '-',
            item.contrato || '-',
            getTipoLabel(item.emprestimo_tipo),
            item.banco || '-',
            fmtDate(item.data_liberacao),
            prazo ? `${prazo}x` : '-',
            fmt(item.valor_credito),
            item.valor_liquido ? fmt(item.valor_liquido) : '-',
            item.valor_parcela ? fmt(item.valor_parcela) : '-',
            `${Number(item.percentual_vendedor_pago || 0).toFixed(2)}%`,
            fmt(item.valor_vendedor_pago),
          ];
        }),
      };

      const html = anexarComprovanteHTML(gerarRelatorioComissaoConsorcioHTML({
        loteCode: lote.lote_codigo || lote_id,
        vendedorNome,
        vendedorCpf,
        pix: vendedorPix,
        dataPagamento: lote.data_pagamento,
        formaPagamento: lote.forma_pagamento,
        observacao: lote.observacao,
        geradoPor: lote.quitado_por_nome,
        geradoEm: new Date().toLocaleString('pt-BR'),
        logoUrl: logoConfigurada,
        empresaNome,
        tabela,
        subtotal,
        totalAdiantamentos,
        acrescimos: lote.acrescimos || 0,
        totalLiquido,
        totalPago: totalLiquido,
        adiantamentos: adiantamentosDesc.map((a) => ({ valor: a.valor, data: a.data_desconto || a.data, motivo: a.motivo })),
      }), lote.comprovante_url);

      return Response.json({ relatorio_html: html });
    }

    return Response.json({ error: 'Tipo invalido' }, { status: 400 });

  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});