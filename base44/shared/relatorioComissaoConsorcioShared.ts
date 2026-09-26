// Gera o HTML do relatório de pagamento de comissão de CONSÓRCIO.
// Mesmo conteúdo da 1ª via (PDF gerado no momento do pagamento) para ser
// devolvido na 2ª via em Comissões Pagas quando o lote não guardou o HTML.

function fmt(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d) {
  if (!d) return '-';
  const s = String(d).length <= 10 ? d + 'T12:00:00' : d;
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? '-' : dt.toLocaleDateString('pt-BR');
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function gerarRelatorioComissaoConsorcioHTML(dados) {
  const {
    loteCode = '',
    vendedorNome = '-',
    vendedorCpf = '',
    pix = '',
    dataPagamento = null,
    formaPagamento = '-',
    observacao = '',
    geradoPor = '',
    geradoEm = new Date().toLocaleString('pt-BR'),
    logoUrl = null,
    empresaNome = 'JD PROMOTORA',
    itens = [],
    subtotal = 0,
    totalAdiantamentos = 0,
    acrescimos = 0,
    totalLiquido = 0,
    adiantamentos = [],
  } = dados || {};

  const linhas = itens.map((i) => `
        <tr>
          <td>${esc(i.cliente)}</td>
          <td>${esc(i.grupoCota)}</td>
          <td>${esc(i.parcela)}</td>
          <td>${esc(fmtDate(i.dataRecebimento))}</td>
          <td class="right">${i.credito ? esc(fmt(i.credito)) : '-'}</td>
          <td class="right">${i.credito && i.percentual ? esc(i.percentual.toFixed(2) + '%') : '-'}</td>
          <td class="right val">${esc(fmt(i.valor))}</td>
          <td>${esc(i.administradora)}</td>
        </tr>`).join('');

  const linhasAdiantamentos = adiantamentos.map((a) => `
        <div class="linha">
          <span>${esc(fmtDate(a.data))}${a.motivo ? ` — ${esc(a.motivo)}` : ''}</span>
          <span class="neg">${esc(fmt(a.valor))}</span>
        </div>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Relatorio de Comissao ${esc(loteCode)}</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; margin: 0; padding: 16px; background: #fff; }
  .header { background: #10353C; color: #fff; padding: 12px 16px; display: flex; align-items: center; gap: 14px; position: relative; }
  .header img { height: 44px; }
  .header h1 { font-size: 15px; margin: 0; letter-spacing: .5px; }
  .header p { font-size: 10px; margin: 4px 0 0; color: #cfe0e0; }
  .via { position: absolute; top: 12px; right: 16px; font-size: 11px; font-weight: bold; color: #ffb4b4; }
  .info { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 14px; }
  .info div { background: #f5f7fa; border: 1px solid #c8d7e6; border-radius: 4px; padding: 8px 10px; }
  .info span { display: block; font-size: 9px; text-transform: uppercase; color: #64788c; font-weight: bold; margin-bottom: 3px; }
  .info strong { font-size: 13px; color: #10353C; }
  .pix { font-size: 11px; margin: 8px 0 0; }
  .total-linha { margin-top: 10px; font-size: 12px; }
  .total-linha b { color: #0050b4; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 10px; }
  thead th { background: #10353C; color: #fff; padding: 6px 8px; text-align: left; font-weight: bold; }
  tbody td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  .right { text-align: right; }
  .val { color: #0050b4; font-weight: bold; }
  tfoot td { background: #e6f0ff; font-weight: bold; padding: 6px 8px; }
  .resumo { margin-top: 16px; display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
  .card { border: 1px solid #c8d2dc; border-radius: 5px; padding: 10px 12px; min-width: 260px; }
  .card h2 { font-size: 10px; margin: 0 0 8px; color: #282828; text-transform: uppercase; letter-spacing: .5px; }
  .card .linha { display: flex; justify-content: space-between; gap: 16px; font-size: 11px; padding: 2px 0; }
  .card .liquido { border-top: 1px solid #b4c3d2; margin-top: 6px; padding-top: 6px; font-weight: bold; color: #10353C; }
  .neg { color: #c86400; }
  footer { margin-top: 18px; border-top: 1px solid #b4b4b4; padding-top: 6px; font-size: 9px; color: #646464; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="header">
    ${logoUrl ? `<img src="${esc(logoUrl)}" alt="logo" />` : ''}
    <div>
      <h1>COMPROVANTE DE PAGAMENTO DE COMISSÃO</h1>
      <p>Protocolo: ${esc(loteCode)} &nbsp;|&nbsp; Emitido em: ${esc(geradoEm)}</p>
    </div>
    <div class="via">2ª VIA</div>
  </div>

  <div class="info">
    <div><span>Vendedor</span><strong>${esc(vendedorNome)}</strong></div>
    <div><span>Data Pagamento</span><strong>${esc(fmtDate(dataPagamento))}</strong></div>
    <div><span>Forma Pagamento</span><strong>${esc(formaPagamento || '-')}</strong></div>
    <div><span>Qtd. Itens</span><strong>${itens.length}</strong></div>
  </div>
  ${pix || vendedorCpf ? `<p class="pix">${pix ? `<b>PIX:</b> ${esc(pix)}` : ''}${pix && vendedorCpf ? ' &nbsp;|&nbsp; ' : ''}${vendedorCpf ? `<b>CPF:</b> ${esc(vendedorCpf)}` : ''}</p>` : ''}

  <p class="total-linha">Total pago ao corretor: <b>${esc(fmt(subtotal))}</b>${observacao ? ` &nbsp;|&nbsp; Obs: ${esc(observacao)}` : ''}</p>

  <table>
    <thead>
      <tr>
        <th>Cliente</th>
        <th>Grupo/Cota</th>
        <th>Parcela</th>
        <th>Data Rec.</th>
        <th class="right">Vl. Crédito</th>
        <th class="right">% s/ Crédito</th>
        <th class="right">Vl. a Pagar</th>
        <th>Administradora</th>
      </tr>
    </thead>
    <tbody>${linhas}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="6" class="right">Total:</td>
        <td class="right val">${esc(fmt(subtotal))}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <div class="resumo">
    <div class="card">
      <h2>Resumo Financeiro</h2>
      <div class="linha"><span>Subtotal de Comissões</span><span>${esc(fmt(subtotal))}</span></div>
      <div class="linha"><span class="neg">(-) Adiantamentos</span><span class="neg">${esc(fmt(totalAdiantamentos))}</span></div>
      <div class="linha"><span>(+) Acréscimos</span><span>${esc(fmt(acrescimos))}</span></div>
      <div class="linha liquido"><span>Valor Líquido a Pagar</span><span>${esc(fmt(totalLiquido))}</span></div>
    </div>
    ${adiantamentos.length > 0 ? `<div class="card">
      <h2>Adiantamentos Descontados</h2>${linhasAdiantamentos}
    </div>` : ''}
  </div>

  <footer>
    <span>Comprovante emitido eletronicamente.${geradoPor ? ` Por: ${esc(geradoPor)}.` : ''}</span>
    <span>${esc(empresaNome)}</span>
    <span>Gerado em: ${esc(geradoEm)}</span>
  </footer>
</body>
</html>`;
}