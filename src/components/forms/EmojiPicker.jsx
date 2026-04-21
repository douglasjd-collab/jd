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

  const calcPos = () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const popupHeight = 220;
    if (spaceBelow < popupHeight) {
      setPos({ top: rect.top - popupHeight - 4, left: rect.left });
    } else {
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        !e.target.closest('[data-emoji-popup="true"]')
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [open]);

  const handleToggle = () => {
    calcPos();
    setOpen(v => !v);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className="w-12 h-9 flex items-center justify-center text-xl border border-input rounded-md bg-background hover:bg-accent transition-colors flex-shrink-0"
        title="Clique para escolher ícone"
      >
        {value || '🏷️'}
      </button>

      {open && ReactDOM.createPortal(
        <div
          data-emoji-popup="true"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 99999,
          }}
          className="bg-white border border-slate-200 rounded-lg shadow-2xl p-2 w-60"
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
              onChange={(e) => onChange(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
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