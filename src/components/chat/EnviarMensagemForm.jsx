import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
    <form onSubmit={handleEnviar} className="flex gap-2 p-4 border-t">
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleArquivo}
        className="hidden"
        accept="image/*,audio/*,video/*,application/pdf"
      />
      
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => fileInputRef.current?.click()}
        disabled={isLoading}
      >
        <Paperclip className="w-5 h-5" />
      </Button>

      <div className="flex-1">
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={arquivo ? `📎 ${arquivo.name}` : 'Digite sua mensagem...'}
          disabled={isLoading}
          className="w-full"
        />
      </div>

      <Button
        type="submit"
        disabled={isLoading || (!texto.trim() && !arquivo)}
        className="bg-[#23BE84] hover:bg-[#1da570]"
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
      </Button>
    </form>
  );
}