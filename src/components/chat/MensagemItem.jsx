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
    if (typeof url !== 'string') return false;
    // Bloquear media_id numérico da Meta
    if (/^\d+$/.test(url.trim())) return false;
    // Bloquear arquivos .enc (criptografados)
    if (url.includes('.enc')) return false;
    // Bloquear URLs internas da Evolution que não são do nosso storage
    if (url.includes('/media/') && !url.includes('base44') && !url.includes('supabase') && !url.includes('amazonaws')) return false;
    // Deve ser uma URL válida começando com http
    if (!url.startsWith('http')) return false;
    // Deve ser URL do nosso storage ou URL pública conhecida
    const isPermanente = url.includes('base44') || url.includes('supabase') || url.includes('amazonaws');
    const isUrlPublica = url.startsWith('https://') && !url.includes('localhost');
    return isPermanente || isUrlPublica;
  };
  const [mediaUrl, setMediaUrl] = useState(isUrlValida(mensagem.arquivo_url) ? mensagem.arquivo_url : null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  // Refs para evitar stale closure no auto-download
  const mediaUrlRef = React.useRef(isUrlValida(mensagem.arquivo_url) ? mensagem.arquivo_url : null);
  const loadingMediaRef = React.useRef(false);
  React.useEffect(() => { mediaUrlRef.current = mediaUrl; }, [mediaUrl]);
  React.useEffect(() => { loadingMediaRef.current = loadingMedia; }, [loadingMedia]);
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
  const [statusAtual, setStatusAtual] = useState(mensagem.status);
  const audioRef = React.useRef(null);

  // Sincronizar statusAtual com a prop mensagem.status para re-render imediato
  useEffect(() => {
    const prioridade = { 'lida': 3, 'entregue': 2, 'enviada': 1, 'pendente': 0, 'erro': -1 };
    if ((prioridade[mensagem.status] ?? -99) >= (prioridade[statusAtual] ?? -99)) {
      setStatusAtual(mensagem.status);
    }
  }, [mensagem.status]);

  // Tentar parsear JSON mesmo se vier com caracteres problemáticos
  const tryParseContactJson = (texto) => {
    if (!texto) return null;
    // Tentativa 1: parse direto
    try { return JSON.parse(texto); } catch {}
    // Tentativa 2: o texto pode ter \n literal dentro de strings JSON que quebra o parse
    // Escapar \n e \r dentro de valores de string JSON
    try {
      const sanitized = texto.replace(/[\r\n]+/g, '\\n');
      return JSON.parse(sanitized);
    } catch {}
    // Tentativa 3: extrair displayName e vcard via regex direto no texto cru
    return null;
  };

  // Extrair informações do vCard
  const extrairContatosVCard = (texto) => {
    const obj = tryParseContactJson(texto);
    
    // Se parse funcionou e tem contactMessage
    if (obj?.contactMessage) {
      const displayName = obj.contactMessage.displayName || 'Contato';
      const vcardRaw = obj.contactMessage.vcard || '';
      const vcard = vcardRaw.replace(/\\n/g, '\n');
      
      let telefone = '';
      const waidMatch = vcard.match(/waid=([0-9]+)/);
      if (waidMatch) {
        telefone = waidMatch[1];
      } else {
        const telMatch = vcard.match(/TEL[^:\n]*:([^\n]+)/);
        if (telMatch) {
          const numMatch = telMatch[1].trim().match(/\+?([0-9]{8,})/);
          if (numMatch) telefone = numMatch[1];
        }
      }
      
      return [{ displayName, telefone, fotoUrl: null }];
    }
    
    // Fallback: extrair via regex direto no texto cru (quando JSON é inválido)
    if (texto.includes('contactMessage') && texto.includes('displayName')) {
      try {
        const displayNameMatch = texto.match(/"displayName"\s*:\s*"([^"]+)"/);
        const waidMatch = texto.match(/waid=([0-9]+)/);
        const telLineMatch = texto.match(/TEL[^:]*:([0-9+\s\-().]+?)(?:\\n|\\|")/);
        
        const displayName = displayNameMatch ? displayNameMatch[1] : 'Contato';
        let telefone = '';
        if (waidMatch) {
          telefone = waidMatch[1];
        } else if (telLineMatch) {
          const numMatch = telLineMatch[1].replace(/\D/g, '');
          if (numMatch.length >= 8) telefone = numMatch;
        }
        
        return [{ displayName, telefone, fotoUrl: null }];
      } catch { return []; }
    }
    
    return [];
  };
  
  const queryClient = useQueryClient();
  const isVendedor = mensagem.remetente === 'vendedor';



  // Confirmar leitura ao montar a mensagem (se for mensagem de cliente)
  useEffect(() => {
    if (mensagem.remetente === 'cliente' && (mensagem.status === 'entregue' || mensagem.status === 'enviada')) {
      base44.functions.invoke('confirmarLeituraMensagem', {
        mensagem_id: mensagem.id,
        conversa_id: conversaId
      }).catch(e => console.warn('Erro ao confirmar leitura:', e.message));
    }
  }, [mensagem.id]);

  // Sem auto-download: usuário clica para carregar cada áudio individualmente
  // Isso evita sobrecarga quando há muitos áudios na conversa

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

  // Atualizar mediaUrl se mensagem for atualizada externamente (só URLs válidas, não sobrescreve URL já carregada)
  useEffect(() => {
    if (mensagem.arquivo_url && isUrlValida(mensagem.arquivo_url) && !mediaUrl) {
      setMediaUrl(mensagem.arquivo_url);
    }
  }, [mensagem.arquivo_url]);

  const handleCarregarMidia = () => {
    if (loadingMedia) return;
    if (mediaUrl && isUrlValida(mediaUrl)) return;
    setLoadingMedia(true);
    base44.functions.invoke('baixarMidiaWhatsApp', {
      mensagem_id: mensagem.id,
      arquivo_url: mensagem.arquivo_url || null,
      conversa_id: conversaId || mensagem.conversa_id
    })
      .then(res => {
        const data = res?.data;
        const url = data?.arquivo_url;
        if (url && url !== 'indisponivel' && isUrlValida(url)) {
          setMediaUrl(url);
        } else {
          toast.error('Não foi possível carregar a mídia. Tente novamente.');
        }
      })
      .catch(() => toast.error('Erro ao carregar mídia.'))
      .finally(() => setLoadingMedia(false));
  };

  // Download: garante URL permanente via backend antes de baixar
  const handleDownload = async (url, nomeArquivo) => {
    if (!url) return;
    
    let urlFinal = url;
    
    // Se a URL não é permanente (não é do nosso storage), buscar via backend
    const isPermanente = url.includes('base44') || url.includes('supabase') || url.includes('amazonaws');
    if (!isPermanente) {
      toast.message('Preparando arquivo...');
      try {
        const res = await base44.functions.invoke('baixarMidiaWhatsApp', {
          mensagem_id: mensagem.id,
          arquivo_url: url,
          conversa_id: conversaId || mensagem.conversa_id
        });
        if (res?.data?.arquivo_url) {
          urlFinal = res.data.arquivo_url;
          setMediaUrl(urlFinal);
        }
      } catch (e) {
        console.warn('Erro ao obter URL permanente:', e);
      }
    }
    
    // Abrir em nova aba (funciona para qualquer domínio)
    window.open(urlFinal, '_blank');
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
    // Detectar URLs e formatação
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
    const boldItalicRegex = /(\*[^*]+\*|_[^_]+_|~[^~]+~)/g;
    
    // Primeiro, split por URLs
    const urlParts = texto.split(urlRegex);
    const urlMatches = texto.match(urlRegex) || [];
    
    const result = [];
    let urlIndex = 0;
    
    urlParts.forEach((part, i) => {
      if (i > 0 && urlIndex < urlMatches.length && part === undefined) {
        // Espaço reservado para URL
        const url = urlMatches[urlIndex];
        result.push(
          <a 
            key={`url-${urlIndex}`}
            href={url.startsWith('http') ? url : `https://${url}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline break-all"
          >
            {url}
          </a>
        );
        urlIndex++;
      } else if (part) {
        // Processar formatação dentro de texto não-URL
        const boldItalicParts = part.split(boldItalicRegex);
        const boldItalicMatches = part.match(boldItalicRegex) || [];
        
        let formatIndex = 0;
        boldItalicParts.forEach((subpart, j) => {
          if (subpart === undefined) return;
          if (boldItalicMatches[formatIndex] === subpart) {
            if (subpart.startsWith('*') && subpart.endsWith('*')) {
              result.push(<strong key={`${i}-${j}`}>{subpart.slice(1, -1)}</strong>);
            } else if (subpart.startsWith('_') && subpart.endsWith('_')) {
              result.push(<em key={`${i}-${j}`}>{subpart.slice(1, -1)}</em>);
            } else if (subpart.startsWith('~') && subpart.endsWith('~')) {
              result.push(<s key={`${i}-${j}`}>{subpart.slice(1, -1)}</s>);
            }
            formatIndex++;
          } else if (subpart) {
            result.push(subpart);
          }
        });
      }
    });
    
    return result.length > 0 ? result : null;
  };

  // Detectar se é uma mensagem JSON codificada do WhatsApp (mensagens internas)
  const isJsonEncodedMessage = () => {
    if (!mensagem.texto) return false;
    // Nunca bloquear mensagens de contato
    if (mensagem.texto.includes('contactMessage') || mensagem.texto.includes('BEGIN:VCARD')) return false;
    try {
      const obj = JSON.parse(mensagem.texto);
      if (obj.contactMessage) return false;
      if (obj.senderKeyDistributionMessage) return true;
      if (obj.protocolMessage) return true;
      if (obj.ephemeralMessage) return true;
      return true;
    } catch (e) {
      return false;
    }
  };

  const renderConteudo = () => {
    // Ignorar mensagens internas do WhatsApp codificadas
    if (isJsonEncodedMessage()) {
      return null;
    }

    // PRIMEIRO: Verificar se é contactMessage (pode vir com qualquer tipo_conteudo)
    const textoParaCheck = mensagem.texto || '';
    if (textoParaCheck.includes('contactMessage') || textoParaCheck.includes('BEGIN:VCARD')) {
      const contatos = extrairContatosVCard(textoParaCheck);
      if (contatos.length > 0) {
        return (
          <div className="flex flex-col gap-3">
            {contatos.map((contato, idx) => {
              const numLimpo = (contato.telefone || '').replace(/\D/g, '');
              let telFormatado = contato.telefone || '';
              if (numLimpo.length === 13) {
                telFormatado = `+${numLimpo.slice(0,2)} ${numLimpo.slice(2,4)} ${numLimpo.slice(4,9)}-${numLimpo.slice(9)}`;
              } else if (numLimpo.length === 12) {
                telFormatado = `+${numLimpo.slice(0,2)} ${numLimpo.slice(2,4)} ${numLimpo.slice(4,8)}-${numLimpo.slice(8)}`;
              } else if (numLimpo.length === 11) {
                telFormatado = `(${numLimpo.slice(0,2)}) ${numLimpo.slice(2,7)}-${numLimpo.slice(7)}`;
              } else if (numLimpo.length === 10) {
                telFormatado = `(${numLimpo.slice(0,2)}) ${numLimpo.slice(2,6)}-${numLimpo.slice(6)}`;
              }
              return (
                <div key={idx} className={`flex flex-col w-64 rounded-xl overflow-hidden shadow-sm ${isVendedor ? 'bg-blue-400/20 border border-blue-300/40' : 'bg-white border border-slate-200'}`}>
                  <div className={`flex items-center gap-3 p-3 ${isVendedor ? 'bg-blue-500/30' : 'bg-slate-50 border-b border-slate-100'}`}>
                    <div className="w-11 h-11 rounded-full bg-slate-300 flex items-center justify-center flex-shrink-0">
                      <svg viewBox="0 0 24 24" className="w-7 h-7 text-slate-500 fill-current"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm truncate ${isVendedor ? 'text-white' : 'text-slate-900'}`}>{contato.displayName}</p>
                      {telFormatado && (
                        <p className={`text-xs truncate ${isVendedor ? 'text-white/70' : 'text-slate-500'}`}>{telFormatado}</p>
                      )}
                    </div>
                  </div>
                  {numLimpo && (
                    <button
                      onClick={async () => {
                        try {
                          const convs = await base44.entities.ConversaWhatsapp.filter({ cliente_telefone: numLimpo, empresa_id: user?.empresa_id });
                          if (convs.length > 0) {
                            window.location.href = `/BatePapo?conversa_id=${convs[0].id}`;
                          } else {
                            const novaConv = await base44.entities.ConversaWhatsapp.create({ empresa_id: user?.empresa_id, cliente_telefone: numLimpo, cliente_nome: contato.displayName, status: 'ativa' });
                            window.location.href = `/BatePapo?conversa_id=${novaConv.id}`;
                          }
                        } catch { toast.error('Erro ao abrir conversa'); }
                      }}
                      className={`w-full py-2.5 text-sm font-semibold border-t transition-colors ${isVendedor ? 'border-blue-300/30 text-white/90 hover:bg-white/10' : 'border-slate-100 text-green-600 hover:bg-green-50'}`}
                    >
                      Conversar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      }
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
                <div className="relative group/img">
                  <img
                    src={mediaUrl}
                    alt="Imagem"
                    className="rounded-lg max-w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
                    onError={() => setMediaUrl(null)}
                    onClick={() => setImagemAberta(true)}
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDownload(mediaUrl, `imagem_${mensagem.id}.jpg`); }}
                    className="absolute bottom-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 opacity-0 group-hover/img:opacity-100 transition-opacity"
                    title="Baixar imagem"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button onClick={handleCarregarMidia} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-lg p-4 text-sm opacity-75 transition-colors cursor-pointer">
                  <Download className="w-4 h-4" /> Carregar imagem
                </button>
              )}
              {mensagem.texto && mensagem.texto.trim() && (
                <p className="text-xs mt-1 break-words whitespace-pre-wrap opacity-90">{mensagem.texto}</p>
              )}
            </div>
            {imagemAberta && mediaUrl && (
              <div
                className="fixed inset-0 bg-black/90 flex items-center justify-center z-[9999] p-4"
                onClick={() => setImagemAberta(false)}
              >
                <button
                  onClick={() => setImagemAberta(false)}
                  className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 rounded-full p-2 transition-colors z-10"
                >
                  <X className="w-6 h-6 text-white" />
                </button>
                <img
                  src={mediaUrl}
                  alt="Imagem ampliada"
                  className="max-w-full max-h-[90vh] rounded-lg object-contain"
                  onClick={(e) => e.stopPropagation()}
                />
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
                    onError={(e) => {
                      // Não limpar a URL automaticamente para evitar loop
                      // Apenas logar o erro — o usuário pode clicar no botão de baixar
                      console.warn('Erro ao reproduzir áudio:', mediaUrl?.substring(0, 80));
                    }}
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
            {mensagem.texto && mensagem.texto.trim() && (
              <p className="text-xs mt-1 break-words whitespace-pre-wrap opacity-90">{mensagem.texto}</p>
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
                  <button onClick={(e) => { e.stopPropagation(); handleDownload(urlDoc, nomeDoc); }} className="flex-shrink-0 hover:opacity-70 transition-opacity" title="Baixar arquivo">
                    <Download className="w-4 h-4" />
                  </button>
                )}
              </div>
              {mensagem.texto && mensagem.texto.trim() && (
                <div className={`px-3 pb-2 text-xs break-words whitespace-pre-wrap ${isVendedor ? 'text-white/90' : 'text-slate-700'}`}>
                  {mensagem.texto}
                </div>
              )}
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
                      <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => handleDownload(urlDoc, nomeDoc)}>
                        <Download className="w-3.5 h-3.5" /> Baixar
                      </Button>
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

  const isSticker = mensagem.tipo_conteudo === 'imagem' && (
    mensagem.arquivo_nome?.toLowerCase().includes('sticker') ||
    mensagem.texto === 'Sticker' ||
    (!mensagem.texto && mensagem.arquivo_url && !mensagem.arquivo_nome)
  );

  // Imagem sem texto = sem balão azul, renderizar direto como bloco limpo
  // Se tiver texto (legenda), cai no bloco padrão com balão para mostrar a legenda
  const textoVazio = !mensagem.texto || mensagem.texto.trim() === '';
  const isContatoMsg = !!(mensagem.texto && (mensagem.texto.includes('contactMessage') || mensagem.texto.includes('BEGIN:VCARD')));
  const isImagemLimpa = mensagem.tipo_conteudo === 'imagem' && textoVazio && !isContatoMsg;

  if (isImagemLimpa) {
    return (
      <div className={`flex ${isVendedor ? 'justify-end' : 'justify-start'} gap-2 group animate-in fade-in slide-in-from-bottom-2 duration-300`}>
        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.18)', maxWidth: 280, minWidth: 80 }}>
          {loadingMedia ? (
            <div style={{ width: 200, height: 200, background: 'linear-gradient(90deg, #d1d5db 25%, #e5e7eb 50%, #d1d5db 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader2 style={{ width: 24, height: 24, color: '#9ca3af' }} className="animate-spin" />
            </div>
          ) : mediaUrl ? (
            <div className="relative group/img">
              <img
                src={mediaUrl}
                alt="Imagem"
                style={{ display: 'block', maxWidth: '100%', height: 'auto', cursor: 'pointer' }}
                onError={() => setMediaUrl(null)}
                onClick={() => setImagemAberta(true)}
              />
              {/* Hora + status overlay */}
              <div style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(0,0,0,0.45)', borderRadius: 10, padding: '2px 6px' }}>
                <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11 }}>
                  {format(new Date(mensagem.data_envio || mensagem.created_date), 'HH:mm')}
                </span>
                {isVendedor && (
                  statusAtual === 'lida' ? <span style={{ color: '#53bdeb', fontSize: 11, fontWeight: 700 }}>✓✓</span>
                  : statusAtual === 'entregue' ? <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 700 }}>✓✓</span>
                  : statusAtual === 'enviada' ? <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 700 }}>✓</span>
                  : null
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDownload(mediaUrl, `imagem_${mensagem.id}.jpg`); }}
                className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 opacity-0 group-hover/img:opacity-100 transition-opacity"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button onClick={handleCarregarMidia} style={{ width: 160, height: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: '#e5e7eb', cursor: 'pointer', border: 'none' }}>
              <Download style={{ width: 20, height: 20, color: '#6b7280' }} />
              <span style={{ fontSize: 11, color: '#6b7280' }}>Carregar imagem</span>
            </button>
          )}
        </div>
        {imagemAberta && mediaUrl && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[9999] p-4" onClick={() => setImagemAberta(false)}>
            <button onClick={() => setImagemAberta(false)} className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 rounded-full p-2 z-10"><X className="w-6 h-6 text-white" /></button>
            <img src={mediaUrl} alt="Imagem ampliada" className="max-w-full max-h-[90vh] rounded-lg object-contain" onClick={e => e.stopPropagation()} />
          </div>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity self-end" disabled={deletando}>
              <MoreVertical className="w-4 h-4 text-slate-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isVendedor ? "end" : "start"}>
            <DropdownMenuItem onClick={() => onResponder?.(mensagem)}><Reply className="w-4 h-4 mr-2" />Responder</DropdownMenuItem>
            <DropdownMenuItem onClick={handleDeletar} disabled={deletando} className="text-red-600 focus:text-red-600">
              {deletando ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Deletando...</> : <><Trash2 className="w-4 h-4 mr-2" />Deletar mensagem</>}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className={`flex ${isVendedor ? 'justify-end' : 'justify-start'} gap-2 group animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <div
        className={`max-w-md rounded-2xl shadow-sm ${
          isSticker
            ? 'bg-transparent border-0 shadow-none px-0 py-0'
            : isVendedor
            ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-md px-4 py-3'
            : 'bg-white text-slate-900 rounded-bl-md border border-slate-200 px-4 py-3'
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
        {isVendedor && (
          <div className="flex items-center gap-1 mb-1">
            <span className="text-[10px]">👤</span>
            <p className="text-xs font-semibold opacity-75">
              {mensagem.usuario_nome || 'WhatsApp'}
            </p>
          </div>
        )}
        {!isGrupo && !isVendedor && mensagem.usuario_nome && (
          <p className="text-xs font-semibold mb-1 opacity-60">{mensagem.usuario_nome}</p>
        )}
        <div className="flex flex-wrap items-end gap-x-1.5">
          <div className="flex-1 min-w-0">{renderConteudo()}</div>
          {mensagem.reaction && (
            <span className="text-base leading-none flex-shrink-0" title="Reação">{mensagem.reaction}</span>
          )}
          {/* Hora + status inline, flutuando para direita como no WhatsApp */}
          <div className="flex items-center gap-0.5 flex-shrink-0 self-end ml-auto" style={{ marginBottom: '-2px' }}>
            <span className={`text-[11px] leading-none ${isVendedor ? 'text-white/70' : 'text-slate-400'}`} title={format(new Date(mensagem.data_envio || mensagem.created_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}>
              {format(new Date(mensagem.data_envio || mensagem.created_date), 'HH:mm')}
            </span>
            {isVendedor && (
              <span title={statusAtual}>
                {statusAtual === 'lida' ? (
                  <span className="text-[13px] font-bold leading-none" style={{ color: '#53bdeb', transition: 'color 0.3s' }}>✓✓</span>
                ) : statusAtual === 'entregue' ? (
                  <span className="text-[13px] font-bold leading-none" style={{ color: 'rgba(255,255,255,0.75)', transition: 'color 0.3s' }}>✓✓</span>
                ) : statusAtual === 'enviada' ? (
                  <span className="text-[13px] font-bold leading-none" style={{ color: 'rgba(255,255,255,0.75)', transition: 'color 0.3s' }}>✓</span>
                ) : statusAtual === 'erro' ? (
                  <span className="text-[13px] font-bold leading-none text-red-300" title="Falha no envio">✕</span>
                ) : (
                  <svg className="w-3 h-3 opacity-60 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                )}
              </span>
            )}
          </div>
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
           {(mensagem.tipo_conteudo === 'audio' || mensagem.tipo_conteudo === 'imagem' || mensagem.tipo_conteudo === 'pdf' || mensagem.tipo_conteudo === 'documento' || mensagem.tipo_conteudo === 'video') && mediaUrl && (
             <DropdownMenuItem onClick={() => {
               const ext = mensagem.tipo_conteudo === 'audio' ? 'mp3' : mensagem.tipo_conteudo === 'imagem' ? 'jpg' : mensagem.tipo_conteudo === 'video' ? 'mp4' : 'pdf';
               handleDownload(mediaUrl, mensagem.arquivo_nome || `${mensagem.tipo_conteudo}_${mensagem.id}.${ext}`);
             }}>
               <Download className="w-4 h-4 mr-2" />
               Baixar arquivo
             </DropdownMenuItem>
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