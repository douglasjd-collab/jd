import React, { useEffect, useState, useRef } from 'react';
import { FileText, Loader2, Download, FileAudio, Mic, X, Maximize2, Trash2, MoreVertical, Reply, Share2, Copy, Pin } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function MensagemItem({ mensagem, conversaId, isGrupo = false, onResponder }) {
  const [mediaUrl, setMediaUrl] = useState(mensagem.arquivo_url || null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [transcricao, setTranscricao] = useState(
    mensagem.tipo_conteudo === 'audio' && mensagem.texto && mensagem.texto !== 'Áudio'
      ? mensagem.texto : null
  );
  const [transcrevendo, setTranscrevendo] = useState(false);
  const [pdfAberto, setPdfAberto] = useState(false);
  const [pdfCarregado, setPdfCarregado] = useState(false);
  const [imagemAberta, setImagemAberta] = useState(false);
  const [deletando, setDeletando] = useState(false);
  const audioRef = React.useRef(null);
  
  const queryClient = useQueryClient();
  const isVendedor = mensagem.remetente === 'vendedor';

  const handleDeletar = async () => {
    if (mensagem.id?.startsWith('temp_')) {
      // Mensagem temporária (não foi enviada ainda)
      queryClient.setQueryData(['mensagens-whatsapp', conversaId], (old = []) =>
        old.filter(m => m.id !== mensagem.id)
      );
      toast.success('Mensagem removida');
      return;
    }

    if (!confirm('Deseja realmente deletar esta mensagem?')) return;

    setDeletando(true);
    try {
      await base44.entities.MensagemWhatsapp.delete(mensagem.id);
      console.log(`✅ Mensagem ${mensagem.id} deletada do banco`);
      
      // Remover do cache localmente
      queryClient.setQueryData(['mensagens-whatsapp', conversaId], (old = []) =>
        old.filter(m => m.id !== mensagem.id)
      );
      
      toast.success('Mensagem deletada');
    } catch (e) {
      console.error('Erro ao deletar mensagem:', e);
      toast.error('Erro ao deletar: ' + e.message);
    } finally {
      setDeletando(false);
    }
  };

  // Atualizar mediaUrl se mensagem for atualizada externamente
  useEffect(() => {
    if (mensagem.arquivo_url && mensagem.arquivo_url !== mediaUrl) {
      setMediaUrl(mensagem.arquivo_url);
    }
  }, [mensagem.arquivo_url]);

  // Baixar mídia se necessário (URL não-permanente ou sem URL)
  useEffect(() => {
    const tiposMidia = ['audio', 'imagem', 'video', 'pdf', 'documento'];
    if (!tiposMidia.includes(mensagem.tipo_conteudo)) return;
    if (mensagem.id?.startsWith('temp_')) return;
    if (loadingMedia) return;  // Já carregando

    // Se já tem URL permanente, não faz nada
    if (mediaUrl && (mediaUrl.includes('base44') || mediaUrl.includes('supabase') || mediaUrl.includes('amazonaws'))) return;

    // Tenta baixar sempre que não tem URL ou é URL temporária
    setLoadingMedia(true);
    base44.functions.invoke('baixarMidiaWhatsApp', {
      mensagem_id: mensagem.id,
      arquivo_url: mensagem.arquivo_url,
      conversa_id: conversaId || mensagem.conversa_id
    })
      .then(res => {
        const data = res?.data;
        if (data?.arquivo_url) {
          setMediaUrl(data.arquivo_url);
        }
      })
      .catch(err => console.error('Erro ao baixar mídia:', err))
      .finally(() => setLoadingMedia(false));
  }, [mensagem.id, mensagem.tipo_conteudo]);

  const handleTranscrever = async () => {
    if (!mediaUrl) return;
    setTranscrevendo(true);
    try {
      const res = await base44.functions.invoke('transcreverAudio', {
        arquivo_url: mediaUrl,
        mensagem_id: mensagem.id
      });
      if (res.data?.transcricao) setTranscricao(res.data.transcricao);
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
          <>
            <div className="max-w-xs">
              {loadingMedia ? (
                <div className="flex items-center gap-2 bg-white/10 rounded-lg p-4 w-32 h-32 justify-center">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : mediaUrl ? (
                <img
                  src={mediaUrl}
                  alt="Imagem"
                  className="rounded-lg max-w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
                  onError={() => setMediaUrl(null)}
                  onClick={() => setImagemAberta(true)}
                />
              ) : (
                <div className="bg-white/10 rounded-lg p-4 text-sm opacity-75">Imagem indisponível</div>
              )}
            </div>
            <Dialog open={imagemAberta} onOpenChange={setImagemAberta}>
              <DialogContent className="max-w-4xl w-full p-0 bg-black border-0 flex items-center justify-center">
                {mediaUrl && (
                  <img
                    src={mediaUrl}
                    alt="Imagem ampliada"
                    className="max-w-full max-h-[90vh] object-contain"
                  />
                )}
              </DialogContent>
            </Dialog>
          </>
        );

      case 'audio':
        return (
          <div className="flex flex-col gap-2 min-w-[200px]">
            {!mediaUrl ? (
              <div className="flex items-center gap-2 bg-white/10 rounded-lg p-3">
                <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
                <span className="text-sm opacity-75">Carregando áudio...</span>
              </div>
            ) : mediaUrl ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <FileAudio className="w-4 h-4 flex-shrink-0 opacity-70" />
                  <audio 
                    ref={audioRef}
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
                  <select 
                    defaultValue="1"
                    onChange={(e) => {
                      if (audioRef.current) audioRef.current.playbackRate = parseFloat(e.target.value);
                    }}
                    className={`text-xs px-1.5 py-0.5 rounded-md border ${
                      isVendedor ? 'bg-white/15 text-white border-white/20' : 'bg-slate-50 text-slate-900 border-slate-200'
                    }`}
                  >
                    <option value="0.5">0.5x</option>
                    <option value="0.75">0.75x</option>
                    <option value="1">1x</option>
                    <option value="1.25">1.25x</option>
                    <option value="1.5">1.5x</option>
                    <option value="2">2x</option>
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  {transcricao ? (
                    <div className={`text-xs flex-1 px-2 py-1.5 rounded-lg italic ${isVendedor ? 'bg-white/15 text-white/90' : 'bg-slate-100 text-slate-600'}`}>
                      🗒️ {transcricao}
                    </div>
                  ) : (
                    <button
                      onClick={handleTranscrever}
                      disabled={transcrevendo}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg flex-1 transition-colors ${
                        isVendedor ? 'bg-white/15 hover:bg-white/25 text-white/80' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      }`}
                    >
                      {transcrevendo ? <><Loader2 className="w-3 h-3 animate-spin" /> Transcrevendo...</> : <><Mic className="w-3 h-3" /> Transcrever</>}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-white/10 rounded-lg p-3">
                <FileAudio className="w-5 h-5 flex-shrink-0" />
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
        const urlDoc = mediaUrl;
        const nomeDoc = mensagem.arquivo_nome || 'Documento PDF';
        const isPdf = nomeDoc.toLowerCase().endsWith('.pdf') || mensagem.tipo_conteudo === 'pdf';
        return (
          <>
            <div
              className={`flex flex-col rounded-xl overflow-hidden w-56 cursor-pointer border ${isVendedor ? 'border-white/20 bg-white/10' : 'border-slate-200 bg-slate-50'}`}
              onClick={() => urlDoc && setPdfAberto(true)}
            >
              {loadingMedia ? (
                <div className="w-full h-28 flex items-center justify-center bg-slate-100">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : urlDoc && isPdf ? (
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
              <div className={`flex items-center gap-2 px-3 py-2 ${isVendedor ? 'bg-white/10' : 'bg-white border-t border-slate-100'}`}>
                <FileText className="w-4 h-4 flex-shrink-0 text-red-500" />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-medium">{nomeDoc}</p>
                  {mensagem.arquivo_tamanho > 0 && (
                    <p className="text-[10px] opacity-60">{(mensagem.arquivo_tamanho / 1024 / 1024).toFixed(2)} MB</p>
                  )}
                </div>
                {urlDoc && (
                  <a href={urlDoc} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex-shrink-0">
                    <Download className="w-4 h-4 hover:opacity-70 transition-opacity" />
                  </a>
                )}
              </div>
            </div>

            <Dialog open={pdfAberto} onOpenChange={(v) => { setPdfAberto(v); if (!v) setPdfCarregado(false); }}>
              <DialogContent className="max-w-4xl w-full h-[90vh] p-0 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-white shrink-0">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-red-500" />
                    <span className="font-medium text-sm truncate max-w-xs">{nomeDoc}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {urlDoc && (
                      <a href={urlDoc} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs"><Download className="w-3.5 h-3.5" /> Baixar</Button>
                      </a>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setPdfAberto(false)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden relative">
                  {urlDoc ? (
                    <>
                      {!pdfCarregado && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10 gap-3">
                          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                          <p className="text-sm text-slate-500">Carregando documento...</p>
                          <a href={urlDoc} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="outline" className="gap-1.5 text-xs mt-2"><Download className="w-3.5 h-3.5" /> Abrir em nova aba</Button>
                          </a>
                        </div>
                      )}
                      <iframe
                        key={urlDoc}
                        src={`https://docs.google.com/viewer?url=${encodeURIComponent(urlDoc)}&embedded=true`}
                        className="w-full h-full border-0"
                        title={nomeDoc}
                        onLoad={() => setPdfCarregado(true)}
                      />
                    </>
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
    <div className={`flex ${isVendedor ? 'justify-end' : 'justify-start'} gap-2 group animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <div
        className={`max-w-md px-4 py-3 rounded-2xl shadow-sm ${
          isVendedor
            ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-md'
            : 'bg-white text-slate-900 rounded-bl-md border border-slate-200'
        }`}
      >
        {/* Nome do remetente em grupos */}
        {isGrupo && !isVendedor && mensagem.remetente_nome && (
          <p className="text-xs font-bold mb-1 text-blue-600">{mensagem.remetente_nome}</p>
        )}
        {isGrupo && isVendedor && mensagem.remetente_nome && (
          <p className="text-xs font-bold mb-1 text-white/70">{mensagem.remetente_nome}</p>
        )}
        {!isGrupo && !isVendedor && mensagem.usuario_nome && (
          <p className="text-xs font-semibold mb-1 opacity-60">{mensagem.usuario_nome}</p>
        )}
        <div className="mb-1">{renderConteudo()}</div>
        <div className="flex items-center justify-end gap-1.5 mt-1">
          <p className={`text-xs ${isVendedor ? 'text-white/80' : 'text-slate-500'}`} title={format(new Date(mensagem.data_envio || mensagem.created_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}>
            {format(new Date(mensagem.data_envio || mensagem.created_date), 'HH:mm')}
          </p>
          {isVendedor && (
            <span className={`text-xs font-medium ${mensagem.status === 'lida' ? 'text-sky-300' : 'text-white/70'}`}>
              {mensagem.status === 'lida' && '✓✓'}
              {mensagem.status === 'entregue' && '✓✓'}
              {(!mensagem.status || mensagem.status === 'pendente' || mensagem.status === 'enviada') && '✓'}
            </span>
          )}
        </div>
      </div>

      {/* Menu de ações - aparecer ao hover */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
            disabled={deletando}
          >
            <MoreVertical className="w-4 h-4 text-slate-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={isVendedor ? "end" : "start"}>
           <DropdownMenuItem onClick={() => onResponder?.(mensagem)}>
             <Reply className="w-4 h-4 mr-2" />
             Responder
           </DropdownMenuItem>
           <DropdownMenuItem onClick={() => toast.info('Encaminhar em breve')}>
             <Share2 className="w-4 h-4 mr-2" />
             Encaminhar
           </DropdownMenuItem>
           <DropdownMenuItem onClick={() => {
             const texto = mensagem.texto || `[${mensagem.tipo_conteudo}]`;
             navigator.clipboard.writeText(texto);
             toast.success('Copiado!');
           }}>
             <Copy className="w-4 h-4 mr-2" />
             Copiar
           </DropdownMenuItem>
           <DropdownMenuItem onClick={() => toast.info('Fixar em breve')}>
             <Pin className="w-4 h-4 mr-2" />
             Fixar
           </DropdownMenuItem>
           {mensagem.tipo_conteudo === 'audio' && mediaUrl && (
             <>
               <DropdownMenuItem onClick={() => {
                 const link = document.createElement('a');
                 link.href = mediaUrl;
                 link.download = `audio_${mensagem.id}.mp3`;
                 link.click();
               }}>
                 <Download className="w-4 h-4 mr-2" />
                 Baixar áudio
               </DropdownMenuItem>
             </>
           )}
           <DropdownMenuItem 
             onClick={handleDeletar}
             disabled={deletando}
             className="text-red-600 focus:text-red-600"
           >
             {deletando ? (
               <>
                 <Loader2 className="w-4 h-4 animate-spin mr-2" />
                 Deletando...
               </>
             ) : (
               <>
                 <Trash2 className="w-4 h-4 mr-2" />
                 Deletar mensagem
               </>
             )}
           </DropdownMenuItem>
         </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}