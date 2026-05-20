import React, { useState, useEffect } from 'react';
import { Download, X, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';

const CELL_SIZE = 148; // px por célula
const GAP = 2;

export default function GrupoImagens({ mensagens, conversaId, isVendedor }) {
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
  const [imagemAberta, setImagemAberta] = useState(null);

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

  useEffect(() => {
    mensagens.forEach(msg => {
      if (!urls[msg.id]) carregarImagem(msg);
    });
  }, []);

  const total = mensagens.length;
  // Mostrar no máximo 4 células, extras contados a partir da 4ª
  const MAX_CELLS = 4;
  const visiveis = mensagens.slice(0, MAX_CELLS);
  const extras = total > MAX_CELLS ? total - MAX_CELLS : 0;
  const ultima = mensagens[mensagens.length - 1];

  // Hora e status (sobrepostos na última célula visível)
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

  // Layout: 1 imagem = largura total; 2 = lado a lado; 3 = primeira grande + 2 menores; 4 = 2x2
  const renderCelula = (msg, idx, width, height, isLastVisible) => {
    const url = urls[msg.id];
    const isLoading = loading[msg.id];
    const isLastAndHasExtras = isLastVisible && extras > 0;

    return (
      <div
        key={msg.id}
        style={{ width, height, position: 'relative', flexShrink: 0, overflow: 'hidden', backgroundColor: '#d1d5db', cursor: 'pointer' }}
        onClick={() => url && setImagemAberta(url)}
      >
        {isLoading ? (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 style={{ width: 20, height: 20, color: '#9ca3af' }} className="animate-spin" />
          </div>
        ) : url ? (
          <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={() => setUrls(prev => ({ ...prev, [msg.id]: null }))} />
        ) : (
          <div
            style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb' }}
            onClick={e => { e.stopPropagation(); carregarImagem(msg); }}
          >
            <Download style={{ width: 20, height: 20, color: '#9ca3af' }} />
          </div>
        )}

        {/* Overlay "+X" */}
        {isLastAndHasExtras && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>+{extras}</span>
          </div>
        )}

        {/* Hora + status na última célula visível (canto inferior direito) */}
        {isLastVisible && (
          <div style={{
            position: 'absolute', bottom: 4, right: 6,
            display: 'flex', alignItems: 'center', gap: 2,
            background: 'rgba(0,0,0,0.45)', borderRadius: 10,
            padding: '1px 5px'
          }}>
            <span style={{ color: 'rgba(255,255,255,0.92)', fontSize: 11 }}>{horaLabel}</span>
            {statusIcon}
          </div>
        )}
      </div>
    );
  };

  const totalW = CELL_SIZE * 2 + GAP;

  // Decide layout baseado na quantidade de imagens
  let grid;
  if (visiveis.length === 1) {
    // 1 imagem: largura total, altura 200
    grid = (
      <div style={{ width: totalW }}>
        {renderCelula(visiveis[0], 0, totalW, 200, true)}
      </div>
    );
  } else if (visiveis.length === 2) {
    // 2 imagens: lado a lado, 1 linha
    grid = (
      <div style={{ display: 'flex', gap: GAP, width: totalW }}>
        {visiveis.map((msg, idx) =>
          renderCelula(msg, idx, CELL_SIZE, CELL_SIZE, idx === 1)
        )}
      </div>
    );
  } else if (visiveis.length === 3) {
    // 3 imagens: primeira grande em cima, duas menores embaixo
    grid = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, width: totalW }}>
        {renderCelula(visiveis[0], 0, totalW, CELL_SIZE, false)}
        <div style={{ display: 'flex', gap: GAP }}>
          {renderCelula(visiveis[1], 1, CELL_SIZE, CELL_SIZE, false)}
          {renderCelula(visiveis[2], 2, CELL_SIZE, CELL_SIZE, true)}
        </div>
      </div>
    );
  } else {
    // 4 imagens: 2x2 grid (igual à foto do WhatsApp)
    grid = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, width: totalW }}>
        <div style={{ display: 'flex', gap: GAP }}>
          {renderCelula(visiveis[0], 0, CELL_SIZE, CELL_SIZE, false)}
          {renderCelula(visiveis[1], 1, CELL_SIZE, CELL_SIZE, false)}
        </div>
        <div style={{ display: 'flex', gap: GAP }}>
          {renderCelula(visiveis[2], 2, CELL_SIZE, CELL_SIZE, false)}
          {renderCelula(visiveis[3], 3, CELL_SIZE, CELL_SIZE, true)}
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: isVendedor ? 'flex-end' : 'flex-start' }}>
        <div style={{
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
          background: isVendedor ? '#d9fdd3' : '#ffffff',
        }}>
          {grid}
        </div>
      </div>

      {/* Lightbox */}
      {imagemAberta && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}
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