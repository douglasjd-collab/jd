import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Paperclip, Loader2, Smile } from 'lucide-react';

const MAX_HEIGHT = 256;
const LINE_HEIGHT = 24;

const quickReplies = ["/boasvindas", "/consorcio", "/financiamento", "/documentos"];

export default function EnviarMensagemForm({ onEnviar, isLoading }) {
  const [texto, setTexto] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [showScroll, setShowScroll] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  const handleEnviar = async (e) => {
    e.preventDefault();
    if (!texto.trim() && !arquivo) return;

    await onEnviar({ texto: texto.trim(), arquivo });

    setTexto('');
    setArquivo(null);
    setShowQuickReplies(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = '40px';
    }
    setShowScroll(false);
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
      const tipos = ['image/jpeg', 'image/png', 'image/gif', 'audio/mpeg', 'video/mp4', 'application/pdf'];
      if (tipos.includes(file.type)) {
        setArquivo(file);
      } else {
        alert('Tipo de arquivo não suportado');
      }
    }
  };

  const quickRepliesFiltered = texto === '/'
    ? quickReplies
    : quickReplies.filter(r => r.toLowerCase().startsWith(texto.toLowerCase()));

  return (
    <form onSubmit={handleEnviar} className="bg-white border-t p-3 relative">
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
        accept="image/*,audio/*,video/*,application/pdf"
      />

      <div className="flex items-end gap-2">
        {/* Botões esquerda: Anexo + Figurinha */}
        <div className="flex items-center gap-1 pb-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="rounded-full hover:bg-slate-100 w-9 h-9"
          >
            <Paperclip className="w-5 h-5 text-slate-500" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={isLoading}
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
            disabled={isLoading}
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

        {/* Botão enviar */}
        <Button
          type="submit"
          disabled={isLoading || (!texto.trim() && !arquivo)}
          className="rounded-full w-10 h-10 bg-blue-500 hover:bg-blue-600 shadow-md flex-shrink-0 mb-0.5"
          size="icon"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>
    </form>
  );
}