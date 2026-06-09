import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, LayoutList } from 'lucide-react';

export default function ChecklistAba({ checklist, empresaId, onUpdate }) {
  const [novoItem, setNovoItem] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ['checklist-templates', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.ChecklistTemplate.filter({ empresa_id: empresaId }, 'nome'),
  });

  const checkDone = checklist.filter(i => i.checked).length;
  const checkPct = checklist.length > 0 ? Math.round((checkDone / checklist.length) * 100) : 0;

  const handleToggle = (id, val) => {
    const updated = checklist.map(i => i.id === id ? { ...i, checked: val } : i);
    onUpdate(updated);
  };

  const handleAdicionarItem = () => {
    const texto = novoItem.trim();
    if (!texto) return;
    const updated = [...checklist, { id: Date.now().toString(), texto, checked: false }];
    onUpdate(updated);
    setNovoItem('');
  };

  const handleRemover = (id) => {
    onUpdate(checklist.filter(i => i.id !== id));
  };

  const handleCarregarTemplate = (template) => {
    let itens = [];
    try { itens = JSON.parse(template.itens); } catch {}
    const novos = itens.map((texto, idx) => ({
      id: `${Date.now()}_${idx}`,
      texto: typeof texto === 'string' ? texto : texto.texto || String(texto),
      checked: false,
    }));
    onUpdate([...checklist, ...novos]);
    setShowTemplates(false);
  };

  return (
    <div className="space-y-4">
      {/* Barra de progresso */}
      {checklist.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium text-slate-700">{checkDone} de {checklist.length} concluídos</span>
            <span className="text-sm font-bold text-slate-500">{checkPct}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${checkPct}%` }} />
          </div>
        </div>
      )}

      {/* Lista de itens */}
      <div className="space-y-2">
        {checklist.map(item => (
          <div key={item.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors group ${item.checked ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'}`}>
            <Checkbox checked={item.checked} onCheckedChange={v => handleToggle(item.id, !!v)} />
            <span className={`text-sm flex-1 ${item.checked ? 'line-through text-slate-400' : 'text-slate-700'}`}>
              {item.texto}
            </span>
            <button
              onClick={() => handleRemover(item.id)}
              className="text-slate-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {checklist.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">Nenhum item no checklist</p>
        )}
      </div>

      {/* Adicionar item manual */}
      <div className="flex gap-2">
        <input
          type="text"
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-slate-400 bg-white placeholder:text-slate-400"
          placeholder="Adicionar item..."
          value={novoItem}
          onChange={e => setNovoItem(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdicionarItem()}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={handleAdicionarItem}
          disabled={!novoItem.trim()}
          className="flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Botão carregar template */}
      {templates.length > 0 && (
        <div>
          <button
            onClick={() => setShowTemplates(v => !v)}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            <LayoutList className="w-4 h-4" />
            {showTemplates ? 'Ocultar templates' : 'Carregar de template'}
          </button>

          {showTemplates && (
            <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => handleCarregarTemplate(t)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 border-b border-slate-100 last:border-0 text-left"
                >
                  <span className="font-medium">{t.nome}</span>
                  <span className="text-xs text-slate-400">
                    {(() => { try { return JSON.parse(t.itens).length; } catch { return 0; } })()} itens
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}