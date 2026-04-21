import React, { useState, useRef, useEffect } from 'react';

const EMOJIS = [
  '🏷️','💰','💳','🏦','🏢','🚗','⛽','🍽️','🛒','📦',
  '📢','💡','🔧','🏠','🎓','💊','🏥','✈️','📱','💻',
  '👤','👥','📝','📋','🗂️','📊','📈','🧾','💼','🎯',
  '⚙️','🔑','🌐','📡','🎁','🎪','🎨','🎬','🎵','🏋️',
  '🌱','🌊','🔒','⚡','🚀','🛠️','🧹','🧺','🍕','☕',
];

export default function EmojiPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative" style={{ zIndex: 100 }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-12 h-9 flex items-center justify-center text-xl border border-input rounded-md bg-background hover:bg-accent transition-colors"
        title="Clique para escolher ícone"
      >
        {value || '🏷️'}
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-2xl p-2 w-60"
          style={{ zIndex: 9999 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-8 gap-1 mb-2">
            {EMOJIS.map(emoji => (
              <button
                key={emoji}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(emoji);
                  setOpen(false);
                }}
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
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Ou cole um emoji..."
              className="w-full text-center border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>
        </div>
      )}
    </div>
  );
}