import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Search, CheckCircle2, Building2, User, FileText, DollarSign, Landmark } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d) => {
  if (!d) return '-';
  try {
    const s = String(d).length <= 10 ? d + 'T12:00:00' : d;
    return format(new Date(s), 'dd/MM/yyyy');
  } catch { return '-'; }
};

function ModalReceberComissao({ proposta, contas, onClose, onConfirm, loading }) {
  const [form, setForm] = useState({
    data_recebimento: format(new Date(), 'yyyy-MM-dd'),
    valor_base: '',
    percentual: '',
    valor_recebido: '',
    conta_bancaria_id: '',
    observacoes: '',
  });

  useEffect(() => {
    if (proposta) {
      const base = proposta.valor_comissao || proposta.valor_credito || 0;
      setForm({
        data_recebimento: format(new Date(), 'yyyy-MM-dd'),
        valor_base: base ? base.toFixed(2) : '',
        percentual: '',
        valor_recebido: proposta.valor_comissao ? proposta.valor_comissao.toFixed(2) : '',
        conta_bancaria_id: '',
        observacoes: '',
      });
    }
  }, [proposta]);

  const calcularPeloPercentual = (perc, base) => {
    const b = parseFloat(String(base).replace(',', '.')) || 0;
    const p = parseFloat(String(perc).replace(',', '.')) || 0;
    if (b > 0 && p > 0) {
      setForm(f => ({ ...f, valor_recebido: ((b * p) / 100).toFixed(2) }));
    }
  };

  const handlePercentualChange = (v) => {
    setForm(f => ({ ...f, percentual: v }));
    calcularPeloPercentual(v, form.valor_base);
  };

  const handleBaseChange = (v) => {
    setForm(f => ({ ...f, valor_base: v }));
    if (form.percentual) calcularPeloPercentual(form.percentual, v);
  };

  const valorRecebido = parseFloat(String(form.valor_recebido).replace(',', '.')) || 0;
  const canConfirm = form.data_recebimento && form.conta_bancaria_id && valorRecebido > 0;

  return (
    <Dialog open={!!proposta} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Receber Comissão</DialogTitle>
        </DialogHeader>
        {proposta && (
          <div className="space-y-4 py-1">
            {/* Info da proposta */}
            <div className="bg-slate-50 rounded-lg p-3 space-y-1.5 text-sm">
              <div className="flex gap-2 items-center">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-600">Cliente:</span>
                <span className="font-semibold">{proposta.cliente_nome || '-'}</span>
              </div>
              {proposta.cliente_cpf && (
                <div className="flex gap-2 items-center">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-600">CPF:</span>
                  <span className="font-semibold">{proposta.cliente_cpf}</span>
                </div>
              )}
              <div className="flex gap-2 items-center">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-600">Banco:</span>
                <span className="font-semibold">{proposta.administradora_nome || '-'}</span>
              </div>
              <div className="flex gap-2 items-center">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-600">Contrato:</span>
                <span className="font-semibold">{proposta.contrato || '-'}</span>
              </div>
              <div className="flex gap-2 items-center">
                <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-600">Valor crédito:</span>
                <span className="font-semibold">{fmt(proposta.valor_credito)}</span>
              </div>
            </div>

            {/* Campos do recebimento */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label>Data de Recebimento <span className="text-red-500">*</span></Label>
                <Input type="date" value={form.data_recebimento} onChange={e => setForm(f => ({ ...f, data_recebimento: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Valor Base da Comissão (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={form.valor_base}
                  onChange={e => handleBaseChange(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Percentual da Comissão (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 2.5"
                  value={form.percentual}
                  onChange={e => handlePercentualChange(e.target.value)}
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Valor Recebido (R$) <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={form.valor_recebido}
                  onChange={e => setForm(f => ({ ...f, valor_recebido: e.target.value }))}
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Conta Bancária que Recebeu <span className="text-red-500">*</span></Label>
                <select
                  value={form.conta_bancaria_id}
                  onChange={e => setForm(f => ({ ...f, conta_bancaria_id: e.target.value }))}
                  className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-950"
                >
                  <option value="">Selecione a conta...</option>
                  {contas.map(c => (
                    <option key={c.id} value={c.id}>{c.nome_conta} — {c.banco}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Observações (opcional)</Label>
                <Input placeholder="Ex: comissão de empréstimo consignado" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => onConfirm(proposta, form)}
                disabled={loading || !canConfirm}
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Confirmar Recebimento
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ReceberComissao() {
  const [user, setUser] = useState(null);
  const [colab, setColab] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [busca, setBusca] = useState('');
  const [propostaSelecionada, setPropostaSelecionada] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(async (me) => {
      setUser(me);
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id }, '-created_date', 5);
      if (colabs?.length > 0) setColab(colabs[0]);
    }).finally(() => setLoadingUser(false));
  }, []);

  const empresaId = colab?.empresa_id || user?.empresa_id;

  const { data: propostas = [], isLoading } = useQuery({
    queryKey: ['propostas-receber-comissao', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      // Buscar propostas de empréstimo com status PAGO e comissao_banco_recebida false/null
      const todas = await base44.entities.Proposta.filter(
        { empresa_id: empresaId, produto: 'emprestimo' },
        '-data_venda',
        2000
      );
      return todas.filter(p => {
        const statusPago = (p.status || '').toUpperCase() === 'PAGO' ||
          (p.status || '').toUpperCase() === 'PAGA' ||
          (p.status_atual || '').toUpperCase() === 'PAGO';
        const naoRecebida = !p.comissao_banco_recebida;
        return statusPago && naoRecebida;
      });
    },
  });

  const { data: contas = [] } = useQuery({
    queryKey: ['contas-bancarias-receber', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.ContaBancaria.filter({ empresa_id: empresaId, status: 'ativa' }),
  });

  const propostasFiltradas = useMemo(() => {
    if (!busca.trim()) return propostas;
    const t = busca.toLowerCase();
    return propostas.filter(p =>
      (p.cliente_nome || '').toLowerCase().includes(t) ||
      (p.cliente_cpf || '').replace(/\D/g, '').includes(t.replace(/\D/g, '')) ||
      (p.contrato || '').toLowerCase().includes(t) ||
      (p.administradora_nome || '').toLowerCase().includes(t)
    );
  }, [propostas, busca]);

  const handleConfirmar = async (proposta, form) => {
    setSalvando(true);
    try {
      const valorRecebido = parseFloat(String(form.valor_recebido).replace(',', '.')) || 0;
      const hoje = form.data_recebimento;

      // 1. Criar receita financeira
      await base44.entities.Receita.create({
        empresa_id: proposta.empresa_id,
        descricao: `Comissão de empréstimo — ${proposta.cliente_nome} — Contrato: ${proposta.contrato || 'N/A'}`,
        categoria_id: 'comissao_emprestimo',
        categoria_nome: 'Comissão Empréstimo',
        valor: valorRecebido,
        data: hoje,
        data_recebimento: hoje,
        status: 'recebida',
        origem: proposta.administradora_nome || 'Banco',
        conta_bancaria_id: form.conta_bancaria_id,
        observacao: form.observacoes || undefined,
      });

      // 2. Atualizar saldo da conta bancária
      await base44.functions.invoke('atualizarSaldoConta', { conta_bancaria_id: form.conta_bancaria_id });

      // 3. Marcar proposta como comissao_banco_recebida = true
      await base44.entities.Proposta.update(proposta.id, {
        comissao_banco_recebida: true,
        data_comissao_recebida: hoje,
        comissao_recebida: valorRecebido,
      });

      queryClient.invalidateQueries({ queryKey: ['propostas-receber-comissao'] });
      toast.success('Comissão registrada com sucesso!');
      setPropostaSelecionada(null);
    } catch (e) {
      toast.error('Erro ao registrar comissão: ' + (e.message || ''));
    } finally {
      setSalvando(false);
    }
  };

  if (loadingUser) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Receber Comissão</h1>
        <p className="text-slate-500 text-sm mt-1">Propostas de empréstimo com status PAGO aguardando recebimento de comissão.</p>
      </div>

      {/* Barra de busca + contador */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Buscar por nome, CPF ou contrato..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
        <Badge variant="outline" className="text-slate-600 border-slate-300 whitespace-nowrap">
          {propostasFiltradas.length} proposta{propostasFiltradas.length !== 1 ? 's' : ''} aguardando
        </Badge>
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-7 h-7 animate-spin text-slate-400" />
        </div>
      ) : propostasFiltradas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            <p className="text-slate-600 font-medium">Nenhuma proposta aguardando recebimento</p>
            <p className="text-slate-400 text-sm">Todas as comissões de empréstimos pagos já foram recebidas.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-700 text-white">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide">Cliente</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide">CPF</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide">Contrato</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide">Banco</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide">Tipo</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide">Valor Crédito</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide">Comissão Est.</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide">Data Venda</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {propostasFiltradas.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">{p.cliente_nome || '-'}</td>
                  <td className="px-3 py-2.5 text-slate-500 text-xs whitespace-nowrap">{p.cliente_cpf || '-'}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-700 whitespace-nowrap">{p.contrato || '-'}</td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{p.administradora_nome || '-'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <Badge variant="outline" className="text-xs border-blue-200 text-blue-700 bg-blue-50">
                      {p.emprestimo_tipo || p.tipo_importacao_original || 'Empréstimo'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">{fmt(p.valor_credito)}</td>
                  <td className="px-3 py-2.5 text-emerald-700 font-medium whitespace-nowrap">
                    {p.valor_comissao ? fmt(p.valor_comissao) : '-'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{fmtDate(p.data_venda)}</td>
                  <td className="px-3 py-2.5">
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-xs"
                      onClick={() => setPropostaSelecionada(p)}
                    >
                      <Landmark className="w-3.5 h-3.5 mr-1" />
                      Receber
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalReceberComissao
        proposta={propostaSelecionada}
        contas={contas}
        onClose={() => setPropostaSelecionada(null)}
        onConfirm={handleConfirmar}
        loading={salvando}
      />
    </div>
  );
}