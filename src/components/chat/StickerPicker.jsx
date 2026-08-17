import React, { useState } from 'react';
import { Sticker } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Figurinhas no estilo "Joinha" — personagem com boné e óculos
const FIGURINHAS = [
  {
    id: 'joinha',
    label: 'Joinha',
    url: 'https://media.base44.com/images/public/6950a9860c8af0e2ff10fc9e/3911acfc5_exec-febfd105-0c47-40eb-9f8e-03e8fe728026.png',
    nome: 'sticker_joinha.png',
  },
  {
    id: 'bom_dia',
    label: 'Bom dia',
    url: 'https://media.base44.com/images/public/6950a9860c8af0e2ff10fc9e/f9fc0fde7_exec-61780b3a-21bf-4ad8-8008-a4e581138495.png',
    nome: 'sticker_bom_dia.png',
  },
  {
    id: 'boa_tarde',
    label: 'Boa tarde',
    url: 'https://media.base44.com/images/public/6950a9860c8af0e2ff10fc9e/457e5b33a_exec-0e0262cd-9231-43db-ab01-8b5f6f68b914.png',
    nome: 'sticker_boa_tarde.png',
  },
  {
    id: 'boa_noite',
    label: 'Boa noite',
    url: 'https://media.base44.com/images/public/6950a9860c8af0e2ff10fc9e/9253f5874_exec-1579e045-eaa5-426d-bde4-c449457e1e4c.png',
    nome: 'sticker_boa_noite.png',
  },
  {
    id: 'tchau',
    label: 'Até logo (finalizar)',
    url: 'https://media.base44.com/images/public/6950a9860c8af0e2ff10fc9e/225722926_exec-3f115dbf-932c-4e4e-85c4-0594dfe6ea21.png',
    nome: 'sticker_ate_logo.png',
  },
];

export default function StickerPicker({ onEnviar, isLoading = false }) {
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(null);

  // Remove o fundo preto da figurinha via canvas, deixando o contorno transparente
  const removerFundoPreto = (url) => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          // Fundo preto → transparente; transições suaves (anti-alias) ficam semitransparentes
          if (r < 30 && g < 30 && b < 30) {
            data[i + 3] = 0;
          } else if (r < 70 && g < 70 && b < 70) {
            data[i + 3] = Math.round(((r + g + b) / 3 - 30) / 40 * 255);
          }
        }
        ctx.putImageData(imageData, 0, 0);
        canvas.toBlob((blob) => resolve(blob), 'image/png');
      } catch (e) {
        // Canvas tainted (CORS) — usa a imagem original sem remover fundo
        fetch(url).then(r => r.blob()).then(resolve).catch(reject);
      }
    };
    img.onerror = reject;
    img.src = url;
  });

  const enviarFigurinha = async (fig) => {
    if (isLoading || enviando) return;
    setEnviando(fig.id);
    try {
      const blob = await removerFundoPreto(fig.url);
      const file = new File([blob], fig.nome, { type: 'image/png' });
      onEnviar({
        texto: '',
        arquivo: {
          file,
          nome: fig.nome,
          tipo: 'image/png',
          tamanho: file.size || 0,
        },
      });
      setAberto(false);
    } catch (err) {
      console.error('Erro ao enviar figurinha:', err);
    } finally {
      setEnviando(null);
    }
  };

  return (
    <div className="pb-1 pr-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setAberto((prev) => !prev)}
        className={`rounded-full w-9 h-9 transition-all ${aberto ? 'text-purple-600' : 'text-slate-400 hover:text-purple-600'}`}
        title="Figurinhas"
      >
        <Sticker className="w-5 h-5" />
      </Button>

      {aberto && (
        <>
          {/* Backdrop para fechar ao clicar fora */}
          <div
            className="fixed inset-0 z-30"
            onClick={() => setAberto(false)}
          />
          <div className="absolute bottom-full left-0 right-0 mb-2 mx-3 bg-white border border-slate-200 rounded-2xl shadow-lg p-4 z-40">
            <div className="flex items-center gap-2 mb-3 px-1">
              <Sticker className="w-4 h-4 text-purple-500" />
              <span className="text-xs font-semibold text-slate-600">Figurinhas Joinha</span>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {FIGURINHAS.map((fig) => (
                <button
                  key={fig.id}
                  type="button"
                  disabled={!!enviando}
                  onClick={() => enviarFigurinha(fig)}
                  className="group relative aspect-square rounded-xl overflow-hidden border border-slate-200 hover:border-purple-400 hover:shadow-md transition-all disabled:opacity-50"
                  title={fig.label}
                >
                  <img
                    src={fig.url}
                    alt={fig.label}
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                  />
                  {enviando === fig.id && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-2 text-center">
              Toque em uma figurinha para enviar
            </p>
          </div>
        </>
      )}
    </div>
  );
}