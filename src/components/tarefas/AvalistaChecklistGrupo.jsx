import React, { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, User, Pencil } from 'lucide-react';

// Cores (seguindo referência de design)
const AZUL = '#334e80';
const TEAL = '#2dd4bf';
const BORDA = '#dce4f2';

export default function AvalistaChecklistGrupo({ grupo, itens, onUpdate, onRemoverGrupo, onRenomearGrupo }) {
  const [novoItem, setNovoItem] = useState('');
  const [editandoNome, setEditandoNome] = useState(false);
  const [nomeEdicao, setNomeEdicao] = useState(grupo);

  // Exibe apenas itens reais (marcadores de grupo vazio não contam)
  const itensGrupo = itens.filter(i => i.grupo === grupo && !i.marker);
  const done = itensGrupo.filter(i => i.checked).length;
  const pct = itensGrupo.length > 0 ? Math.round((done / itensGrupo.length) * 100) : 0;

  const toggle = (id, val) => {
    onUpdate(itens.map(i => i.id === id ? { ...i, checked: val } : i));
  };

  const remover = (id) => {
    onUpdate(itens.filter(i => i.id !== id));
  };

  const adicionar = () => {
    const texto = novoItem.trim();
    if (!texto) return;
    onUpdate([...itens, { id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, texto, checked: false, grupo }]);
    setNovoItem('');
  };

  const salvarNome = () => {
    const nome = nomeEdicao.trim();
    if (!nome) { setEditandoNome(false); return; }
    // Renomeia o grupo em todos os itens (incluindo marcador)
    const atualizado = itens.map(i => i.grupo === grupo ? { ...i, grupo: nome } : i);
    onRenomearGrupo(grupo, nome);
    onUpdate(atualizado);
    setEditandoNome(false);
  };

  return (
    <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: BORDA }}>
      {/* Header do grupo */}
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: 'transparent' }}>
        <User className="w-4 h-4 flex-shrink-0" style={{ color: AZUL }} />
        {editandoNome ? (
          <input
            autoFocus
            value={nomeEdicao}
            onChange={e => setNomeEdicao(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') salvarNome(); if (e.key === 'Escape') setEditandoNome(false); }}
            onBlur={salvarNome}
            className="flex-1 text-sm font-semibold bg-white border rounded px-2 py-1 outline-none"
            style={{ color: AZUL, borderColor: BORDA }}
          />
        ) : (
          <button
            onClick={() => { setNomeEdicao(grupo); setEditandoNome(true); }}
            className="flex-1 text-left text-sm font-semibold hover:opacity-80 flex items-center gap-1.5"
            style={{ color: AZUL }}
          >
            {grupo}
            <Pencil className="w-3 h-3 opacity-50" style={{ color: AZUL }} />
          </button>
        )}
        <span className="text-xs font-medium whitespace-nowrap" style={{ color: AZUL }}>
          {done}/{itensGrupo.length}
        </span>
        <button
          onClick={() => onRemoverGrupo(grupo)}
          className="transition-colors"
          style={{ color: '#9ca3af' }}
          title="Remover grupo"
        >
          <Trash2 className="w-4 h-4 hover:text-red-500" />
        </button>
      </div>

      {/* Barra de progresso */}
      <div className="px-4">
        <div className="h-1 rounded-full overflow-hidden" style={{ background: BORDA }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: AZUL }} />
        </div>
      </div>

      {/* Itens */}
      <div className="p-3 space-y-1.5">
        {itensGrupo.map(item => (
          <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg bg-white border group transition-colors" style={{ borderColor: '#e5e7eb' }}>
            <Checkbox
              checked={item.checked}
              onCheckedChange={v => toggle(item.id, !!v)}
              className="data-[state=checked]:border-teal-400"
              style={{ borderColor: item.checked ? TEAL : undefined }}
            />
            <span className={`text-sm flex-1 ${item.checked ? 'line-through text-slate-400' : 'text-slate-700'}`}>
              {item.texto}
            </span>
            <button
              onClick={() => remover(item.id)}
              className="text-slate-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {itensGrupo.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-2">Nenhum item neste grupo</p>
        )}

        {/* Adicionar item */}
        <div className="flex gap-2 pt-1">
          <input
            type="text"
            className="flex-1 text-sm border rounded-lg px-3 py-2 outline-none bg-white placeholder:text-slate-400"
            style={{ borderColor: BORDA }}
            placeholder="Adicionar documento..."
            value={novoItem}
            onChange={e => setNovoItem(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && adicionar()}
          />
          <button
            onClick={adicionar}
            disabled={!novoItem.trim()}
            className="flex-shrink-0 w-9 h-9 rounded-lg border bg-white flex items-center justify-center transition-colors disabled:opacity-40"
            style={{ borderColor: BORDA, color: AZUL }}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}