import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';

const EMOJIS = [
  '🏷️','💰','💳','🏦','🏢','🚗','⛽','🍽️','🛒','📦',
  '📢','💡','🔧','🏠','🎓','💊','🏥','✈️','📱','💻',
  '👤','👥','📝','📋','🗂️','📊','📈','🧾','💼','🎯',
  '⚙️','🔑','🌐','📡','🎁','🎪','🎨','🎬','🎵','🏋️',
  '🌱','🌊','🔒','⚡','🚀','🛠️','🧹','🧺','🍕','☕',
];

export default function EmojiPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      // Fecha somente se o clique foi fora do popup (classe sentinel) e fora do botão
      if (!e.target.closest('[data-emoji-popup]') && !e.target.closest('[data-emoji-btn]')) {
        setOpen(false);
      }
    };
    // Usar capture=true e timeout para garantir que o click do emoji já foi processado
    const timer = setTimeout(() => document.addEventListener('click', handler), 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handler);
    };
  }, [open]);

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(v => !v);
  };

  const handleSelect = (emoji) => {
    onChange(emoji);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        data-emoji-btn
        type="button"
        onClick={handleOpen}
        className="w-12 h-9 flex items-center justify-center text-xl border border-input rounded-md bg-background hover:bg-accent transition-colors"
        title="Clique para escolher ícone"
      >
        {value || '🏷️'}
      </button>

      {open && ReactDOM.createPortal(
        <div
          data-emoji-popup
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999 }}
          className="bg-white border border-slate-200 rounded-lg shadow-2xl p-2 w-60"
        >
          <div className="grid grid-cols-8 gap-1 mb-2">
            {EMOJIS.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleSelect(emoji)}
                className={`w-7 h-7 flex items-center justify-center text-lg rounded hover:bg-slate-100 transition-colors ${value === emoji ? 'bg-slate-200 ring-1 ring-slate-400' : ''}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="border-t pt-2">
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Ou cole um emoji..."
              className="w-full text-center border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}