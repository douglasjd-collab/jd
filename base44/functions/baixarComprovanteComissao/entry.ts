import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { jsPDF } from 'npm:jspdf@2.5.2';
import 'npm:jspdf-autotable@3.8.4';

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lote_id, tipo } = await req.json();
    if (!lote_id || !tipo) return Response.json({ error: 'lote_id e tipo sao obrigatorios' }, { status: 400 });

    // ─── CONSÓRCIO: retorna o relatorio_html armazenado ────────────────────────
    if (tipo === 'consorcio') {
      const lotes = await base44.asServiceRole.entities.PagamentoComissaoLote.filter({ id: lote_id });
      const l = lotes?.[0];
      if (!l) return Response.json({ error: 'Lote nao encontrado' }, { status: 404 });
      if (l.relatorio_html) return Response.json({ relatorio_html: l.relatorio_html });
      return Response.json({ error: 'Relatorio nao disponivel para este lote' }, { status: 404 });
    }

    // ─── EMPRÉSTIMOS: busca lote + snapshots ComissaoEmprestimoPaga ────────────
    if (tipo === 'emp') {
      const lotes = await base44.asServiceRole.entities.LotePagamentoComissaoEmprestimo.filter({ id: lote_id });
      const lote = lotes?.[0];
      if (!lote) return Response.json({ error: 'Lote nao encontrado' }, { status: 404 });

      // Buscar snapshots dos itens do lote
      const loteItens = await base44.asServiceRole.entities.ComissaoEmprestimoPaga.filter(
        { lote_pagamento_id: lote_id }, '-created_date', 500
      );

      // Buscar adiantamentos descontados neste lote
      let adiantamentosDesc = [];
      try {
        adiantamentosDesc = await base44.asServiceRole.entities.Adiantamento.filter({ lote_pagamento_id: lote_id });
      } catch {}

      const subtotal = loteItens.reduce((acc, item) => acc + (item.valor_vendedor_pago || 0), 0);
      const totalAdiantamentos = adiantamentosDesc.reduce((acc, a) => acc + (a.valor || 0), 0);
      const totalLiquido = lote.valor_total ?? Math.max(0, subtotal - totalAdiantamentos);

      // Gerar PDF idêntico ao ComissoesPagasEmprestimos.jsx
      const doc = new jsPDF({ orientation: 'landscape' });

      doc.setFillColor(16, 53, 60);
      doc.rect(0, 0, 297, 22, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text('COMPROVANTE DE PAGAMENTO DE COMISSAO - EMPRESTIMOS', 148, 10, { align: 'center' });
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text(`Lote: ${lote.lote_codigo || lote_id}  |  Gerado em: ${fmtDateTime(new Date())}`, 148, 17, { align: 'center' });

      // Marca 2ª VIA
      doc.setFontSize(8); doc.setTextColor(180, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text('2a VIA', 280, 10, { align: 'right' });

      doc.setTextColor(0, 0, 0);
      doc.setFillColor(245, 247, 250);
      doc.roundedRect(10, 26, 277, 22, 2, 2, 'F');
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text('Vendedor:', 14, 33); doc.text('Data Pagamento:', 90, 33);
      doc.text('Forma Pagamento:', 160, 33); doc.text('Qtd. Itens:', 230, 33);
      doc.setFont('helvetica', 'normal');
      doc.text(lote.vendedor_nome || '-', 14, 39);
      doc.text(fmtDate(lote.data_pagamento), 90, 39);
      doc.text(lote.forma_pagamento || '-', 160, 39);
      doc.text(String(loteItens.length || lote.quantidade_propostas || 0), 230, 39);

      doc.autoTable({
        startY: 54,
        head: [['Cliente', 'Contrato', 'Tipo', 'Banco', 'Data Lib.', 'Vl. Bruto', 'Vl. Liquido', 'Vl. Parcela', '% Vendedor', 'Vl. a Pagar']],
        body: loteItens.map(item => [
          item.cliente_nome || '-',
          item.contrato || '-',
          getTipoLabel(item.emprestimo_tipo),
          item.banco || '-',
          fmtDate(item.data_liberacao),
          fmt(item.valor_credito),
          item.valor_liquido ? fmt(item.valor_liquido) : '-',
          item.valor_parcela ? fmt(item.valor_parcela) : '-',
          `${Number(item.percentual_vendedor_pago || 0).toFixed(2)}%`,
          fmt(item.valor_vendedor_pago),
        ]),
        foot: [['', '', '', '', '', '', '', '', 'Subtotal Comissoes:', fmt(subtotal)]],
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [16, 53, 60], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [230, 240, 255], fontStyle: 'bold', textColor: [0, 0, 0] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right', textColor: [0, 80, 180] } },
      });

      let cursorY = doc.lastAutoTable.finalY + 6;

      // Adiantamentos descontados
      if (adiantamentosDesc.length > 0) {
        doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.setTextColor(180, 80, 0);
        doc.text('Adiantamentos Descontados:', 14, cursorY + 5);
        cursorY += 3;

        doc.autoTable({
          startY: cursorY + 4,
          head: [['Descricao / Motivo', 'Data Adiantamento', 'Valor Descontado']],
          body: adiantamentosDesc.map(a => [
            a.motivo || 'Adiantamento de Salario',
            fmtDate(a.data_desconto || a.data),
            fmt(a.valor),
          ]),
          foot: [['', 'Total Adiantamentos:', fmt(totalAdiantamentos)]],
          styles: { fontSize: 7, cellPadding: 2 },
          headStyles: { fillColor: [180, 90, 0], textColor: 255, fontStyle: 'bold' },
          footStyles: { fillColor: [255, 240, 220], fontStyle: 'bold', textColor: [150, 60, 0] },
          columnStyles: { 2: { halign: 'right' } },
          margin: { left: 14, right: 14 },
        });

        cursorY = doc.lastAutoTable.finalY + 4;
      }

      // Resumo final
      const boxH = adiantamentosDesc.length > 0 ? 22 : 12;
      doc.setFillColor(16, 53, 60);
      doc.roundedRect(10, cursorY, 277, boxH, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      if (adiantamentosDesc.length > 0) {
        doc.setFontSize(10);
        doc.text(`Subtotal: ${fmt(subtotal)}`, 16, cursorY + 7);
        doc.text(`(-) Adiantamentos: ${fmt(totalAdiantamentos)}`, 110, cursorY + 7);
        doc.setFontSize(11);
        doc.text(`VALOR LIQUIDO A PAGAR: ${fmt(totalLiquido)}`, 16, cursorY + 17);
      } else {
        doc.setFontSize(10);
        doc.text(`TOTAL A PAGAR: ${fmt(totalLiquido)}`, 16, cursorY + 8);
      }

      const ph = doc.internal.pageSize.height;
      doc.setFontSize(7); doc.setTextColor(100, 100, 100);
      doc.text(`Gerado em ${fmtDateTime(new Date())}`, 148, ph - 5, { align: 'center' });

      // Retorna PDF como base64
      const pdfBase64 = doc.output('datauristring');
      return Response.json({ pdf_base64: pdfBase64, filename: `comissao_emp_${(lote.vendedor_nome || 'vendedor').replace(/\s+/g, '_')}_${lote.data_pagamento?.replace(/-/g, '') || 'data'}_2via.pdf` });
    }

    return Response.json({ error: 'Tipo invalido' }, { status: 400 });

  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});