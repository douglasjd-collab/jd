import jsPDF from 'jspdf';
import 'jspdf-autotable';
import moment from 'moment';
import 'moment/locale/pt-br';

moment.locale('pt-br');

const BRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const PCT = (v, total) => (total > 0 ? `${((v / total) * 100).toFixed(1)}%` : '—');

/**
 * Gera o PDF do Demonstrativo de Resultado (DRE).
 *
 * @param {Object} opts
 * @param {string} opts.periodo — 'YYYY-MM'
 * @param {string} opts.filialNome — 'Consolidado (Grupo)' ou o nome da filial
 * @param {Object[]} opts.linhas — [{ label, valor, tipo }] (as mesmas linhas exibidas na tela)
 * @param {Object[]} opts.despesasPorCategoria — [[categoria, valor]]
 * @param {number} opts.receitasBrutas
 * @param {number} opts.despesasOperacionais
 * @returns {jsPDF} doc (o chamador usa doc.save(...) ou doc.output('blob'))
 */
export function gerarPdfDRE(opts) {
  const {
    periodo,
    filialNome = 'Consolidado (Grupo)',
    linhas = [],
    despesasPorCategoria = [],
    receitasBrutas = 0,
    despesasOperacionais = 0,
  } = opts || {};

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const periodoLabel = moment(periodo, 'YYYY-MM').format('MMMM [de] YYYY');

  // ===== HEADER institucional =====
  doc.setFillColor(16, 53, 60);
  doc.rect(0, 0, pageWidth, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('DEMONSTRATIVO DE RESULTADO (DRE)', pageWidth / 2, 10, { align: 'center' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 220, 220);
  doc.text(
    `Período: ${periodoLabel}  |  ${filialNome}  |  Gerado em: ${moment().format('DD/MM/YYYY [às] HH:mm')}`,
    pageWidth / 2,
    17,
    { align: 'center' }
  );

  // ===== TABELA DO DRE =====
  doc.autoTable({
    startY: 28,
    head: [['Descrição', 'Valor', '% da Receita']],
    body: linhas.map((l) => [
      l.label,
      BRL(Math.abs(l.valor || 0)),
      receitasBrutas > 0 ? PCT(Math.abs(l.valor || 0), receitasBrutas) : '—',
    ]),
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [16, 53, 60], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const linha = linhas[data.row.index];
      if (!linha) return;
      if (linha.tipo === 'total') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [226, 236, 252];
        data.cell.styles.textColor = [20, 60, 130];
      } else if (linha.tipo === 'subtotal') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [239, 243, 247];
      } else if (linha.tipo === 'titulo') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [230, 246, 236];
      }
      if (data.column.index > 0) data.cell.styles.halign = 'right';
    },
  });

  const yAposDre = (doc.lastAutoTable?.finalY || 28) + 8;

  // ===== TABELA DE DESPESAS POR CATEGORIA =====
  if (despesasPorCategoria.length > 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text('DESPESAS POR CATEGORIA (COMPETÊNCIA)', 14, yAposDre);

    doc.autoTable({
      startY: yAposDre + 3,
      head: [['Categoria', 'Valor', '% das Despesas']],
      body: despesasPorCategoria.map(([cat, valor]) => [String(cat), BRL(valor || 0), PCT(valor || 0, despesasOperacionais)]),
      foot: [['Total', BRL(despesasOperacionais), despesasOperacionais > 0 ? '100%' : '—']],
      styles: { fontSize: 8.5, cellPadding: 2.2 },
      headStyles: { fillColor: [16, 53, 60], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [239, 243, 247], textColor: [30, 30, 30], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
  }

  // ===== RODAPÉ em todas as páginas =====
  const totalPages = doc.internal.getNumberOfPages();
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);
    const footerY = pageHeight - 16;
    doc.setDrawColor(180, 195, 210);
    doc.setLineWidth(0.3);
    doc.line(14, footerY, pageWidth - 14, footerY);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60, 80, 90);
    doc.text('JD PROMOTORA', 14, footerY + 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(110, 110, 110);
    doc.text('Demonstrativo gerado eletronicamente pelo sistema.', 14, footerY + 7.5);

    doc.text(`Período: ${periodoLabel}  |  ${filialNome}`, pageWidth / 2, footerY + 4, { align: 'center' });
    doc.text(`Gerado em: ${moment().format('DD/MM/YYYY [às] HH:mm')}`, pageWidth / 2, footerY + 7.5, { align: 'center' });
    doc.text(`Página ${pg} de ${totalPages}`, pageWidth - 14, footerY + 4, { align: 'right' });
  }

  return doc;
}

export default gerarPdfDRE;