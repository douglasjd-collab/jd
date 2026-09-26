import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { jsPDF } from 'npm:jspdf@2.5.2';
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
  const totalLiquido = Math.max(0, subtotal - totalAdiantamentos + acrescimos);

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

    const { lote_id, tipo } = await req.json();
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
    if (tipo === 'emp') {
      const lotes = await base44.asServiceRole.entities.LotePagamentoComissaoEmprestimo.filter({ id: lote_id });
      const lote = lotes?.[0];
      if (!lote) return Response.json({ error: 'Lote nao encontrado' }, { status: 404 });

      // Buscar snapshots dos itens do lote (novo sistema)
      let loteItens = await base44.asServiceRole.entities.ComissaoEmprestimoPaga.filter(
        { lote_pagamento_id: lote_id }, '-created_date', 500
      );

      // Fallback: lotes antigos não têm ComissaoEmprestimoPaga, busca nas Propostas
      if (loteItens.length === 0 && lote.vendedor_id && lote.data_pagamento) {
        const propostasLote = await base44.asServiceRole.entities.Proposta.filter({
          empresa_id: lote.empresa_id,
          vendedor_id: lote.vendedor_id,
          comissao_vendedor_paga: true,
          comissao_vendedor_data_pagamento: lote.data_pagamento,
        }, '-data_venda', 500);
        loteItens = propostasLote
          .filter(p => p.produto === 'emprestimo' || p.emprestimo_tipo)
          .map(p => ({
            cliente_nome: p.cliente_nome,
            contrato: p.contrato,
            emprestimo_tipo: p.emprestimo_tipo,
            banco: p.administradora_nome || p.empresa_parceira_nome,
            data_liberacao: p.emprestimo_data_liberacao || p.data_venda,
            valor_credito: p.valor_credito || 0,
            valor_liquido: p.valor_liquido || null,
            valor_parcela: p.emprestimo_valor_parcela || null,
            percentual_vendedor_pago: p.percentual_comissao_vendedor || 0,
            valor_vendedor_pago: p.valor_comissao_vendedor_pago || p.valor_comissao || 0,
          }));
      }

      // Buscar adiantamentos descontados neste lote
      let adiantamentosDesc = [];
      try {
        adiantamentosDesc = await base44.asServiceRole.entities.Adiantamento.filter({ lote_pagamento_id: lote_id });
      } catch (_) { adiantamentosDesc = []; }

      const subtotal = loteItens.reduce((acc, item) => acc + (item.valor_vendedor_pago || 0), 0);
      const totalAdiantamentos = adiantamentosDesc.reduce((acc, a) => acc + (a.valor || 0), 0);
      const totalLiquido = lote.valor_total ?? Math.max(0, subtotal - totalAdiantamentos);

      // Buscar logo configurada
      let logoConfigurada = null;
      try {
        const configs = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({ chave: 'logo_url' });
        if (configs && configs.length > 0 && configs[0].valor) logoConfigurada = configs[0].valor;
      } catch (_) {}

      // Gerar PDF com mesmo layout visual da 1ª via
      const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // ===== HEADER =====
      doc.setFillColor(16, 53, 60);
      doc.rect(0, 0, pageWidth, 22, 'F');

      if (logoConfigurada) {
        try { doc.addImage(logoConfigurada, 'PNG', 7, 3, 40, 16); } catch (_) {}
      }

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12); doc.setFont('helvetica', 'bold');
      doc.text('COMPROVANTE DE PAGAMENTO DE COMISSAO — EMPRESTIMOS', 165, 10, { align: 'center' });
      doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.setTextColor(200, 220, 220);
      doc.text(`Lote: ${lote.lote_codigo || lote_id}  |  Gerado em: ${fmtDateTime(new Date())}`, 165, 17, { align: 'center' });

      // Marca 2ª VIA
      doc.setFontSize(8); doc.setTextColor(255, 180, 180);
      doc.setFont('helvetica', 'bold');
      doc.text('2a VIA', pageWidth - 8, 10, { align: 'right' });

      // ===== BLOCO DE INFORMAÇÕES (4 colunas) =====
      doc.setTextColor(0, 0, 0);
      const infoY = 26;
      const colW = (pageWidth - 20) / 4;
      const cols = [
        { label: 'VENDEDOR', value: lote.vendedor_nome || '-' },
        { label: 'DATA PAGAMENTO', value: fmtDate(lote.data_pagamento) },
        { label: 'FORMA PAGAMENTO', value: lote.forma_pagamento || '-' },
        { label: 'QTD. ITENS', value: String(loteItens.length || lote.quantidade_propostas || 0) },
      ];
      cols.forEach((col, i) => {
        const x = 10 + colW * i;
        doc.setFillColor(245, 247, 250);
        doc.rect(x, infoY, colW - 2, 16, 'F');
        doc.setDrawColor(200, 215, 230);
        doc.setLineWidth(0.4);
        doc.rect(x, infoY, colW - 2, 16);
        doc.setFontSize(6); doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 120, 140);
        doc.text(col.label, x + 3, infoY + 5);
        doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.setTextColor(16, 53, 60);
        const displayValue = doc.splitTextToSize(col.value, colW - 6)[0] || col.value;
        doc.text(displayValue, x + 3, infoY + 12);
      });

      // ===== TABELA PRINCIPAL =====
      doc.autoTable({
        startY: 47,
        head: [['Cliente', 'CPF', 'Contrato', 'Tipo', 'Banco', 'Data Lib.', 'Vl. Bruto', 'Vl. Liquido', 'Vl. Parcela', '% Vendedor', 'Vl. a Pagar']],
        body: loteItens.map(item => [
          item.cliente_nome || '-',
          item.cliente_cpf || '-',
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
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [16, 53, 60], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' },
          9: { halign: 'right' }, 10: { halign: 'right', textColor: [0, 100, 180], fontStyle: 'bold' }
        },
        margin: { left: 10, right: 10 },
      });

      const tableEndY = doc.lastAutoTable.finalY;
      const sectionY = tableEndY + 12;

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
      const liqBoxY = sepY + 4;
      doc.setFontSize(7); doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 40, 40);
      doc.text('VALOR LIQUIDO A PAGAR', colEsqX + boxPad, liqBoxY + 4);
      doc.text(fmt(totalLiquido), colEsqX + colEsqW - boxPad, liqBoxY + 4, { align: 'right' });

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
      doc.text('JD PROMOTORA', 148, footerY + 3.5, { align: 'center' });
      doc.text(`Gerado em: ${fmtDateTime(new Date())}`, pageWidth - 10, footerY + 3.5, { align: 'right' });

      // Se houver comprovante de pagamento, adicionar como página seguinte
      if (lote.comprovante_url) {
        try {
          const comprovanteResp = await fetch(lote.comprovante_url);
          const comprovanteBuffer = await comprovanteResp.arrayBuffer();
          const comprovanteBytes = new Uint8Array(comprovanteBuffer);

          const isPdf = lote.comprovante_url.toLowerCase().includes('.pdf') ||
            comprovanteResp.headers.get('content-type')?.includes('application/pdf');

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

            // Inserir imagem centralizada
            doc.addImage(`data:${contentType};base64,${base64Img}`, imgFormat, 30, 18, 237, 155);
          }
          // Para comprovante PDF, não é possível mesclar facilmente — ignora silenciosamente
        } catch (_) {
          // Se falhar ao carregar o comprovante, continua sem ele
        }
      }

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