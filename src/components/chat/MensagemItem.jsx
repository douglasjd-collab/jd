import React, { useEffect, useState } from 'react';
import { FileText, Music, Check, CheckCheck, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { base44 } from '@/api/base44Client';

export default function MensagemItem({ mensagem }) {
  const [audioUrl, setAudioUrl] = useState(mensagem.arquivo_url);
  const [loadingAudio, setLoadingAudio] = useState(false);

  console.log('[MensagemItem] Renderizando:', { tipo: mensagem.tipo_conteudo, texto: mensagem.texto?.substring(0, 50), remetente: mensagem.remetente });
  
  const isVendedor = mensagem.remetente === 'vendedor';

  // Auto-baixar áudio da Evolution na primeira renderização (cache local)
  useEffect(() => {
    if (
      mensagem.tipo_conteudo === 'audio' &&
      mensagem.arquivo_url &&
      !audioUrl?.startsWith('blob:') &&
      !loadingAudio &&
      mensagem.arquivo_url.includes('evolution') // URL temporária da Evolution
    ) {
      setLoadingAudio(true);
      base44.functions.invoke('baixarMidiaWhatsApp', {
        mensagem_id: mensagem.id,
        arquivo_url: mensagem.arquivo_url
      })
        .then(res => {
          if (res.data?.arquivo_url) {
            setAudioUrl(res.data.arquivo_url);
          }
        })
        .catch(err => console.error('Erro ao baixar áudio:', err))
        .finally(() => setLoadingAudio(false));
    }
  }, [mensagem.id, mensagem.tipo_conteudo, mensagem.arquivo_url]);
  
  const formatarTexto = (texto) => {
    if (!texto) return null;
    // Aplicar formatações: *negrito*, _itálico_, ~riscado~
    const parts = texto.split(/(\*[^*]+\*|_[^_]+_|~[^~]+~)/g);
    return parts.map((part, i) => {
      if (part.startsWith('*') && part.endsWith('*'))
        return <strong key={i}>{part.slice(1, -1)}</strong>;
      if (part.startsWith('_') && part.endsWith('_'))
        return <em key={i}>{part.slice(1, -1)}</em>;
      if (part.startsWith('~') && part.endsWith('~'))
        return <s key={i}>{part.slice(1, -1)}</s>;
      return part;
    });
  };

  const renderConteudo = () => {
    switch (mensagem.tipo_conteudo) {
      case 'texto':
        return (
          <p className="break-words whitespace-pre-wrap">{formatarTexto(mensagem.texto)}</p>
        );
      
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
          <div className="flex items-center gap-2 bg-white/10 rounded-lg p-2">
            {loadingAudio ? (
              <>
                <Loader2 className="w-5 h-5 flex-shrink-0 animate-spin" />
                <span className="text-sm opacity-75">Baixando áudio...</span>
              </>
            ) : audioUrl ? (
              <>
                <Music className="w-5 h-5 flex-shrink-0" />
                <audio 
                  controls 
                  className="flex-1 h-8"
                  src={audioUrl}
                  controlsList="nodownload"
                  crossOrigin="anonymous"
                />
              </>
            ) : (
              <>
                <Music className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm opacity-75">Áudio indisponível</span>
              </>
            )}
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
        console.warn('[MensagemItem] Tipo de conteúdo desconhecido:', mensagem.tipo_conteudo);
        return <p className="text-slate-500 italic">Tipo não suportado: {mensagem.tipo_conteudo}</p>;
    }
  };

  return (
    <div className={`flex ${isVendedor ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <div
        className={`max-w-md px-4 py-3 rounded-2xl shadow-sm ${
          isVendedor
            ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-md'
            : 'bg-white text-slate-900 rounded-bl-md border border-slate-200'
        }`}
      >
        {!isVendedor && mensagem.usuario_nome && (
          <p className="text-xs font-semibold mb-1 opacity-60">{mensagem.usuario_nome}</p>
        )}
        
        <div className="mb-1">{renderConteudo()}</div>
        
        <div className="flex items-center justify-end gap-1 mt-1">
          <p className={`text-xs ${isVendedor ? 'text-white/80' : 'text-slate-500'}`}>
            {format(new Date(mensagem.data_envio || mensagem.created_date), 'HH:mm', { locale: ptBR })}
          </p>
          {isVendedor && (
            <span className="flex items-center">
              {(!mensagem.status || mensagem.status === 'pendente' || mensagem.status === 'enviada') && (
                <Check className="w-3.5 h-3.5 text-white/70" />
              )}
              {mensagem.status === 'entregue' && (
                <CheckCheck className="w-3.5 h-3.5 text-white/70" />
              )}
              {mensagem.status === 'lida' && (
                <CheckCheck className="w-3.5 h-3.5 text-sky-300" />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}