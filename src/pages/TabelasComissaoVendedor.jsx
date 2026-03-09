import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';

const EMPTY_FORM = {
  nome: '',
  descricao: '',
  percentual: '',
  ativo: true,
};

export default function TabelasComissaoVendedor() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [tabelas, setTabelas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => { init(); }, []);

  const init = async () => {
    setLoading(true);
    const me = await base44.auth.me();
    setUser(me);
    let eid = null;
    if (me.perfil === 'super_admin' || me.role === 'super_admin') {
      const empresas = await base44.entities.Empresa.filter({ status: 'ativa' });
      if (empresas.length > 0) eid = empresas[0].id;
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      if (colabs.length > 0) eid = colabs[0].empresa_id;
    }
    setEmpresaId(eid);
    if (eid) {
      const lista = await base44.entities.TabelaComissaoEmprestimo.filter({ empresa_id: eid });
      setTabelas(lista);
    }
    setLoading(false);
  };

  const abrirNovo = () => {
    setEditando(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const abrirEditar = (tabela) => {
    setEditando(tabela);
    setForm({
      nome: tabela.nome || '',
      descricao: tabela.descricao || '',
      percentual: tabela.percentual != null ? String(tabela.percentual) : '',
      ativo: tabela.ativo !== false,
    });
    setModalOpen(true);
  };

  const handleSalvar = async () => {
    if (!form.nome.trim()) { toast.error('Informe o nome da tabela'); return; }
    setSaving(true);
    const dados = {
      empresa_id: empresaId,
      nome: form.nome,
      descricao: form.descricao,
      percentual: form.percentual !== '' ? parseFloat(form.percentual) : null,
      ativo: form.ativo,
    };
    if (editando) {
      await base44.entities.TabelaComissaoEmprestimo.update(editando.id, dados);
      toast.success('Tabela atualizada!');
    } else {
      await base44.entities.TabelaComissaoEmprestimo.create(dados);
      toast.success('Tabela criada!');
    }
    const lista = await base44.entities.TabelaComissaoEmprestimo.filter({ empresa_id: empresaId });
    setTabelas(lista);
    setModalOpen(false);
    setSaving(false);
  };

  const handleExcluir = async (id) => {
    if (!window.confirm('Excluir esta tabela?')) return;
    await base44.entities.TabelaComissaoEmprestimo.delete(id);
    setTabelas(prev => prev.filter(t => t.id !== id));
    toast.success('Tabela excluída!');
  };

  const filtradas = tabelas.filter(t =>
    !search || t.nome?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tabela de Comissão Vendedor</h1>
          <p className="text-sm text-slate-500 mt-1">Gerencie as tabelas de comissão para vendedores</p>
        </div>
        <Button onClick={abrirNovo} className="bg-green-600 hover:bg-green-700 gap-2">
          <Plus className="w-4 h-4" /> Nova Tabela
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="Buscar tabela..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filtradas.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-slate-400">
            Nenhuma tabela encontrada. Clique em "Nova Tabela" para começar.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtradas.map(tabela => (
            <Card key={tabela.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{tabela.nome}</CardTitle>
                  <Badge variant={tabela.ativo !== false ? 'default' : 'secondary'}>
                    {tabela.ativo !== false ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {tabela.descricao && (
                  <p className="text-sm text-slate-500">{tabela.descricao}</p>
                )}
                {tabela.percentual != null && (
                  <p className="text-sm font-medium text-slate-700">
                    Percentual: <span className="text-blue-600">{tabela.percentual}%</span>
                  </p>
                )}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => abrirEditar(tabela)} className="gap-1">
                    <Pencil className="w-3 h-3" /> Editar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleExcluir(tabela.id)} className="gap-1 text-red-600 border-red-200 hover:bg-red-50">
                    <Trash2 className="w-3 h-3" /> Excluir
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Tabela' : 'Nova Tabela de Comissão Vendedor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Nome *</Label>
              <Input
                className="mt-1"
                value={form.nome}
                onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                placeholder="Ex: Tabela Bronze, Tabela Ouro..."
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input
                className="mt-1"
                value={form.descricao}
                onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                placeholder="Descrição opcional"
              />
            </div>
            <div>
              <Label>Percentual de Comissão (%)</Label>
              <Input
                className="mt-1"
                type="number"
                step="0.01"
                value={form.percentual}
                onChange={e => setForm(p => ({ ...p, percentual: e.target.value }))}
                placeholder="Ex: 5.5"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="ativo"
                checked={form.ativo}
                onChange={e => setForm(p => ({ ...p, ativo: e.target.checked }))}
                className="w-4 h-4"
              />
              <Label htmlFor="ativo">Ativo</Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleSalvar} disabled={saving} className="bg-green-600 hover:bg-green-700">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}