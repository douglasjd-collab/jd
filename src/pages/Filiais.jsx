import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Edit2, Trash2, Building2, Phone, Mail, MapPin, Target, User } from 'lucide-react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const EMPTY = {
  empresa_id: '', empresa_nome: '', nome: '', codigo: '', situacao: 'ativa',
  telefone: '', whatsapp: '', email: '',
  cep: '', rua: '', numero: '', bairro: '', cidade: '', estado: '',
  meta_mensal: '', meta_anual: '',
  gerente_id: '', gerente_nome: '', supervisor_id: '', supervisor_nome: '',
};

const BRL = v => v ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-';

export default function Filiais() {
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(async (me) => {
      if (me.role === 'super_admin') {
        setUser({ ...me, perfil: 'super_admin', empresa_id: null });
      } else {
        const colabs = await base44.entities.Colaborador.filter({ user_id: me.id });
        const colab = colabs[0];
        setUser({ ...me, perfil: colab?.perfil || 'vendedor', empresa_id: colab?.empresa_id });
      }
    });
  }, []);

  const { data: filiais = [], isLoading } = useQuery({
    queryKey: ['filiais', user?.empresa_id],
    queryFn: () => base44.entities.Filial.filter(user?.empresa_id ? { empresa_id: user.empresa_id } : {}, 'nome', 500),
    enabled: !!user,
  });

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas-filiais'],
    queryFn: () => base44.entities.Empresa.list('nome', 200),
    enabled: ['super_admin', 'master'].includes(user?.perfil),
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colab-filiais', user?.empresa_id],
    queryFn: () => base44.entities.Colaborador.filter(
      user?.empresa_id ? { empresa_id: user.empresa_id, status: 'ativo' } : { status: 'ativo' }
    ),
    enabled: !!user,
  });

  const upsert = useMutation({
    mutationFn: (data) => editando
      ? base44.entities.Filial.update(editando.id, data)
      : base44.entities.Filial.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['filiais'] });
      toast.success(editando ? 'Filial atualizada!' : 'Filial criada!');
      setModalOpen(false);
    },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  const deletar = useMutation({
    mutationFn: id => base44.entities.Filial.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['filiais'] });
      toast.success('Filial excluída!');
    },
  });

  const abrir = (filial = null) => {
    setEditando(filial);
    setForm(filial ? { ...filial } : { ...EMPTY, empresa_id: user?.empresa_id || '' });
    setModalOpen(true);
  };

  const salvar = () => {
    if (!form.empresa_id || !form.nome || !form.codigo) {
      toast.error('Preencha Empresa, Nome e Código');
      return;
    }
    const emp = empresas.find(e => e.id === form.empresa_id);
    upsert.mutate({ ...form, empresa_nome: emp?.nome || form.empresa_nome, meta_mensal: Number(form.meta_mensal) || 0, meta_anual: Number(form.meta_anual) || 0 });
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const filtradas = useMemo(() =>
    filiais.filter(f => !search || f.nome.toLowerCase().includes(search.toLowerCase()) || f.codigo.toLowerCase().includes(search.toLowerCase()) || (f.cidade || '').toLowerCase().includes(search.toLowerCase())),
    [filiais, search]);

  const isAdmin = ['super_admin', 'master', 'admin'].includes(user?.perfil);

  if (!user) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-slate-400"/></div>;

  return (
    <div className="p-4 lg:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-7 h-7 text-blue-600"/> Filiais
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Gerencie as filiais do grupo</p>
        </div>
        {isAdmin && (
          <Button onClick={() => abrir()} className="bg-blue-600 hover:bg-blue-700 gap-1">
            <Plus className="w-4 h-4"/> Nova Filial
          </Button>
        )}
      </div>

      {/* Busca + stats */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
          <Input placeholder="Buscar filial..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10"/>
        </div>
        <div className="flex gap-2">
          <span className="text-sm px-3 py-1.5 bg-green-100 text-green-700 rounded-full font-medium">
            {filiais.filter(f => f.situacao === 'ativa').length} ativas
          </span>
          <span className="text-sm px-3 py-1.5 bg-slate-100 text-slate-600 rounded-full font-medium">
            {filiais.filter(f => f.situacao !== 'ativa').length} inativas
          </span>
        </div>
      </div>

      {/* Grid de filiais */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-slate-400"/></div>
      ) : filtradas.length === 0 ? (
        <Card className="p-12 text-center">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3"/>
          <p className="text-slate-400">Nenhuma filial encontrada</p>
          {isAdmin && <Button className="mt-3 bg-blue-600 hover:bg-blue-700" onClick={() => abrir()}>Criar primeira filial</Button>}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtradas.map(f => (
            <Card key={f.id} className={`p-5 hover:shadow-md transition-shadow ${f.situacao === 'inativa' ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-800">{f.nome}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.situacao === 'ativa' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {f.situacao}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">Cód: {f.codigo} {f.empresa_nome && `| ${f.empresa_nome}`}</p>
                </div>
                {isAdmin && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => abrir(f)}><Edit2 className="w-3.5 h-3.5"/></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => confirm('Excluir filial?') && deletar.mutate(f.id)}><Trash2 className="w-3.5 h-3.5"/></Button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5 text-xs text-slate-500">
                {(f.cidade || f.estado) && (
                  <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 flex-shrink-0"/>{[f.cidade, f.estado].filter(Boolean).join(' - ')}</div>
                )}
                {f.telefone && <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 flex-shrink-0"/>{f.telefone}</div>}
                {f.email && <div className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 flex-shrink-0"/>{f.email}</div>}
                {f.gerente_nome && <div className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 flex-shrink-0"/>Gerente: {f.gerente_nome}</div>}
              </div>

              {(f.meta_mensal > 0 || f.meta_anual > 0) && (
                <div className="mt-3 pt-3 border-t flex gap-3">
                  {f.meta_mensal > 0 && (
                    <div className="flex items-center gap-1 text-xs"><Target className="w-3 h-3 text-blue-500"/><span className="text-slate-500">Mensal:</span><span className="font-semibold text-blue-600">{BRL(f.meta_mensal)}</span></div>
                  )}
                  {f.meta_anual > 0 && (
                    <div className="flex items-center gap-1 text-xs"><Target className="w-3 h-3 text-purple-500"/><span className="text-slate-500">Anual:</span><span className="font-semibold text-purple-600">{BRL(f.meta_anual)}</span></div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Filial' : 'Nova Filial'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* DADOS BÁSICOS */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Dados Básicos</h4>
              <div className="grid grid-cols-2 gap-3">
                {['super_admin', 'master'].includes(user?.perfil) ? (
                  <div className="col-span-2">
                    <Label>Empresa *</Label>
                    <Select value={form.empresa_id} onValueChange={v => set('empresa_id', v)}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione"/></SelectTrigger>
                      <SelectContent>
                        {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <div>
                  <Label>Nome da Filial *</Label>
                  <Input value={form.nome} onChange={e => set('nome', e.target.value)} className="mt-1" placeholder="Ex: Filial Águas Belas"/>
                </div>
                <div>
                  <Label>Código *</Label>
                  <Input value={form.codigo} onChange={e => set('codigo', e.target.value)} className="mt-1" placeholder="Ex: FAB01"/>
                </div>
                <div>
                  <Label>Situação</Label>
                  <Select value={form.situacao} onValueChange={v => set('situacao', v)}>
                    <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativa">Ativa</SelectItem>
                      <SelectItem value="inativa">Inativa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* CONTATO */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Contato</h4>
              <div className="grid grid-cols-3 gap-3">
                {[['Telefone', 'telefone'], ['WhatsApp', 'whatsapp'], ['E-mail', 'email']].map(([label, key]) => (
                  <div key={key}>
                    <Label>{label}</Label>
                    <Input value={form[key]} onChange={e => set(key, e.target.value)} className="mt-1"/>
                  </div>
                ))}
              </div>
            </div>

            {/* ENDEREÇO */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Endereço</h4>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <Label>CEP</Label>
                  <Input value={form.cep} onChange={e => set('cep', e.target.value)} className="mt-1"/>
                </div>
                <div className="col-span-2">
                  <Label>Rua</Label>
                  <Input value={form.rua} onChange={e => set('rua', e.target.value)} className="mt-1"/>
                </div>
                <div>
                  <Label>Número</Label>
                  <Input value={form.numero} onChange={e => set('numero', e.target.value)} className="mt-1"/>
                </div>
                <div>
                  <Label>Bairro</Label>
                  <Input value={form.bairro} onChange={e => set('bairro', e.target.value)} className="mt-1"/>
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input value={form.cidade} onChange={e => set('cidade', e.target.value)} className="mt-1"/>
                </div>
                <div>
                  <Label>Estado</Label>
                  <Input value={form.estado} onChange={e => set('estado', e.target.value)} maxLength={2} className="mt-1"/>
                </div>
              </div>
            </div>

            {/* METAS */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Metas</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Meta Mensal (R$)</Label>
                  <Input type="number" value={form.meta_mensal} onChange={e => set('meta_mensal', e.target.value)} className="mt-1"/>
                </div>
                <div>
                  <Label>Meta Anual (R$)</Label>
                  <Input type="number" value={form.meta_anual} onChange={e => set('meta_anual', e.target.value)} className="mt-1"/>
                </div>
              </div>
            </div>

            {/* GESTÃO */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Gestão</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Gerente (Opcional)</Label>
                  <Select value={form.gerente_id || 'none'} onValueChange={v => {
                    const c = colaboradores.find(c => c.id === v);
                    set('gerente_id', v === 'none' ? '' : v);
                    set('gerente_nome', c?.nome || '');
                  }}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Supervisor (Opcional)</Label>
                  <Select value={form.supervisor_id || 'none'} onValueChange={v => {
                    const c = colaboradores.find(c => c.id === v);
                    set('supervisor_id', v === 'none' ? '' : v);
                    set('supervisor_nome', c?.nome || '');
                  }}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={salvar} disabled={upsert.isPending}>
              {upsert.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1"/> : null}
              {editando ? 'Salvar Alterações' : 'Criar Filial'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}