import React, { useState, useEffect } from 'react';
import { Download, X, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { base44 } from '@/api/base44Client';

export default function GrupoImagens({ mensagens, conversaId, isVendedor }) {
  // Estado de URL por mensagem
  const [urls, setUrls] = useState(() => {
    const init = {};
    mensagens.forEach(m => {
      const url = m.arquivo_url;
      const valida = url && !url.endsWith('.enc') && !url.includes('.enc?') &&
        (url.includes('base44') || url.includes('supabase') || url.includes('amazonaws') || url.startsWith('http'));
      init[m.id] = valida ? url : null;
    });
    return init;
  });
  const [loading, setLoading] = useState({});
  const [imagemAberta, setImagemAberta] = useState(null); // url da imagem ampliada

  const carregarImagem = async (msg) => {
    if (loading[msg.id] || urls[msg.id]) return;
    setLoading(prev => ({ ...prev, [msg.id]: true }));
    try {
      const res = await base44.functions.invoke('baixarMidiaWhatsApp', {
        mensagem_id: msg.id,
        arquivo_url: msg.arquivo_url,
        conversa_id: conversaId || msg.conversa_id
      });
      if (res?.data?.arquivo_url) {
        setUrls(prev => ({ ...prev, [msg.id]: res.data.arquivo_url }));
      }
    } catch (e) {
      console.error('Erro ao carregar imagem:', e);
    } finally {
      setLoading(prev => ({ ...prev, [msg.id]: false }));
    }
  };

  // Auto-carregar todas as imagens do grupo
  React.useEffect(() => {
    mensagens.forEach(msg => {
      if (!urls[msg.id]) carregarImagem(msg);
    });
  }, []);

  const total = mensagens.length;
  const MAX_VISIVEIS = 4;
  const extras = total > MAX_VISIVEIS ? total - MAX_VISIVEIS : 0;
  const visiveis = mensagens.slice(0, MAX_VISIVEIS);

  // Layout grid igual WhatsApp
  const getGridClass = (count) => {
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-2';
    return 'grid-cols-2';
  };

  // Última mensagem do grupo para hora e status
  const ultima = mensagens[mensagens.length - 1];

  const handleDownload = (url, id) => {
    if (!url) return;
    window.open(url, '_blank');
  };

  return (
    <>
      <div className={`flex ${isVendedor ? 'justify-end' : 'justify-start'}`}>
        <div className={`rounded-2xl overflow-hidden shadow-sm ${isVendedor ? 'rounded-br-md' : 'rounded-bl-md'}`} style={{ maxWidth: 280 }}>
          <div className={`grid ${getGridClass(Math.min(total, MAX_VISIVEIS))} gap-0.5`}>
            {visiveis.map((msg, idx) => {
              const url = urls[msg.id];
              const isLoading = loading[msg.id];
              const isLast = idx === visiveis.length - 1;
              const isLastAndHasExtras = isLast && extras > 0;

              return (
                <div
                  key={msg.id}
                  className="relative bg-slate-200 overflow-hidden cursor-pointer"
                  style={{ aspectRatio: '1', minWidth: total === 1 ? 200 : 130 }}
                  onClick={() => url && setImagemAberta(url)}
                >
                  {isLoading ? (
                    <div className="w-full h-full flex items-center justify-center bg-slate-200">
                      <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                    </div>
                  ) : url ? (
                    <img
                      src={url}
                      alt="Imagem"
                      className="w-full h-full object-cover"
                      onError={() => setUrls(prev => ({ ...prev, [msg.id]: null }))}
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center bg-slate-100 hover:bg-slate-200 transition-colors"
                      onClick={(e) => { e.stopPropagation(); carregarImagem(msg); }}
                    >
                      <Download className="w-5 h-5 text-slate-400" />
                    </div>
                  )}

                  {/* Overlay "+X" na última miniatura */}
                  {isLastAndHasExtras && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-white text-xl font-bold">+{extras}</span>
                    </div>
                  )}

                  {/* Botão download ao hover */}
                  {url && !isLastAndHasExtras && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDownload(url, msg.id); }}
                      className="absolute bottom-1 right-1 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 opacity-0 hover:opacity-100 transition-opacity"
                    >
                      <Download className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Rodapé com hora e status */}
          <div className={`flex items-center justify-end gap-1 px-2 py-1 ${isVendedor ? 'bg-gradient-to-br from-blue-500 to-blue-600' : 'bg-white border-t border-slate-100'}`}>
            <span className={`text-[11px] ${isVendedor ? 'text-white/70' : 'text-slate-400'}`}>
              {format(new Date(ultima.data_envio || ultima.created_date), 'HH:mm')}
            </span>
            {isVendedor && (
              <span>
                {ultima.status === 'lida' ? (
                  <span className="text-[13px] font-bold" style={{ color: '#53bdeb' }}>✓✓</span>
                ) : ultima.status === 'entregue' ? (
                  <span className="text-[13px] font-bold" style={{ color: 'rgba(255,255,255,0.75)' }}>✓✓</span>
                ) : ultima.status === 'enviada' ? (
                  <span className="text-[13px] font-bold" style={{ color: 'rgba(255,255,255,0.75)' }}>✓</span>
                ) : null}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {imagemAberta && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-[9999] p-4"
          onClick={() => setImagemAberta(null)}
        >
          <button
            onClick={() => setImagemAberta(null)}
            className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 rounded-full p-2 z-10"
          >
            <X className="w-6 h-6 text-white" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); window.open(imagemAberta, '_blank'); }}
            className="absolute top-4 right-16 bg-white/20 hover:bg-white/40 rounded-full p-2 z-10"
          >
            <Download className="w-6 h-6 text-white" />
          </button>
          <img
            src={imagemAberta}
            alt="Imagem ampliada"
            className="max-w-full max-h-[90vh] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}