import { fabric } from 'fabric';

export const CORES_PALETA = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#000000', '#ffffff', '#f97316', '#ec4899', '#a855f7'];
export const ESPESSURAS = [2, 4, 6, 8, 12];
export const OPACIDADES = [0.25, 0.5, 0.75, 1];
export const CORES_MARCA_TEXTO = ['#fde047', '#4ade80', '#60a5fa', '#f472b6', '#fb923c'];
export const STAMPS = ['APROVADO', 'PENDENTE', 'RECUSADO', 'CONFERIDO', 'ASSINAR AQUI', 'DOCUMENTO INVÁLIDO', 'FALTA DOCUMENTO', 'PAGO', 'EM ANÁLISE'];
export const EMOJIS_RAPIDOS = ['⚠️', '✅', '❓', '💰', '📅', '➡️', '👉', '🔴'];

const LAST_COLOR_KEY = 'chat_image_editor_last_color';
export const getLastColor = () => localStorage.getItem(LAST_COLOR_KEY) || '#ef4444';
export const setLastColor = (cor) => localStorage.setItem(LAST_COLOR_KEY, cor);

export function criarSeta(x1, y1, x2, y2, cor, espessura) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 10 + espessura * 2;
  const linha = new fabric.Line([x1, y1, x2, y2], {
    stroke: cor, strokeWidth: espessura, selectable: false, evented: false,
  });
  const ponta = new fabric.Triangle({
    left: x2, top: y2, originX: 'center', originY: 'center',
    width: headLen, height: headLen, fill: cor, angle: (angle * 180) / Math.PI + 90,
    selectable: false, evented: false,
  });
  return new fabric.Group([linha, ponta], { hasBorders: true, hasControls: true });
}

export function criarBadgeNumero(x, y, numero, cor) {
  const circulo = new fabric.Circle({ radius: 15, fill: cor, originX: 'center', originY: 'center' });
  const texto = new fabric.Text(String(numero), {
    fontSize: 16, fill: '#ffffff', fontWeight: 'bold', originX: 'center', originY: 'center',
  });
  return new fabric.Group([circulo, texto], { left: x, top: y, originX: 'center', originY: 'center' });
}

export function criarStamp(x, y, texto, cor = '#ef4444') {
  const label = new fabric.Text(texto, {
    fontSize: 18, fill: '#ffffff', fontWeight: 'bold', originX: 'center', originY: 'center',
  });
  const largura = label.width + 24;
  const altura = label.height + 14;
  const fundo = new fabric.Rect({
    width: largura, height: altura, fill: cor, rx: 6, ry: 6, originX: 'center', originY: 'center',
    stroke: '#ffffff', strokeWidth: 2,
  });
  return new fabric.Group([fundo, label], { left: x, top: y, originX: 'center', originY: 'center', angle: -8 });
}

// Exporta o canvas na resolução real, ignorando zoom/pan da viewport
export function exportarCanvasDataUrl(canvas, multiplier = 1) {
  const vpt = canvas.viewportTransform;
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  const dataUrl = canvas.toDataURL({ format: 'png', multiplier });
  canvas.setViewportTransform(vpt);
  return dataUrl;
}

function carregarImagemHtml(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// "Achata" o canvas atual (imagem + anotações) aplicando rotação/espelhamento; retorna nova dataURL
export async function bakeTransformacao(canvas, tipo) {
  const dataUrl = exportarCanvasDataUrl(canvas);
  const img = await carregarImagemHtml(dataUrl);
  const off = document.createElement('canvas');
  const ctx = off.getContext('2d');
  if (tipo === 'rotate-left' || tipo === 'rotate-right') {
    off.width = img.height;
    off.height = img.width;
    ctx.translate(off.width / 2, off.height / 2);
    ctx.rotate((tipo === 'rotate-right' ? 90 : -90) * Math.PI / 180);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
  } else if (tipo === 'flip-h') {
    off.width = img.width; off.height = img.height;
    ctx.translate(off.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0);
  } else if (tipo === 'flip-v') {
    off.width = img.width; off.height = img.height;
    ctx.translate(0, off.height); ctx.scale(1, -1);
    ctx.drawImage(img, 0, 0);
  } else {
    return dataUrl;
  }
  return off.toDataURL('image/png');
}

// Processa (borra ou pixeliza) a região delimitada por um retângulo e retorna uma dataURL apenas daquele recorte
export async function processarRegiao(canvas, rect, modo) {
  const dataUrl = exportarCanvasDataUrl(canvas);
  const img = await carregarImagemHtml(dataUrl);
  const left = Math.max(0, Math.round(rect.left));
  const top = Math.max(0, Math.round(rect.top));
  const width = Math.max(1, Math.round(rect.width * rect.scaleX));
  const height = Math.max(1, Math.round(rect.height * rect.scaleY));

  const off = document.createElement('canvas');
  off.width = width; off.height = height;
  const ctx = off.getContext('2d');

  if (modo === 'pixelizar') {
    const escala = 0.08;
    const wSmall = Math.max(1, Math.round(width * escala));
    const hSmall = Math.max(1, Math.round(height * escala));
    const small = document.createElement('canvas');
    small.width = wSmall; small.height = hSmall;
    const smallCtx = small.getContext('2d');
    smallCtx.drawImage(img, left, top, width, height, 0, 0, wSmall, hSmall);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, wSmall, hSmall, 0, 0, width, height);
  } else {
    ctx.filter = 'blur(10px)';
    ctx.drawImage(img, left - 10, top - 10, width + 20, height + 20, -10, -10, width + 20, height + 20);
  }

  return off.toDataURL('image/png');
}

export function qualidadeParaMultiplier(qualidade) {
  if (qualidade === 'reduzida') return 0.6;
  if (qualidade === 'automatica') return 0.85;
  return 1; // alta qualidade
}

export function dataUrlParaArquivo(dataUrl, nome) {
  const [, base64] = dataUrl.split(',');
  return { base64, nome, tipo: 'image/png' };
}