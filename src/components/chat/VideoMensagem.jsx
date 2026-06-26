import React, { useState, useEffect } from 'react';
import { Download, Loader2, AlertCircle } from 'lucide-react';

export default function VideoMensagem({ mediaUrl, loadingMedia, onCarregar, onDownload, onErro, arquivoNome, texto, textoIsPadrao }) {
  const [erroVideo, setErroVideo] = useState(false);

  const handleErro = () => {
    setErroVideo(true);
    onErro?.();
  };

  // Quando mediaUrl mudar, resetar o erro
  useEffect(() => {
    setErroVideo(false);
  }, [mediaUrl]);

  const isWebm = arquivoNome?.endsWith('.webm') || mediaUrl?.endsWith('.webm');

  return (
    <div className="max-w-sm">
      {loadingMedia ? (
        <div className="flex items-center justify-center gap-2 bg-white/10 rounded-lg p-4 w-48 h-32">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : erroVideo ? (
        <div className="flex flex-col items-center gap-2 bg-black/20 rounded-lg p-4 w-64">
          <AlertCircle className="w-6 h-6 opacity-60" />
          <span className="text-xs opacity-75">Vídeo indisponível</span>
          {mediaUrl && (
            <button
              onClick={onDownload}
              className="flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Baixar vídeo
            </button>
          )}
        </div>
      ) : mediaUrl ? (
        <video
          controls
          className="rounded-lg max-w-full h-auto bg-black"
          onError={handleErro}
          preload="metadata"
        >
          {isWebm ? (
            <>
              <source src={mediaUrl} type="video/webm" />
              <source src={mediaUrl} type="video/mp4" />
            </>
          ) : (
            <>
              <source src={mediaUrl} type="video/mp4" />
              <source src={mediaUrl} type="video/webm" />
            </>
          )}
        </video>
      ) : (
        <button
          onClick={onCarregar}
          className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-lg p-4 text-sm opacity-75 transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4" /> Carregar vídeo
        </button>
      )}
      {texto && !textoIsPadrao?.(texto) && (
        <p className="text-xs mt-1 break-words whitespace-pre-wrap opacity-90">{texto}</p>
      )}
    </div>
  );
}