import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { jsPDF } from 'npm:jspdf@2.5.2';
import 'npm:jspdf-autotable@3.8.4';

function removerAcentos(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function fmt(v) {
  return 'R$ ' + (v || 0).toFixed(2).replace('.', ',');
}

function fmtDate(d) {
  if (!d) return '-';
  const dateStr = String(d).length <= 10 ? d + 'T12:00:00' : d;
  return new Date(dateStr).toLocaleDateString('pt-BR');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lote_id, tipo } = await req.json();
    if (!lote_id || !tipo) return Response.json({ error: 'lote_id e tipo sao obrigatorios' }, { status: 400 });

    // ─── CONSÓRCIO: retorna o relatorio_html armazenado ───────────────────────
    if (tipo === 'consorcio') {
      const lote = await base44.asServiceRole.entities.PagamentoComissaoLote.filter({ id: lote_id });
      const l = lote?.[0];
      if (!l) return Response.json({ error: 'Lote nao encontrado' }, { status: 404 });

      if (l.relatorio_html) {
        return Response.json({ relatorio_html: l.relatorio_html });
      }
      return Response.json({ error: 'Relatorio nao disponivel para este lote' }, { status: 404 });
    }

    // ─── EMPRÉSTIMOS: busca o lote e propostas associadas, gera PDF detalhado ─
    if (tipo === 'emp') {
      const lotes = await base44.asServiceRole.entities.LotePagamentoComissaoEmprestimo.filter({ id: lote_id });
      const lote = lotes?.[0];
      if (!lote) return Response.json({ error: 'Lote nao encontrado' }, { status: 404 });

      // Buscar propostas pagas neste lote (vendedor + data_pagamento)
      const todasPropostas = await base44.asServiceRole.entities.Proposta.filter({
        empresa_id: lote.empresa_id,
        vendedor_id: lote.vendedor_id,
        comissao_vendedor_paga: true,
        comissao_vendedor_data_pagamento: lote.data_pagamento,
      }, '-data_venda', 500);

      const propostas = todasPropostas.filter(p => p.produto === 'emprestimo' || p.emprestimo_tipo);

      // Gerar PDF comprovante detalhado
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      // Cabeçalho
      doc.setFillColor(16, 53, 60);
      doc.rect(0, 0, 297, 22, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('COMPROVANTE DE PAGAMENTO DE COMISSAO - EMPRESTIMOS', 148, 10, { align: 'center' });
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Lote: ${lote.lote_codigo || lote_id} | Gerado em: ${new Date().toLocaleString('pt-BR')}`, 148, 17, { align: 'center' });

      // Dados do vendedor
      doc.setTextColor(0);
      doc.setFillColor(245, 247, 250);
      doc.rect(10, 26, 277, 18, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Vendedor:', 14, 32);
      doc.text('Data Pagamento:', 90, 32);
      doc.text('Forma Pagamento:', 170, 32);
      doc.text('Qtd. Itens:', 240, 32);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(removerAcentos(lote.vendedor_nome || '-'), 14, 39);
      doc.text(fmtDate(lote.data_pagamento), 90, 39);
      doc.text(removerAcentos(lote.forma_pagamento || '-'), 170, 39);
      doc.text(String(propostas.length), 240, 39);

      // Tabela de propostas
      const rows = propostas.map(p => [
        removerAcentos(p.cliente_nome || '-'),
        p.contrato || '-',
        removerAcentos(p.emprestimo_tipo || 'Novo'),
        removerAcentos(p.administradora_nome || p.empresa_parceira_nome || '-'),
        fmtDate(p.emprestimo_data_liberacao),
        fmt(p.valor_credito),
        fmt(p.valor_liquido),
        p.emprestimo_valor_parcela ? fmt(p.emprestimo_valor_parcela) : '-',
        (p.percentual_comissao_vendedor || 0).toFixed(2) + '%',
        fmt(p.valor_comissao_vendedor_pago || p.valor_comissao),
      ]);

      const subtotal = propostas.reduce((a, p) => a + (p.valor_comissao_vendedor_pago || p.valor_comissao || 0), 0);

      doc.autoTable({
        startY: 48,
        head: [['Cliente', 'Contrato', 'Tipo', 'Banco', 'Data Lib.', 'Vl. Bruto', 'Vl. Liquido', 'Vl. Parcela', '% Vendedor', 'Vl. a Pagar']],
        body: rows,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [16, 53, 60], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: {
          9: { textColor: [0, 0, 200], fontStyle: 'bold', halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
          7: { halign: 'right' },
        },
        margin: { left: 10, right: 10 },
      });

      const finalY = doc.lastAutoTable.finalY || 48;

      // Subtotal
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Subtotal Comissoes:', 200, finalY + 8);
      doc.setTextColor(0, 0, 200);
      doc.text(fmt(subtotal), 280, finalY + 8, { align: 'right' });

      // Total final
      doc.setFillColor(16, 53, 60);
      doc.rect(10, finalY + 12, 277, 12, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`TOTAL A PAGAR: ${fmt(lote.valor_total || subtotal)}`, 18, finalY + 20);

      const pdfBytes = doc.output('arraybuffer');
      return new Response(pdfBytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="comprovante_${lote.lote_codigo || lote_id}.pdf"`,
        },
      });
    }

    return Response.json({ error: 'Tipo invalido' }, { status: 400 });

  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});