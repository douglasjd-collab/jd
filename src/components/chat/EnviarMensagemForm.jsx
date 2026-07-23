import React, { useState, useRef, useEffect } from 'react';
import heic2any from 'heic2any';
import { encodeFloat32ToMp3 } from '@/utils/converterAudioParaMp3';
import { Button } from '@/components/ui/button';
import { Send, Paperclip, Smile, AlertCircle, Mic, X, PenLine, Zap, FileText, Plus, Camera } from 'lucide-react';
import MensagensRapidasModal from './MensagensRapidasModal';
import TemplateMetaModal from './TemplateMetaModal';
import ImageEditorModal from './image-editor/ImageEditorModal';

const TIPOS_IMAGEM = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

const MAX_HEIGHT = 256;
const LINE_HEIGHT = 24;

const quickReplies = ["/boasvindas", "/consorcio", "/financiamento", "/documentos"];

export default function EnviarMensagemForm({ onEnviar, isLoading = false, nomeUsuario = '', empresaId = null, telefoneDestino = null, nomeCliente = null, conversaId = null, onTemplateEnviado = null, scriptExterno = null, coachIAOpen = false, setCoachIAOpen = null }) {
  const [texto, setTexto] = useState('');
  const [assinaturaAtiva, setAssinaturaAtiva] = useState(() => {
    return localStorage.getItem('chat_assinatura') === 'true';
  });
  const [arquivos, setArquivos] = useState([]);
  const [showScroll, setShowScroll] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [erro, setErro] = useState(null);
  const [gravando, setGravando] = useState(false);
  const [tempoGravacao, setTempoGravacao] = useState(0);
  const [audioPreview, setAudioPreview] = useState(null); // { url, blob, base64 }
  const [mensagensRapidasOpen, setMensagensRapidasOpen] = useState(false);
  const [templateMetaOpen, setTemplateMetaOpen] = useState(false);
  const [menuPlusOpen, setMenuPlusOpen] = useState(false);
  const [imagensParaEditor, setImagensParaEditor] = useState([]);
  const [editorAberto, setEditorAberto] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  const abrirEditorComArquivos = (files) => {
    setImagensParaEditor(files.map((file) => ({ file })));
    setEditorAberto(true);
  };

  const [showEmoji, setShowEmoji] = useState(false);

  const capturarCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      // Aguardar o track fornecer dimensões
      await new Promise((r) => setTimeout(r, 300));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      canvas.getContext('2d').drawImage(video, 0, 0);
      stream.getTracks().forEach((t) => t.stop());
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `foto_camera_${Date.now()}.png`, { type: 'image/png' });
          abrirEditorComArquivos([file]);
        }
      }, 'image/png');
    } catch (err) {
      setErro('Não foi possível acessar a câmera. Permissão negada ou cancelada.');
    }
  };

  const inserirEmoji = (emoji) => {
    const el = textareaRef.current;
    if (el) {
      const start = el.selectionStart ?? texto.length;
      const end = el.selectionEnd ?? texto.length;
      const novo = texto.slice(0, start) + emoji + texto.slice(end);
      setTexto(novo);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + emoji.length, start + emoji.length);
      });
    } else {
      setTexto((prev) => prev + emoji);
    }
  };

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, []);

  // Rascunho por conversa — preserva o texto digitado quando o atendente troca
  // de conversa. O form é remontado a cada troca (key={conversaId}), então
  // restauramos/mantemos o rascunho via localStorage.
  const RASCUNHO_PREFIX = 'rascunho_batepapo_';
  useEffect(() => {
    if (!conversaId) return;
    const salvo = localStorage.getItem(RASCUNHO_PREFIX + conversaId);
    if (salvo != null) setTexto(salvo);
  }, [conversaId]);

  useEffect(() => {
    if (!conversaId) return;
    localStorage.setItem(RASCUNHO_PREFIX + conversaId, texto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, conversaId]);

  // Script externo (Coach IA)
  useEffect(() => {
    if (scriptExterno) {
      setTexto(scriptExterno);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(0, 0);
          autoResizeTextarea(textareaRef.current);
        }
      }, 150);
    }
  }, [scriptExterno]);

  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);
  const processorRef = useRef(null);
  const silentGainRef = useRef(null);
  const pcmChunksRef = useRef([]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      pararCapturaAudio();
    };
  }, []);

  useEffect(() => {
    if (!menuPlusOpen) return;
    const handler = (e) => {
      if (!e.target.closest('.menu-plus-container') && !e.target.closest('.emoji-picker-container')) {
        setMenuPlusOpen(false);
        setShowEmoji(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuPlusOpen]);

  // Lista de emojis nativos para o picker
  const EMOJIS = ['😀','😁','😂','🤣','😊','😍','😘','😉','😎','🤔','🙃','😅','😢','😭','😡','👍','👎','🙏','👏','💪','❤️','🧡','💛','💚','💙','💜','🖤','✅','❌','⭐','🎉','🔥','💯','🙏','👀','🤝','🤙','✌️','🤞','🙏🏽'];

  // Captura amostras PCM diretamente do microfone (evita decodeAudioData sobre
  // blob webm do MediaRecorder, que falha em vários navegadores).
  const iniciarGravacao = async () => {
    setErro(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0; // evita eco: processor precisa chegar ao destino para disparar, mas sem volume

      pcmChunksRef.current = [];
      processor.onaudioprocess = (e) => {
        pcmChunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioCtx.destination);

      sourceRef.current = source;
      processorRef.current = processor;
      silentGainRef.current = silentGain;

      setGravando(true);
      setTempoGravacao(0);
      timerRef.current = setInterval(() => setTempoGravacao(t => t + 1), 1000);
    } catch (err) {
      setErro('Permissão de microfone negada. Verifique as configurações do navegador.');
    }
  };

  // Desliga o grafo de áudio e o microfone; retorna a sampleRate usada na captura
  const pararCapturaAudio = () => {
    if (processorRef.current) processorRef.current.disconnect();
    if (sourceRef.current) sourceRef.current.disconnect();
    if (silentGainRef.current) silentGainRef.current.disconnect();
    streamRef.current?.getTracks().forEach(t => t.stop());
    const sampleRate = audioCtxRef.current?.sampleRate;
    audioCtxRef.current?.close();
    processorRef.current = null;
    sourceRef.current = null;
    silentGainRef.current = null;
    audioCtxRef.current = null;
    streamRef.current = null;
    return sampleRate;
  };

  const cancelarGravacao = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    pararCapturaAudio();
    pcmChunksRef.current = [];
    setGravando(false);
    setTempoGravacao(0);
  };

  // Parar gravação e entrar no modo preview (sem enviar ainda)
  const pararGravacaoParaPreview = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const sampleRate = pararCapturaAudio();
    setGravando(false);
    setTempoGravacao(0);

    const totalLength = pcmChunksRef.current.reduce((acc, c) => acc + c.length, 0);
    const samples = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of pcmChunksRef.current) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }
    pcmChunksRef.current = [];

    try {
      const { blob: mp3Blob, base64 } = await encodeFloat32ToMp3(samples, sampleRate);
      const url = URL.createObjectURL(mp3Blob);
      setAudioPreview({ url, base64, mimeType: 'audio/mpeg', ext: 'mp3' });
    } catch (err) {
      console.error('Erro ao converter áudio para mp3:', err);
      setErro('Erro ao processar o áudio gravado: ' + (err.message || 'tente novamente.'));
    }
  };

  const cancelarPreviewAudio = () => {
    if (audioPreview?.url) URL.revokeObjectURL(audioPreview.url);
    setAudioPreview(null);
    pcmChunksRef.current = [];
  };

  const confirmarEnvioAudio = async () => {
    if (!audioPreview) return;
    setErro(null);
    const { url } = audioPreview;
    const preview = { ...audioPreview };
    setAudioPreview(null);
    URL.revokeObjectURL(url);
    const { base64, mimeType = 'audio/webm', ext = 'webm' } = preview;
    // Não awaited — o envio ocorre em background, liberando o microfone/botão.
    onEnviar({
      texto: '',
      arquivo: { base64, nome: `audio.${ext}`, tipo: mimeType, tamanho: 0 }
    });
  };

  // mantido para compatibilidade (não usado mais diretamente)
  const enviarAudio = pararGravacaoParaPreview;

  const formatarTempo = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // Converte HEIC/HEIF para JPEG usando heic2any
  const converterHeicParaJpeg = async (file) => {
    const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    const resultBlob = Array.isArray(blob) ? blob[0] : blob;
    const nomeJpeg = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    return new File([resultBlob], nomeJpeg, { type: 'image/jpeg' });
  };

  const prepararArquivo = async (file) => {
    const nome = file.name?.toLowerCase() || '';
    if (nome.endsWith('.heic') || nome.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif') {
      return await converterHeicParaJpeg(file);
    }
    return file;
  };

  const lerArquivoBase64 = async (file) => {
    const filePreparado = await prepararArquivo(file);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ base64: reader.result.split(',')[1], file: filePreparado });
      reader.onerror = reject;
      reader.readAsDataURL(filePreparado);
    });
  };

  const getMimeType = (file) => {
    let tipo = file.type || '';
    if (!tipo) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      const mimeMap = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', mp3: 'audio/mpeg', mp4: 'video/mp4', webm: 'audio/webm', ogg: 'audio/ogg', heic: 'image/jpeg', heif: 'image/jpeg' };
      tipo = mimeMap[ext] || 'application/octet-stream';
    }
    // HEIC/HEIF serão convertidos para JPEG antes do envio
    if (tipo === 'image/heic' || tipo === 'image/heif') return 'image/jpeg';
    return tipo;
  };

  const handleEnviar = async (e) => {
    e && e.preventDefault && e.preventDefault();
    if (!texto.trim() && arquivos.length === 0) return;
    // Não bloquear mais: cada mensagem tem status próprio na fila (FilaEnvioBadge).
    // O campo continua liberado para o próximo envio, mesmo com mídia ainda em upload.

    const assinatura = assinaturaAtiva && nomeUsuario ? `*Atendente - ${nomeUsuario}*\n\n` : '';
    const textoEnviar = assinatura + texto.trim();
    setErro(null);

    // Limpar UI imediatamente — desacopla o estado do form do pipeline de envio
    const arquivosParaEnviar = [...arquivos];
    setTexto('');
    setArquivos([]);
    setShowQuickReplies(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = '40px';
    }
    setShowScroll(false);

    try {
      if (arquivosParaEnviar.length === 0) {
        // Só texto — dispara sem await
        onEnviar({ texto: textoEnviar, arquivo: null });
      } else if (arquivosParaEnviar.length === 1) {
        // Um arquivo: passar File (não base64) — a fila lê com progresso real
        const filePreparado = await prepararArquivo(arquivosParaEnviar[0]);
        onEnviar({
          texto: textoEnviar,
          arquivo: { file: filePreparado, nome: filePreparado.name, tipo: getMimeType(filePreparado), tamanho: filePreparado.size }
        });
      } else {
        // Múltiplos arquivos: cada um vira um item independente da fila
        for (let i = 0; i < arquivosParaEnviar.length; i++) {
          const filePreparado = await prepararArquivo(arquivosParaEnviar[i]);
          // Texto só na primeira mensagem
          onEnviar({
            texto: i === 0 ? textoEnviar : '',
            arquivo: { file: filePreparado, nome: filePreparado.name, tipo: getMimeType(filePreparado), tamanho: filePreparado.size }
          });
        }
      }
    } catch (err) {
      setErro(err.message || 'Erro ao enviar mensagem. Tente novamente.');
    }
  };

  const handleSelectQuickReply = (reply) => {
    setTexto(reply + ' ');
    setShowQuickReplies(false);
    textareaRef.current?.focus();
  };

  const autoResizeTextarea = (el) => {
    if (!el) return;
    el.style.height = '40px';
    const scrollH = el.scrollHeight;
    if (scrollH >= MAX_HEIGHT) {
      el.style.height = MAX_HEIGHT + 'px';
      el.style.overflowY = 'auto';
      setShowScroll(true);
    } else {
      el.style.height = scrollH + 'px';
      el.style.overflowY = 'hidden';
      setShowScroll(false);
    }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setTexto(val);
    setShowQuickReplies(val === '/' || (val.startsWith('/') && !val.includes(' ')));
    autoResizeTextarea(e.target);
  };

  const handleArquivo = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const aceitos = files.filter(file => {
      const nome = file.name?.toLowerCase() || '';
      const tipo = file.type || '';
      return tipo.startsWith('image/') || tipo.startsWith('audio/') || tipo.startsWith('video/') ||
        tipo === 'application/pdf' || tipo.includes('pdf') ||
        tipo === 'image/heic' || tipo === 'image/heif' ||
        nome.endsWith('.pdf') || nome.endsWith('.jpg') || nome.endsWith('.jpeg') ||
        nome.endsWith('.png') || nome.endsWith('.gif') || nome.endsWith('.mp3') ||
        nome.endsWith('.mp4') || nome.endsWith('.webm') || nome.endsWith('.ogg') ||
        nome.endsWith('.doc') || nome.endsWith('.docx') || nome.endsWith('.xls') || nome.endsWith('.xlsx') ||
        nome.endsWith('.heic') || nome.endsWith('.heif');
    });
    if (aceitos.length < files.length) {
      setErro('Alguns arquivos não são suportados e foram ignorados.');
    }
    // Imagens (png/jpg/jpeg/webp) abrem o Editor Inteligente de Imagens antes do envio
    const imagens = aceitos.filter(f => TIPOS_IMAGEM.includes(f.type));
    const outros = aceitos.filter(f => !TIPOS_IMAGEM.includes(f.type));
    if (imagens.length > 0) abrirEditorComArquivos(imagens);
    if (outros.length > 0) {
      setArquivos(prev => [...prev, ...outros]);
    }
    // Reset input para permitir selecionar os mesmos arquivos novamente
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || []);
    const imagens = files.filter(f => TIPOS_IMAGEM.includes(f.type));
    if (imagens.length > 0) abrirEditorComArquivos(imagens);
  };

  const removerArquivo = (idx) => {
    setArquivos(prev => prev.filter((_, i) => i !== idx));
  };

  const quickRepliesFiltered = texto === '/'
    ? quickReplies
    : quickReplies.filter(r => r.toLowerCase().startsWith(texto.toLowerCase()));

  const capitalizarNome = (nome) => {
    if (!nome) return '';
    const t = nome.trim();
    if (t === t.toUpperCase() && t.length > 1) {
      return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    }
    return t;
  };

  const substituirVariaveis = (texto) => {
    if (!texto) return texto;
    const nomeCompleto = (nomeCliente || '').trim();
    const primeiroNomeRaw = nomeCompleto.split(/\s+/)[0] || '';
    const primeiroNome = capitalizarNome(primeiroNomeRaw);
    const nomeFormatado = capitalizarNome(nomeCompleto);
    let resultado = texto;
    resultado = resultado.replace(/\{primeiro_nome\}/gi, primeiroNome);
    resultado = resultado.replace(/\{nome_completo\}/gi, nomeFormatado);
    resultado = resultado.replace(/\{nome\}/gi, nomeFormatado);
    resultado = resultado.replace(/\{telefone\}/gi, telefoneDestino || '');
    return resultado;
  };

  const handleUsarMensagemRapida = ({ tipo, conteudo }) => {
    if (tipo === 'texto') {
      const novo = substituirVariaveis(conteudo);
      setTexto(novo);
      setTimeout(() => {
        textareaRef.current?.focus();
        if (textareaRef.current) {
          textareaRef.current.value = novo;
          autoResizeTextarea(textareaRef.current);
        }
      }, 100);
    }
  };

  return (
    <>
    <MensagensRapidasModal
      open={mensagensRapidasOpen}
      onOpenChange={setMensagensRapidasOpen}
      empresaId={empresaId}
      onUsar={handleUsarMensagemRapida}
    />
    <TemplateMetaModal
      open={templateMetaOpen}
      onOpenChange={setTemplateMetaOpen}
      empresaId={empresaId}
      telefoneDestino={telefoneDestino}
      conversaId={conversaId}
      onEnviado={onTemplateEnviado}
    />
    <ImageEditorModal
      open={editorAberto}
      onClose={() => { setEditorAberto(false); setImagensParaEditor([]); }}
      imagensIniciais={imagensParaEditor}
      nomeCliente={nomeCliente || telefoneDestino}
      empresaId={empresaId}
      conversaId={conversaId}
      user={{ full_name: nomeUsuario }}
      onEnviar={onEnviar}
    />
    <form onSubmit={handleEnviar} className="bg-white border-t p-3 relative" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
      {erro && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {erro}
          <button type="button" onClick={() => setErro(null)} className="ml-auto"><X className="w-3 h-3" /></button>
        </div>
      )}
      <style>{`
        .msg-textarea::-webkit-scrollbar { width: 4px; }
        .msg-textarea::-webkit-scrollbar-track { background: transparent; }
        .msg-textarea::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .msg-textarea::-webkit-scrollbar-button { display: none; height: 0; width: 0; }
      `}</style>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleArquivo}
        className="hidden"
        accept="image/*,audio/*,video/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.heic,.heif"
      />

      {/* Quick Replies Popup */}
      {showQuickReplies && quickRepliesFiltered.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-1 mx-3 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-10">
          {quickRepliesFiltered.map((reply) => (
            <button
              key={reply}
              type="button"
              onClick={() => handleSelectQuickReply(reply)}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors border-b last:border-0 border-slate-100"
            >
              <span className="font-medium text-blue-600">{reply}</span>
            </button>
          ))}
        </div>
      )}

      {/* Preview arquivos selecionados */}
      {arquivos.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {arquivos.map((f, i) => (
            <div key={i} className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1 text-xs text-blue-800 max-w-[200px]">
              <span className="truncate flex-1">{f.name}</span>
              <button type="button" onClick={() => removerArquivo(i)} className="text-blue-400 hover:text-red-500 flex-shrink-0 ml-1">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* UI de preview do áudio gravado (confirmar antes de enviar) */}
      {audioPreview ? (
        <div className="flex flex-col gap-2 px-2 py-1">
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-2xl px-3 py-2">
            <Mic className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <audio controls src={audioPreview.url} className="flex-1 h-8" style={{ minWidth: 0 }} />
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={cancelarPreviewAudio} className="flex-1 text-slate-500 hover:bg-slate-100 rounded-xl gap-1.5">
              <X className="w-4 h-4" /> Descartar
            </Button>
            <Button type="button" size="sm" onClick={confirmarEnvioAudio} disabled={isLoading} className="flex-1 bg-green-500 hover:bg-green-600 text-white rounded-xl gap-1.5">
              <Send className="w-4 h-4" /> Enviar áudio
            </Button>
          </div>
        </div>
      ) : gravando ? (
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="flex items-center gap-2 flex-1 bg-red-50 border border-red-200 rounded-2xl px-4 py-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <span className="text-sm font-medium text-red-600">Gravando...</span>
            <span className="text-sm text-red-500 font-mono ml-auto">{formatarTempo(tempoGravacao)}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={cancelarGravacao}
            className="rounded-full w-10 h-10 text-slate-500 hover:bg-slate-100 flex-shrink-0"
            title="Cancelar"
          >
            <X className="w-5 h-5" />
          </Button>
          <Button
            type="button"
            onClick={pararGravacaoParaPreview}
            disabled={isLoading}
            className="rounded-full w-10 h-10 bg-green-500 hover:bg-green-600 shadow-md flex-shrink-0"
            size="icon"
            title="Parar e revisar"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          {/* Botão + com menu popup */}
          <div className="relative pb-1 menu-plus-container">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setMenuPlusOpen(prev => !prev)}
              className={`rounded-full w-10 h-10 transition-all ${menuPlusOpen ? 'bg-blue-100 text-blue-600 rotate-45' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
              title="Mais opções"
            >
              <Plus className="w-5 h-5" />
            </Button>

            {/* Menu popup */}
            {menuPlusOpen && (
              <div className="absolute bottom-full left-0 mb-2 bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden z-20 min-w-[200px]">
                <button
                  type="button"
                  onClick={() => { fileInputRef.current?.click(); setMenuPlusOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Paperclip className={`w-4 h-4 ${arquivos.length > 0 ? 'text-blue-500' : 'text-slate-500'}`} />
                  <span>Anexar arquivo</span>
                  {arquivos.length > 0 && <span className="ml-auto text-xs text-blue-500 font-medium">{arquivos.length}</span>}
                </button>
                <button
                  type="button"
                  onClick={() => { capturarCamera(); setMenuPlusOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors border-t border-slate-100"
                >
                  <Camera className="w-4 h-4 text-slate-500" />
                  <span>Câmera</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowEmoji(prev => !prev)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors border-t border-slate-100"
                >
                  <Smile className="w-4 h-4 text-slate-500" />
                  <span>Emoji</span>
                </button>
                {nomeUsuario && (
                  <button
                    type="button"
                    onClick={() => {
                      const novo = !assinaturaAtiva;
                      setAssinaturaAtiva(novo);
                      localStorage.setItem('chat_assinatura', String(novo));
                      setMenuPlusOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors border-t border-slate-100"
                  >
                    <PenLine className={`w-4 h-4 ${assinaturaAtiva ? 'text-blue-500' : 'text-slate-500'}`} />
                    <span>Assinatura</span>
                    {assinaturaAtiva && <span className="ml-auto text-xs text-blue-500 font-medium">Ativa</span>}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setMensagensRapidasOpen(true); setMenuPlusOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors border-t border-slate-100"
                >
                  <Zap className="w-4 h-4 text-yellow-500" />
                  <span>Mensagens Rápidas</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setTemplateMetaOpen(true); setMenuPlusOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors border-t border-slate-100"
                >
                  <FileText className="w-4 h-4 text-green-500" />
                  <span>Template Meta</span>
                </button>
                {setCoachIAOpen && (
                  <button
                    type="button"
                    onClick={() => { setCoachIAOpen(!coachIAOpen); setMenuPlusOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors border-t border-slate-100 ${coachIAOpen ? 'bg-violet-50 text-violet-700' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    <span className="text-base">🤖</span>
                    <span>Coach IA</span>
                    {coachIAOpen && <span className="ml-auto text-xs text-violet-500 font-medium">Aberto</span>}
                  </button>
                )}
              </div>
            )}

            {/* Emoji picker */}
            {showEmoji && (
              <div className="emoji-picker-container absolute bottom-full left-0 mb-2 bg-white border border-slate-200 rounded-2xl shadow-lg p-2 z-30 w-[280px]">
                <div className="grid grid-cols-8 gap-1 max-h-40 overflow-y-auto">
                  {EMOJIS.map((emoji, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => { inserirEmoji(emoji); setShowEmoji(false); }}
                      className="w-8 h-8 flex items-center justify-center text-xl rounded hover:bg-slate-100 transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Botão Mensagens Rápidas */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setMensagensRapidasOpen(true)}
            className="rounded-full w-10 h-10 bg-slate-100 hover:bg-yellow-100 text-slate-600 hover:text-yellow-600 flex-shrink-0 mb-0.5"
            title="Mensagens Rápidas"
          >
            <Zap className="w-5 h-5" />
          </Button>

          {/* Textarea */}
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={texto}
              onChange={handleChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleEnviar(e);
                }
              }}
              onPaste={(e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                for (const item of items) {
                  if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) {
                      const ext = item.type.split('/')[1] || 'png';
                      const nomeFile = new File([file], `imagem_colada.${ext}`, { type: item.type });
                      abrirEditorComArquivos([nomeFile]);
                    }
                    break;
                  }
                }
              }}
              placeholder={arquivos.length > 0 ? `📎 ${arquivos.length} arquivo(s) selecionado(s)` : 'Digite sua mensagem...'}
              rows={1}
              className="msg-textarea w-full rounded-2xl border border-slate-300 px-4 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none text-sm"
              style={{
                minHeight: '40px',
                maxHeight: MAX_HEIGHT + 'px',
                overflowY: 'hidden',
                lineHeight: LINE_HEIGHT + 'px',
              }}
            />
          </div>

          {/* Botão gravar áudio */}
          <Button
            type="button"
            onClick={iniciarGravacao}
            disabled={isLoading}
            className="rounded-full w-10 h-10 bg-slate-100 hover:bg-slate-200 flex-shrink-0 mb-0.5"
            size="icon"
            title="Gravar áudio"
            variant="ghost"
          >
            <Mic className="w-5 h-5 text-slate-600" />
          </Button>

          {/* Botão enviar */}
          <Button
            type="submit"
            disabled={(!texto.trim() && arquivos.length === 0) || isLoading}
            className="rounded-full w-10 h-10 bg-blue-500 hover:bg-blue-600 shadow-md flex-shrink-0 mb-0.5"
            size="icon"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      )}
    </form>
    </>
  );
}