import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, LayoutList, UserPlus } from 'lucide-react';
import AvalistaChecklistGrupo from './AvalistaChecklistGrupo';

const AZUL = '#334e80';
const BORDA = '#dce4f2';

// Estrutura do checklist (JSON no campo tarefa.checklist):
// [{ id, texto, checked, grupo?, marker? }]
// - Itens sem "grupo" → checklist principal
// - Itens com "grupo" → agrupados (Cliente, Avalista, Participante, etc.)
// - Itens com marker=true → marcador que mantém o grupo vazio visível/persistido

export default function ChecklistAba({ checklist, empresaId, onUpdate }) {
  const [novoItem, setNovoItem] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [criandoGrupo, setCriandoGrupo] = useState(false);
  const [nomeNovoGrupo, setNomeNovoGrupo] = useState('');

  const { data: templates = [] } = useQuery({
    queryKey: ['checklist-templates', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.ChecklistTemplate.filter({ empresa_id: empresaId }, 'nome'),
  });

  // Separar principal de grupos (marcadores não são itens visíveis do principal)
  const itensPrincipal = checklist.filter(i => !i.grupo && !i.marker);
  const grupos = [...new Set(checklist.map(i => i.grupo).filter(Boolean))];

  const checkDone = itensPrincipal.filter(i => i.checked).length;
  const checkPct = itensPrincipal.length > 0 ? Math.round((checkDone / itensPrincipal.length) * 100) : 0;

  const handleToggle = (id, val) => {
    onUpdate(checklist.map(i => i.id === id ? { ...i, checked: val } : i));
  };

  const handleAdicionarItem = () => {
    const texto = novoItem.trim();
    if (!texto) return;
    onUpdate([...checklist, { id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, texto, checked: false }]);
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

  const handleCriarGrupo = () => {
    const nome = nomeNovoGrupo.trim();
    if (!nome) return;
    // Se o nome já existe, apenas fecha
    if (grupos.includes(nome)) { setNomeNovoGrupo(''); setCriandoGrupo(false); return; }
    // Cria o grupo com um marcador vazio para mantê-lo visível/persistido
    onUpdate([
      ...checklist,
      { id: `gmarker_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, texto: '', checked: false, grupo: nome, marker: true },
    ]);
    setNomeNovoGrupo('');
    setCriandoGrupo(false);
  };

  const handleRemoverGrupo = (grupo) => {
    // Remove todos os itens (e o marcador) daquele grupo
    onUpdate(checklist.filter(i => i.grupo !== grupo));
  };

  const handleRenomearGrupo = (grupoAntigo, grupoNovo) => {
    // O filho já atualizou os itens via onUpdate; nada a fazer aqui.
  };

  return (
    <div className="space-y-6">
      {/* Checklist Principal */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Checklist Principal</h3>

        {itensPrincipal.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-slate-700">{checkDone} de {itensPrincipal.length} concluídos</span>
              <span className="text-sm font-bold text-slate-500">{checkPct}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${checkPct}%` }} />
            </div>
          </div>
        )}

        <div className="space-y-2">
          {itensPrincipal.map(item => (
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

          {itensPrincipal.length === 0 && grupos.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">Nenhum item no checklist</p>
          )}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-slate-400 bg-white placeholder:text-slate-400"
            placeholder="Adicionar item..."
            value={novoItem}
            onChange={e => setNovoItem(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdicionarItem()}
          />
          <Button size="sm" variant="outline" onClick={handleAdicionarItem} disabled={!novoItem.trim()} className="flex-shrink-0">
            <Plus className="w-4 h-4" />
          </Button>
        </div>

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

      {/* Grupos de Checklist (Cliente, Avalista, Participante, etc.) */}
      {grupos.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            <UserPlus className="w-4 h-4" style={{ color: AZUL }} />
            <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: AZUL }}>Grupos de Checklist</h3>
          </div>

          <div className="space-y-3">
            {grupos.map(grupo => (
              <AvalistaChecklistGrupo
                key={grupo}
                grupo={grupo}
                itens={checklist}
                onUpdate={onUpdate}
                onRemoverGrupo={handleRemoverGrupo}
                onRenomearGrupo={handleRenomearGrupo}
              />
            ))}
          </div>
        </div>
      )}

      {/* Adicionar grupo (com nome editável) */}
      {criandoGrupo ? (
        <div className="flex gap-2 p-3 rounded-xl border-2 border-dashed" style={{ borderColor: BORDA }}>
          <input
            autoFocus
            type="text"
            placeholder="Nome do grupo (ex: Cliente, Avalista, Participante...)"
            value={nomeNovoGrupo}
            onChange={e => setNomeNovoGrupo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCriarGrupo(); if (e.key === 'Escape') { setCriandoGrupo(false); setNomeNovoGrupo(''); } }}
            className="flex-1 text-sm border rounded-lg px-3 py-2 outline-none bg-white placeholder:text-slate-400"
            style={{ borderColor: BORDA }}
          />
          <Button size="sm" onClick={handleCriarGrupo} disabled={!nomeNovoGrupo.trim()} className="flex-shrink-0">
            Adicionar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setCriandoGrupo(false); setNomeNovoGrupo(''); }} className="flex-shrink-0">
            Cancelar
          </Button>
        </div>
      ) : (
        <button
          onClick={() => setCriandoGrupo(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed transition-colors text-sm font-medium"
          style={{ borderColor: BORDA, color: AZUL }}
          onMouseEnter={e => { e.currentTarget.style.background = '#f5f8fc'; e.currentTarget.style.borderColor = '#c4d4ec'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = BORDA; }}
        >
          <UserPlus className="w-4 h-4" />
          Adicionar Grupo
        </button>
      )}
    </div>
  );
}