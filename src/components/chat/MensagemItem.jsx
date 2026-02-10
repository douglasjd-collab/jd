import React from 'react';
import { FileText, Music, Play, Image as ImageIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function MensagemItem({ mensagem }) {
  const isVendedor = mensagem.remetente === 'vendedor';
  console.log('🎯 Renderizando MensagemItem:', { 
    id: mensagem.id,
    tipo: mensagem.tipo_conteudo,
    remetente: mensagem.remetente,
    texto: (mensagem.texto || '').substring(0, 30)
  });
  
  const renderConteudo = () => {
    switch (mensagem.tipo_conteudo) {
      case 'texto':
        return <p className="break-words">{mensagem.texto}</p>;
      
      case 'imagem':
        return (
          <div className="max-w-xs">
            <img 
              src={mensagem.arquivo_url} 
              alt="Imagem" 
              className="rounded-lg max-w-full h-auto cursor-pointer hover:opacity-90"
            />
          </div>
        );
      
      case 'audio':
        return (
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4" />
            <audio 
              controls 
              className="max-w-xs h-8"
              src={mensagem.arquivo_url}
            />
          </div>
        );
      
      case 'video':
        return (
          <div className="max-w-xs">
            <video 
              controls 
              className="rounded-lg max-w-full h-auto"
              src={mensagem.arquivo_url}
            />
          </div>
        );
      
      case 'pdf':
      case 'documento':
        return (
          <a 
            href={mensagem.arquivo_url} 
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 p-3 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
          >
            <FileText className="w-4 h-4" />
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium text-sm">{mensagem.arquivo_nome}</p>
              <p className="text-xs opacity-75">
                {(mensagem.arquivo_tamanho / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </a>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className={`flex ${isVendedor ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
          isVendedor
            ? 'bg-[#23BE84] text-white rounded-br-none'
            : 'bg-slate-200 text-slate-900 rounded-bl-none'
        }`}
      >
        {!isVendedor && mensagem.cliente_nome && (
          <p className="text-xs font-semibold opacity-75 mb-1">{mensagem.cliente_nome}</p>
        )}
        
        <div>{renderConteudo()}</div>
        
        <p className={`text-xs mt-1 ${isVendedor ? 'text-white/70' : 'text-slate-600'}`}>
          {format(new Date(mensagem.created_date), 'HH:mm', { locale: ptBR })}
        </p>
        
        {isVendedor && mensagem.status && (
          <p className="text-xs text-white/70 capitalize">{mensagem.status}</p>
        )}
      </div>
    </div>
  );
}