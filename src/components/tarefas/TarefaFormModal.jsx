import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Star, X } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
}

export default function TarefaFormModal({ open, onOpenChange, tarefa, onSave, colaboradores, clientes, statusList, templates, currentUser, onSaveTemplate }) {
  const [form, setForm] = useState({});
  const [checklist, setChecklist] = useState([]);
  const [novoItem, setNovoItem] = useState('');
  const [responsaveisSel, setResponsaveisSel] = useState([]);
  const [nomeTemplate, setNomeTemplate] = useState('');
  const [salvarTemplate, setSalvarTemplate] = useState(false);
  const [templateFavorito, setTemplateFavorito] = useState(false);

  useEffect(() => {
    if (open) {
      if (tarefa) {
        setForm({
          titulo: tarefa.titulo || '',
          descricao: tarefa.descricao || '',
          cliente_id: tarefa.cliente_id || '',
          cliente_nome: tarefa.cliente_nome || '',
          data_cadastro: tarefa.data_cadastro || format(new Date(), 'yyyy-MM-dd'),
          data_conclusao_prevista: tarefa.data_conclusao_prevista || '',
          status: tarefa.status || 'a_fazer',
          prioridade: tarefa.prioridade || 'media',
        });
        try { setChecklist(tarefa.checklist ? JSON.parse(tarefa.checklist) : []); } catch { setChecklist([]); }
        try { setResponsaveisSel(tarefa.responsaveis_ids ? JSON.parse(tarefa.responsaveis_ids) : []); } catch { setResponsaveisSel([]); }
      } else {
        setForm({
          titulo: '', descricao: '', cliente_id: '', cliente_nome: '',
          data_cadastro: format(new Date(), 'yyyy-MM-dd'),
          data_conclusao_prevista: '', status: statusList?.[0]?.slug || 'a_fazer', prioridade: 'media',
        });
        setChecklist([]);
        setResponsaveisSel(currentUser ? [currentUser.id] : []);
      }
      setSalvarTemplate(false);
      setNomeTemplate('');
      setTemplateFavorito(false);
    }
  }, [open, tarefa]);

  const toggleResponsavel = (id) => {
    setResponsaveisSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const adicionarItem = () => {
    if (!novoItem.trim()) return;
    setChecklist(prev => [...prev, { id: Date.now().toString(), texto: novoItem.trim(), checked: false }]);
    setNovoItem('');
  };

  const aplicarTemplate = (template) => {
    try {
      const itens = JSON.parse(template.itens);
      setChecklist(itens.map((texto, i) => ({ id: Date.now().toString() + i, texto, checked: false })));
      toast.success(`Template "${template.nome}" aplicado!`);
    } catch {}
  };

  const handleSave = () => {
    if (!form.titulo?.trim()) { toast.error('Informe o título da tarefa'); return; }
    if (!form.data_conclusao_prevista) { toast.error('Informe a data de conclusão'); return; }
    if (responsaveisSel.length === 0) { toast.error('Selecione ao menos um responsável'); return; }

    const responsaveisData = responsaveisSel.map(id => {
      const c = colaboradores.find(x => x.id === id);
      return { id, nome: c?.nome || c?.full_name || '', foto: c?.foto_perfil || '' };
    });

    const cliente = clientes.find(c => c.id === form.cliente_id);

    const data = {
      ...form,
      cliente_nome: cliente?.nome_completo || cliente?.pj_razao_social || form.cliente_nome || '',
      checklist: JSON.stringify(checklist),
      responsaveis_ids: JSON.stringify(responsaveisSel),
      responsaveis_nomes: JSON.stringify(responsaveisData.map(r => r.nome)),
      responsaveis_fotos: JSON.stringify(responsaveisData.map(r => r.foto)),
    };

    if (salvarTemplate && nomeTemplate.trim() && checklist.length > 0) {
      onSaveTemplate?.({
        nome: nomeTemplate.trim(),
        itens: JSON.stringify(checklist.map(i => i.texto)),
        favorito: templateFavorito,
      });
    }

    onSave(data, tarefa?.id);
  };

  const favoriteTemplates = templates?.filter(t => t.favorito) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tarefa ? 'Editar Tarefa' : 'Nova Tarefa'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Templates favoritos */}
          {!tarefa && favoriteTemplates.length > 0 && (
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Checklist rápido (favoritos)</Label>
              <div className="flex flex-wrap gap-2">
                {favoriteTemplates.map(t => (
                  <button key={t.id} onClick={() => aplicarTemplate(t)}
                    className="flex items-center gap-1 px-3 py-1 bg-yellow-50 border border-yellow-300 rounded-full text-xs text-yellow-800 hover:bg-yellow-100 transition-colors">
                    <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> {t.nome}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label>Título *</Label>
            <Input value={form.titulo || ''} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Título da tarefa" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Cliente</Label>
              <Select value={form.cliente_id || ''} onValueChange={v => setForm({ ...form, cliente_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Nenhum</SelectItem>
                  {clientes.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome_completo || c.pj_razao_social}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={form.prioridade || 'media'} onValueChange={v => setForm({ ...form, prioridade: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alta">🔴 Alta</SelectItem>
                  <SelectItem value="media">🟡 Média</SelectItem>
                  <SelectItem value="baixa">🟢 Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data de Cadastro</Label>
              <Input type="date" value={form.data_cadastro || ''} onChange={e => setForm({ ...form, data_cadastro: e.target.value })} />
            </div>
            <div>
              <Label>Data de Conclusão *</Label>
              <Input type="date" value={form.data_conclusao_prevista || ''} onChange={e => setForm({ ...form, data_conclusao_prevista: e.target.value })} />
            </div>
          </div>

          <div>
            <Label>Status</Label>
            <Select value={form.status || ''} onValueChange={v => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {statusList.map(s => (
                  <SelectItem key={s.slug} value={s.slug}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea value={form.descricao || ''} onChange={e => setForm({ ...form, descricao: e.target.value })} rows={2} placeholder="Descrição adicional..." />
          </div>

          {/* Responsáveis */}
          <div>
            <Label className="mb-2 block">Responsáveis * <span className="text-xs text-slate-400">(apenas mencionados têm acesso)</span></Label>
            <div className="border rounded-lg p-2 max-h-48 overflow-y-auto space-y-1">
              {colaboradores.map(c => (
                <div key={c.id}
                  onClick={() => toggleResponsavel(c.id)}
                  className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${responsaveisSel.includes(c.id) ? 'bg-blue-50 border border-blue-300' : 'hover:bg-slate-50'}`}
                >
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={c.foto_perfil} />
                    <AvatarFallback className="text-xs">{getInitials(c.nome || c.full_name || '')}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{c.nome || c.full_name}</p>
                    <p className="text-xs text-slate-400 capitalize">{c.perfil}</p>
                  </div>
                  {responsaveisSel.includes(c.id) && <div className="h-4 w-4 bg-blue-600 rounded-full flex items-center justify-center"><span className="text-white text-xs">✓</span></div>}
                </div>
              ))}
            </div>
          </div>

          {/* Checklist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Checklist</Label>
              {templates?.length > 0 && (
                <Select onValueChange={v => { const t = templates.find(x => x.id === v); if (t) aplicarTemplate(t); }}>
                  <SelectTrigger className="w-48 h-7 text-xs"><SelectValue placeholder="Usar template..." /></SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.favorito && <Star className="w-3 h-3 inline mr-1 fill-yellow-400 text-yellow-400" />}{t.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2 mb-2">
              {checklist.map(item => (
                <div key={item.id} className="flex items-center gap-2">
                  <Checkbox checked={item.checked} onCheckedChange={v => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, checked: !!v } : i))} />
                  <span className={`text-sm flex-1 ${item.checked ? 'line-through text-slate-400' : ''}`}>{item.texto}</span>
                  <button onClick={() => setChecklist(prev => prev.filter(i => i.id !== item.id))} className="text-slate-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={novoItem} onChange={e => setNovoItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && adicionarItem()} placeholder="Novo item (ex: RG, Comprovante de endereço...)" className="flex-1" />
              <Button variant="outline" size="sm" onClick={adicionarItem}><Plus className="w-4 h-4" /></Button>
            </div>

            {/* Salvar como template */}
            {checklist.length > 0 && (
              <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox id="salvar-tmpl" checked={salvarTemplate} onCheckedChange={setSalvarTemplate} />
                  <Label htmlFor="salvar-tmpl" className="text-sm cursor-pointer">Salvar este checklist como template</Label>
                </div>
                {salvarTemplate && (
                  <div className="flex items-center gap-2">
                    <Input value={nomeTemplate} onChange={e => setNomeTemplate(e.target.value)} placeholder="Nome do template" className="flex-1" />
                    <div className="flex items-center gap-1">
                      <Checkbox id="fav-tmpl" checked={templateFavorito} onCheckedChange={setTemplateFavorito} />
                      <Label htmlFor="fav-tmpl" className="text-xs cursor-pointer flex items-center gap-1"><Star className="w-3 h-3" /> Favorito</Label>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="bg-[#1e3a5f] hover:bg-[#2a4a73]">
              {tarefa ? 'Salvar' : 'Criar Tarefa'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}