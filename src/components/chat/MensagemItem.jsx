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

export default function MensagemItem({ mensagem, conversaId, isGrupo = false, onResponder, user = null }) {
  // Não auto-carregar arquivos .enc (criptografados do WhatsApp — causam download indesejado no browser)
  const isUrlValida = (url) => {
    if (!url) return false;
    if (url.endsWith('.enc') || url.includes('.enc?') || url.includes('media/') && !url.includes('base44') && !url.includes('supabase') && !url.includes('amazonaws')) return false;
    return true;
  };
  const [mediaUrl, setMediaUrl] = useState(isUrlValida(mensagem.arquivo_url) ? mensagem.arquivo_url : null);
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
  const [velocidadeAudio, setVelocidadeAudio] = useState(1);
  const [contatoModalAberto, setContatoModalAberto] = useState(false);
  const [contatoExtraido, setContatoExtraido] = useState(null);
  const audioRef = React.useRef(null);

  // Extrair informações do vCard
  const extrairContatoVCard = (texto) => {
    try {
      const obj = JSON.parse(texto);
      if (!obj.contactMessage) return null;
      
      const vcard = obj.contactMessage.vcard || '';
      const displayName = obj.contactMessage.displayName || 'Contato Desconhecido';
      
      console.log('🔍 Processando vCard...');
      console.log('displayName:', displayName);
      
      // Extrair telefone do waid (mais confiável)
      let telefone = '';
      const waidMatch = vcard.match(/waid=([0-9]+)/);
      if (waidMatch) {
        telefone = waidMatch[1];
        console.log('✅ Telefone encontrado via waid:', telefone);
      }
      
      // Fallback: tentar extrair do valor TEL
      if (!telefone) {
        const telefonMatch = vcard.match(/TEL[^:]*:([+\d\s\-()]+)/);
        if (telefonMatch) {
          telefone = telefonMatch[1].replace(/\D/g, '');
          console.log('✅ Telefone encontrado via TEL:', telefone);
        }
      }
      
      // Se ainda não tem telefone, retorna null
      if (!telefone) {
        console.warn('❌ Nenhum telefone encontrado');
        console.log('vCard:', vcard.substring(0, 200));
        return null;
      }
      
      // Extrair foto (BASE64)
      let fotoUrl = null;
      const fotoMatch = vcard.match(/PHOTO(?:;[^:]*)?:([a-zA-Z0-9+/=\n]+?)(?:\n[A-Z]|$)/);
      if (fotoMatch) {
        const fotoData = fotoMatch[1].replace(/\n/g, '');
        if (fotoData.trim()) {
          fotoUrl = `data:image/jpeg;base64,${fotoData}`;
        }
      }
      
      console.log('✅ Contato extraído com sucesso!', { displayName, telefone, temFoto: !!fotoUrl });
      return { displayName, telefone, fotoUrl };
    } catch (e) {
      console.error('❌ Erro ao extrair contato:', e);
    }
    return null;
  };
  
  const queryClient = useQueryClient();
  const isVendedor = mensagem.remetente === 'vendedor';

  // Processar contactMessage ao montar
  useEffect(() => {
    if (mensagem.tipo_conteudo === 'texto' && mensagem.texto) {
      try {
        const obj = JSON.parse(mensagem.texto);
        if (obj.contactMessage) {
          const contato = extrairContatoVCard(mensagem.texto);
          if (contato) {
            setContatoExtraido(contato);
          }
        }
      } catch (e) {
        console.error('Erro ao processar contactMessage:', e);
      }
    }
  }, [mensagem.id, mensagem.texto]);

  // Confirmar leitura ao montar a mensagem (se for mensagem de cliente)
  useEffect(() => {
    if (mensagem.remetente === 'cliente' && (mensagem.status === 'entregue' || mensagem.status === 'enviada')) {
      base44.functions.invoke('confirmarLeituraMensagem', {
        mensagem_id: mensagem.id,
        conversa_id: conversaId
      }).catch(e => console.warn('Erro ao confirmar leitura:', e.message));
    }
  }, [mensagem.id]);

  // Auto-carregar áudio ao montar
  useEffect(() => {
    if (mensagem.tipo_conteudo === 'audio' && mensagem.arquivo_url && !mediaUrl && !loadingMedia) {
      handleCarregarMidia();
    }
  }, [mensagem.id]);

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

  // Atualizar mediaUrl se mensagem for atualizada externamente (só URLs válidas)
  useEffect(() => {
    if (mensagem.arquivo_url && mensagem.arquivo_url !== mediaUrl && isUrlValida(mensagem.arquivo_url)) {
      setMediaUrl(mensagem.arquivo_url);
    }
  }, [mensagem.arquivo_url]);

  const handleCarregarMidia = () => {
    if (loadingMedia || mediaUrl) return;
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
          // Auto-download para imagens
          if (mensagem.tipo_conteudo === 'imagem') {
            setTimeout(() => {
              const link = document.createElement('a');
              link.href = data.arquivo_url;
              link.download = `image_${mensagem.id}.jpg`;
              link.click();
            }, 300);
          }
        }
      })
      .catch(err => console.error('Erro ao baixar mídia:', err))
      .finally(() => setLoadingMedia(false));
  };

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

  // Detectar se é uma mensagem JSON codificada do WhatsApp (mensagens internas)
  const isJsonEncodedMessage = () => {
    if (!mensagem.texto) return false;
    try {
      const obj = JSON.parse(mensagem.texto);
      // NÃO marcar como sistema se for contactMessage (será renderizado como contato)
      if (obj.contactMessage) return false;
      // Bloquear outros tipos de mensagens internas do WhatsApp
      if (obj.senderKeyDistributionMessage) return true;
      if (obj.protocolMessage) return true;
      if (obj.ephemeralMessage) return true;
      // Marcar como sistema para outros tipos de JSON
      return true;
    } catch (e) {
      return false;
    }
  };

  const renderConteudo = () => {
    // Tentar detectar contactMessage PRIMEIRO, mesmo se tipo_conteudo for diferente
    if (mensagem.texto) {
      try {
        const obj = JSON.parse(mensagem.texto);
        if (obj.contactMessage) {
          const contato = extrairContatoVCard(mensagem.texto);
          if (contato && contato.telefone) {
            return (
              <div className="flex flex-col gap-2 w-56">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-b from-green-50 to-green-100 border border-green-200">
                  {contato.fotoUrl ? (
                    <img src={contato.fotoUrl} alt="Contato" className="w-12 h-12 rounded-full object-cover border-2 border-white" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0 border-2 border-white">
                      {contato.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="text-left flex-1 min-w-0">
                    <p className="font-bold text-sm text-slate-900 truncate">{contato.displayName}</p>
                    <p className="text-xs text-slate-700">{contato.telefone}</p>
                  </div>
                </div>
                <button
                  onClick={() => toast.info('Contato salvo!')}
                  className="w-full py-2 px-3 bg-white border border-green-200 rounded-lg text-sm font-medium text-slate-900 hover:bg-green-50 transition-colors flex items-center justify-center gap-2"
                >
                  📥 Salvar Contato
                </button>
                <button
                  onClick={async () => {
                    try {
                      // Buscar conversa existente ou criar uma nova
                      const convs = await base44.entities.ConversaWhatsapp.filter({
                        cliente_telefone: contato.telefone.replace(/\D/g, ''),
                        empresa_id: user?.empresa_id
                      });
                      
                      if (convs.length > 0) {
                        // Navegar para conversa existente
                        window.location.href = `/BatePapo?conversa_id=${convs[0].id}`;
                      } else {
                        // Criar nova conversa
                        const novaConv = await base44.entities.ConversaWhatsapp.create({
                          empresa_id: user?.empresa_id,
                          cliente_telefone: contato.telefone.replace(/\D/g, ''),
                          cliente_nome: contato.displayName,
                          status: 'ativa'
                        });
                        window.location.href = `/BatePapo?conversa_id=${novaConv.id}`;
                      }
                    } catch (err) {
                      console.error('Erro ao abrir conversa:', err);
                      toast.error('Erro ao abrir conversa');
                    }
                  }}
                  className="w-full py-2 px-3 bg-white border border-green-200 rounded-lg text-sm font-medium text-slate-900 hover:bg-green-50 transition-colors flex items-center justify-center gap-2"
                >
                  💬 Conversar
                </button>
              </div>
            );
          }
          // Se contactMessage mas sem telefone válido, retorna nada (não renderiza JSON)
          return null;
        }
      } catch (e) {
        // Continuar com renderização normal
      }
    }

    // Se contatoExtraido já foi setado, renderizar o card de contato
    if (contatoExtraido && contatoExtraido.telefone) {
      return (
        <div className="flex flex-col gap-2 w-56">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-b from-green-50 to-green-100 border border-green-200">
            {contatoExtraido.fotoUrl ? (
              <img src={contatoExtraido.fotoUrl} alt="Contato" className="w-12 h-12 rounded-full object-cover border-2 border-white" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0 border-2 border-white">
                {contatoExtraido.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="text-left flex-1 min-w-0">
              <p className="font-bold text-sm text-slate-900 truncate">{contatoExtraido.displayName}</p>
              <p className="text-xs text-slate-700">{contatoExtraido.telefone}</p>
            </div>
          </div>
          <button
            onClick={() => toast.info('Contato salvo!')}
            className="w-full py-2 px-3 bg-white border border-green-200 rounded-lg text-sm font-medium text-slate-900 hover:bg-green-50 transition-colors flex items-center justify-center gap-2"
          >
            📥 Salvar Contato
          </button>
          <button
            onClick={async () => {
              try {
                const convs = await base44.entities.ConversaWhatsapp.filter({
                  cliente_telefone: contatoExtraido.telefone.replace(/\D/g, ''),
                  empresa_id: user?.empresa_id
                });
                
                if (convs.length > 0) {
                  window.location.href = `/BatePapo?conversa_id=${convs[0].id}`;
                } else {
                  const novaConv = await base44.entities.ConversaWhatsapp.create({
                    empresa_id: user?.empresa_id,
                    cliente_telefone: contatoExtraido.telefone.replace(/\D/g, ''),
                    cliente_nome: contatoExtraido.displayName,
                    status: 'ativa'
                  });
                  window.location.href = `/BatePapo?conversa_id=${novaConv.id}`;
                }
              } catch (err) {
                console.error('Erro ao abrir conversa:', err);
                toast.error('Erro ao abrir conversa');
              }
            }}
            className="w-full py-2 px-3 bg-white border border-green-200 rounded-lg text-sm font-medium text-slate-900 hover:bg-green-50 transition-colors flex items-center justify-center gap-2"
          >
            💬 Conversar
          </button>
        </div>
      );
    }

    // Ignorar mensagens internas do WhatsApp codificadas (incluindo contactMessage sem telefone)
    if (isJsonEncodedMessage()) {
      return null;
    }

    switch (mensagem.tipo_conteudo) {
      case 'texto': {
        return <p className="break-words whitespace-pre-wrap">{formatarTexto(mensagem.texto)}</p>;
      }

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
                <button onClick={handleCarregarMidia} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-lg p-4 text-sm opacity-75 transition-colors cursor-pointer">
                  <Download className="w-4 h-4" /> Carregar imagem
                </button>
              )}
            </div>
            {imagemAberta && mediaUrl && (
              <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                <div className="relative max-w-3xl max-h-[90vh] flex items-center justify-center">
                  <img
                    src={mediaUrl}
                    alt="Imagem ampliada"
                    className="w-full h-auto rounded-lg max-h-[90vh] object-contain"
                  />
                  <button
                    onClick={() => setImagemAberta(false)}
                    className="absolute top-2 right-2 bg-white rounded-full p-2 hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-5 h-5 text-black" />
                  </button>
                </div>
              </div>
            )}
          </>
        );

      case 'audio':
        const velocidades = [0.5, 1, 1.5, 2];
        const proximaVelocidade = velocidades[(velocidades.indexOf(velocidadeAudio) + 1) % velocidades.length];
        return (
          <div className="flex flex-col gap-2 min-w-[200px]">
            {loadingMedia ? (
              <div className="flex items-center gap-2 bg-white/10 rounded-lg p-3">
                <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
                <span className="text-sm opacity-75">Carregando áudio...</span>
              </div>
            ) : !mediaUrl ? (
              <button onClick={handleCarregarMidia} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-lg p-3 text-sm opacity-75 transition-colors cursor-pointer">
                <Download className="w-4 h-4 flex-shrink-0" /> Carregar áudio
              </button>
            ) : mediaUrl ? (
              <div className="flex flex-col gap-2">
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
                  <button
                    onClick={() => {
                      setVelocidadeAudio(proximaVelocidade);
                      if (audioRef.current) audioRef.current.playbackRate = proximaVelocidade;
                    }}
                    className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors flex-shrink-0 ${
                      isVendedor ? 'bg-white/15 hover:bg-white/25 text-white/80' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    {velocidadeAudio}x
                  </button>
                </div>
              </div>
            ) : null}
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
              <button onClick={handleCarregarMidia} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-lg p-4 text-sm opacity-75 transition-colors cursor-pointer">
                <Download className="w-4 h-4" /> Carregar vídeo
              </button>
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
              ) : !urlDoc ? (
                <button onClick={(e) => { e.stopPropagation(); handleCarregarMidia(); }} className="w-full h-28 flex flex-col items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer">
                  <Download className="w-6 h-6 text-slate-400" />
                  <span className="text-xs text-slate-500">Carregar documento</span>
                </button>
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
        {/* Nome do remetente em grupos com avatar */}
        {isGrupo && mensagem.remetente_nome && (
          <div className="flex items-center gap-2 mb-1 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => {
            // Extrair telefone do nome ou participant JID
            const participant = mensagem.remetente_nome;
            if (participant && participant.includes('@s.whatsapp.net')) {
              const tel = participant.replace(/@s\.whatsapp\.net/g, '').replace(/\D/g, '');
              // Aqui seria possível abrir conversa se houver callback
            }
          }}>
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0 text-white text-[10px] font-bold">
              {(mensagem.remetente_nome || '?').charAt(0).toUpperCase()}
            </div>
            <p className={`text-xs font-bold ${isVendedor ? 'text-white/80' : 'text-blue-600'}`}>
              {mensagem.remetente_nome}
            </p>
          </div>
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
            <div className="flex items-center gap-0.5">
              <span className={`text-xs font-bold ${
                mensagem.status === 'lida' ? 'text-blue-300' : 
                mensagem.status === 'entregue' ? 'text-white/70' : 
                'text-white/50'
              }`}>
                {mensagem.status === 'lida' && '✓✓'}
                {mensagem.status === 'entregue' && '✓✓'}
                {(!mensagem.status || mensagem.status === 'pendente' || mensagem.status === 'enviada') && '✓'}
                {mensagem.status === 'erro' && '✕'}
              </span>
              {mensagem.status === 'lida' && (
                <span className="text-xs text-blue-300 font-medium">Lido</span>
              )}
              {mensagem.status === 'entregue' && (
                <span className="text-xs text-white/70 font-medium">Entregue</span>
              )}
            </div>
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