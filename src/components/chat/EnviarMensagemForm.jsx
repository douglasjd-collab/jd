import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Paperclip, Loader2 } from 'lucide-react';

export default function EnviarMensagemForm({ onEnviar, isLoading }) {
  const [texto, setTexto] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const fileInputRef = useRef(null);

  const handleEnviar = async (e) => {
    e.preventDefault();
    if (!texto.trim() && !arquivo) return;

    await onEnviar({
      texto: texto.trim(),
      arquivo
    });

    setTexto('');
    setArquivo(null);
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

  return (
    <form onSubmit={handleEnviar} className="bg-white border-t p-4">
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleArquivo}
        className="hidden"
        accept="image/*,audio/*,video/*,application/pdf"
      />
      
      <div className="flex items-end gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="rounded-full hover:bg-slate-100"
        >
          <Paperclip className="w-5 h-5 text-slate-600" />
        </Button>

        <div className="flex-1">
          <textarea
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleEnviar(e);
              }
            }}
            placeholder={arquivo ? `📎 ${arquivo.name}` : 'Digite sua mensagem...'}
            disabled={isLoading}
            rows={1}
            className="w-full rounded-2xl border border-slate-300 px-4 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none overflow-y-auto text-sm leading-5"
            style={{ minHeight: '38px', maxHeight: '240px' }}
          />
        </div>

        <Button
          type="submit"
          disabled={isLoading || (!texto.trim() && !arquivo)}
          className="rounded-full w-12 h-12 bg-blue-500 hover:bg-blue-600 shadow-lg"
          size="icon"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </Button>
      </div>
    </form>
  );
}