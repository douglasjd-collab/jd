import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Search, ChevronDown, X } from 'lucide-react';

export default function VendedorSearchSelect({ vendedores = [], value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);

  const selected = vendedores.find(v => v.id === value);
  const selectedName = selected ? (selected.nome || selected.razao_social || selected.full_name) : '';

  const filtered = vendedores.filter(v => {
    const name = (v.nome || v.razao_social || v.full_name || '').toLowerCase();
    return name.includes(search.toLowerCase());
  });

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch(''); }}
        className="flex items-center justify-between w-full h-9 px-3 rounded-md border border-input bg-background text-sm shadow-sm hover:bg-accent hover:text-accent-foreground"
      >
        <span className={selectedName ? 'text-foreground' : 'text-muted-foreground'}>
          {selectedName || 'Selecione'}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <Input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar vendedor..."
                className="pl-8 h-8 text-sm"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5 text-slate-400" />
                </button>
              )}
            </div>
          </div>
          <div className="max-h-[180px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-3">Nenhum resultado</p>
            ) : (
              filtered.map(v => {
                const name = v.nome || v.razao_social || v.full_name;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => { onChange(v.id); setOpen(false); setSearch(''); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-100 transition-colors ${value === v.id ? 'bg-slate-100 font-medium' : ''}`}
                  >
                    {name}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}