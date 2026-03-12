import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Star, Pencil, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const STATUS_PADRAO = [
  { slug: 'a_fazer', nome: 'A Fazer', cor: '#f59e0b', ordem: 1 },
  { slug: 'aguardando_documentacao', nome: 'Aguardando Documentação', cor: '#3b82f6', ordem: 2 },
  { slug: 'em_analise', nome: 'Em Análise', cor: '#8b5cf6', ordem: 3 },
  { slug: 'retornado_pendencia', nome: 'Retornado com Pendência', cor: '#f97316', ordem: 4 },
  { slug: 'concluido', nome: 'Concluído', cor: '#22c55e', ordem: 5 },
  { slug: 'arquivado', nome: 'Arquivado', cor: '#94a3b8', ordem: 6 },
];

export default function ConfiguracaoTarefas() {
  const [currentUser, setCurrentUser] = useState(null);
  const [novoStatus, setNovoStatus] = useState({ nome: '', cor: '#3b82f6' });
  const [editStatus, setEditStatus] = useState(null);
  const [novoTemplate, setNovoTemplate] = useState({ nome: '', itens: '', favorito: false });
  const [editTemplate, setEditTemplate] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      if (!me) return;
      if (me.role === 'super_admin') { setCurrentUser({ ...me, perfil: 'super_admin', empresa_id: null }); return; }
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      if (colabs.length > 0) setCurrentUser({ ...me, ...colabs[0], colaborador_id: colabs[0].id });
    } catch {}
  };

  const empresaId = currentUser?.empresa_id;

  const { data: statusList = [] } = useQuery({
    queryKey: ['status-tarefa', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.StatusTarefa.filter({ empresa_id: empresaId }),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['checklist-templates', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.ChecklistTemplate.filter({ empresa_id: empresaId }),
  });

  const criarStatus = useMutation({
    mutationFn: (data) => base44.entities.StatusTarefa.create({ ...data, empresa_id: empresaId, ativo: true, slug: data.nome.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['status-tarefa'] }); setNovoStatus({ nome: '', cor: '#3b82f6' }); toast.success('Status criado!'); },
  });

  const atualizarStatus = useMutation({
    mutationFn: ({ id, data }) => base44.entities.StatusTarefa.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['status-tarefa'] }); setEditStatus(null); toast.success('Status atualizado!'); },
  });

  const excluirStatus = useMutation({
    mutationFn: (id) => base44.entities.StatusTarefa.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['status-tarefa'] }); toast.success('Status excluído!'); },
  });

  const criarTemplate = useMutation({
    mutationFn: (data) => base44.entities.ChecklistTemplate.create({ ...data, empresa_id: empresaId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['checklist-templates'] }); setNovoTemplate({ nome: '', itens: '', favorito: false }); toast.success('Template criado!'); },
  });

  const atualizarTemplate = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ChecklistTemplate.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['checklist-templates'] }); setEditTemplate(null); toast.success('Template atualizado!'); },
  });

  const excluirTemplate = useMutation({
    mutationFn: (id) => base44.entities.ChecklistTemplate.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['checklist-templates'] }); toast.success('Template excluído!'); },
  });

  const toggleFavorito = (t) => atualizarTemplate.mutate({ id: t.id, data: { favorito: !t.favorito } });

  if (!currentUser) return <div className="flex items-center justify-center min-h-[200px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]"></div></div>;

  const statusExibidos = statusList.length > 0
    ? [...statusList].filter(s => s != null && s.nome != null).sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
    : STATUS_PADRAO;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title="Configuração de Tarefas" subtitle="Gerencie status e templates de checklist">
        <Link to={createPageUrl('Tarefas')}>
          <Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" />Voltar</Button>
        </Link>
      </PageHeader>

      {/* Status */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Status das Tarefas</h2>
        <div className="space-y-2 mb-4">
          {statusExibidos.map(s => (
            <div key={s.slug || s.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: s.cor || '#3b82f6' }} />
              {editStatus?.id === s.id ? (
                <>
                  <Input value={editStatus.nome} onChange={e => setEditStatus({ ...editStatus, nome: e.target.value })} className="flex-1 h-8" />
                  <input type="color" value={editStatus.cor} onChange={e => setEditStatus({ ...editStatus, cor: e.target.value })} className="h-8 w-12 rounded border cursor-pointer" />
                  <Button size="sm" onClick={() => atualizarStatus.mutate({ id: editStatus.id, data: { nome: editStatus.nome, cor: editStatus.cor } })} className="bg-[#1e3a5f] hover:bg-[#2a4a73]">Salvar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditStatus(null)}>Cancelar</Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium">{s.nome ?? ''}</span>
                  {s.e_padrao && <Badge variant="outline" className="text-xs">Padrão</Badge>}
                  {s.id && (
                    <>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditStatus(s)}><Pencil className="w-3 h-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => { if (confirm('Excluir status?')) excluirStatus.mutate(s.id); }}><Trash2 className="w-3 h-3" /></Button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label className="text-xs mb-1 block">Nome do novo status</Label>
            <Input value={novoStatus.nome} onChange={e => setNovoStatus({ ...novoStatus, nome: e.target.value })} placeholder="Ex: Em aprovação" />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Cor</Label>
            <input type="color" value={novoStatus.cor} onChange={e => setNovoStatus({ ...novoStatus, cor: e.target.value })} className="h-9 w-16 rounded border cursor-pointer" />
          </div>
          <Button onClick={() => { if (!novoStatus.nome.trim()) return toast.error('Informe o nome'); criarStatus.mutate(novoStatus); }} disabled={criarStatus.isPending} className="bg-[#1e3a5f] hover:bg-[#2a4a73]">
            <Plus className="w-4 h-4 mr-1" /> Adicionar
          </Button>
        </div>
      </Card>

      {/* Templates de Checklist */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Templates de Checklist</h2>
        <div className="space-y-3 mb-4">
          {templates.length === 0 && <p className="text-sm text-slate-400">Nenhum template criado ainda.</p>}
          {templates.filter(t => t != null && t.nome != null).map(t => {
            let itens = [];
            try { itens = t.itens ? JSON.parse(t.itens) : []; } catch { itens = []; }
            return (
              <div key={t.id} className="p-3 bg-slate-50 rounded-lg border">
                {editTemplate?.id === t.id ? (
                  <div className="space-y-2">
                    <Input value={editTemplate.nome} onChange={e => setEditTemplate({ ...editTemplate, nome: e.target.value })} placeholder="Nome do template" />
                    <div className="text-xs text-slate-500 mb-1">Itens (um por linha):</div>
                    <textarea
                      className="w-full border rounded p-2 text-sm h-24 resize-none"
                      value={editTemplate.itensTexto}
                      onChange={e => setEditTemplate({ ...editTemplate, itensTexto: e.target.value })}
                    />
                    <div className="flex items-center gap-2">
                      <Checkbox id={`fav-${t.id}`} checked={editTemplate.favorito} onCheckedChange={v => setEditTemplate({ ...editTemplate, favorito: !!v })} />
                      <Label htmlFor={`fav-${t.id}`} className="text-sm cursor-pointer flex items-center gap-1"><Star className="w-3 h-3" /> Favorito (acesso rápido)</Label>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => atualizarTemplate.mutate({ id: t.id, data: { nome: editTemplate.nome, favorito: editTemplate.favorito, itens: JSON.stringify(editTemplate.itensTexto.split('\n').filter(x => x.trim())) } })} className="bg-[#1e3a5f] hover:bg-[#2a4a73]">Salvar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditTemplate(null)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{t.nome}</span>
                        {t.favorito && <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" title="Favorito" />}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {itens.slice(0, 5).map((item, i) => <Badge key={i} variant="outline" className="text-xs">{item}</Badge>)}
                        {itens.length > 5 && <Badge variant="outline" className="text-xs">+{itens.length - 5}</Badge>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleFavorito(t)} title={t.favorito ? 'Remover favorito' : 'Marcar favorito'}><Star className={`w-3 h-3 ${t.favorito ? 'fill-yellow-400 text-yellow-400' : ''}`} /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditTemplate({ ...t, itensTexto: itens.join('\n') })}><Pencil className="w-3 h-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => { if (confirm('Excluir template?')) excluirTemplate.mutate(t.id); }}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-2 border rounded-lg p-4 bg-slate-50">
          <h3 className="text-sm font-medium">Novo Template</h3>
          <Input value={novoTemplate.nome} onChange={e => setNovoTemplate({ ...novoTemplate, nome: e.target.value })} placeholder="Nome do template (Ex: Documentos INSS)" />
          <div>
            <Label className="text-xs mb-1 block">Itens do checklist (um por linha)</Label>
            <textarea
              className="w-full border rounded p-2 text-sm h-24 resize-none bg-white"
              value={novoTemplate.itens}
              onChange={e => setNovoTemplate({ ...novoTemplate, itens: e.target.value })}
              placeholder={"RG\nCPF\nComprovante de residência\nExtrato bancário"}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="fav-novo" checked={novoTemplate.favorito} onCheckedChange={v => setNovoTemplate({ ...novoTemplate, favorito: !!v })} />
            <Label htmlFor="fav-novo" className="text-sm cursor-pointer flex items-center gap-1"><Star className="w-3 h-3" /> Marcar como favorito (acesso rápido)</Label>
          </div>
          <Button
            onClick={() => {
              if (!novoTemplate.nome.trim()) return toast.error('Informe o nome');
              const itens = novoTemplate.itens.split('\n').filter(x => x.trim());
              if (itens.length === 0) return toast.error('Adicione ao menos um item');
              criarTemplate.mutate({ nome: novoTemplate.nome.trim(), itens: JSON.stringify(itens), favorito: novoTemplate.favorito });
            }}
            disabled={criarTemplate.isPending}
            className="bg-[#1e3a5f] hover:bg-[#2a4a73]"
          >
            <Plus className="w-4 h-4 mr-1" /> Criar Template
          </Button>
        </div>
      </Card>
    </div>
  );
}