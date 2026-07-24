import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'react-hot-toast';
import { Eye, Copy, Trash2, RefreshCw, Loader2 } from 'lucide-react';
import { STATUS_META, IDIOMAS, TIPOS, CATEGORIAS } from './templateHelpers';

const FILTROS = [
  { value: 'todos', label: 'Todos' },
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'em_analise', label: 'Em análise' },
  { value: 'aprovado', label: 'Aprovados' },
  { value: 'rejeitado', label: 'Rejeitados' },
];

export default function TemplateList({ templates, loading, onEdit, onRefresh }) {
  const [filtro, setFiltro] = useState('todos');
  const [syncingId, setSyncingId] = useState(null);
  const [dupId, setDupId] = useState(null);
  const [delId, setDelId] = useState(null);

  const filtrados = filtro === 'todos'
    ? templates
    : templates.filter((t) => t.status === filtro);

  const handleSync = async (t) => {
    setSyncingId(t.id);
    try {
      const res = await base44.functions.invoke('gerenciarTemplateMetaOficial', {
        action: 'sync_status',
        template_id: t.id,
      });
      if (res?.data?.success) {
        toast.success(`Status atualizado: ${STATUS_META[res.data.status]?.label || res.data.status}`);
        onRefresh();
      } else {
        toast.error(res?.data?.error || 'Erro ao sincronizar');
      }
    } catch (e) {
      toast.error('Erro ao sincronizar: ' + (e.message || ''));
    } finally {
      setSyncingId(null);
    }
  };

  const handleDuplicate = async (t) => {
    const novoNome = prompt(`Nome do novo template (cópia de "${t.name}"):\n(use apenas letras minúsculas, números e underline)`, `${t.name}_copia`);
    if (!novoNome) return;
    setDupId(t.id);
    try {
      const res = await base44.functions.invoke('gerenciarTemplateMetaOficial', {
        action: 'duplicate',
        template_id: t.id,
        new_name: novoNome,
      });
      if (res?.data?.success) {
        toast.success('Template duplicado com sucesso!');
        onRefresh();
      } else {
        toast.error(res?.data?.error || 'Erro ao duplicar');
      }
    } catch (e) {
      toast.error('Erro ao duplicar: ' + (e.message || ''));
    } finally {
      setDupId(null);
    }
  };

  const handleDelete = async (t) => {
    if (!confirm(`Excluir o rascunho "${t.name}"? Esta ação não pode ser desfeita.`)) return;
    setDelId(t.id);
    try {
      const res = await base44.functions.invoke('gerenciarTemplateMetaOficial', {
        action: 'delete_draft',
        template_id: t.id,
      });
      if (res?.data?.success) {
        toast.success('Rascunho excluído');
        onRefresh();
      } else {
        toast.error(res?.data?.error || 'Erro ao excluir');
      }
    } catch (e) {
      toast.error('Erro ao excluir: ' + (e.message || ''));
    } finally {
      setDelId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {FILTROS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFiltro(f.value)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                filtro === f.value
                  ? 'bg-[#10353C] text-white border-[#10353C]'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={onRefresh}
          className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-200 hover:bg-slate-50"
        >
          <RefreshCw className="w-3 h-3" /> Atualizar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">
          Nenhum template encontrado.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs">
              <tr>
                <th className="text-left px-3 py-2">Nome</th>
                <th className="text-left px-3 py-2">Categoria</th>
                <th className="text-left px-3 py-2">Idioma</th>
                <th className="text-left px-3 py-2">Tipo</th>
                <th className="text-left px-3 py-2">Conexão</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Criado em</th>
                <th className="text-right px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtrados.map((t) => {
                const st = STATUS_META[t.status] || STATUS_META.rascunho;
                const idioma = IDIOMAS.find((i) => i.value === t.language);
                const tipo = TIPOS.find((i) => i.value === t.type);
                const cat = CATEGORIAS.find((c) => c.value === t.category);
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{t.display_name || t.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{t.name}</div>
                      {t.rejection_reason && (
                        <div className="text-[10px] text-red-600 mt-1 italic">Rejeição: {t.rejection_reason?.slice(0, 100)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{cat?.label || t.category}</td>
                    <td className="px-3 py-2 text-slate-700">{idioma?.label || t.language}</td>
                    <td className="px-3 py-2 text-slate-700">{tipo?.label || t.type}</td>
                    <td className="px-3 py-2 text-slate-700 text-xs">{t.connection_nome || '-'}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-medium ${st.class}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[10px] text-slate-500">
                      {new Date(t.created_date || t.submitted_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => onEdit(t)}
                          title="Visualizar / Editar"
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {t.meta_template_id && (
                          <button
                            onClick={() => handleSync(t)}
                            disabled={syncingId === t.id}
                            title="Atualizar status"
                            className="p-1.5 rounded hover:bg-slate-100 text-blue-600 disabled:opacity-50"
                          >
                            {syncingId === t.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handleDuplicate(t)}
                          disabled={dupId === t.id}
                          title="Duplicar"
                          className="p-1.5 rounded hover:bg-slate-100 text-emerald-600 disabled:opacity-50"
                        >
                          {dupId === t.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        {(t.status === 'rascunho' || t.status === 'erro_envio') && (
                          <button
                            onClick={() => handleDelete(t)}
                            disabled={delId === t.id}
                            title="Excluir rascunho"
                            className="p-1.5 rounded hover:bg-slate-100 text-red-600 disabled:opacity-50"
                          >
                            {delId === t.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}