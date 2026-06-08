import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Search, CheckCircle, XCircle, Clock, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_MAP = {
  pendente: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  recebida: { label: 'Recebida', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  cancelada: { label: 'Cancelada', color: 'bg-red-100 text-red-700', icon: XCircle },
};

const fmt = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function ComissoesFinanciamento({ user }) {
  const [comissoes, setComissoes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('all');
  const [receberModal, setReceberModal] = useState(null); // comissão selecionada para receber

  const [formReceber, setFormReceber] = useState({
    data_recebimento: new Date().toISOString().split('T')[0],
    valor_comissao: '',
    percentual_comissao_vendedor: '',
    valor_comissao_vendedor: '',
    observacoes: '',
  });
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!user?.empresa_id) return;
    setLoading(true);
    const data = await base44.entities.ComissaoFinanciamento.filter({ empresa_id: user.empresa_id }, '-created_date', 500);
    setComissoes(data || []);
    setLoading(false);
  }, [user?.empresa_id]);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirReceber = (c) => {
    setFormReceber({
      data_recebimento: new Date().toISOString().split('T')[0],
      valor_comissao: c.valor_comissao || '',
      percentual_comissao_vendedor: c.percentual_comissao_vendedor || '',
      valor_comissao_vendedor: c.valor_comissao_vendedor || '',
      observacoes: '',
    });
    setReceberModal(c);
  };

  const calcularComissaoVendedor = (val, pct) => {
    const v = parseFloat(val) || 0;
    const p = parseFloat(pct) || 0;
    return p > 0 ? ((v * p) / 100).toFixed(2) : '';
  };

  const confirmarRecebimento = async () => {
    if (!receberModal) return;
    setSalvando(true);
    try {
      const valorComissao = parseFloat(formReceber.valor_comissao) || 0;
      const valorVendedor = parseFloat(formReceber.valor_comissao_vendedor) || 0;

      // 1. Criar Receita Financeira
      const receita = await base44.entities.Receita.create({
        empresa_id: user.empresa_id,
        filial_id: receberModal.filial_id || '',
        filial_nome: receberModal.filial_nome || '',
        descricao: `Comissão de Financiamento - ${receberModal.cliente_nome} - ${receberModal.banco || ''}`,
        categoria_id: 'financiamento_comissao',
        categoria_nome: 'Comissão de Financiamento',
        valor: valorComissao,
        data: formReceber.data_recebimento,
        data_recebimento: formReceber.data_recebimento,
        status: 'recebida',
        cliente_nome: receberModal.cliente_nome,
        responsavel_id: receberModal.vendedor_id || '',
        responsavel_nome: receberModal.vendedor_nome || '',
        origem: 'financiamento',
      });

      // 2. Atualizar comissão como recebida
      await base44.entities.ComissaoFinanciamento.update(receberModal.id, {
        status: 'recebida',
        data_recebimento: formReceber.data_recebimento,
        valor_comissao: valorComissao,
        percentual_comissao_vendedor: parseFloat(formReceber.percentual_comissao_vendedor) || 0,
        valor_comissao_vendedor: valorVendedor,
        receita_id: receita.id,
      });

      // 3. Atualizar proposta de financiamento
      if (receberModal.financiamento_id) {
        await base44.entities.FinanciamentoVeiculo.update(receberModal.financiamento_id, {
          status: 'comissao_recebida',
        });
      }

      // 4. Criar comissão a pagar ao vendedor (se houver)
      if (valorVendedor > 0 && receberModal.vendedor_id) {
        await base44.entities.ComissaoAPagar.create({
          empresa_id: user.empresa_id,
          vendedor_id: receberModal.vendedor_id,
          vendedor_nome: receberModal.vendedor_nome || '',
          proposta_id: receberModal.financiamento_id || '',
          tipo: 'financiamento',
          valor: valorVendedor,
          status_pagamento: 'pendente',
          descricao: `Comissão Financiamento - ${receberModal.cliente_nome}`,
          data_prevista: formReceber.data_recebimento,
        });
      }

      toast.success('Comissão recebida com sucesso! Receita e comissão do vendedor criadas.');
      setReceberModal(null);
      carregar();
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  const filtradas = comissoes.filter(c => {
    if (filtroStatus !== 'all' && c.status !== filtroStatus) return false;
    if (busca) {
      const b = busca.toLowerCase();
      if (!(c.cliente_nome?.toLowerCase().includes(b) || c.banco?.toLowerCase().includes(b) || c.numero_proposta?.toLowerCase().includes(b))) return false;
    }
    return true;
  });

  const totalPendente = comissoes.filter(c => c.status === 'pendente').reduce((s, c) => s + (c.valor_comissao || 0), 0);
  const totalRecebida = comissoes.filter(c => c.status === 'recebida').reduce((s, c) => s + (c.valor_comissao || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Comissões de Financiamento</h2>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <p className="text-xs text-yellow-700 font-medium">A Receber</p>
          <p className="text-xl font-bold text-yellow-800 mt-1">{fmt(totalPendente)}</p>
          <p className="text-xs text-yellow-600">{comissoes.filter(c => c.status === 'pendente').length} comissões</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-xs text-green-700 font-medium">Recebidas</p>
          <p className="text-xl font-bold text-green-800 mt-1">{fmt(totalRecebida)}</p>
          <p className="text-xs text-green-600">{comissoes.filter(c => c.status === 'recebida').length} comissões</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-xs text-blue-700 font-medium">Total de Registros</p>
          <p className="text-xl font-bold text-blue-800 mt-1">{comissoes.length}</p>
          <p className="text-xs text-blue-600">comissões cadastradas</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Buscar por cliente, banco, proposta..." className="pl-9" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="recebida">Recebida</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Proposta</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Cliente</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Banco</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Vr. Financiado</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Comissão</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Data Prevista</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Vendedor</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-10 text-slate-400">Carregando...</td></tr>
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-slate-400">Nenhuma comissão encontrada</td></tr>
              ) : filtradas.map(c => {
                const st = STATUS_MAP[c.status] || STATUS_MAP.pendente;
                return (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700">{c.numero_proposta || '—'}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{c.cliente_nome}</p>
                      <p className="text-xs text-slate-400">{c.cliente_cpf}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.banco || '—'}</td>
                    <td className="px-4 py-3 text-right">{fmt(c.valor_financiado)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmt(c.valor_comissao)}</td>
                    <td className="px-4 py-3 text-slate-500">{c.data_prevista ? new Date(c.data_prevista + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.color}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.vendedor_nome || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {c.status === 'pendente' && (
                        <Button size="sm" variant="outline" onClick={() => abrirReceber(c)}
                          className="text-green-600 border-green-200 hover:bg-green-50 gap-1 text-xs h-7">
                          <DollarSign className="w-3 h-3" /> Receber
                        </Button>
                      )}
                      {c.status === 'recebida' && (
                        <span className="text-xs text-slate-400">
                          {c.data_recebimento ? new Date(c.data_recebimento + 'T12:00:00').toLocaleDateString('pt-BR') : 'Recebida'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Receber Comissão */}
      <Dialog open={!!receberModal} onOpenChange={v => !v && setReceberModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              Registrar Recebimento de Comissão
            </DialogTitle>
          </DialogHeader>
          {receberModal && (
            <div className="space-y-4 py-2">
              <div className="bg-slate-50 rounded-lg p-3 text-sm">
                <p><span className="text-slate-500">Cliente:</span> <span className="font-medium">{receberModal.cliente_nome}</span></p>
                <p><span className="text-slate-500">Banco:</span> <span className="font-medium">{receberModal.banco || '—'}</span></p>
                <p><span className="text-slate-500">Valor Financiado:</span> <span className="font-medium">{fmt(receberModal.valor_financiado)}</span></p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Valor da Comissão Recebida (R$) *</Label>
                <Input type="number" value={formReceber.valor_comissao}
                  onChange={e => {
                    const v = e.target.value;
                    setFormReceber(f => ({
                      ...f,
                      valor_comissao: v,
                      valor_comissao_vendedor: calcularComissaoVendedor(v, f.percentual_comissao_vendedor),
                    }));
                  }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Data de Recebimento *</Label>
                <Input type="date" value={formReceber.data_recebimento}
                  onChange={e => setFormReceber(f => ({ ...f, data_recebimento: e.target.value }))} />
              </div>
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-slate-600 mb-2">Comissão do Vendedor ({receberModal.vendedor_nome || 'não informado'})</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Percentual (%)</Label>
                    <Input type="number" step="0.01" value={formReceber.percentual_comissao_vendedor}
                      onChange={e => {
                        const p = e.target.value;
                        setFormReceber(f => ({
                          ...f,
                          percentual_comissao_vendedor: p,
                          valor_comissao_vendedor: calcularComissaoVendedor(f.valor_comissao, p),
                        }));
                      }} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Valor (R$)</Label>
                    <Input type="number" value={formReceber.valor_comissao_vendedor}
                      onChange={e => setFormReceber(f => ({ ...f, valor_comissao_vendedor: e.target.value }))} />
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-1">Será criada automaticamente como Comissão a Pagar para o vendedor.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceberModal(null)}>Cancelar</Button>
            <Button onClick={confirmarRecebimento} disabled={salvando} className="bg-green-600 hover:bg-green-700 text-white gap-1.5">
              {salvando ? 'Salvando...' : <><DollarSign className="w-4 h-4" /> Confirmar Recebimento</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}