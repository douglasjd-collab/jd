import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Paperclip, Smile, AlertCircle, Mic, MicOff, X } from 'lucide-react';

const MAX_HEIGHT = 256;
const LINE_HEIGHT = 24;

const quickReplies = ["/boasvindas", "/consorcio", "/financiamento", "/documentos"];

export default function EnviarMensagemForm({ onEnviar, isLoading = false }) {
  const [texto, setTexto] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [showScroll, setShowScroll] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [erro, setErro] = useState(null);
  const [gravando, setGravando] = useState(false);
  const [tempoGravacao, setTempoGravacao] = useState(0);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const iniciarGravacao = async () => {
    setErro(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.start(100);
      setGravando(true);
      setTempoGravacao(0);
      timerRef.current = setInterval(() => setTempoGravacao(t => t + 1), 1000);
    } catch (err) {
      setErro('Permissão de microfone negada. Verifique as configurações do navegador.');
    }
  };

  const cancelarGravacao = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
      mediaRecorderRef.current.stop();
    }
    audioChunksRef.current = [];
    setGravando(false);
    setTempoGravacao(0);
  };

  const enviarAudio = async () => {
    if (!mediaRecorderRef.current) return;
    clearInterval(timerRef.current);

    await new Promise((resolve) => {
      mediaRecorderRef.current.onstop = resolve;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
    });

    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      setGravando(false);
      setTempoGravacao(0);
      setErro(null);
      try {
        await onEnviar({
          texto: '',
          arquivo: { base64, nome: 'audio.webm', tipo: 'audio/webm' }
        });
      } catch (err) {
        setErro(err.message || 'Erro ao enviar áudio.');
      }
    };
    reader.readAsDataURL(blob);
  };

  const formatarTempo = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const handleEnviar = async (e) => {
    e.preventDefault();
    if (!texto.trim() && !arquivo) return;
    if (isLoading) return;

    const textoEnviar = texto.trim();
    setErro(null);
    
    try {
      let arquivoBase64 = null;
      let nomeArquivo = null;
      let tipoArquivo = null;

      if (arquivo) {
        const reader = new FileReader();
        arquivoBase64 = await new Promise((resolve, reject) => {
          reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(arquivo);
        });
        nomeArquivo = arquivo.name;
        tipoArquivo = arquivo.type;
      }

      await onEnviar({ 
        texto: textoEnviar, 
        arquivo: arquivoBase64 ? { base64: arquivoBase64, nome: nomeArquivo, tipo: tipoArquivo } : null 
      });
      setTexto('');
      setArquivo(null);
      setShowQuickReplies(false);
      if (textareaRef.current) {
        textareaRef.current.style.height = '40px';
      }
      setShowScroll(false);
    } catch (err) {
      setErro(err.message || 'Erro ao enviar mensagem. Tente novamente.');
    }
  };

  const handleSelectQuickReply = (reply) => {
    setTexto(reply + ' ');
    setShowQuickReplies(false);
    textareaRef.current?.focus();
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setTexto(val);
    // Mostrar quick replies se o texto for apenas "/" ou começar com "/"
    setShowQuickReplies(val === '/' || (val.startsWith('/') && !val.includes(' ')));
    const el = e.target;
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

  const handleArquivo = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const aceito = file.type.startsWith('image/') || file.type.startsWith('audio/') || file.type.startsWith('video/') || file.type === 'application/pdf';
      if (aceito) {
        setArquivo(file);
      } else {
        alert('Tipo de arquivo não suportado. Use imagem, áudio, vídeo ou PDF.');
      }
    }
  };

  const quickRepliesFiltered = texto === '/'
    ? quickReplies
    : quickReplies.filter(r => r.toLowerCase().startsWith(texto.toLowerCase()));

  return (
    <form onSubmit={handleEnviar} className="bg-white border-t p-3 relative">
      {erro && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {erro}
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
        onChange={handleArquivo}
        className="hidden"
        accept="image/*,audio/*,video/*,application/pdf,.pdf"
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

      {/* UI de gravação ativa */}
      {gravando ? (
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
            onClick={enviarAudio}
            disabled={isLoading}
            className="rounded-full w-10 h-10 bg-green-500 hover:bg-green-600 shadow-md flex-shrink-0"
            size="icon"
            title="Enviar áudio"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          {/* Botões esquerda: Anexo + Figurinha */}
          <div className="flex items-center gap-1 pb-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-full hover:bg-slate-100 w-9 h-9"
            >
              <Paperclip className="w-5 h-5 text-slate-500" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full hover:bg-slate-100 w-9 h-9"
            >
              <Smile className="w-5 h-5 text-slate-500" />
            </Button>
          </div>

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
              placeholder={arquivo ? `📎 ${arquivo.name}` : 'Digite sua mensagem...'}
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
            disabled={(!texto.trim() && !arquivo) || isLoading}
            className="rounded-full w-10 h-10 bg-blue-500 hover:bg-blue-600 shadow-md flex-shrink-0 mb-0.5"
            size="icon"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      )}
    </form>
  );
}