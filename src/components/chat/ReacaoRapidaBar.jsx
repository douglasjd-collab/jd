import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// Reações rápidas — as mesmas 6 do WhatsApp Web (👍❤️😂😮😢🙏)
const RAPIDAS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// Botão "+": mais emojis (apenas emojis simples — a API do WhatsApp não aceita
// sequências combinadas como reação única)
const EXTRAS = [
  '😍', '😘', '🥰', '😎', '🤩', '😉', '😜',
  '🤔', '😅', '😭', '😡', '😴', '🤯', '🥳',
  '🙌', '👏', '👊', '✌️', '🤝', '💪', '🙏',
  '🔥', '✨', '🎉', '💯', '✅', '⭐', '📌',
];

export default function ReacaoRapidaBar({ onReagir }) {
  const [maisAberto, setMaisAberto] = useState(false);

  const reagir = (emoji) => {
    setMaisAberto(false);
    onReagir?.(emoji);
  };

  return (
    <div className="flex items-center gap-0.5 bg-white rounded-full shadow-lg border border-slate-200 px-1.5 py-1">
      {RAPIDAS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={(e) => { e.stopPropagation(); reagir(emoji); }}
          className="w-7 h-7 flex items-center justify-center rounded-full text-base leading-none hover:bg-slate-100 hover:scale-125 transition-transform"
          title={`Reagir com ${emoji}`}
        >
          {emoji}
        </button>
      ))}

      <Popover open={maisAberto} onOpenChange={setMaisAberto}>
        <PopoverTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
            title="Mais reações"
            aria-label="Mais reações"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={6} className="w-auto p-2 rounded-xl">
          <div className="grid grid-cols-7 gap-0.5">
            {EXTRAS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => reagir(emoji)}
                className="w-7 h-7 flex items-center justify-center rounded-full text-base leading-none hover:bg-slate-100 hover:scale-125 transition-transform"
                title={`Reagir com ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}