import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@2.5.2';
import 'npm:jspdf-autotable@3.8.4';

// Função para remover acentos e caracteres especiais
function removerAcentos(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, itens } = await req.json();

    if (!data || !itens) {
      return Response.json({ error: 'Data e itens sao obrigatorios' }, { status: 400 });
    }

    // Calcular totais
    const totalPago = itens.reduce((acc, item) => acc + (item.valor_a_pagar || 0), 0);

    // Obter vendedores únicos
    const vendedoresUnicos = [...new Set(itens.map(i => i.vendedor_nome).filter(Boolean))];
    const vendedorInfo = vendedoresUnicos.length === 1 
      ? vendedoresUnicos[0] 
      : vendedoresUnicos.length > 1 
        ? 'Multiplos Vendedores' 
        : 'Nao Informado';

    // Criar PDF em paisagem (landscape)
    const doc = new jsPDF({ orientation: 'landscape' });

    // Título
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Relatorio de Comissoes Pagas', 14, 15);

    // Informações do relatório
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Data de Pagamento: ' + new Date(data).toLocaleDateString('pt-BR'), 14, 22);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Vendedor: ' + removerAcentos(vendedorInfo), 14, 28);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Total de Registros: ' + itens.length, 14, 33);
    doc.text('Total Pago: R$ ' + totalPago.toFixed(2).replace('.', ','), 200, 28);

    // Preparar dados da tabela (removendo acentos)
    const tableData = itens.map(r => [
      removerAcentos(r.cliente_nome) || '-',
      removerAcentos(r.vendedor_nome) || '-',
      removerAcentos(r.administradora_nome) || '-',
      r.grupo && r.cota ? r.grupo + '/' + r.cota : (r.contrato || '-'),
      r.parcela_numero ? r.parcela_numero + 'a' : '-',
      'R$ ' + (r.valor_recebido || 0).toFixed(2).replace('.', ','),
      (r.percentual_comissao || 100) + '%',
      'R$ ' + (r.valor_a_pagar || 0).toFixed(2).replace('.', ','),
      removerAcentos(r.forma_pagamento) || '-'
    ]);

    // Adicionar tabela
    doc.autoTable({
      head: [[
        'Cliente',
        'Vendedor',
        'Administradora',
        'Grupo/Cota',
        'Parcela',
        'Valor Recebido',
        '% Com.',
        'Valor Pago',
        'Forma Pgto'
      ]],
      body: tableData,
      startY: 40,
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [16, 53, 60],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
      margin: { top: 40, left: 14, right: 14 },
    });

    // Adicionar totais após a tabela
    const finalY = doc.lastAutoTable.finalY || 40;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('TOTAL PAGO: R$ ' + totalPago.toFixed(2).replace('.', ','), 14, finalY + 10);

    // Rodapé
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text('Gerado em: ' + new Date().toLocaleString('pt-BR'), 14, finalY + 20);

    // Retornar PDF
    const pdfBytes = doc.output('arraybuffer');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=comissoes_pagas.pdf'
      }
    });

  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});