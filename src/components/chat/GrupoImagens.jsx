import React, { useState, useEffect, useRef } from 'react';
import { Download, X, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';

const CELL_SIZE = 160; // px por célula
const GAP = 3;

export default function GrupoImagens({ mensagens, conversaId, isVendedor }) {
  const isUrlValida = (url) => {
    if (!url) return false;
    if (url.endsWith('.enc') || url.includes('.enc?')) return false;
    return url.includes('base44') || url.includes('supabase') || url.includes('amazonaws') || url.startsWith('blob:') || (url.startsWith('http') && !url.includes('/media/'));
  };

  const [urls, setUrls] = useState(() => {
    const init = {};
    mensagens.forEach(m => {
      init[m.id] = isUrlValida(m.arquivo_url) ? m.arquivo_url : null;
    });
    return init;
  });
  const [loading, setLoading] = useState({});
  const [failed, setFailed] = useState({});
  const [imagemAberta, setImagemAberta] = useState(null);

  // Refs para evitar stale closure no useEffect
  const urlsRef = useRef(urls);
  const loadingRef = useRef(loading);
  useEffect(() => { urlsRef.current = urls; }, [urls]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  const carregarImagem = async (msg) => {
    // Usar refs para checar estado mais recente
    if (loadingRef.current[msg.id] || urlsRef.current[msg.id]) return;
    setLoading(prev => ({ ...prev, [msg.id]: true }));
    loadingRef.current = { ...loadingRef.current, [msg.id]: true };
    try {
      const res = await base44.functions.invoke('baixarMidiaWhatsApp', {
        mensagem_id: msg.id,
        arquivo_url: msg.arquivo_url,
        conversa_id: conversaId || msg.conversa_id
      });
      if (res?.data?.arquivo_url) {
        setUrls(prev => ({ ...prev, [msg.id]: res.data.arquivo_url }));
        urlsRef.current = { ...urlsRef.current, [msg.id]: res.data.arquivo_url };
        setFailed(prev => ({ ...prev, [msg.id]: false }));
      } else {
        setFailed(prev => ({ ...prev, [msg.id]: true }));
      }
    } catch (e) {
      console.error('Erro ao carregar imagem:', e);
      setFailed(prev => ({ ...prev, [msg.id]: true }));
    } finally {
      setLoading(prev => ({ ...prev, [msg.id]: false }));
      loadingRef.current = { ...loadingRef.current, [msg.id]: false };
    }
  };

  // Auto-carregar todas as imagens ao montar — sem depender do estado (usa refs)
  useEffect(() => {
    mensagens.forEach(msg => {
      if (!isUrlValida(msg.arquivo_url) && !urlsRef.current[msg.id] && !loadingRef.current[msg.id]) {
        carregarImagem(msg);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = mensagens.length;
  const MAX_CELLS = 4;
  const visiveis = mensagens.slice(0, MAX_CELLS);
  const extras = total > MAX_CELLS ? total - MAX_CELLS : 0;
  const ultima = mensagens[mensagens.length - 1];

  const statusIcon = isVendedor ? (
    ultima.status === 'lida' ? (
      <span style={{ color: '#53bdeb', fontSize: 11, fontWeight: 700 }}>✓✓</span>
    ) : ultima.status === 'entregue' ? (
      <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 700 }}>✓✓</span>
    ) : ultima.status === 'enviada' ? (
      <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 700 }}>✓</span>
    ) : null
  ) : null;

  const horaLabel = format(new Date(ultima.data_envio || ultima.created_date), 'HH:mm');

  const renderCelula = (msg, idx, width, height, isLastVisible, borderRadius = '0px') => {
    const url = urls[msg.id];
    const isLoading = loading[msg.id];
    const hasFailed = failed[msg.id];
    const isLastAndHasExtras = isLastVisible && extras > 0;

    return (
      <div
        key={msg.id}
        style={{
          width, height,
          position: 'relative',
          flexShrink: 0,
          overflow: 'hidden',
          backgroundColor: '#c8ccd0',
          borderRadius,
          cursor: url ? 'pointer' : 'default',
        }}
        onClick={() => url && setImagemAberta(url)}
      >
        {isLoading ? (
          // Skeleton loading
          <div style={{
            width: '100%', height: '100%',
            background: 'linear-gradient(90deg, #d1d5db 25%, #e5e7eb 50%, #d1d5db 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Loader2 style={{ width: 20, height: 20, color: '#9ca3af' }} className="animate-spin" />
          </div>
        ) : url ? (
          <img
            src={url}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={() => { setUrls(prev => ({ ...prev, [msg.id]: null })); setFailed(prev => ({ ...prev, [msg.id]: true })); }}
          />
        ) : hasFailed ? (
          // Falhou no download: mostrar botão de tentar novamente
          <div
            style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: '#e5e7eb', cursor: 'pointer' }}
            onClick={e => { e.stopPropagation(); setFailed(prev => ({ ...prev, [msg.id]: false })); carregarImagem(msg); }}
          >
            <Download style={{ width: 20, height: 20, color: '#6b7280' }} />
            <span style={{ fontSize: 10, color: '#6b7280' }}>Tentar novamente</span>
          </div>
        ) : (
          // Ainda carregando (sem URL e sem falha = aguardando início)
          <div style={{ width: '100%', height: '100%', background: '#d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 style={{ width: 20, height: 20, color: '#9ca3af' }} className="animate-spin" />
          </div>
        )}

        {/* Overlay "+X" */}
        {isLastAndHasExtras && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius }}>
            <span style={{ color: '#fff', fontSize: 24, fontWeight: 700 }}>+{extras}</span>
          </div>
        )}

        {/* Hora + status na última célula visível */}
        {isLastVisible && (
          <div style={{
            position: 'absolute', bottom: 6, right: 6,
            display: 'flex', alignItems: 'center', gap: 2,
            background: 'rgba(0,0,0,0.45)', borderRadius: 10,
            padding: '2px 6px'
          }}>
            <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11 }}>{horaLabel}</span>
            {statusIcon}
          </div>
        )}
      </div>
    );
  };

  const totalW = CELL_SIZE * 2 + GAP;
  const BR = 12; // border-radius do grupo inteiro

  // Calcular border-radius por célula para dar aspecto arredondado nas extremidades
  const getBR = (topLeft, topRight, bottomRight, bottomLeft) =>
    `${topLeft}px ${topRight}px ${bottomRight}px ${bottomLeft}px`;

  let grid;
  if (visiveis.length === 1) {
    grid = (
      <div style={{ width: totalW }}>
        {renderCelula(visiveis[0], 0, totalW, 200, true, `${BR}px`)}
      </div>
    );
  } else if (visiveis.length === 2) {
    grid = (
      <div style={{ display: 'flex', gap: GAP, width: totalW }}>
        {renderCelula(visiveis[0], 0, CELL_SIZE, CELL_SIZE, false, getBR(BR, 0, 0, BR))}
        {renderCelula(visiveis[1], 1, CELL_SIZE, CELL_SIZE, true, getBR(0, BR, BR, 0))}
      </div>
    );
  } else if (visiveis.length === 3) {
    grid = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, width: totalW }}>
        {renderCelula(visiveis[0], 0, totalW, CELL_SIZE, false, getBR(BR, BR, 0, 0))}
        <div style={{ display: 'flex', gap: GAP }}>
          {renderCelula(visiveis[1], 1, CELL_SIZE, CELL_SIZE, false, getBR(0, 0, 0, BR))}
          {renderCelula(visiveis[2], 2, CELL_SIZE, CELL_SIZE, true, getBR(0, 0, BR, 0))}
        </div>
      </div>
    );
  } else {
    // 4+ imagens: 2x2
    grid = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, width: totalW }}>
        <div style={{ display: 'flex', gap: GAP }}>
          {renderCelula(visiveis[0], 0, CELL_SIZE, CELL_SIZE, false, getBR(BR, 0, 0, 0))}
          {renderCelula(visiveis[1], 1, CELL_SIZE, CELL_SIZE, false, getBR(0, BR, 0, 0))}
        </div>
        <div style={{ display: 'flex', gap: GAP }}>
          {renderCelula(visiveis[2], 2, CELL_SIZE, CELL_SIZE, false, getBR(0, 0, 0, BR))}
          {renderCelula(visiveis[3], 3, CELL_SIZE, CELL_SIZE, true, getBR(0, 0, BR, 0))}
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
      <div style={{ display: 'flex', justifyContent: isVendedor ? 'flex-end' : 'flex-start', marginBottom: 2 }}>
        <div style={{
          borderRadius: BR,
          overflow: 'hidden',
          boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
          // Sem background, sem borda azul — imagem limpa
        }}>
          {grid}
        </div>
      </div>

      {/* Lightbox */}
      {imagemAberta && (
        <div
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}
          onClick={() => setImagemAberta(null)}
        >
          <button
            onClick={() => setImagemAberta(null)}
            style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', padding: 8, cursor: 'pointer' }}
          >
            <X style={{ width: 24, height: 24, color: '#fff' }} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); window.open(imagemAberta, '_blank'); }}
            style={{ position: 'absolute', top: 16, right: 64, background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', padding: 8, cursor: 'pointer' }}
          >
            <Download style={{ width: 24, height: 24, color: '#fff' }} />
          </button>
          <img
            src={imagemAberta}
            alt="Imagem"
            style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }}
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}