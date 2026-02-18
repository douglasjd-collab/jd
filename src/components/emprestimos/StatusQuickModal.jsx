import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { addDays, isWeekend, format } from 'date-fns';

const STATUS_COLOR_MAP = {
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  green: 'bg-green-100 text-green-700 border-green-200',
  red: 'bg-red-100 text-red-700 border-red-200',
  yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
  orange: 'bg-orange-100 text-orange-700 border-orange-200',
  emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
};

// Calcula N dias úteis a partir de uma data
function adicionarDiasUteis(dataInicio, dias) {
  let data = new Date(dataInicio);
  let count = 0;
  while (count < dias) {
    data = addDays(data, 1);
    if (!isWeekend(data)) count++;
  }
  return data;
}

export default function StatusQuickModal({ open, onOpenChange, proposta, empresaId }) {
  const [dataPagamento, setDataPagamento] = useState('');
  const [cipValorPrevisto, setCipValorPrevisto] = useState('');
  const [cipDataEntrada, setCipDataEntrada] = useState('');
  const [aguardandoExtra, setAguardandoExtra] = useState(null); // 'pago' | 'cip'
  const [statusSelecionado, setStatusSelecionado] = useState(null);
  const queryClient = useQueryClient();

  const { data: statusList = [] } = useQuery({
    queryKey: ['status-propostas-quick', empresaId],
    enabled: open && !!empresaId,
    queryFn: () => base44.entities.StatusProposta.filter({ empresa_id: empresaId, ativo: true }, 'ordem'),
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Proposta.update(proposta.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendas-emprestimos'] });
      toast.success('Status atualizado!');
      handleClose();
    },
    onError: () => toast.error('Erro ao atualizar status'),
  });

  const handleClose = () => {
    setAguardandoExtra(null);
    setStatusSelecionado(null);
    setDataPagamento('');
    setCipValorPrevisto('');
    setCipDataEntrada('');
    onOpenChange(false);
  };

  const handleSelectStatus = (status) => {
    const codigo = status.codigo?.toLowerCase() || '';
    const nome = status.nome?.toLowerCase() || '';

    const isPago = codigo.includes('pago') || nome.includes('pago');
    const isCip = codigo.includes('cip') || nome.includes('cip') || nome.includes('aguardando cip');

    if (isPago) {
      setStatusSelecionado(status);
      setAguardandoExtra('pago');
    } else if (isCip) {
      setStatusSelecionado(status);
      setAguardandoExtra('cip');
    } else {
      updateMutation.mutate({ status: status.codigo });
    }
  };

  const handleConfirmarPago = () => {
    if (!dataPagamento) {
      toast.error('Informe a data de pagamento');
      return;
    }
    updateMutation.mutate({
      status: statusSelecionado.codigo,
      emprestimo_data_liberacao: dataPagamento,
    });
  };

  const handleConfirmarCip = () => {
    const hoje = new Date();
    const dataRetorno = adicionarDiasUteis(hoje, 5);
    const dataRetornoStr = format(dataRetorno, 'yyyy-MM-dd');
    const valorNum = parseFloat(cipValorPrevisto.replace(/\./g, '').replace(',', '.')) || 0;

    updateMutation.mutate({
      status: statusSelecionado.codigo,
      cip_data_entrada: format(hoje, 'yyyy-MM-dd'),
      cip_data_retorno_prevista: dataRetornoStr,
      cip_valor_previsto: valorNum || undefined,
    });
  };

  const formatarValorBRL = (v) => {
    const num = v.replace(/\D/g, '');
    return (parseFloat(num) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-[#23BE84]" />
            {aguardandoExtra ? (aguardandoExtra === 'pago' ? 'Data de Pagamento' : 'Aguardando CIP') : 'Alterar Status'}
          </DialogTitle>
          {proposta && (
            <p className="text-sm text-slate-500">{proposta.cliente_nome}</p>
          )}
        </DialogHeader>

        {/* Lista de status */}
        {!aguardandoExtra && (
          <div className="space-y-2 pt-1">
            {[...statusList].sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map((s) => {
              const colorClass = STATUS_COLOR_MAP[s.cor] || STATUS_COLOR_MAP.slate;
              const isAtual = proposta?.status === s.codigo;
              return (
                <button
                  key={s.id}
                  onClick={() => handleSelectStatus(s)}
                  disabled={updateMutation.isPending}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-medium transition-all hover:opacity-80 ${colorClass} ${isAtual ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`}
                >
                  <span>{s.nome}</span>
                  {isAtual && <span className="text-xs opacity-60">atual</span>}
                </button>
              );
            })}
            {updateMutation.isPending && (
              <div className="flex justify-center pt-2">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            )}
          </div>
        )}

        {/* Pago - pede data */}
        {aguardandoExtra === 'pago' && (
          <div className="space-y-4 pt-2">
            <div className={`px-4 py-2 rounded-lg border text-sm font-medium ${STATUS_COLOR_MAP[statusSelecionado?.cor] || STATUS_COLOR_MAP.slate}`}>
              {statusSelecionado?.nome}
            </div>
            <div>
              <Label className="text-sm">Data de Pagamento *</Label>
              <Input
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
                className="mt-1"
                autoFocus
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setAguardandoExtra(null)}>
                Voltar
              </Button>
              <Button
                className="flex-1 bg-[#23BE84] hover:bg-[#1da570]"
                onClick={handleConfirmarPago}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
              </Button>
            </div>
          </div>
        )}

        {/* CIP - pede valor previsto e mostra data calculada */}
        {aguardandoExtra === 'cip' && (
          <div className="space-y-4 pt-2">
            <div className={`px-4 py-2 rounded-lg border text-sm font-medium ${STATUS_COLOR_MAP[statusSelecionado?.cor] || STATUS_COLOR_MAP.slate}`}>
              {statusSelecionado?.nome}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
              <p className="text-blue-800 font-medium">⏱ Prazo de retorno calculado:</p>
              <p className="text-blue-700 mt-1">
                <strong>5 dias úteis</strong> a partir de hoje
                {' → '}
                <strong>{format(adicionarDiasUteis(new Date(), 5), 'dd/MM/yyyy')}</strong>
              </p>
            </div>

            <div>
              <Label className="text-sm">Valor do saldo previsto para retorno (R$)</Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="0,00"
                value={cipValorPrevisto}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, '');
                  if (raw) setCipValorPrevisto(formatarValorBRL(raw));
                  else setCipValorPrevisto('');
                }}
                className="mt-1"
                autoFocus
              />
              <p className="text-xs text-slate-400 mt-1">Campo opcional — informe o valor esperado de retorno do banco</p>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setAguardandoExtra(null)}>
                Voltar
              </Button>
              <Button
                className="flex-1 bg-[#23BE84] hover:bg-[#1da570]"
                onClick={handleConfirmarCip}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}