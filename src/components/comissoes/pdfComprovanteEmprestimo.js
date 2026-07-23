import jsPDF from 'jspdf';
import 'jspdf-autotable';
import moment from 'moment';
import 'moment/locale/pt-br';
import { mascararChavePix, mascararDocumento } from '@/utils/mascaraPix';

moment.locale('pt-br');

const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const TIPO_EMPRESTIMO_LABEL = {
  'NOVO': 'Novo',
  'novo': 'Novo',
  'REFINANCIAMENTO': 'Refin',
  'refinanciamento': 'Refin',
  'PORTABILIDADE': 'Portabilidade',
  'portabilidade': 'Portabilidade',
  'CARTAO_CONSIGNADO': 'Cartão',
  'cartao_consignado': 'Cartão',
};
const getTipoLabel = (tipo) => TIPO_EMPRESTIMO_LABEL[tipo] || tipo || '-';

const TIPO_CHAVE_LABEL = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  celular: 'Celular',
  telefone: 'Telefone',
  email: 'E-mail',
  aleatoria: 'Chave aleatória',
};

/**
 * Gera o PDF do comprovante de pagamento de comissão (Empréstimos).
 *
 * @param {Object} opts
 * @param {string} opts.vendedorNome
 * @param {string} opts.dataPagamento — 'YYYY-MM-DD'
 * @param {string} opts.formaPagamento — 'PIX' | 'Dinheiro' | 'Transferência Bancária'
 * @param {string} opts.loteCode
 * @param {Object[]} opts.itens — propostas pagas
 * @param {Object} opts.percMap — { [propostaId]: percentual }
 * @param {Object[]} opts.adiantamentosDesc — [{valor, ...}]
 * @param {number} opts.acrescimoVal
 * @param {string} opts.acrescimoDesc
 * @param {Object} opts.pix — { tipo, chave, titularNome, titularDocumento, instituicao }
 * @param {string} opts.codigoAutenticacao — UUID/curto
 * @param {boolean} opts.comprovanteAnexado
 * @param {string|null} opts.logoUrl
 * @returns {jsPDF} doc (caller uses doc.output('blob') or doc.save(...))
 */
export function gerarPdfComprovanteEmprestimo(opts) {
  const {
    vendedorNome, dataPagamento, formaPagamento, loteCode,
    itens = [], percMap = {}, adiantamentosDesc = [],
    acrescimoVal = 0, acrescimoDesc = '',
    pix = null, codigoAutenticacao = '', comprovanteAnexado = false,
    logoUrl = null,
  } = opts;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const getPercentualVendedor = (p) =>
    percMap[p.id] !== undefined ? percMap[p.id] : (p.comissao_banco_percentual_recebido || p.percentual_empresa || 100);
  const getBaseComissao = (p) => p.comissao_banco_base_comissao || p.valor_credito || 0;
  const getValorAPagar = (p) => {
    const perc = getPercentualVendedor(p);
    return getBaseComissao(p) * (perc / 100);
  };

  const totalBruto = itens.reduce((acc, p) => acc + getValorAPagar(p), 0);
  const totalAdiantamentos = adiantamentosDesc.reduce((acc, a) => acc + (a.valor || 0), 0);
  const totalLiquido = Math.max(0, totalBruto - totalAdiantamentos + acrescimoVal);

  // ===== HEADER verde institucional =====
  doc.setFillColor(16, 53, 60);
  doc.rect(0, 0, pageWidth, 22, 'F');

  if (logoUrl) {
    try { doc.addImage(logoUrl, 'PNG', 7, 3, 40, 16); } catch (_) { /* silencioso */ }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('COMPROVANTE DE PAGAMENTO DE COMISSÃO — EMPRÉSTIMOS', pageWidth / 2, 10, { align: 'center' });
  doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 220, 220);
  doc.text(`Lote: ${loteCode}  |  Gerado em: ${moment().format('DD/MM/YYYY [às] HH:mm')}`, pageWidth / 2, 17, { align: 'center' });

  // ===== BLOCO DE INFORMAÇÕES (4 colunas) =====
  doc.setTextColor(0, 0, 0);
  const infoY = 26;
  const colW = (pageWidth - 20) / 4;
  const cols = [
    { label: 'VENDEDOR', value: vendedorNome || '-' },
    { label: 'DATA PAGAMENTO', value: moment(dataPagamento, 'YYYY-MM-DD').format('DD/MM/YYYY') },
    { label: 'FORMA PAGAMENTO', value: formaPagamento || '-' },
    { label: 'QTD. ITENS', value: String(itens.length) },
  ];
  cols.forEach((col, i) => {
    const x = 10 + colW * i;
    doc.setFillColor(245, 247, 250);
    doc.rect(x, infoY, colW - 2, 16, 'F');
    doc.setDrawColor(200, 215, 230); doc.setLineWidth(0.4);
    doc.rect(x, infoY, colW - 2, 16);
    doc.setFontSize(6); doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 120, 140);
    doc.text(col.label, x + 3, infoY + 5);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 53, 60);
    const maxWidth = colW - 6;
    const displayValue = doc.splitTextToSize(String(col.value), maxWidth)[0] || String(col.value);
    doc.text(displayValue, x + 3, infoY + 12);
  });

  // ===== TABELA PRINCIPAL =====
  const tableStartY = 47;
  doc.autoTable({
    startY: tableStartY,
    head: [['Cliente', 'CPF', 'Contrato', 'Tipo', 'Banco', 'Data Lib.', 'Vl. Bruto', 'Vl. Líquido', 'Vl. Parcela', '% Vendedor', 'Vl. Pago']],
    body: itens.map(p => {
      const perc = getPercentualVendedor(p);
      const base = getBaseComissao(p);
      const valPagar = base * (perc / 100);
      return [
        p.cliente_nome || '-',
        p.cliente_cpf || '-',
        p.contrato || '-',
        getTipoLabel(p.emprestimo_tipo),
        p.administradora_nome || '-',
        p.emprestimo_data_liberacao ? moment(p.emprestimo_data_liberacao).format('DD/MM/YYYY') : '-',
        fmt(p.valor_credito),
        p.valor_liquido ? fmt(p.valor_liquido) : '-',
        p.emprestimo_valor_parcela ? fmt(p.emprestimo_valor_parcela) : '-',
        `${perc.toFixed(2)}%`,
        fmt(valPagar),
      ];
    }),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [16, 53, 60], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
      9: { halign: 'right' },
      10: { halign: 'right', textColor: [0, 100, 180], fontStyle: 'bold' },
    },
    margin: { left: 10, right: 10, top: 47, bottom: 22 },
    repeatTableHeader: true,
    rowPageBreak: 'avoid',
  });

  const tableEndY = doc.lastAutoTable.finalY || 47;
  const sectionY = tableEndY + 6;

  const boxPad = 4;
  const lineH = 6;
  const colEsqX = 10;
  const colEsqW = 130;
  const colDirX = 148;
  const colDirW = pageWidth - colDirX - 10;

  // ===== RESUMO FINANCEIRO =====
  const resumoLinhas = [
    { label: 'Subtotal de Comissões', valor: fmt(totalBruto), cor: [0, 100, 180] },
    { label: '(-) Adiantamentos', valor: fmt(totalAdiantamentos), cor: [200, 100, 0] },
    { label: '(+) Acréscimos', valor: fmt(acrescimoVal), cor: [60, 60, 60] },
  ];
  const resumoContentH = 8 + resumoLinhas.length * lineH + 2 + 14;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(200, 210, 220); doc.setLineWidth(0.4);
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

  // VALOR LÍQUIDO PAGO com fundo verde-claro
  const liqBoxY = sepY + 1;
  doc.setFillColor(224, 247, 234);
  doc.rect(colEsqX, liqBoxY, colEsqW, 12, 'F');
  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.setTextColor(20, 110, 60);
  doc.text('VALOR LÍQUIDO PAGO', colEsqX + boxPad, liqBoxY + 8);
  doc.setFontSize(11);
  doc.setTextColor(20, 110, 60);
  doc.text(fmt(totalLiquido), colEsqX + colEsqW - boxPad, liqBoxY + 8, { align: 'right' });

  // ===== DETALHES DOS ACRÉSCIMOS =====
  const dirContentH = resumoContentH;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(200, 210, 220); doc.setLineWidth(0.4);
  doc.roundedRect(colDirX, sectionY, colDirW, dirContentH, 1, 1, 'FD');

  doc.setFontSize(7); doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 40);
  doc.text('DETALHES DOS ACRÉSCIMOS', colDirX + boxPad, sectionY + 6);

  doc.setFontSize(6); doc.setFont('helvetica', 'normal');
  doc.setTextColor(130, 130, 130);
  doc.text('Acréscimos lançados manualmente.', colDirX + boxPad, sectionY + 11);

  const tblY = sectionY + 15;
  doc.setFillColor(240, 242, 245);
  doc.rect(colDirX + boxPad, tblY, colDirW - boxPad * 2, 6, 'F');
  doc.setFontSize(6); doc.setFont('helvetica', 'bold');
  doc.setTextColor(80, 80, 80);
  doc.text('Descrição do Acréscimo', colDirX + boxPad + 2, tblY + 4);
  doc.text('Tipo', colDirX + boxPad + 55, tblY + 4);
  doc.text('Valor', colDirX + colDirW - boxPad - 2, tblY + 4, { align: 'right' });

  if (acrescimoVal > 0) {
    const rowY = tblY + 7;
    doc.setFontSize(6); doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    const descText = acrescimoDesc || 'Acréscimo';
    doc.text(doc.splitTextToSize(descText, 50)[0], colDirX + boxPad + 2, rowY + 3);
    doc.text('Manual', colDirX + boxPad + 55, rowY + 3);
    doc.setTextColor(0, 100, 0); doc.setFont('helvetica', 'bold');
    doc.text(fmt(acrescimoVal), colDirX + colDirW - boxPad - 2, rowY + 3, { align: 'right' });
  }

  const totalAcrescimosY = sectionY + dirContentH - 8;
  doc.setDrawColor(180, 195, 210); doc.setLineWidth(0.3);
  doc.line(colDirX + boxPad, totalAcrescimosY - 2, colDirX + colDirW - boxPad, totalAcrescimosY - 2);
  doc.setFontSize(7); doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 40);
  doc.text('TOTAL DE ACRÉSCIMOS', colDirX + boxPad, totalAcrescimosY + 3);
  doc.setTextColor(0, 0, 0);
  doc.text(fmt(acrescimoVal), colDirX + colDirW - boxPad - 2, totalAcrescimosY + 3, { align: 'right' });

  // ===== BLOCO DADOS DO PAGAMENTO =====
  const dadosY = sectionY + Math.max(resumoContentH, dirContentH) + 4;
  const dadosW = pageWidth - 20;

  const favNome = pix?.titularNome || vendedorNome || '';
  const favDoc = pix?.titularDocumento || '';
  const linhas = [];
  linhas.push(['Forma de pagamento', formaPagamento || '-']);
  if (favNome) linhas.push(['Favorecido', favNome]);
  if (favDoc) linhas.push(['CPF/CNPJ do favorecido', mascararDocumento(favDoc)]);
  if (pix?.tipo) linhas.push(['Tipo de chave', TIPO_CHAVE_LABEL[pix.tipo] || String(pix.tipo).toUpperCase()]);
  if (pix?.chave) linhas.push(['Chave PIX', mascararChavePix(pix.chave, pix.tipo)]);
  if (pix?.instituicao) linhas.push(['Instituição', pix.instituicao]);
  linhas.push(['Valor pago', fmt(totalLiquido)]);
  linhas.push(['Data e hora', `${moment().format('DD/MM/YYYY [às] HH:mm')}`]);
  linhas.push(['Comprovante bancário', comprovanteAnexado ? 'Comprovante bancário anexado' : 'Comprovante bancário não anexado']);

  const dadosLineH = 5;
  const dadosContentH = 8 + linhas.length * dadosLineH + 2;
  doc.setFillColor(252, 253, 252);
  doc.setDrawColor(200, 210, 220); doc.setLineWidth(0.4);
  doc.roundedRect(10, dadosY, dadosW, dadosContentH, 1, 1, 'FD');

  doc.setFontSize(7); doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 40);
  doc.text('DADOS DO PAGAMENTO', 10 + boxPad, dadosY + 6);

  linhas.forEach((linha, i) => {
    const ly = dadosY + 12 + i * dadosLineH;
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(linha[0], 10 + boxPad, ly);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    doc.text(String(linha[1]), 10 + 40, ly);
  });

  // ===== RODAPÉ PROFISSIONAL (em todas as páginas) =====
  const totalPages = doc.internal.getNumberOfPages();
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);
    const footerY = pageHeight - 16;
    doc.setDrawColor(180, 195, 210); doc.setLineWidth(0.3);
    doc.line(10, footerY, pageWidth - 10, footerY);

    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.setTextColor(60, 80, 90);
    doc.text('JD PROMOTORA', 10, footerY + 4);

    doc.setFont('helvetica', 'normal'); doc.setFontSize(6);
    doc.setTextColor(110, 110, 110);
    doc.text('Comprovante gerado eletronicamente pelo sistema.', 10, footerY + 7.5);

    doc.text(`Lote: ${loteCode}  |  Gerado em: ${moment().format('DD/MM/YYYY [às] HH:mm')}`, pageWidth / 2, footerY + 4, { align: 'center' });
    doc.setTextColor(40, 90, 110);
    doc.text(`Código de autenticação: ${codigoAutenticacao || '—'}`, pageWidth / 2, footerY + 7.5, { align: 'center' });

    doc.setTextColor(110, 110, 110);
    doc.text(`Página ${pg} de ${totalPages}`, pageWidth - 10, footerY + 4, { align: 'right' });

    doc.setFont('helvetica', 'italic');
    doc.setTextColor(140, 140, 140);
    doc.text('Este documento registra o pagamento das comissões relacionadas acima. A efetiva transferência dos recursos poderá ser confirmada pelo comprovante da instituição financeira.',
      pageWidth / 2, footerY + 12, { align: 'center', maxWidth: pageWidth - 30 });
  }

  return doc;
}

export function gerarCodigoAutenticacao() {
  // Gera código curto no formato AAAA-BBBB-CCCC — suficiente para rodapé de comprovante
  const chars = '0123456789ABCDEF';
  const parts = [];
  for (let p = 0; p < 3; p++) {
    let s = '';
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    parts.push(s);
  }
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    // mistura com parte do UUID para unicidade
    const uid = crypto.randomUUID().replace(/-/g, '').toUpperCase().slice(0, 4);
    parts[2] = uid;
  }
  return parts.join('-');
}

export default gerarPdfComprovanteEmprestimo;