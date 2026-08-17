import React, { useState } from 'react';
import { Sticker } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Figurinhas no estilo "Joinha" — personagem com boné e óculos
const FIGURINHAS = [
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

  const enviarFigurinha = async (fig) => {
    if (isLoading || enviando) return;
    setEnviando(fig.id);
    try {
      const resp = await fetch(fig.url);
      const blob = await resp.blob();
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
    <div className="relative pb-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setAberto((prev) => !prev)}
        className={`rounded-full w-10 h-10 transition-all ${aberto ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 hover:bg-purple-100 text-slate-600 hover:text-purple-600'}`}
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
          <div className="absolute bottom-full left-0 mb-2 bg-white border border-slate-200 rounded-2xl shadow-lg p-3 z-40 w-[320px] max-w-[calc(100vw-2rem)]">
            <div className="flex items-center gap-2 mb-2 px-1">
              <Sticker className="w-4 h-4 text-purple-500" />
              <span className="text-xs font-semibold text-slate-600">Figurinhas Joinha</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
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