import { gerarTermoAutorizacaoPDF } from './gerarTermoAutorizacao';
import { format } from 'date-fns';

const ROLE_LABELS = {
  cliente: 'Cliente (Autorizante)',
  testemunha1: '1ª Testemunha',
  testemunha2: '2ª Testemunha',
  representante: 'Representante da empresa',
};

async function urlParaDataUrl(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function sha256Blob(blob) {
  const buf = await blob.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function gerarQrCodeDataUrl(urlValidacao) {
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(urlValidacao)}`;
  return urlParaDataUrl(qrApiUrl);
}

function parseEvidencias(solicitacao, role) {
  try {
    return JSON.parse(solicitacao?.[`${role}_evidencias_json`] || '{}');
  } catch {
    return {};
  }
}

// Gera o PDF do Termo de Autorização já assinado, anexando:
// 1) o comprovante de cada assinatura eletrônica coletada;
// 2) o QR Code de validação pública no rodapé da última página;
// 3) o Certificado de Evidências Digitais (selfie/RG/assinatura/hashes).
// Retorna { doc, hashFinal } — hashFinal é o hash SHA-256 do conteúdo assinado.
export async function gerarTermoComAssinaturasPDF({ proposta, cliente, empresa, solicitacao, termo }) {
  const doc = gerarTermoAutorizacaoPDF(proposta, cliente, empresa);

  let ordem = [];
  try { ordem = JSON.parse(solicitacao?.ordem_json || '[]'); } catch { ordem = []; }

  const assinantes = ordem.filter((role) => solicitacao?.[`${role}_status`] === 'assinado');

  const pageWidth = doc.internal.pageSize.width;
  const marginX = 18;
  const maxWidth = pageWidth - marginX * 2;

  if (assinantes.length > 0) {
    doc.addPage();
    let y = 20;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('COMPROVANTE DE ASSINATURA ELETRÔNICA', pageWidth / 2, y, { align: 'center' });
    y += 10;

    for (const role of assinantes) {
      if (y > doc.internal.pageSize.height - 60) {
        doc.addPage();
        y = 20;
      }
      const nome = solicitacao[`${role}_nome`] || '-';
      const cpf = solicitacao[`${role}_cpf`] || '-';
      const dataAssinatura = solicitacao[`${role}_data_assinatura`]
        ? format(new Date(solicitacao[`${role}_data_assinatura`]), 'dd/MM/yyyy HH:mm')
        : '-';
      const assinaturaUrl = solicitacao[`${role}_assinatura_url`];

      doc.setFontSize(10.5);
      doc.setFont('helvetica', 'bold');
      doc.text(ROLE_LABELS[role] || role, marginX, y);
      y += 6;
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      doc.text(`Nome: ${nome}`, marginX, y); y += 5;
      doc.text(`CPF: ${cpf}`, marginX, y); y += 5;
      doc.text(`Assinado em: ${dataAssinatura}`, marginX, y); y += 5;

      if (assinaturaUrl) {
        try {
          const dataUrl = await urlParaDataUrl(assinaturaUrl);
          doc.setDrawColor(200);
          doc.rect(marginX, y, 70, 30);
          doc.addImage(dataUrl, marginX, y, 70, 30);
          y += 34;
        } catch {
          y += 4;
        }
      }
      y += 8;
      doc.setDrawColor(230);
      doc.line(marginX, y, marginX + maxWidth, y);
      y += 10;
    }
  }

  // Hash do conteúdo assinado (calculado antes do QR/certificado, que são anexos de rastreabilidade)
  const hashFinal = await sha256Blob(doc.output('blob'));

  // QR Code de validação pública no rodapé da última página
  const termoId = termo?.id || '';
  let qrDataUrl = null;
  if (termoId) {
    try {
      const urlValidacao = `${window.location.origin}/validar/${termoId}`;
      qrDataUrl = await gerarQrCodeDataUrl(urlValidacao);
      const totalPaginas = doc.internal.getNumberOfPages();
      doc.setPage(totalPaginas);
      const qrSize = 22;
      const qrX = pageWidth - marginX - qrSize;
      const qrY = doc.internal.pageSize.height - qrSize - 14;
      doc.addImage(qrDataUrl, qrX, qrY, qrSize, qrSize);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text('Validar Documento', qrX + qrSize / 2, qrY + qrSize + 4, { align: 'center' });
    } catch {
      qrDataUrl = null;
    }
  }

  // Certificado de Evidências Digitais
  const evidenciasCliente = parseEvidencias(solicitacao, 'cliente');
  let hashAssinaturaCliente = '';
  if (solicitacao?.cliente_assinatura_url) {
    try {
      const res = await fetch(solicitacao.cliente_assinatura_url);
      hashAssinaturaCliente = await sha256Blob(await res.blob());
    } catch {
      hashAssinaturaCliente = '';
    }
  }

  doc.addPage();
  let cy = 20;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('CERTIFICADO DE EVIDÊNCIAS', pageWidth / 2, cy, { align: 'center' });
  cy += 12;

  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Cliente', marginX, cy); cy += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Nome: ${proposta?.cliente_nome || '-'}`, marginX, cy); cy += 5;
  doc.text(`CPF: ${proposta?.cliente_cpf || cliente?.cpf || '-'}`, marginX, cy); cy += 5;
  doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy')}`, marginX, cy); cy += 5;
  doc.text(`Hora: ${format(new Date(), 'HH:mm:ss')}`, marginX, cy); cy += 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Evidências', marginX, cy); cy += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  [
    ['Selfie', !!evidenciasCliente.selfie_url],
    ['Frente do RG', !!evidenciasCliente.rg_frente_url],
    ['Verso do RG', !!evidenciasCliente.rg_verso_url],
    ['Assinatura', !!solicitacao?.cliente_assinatura_url],
    ['Hash do PDF', !!hashFinal],
    ['QR Code', !!qrDataUrl],
    ['Dispositivo registrado', !!evidenciasCliente.navegador],
    ['IP registrado', !!evidenciasCliente.ip],
  ].forEach(([label, ok]) => {
    doc.text(`${ok ? '✓' : '—'} ${label}`, marginX, cy);
    cy += 5.5;
  });
  cy += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Hashes', marginX, cy); cy += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  [
    ['Hash PDF', hashFinal],
    ['Hash Selfie', evidenciasCliente.selfie_hash || '-'],
    ['Hash Frente RG', evidenciasCliente.rg_frente_hash || '-'],
    ['Hash Verso RG', evidenciasCliente.rg_verso_hash || '-'],
    ['Hash Assinatura', hashAssinaturaCliente || '-'],
  ].forEach(([label, valor]) => {
    doc.text(`${label}: ${valor}`, marginX, cy, { maxWidth });
    cy += 6;
  });

  return { doc, hashFinal };
}