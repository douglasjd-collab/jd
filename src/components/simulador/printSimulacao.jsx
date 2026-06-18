// Gera a 2ª via da simulação numa janela popup e dispara a impressão,
// sem depender de rota autenticada (evita o login em nova guia).

const formatCurrency = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function imprimirSimulacao(simulacao) {
  if (!simulacao) return;

  let cartas = [];
  try { cartas = JSON.parse(simulacao.cartas || '[]'); } catch { cartas = []; }

  const modelo = simulacao.opcao_pos_contemplacao === 'prazo' ? 'Canopus (Recomendado)' : 'Simples';
  const primeiraParcelaNoAto = Number(simulacao.primeira_parcela_no_ato ?? 0);

  const lanceProprioPercentual = simulacao.lance_proprio_ativo && simulacao.credito_total > 0
    ? ((simulacao.lance_proprio_valor / simulacao.credito_total) * 100).toFixed(2)
    : '0';
  const percentualTotalOfertado = simulacao.credito_total > 0
    ? (((simulacao.lance_embutido_valor || 0) + (simulacao.lance_proprio_valor || 0)) / simulacao.credito_total * 100).toFixed(2)
    : '0';

  const dataStr = simulacao.created_date
    ? `${new Date(simulacao.created_date).toLocaleDateString('pt-BR')} às ${new Date(simulacao.created_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : '';

  const cartasHtml = cartas.map((carta, i) => `
    <div class="carta">
      <strong>Carta ${i + 1}:</strong> ${formatCurrency(parseFloat(carta.credito))} • Parcela ${formatCurrency(parseFloat(carta.parcela))} • ${esc(carta.prazo)} Meses
    </div>`).join('');

  const lancesHtml = simulacao.lance_total > 0 ? `
    <div class="section">
      <h2>🎯 Lances</h2>
      ${simulacao.lance_embutido_ativo ? `<div class="row"><span>Lance Embutido (${esc(simulacao.lance_embutido_percentual)}%):</span><span class="b">${formatCurrency(simulacao.lance_embutido_valor)}</span></div>` : ''}
      ${simulacao.lance_proprio_ativo ? `<div class="row"><span>Lance Próprio (${lanceProprioPercentual}%):</span><span class="b">${formatCurrency(simulacao.lance_proprio_valor)}</span></div>` : ''}
      <div class="box box-green row"><span class="b">🏆 Lance Total:</span><span class="big">${formatCurrency(simulacao.lance_total)}</span></div>
      ${(simulacao.lance_embutido_ativo || simulacao.lance_proprio_ativo) ? `<div class="box box-orange row"><span class="b">🎯 Percentual Total Ofertado:</span><span class="big">${percentualTotalOfertado}%</span></div>` : ''}
    </div>` : '';

  const carenciaHtml = (simulacao.novo_prazo && simulacao.prazo_original && simulacao.novo_prazo < simulacao.prazo_original) ? `
    <div class="row gray"><span>Carência:</span><span class="b">${simulacao.prazo_original - simulacao.novo_prazo - 1} meses</span></div>
    <div class="row gray"><span>Parcelas Restantes:</span><span class="b">${simulacao.novo_prazo} meses</span></div>` : '';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Simulação - ${esc(simulacao.cliente_nome)}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #1e293b; margin: 0; padding: 16px; background: #fff; font-size: 13px; }
  .wrap { max-width: 800px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0; }
  h2 { font-size: 16px; margin: 0 0 6px; padding-bottom: 4px; border-bottom: 1px solid #cbd5e1; }
  .header { text-align: center; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px solid #1e293b; }
  .header img { height: 34px; object-fit: contain; margin-bottom: 4px; }
  .header p { font-size: 12px; color: #64748b; margin: 2px 0 0; }
  .section { margin-bottom: 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .row { display: flex; justify-content: space-between; align-items: center; padding: 2px 0; }
  .b { font-weight: 700; }
  .big { font-size: 16px; font-weight: 700; color: #1e3a8a; }
  .carta { font-size: 12px; background: #f1f5f9; padding: 6px; border-radius: 6px; margin-bottom: 3px; }
  .box { padding: 8px; border-radius: 6px; margin-top: 4px; }
  .box-blue { background: #eff6ff; }
  .box-green { background: #ecfdf5; border: 1px solid #a7f3d0; }
  .box-green .big { color: #065f46; }
  .box-orange { background: #fff7ed; border: 1px solid #fed7aa; }
  .box-orange .big, .box-orange .b { color: #9a3412; }
  .recebe { background: linear-gradient(90deg,#3b82f6,#2563eb); color: #fff; padding: 12px; border-radius: 8px; }
  .recebe h2 { border: none; color: #fff; font-size: 14px; margin-bottom: 4px; }
  .recebe .val { font-size: 24px; font-weight: 700; }
  .recebe small { opacity: .9; }
  .gray { color: #475569; }
  .red { color: #dc2626; }
  .green { color: #047857; }
  .final { background: linear-gradient(90deg,#f3e8ff,#faf5ff); border: 2px solid #d8b4fe; border-radius: 8px; padding: 10px; }
  .final h2 { text-align: center; color: #6b21a8; border: none; }
  .final .b, .final .big { color: #6b21a8; }
  .footer { margin-top: 12px; padding-top: 8px; border-top: 1px solid #cbd5e1; text-align: center; font-size: 11px; color: #64748b; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6950a9860c8af0e2ff10fc9e/1b5f2d0a1_JDPromotoraICON3.png" alt="JD Promotora" />
      <h1>Simulação de Consórcio</h1>
      <p>${dataStr}</p>
    </div>

    <div class="section">
      <h2>📋 Dados do Cliente</h2>
      <div class="grid">
        <div><span class="b">Nome:</span> ${esc(simulacao.cliente_nome)}</div>
        <div><span class="b">Telefone:</span> ${esc(simulacao.telefone)}</div>
        <div><span class="b">Tipo:</span> ${esc(simulacao.tipo_grupo || 'Automóvel')}</div>
        <div><span class="b">Administradora:</span> ${esc(simulacao.administradora || 'Canopus')}</div>
      </div>
    </div>

    <div class="section">
      <h2>💳 Cartas de Crédito</h2>
      ${cartasHtml}
      <div class="box box-blue">
        <div class="row"><span class="b">💰 Crédito Total:</span><span class="big">${formatCurrency(simulacao.credito_total)}</span></div>
        <div class="row"><span class="b">📅 Parcela Total:</span><span class="big">${formatCurrency(simulacao.parcela_total)}</span></div>
        <div class="row"><span class="b">⏱️ Prazo:</span><span class="big">${esc(simulacao.prazo_original)} Meses</span></div>
      </div>
    </div>

    ${lancesHtml}

    <div class="section recebe">
      <h2>💰 Valor que o Cliente Recebe</h2>
      <div class="val">${formatCurrency(simulacao.credito_total - (simulacao.lance_embutido_valor || 0))}</div>
      <small>(Crédito ${formatCurrency(simulacao.credito_total)}${simulacao.lance_embutido_valor > 0 ? ` - Lance Emb. ${formatCurrency(simulacao.lance_embutido_valor)}` : ''})</small>
    </div>

    <div class="section">
      <h2>🧮 Cálculos</h2>
      <div class="row"><span>Total do Plano:</span><span class="b">${formatCurrency((simulacao.prazo_original || 0) * (simulacao.parcela_total || 0))}</span></div>
      ${simulacao.lance_proprio_ativo && simulacao.lance_proprio_valor > 0 ? `<div class="row red"><span>(-) Lance Próprio:</span><span class="b">-${formatCurrency(simulacao.lance_proprio_valor)}</span></div>` : ''}
      <div class="row red"><span>(-) 1ª Parcela (no ato):</span><span class="b">-${formatCurrency(primeiraParcelaNoAto)}</span></div>
      <div class="box box-blue row"><span class="b">Saldo Restante:</span><span class="big">${formatCurrency(simulacao.saldo_apos_contemplacao)}</span></div>
      ${carenciaHtml}
    </div>

    <div class="final">
      <h2>✨ Resultado Final</h2>
      <div class="row"><span class="b">Novo Prazo:</span><span class="big">${esc(simulacao.novo_prazo)} meses</span></div>
      <div class="row"><span class="b">Nova Parcela:</span><span class="big">${formatCurrency(simulacao.nova_parcela)}</span></div>
    </div>

    <div class="footer">
      <p>Modelo: ${esc(modelo)} • Vendedor: ${esc(simulacao.usuario_nome)}</p>
      <p>Simulação sujeita a alterações conforme condições da administradora.</p>
    </div>
  </div>
  <script>
    window.onload = function () { setTimeout(function () { window.print(); }, 300); };
  </script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}