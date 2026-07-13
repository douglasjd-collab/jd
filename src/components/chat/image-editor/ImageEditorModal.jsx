import React, { useRef, useState, useEffect } from 'react';
import { fabric } from 'fabric';
import ImageEditorHeader from './ImageEditorHeader';
import ImageEditorToolbar from './ImageEditorToolbar';
import ImageEditorThumbnails from './ImageEditorThumbnails';
import {
  criarSeta, criarBadgeNumero, criarStamp, exportarCanvasDataUrl, bakeTransformacao,
  processarRegiao, qualidadeParaMultiplier, dataUrlParaArquivo, getLastColor, setLastColor,
} from './imageEditorHelpers';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { ZoomIn, ZoomOut, Maximize, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

let uidCounter = 0;
const uid = () => `pg_${Date.now()}_${uidCounter++}`;
const WORKING_MAX_DIM = 1100;

async function resolverUrlSegura(url) {
  if (!url) throw new Error('Imagem sem URL válida.');
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Falha ao baixar a imagem (' + res.status + ').');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export default function ImageEditorModal({
  open, onClose, imagensIniciais = [], nomeCliente, onEnviar, empresaId, conversaId, user, mensagemOrigemId,
}) {
  const canvasElRef = useRef(null);
  const fabricRef = useRef(null);
  const historyRef = useRef({});
  const numeroContadorRef = useRef(1);
  const activePageIdRef = useRef(null);
  const skipHistoryRef = useRef(false);
  const shapeAtualRef = useRef(null);
  const startPointRef = useRef(null);
  const fileInputRef = useRef(null);

  const [paginas, setPaginas] = useState([]);
  const [indiceAtual, setIndiceAtual] = useState(0);
  const [tool, setTool] = useState('select');
  const [cor, setCor] = useState(getLastColor());
  const [espessura, setEspessura] = useState(4);
  const [opacidade, setOpacidade] = useState(1);
  const [modoOcultar, setModoOcultar] = useState('borrar');
  const [qualidade, setQualidade] = useState('alta');
  const [legenda, setLegenda] = useState('');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [pronto, setPronto] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Ao fechar, limpa o estado para que a próxima abertura sempre comece do zero
  useEffect(() => {
    if (open) return;
    setPaginas([]);
    setIndiceAtual(0);
    setPronto(false);
    setErro(null);
    historyRef.current = {};
  }, [open]);

  // Inicializa páginas ao abrir
  useEffect(() => {
    if (!open) return;
    if (paginas.length > 0) return;
    const iniciais = imagensIniciais.map((item) => ({
      id: uid(),
      urlOriginal: item.url || (item.file ? URL.createObjectURL(item.file) : null),
      json: null,
      workWidth: null,
      workHeight: null,
      multiplier: 1,
      preview: null,
      legenda: '',
    }));
    setPaginas(iniciais);
    setIndiceAtual(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, imagensIniciais]);

  const atualizarUndoRedo = () => {
    const h = historyRef.current[activePageIdRef.current];
    setCanUndo(!!h && h.pointer > 0);
    setCanRedo(!!h && h.pointer < h.stack.length - 1);
  };

  const salvarHistorico = () => {
    if (skipHistoryRef.current || !fabricRef.current) return;
    const pageId = activePageIdRef.current;
    if (!pageId) return;
    if (!historyRef.current[pageId]) historyRef.current[pageId] = { stack: [], pointer: -1 };
    const h = historyRef.current[pageId];
    const json = JSON.stringify(fabricRef.current.toJSON(['backgroundImage']));
    h.stack = h.stack.slice(0, h.pointer + 1);
    h.stack.push(json);
    h.pointer = h.stack.length - 1;
    atualizarUndoRedo();
  };

  // Cria o canvas fabric uma vez
  useEffect(() => {
    if (!open || !canvasElRef.current || fabricRef.current) return;
    const canvas = new fabric.Canvas(canvasElRef.current, { preserveObjectStacking: true, selection: true });
    fabricRef.current = canvas;

    canvas.on('object:added', salvarHistorico);
    canvas.on('object:modified', salvarHistorico);
    canvas.on('object:removed', salvarHistorico);

    canvas.on('mouse:wheel', (opt) => {
      if (!opt.e.ctrlKey) return;
      opt.e.preventDefault();
      opt.e.stopPropagation();
      let z = canvas.getZoom() * (0.999 ** opt.e.deltaY);
      z = Math.min(Math.max(z, 0.2), 4);
      canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, z);
    });

    return () => {
      canvas.dispose();
      fabricRef.current = null;
      historyRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Carrega/alterna a página atual no canvas
  useEffect(() => {
    if (!fabricRef.current || paginas.length === 0) return;
    const canvas = fabricRef.current;
    const pagina = paginas[indiceAtual];
    if (!pagina) return;
    activePageIdRef.current = pagina.id;
    setLegenda(pagina.legenda || '');
    skipHistoryRef.current = true;

    const carregar = async () => {
      canvas.clear();
      setErro(null);
      try {
        if (pagina.json) {
          canvas.setDimensions({ width: pagina.workWidth, height: pagina.workHeight });
          await new Promise((resolve) => canvas.loadFromJSON(pagina.json, resolve));
          canvas.renderAll();
        } else {
          const urlSegura = await resolverUrlSegura(pagina.urlOriginal);
          await new Promise((resolve, reject) => {
            const imgEl = new window.Image();
            imgEl.onload = () => {
              const img = new fabric.Image(imgEl);
              const scale = Math.min(1, WORKING_MAX_DIM / Math.max(img.width, img.height));
              const workWidth = Math.round(img.width * scale);
              const workHeight = Math.round(img.height * scale);
              img.scaleX = scale; img.scaleY = scale;
              canvas.setDimensions({ width: workWidth, height: workHeight });
              canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
              setPaginas((prev) => prev.map((p) => (p.id === pagina.id
                ? { ...p, workWidth, workHeight, multiplier: scale > 0 ? 1 / scale : 1 }
                : p)));
              resolve();
            };
            imgEl.onerror = () => reject(new Error('Não foi possível carregar esta imagem.'));
            imgEl.src = urlSegura;
            setTimeout(() => reject(new Error('Tempo esgotado ao carregar a imagem.')), 15000);
          });
        }
        canvas.setZoom(1);
        if (!historyRef.current[pagina.id]) {
          historyRef.current[pagina.id] = { stack: [JSON.stringify(canvas.toJSON(['backgroundImage']))], pointer: 0 };
        }
        atualizarUndoRedo();
        setPronto(true);
      } catch (e) {
        setErro(e.message || 'Erro ao carregar a imagem no editor.');
        toast.error('Erro ao carregar a imagem no editor.');
      } finally {
        skipHistoryRef.current = false;
      }
    };
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indiceAtual, paginas.length, reloadKey]);

  // Configura ferramenta ativa (desenho livre / marca-texto / formas)
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    canvas.isDrawingMode = tool === 'pen' || tool === 'highlighter';
    canvas.selection = tool === 'select';
    canvas.forEachObject((o) => { o.selectable = tool === 'select'; o.evented = tool === 'select'; });

    if (canvas.isDrawingMode) {
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.color = tool === 'highlighter'
        ? cor + Math.round((opacidade * 0.5) * 255).toString(16).padStart(2, '0')
        : cor + Math.round(opacidade * 255).toString(16).padStart(2, '0');
      canvas.freeDrawingBrush.width = tool === 'highlighter' ? espessura * 3 : espessura;
    }

    canvas.off('mouse:down');
    canvas.off('mouse:move');
    canvas.off('mouse:up');

    canvas.on('mouse:down', (opt) => {
      if (!['rect', 'circle', 'line', 'arrow', 'ocultar', 'crop'].includes(tool)) {
        if (tool === 'text') {
          const p = canvas.getPointer(opt.e);
          const texto = new fabric.IText('Digite aqui', { left: p.x, top: p.y, fill: cor, fontSize: 22, opacity: opacidade });
          canvas.add(texto);
          canvas.setActiveObject(texto);
          texto.enterEditing();
        } else if (tool === 'numero') {
          const p = canvas.getPointer(opt.e);
          canvas.add(criarBadgeNumero(p.x, p.y, numeroContadorRef.current, cor));
          numeroContadorRef.current += 1;
        }
        return;
      }
      const p = canvas.getPointer(opt.e);
      startPointRef.current = p;
      let shape;
      if (tool === 'rect' || tool === 'ocultar' || tool === 'crop') {
        shape = new fabric.Rect({
          left: p.x, top: p.y, width: 1, height: 1,
          fill: tool === 'rect' ? 'transparent' : 'rgba(59,130,246,0.15)',
          stroke: tool === 'rect' ? cor : '#3b82f6', strokeWidth: tool === 'rect' ? espessura : 1,
          strokeDashArray: tool !== 'rect' ? [6, 4] : null,
        });
      } else if (tool === 'circle') {
        shape = new fabric.Ellipse({
          left: p.x, top: p.y, rx: 1, ry: 1,
          fill: 'transparent',
          stroke: cor, strokeWidth: espessura,
        });
      } else if (tool === 'line') {
        shape = new fabric.Line([p.x, p.y, p.x, p.y], { stroke: cor, strokeWidth: espessura, opacity: opacidade });
      } else if (tool === 'arrow') {
        shape = criarSeta(p.x, p.y, p.x, p.y, cor, espessura);
        shape.opacity = opacidade;
      }
      shape.selectable = false; shape.evented = false;
      shapeAtualRef.current = shape;
      canvas.add(shape);
    });

    canvas.on('mouse:move', (opt) => {
      const shape = shapeAtualRef.current;
      if (!shape || !startPointRef.current) return;
      const p = canvas.getPointer(opt.e);
      const sp = startPointRef.current;
      if (tool === 'rect' || tool === 'ocultar' || tool === 'crop') {
        shape.set({ left: Math.min(sp.x, p.x), top: Math.min(sp.y, p.y), width: Math.abs(p.x - sp.x), height: Math.abs(p.y - sp.y) });
        shape.setCoords();
      } else if (tool === 'circle') {
        shape.set({ left: Math.min(sp.x, p.x), top: Math.min(sp.y, p.y), rx: Math.abs(p.x - sp.x) / 2, ry: Math.abs(p.y - sp.y) / 2 });
        shape.setCoords();
      } else if (tool === 'line') {
        shape.set({ x2: p.x, y2: p.y });
        shape.setCoords();
      } else if (tool === 'arrow') {
        canvas.remove(shape);
        const novo = criarSeta(sp.x, sp.y, p.x, p.y, cor, espessura);
        novo.opacity = opacidade;
        novo.selectable = false; novo.evented = false;
        shapeAtualRef.current = novo;
        canvas.add(novo);
      }
      canvas.renderAll();
    });

    canvas.on('mouse:up', async () => {
      const shape = shapeAtualRef.current;
      shapeAtualRef.current = null;
      startPointRef.current = null;
      if (!shape) return;

      if (tool === 'ocultar') {
        canvas.remove(shape);
        if (shape.width > 4 && shape.height > 4) {
          try {
            const dataUrl = await processarRegiao(canvas, shape, modoOcultar);
            fabric.Image.fromURL(dataUrl, (img) => {
              img.set({ left: shape.left, top: shape.top, selectable: true });
              canvas.add(img);
              canvas.setActiveObject(img);
              setTool('select');
            });
          } catch { toast.error('Erro ao processar a área selecionada'); }
        }
        return;
      }

      if (tool === 'crop') {
        canvas.remove(shape);
        if (shape.width > 4 && shape.height > 4) {
          const objetos = canvas.getObjects();
          objetos.forEach((o) => { o.set({ left: o.left - shape.left, top: o.top - shape.top }); o.setCoords(); });
          const bg = canvas.backgroundImage;
          if (bg) bg.set({ left: (bg.left || 0) - shape.left, top: (bg.top || 0) - shape.top });
          canvas.setDimensions({ width: shape.width, height: shape.height });
          canvas.renderAll();
          salvarHistorico();
        }
        setTool('select');
        return;
      }

      shape.selectable = true;
      shape.evented = true;
      shape.setCoords();
      canvas.setActiveObject(shape);
      canvas.renderAll();
      setTool('select');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, cor, espessura, opacidade, modoOcultar]);

  useEffect(() => { setLastColor(cor); }, [cor]);

  // Atalhos de teclado
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const ativo = canvas.getActiveObject();
      if (e.key === 'Delete' && ativo) { canvas.remove(ativo); canvas.discardActiveObject(); canvas.renderAll(); }
      if (e.key === 'Escape') setTool('select');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); desfazer(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); refazer(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && ativo) {
        e.preventDefault();
        ativo.clone((cloned) => { cloned.set({ left: ativo.left + 15, top: ativo.top + 15 }); canvas.add(cloned); canvas.setActiveObject(cloned); });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const desfazer = () => {
    const canvas = fabricRef.current;
    const h = historyRef.current[activePageIdRef.current];
    if (!canvas || !h || h.pointer <= 0) return;
    h.pointer -= 1;
    skipHistoryRef.current = true;
    canvas.loadFromJSON(h.stack[h.pointer], () => { canvas.renderAll(); skipHistoryRef.current = false; atualizarUndoRedo(); });
  };

  const refazer = () => {
    const canvas = fabricRef.current;
    const h = historyRef.current[activePageIdRef.current];
    if (!canvas || !h || h.pointer >= h.stack.length - 1) return;
    h.pointer += 1;
    skipHistoryRef.current = true;
    canvas.loadFromJSON(h.stack[h.pointer], () => { canvas.renderAll(); skipHistoryRef.current = false; atualizarUndoRedo(); });
  };

  const restaurarOriginal = () => {
    const canvas = fabricRef.current;
    const pagina = paginas[indiceAtual];
    if (!canvas || !pagina) return;
    setPaginas((prev) => prev.map((p) => (p.id === pagina.id ? { ...p, json: null } : p)));
    delete historyRef.current[pagina.id];
    setReloadKey((k) => k + 1);
  };

  const aplicarTransformacao = async (tipo) => {
    const canvas = fabricRef.current;
    const pagina = paginas[indiceAtual];
    if (!canvas || !pagina) return;
    const dataUrl = await bakeTransformacao(canvas, tipo);
    fabric.Image.fromURL(dataUrl, (img) => {
      const rotacionado = tipo === 'rotate-left' || tipo === 'rotate-right';
      const novaLargura = rotacionado ? canvas.getHeight() : canvas.getWidth();
      const novaAltura = rotacionado ? canvas.getWidth() : canvas.getHeight();
      canvas.clear();
      canvas.setDimensions({ width: novaLargura, height: novaAltura });
      canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
      setPaginas((prev) => prev.map((p) => (p.id === pagina.id ? { ...p, workWidth: novaLargura, workHeight: novaAltura } : p)));
    });
  };

  const inserirEmoji = (emoji) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const texto = new fabric.IText(emoji, { left: canvas.getWidth() / 2 - 15, top: canvas.getHeight() / 2 - 15, fontSize: 40 });
    canvas.add(texto);
    canvas.setActiveObject(texto);
  };

  const inserirStamp = (label) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.add(criarStamp(canvas.getWidth() / 2, canvas.getHeight() / 2, label, cor));
  };

  const salvarPaginaAtualNoState = () => {
    const canvas = fabricRef.current;
    const pagina = paginas[indiceAtual];
    if (!canvas || !pagina) return paginas;
    const json = JSON.stringify(canvas.toJSON(['backgroundImage']));
    const atualizadas = paginas.map((p, i) => (i === indiceAtual
      ? { ...p, json, workWidth: canvas.getWidth(), workHeight: canvas.getHeight(), legenda }
      : p));
    setPaginas(atualizadas);
    return atualizadas;
  };

  const renderizarParaExport = async (pagina) => {
    const canvas = fabricRef.current;
    const isAtual = pagina.id === activePageIdRef.current;
    const multiplier = qualidadeParaMultiplier(qualidade) * (pagina.multiplier || 1);
    if (isAtual) {
      return exportarCanvasDataUrl(canvas, multiplier);
    }
    const staticCanvas = new fabric.StaticCanvas(null, { width: pagina.workWidth, height: pagina.workHeight });
    await new Promise((resolve) => staticCanvas.loadFromJSON(pagina.json, resolve));
    staticCanvas.renderAll();
    const dataUrl = staticCanvas.toDataURL({ format: 'png', multiplier });
    staticCanvas.dispose();
    return dataUrl;
  };

  const fecharComConfirmacao = () => {
    const houveEdicao = Object.keys(historyRef.current).some((id) => historyRef.current[id]?.pointer > 0);
    if (houveEdicao && !confirm('Existem alterações não enviadas. Deseja realmente fechar o editor?')) return;
    onClose();
  };

  const handleAdicionarMais = (e) => {
    const files = Array.from(e?.target?.files || []);
    if (files.length === 0) { fileInputRef.current?.click(); return; }
    const novas = files.map((file) => ({
      id: uid(), urlOriginal: URL.createObjectURL(file), json: null, workWidth: null, workHeight: null, multiplier: 1, preview: null, legenda: '',
    }));
    salvarPaginaAtualNoState();
    setPaginas((prev) => [...prev, ...novas]);
    e.target.value = '';
  };

  const handleRemoverPagina = (i) => {
    if (paginas.length <= 1) return;
    setPaginas((prev) => prev.filter((_, idx) => idx !== i));
    if (indiceAtual >= i) setIndiceAtual((idx) => Math.max(0, idx - 1));
  };

  const handleSalvarRascunho = async () => {
    setSalvando(true);
    try {
      const atualizadas = salvarPaginaAtualNoState();
      const pagina = atualizadas[indiceAtual];
      const dataUrl = await renderizarParaExport(pagina);
      const { base64, tipo } = dataUrlParaArquivo(dataUrl, 'rascunho.png');
      const blob = await (await fetch(`data:${tipo};base64,${base64}`)).blob();
      const file = new File([blob], `rascunho_${Date.now()}.png`, { type: tipo });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.ImagemEditada.create({
        empresa_id: empresaId,
        conversa_id: conversaId,
        mensagem_origem_id: mensagemOrigemId || '',
        imagem_original_url: pagina.urlOriginal,
        imagem_editada_url: file_url,
        projeto_edicao_json: pagina.json || '',
        largura: pagina.workWidth,
        altura: pagina.workHeight,
        qualidade,
        legenda: pagina.legenda || '',
        status: 'rascunho',
        criado_por_id: user?.id || '',
        criado_por_nome: user?.full_name || user?.nome_perfil || '',
      });
      toast.success('Rascunho salvo!');
    } catch (e) {
      toast.error('Erro ao salvar rascunho: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  const handleBaixar = async () => {
    const atualizadas = salvarPaginaAtualNoState();
    const pagina = atualizadas[indiceAtual];
    const dataUrl = await renderizarParaExport(pagina);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `imagem_editada_${Date.now()}.png`;
    a.click();
  };

  const handleEnviar = async () => {
    setErro(null);
    setEnviando(true);
    try {
      const atualizadas = salvarPaginaAtualNoState();
      for (let i = 0; i < atualizadas.length; i++) {
        const pagina = atualizadas[i];
        const dataUrl = await renderizarParaExport(pagina);
        const { base64, nome, tipo } = dataUrlParaArquivo(dataUrl, `imagem_editada_${i + 1}.png`);
        await onEnviar({ texto: pagina.legenda || (i === 0 ? legenda : ''), arquivo: { base64, nome, tipo } });
      }
      onClose();
    } catch (e) {
      setErro(e.message || 'Erro ao enviar a imagem. A edição foi mantida — tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 lg:left-72 bg-black z-[10000] flex flex-col">
      <ImageEditorHeader
        nomeCliente={nomeCliente}
        onClose={fecharComConfirmacao}
        onUndo={desfazer}
        onRedo={refazer}
        canUndo={canUndo}
        canRedo={canRedo}
        onRestaurar={restaurarOriginal}
        onSalvarRascunho={handleSalvarRascunho}
        onBaixar={handleBaixar}
        onEnviar={handleEnviar}
        enviando={enviando}
        salvando={salvando}
        onRotateLeft={() => aplicarTransformacao('rotate-left')}
        onRotateRight={() => aplicarTransformacao('rotate-right')}
        onFlipH={() => aplicarTransformacao('flip-h')}
        onFlipV={() => aplicarTransformacao('flip-v')}
        qualidade={qualidade}
        setQualidade={setQualidade}
      />
      <ImageEditorToolbar
        tool={tool} setTool={setTool}
        cor={cor} setCor={setCor}
        espessura={espessura} setEspessura={setEspessura}
        opacidade={opacidade} setOpacidade={setOpacidade}
        onInserirEmoji={inserirEmoji}
        onInserirStamp={inserirStamp}
        modoOcultar={modoOcultar} setModoOcultar={setModoOcultar}
      />

      {erro && (
        <div className="bg-red-950 text-red-200 text-xs px-4 py-2 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {erro}
        </div>
      )}

      <div className="flex-1 overflow-auto flex items-start justify-center bg-[#0d0d0d] py-4">
        <canvas ref={canvasElRef} />
      </div>

      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" multiple className="hidden" onChange={handleAdicionarMais} />

      <ImageEditorThumbnails
        paginas={paginas}
        indiceAtual={indiceAtual}
        setIndiceAtual={(i) => { salvarPaginaAtualNoState(); setIndiceAtual(i); }}
        onRemover={handleRemoverPagina}
        onAdicionarMais={() => handleAdicionarMais()}
        legenda={legenda}
        setLegenda={setLegenda}
        fileInputRef={fileInputRef}
      />
    </div>
  );
}