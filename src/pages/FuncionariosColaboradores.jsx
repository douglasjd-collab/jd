import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Users, Edit2, Trash2, User, X } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const TIPO_CONTRATO = ['CLT', 'Autônomo', 'PJ', 'Estágio'];
const STATUS_LIST = ['Ativo', 'Inativo'];

const emptyForm = {
  nome: '', cpf: '', telefone: '', email: '', cargo: '',
  tipo_contrato: 'CLT', salario_base: '', data_admissao: '',
  status: 'Ativo', banco: '', agencia: '', conta: '', pix: '',
  vale_transporte: '', vale_refeicao: '', observacoes: ''
};

export default function FuncionariosColaboradores() {
  const [user, setUser] = useState(null);
  const [colaboradores, setColaboradores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('todos');
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.auth.me().then(me => {
      setUser(me);
      carregar(me);
    });
  }, []);

  const carregar = async (me) => {
    setLoading(true);
    const filtro = me?.empresa_id ? { empresa_id: me.empresa_id } : {};
    const data = await base44.entities.FuncionarioColaborador.filter(filtro, '-created_date', 200);
    setColaboradores(data);
    setLoading(false);
  };

  const abrirNovo = () => {
    setEditando(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const abrirEditar = (c) => {
    setEditando(c);
    setForm({
      nome: c.nome || '', cpf: c.cpf || '', telefone: c.telefone || '',
      email: c.email || '', cargo: c.cargo || '', tipo_contrato: c.tipo_contrato || 'CLT',
      salario_base: c.salario_base || '', data_admissao: c.data_admissao || '',
      status: c.status || 'Ativo', banco: c.banco || '', agencia: c.agencia || '',
      conta: c.conta || '', pix: c.pix || '',
      vale_transporte: c.vale_transporte || '', vale_refeicao: c.vale_refeicao || '',
      observacoes: c.observacoes || ''
    });
    setModalOpen(true);
  };

  const salvar = async () => {
    if (!form.nome) return toast.error('Nome é obrigatório');
    setSaving(true);
    const payload = {
      ...form,
      empresa_id: user?.empresa_id,
      salario_base: parseFloat(form.salario_base) || 0,
      vale_transporte: parseFloat(form.vale_transporte) || 0,
      vale_refeicao: parseFloat(form.vale_refeicao) || 0
    };
    if (editando) {
      await base44.entities.FuncionarioColaborador.update(editando.id, payload);
      toast.success('Colaborador atualizado!');
    } else {
      await base44.entities.FuncionarioColaborador.create(payload);
      toast.success('Colaborador cadastrado!');
    }
    setSaving(false);
    setModalOpen(false);
    carregar(user);
  };

  const excluir = async (c) => {
    if (!confirm(`Excluir ${c.nome}?`)) return;
    await base44.entities.FuncionarioColaborador.delete(c.id);
    toast.success('Removido!');
    carregar(user);
  };

  const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const filtrados = colaboradores.filter(c => {
    const okSearch = !search || c.nome?.toLowerCase().includes(search.toLowerCase()) || c.cpf?.includes(search);
    const okStatus = statusFiltro === 'todos' || c.status === statusFiltro;
    return okSearch && okStatus;
  });

  const ativos = colaboradores.filter(c => c.status === 'Ativo').length;
  const totalSalarios = colaboradores.filter(c => c.status === 'Ativo').reduce((s, c) => s + (c.salario_base || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Colaboradores</h1>
          <p className="text-slate-500 text-sm">Gestão de funcionários e contratados</p>
        </div>
        <Button onClick={abrirNovo} className="bg-[#10353C] hover:bg-[#10353C]/90 gap-2">
          <Plus className="w-4 h-4" /> Novo Colaborador
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Total Ativos</p>
            <p className="text-2xl font-bold text-green-600">{ativos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Folha Mensal</p>
            <p className="text-xl font-bold text-slate-800">{fmt(totalSalarios)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Total Cadastrados</p>
            <p className="text-2xl font-bold text-slate-800">{colaboradores.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Buscar por nome ou CPF..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="Ativo">Ativo</SelectItem>
                <SelectItem value="Inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Carregando...</div>
          ) : filtrados.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <Users className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>Nenhum colaborador encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-medium text-slate-600">Nome</th>
                    <th className="text-left p-3 font-medium text-slate-600">Cargo</th>
                    <th className="text-left p-3 font-medium text-slate-600">Contrato</th>
                    <th className="text-left p-3 font-medium text-slate-600">Salário Base</th>
                    <th className="text-left p-3 font-medium text-slate-600">Admissão</th>
                    <th className="text-left p-3 font-medium text-slate-600">Status</th>
                    <th className="text-left p-3 font-medium text-slate-600">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(c => (
                    <tr key={c.id} className="border-b hover:bg-slate-50 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-[#10353C] text-white flex items-center justify-center text-xs font-bold">
                            {c.nome?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium">{c.nome}</p>
                            <p className="text-xs text-slate-400">{c.cpf}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-slate-600">{c.cargo || '-'}</td>
                      <td className="p-3">
                        <Badge variant="outline">{c.tipo_contrato || '-'}</Badge>
                      </td>
                      <td className="p-3 font-medium">{fmt(c.salario_base)}</td>
                      <td className="p-3 text-slate-500">{c.data_admissao ? format(new Date(c.data_admissao + 'T00:00:00'), 'dd/MM/yyyy') : '-'}</td>
                      <td className="p-3">
                        <Badge className={c.status === 'Ativo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                          {c.status}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => abrirEditar(c)}><Edit2 className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => excluir(c)}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0 [&>button]:hidden">
          {/* Header com cor do CRM */}
          <div className="bg-[#10353C] text-white px-6 py-4 rounded-t-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-lg">{editando ? 'Editar Colaborador' : 'Novo Colaborador'}</h2>
                  <p className="text-white/60 text-xs">Preencha os dados do colaborador</p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Seção: Dados Pessoais */}
            <div className="md:col-span-2 flex items-center gap-2 mb-1">
              <div className="w-1 h-4 bg-[#23BE84] rounded-full" />
              <p className="text-sm font-semibold text-[#10353C]">Dados Pessoais</p>
            </div>

            <div className="md:col-span-2">
              <Label className="text-slate-600 font-medium">Nome Completo *</Label>
              <Input
                value={form.nome}
                onChange={e => setForm({...form, nome: e.target.value})}
                placeholder="Nome completo"
                className="border-slate-300 focus:border-[#23BE84] focus:ring-[#23BE84]/20"
              />
            </div>
            <div>
              <Label className="text-slate-600 font-medium">CPF</Label>
              <Input value={form.cpf} onChange={e => setForm({...form, cpf: e.target.value})} placeholder="000.000.000-00" className="border-slate-300 focus:border-[#23BE84]" />
            </div>
            <div>
              <Label className="text-slate-600 font-medium">Telefone</Label>
              <Input value={form.telefone} onChange={e => setForm({...form, telefone: e.target.value})} placeholder="(00) 00000-0000" className="border-slate-300 focus:border-[#23BE84]" />
            </div>
            <div>
              <Label className="text-slate-600 font-medium">Email</Label>
              <Input value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="email@exemplo.com" className="border-slate-300 focus:border-[#23BE84]" />
            </div>
            <div>
              <Label className="text-slate-600 font-medium">Cargo</Label>
              <Input value={form.cargo} onChange={e => setForm({...form, cargo: e.target.value})} placeholder="Ex: Vendedor, Gerente..." className="border-slate-300 focus:border-[#23BE84]" />
            </div>

            {/* Seção: Contrato */}
            <div className="md:col-span-2 flex items-center gap-2 mt-2 mb-1">
              <div className="w-1 h-4 bg-[#23BE84] rounded-full" />
              <p className="text-sm font-semibold text-[#10353C]">Dados Contratuais</p>
            </div>

            <div>
              <Label className="text-slate-600 font-medium">Tipo de Contrato</Label>
              <Select value={form.tipo_contrato} onValueChange={v => setForm({...form, tipo_contrato: v})}>
                <SelectTrigger className="border-slate-300"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPO_CONTRATO.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-600 font-medium">Salário Base</Label>
              <Input type="number" value={form.salario_base} onChange={e => setForm({...form, salario_base: e.target.value})} placeholder="0,00" className="border-slate-300 focus:border-[#23BE84]" />
            </div>
            <div>
              <Label className="text-slate-600 font-medium">Data de Admissão</Label>
              <Input type="date" value={form.data_admissao} onChange={e => setForm({...form, data_admissao: e.target.value})} className="border-slate-300 focus:border-[#23BE84]" />
            </div>
            <div>
              <Label className="text-slate-600 font-medium">Status</Label>
              <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                <SelectTrigger className="border-slate-300"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Seção: Benefícios */}
            <div className="md:col-span-2 flex items-center gap-2 mt-2 mb-1">
              <div className="w-1 h-4 bg-[#23BE84] rounded-full" />
              <p className="text-sm font-semibold text-[#10353C]">Benefícios Mensais</p>
            </div>

            <div>
              <Label className="text-slate-600 font-medium">Vale Transporte (R$/mês)</Label>
              <Input type="number" value={form.vale_transporte} onChange={e => setForm({...form, vale_transporte: e.target.value})} placeholder="0,00" className="border-slate-300 focus:border-[#23BE84]" />
            </div>
            <div>
              <Label className="text-slate-600 font-medium">Vale Refeição (R$/mês)</Label>
              <Input type="number" value={form.vale_refeicao} onChange={e => setForm({...form, vale_refeicao: e.target.value})} placeholder="0,00" className="border-slate-300 focus:border-[#23BE84]" />
            </div>

            {/* Seção: Dados Bancários */}
            <div className="md:col-span-2 flex items-center gap-2 mt-2 mb-1">
              <div className="w-1 h-4 bg-[#23BE84] rounded-full" />
              <p className="text-sm font-semibold text-[#10353C]">Dados Bancários</p>
            </div>

            <div>
              <Label className="text-slate-600 font-medium">Banco</Label>
              <Input value={form.banco} onChange={e => setForm({...form, banco: e.target.value})} placeholder="Nome do banco" className="border-slate-300 focus:border-[#23BE84]" />
            </div>
            <div>
              <Label className="text-slate-600 font-medium">Agência</Label>
              <Input value={form.agencia} onChange={e => setForm({...form, agencia: e.target.value})} placeholder="0000" className="border-slate-300 focus:border-[#23BE84]" />
            </div>
            <div>
              <Label className="text-slate-600 font-medium">Conta</Label>
              <Input value={form.conta} onChange={e => setForm({...form, conta: e.target.value})} placeholder="00000-0" className="border-slate-300 focus:border-[#23BE84]" />
            </div>
            <div>
              <Label className="text-slate-600 font-medium">PIX</Label>
              <Input value={form.pix} onChange={e => setForm({...form, pix: e.target.value})} placeholder="Chave PIX" className="border-slate-300 focus:border-[#23BE84]" />
            </div>

            <div className="md:col-span-2">
              <Label className="text-slate-600 font-medium">Observações</Label>
              <textarea
                className="w-full border border-slate-300 rounded-md p-2 text-sm min-h-[80px] focus:outline-none focus:ring-1 focus:ring-[#23BE84] focus:border-[#23BE84]"
                value={form.observacoes}
                onChange={e => setForm({...form, observacoes: e.target.value})}
                placeholder="Observações gerais..."
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 bg-slate-50 rounded-b-xl border-t">
            <Button variant="outline" onClick={() => setModalOpen(false)} className="border-slate-300 text-slate-600">Cancelar</Button>
            <Button onClick={salvar} disabled={saving} className="bg-[#10353C] hover:bg-[#10353C]/90 text-white px-6">
              {saving ? 'Salvando...' : 'Salvar Colaborador'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}