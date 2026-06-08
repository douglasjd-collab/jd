import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Edit2, Trash2, Layers, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const DEFAULTS = [
  'Consórcio','Financiamento','Empréstimo Consignado','Proteção Veicular',
  'Seguros','Microcrédito','Marketing','Administrativo','Operacional','Tecnologia'
];

const EMPTY = { nome: '', descricao: '', tipo: 'ambos', ativo: true };

export default function CentrosCusto() {
  const [user, setUser] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const qc = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(async (me) => {
      if (me.role === 'super_admin') {
        setUser({ ...me, perfil: 'super_admin', empresa_id: null });
      } else {
        const colabs = await base44.entities.Colaborador.filter({ user_id: me.id });
        const c = colabs[0];
        setUser({ ...me, perfil: c?.perfil, empresa_id: c?.empresa_id });
      }
    });
  }, []);

  const { data: lista = [], isLoading } = useQuery({
    queryKey: ['centros-custo', user?.empresa_id],
    queryFn: () => base44.entities.CentroCusto.filter(user?.empresa_id ? { empresa_id: user.empresa_id } : {}, 'nome'),
    enabled: !!user,
  });

  const upsert = useMutation({
    mutationFn: d => editando ? base44.entities.CentroCusto.update(editando.id, d) : base44.entities.CentroCusto.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['centros-custo'] }); toast.success('Salvo!'); setModalOpen(false); },
    onError: e => toast.error(e.message),
  });

  const deletar = useMutation({
    mutationFn: id => base44.entities.CentroCusto.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['centros-custo'] }),
  });

  const abrir = (item = null) => {
    setEditando(item);
    setForm(item ? { ...item } : { ...EMPTY, empresa_id: user?.empresa_id });
    setModalOpen(true);
  };

  const criarDefaults = async () => {
    for (const nome of DEFAULTS) {
      if (!lista.find(c => c.nome === nome)) {
        await base44.entities.CentroCusto.create({ empresa_id: user.empresa_id, nome, tipo: 'ambos', ativo: true });
      }
    }
    qc.invalidateQueries({ queryKey: ['centros-custo'] });
    toast.success('Centros de custo padrão criados!');
  };

  const isAdmin = ['super_admin', 'master', 'admin'].includes(user?.perfil);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  if (!user) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-slate-400"/></div>;

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Layers className="w-6 h-6 text-blue-600"/> Centros de Custo</h1>
          <p className="text-slate-500 text-sm">Categorize e controle seus custos por área</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            {lista.length === 0 && <Button variant="outline" onClick={criarDefaults}>Criar padrões</Button>}
            <Button className="bg-blue-600 hover:bg-blue-700 gap-1" onClick={() => abrir()}><Plus className="w-4 h-4"/> Novo</Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-slate-400"/></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {lista.map(c => (
            <Card key={c.id} className={`p-4 flex items-center justify-between ${!c.ativo ? 'opacity-50' : ''}`}>
              <div>
                <p className="font-semibold text-slate-800">{c.nome}</p>
                <div className="flex gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.tipo === 'receita' ? 'bg-green-100 text-green-700' : c.tipo === 'despesa' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{c.tipo}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.ativo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{c.ativo ? 'ativo' : 'inativo'}</span>
                </div>
              </div>
              {isAdmin && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => abrir(c)}><Edit2 className="w-3.5 h-3.5"/></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => confirm('Excluir?') && deletar.mutate(c.id)}><Trash2 className="w-3.5 h-3.5"/></Button>
                </div>
              )}
            </Card>
          ))}
          {lista.length === 0 && (
            <div className="col-span-3 text-center py-12 text-slate-400">
              <Layers className="w-10 h-10 mx-auto mb-2 text-slate-300"/>
              Nenhum centro de custo cadastrado.
            </div>
          )}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editando ? 'Editar' : 'Novo'} Centro de Custo</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={e => set('nome', e.target.value)} className="mt-1"/>
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={form.descricao || ''} onChange={e => set('descricao', e.target.value)} className="mt-1"/>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => set('tipo', v)}>
                <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ambos">Receita e Despesa</SelectItem>
                  <SelectItem value="receita">Só Receita</SelectItem>
                  <SelectItem value="despesa">Só Despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.ativo} onCheckedChange={v => set('ativo', v)}/>
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => { if (!form.nome) { toast.error('Informe o nome'); return; } upsert.mutate(form); }} disabled={upsert.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}