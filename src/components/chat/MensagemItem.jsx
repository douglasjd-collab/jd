import React, { useEffect, useState } from 'react';
import { FileText, Music, Check, CheckCheck, Loader2, Download, FileAudio, Mic, X, Maximize2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export default function MensagemItem({ mensagem, conversaId }) {
  const [mediaUrl, setMediaUrl] = useState(mensagem.arquivo_url || null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [transcricao, setTranscricao] = useState(mensagem.tipo_conteudo === 'audio' && mensagem.texto && mensagem.texto !== 'Áudio' ? mensagem.texto : null);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const [pdfAberto, setPdfAberto] = useState(false);
  const [pdfCarregado, setPdfCarregado] = useState(false);

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
    // Tentar baixar se: tem URL não-permanente OU tem whatsapp_message_id (para mensagens enviadas sem URL)
    const podetentar = (mensagem.arquivo_url && !isPermanente) || (!mediaUrl && mensagem.whatsapp_message_id);

    if (
      tiposMidia.includes(mensagem.tipo_conteudo) &&
      podetentar &&
      !loadingMedia &&
      !mensagem.id?.startsWith('temp_')
    ) {
      setLoadingMedia(true);
      base44.functions.invoke('baixarMidiaWhatsApp', {
        mensagem_id: mensagem.id,
        arquivo_url: mensagem.arquivo_url,
        conversa_id: conversaId || mensagem.conversa_id
      })
        .then(async res => {
          const data = res.data;
          if (data?.arquivo_url) {
            // Backend já retornou URL permanente (legado)
            setMediaUrl(data.arquivo_url);
          } else if (data?.base64 && data?.mimeType) {
            // Novo fluxo: converter base64 → Blob → upload via SDK browser → URL permanente
            try {
              const binaryStr = atob(data.base64);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
              const blob = new Blob([bytes], { type: data.mimeType });

              // Criar object URL local para reprodução imediata
              const localUrl = URL.createObjectURL(blob);
              setMediaUrl(localUrl);

              // Upload permanente em background
              const uploadRes = await base44.integrations.Core.UploadFile({ file: blob });
              if (uploadRes?.file_url) {
                setMediaUrl(uploadRes.file_url);
                // Salvar URL permanente na mensagem
                await base44.entities.MensagemWhatsapp.update(data.mensagem_id, {
                  arquivo_url: uploadRes.file_url
                });
              }
            } catch (uploadErr) {
              console.error('Erro ao processar mídia:', uploadErr);
            }
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
      case 'documento': {
        const urlDoc = mediaUrl || mensagem.arquivo_url;
        const nomeDoc = mensagem.arquivo_nome || 'Documento PDF';
        const isPdf = nomeDoc.toLowerCase().endsWith('.pdf') || mensagem.tipo_conteudo === 'pdf';
        return (
          <>
            <div
              className={`flex flex-col rounded-xl overflow-hidden w-56 cursor-pointer border ${isVendedor ? 'border-white/20 bg-white/10' : 'border-slate-200 bg-slate-50'}`}
              onClick={() => urlDoc && setPdfAberto(true)}
            >
              {/* Preview da capa do PDF */}
              {urlDoc && isPdf ? (
                <div className="relative w-full h-36 bg-slate-100 flex items-center justify-center overflow-hidden">
                  <iframe
                    src={`${urlDoc}#page=1&view=FitH&toolbar=0&scrollbar=0&navpanes=0`}
                    className="w-full h-full border-0 pointer-events-none"
                    title="preview-pdf"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 hover:opacity-100 transition-opacity">
                    <Maximize2 className="w-8 h-8 text-white drop-shadow" />
                  </div>
                </div>
              ) : (
                <div className="w-full h-28 bg-red-50 flex items-center justify-center">
                  <FileText className="w-12 h-12 text-red-400" />
                </div>
              )}
              {/* Rodapé */}
              <div className={`flex items-center gap-2 px-3 py-2 ${isVendedor ? 'bg-white/10' : 'bg-white border-t border-slate-100'}`}>
                <FileText className="w-4 h-4 flex-shrink-0 text-red-500" />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-medium">{nomeDoc}</p>
                  {mensagem.arquivo_tamanho > 0 && (
                    <p className="text-[10px] opacity-60">{(mensagem.arquivo_tamanho / 1024 / 1024).toFixed(2)} MB</p>
                  )}
                </div>
                {urlDoc && (
                  <a
                    href={urlDoc}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="flex-shrink-0"
                  >
                    <Download className="w-4 h-4 hover:opacity-70 transition-opacity" />
                  </a>
                )}
              </div>
            </div>

            {/* Modal PDF completo */}
            <Dialog open={pdfAberto} onOpenChange={setPdfAberto}>
              <DialogContent className="max-w-4xl w-full h-[90vh] p-0 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-white shrink-0">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-red-500" />
                    <span className="font-medium text-sm truncate max-w-xs">{nomeDoc}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {urlDoc && (
                      <a href={urlDoc} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                          <Download className="w-3.5 h-3.5" /> Baixar
                        </Button>
                      </a>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setPdfAberto(false)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden">
                  {urlDoc ? (
                    <iframe
                      src={`https://docs.google.com/viewer?url=${encodeURIComponent(urlDoc)}&embedded=true`}
                      className="w-full h-full border-0"
                      title={nomeDoc}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-400">
                      <p>Documento não disponível</p>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </>
        );
      }

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