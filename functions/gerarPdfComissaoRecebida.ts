import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@2.5.2';
import 'npm:jspdf-autotable@3.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, itens } = await req.json();

    if (!data) {
      return Response.json({ error: 'Data é obrigatória' }, { status: 400 });
    }

    // Se não passou os itens, busca do banco
    let recebimentos = itens;
    if (!recebimentos || recebimentos.length === 0) {
      const dataFiltro = data === 'sem-data' ? null : data;
      const all = await base44.entities.RecebimentoComissao.filter({ 
        status_recebimento: 'recebida' 
      });
      recebimentos = all.filter(r => {
        if (dataFiltro) {
          return r.data_recebimento === dataFiltro;
        }
        return !r.data_recebimento;
      });
    }

    if (!recebimentos || recebimentos.length === 0) {
      return Response.json({ error: 'Nenhum recebimento encontrado' }, { status: 404 });
    }

    // Calcular totais
    const totalRecebido = recebimentos.reduce((sum, r) => sum + (r.valor_recebido || 0), 0);
    const totalAPagar = recebimentos.reduce((sum, r) => sum + (r.valor_a_pagar || 0), 0);

    // Criar PDF em paisagem para caber mais colunas
    const doc = new jsPDF({ 
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });
    
    // Título
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Relatorio de Comissoes Recebidas', 14, 15);
    
    // Informações do cabeçalho
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const dataFormatada = data === 'sem-data' ? 'Sem data' : new Date(data).toLocaleDateString('pt-BR');
    doc.text('Data do Recebimento: ' + dataFormatada, 14, 22);
    doc.text('Gerado em: ' + new Date().toLocaleString('pt-BR'), 14, 27);
    doc.text('Total de Registros: ' + recebimentos.length, 200, 22);
    
    // Resumo financeiro
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Total Recebido: ' + totalRecebido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 200, 27);

    // Preparar dados da tabela
    const tableData = recebimentos.map(r => [
      r.cliente_nome || '-',
      r.vendedor_nome || '-',
      r.administradora_nome || '-',
      r.grupo && r.cota ? `${r.grupo}/${r.cota}` : (r.contrato || '-'),
      r.parcela_informada ? `${r.parcela_informada}º` : '-',
      (r.valor_recebido || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      `${r.percentual_comissao || 100}%`,
      (r.valor_a_pagar || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      r.status_pagamento === 'paga' ? 'Paga' : 'A Pagar',
      r.observacoes || '-'
    ]);

    // Criar tabela com autoTable
    doc.autoTable({
      startY: 35,
      head: [[
        'Cliente',
        'Vendedor', 
        'Administradora',
        'Grupo/Cota',
        'Parcela',
        'Valor Recebido',
        '% Com.',
        'A Pagar',
        'Status',
        'Observacoes'
      ]],
      body: tableData,
      styles: {
        fontSize: 8,
        cellPadding: 2,
        lineColor: [200, 200, 200],
        lineWidth: 0.1
      },
      headStyles: {
        fillColor: [16, 53, 60],
        textColor: 255,
        fontStyle: 'bold',
        halign: 'left'
      },
      columnStyles: {
        0: { cellWidth: 35 },  // Cliente
        1: { cellWidth: 30 },  // Vendedor
        2: { cellWidth: 30 },  // Administradora
        3: { cellWidth: 25 },  // Grupo/Cota
        4: { cellWidth: 15, halign: 'center' },  // Parcela
        5: { cellWidth: 25, halign: 'right', fontStyle: 'bold', textColor: [0, 128, 0] },  // Valor Recebido
        6: { cellWidth: 15, halign: 'center' },  // % Com.
        7: { cellWidth: 25, halign: 'right', fontStyle: 'bold', textColor: [0, 0, 255] },  // A Pagar
        8: { cellWidth: 20, halign: 'center' },  // Status
        9: { cellWidth: 35 }   // Observações
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      margin: { top: 35, left: 14, right: 14 },
      didDrawPage: (data) => {
        // Rodapé em cada página
        doc.setFontSize(8);
        doc.setTextColor(128);
        doc.text(
          'Pagina ' + data.pageNumber,
          data.settings.margin.left,
          doc.internal.pageSize.height - 10
        );
      }
    });

    // Adicionar totais após a tabela
    const finalY = doc.lastAutoTable.finalY || 35;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('TOTAL RECEBIDO: ' + totalRecebido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 14, finalY + 10);
    doc.text('TOTAL A PAGAR: ' + totalAPagar.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 14, finalY + 17);

    // Gerar PDF como ArrayBuffer
    const pdfBytes = doc.output('arraybuffer');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="comissao-recebida-${data}.pdf"`
      }
    });

  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    return Response.json({ 
      error: 'Erro ao gerar PDF',
      details: error.message 
    }, { status: 500 });
  }
});