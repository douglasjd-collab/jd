import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// Emojis simples: a API do WhatsApp aceita uma única reação por mensagem.
const EMOJIS = [
  '👍', '❤️', '😂', '😮', '😢', '🙏',
  '😍', '😘', '🥰', '😎', '🤩', '😉', '😜',
  '🤔', '😅', '😭', '😡', '😴', '🤯', '🥳',
  '🙌', '👏', '👊', '✌️', '🤝', '💪',
  '🔥', '✨', '🎉', '💯', '✅', '⭐', '📌',
];

export default function ReacaoRapidaBar({ onReagir }) {
  const [aberto, setAberto] = useState(false);

  const reagir = (emoji) => {
    setAberto(false);
    onReagir?.(emoji);
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="w-7 h-7 flex items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-100 hover:text-slate-700 hover:scale-105 transition-all"
          title="Adicionar reação"
          aria-label="Adicionar reação"
        >
          <Plus className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={6}
        onClick={(e) => e.stopPropagation()}
        className="w-auto max-w-[272px] p-2 rounded-xl shadow-xl"
      >
        <div className="grid grid-cols-7 gap-0.5">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => reagir(emoji)}
              className="w-8 h-8 flex items-center justify-center rounded-full text-lg leading-none hover:bg-slate-100 hover:scale-125 transition-transform"
              title={`Reagir com ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}