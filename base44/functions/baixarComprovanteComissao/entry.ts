import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { jsPDF } from 'npm:jspdf@2.5.2';
import { PDFDocument } from 'npm:pdf-lib@1.17.1';
import 'npm:jspdf-autotable@3.8.4';
import { gerarRelatorioComissaoConsorcioHTML } from '../../shared/relatorioComissaoConsorcioShared.ts';

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

      // Se houver comprovante, injetar imagem antes do </body>
      if (l.comprovante_url) {
        const comprovanteSection = `
            <div style="page-break-before: always; padding: 20px; text-align: center;">
              <h2 style="font-family: Arial, sans-serif; color: #10353c; border-bottom: 2px solid #10353c; padding-bottom: 8px; margin-bottom: 16px;">Comprovante de Pagamento</h2>
              <img src="${l.comprovante_url}" style="max-width: 100%; max-height: 80vh; border: 1px solid #ccc; border-radius: 6px;" />
            </div>`;
        html = html.replace('</body>', comprovanteSection + '</body>');
      }

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

      // Gerar PDF com a mesma estrutura visual do relatório de consórcio
      const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // ===== CABEÇALHO — mesmo padrão do relatório de consórcio =====
      doc.setFillColor(16, 53, 60);
      doc.rect(0, 0, pageWidth, 22, 'F');

      let tituloX = 12;
      if (logoConfigurada) {
        try {
          doc.addImage(logoConfigurada, 'PNG', 7, 3, 40, 16);
          tituloX = 50;
        } catch (_) {}
      }

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12); doc.setFont('helvetica', 'bold');
      doc.text('COMPROVANTE DE PAGAMENTO DE COMISSÃO', tituloX, 10);
      doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.setTextColor(207, 224, 224);
      doc.text(`Protocolo: ${lote.lote_codigo || lote_id}  |  Emitido em: ${fmtDateTime(new Date())}`, tituloX, 17);

      doc.setFontSize(8); doc.setTextColor(255, 180, 180);
      doc.setFont('helvetica', 'bold');
      doc.text('2ª VIA', pageWidth - 8, 10, { align: 'right' });

      // ===== BLOCO DE INFORMAÇÕES (4 colunas) =====
      doc.setTextColor(0, 0, 0);
      const infoY = 26;
      const colW = (pageWidth - 20) / 4;
      const cols = [
        { label: 'VENDEDOR', value: vendedorNome },
        { label: 'DATA PAGAMENTO', value: fmtDate(lote.data_pagamento) },
        { label: 'FORMA PAGAMENTO', value: lote.forma_pagamento || '-' },
        { label: 'QTD. ITENS', value: String(loteItens.length || lote.quantidade_propostas || 0) },
      ];
      cols.forEach((col, i) => {
        const x = 10 + colW * i;
        doc.setFillColor(245, 247, 250);
        doc.setDrawColor(200, 215, 230);
        doc.setLineWidth(0.4);
        doc.roundedRect(x, infoY, colW - 2, 16, 1, 1, 'FD');
        doc.setFontSize(6); doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 120, 140);
        doc.text(col.label, x + 3, infoY + 5);
        doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.setTextColor(16, 53, 60);
        const displayValue = doc.splitTextToSize(col.value, colW - 6)[0] || col.value;
        doc.text(displayValue, x + 3, infoY + 12);
      });

      // PIX/CPF e total pago, como no relatório de consórcio.
      let detalhesY = 48;
      doc.setTextColor(31, 41, 55);
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
      const dadosVendedor = [];
      if (vendedorPix) dadosVendedor.push(`PIX: ${vendedorPix}`);
      if (vendedorCpf) dadosVendedor.push(`CPF: ${vendedorCpf}`);
      if (dadosVendedor.length > 0) {
        doc.text(dadosVendedor.join('  |  '), 10, detalhesY);
        detalhesY += 6;
      }
      doc.setFontSize(8.5);
      doc.text('Total pago ao corretor:', 10, detalhesY);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 80, 180);
      doc.text(fmt(totalLiquido), 45, detalhesY);
      doc.setTextColor(31, 41, 55);

      // ===== TABELA PRINCIPAL =====
      doc.autoTable({
        startY: detalhesY + 5,
        head: [['Cliente', 'CPF', 'Contrato', 'Tipo', 'Banco', 'Data Lib.', 'Prazo', 'Vl. Bruto', 'Vl. Liquido', 'Vl. Parcela', '% Vendedor', 'Vl. a Pagar']],
        body: loteItens.map(item => {
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
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [16, 53, 60], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' },
          9: { halign: 'right' }, 10: { halign: 'right' },
          11: { halign: 'right', textColor: [0, 100, 180], fontStyle: 'bold' }
        },
        margin: { left: 10, right: 10 },
      });

      const tableEndY = doc.lastAutoTable.finalY;
      const sectionY = tableEndY + 8;

      // ===== LAYOUT LADO A LADO: RESUMO FINANCEIRO (esq) + DETALHES ACRÉSCIMOS (dir) =====
      const colEsqX = 10;
      const colEsqW = 130;
      const colDirX = 148;
      const colDirW = pageWidth - colDirX - 10;
      const boxPad = 4;
      const lineH = 6;

      const resumoLinhas = [
        { label: 'Subtotal de Comissoes', valor: fmt(subtotal), cor: [0, 100, 180] },
        { label: '(-) Adiantamentos', valor: fmt(totalAdiantamentos), cor: [200, 100, 0] },
        { label: '(+) Acrescimos', valor: fmt(0), cor: [60, 60, 60] },
      ];
      const resumoContentH = 8 + resumoLinhas.length * lineH + 2 + 14;

      // Caixa esquerda: Resumo Financeiro
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(200, 210, 220);
      doc.setLineWidth(0.4);
      doc.roundedRect(colEsqX, sectionY, colEsqW, resumoContentH, 1, 1, 'FD');
      doc.setFontSize(7); doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 40, 40);
      doc.text('RESUMO FINANCEIRO', colEsqX + boxPad, sectionY + 6);

      resumoLinhas.forEach((l, i) => {
        const ly = sectionY + 12 + i * lineH;
        doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        doc.text(l.label, colEsqX + boxPad, ly);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...l.cor);
        doc.text(l.valor, colEsqX + colEsqW - boxPad, ly, { align: 'right' });
      });

      const sepY = sectionY + 12 + resumoLinhas.length * lineH + 2;
      doc.setDrawColor(180, 195, 210); doc.setLineWidth(0.3);
      doc.line(colEsqX + boxPad, sepY, colEsqX + colEsqW - boxPad, sepY);
      const liqBoxY = sepY + 1;
      doc.setFillColor(230, 240, 255);
      doc.rect(colEsqX, liqBoxY, colEsqW, 12, 'F');
      doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.setTextColor(16, 53, 60);
      doc.text('VALOR LÍQUIDO A PAGAR', colEsqX + boxPad, liqBoxY + 8);
      doc.setFontSize(10);
      doc.setTextColor(0, 80, 180);
      doc.text(fmt(totalLiquido), colEsqX + colEsqW - boxPad, liqBoxY + 8, { align: 'right' });

      // Caixa direita: Detalhes Acréscimos
      const dirContentH = resumoContentH;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(200, 210, 220); doc.setLineWidth(0.4);
      doc.roundedRect(colDirX, sectionY, colDirW, dirContentH, 1, 1, 'FD');
      doc.setFontSize(7); doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 40, 40);
      doc.text('DETALHES DOS ACRESCIMOS', colDirX + boxPad, sectionY + 6);
      doc.setFontSize(6); doc.setFont('helvetica', 'normal');
      doc.setTextColor(130, 130, 130);
      doc.text('Acrescimos lancados manualmente.', colDirX + boxPad, sectionY + 11);

      const tblY = sectionY + 15;
      doc.setFillColor(240, 242, 245);
      doc.rect(colDirX + boxPad, tblY, colDirW - boxPad * 2, 6, 'F');
      doc.setFontSize(6); doc.setFont('helvetica', 'bold');
      doc.setTextColor(80, 80, 80);
      doc.text('Descricao do Acrescimo', colDirX + boxPad + 2, tblY + 4);
      doc.text('Tipo', colDirX + boxPad + 70, tblY + 4);
      doc.text('Valor', colDirX + colDirW - boxPad - 2, tblY + 4, { align: 'right' });

      const totalAcrescimosY = sectionY + dirContentH - 8;
      doc.setDrawColor(180, 195, 210); doc.setLineWidth(0.3);
      doc.line(colDirX + boxPad, totalAcrescimosY - 2, colDirX + colDirW - boxPad, totalAcrescimosY - 2);
      doc.setFontSize(7); doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 40, 40);
      doc.text('TOTAL DE ACRESCIMOS', colDirX + boxPad, totalAcrescimosY + 3);
      doc.text(fmt(0), colDirX + colDirW - boxPad - 2, totalAcrescimosY + 3, { align: 'right' });

      const footerY = Math.max(sectionY + resumoContentH + 8, pageHeight - 12);
      doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
      doc.line(10, footerY, pageWidth - 10, footerY);
      doc.setFontSize(6.2); doc.setTextColor(100, 100, 100); doc.setFont('helvetica', 'normal');
      doc.text('Comprovante emitido eletronicamente.', 10, footerY + 3.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(16, 53, 60);
      doc.text('JD PROMOTORA', 148, footerY + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(`Gerado em: ${fmtDateTime(new Date())}`, pageWidth - 10, footerY + 3.5, { align: 'right' });

      let comprovantePdfBytes = null;
      // Se houver comprovante de pagamento, adicionar como página seguinte
      if (lote.comprovante_url) {
        try {
          const comprovanteResp = await fetch(lote.comprovante_url);
          if (!comprovanteResp.ok) throw new Error(`Falha ao carregar comprovante: HTTP ${comprovanteResp.status}`);
          const comprovanteBuffer = await comprovanteResp.arrayBuffer();
          const comprovanteBytes = new Uint8Array(comprovanteBuffer);

          const isPdf = new TextDecoder().decode(comprovanteBytes.slice(0, 5)) === '%PDF-' ||
            comprovanteResp.headers.get('content-type')?.includes('application/pdf') ||
            /\.pdf(?:$|[?#])/i.test(lote.comprovante_url);

          if (!isPdf) {
            // Imagem: adicionar nova página e inserir imagem centralizada
            doc.addPage('landscape');

            // Cabeçalho da página do comprovante
            doc.setFillColor(16, 53, 60);
            doc.rect(0, 0, 297, 14, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(11); doc.setFont('helvetica', 'bold');
            doc.text('COMPROVANTE DE PAGAMENTO', 148, 9, { align: 'center' });

            // Converter Uint8Array para base64
            let binary = '';
            for (let i = 0; i < comprovanteBytes.length; i++) {
              binary += String.fromCharCode(comprovanteBytes[i]);
            }
            const base64Img = btoa(binary);
            const contentType = comprovanteResp.headers.get('content-type') || 'image/jpeg';
            const imgFormat = contentType.includes('png') ? 'PNG' : 'JPEG';
            const dataUrlComprovante = `data:${contentType};base64,${base64Img}`;

            // Área disponível abaixo do cabeçalho (página A4 paisagem em mm)
            const areaX = 12;
            const areaY = 18;
            const maxLargura = 297 - areaX * 2;
            const maxAltura = 210 - areaY - 10;

            // Mantém a proporção original do comprovante: ajusta apenas para caber na folha,
            // sem esticar/achatar e sem ampliar (imagem ampliada perde nitidez).
            try {
              const props = doc.getImageProperties(dataUrlComprovante);
              const escala = Math.min(maxLargura / props.width, maxAltura / props.height, 1);
              const imgLargura = props.width * escala;
              const imgAltura = props.height * escala;
              doc.addImage(
                dataUrlComprovante, imgFormat,
                (297 - imgLargura) / 2,
                areaY + (maxAltura - imgAltura) / 2,
                imgLargura, imgAltura
              );
            } catch (_) {
              // Sem as dimensões originais: informa largura 0 para a própria jsPDF calcular
              // a largura proporcional à altura máxima.
              doc.addImage(dataUrlComprovante, imgFormat, areaX, areaY, 0, maxAltura);
            }
          }
          if (isPdf) comprovantePdfBytes = comprovanteBytes;
        } catch (error) {
          throw new Error(`Não foi possível incluir o comprovante de pagamento. ${error.message}`);
        }
      }

      // Retorna PDF como base64
      let pdfBase64 = doc.output('datauristring');
      if (comprovantePdfBytes) {
        const relatorio = await PDFDocument.load(doc.output('arraybuffer'));
        const comprovante = await PDFDocument.load(comprovantePdfBytes);
        const paginas = await relatorio.copyPages(comprovante, comprovante.getPageIndices());
        for (const pagina of paginas) relatorio.addPage(pagina);
        const bytes = await relatorio.save();
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        pdfBase64 = `data:application/pdf;base64,${btoa(binary)}`;
      }
      return Response.json({ pdf_base64: pdfBase64, filename: `comissao_emp_${(lote.vendedor_nome || 'vendedor').replace(/\s+/g, '_')}_${lote.data_pagamento?.replace(/-/g, '') || 'data'}_2via.pdf` });
    }

    return Response.json({ error: 'Tipo invalido' }, { status: 400 });

  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});