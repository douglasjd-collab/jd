// Gera a 2ª via da simulação numa janela popup e dispara a impressão

const formatCurrency = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const CHANCE_LABELS = ['Baixa chance', 'Média chance', 'Boa chance', 'Forte chance'];
const CHANCE_COLORS = ['#dc2626', '#d97706', '#2563eb', '#16a34a'];

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
    : new Date().toLocaleDateString('pt-BR');

  const tipoBemLabel = {
    automovel: 'Automóvel', imovel: 'Imóvel', motocicleta: 'Motocicleta', servico: 'Serviço'
  }[simulacao.tipo_grupo] || (simulacao.tipo_grupo || 'Automóvel');

  // Análise de contemplação
  const analise = simulacao.analise_contemplacao || null;
  let analiseHtml = '';
  if (analise && !analise.sem_historico) {
    const diff = analise.lanceOfertadoPct - analise.menorLancePct;
    let nivel = 0;
    if (diff > 10) nivel = 3;
    else if (diff >= 0) nivel = 2;
    else if (diff >= -10) nivel = 1;
    const chanceLabel = CHANCE_LABELS[nivel];
    const chanceCor = CHANCE_COLORS[nivel];
    const diffSinal = diff >= 0 ? '+' : '';
    const modalidadeLabel = analise.modalidade === 'livre' ? 'Lance Livre' : 'Lance Limitado';

    // Medidor visual
    const medidorItems = CHANCE_LABELS.map((l, i) => {
      const ativo = i === nivel;
      return `<div style="flex:1;text-align:center;padding:5px 2px;border-radius:4px;background:${ativo ? CHANCE_COLORS[i] : '#e2e8f0'};color:${ativo ? '#fff' : '#94a3b8'};font-size:9px;font-weight:${ativo ? '700' : '400'};">${l}</div>`;
    }).join('');

    analiseHtml = `
    <div class="section">
      <h2 style="color:#083942;border-color:#083942;">Bloco 5 — Análise de Contemplação</h2>
      <table class="data-table">
        <tr><td>Modalidade analisada</td><td class="b">${esc(modalidadeLabel)}</td></tr>
        <tr><td>Menor lance da última assembleia</td><td class="b">${analise.menorLancePct.toFixed(2)}%</td></tr>
        <tr><td>Lance ofertado pelo cliente</td><td class="b">${analise.lanceOfertadoPct.toFixed(2)}%</td></tr>
        <tr><td>Diferença</td><td class="b" style="color:${chanceCor}">${diffSinal}${diff.toFixed(2)}%</td></tr>
      </table>
      <div style="margin-top:10px;">
        <p style="font-size:10px;color:#64748b;margin-bottom:4px;">Medidor de Chance:</p>
        <div style="display:flex;gap:3px;">${medidorItems}</div>
      </div>
      <div style="margin-top:8px;padding:10px;border-radius:6px;background:${chanceCor}15;border:1.5px solid ${chanceCor};text-align:center;">
        <p style="margin:0;font-size:14px;font-weight:700;color:${chanceCor};">${chanceLabel} de contemplação</p>
        <p style="margin:2px 0 0;font-size:10px;color:${chanceCor};">Lance ${diffSinal}${diff.toFixed(2)}% em relação ao menor lance da última assembleia</p>
      </div>
    </div>`;
  } else if (analise && analise.sem_historico) {
    analiseHtml = `
    <div class="section">
      <h2 style="color:#083942;border-color:#083942;">Bloco 5 — Análise de Contemplação</h2>
      <div style="padding:10px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;color:#64748b;font-size:11px;">
        Análise de contemplação indisponível por falta de histórico da última assembleia.
      </div>
    </div>`;
  }

  // Cartas
  const cartasRows = cartas.map((carta, i) => `
    <tr>
      <td>Carta ${i + 1}</td>
      <td class="right b">${formatCurrency(parseFloat(carta.credito))}</td>
      <td class="right">${formatCurrency(parseFloat(carta.parcela))}</td>
      <td class="right">${esc(carta.prazo)} meses</td>
    </tr>`).join('');

  // Lances
  const temLance = simulacao.lance_total > 0;
  const lancesHtml = temLance ? `
    <div class="section">
      <h2 style="color:#083942;border-color:#083942;">Bloco 4 — Lances</h2>
      <table class="data-table">
        ${simulacao.lance_embutido_ativo ? `<tr><td>Lance Embutido (${esc(simulacao.lance_embutido_percentual)}%)</td><td class="right b">${formatCurrency(simulacao.lance_embutido_valor)}</td></tr>` : ''}
        ${simulacao.lance_proprio_ativo ? `<tr><td>Lance Próprio (${esc(lanceProprioPercentual)}%)</td><td class="right b">${formatCurrency(simulacao.lance_proprio_valor)}</td></tr>` : ''}
        <tr class="highlight-row"><td><strong>Lance Total</strong></td><td class="right b big-val">${formatCurrency(simulacao.lance_total)}</td></tr>
        <tr><td>Percentual Total Ofertado</td><td class="right b" style="color:#083942;">${percentualTotalOfertado}%</td></tr>
      </table>
    </div>` : '';

  // Carência
  const carenciaHtml = (simulacao.novo_prazo && simulacao.prazo_original && simulacao.novo_prazo < simulacao.prazo_original) ? `
    <tr><td>Carência</td><td class="right">${simulacao.prazo_original - simulacao.novo_prazo - 1} meses</td></tr>
    <tr><td>Parcelas Restantes</td><td class="right">${simulacao.novo_prazo} meses</td></tr>` : '';

  const valorRecebe = simulacao.credito_total - (simulacao.lance_embutido_valor || 0);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Simulação — ${esc(simulacao.cliente_nome)}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #1e293b; margin: 0; padding: 20px; background: #fff; font-size: 12px; }
  .wrap { max-width: 780px; margin: 0 auto; }

  /* Cabeçalho */
  .header { background: #083942; color: #fff; padding: 16px 20px; border-radius: 10px 10px 0 0; display: flex; justify-content: space-between; align-items: center; margin-bottom: 0; }
  .header-left h1 { font-size: 20px; font-weight: 700; margin: 0 0 2px; letter-spacing: 0.5px; }
  .header-left p { font-size: 11px; opacity: .75; margin: 0; }
  .header-right { text-align: right; font-size: 10px; opacity: .8; line-height: 1.6; }
  .header-logo { height: 36px; object-fit: contain; }
  .header-sub { background: #10353C; padding: 8px 20px; display: flex; justify-content: space-between; align-items: center; border-radius: 0 0 10px 10px; margin-bottom: 16px; }
  .header-sub span { font-size: 10px; color: rgba(255,255,255,0.7); }
  .header-sub strong { color: #fff; }

  /* Seções */
  .section { margin-bottom: 14px; }
  h2 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 6px; padding: 6px 10px; background: #f8fafc; border-left: 3px solid #083942; border-radius: 0 4px 4px 0; }

  /* Tabelas de dados */
  .data-table { width: 100%; border-collapse: collapse; }
  .data-table tr { border-bottom: 1px solid #f1f5f9; }
  .data-table td { padding: 5px 8px; font-size: 11px; }
  .data-table td:first-child { color: #64748b; }
  .data-table td.right { text-align: right; }
  .data-table td.b { font-weight: 700; color: #0f172a; }
  .data-table tr.highlight-row td { background: #f0fdf4; }
  .big-val { font-size: 14px; color: #065f46 !important; }

  /* Tabela de cartas */
  .cartas-table { width: 100%; border-collapse: collapse; }
  .cartas-table th { background: #083942; color: #fff; font-size: 10px; padding: 6px 8px; text-align: left; font-weight: 600; }
  .cartas-table th.right { text-align: right; }
  .cartas-table td { padding: 5px 8px; font-size: 11px; border-bottom: 1px solid #f1f5f9; }
  .cartas-table td.right { text-align: right; }
  .cartas-table tr:nth-child(even) td { background: #f8fafc; }

  /* Blocos destacados */
  .box-recebe { background: #083942; color: #fff; padding: 12px 16px; border-radius: 8px; margin-bottom: 14px; }
  .box-recebe .label { font-size: 10px; opacity: .8; margin-bottom: 3px; }
  .box-recebe .valor { font-size: 22px; font-weight: 700; }
  .box-recebe small { font-size: 10px; opacity: .75; }

  .box-resultado { background: #f5f3ff; border: 2px solid #8b5cf6; border-radius: 8px; padding: 12px 16px; margin-bottom: 14px; }
  .box-resultado h2 { border-left-color: #8b5cf6; background: transparent; padding: 0; margin-bottom: 8px; color: #6d28d9; }

  /* Grid 2 colunas */
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

  /* Rodapé */
  .footer { margin-top: 16px; padding: 10px 16px; background: #f8fafc; border-top: 2px solid #083942; border-radius: 4px; }
  .footer p { font-size: 9px; color: #64748b; margin: 2px 0; text-align: center; }
  .footer .aviso { color: #94a3b8; font-style: italic; }

  @media print {
    body { padding: 8px; }
    .wrap { max-width: 100%; }
  }
</style>
</head>
<body>
  <div class="wrap">

    <!-- Cabeçalho -->
    <div class="header">
      <div class="header-left">
        <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6950a9860c8af0e2ff10fc9e/1b5f2d0a1_JDPromotoraICON3.png" alt="JD Promotora" class="header-logo" />
        <h1>JD PROMOTORA</h1>
        <p>Simulação de Consórcio</p>
      </div>
      <div class="header-right">
        <p>${esc(dataStr)}</p>
        <p>Vendedor: <strong>${esc(simulacao.usuario_nome || '')}</strong></p>
        <p>Validade: 30 dias</p>
      </div>
    </div>
    <div class="header-sub">
      <span>Documento gerado pelo CRM JD Promotora</span>
      <span>Modelo: <strong>${esc(modelo)}</strong></span>
    </div>

    <!-- Bloco 1: Dados do Cliente -->
    <div class="section">
      <h2>Bloco 1 — Dados do Cliente</h2>
      <div class="grid2">
        <table class="data-table">
          <tr><td>Nome</td><td class="b right">${esc(simulacao.cliente_nome)}</td></tr>
          <tr><td>Telefone</td><td class="right">${esc(simulacao.telefone)}</td></tr>
        </table>
        <table class="data-table">
          <tr><td>Tipo de Bem</td><td class="b right">${esc(tipoBemLabel)}</td></tr>
          <tr><td>Administradora</td><td class="right">${esc(simulacao.administradora || 'Canopus')}</td></tr>
        </table>
      </div>
    </div>

    <!-- Bloco 2: Resumo -->
    <div class="section">
      <h2>Bloco 2 — Resumo da Simulação</h2>
      <table class="data-table">
        <tr><td>Crédito Total</td><td class="b right">${formatCurrency(simulacao.credito_total)}</td></tr>
        <tr><td>Parcela Total</td><td class="b right">${formatCurrency(simulacao.parcela_total)}</td></tr>
        <tr><td>Prazo Original</td><td class="right">${esc(simulacao.prazo_original)} meses</td></tr>
        ${(simulacao.lance_embutido_ativo || simulacao.lance_proprio_ativo) ? `<tr><td>Modalidade de Lance</td><td class="b right">${simulacao.lance_embutido_ativo && simulacao.lance_proprio_ativo ? 'Embutido + Próprio' : simulacao.lance_embutido_ativo ? 'Lance Embutido' : 'Lance Próprio'}</td></tr>` : ''}
      </table>
    </div>

    <!-- Bloco 3: Cartas -->
    <div class="section">
      <h2>Bloco 3 — Cartas de Crédito</h2>
      <table class="cartas-table">
        <thead>
          <tr>
            <th>Carta</th>
            <th class="right">Crédito</th>
            <th class="right">Parcela</th>
            <th class="right">Prazo</th>
          </tr>
        </thead>
        <tbody>
          ${cartasRows}
          <tr>
            <td colspan="4" style="height:2px;background:#083942;"></td>
          </tr>
          <tr>
            <td><strong>Total</strong></td>
            <td class="right b">${formatCurrency(simulacao.credito_total)}</td>
            <td class="right b">${formatCurrency(simulacao.parcela_total)}</td>
            <td class="right">${esc(simulacao.prazo_original)} meses</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Bloco 4: Lances -->
    ${lancesHtml}

    <!-- Bloco 5: Análise de Contemplação -->
    ${analiseHtml}

    <!-- Bloco 6: Valor que o Cliente Recebe -->
    <div class="box-recebe">
      <p class="label">Bloco 6 — Valor que o Cliente Recebe</p>
      <p class="valor">${formatCurrency(valorRecebe)}</p>
      <small>Crédito ${formatCurrency(simulacao.credito_total)}${simulacao.lance_embutido_valor > 0 ? ` menos Lance Embutido ${formatCurrency(simulacao.lance_embutido_valor)}` : ''}</small>
    </div>

    <!-- Bloco 7: Resultado Final -->
    <div class="box-resultado">
      <h2>Bloco 7 — Resultado Final</h2>
      <table class="data-table">
        <tr><td>Total do Plano</td><td class="right b">${formatCurrency((simulacao.prazo_original || 0) * (simulacao.parcela_total || 0))}</td></tr>
        ${simulacao.lance_proprio_ativo && simulacao.lance_proprio_valor > 0 ? `<tr><td>(-) Lance Próprio</td><td class="right b" style="color:#7c3aed;">- ${formatCurrency(simulacao.lance_proprio_valor)}</td></tr>` : ''}
        <tr><td>(-) 1ª Parcela (no ato)</td><td class="right b" style="color:#d97706;">- ${formatCurrency(primeiraParcelaNoAto)}</td></tr>
        <tr><td><strong>Saldo Restante</strong></td><td class="right b" style="font-size:13px;">${formatCurrency(simulacao.saldo_apos_contemplacao)}</td></tr>
        ${carenciaHtml}
        <tr><td><strong>Novo Prazo</strong></td><td class="right b" style="color:#6d28d9;font-size:13px;">${esc(simulacao.novo_prazo)} meses</td></tr>
        <tr><td><strong>Nova Parcela</strong></td><td class="right b" style="color:#6d28d9;font-size:15px;">${formatCurrency(simulacao.nova_parcela)}</td></tr>
      </table>
    </div>

    <!-- Rodapé -->
    <div class="footer">
      <p><strong>JD Promotora</strong> &nbsp;|&nbsp; Vendedor responsável: ${esc(simulacao.usuario_nome || '')} &nbsp;|&nbsp; Data de emissão: ${esc(dataStr)}</p>
      <p class="aviso">Simulação sujeita à alteração conforme regras da administradora, disponibilidade do grupo e resultado da assembleia. A análise de contemplação é baseada no histórico da última assembleia e não garante contemplação.</p>
    </div>

  </div>
  <script>
    window.onload = function () { setTimeout(function () { window.print(); }, 300); };
  </script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=960,height=750');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}