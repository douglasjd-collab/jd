import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, X, Check } from 'lucide-react';
import { toast } from 'sonner';

const CHECKLIST_PADRAO = [
  'Cliente contatado',
  'Simulação enviada',
  'Documentação recebida',
  'Crédito aprovado',
  'Contrato enviado',
  'Assinatura concluída',
  'Pagamento confirmado',
  'Venda concluída',
];

export default function OportunidadeAbaChecklist({ oportunidade, currentUser, onUpdate }) {
  let checklistItems = [];
  try { checklistItems = oportunidade?.checklist ? JSON.parse(oportunidade.checklist) : []; } catch {}

  const [novoItem, setNovoItem] = useState('');
  const [adicionando, setAdicionando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const salvar = async (novaLista) => {
    setSalvando(true);
    await onUpdate(oportunidade.id, { checklist: JSON.stringify(novaLista) });
    setSalvando(false);
  };

  const toggleItem = (idx) => {
    const nova = checklistItems.map((item, i) =>
      i === idx ? {
        ...item,
        checked: !item.checked,
        checked_by: !item.checked ? (currentUser?.nome_perfil || currentUser?.full_name) : null,
        checked_at: !item.checked ? new Date().toISOString() : null,
      } : item
    );
    salvar(nova);
  };

  const adicionarItem = async () => {
    if (!novoItem.trim()) return;
    const nova = [...checklistItems, {
      id: Date.now().toString(),
      texto: novoItem.trim(),
      checked: false,
    }];
    await salvar(nova);
    setNovoItem('');
    setAdicionando(false);
  };

  const removerItem = (idx) => {
    const nova = checklistItems.filter((_, i) => i !== idx);
    salvar(nova);
  };

  const usarPadrao = () => {
    const nova = CHECKLIST_PADRAO.map((t, i) => ({ id: `padrao_${i}`, texto: t, checked: false }));
    salvar(nova);
    toast.success('Checklist padrão aplicado!');
  };

  const total = checklistItems.length;
  const concluidos = checklistItems.filter(i => i.checked).length;
  const percentual = total > 0 ? Math.round((concluidos / total) * 100) : 0;

  return (
    <div className="p-6 max-w-2xl">
      {/* Progresso */}
      {total > 0 && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold text-slate-700">Progresso</span>
            <span className="text-sm font-bold text-blue-600">{concluidos}/{total} ({percentual}%)</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2.5">
            <div
              className="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${percentual}%` }}
            />
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-2 mb-4">
        {checklistItems.length === 0 && (
          <div className="text-center py-10 text-slate-400">
            <p className="text-sm mb-3">Nenhum item no checklist</p>
            <Button size="sm" variant="outline" onClick={usarPadrao}>
              Usar checklist padrão
            </Button>
          </div>
        )}
        {checklistItems.map((item, idx) => (
          <div
            key={item.id || idx}
            className={`flex items-center gap-3 p-3 rounded-xl border group transition-colors ${
              item.checked ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <button
              onClick={() => toggleItem(idx)}
              disabled={salvando}
              className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                item.checked ? 'bg-green-500 border-green-500' : 'border-slate-300 hover:border-blue-400'
              }`}
            >
              {item.checked && <Check className="w-3 h-3 text-white" />}
            </button>
            <div className="flex-1 min-w-0">
              <span className={`text-sm ${item.checked ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                {item.texto}
              </span>
              {item.checked && item.checked_by && (
                <p className="text-xs text-slate-400 mt-0.5">{item.checked_by}</p>
              )}
            </div>
            <button
              onClick={() => removerItem(idx)}
              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Adicionar */}
      {adicionando ? (
        <div className="flex gap-2">
          <input
            autoFocus
            type="text"
            value={novoItem}
            onChange={e => setNovoItem(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') adicionarItem(); if (e.key === 'Escape') setAdicionando(false); }}
            placeholder="Novo item..."
            className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300"
          />
          <Button size="sm" className="bg-[#1e3a5f] h-9" onClick={adicionarItem}>Adicionar</Button>
          <Button size="sm" variant="outline" className="h-9" onClick={() => setAdicionando(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <button
          onClick={() => setAdicionando(true)}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Adicionar item
        </button>
      )}
    </div>
  );
}