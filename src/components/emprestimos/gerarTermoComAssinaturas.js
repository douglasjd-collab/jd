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

// Gera o PDF do Termo de Autorização já assinado, anexando ao final uma página
// com o comprovante de cada assinatura eletrônica coletada (nome, CPF, papel, data/hora e imagem da assinatura).
export async function gerarTermoComAssinaturasPDF({ proposta, cliente, empresa, solicitacao }) {
  const doc = gerarTermoAutorizacaoPDF(proposta, cliente, empresa);

  let ordem = [];
  try { ordem = JSON.parse(solicitacao?.ordem_json || '[]'); } catch { ordem = []; }

  const assinantes = ordem.filter((role) => solicitacao?.[`${role}_status`] === 'assinado');
  if (assinantes.length === 0) return doc;

  const pageWidth = doc.internal.pageSize.width;
  const marginX = 18;
  const maxWidth = pageWidth - marginX * 2;

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

  return doc;
}