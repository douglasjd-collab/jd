import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@2.5.2';

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

    // Criar PDF
    const doc = new jsPDF();
    
    // Título
    doc.setFontSize(18);
    doc.text('Relatório de Comissão Recebida', 14, 20);
    
    doc.setFontSize(11);
    const dataFormatada = data === 'sem-data' ? 'Sem data' : new Date(data).toLocaleDateString('pt-BR');
    doc.text(`Data: ${dataFormatada}`, 14, 28);
    doc.text(`Total de Recebimentos: ${recebimentos.length}`, 14, 34);
    
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 40);

    // Resumo
    doc.setFontSize(12);
    doc.text('Resumo:', 14, 50);
    doc.setFontSize(10);
    doc.text(`Total Recebido: ${totalRecebido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, 14, 56);
    doc.text(`Total a Pagar: ${totalAPagar.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, 14, 62);

    // Cabeçalho da tabela
    let y = 75;
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('Cliente', 14, y);
    doc.text('Vendedor', 70, y);
    doc.text('Grupo/Cota', 120, y);
    doc.text('Valor Recebido', 155, y);

    // Linha divisória
    y += 2;
    doc.line(14, y, 200, y);
    y += 5;

    // Dados
    doc.setFont(undefined, 'normal');
    recebimentos.forEach((r, idx) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      const cliente = (r.cliente_nome || '-').substring(0, 25);
      const vendedor = (r.vendedor_nome || '-').substring(0, 20);
      const grupoCota = r.grupo && r.cota ? `${r.grupo}/${r.cota}` : (r.contrato || '-');
      const valor = (r.valor_recebido || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      doc.text(cliente, 14, y);
      doc.text(vendedor, 70, y);
      doc.text(grupoCota.substring(0, 15), 120, y);
      doc.text(valor, 155, y);

      y += 7;
    });

    // Totais no final
    y += 5;
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.line(14, y, 200, y);
    y += 7;
    doc.setFont(undefined, 'bold');
    doc.text('TOTAIS:', 120, y);
    doc.text(totalRecebido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 155, y);

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