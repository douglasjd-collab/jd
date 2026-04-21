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
  const popupRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        (!popupRef.current || !popupRef.current.contains(e.target))
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(v => !v);
  };

  const popup = open && ReactDOM.createPortal(
    <div
      ref={popupRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
      className="bg-white border border-slate-200 rounded-lg shadow-xl p-2 w-56"
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
    </div>,
    document.body
  );

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className="w-12 h-9 flex items-center justify-center text-xl border border-input rounded-md bg-background hover:bg-accent transition-colors"
        title="Clique para escolher ícone"
      >
        {value || '🏷️'}
      </button>
      {popup}
    </div>
  );
}