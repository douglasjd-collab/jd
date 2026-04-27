import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Power, Wallet, Building2, CreditCard, Hash, Key } from 'lucide-react';
import { toast } from 'sonner';

const emptyForm = {
  nome_conta: '',
  banco: '',
  tipo_conta: 'Conta Corrente',
  agencia: '',
  conta: '',
  chave_pix: '',
  saldo_inicial: '0',
  status: 'ativa',
  observacoes: '',
};

const BANCOS_COMUNS = [
  'Banco do Brasil', 'Bradesco', 'Itaú', 'Santander', 'Caixa Econômica Federal',
  'Nubank', 'Inter', 'C6 Bank', 'Sicoob', 'Sicredi', 'BTG Pactual', 'PicPay',
  'Mercado Pago', 'Carteira/Dinheiro', 'Outro'
];

const BANCO_CORES = {
  'Banco do Brasil': 'bg-yellow-100 text-yellow-800',
  'Bradesco': 'bg-red-100 text-red-800',
  'Itaú': 'bg-orange-100 text-orange-800',
  'Santander': 'bg-red-100 text-red-900',
  'Caixa Econômica Federal': 'bg-blue-100 text-blue-800',
  'Nubank': 'bg-purple-100 text-purple-800',
  'Inter': 'bg-orange-100 text-orange-900',
  'C6 Bank': 'bg-slate-100 text-slate-800',
};

function getBancoCor(banco) {
  return BANCO_CORES[banco] || 'bg-slate-100 text-slate-700';
}

export default function ContasBancarias() {
  const [user, setUser] = useState(null);
  const [contas, setContas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingConta, setEditingConta] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.auth.me().then(async (me) => {
      let perfil = me.perfil;
      let empresa_id = me.empresa_id;
      if (!perfil) {
        const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
        if (colabs.length > 0) {
          perfil = colabs[0].perfil;
          empresa_id = colabs[0].empresa_id;
        }
      }
      const userFull = { ...me, perfil, empresa_id };
      setUser(userFull);
      carregar(userFull);
    });
  }, []);

  const carregar = async (u) => {
    setLoading(true);
    const filtro = u?.empresa_id ? { empresa_id: u.empresa_id } : {};
    const data = await base44.entities.ContaBancaria.filter(filtro, 'nome_conta', 200);
    setContas(data);
    setLoading(false);
  };

  const abrirNova = () => {
    setEditingConta(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const abrirEditar = (conta) => {
    setEditingConta(conta);
    setForm({
      nome_conta: conta.nome_conta || '',
      banco: conta.banco || '',
      tipo_conta: conta.tipo_conta || 'Conta Corrente',
      agencia: conta.agencia || '',
      conta: conta.conta || '',
      chave_pix: conta.chave_pix || '',
      saldo_inicial: String(conta.saldo_inicial ?? 0),
      status: conta.status || 'ativa',
      observacoes: conta.observacoes || '',
    });
    setModalOpen(true);
  };

  const salvar = async () => {
    if (!form.nome_conta || !form.banco) return toast.error('Preencha nome e banco');
    setSaving(true);
    const saldoInicial = parseFloat(form.saldo_inicial) || 0;
    const payload = {
      empresa_id: user?.empresa_id,
      nome_conta: form.nome_conta,
      banco: form.banco,
      tipo_conta: form.tipo_conta,
      agencia: form.agencia,
      conta: form.conta,
      chave_pix: form.chave_pix,
      saldo_inicial: saldoInicial,
      saldo_atual: editingConta ? editingConta.saldo_atual : saldoInicial,
      status: form.status,
      observacoes: form.observacoes,
    };
    if (editingConta) {
      await base44.entities.ContaBancaria.update(editingConta.id, payload);
      toast.success('Conta atualizada!');
    } else {
      await base44.entities.ContaBancaria.create(payload);
      toast.success('Conta criada!');
    }
    setSaving(false);
    setModalOpen(false);
    carregar(user);
  };

  const toggleStatus = async (conta) => {
    const novoStatus = conta.status === 'ativa' ? 'inativa' : 'ativa';
    await base44.entities.ContaBancaria.update(conta.id, { status: novoStatus });
    toast.success(`Conta ${novoStatus === 'ativa' ? 'ativada' : 'desativada'}!`);
    carregar(user);
  };

  const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const contasAtivas = contas.filter(c => c.status === 'ativa');
  const saldoTotal = contasAtivas.reduce((s, c) => s + (c.saldo_atual || 0), 0);

  const isAdmin = ['master', 'super_admin', 'admin'].includes(user?.perfil);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Contas Bancárias</h1>
          <p className="text-slate-500 text-sm">Gerencie as contas bancárias da empresa</p>
        </div>
        {isAdmin && (
          <Button onClick={abrirNova} className="bg-[#10353C] hover:bg-[#10353C]/90 gap-2">
            <Plus className="w-4 h-4" /> Nova Conta
          </Button>
        )}
      </div>

      {/* Saldo Total */}
      <Card className="bg-gradient-to-r from-[#10353C] to-[#1a4f5a] text-white border-0">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm mb-1">Saldo Total em Contas Ativas</p>
              <p className="text-4xl font-bold">{fmt(saldoTotal)}</p>
              <p className="text-white/60 text-xs mt-2">{contasAtivas.length} conta(s) ativa(s)</p>
            </div>
            <Wallet className="w-16 h-16 text-white/20" />
          </div>
        </CardContent>
      </Card>

      {/* Cards das Contas */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">Carregando...</div>
      ) : contas.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <CreditCard className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500">Nenhuma conta bancária cadastrada</p>
            {isAdmin && (
              <Button onClick={abrirNova} className="mt-4 bg-[#10353C] hover:bg-[#10353C]/90 gap-2">
                <Plus className="w-4 h-4" /> Cadastrar primeira conta
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contas.map(conta => (
            <Card key={conta.id} className={`relative overflow-hidden transition-all hover:shadow-md ${conta.status === 'inativa' ? 'opacity-60' : ''}`}>
              {/* Barra lateral colorida */}
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${conta.status === 'ativa' ? 'bg-green-500' : 'bg-slate-300'}`} />
              
              <CardContent className="p-5 pl-6">
                {/* Header do card */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 truncate">{conta.nome_conta}</p>
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-1 ${getBancoCor(conta.banco)}`}>
                      {conta.banco}
                    </span>
                  </div>
                  <Badge className={conta.status === 'ativa' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}>
                    {conta.status === 'ativa' ? 'Ativa' : 'Inativa'}
                  </Badge>
                </div>

                {/* Dados bancários */}
                <div className="space-y-1.5 text-sm text-slate-600 mb-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{conta.tipo_conta}</span>
                  </div>
                  {conta.agencia && (
                    <div className="flex items-center gap-2">
                      <Hash className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Ag: {conta.agencia} · Conta: {conta.conta || '-'}</span>
                    </div>
                  )}
                  {conta.chave_pix && (
                    <div className="flex items-center gap-2">
                      <Key className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{conta.chave_pix}</span>
                    </div>
                  )}
                </div>

                {/* Saldo */}
                <div className="bg-slate-50 rounded-lg p-3 mb-4">
                  <p className="text-xs text-slate-500 mb-0.5">Saldo Atual</p>
                  <p className={`text-2xl font-bold ${(conta.saldo_atual || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {fmt(conta.saldo_atual)}
                  </p>
                </div>

                {/* Ações */}
                {isAdmin && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => abrirEditar(conta)} className="flex-1 gap-1">
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleStatus(conta)}
                      className={`gap-1 ${conta.status === 'ativa' ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}
                    >
                      <Power className="w-3.5 h-3.5" />
                      {conta.status === 'ativa' ? 'Inativar' : 'Ativar'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Criar/Editar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingConta ? 'Editar Conta Bancária' : 'Nova Conta Bancária'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nome da Conta *</Label>
              <Input
                className="mt-1"
                placeholder="Ex: Conta Principal JD Promotora"
                value={form.nome_conta}
                onChange={e => setForm(f => ({ ...f, nome_conta: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Banco *</Label>
                <Select value={form.banco} onValueChange={v => setForm(f => ({ ...f, banco: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {BANCOS_COMUNS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de Conta</Label>
                <Select value={form.tipo_conta} onValueChange={v => setForm(f => ({ ...f, tipo_conta: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Conta Corrente', 'Conta Poupança', 'Conta Salário', 'Conta de Pagamento', 'Carteira/Dinheiro'].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Agência</Label>
                <Input className="mt-1" placeholder="0000" value={form.agencia} onChange={e => setForm(f => ({ ...f, agencia: e.target.value }))} />
              </div>
              <div>
                <Label>Conta</Label>
                <Input className="mt-1" placeholder="00000-0" value={form.conta} onChange={e => setForm(f => ({ ...f, conta: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Chave PIX</Label>
              <Input className="mt-1" placeholder="CPF, CNPJ, email, telefone ou chave aleatória" value={form.chave_pix} onChange={e => setForm(f => ({ ...f, chave_pix: e.target.value }))} />
            </div>
            {!editingConta && (
              <div>
                <Label>Saldo Inicial (R$)</Label>
                <Input className="mt-1" type="number" placeholder="0,00" value={form.saldo_inicial} onChange={e => setForm(f => ({ ...f, saldo_inicial: e.target.value }))} />
                <p className="text-xs text-slate-400 mt-1">Saldo atual da conta no momento do cadastro</p>
              </div>
            )}
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativa">Ativa</SelectItem>
                  <SelectItem value="inativa">Inativa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observações</Label>
              <textarea
                className="w-full mt-1 border rounded-md p-2 text-sm min-h-[60px] focus:outline-none focus:ring-1 focus:ring-ring"
                value={form.observacoes}
                onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving} className="bg-[#10353C] hover:bg-[#10353C]/90">
              {saving ? 'Salvando...' : (editingConta ? 'Salvar Alterações' : 'Criar Conta')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}