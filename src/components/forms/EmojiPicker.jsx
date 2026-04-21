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
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-12 h-9 flex items-center justify-center text-xl border border-input rounded-md bg-background hover:bg-accent transition-colors"
        title="Clique para escolher ícone"
      >
        {value || '🏷️'}
      </button>

      {open && (
        <div className="absolute z-50 top-10 left-0 bg-white border border-slate-200 rounded-lg shadow-xl p-2 w-56">
          <div className="grid grid-cols-8 gap-1 mb-2">
            {EMOJIS.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => { onChange(emoji); setOpen(false); }}
                className={`w-7 h-7 flex items-center justify-center text-lg rounded hover:bg-slate-100 transition-colors ${value === emoji ? 'bg-slate-200' : ''}`}
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
              maxLength={2}
              className="w-full text-center border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>
        </div>
      )}
    </div>
  );
}