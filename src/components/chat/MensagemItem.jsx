import React, { useEffect, useState } from 'react';
import { FileText, Music, Check, CheckCheck, Loader2, Download, FileAudio, Mic } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

export default function MensagemItem({ mensagem, conversaId }) {
  const [mediaUrl, setMediaUrl] = useState(mensagem.arquivo_url || null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [transcricao, setTranscricao] = useState(mensagem.tipo_conteudo === 'audio' && mensagem.texto && mensagem.texto !== 'Áudio' ? mensagem.texto : null);
  const [transcrevendo, setTranscrevendo] = useState(false);

  // Atualizar mediaUrl se a mensagem for atualizada externamente
  useEffect(() => {
    if (mensagem.arquivo_url && mensagem.arquivo_url !== mediaUrl) {
      setMediaUrl(mensagem.arquivo_url);
    }
  }, [mensagem.arquivo_url]);

  const isVendedor = mensagem.remetente === 'vendedor';

  // Auto-baixar mídia da Evolution/WhatsApp CDN e salvar permanentemente
  useEffect(() => {
    const isPermanente = mediaUrl?.includes('base44') || mediaUrl?.includes('supabase') || mediaUrl?.includes('amazonaws');
    const tiposMidia = ['audio', 'imagem', 'video', 'pdf', 'documento'];

    if (
      tiposMidia.includes(mensagem.tipo_conteudo) &&
      mensagem.arquivo_url &&
      !isPermanente &&
      !loadingMedia &&
      !mensagem.id?.startsWith('temp_')
    ) {
      setLoadingMedia(true);
      base44.functions.invoke('baixarMidiaWhatsApp', {
        mensagem_id: mensagem.id,
        arquivo_url: mensagem.arquivo_url
      })
        .then(res => {
          if (res.data?.arquivo_url) {
            setMediaUrl(res.data.arquivo_url);
          }
        })
        .catch(err => console.error('Erro ao baixar mídia:', err))
        .finally(() => setLoadingMedia(false));
    }
  }, [mensagem.id, mensagem.tipo_conteudo, mensagem.arquivo_url]);

  const handleTranscrever = async () => {
    const urlParaTranscrever = mediaUrl || mensagem.arquivo_url;
    if (!urlParaTranscrever) return;
    setTranscrevendo(true);
    try {
      const res = await base44.functions.invoke('transcreverAudio', {
        arquivo_url: urlParaTranscrever,
        mensagem_id: mensagem.id
      });
      if (res.data?.transcricao) {
        setTranscricao(res.data.transcricao);
      }
    } catch (err) {
      console.error('Erro ao transcrever:', err);
    } finally {
      setTranscrevendo(false);
    }
  };

  const formatarTexto = (texto) => {
    if (!texto) return null;
    const parts = texto.split(/(\*[^*]+\*|_[^_]+_|~[^~]+~)/g);
    return parts.map((part, i) => {
      if (part.startsWith('*') && part.endsWith('*')) return <strong key={i}>{part.slice(1, -1)}</strong>;
      if (part.startsWith('_') && part.endsWith('_')) return <em key={i}>{part.slice(1, -1)}</em>;
      if (part.startsWith('~') && part.endsWith('~')) return <s key={i}>{part.slice(1, -1)}</s>;
      return part;
    });
  };

  const renderConteudo = () => {
    switch (mensagem.tipo_conteudo) {
      case 'texto':
        return <p className="break-words whitespace-pre-wrap">{formatarTexto(mensagem.texto)}</p>;

      case 'imagem':
        return (
          <div className="max-w-xs">
            {loadingMedia ? (
              <div className="flex items-center gap-2 bg-white/10 rounded-lg p-4 w-32 h-32">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : mediaUrl ? (
              <img src={mediaUrl} alt="Imagem" className="rounded-lg max-w-full h-auto cursor-pointer hover:opacity-90 transition-opacity" />
            ) : (
              <div className="bg-white/10 rounded-lg p-4 text-sm opacity-75">Imagem indisponível</div>
            )}
          </div>
        );

      case 'audio':
        return (
          <div className="flex flex-col gap-2 min-w-[200px]">
            {loadingMedia ? (
              <div className="flex items-center gap-2 bg-white/10 rounded-lg p-3">
                <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
                <span className="text-sm opacity-75">Carregando áudio...</span>
              </div>
            ) : mediaUrl ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <FileAudio className="w-4 h-4 flex-shrink-0 opacity-70" />
                  <audio
                    controls
                    className="flex-1 h-8"
                    src={mediaUrl}
                    preload="metadata"
                    style={{ minWidth: '180px' }}
                  >
                    <source src={mediaUrl} type="audio/ogg" />
                    <source src={mediaUrl} type="audio/webm" />
                    <source src={mediaUrl} type="audio/mpeg" />
                  </audio>
                </div>
                {/* Transcrição */}
                {transcricao ? (
                  <div className={`text-xs mt-1 px-2 py-1.5 rounded-lg italic ${isVendedor ? 'bg-white/15 text-white/90' : 'bg-slate-100 text-slate-600'}`}>
                    🗒️ {transcricao}
                  </div>
                ) : (
                  <button
                    onClick={handleTranscrever}
                    disabled={transcrevendo}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg w-fit transition-colors ${
                      isVendedor
                        ? 'bg-white/15 hover:bg-white/25 text-white/80'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    {transcrevendo ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> Transcrevendo...</>
                    ) : (
                      <><Mic className="w-3 h-3" /> Transcrever</>
                    )}
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-white/10 rounded-lg p-3">
                <Music className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm opacity-75">Áudio indisponível</span>
              </div>
            )}
          </div>
        );

      case 'video':
        return (
          <div className="max-w-sm">
            {loadingMedia ? (
              <div className="flex items-center justify-center gap-2 bg-white/10 rounded-lg p-4 w-48 h-32">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : mediaUrl ? (
              <video controls className="rounded-lg max-w-full h-auto bg-black" src={mediaUrl} />
            ) : (
              <div className="bg-white/10 rounded-lg p-4 text-sm opacity-75">Vídeo indisponível</div>
            )}
          </div>
        );

      case 'pdf':
      case 'documento':
        return (
          <div className="flex items-center gap-2 p-3 bg-white/20 rounded-lg w-fit">
            <FileText className="w-5 h-5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium text-sm">{mensagem.arquivo_nome || 'Documento PDF'}</p>
              {mensagem.arquivo_tamanho > 0 && (
                <p className="text-xs opacity-75">{(mensagem.arquivo_tamanho / 1024 / 1024).toFixed(2)} MB</p>
              )}
            </div>
            {mensagem.arquivo_url && (
              <a href={mensagem.arquivo_url} target="_blank" rel="noopener noreferrer" className="ml-2">
                <Download className="w-4 h-4 hover:opacity-70 transition-opacity" />
              </a>
            )}
          </div>
        );

      default:
        return <p className="text-slate-500 italic text-sm">Tipo não suportado</p>;
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
              {mensagem.status === 'entregue' && <CheckCheck className="w-3.5 h-3.5 text-white/70" />}
              {mensagem.status === 'lida' && <CheckCheck className="w-3.5 h-3.5 text-sky-300" />}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}