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

// Feriados nacionais brasileiros fixos (MM-DD)
const FERIADOS_FIXOS = [
  '01-01', // Confraternização Universal
  '04-21', // Tiradentes
  '05-01', // Dia do Trabalho
  '09-07', // Independência do Brasil
  '10-12', // Nossa Senhora Aparecida
  '11-02', // Finados
  '11-15', // Proclamação da República
  '12-25', // Natal
];

// Feriados móveis por ano (Carnaval, Sexta-feira Santa, Corpus Christi)
function getFeriadosMoveis(ano) {
  // Algoritmo de Butcher para Páscoa
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const pascoa = new Date(ano, month - 1, day);

  const sexta = addDays(pascoa, -2);
  const carnaval2 = addDays(pascoa, -47);
  const carnaval1 = addDays(carnaval2, -1);
  const corpus = addDays(pascoa, 60);

  const fmt = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return [fmt(carnaval1), fmt(carnaval2), fmt(sexta), fmt(corpus)];
}

function isFeriado(data) {
  const mmdd = `${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
  if (FERIADOS_FIXOS.includes(mmdd)) return true;
  const moveis = getFeriadosMoveis(data.getFullYear());
  return moveis.includes(mmdd);
}

// Calcula N dias úteis a partir de uma data (pula fins de semana e feriados nacionais)
function adicionarDiasUteis(dataInicio, dias) {
  let data = new Date(dataInicio);
  let count = 0;
  while (count < dias) {
    data = addDays(data, 1);
    if (!isWeekend(data) && !isFeriado(data)) count++;
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
    enabled: open,
    queryFn: () => empresaId
      ? base44.entities.StatusProposta.filter({ empresa_id: empresaId, ativo: true }, 'ordem')
      : base44.entities.StatusProposta.filter({ ativo: true }, 'ordem'),
  });

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      await base44.entities.Proposta.update(proposta.id, data);
      // Registrar no histórico automaticamente
      const statusNome = data.status || proposta.status || '';
      const descricao = data.emprestimo_data_liberacao
        ? `Status alterado para: ${statusNome} | Data pagamento: ${data.emprestimo_data_liberacao}`
        : data.cip_data_entrada
        ? `Status alterado para: ${statusNome} | Entrada CIP: ${data.cip_data_entrada} | Retorno previsto: ${data.cip_data_retorno_prevista}`
        : `Status alterado para: ${statusNome}`;
      try {
        await base44.entities.HistoricoProposta.create({
          empresa_id: proposta.empresa_id,
          proposta_id: proposta.id,
          tipo: 'status',
          status: statusNome,
          descricao_evento: descricao,
          origem: 'JD',
          data_status: new Date().toISOString(),
        });
      } catch {}
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendas-emprestimos'] });
      queryClient.invalidateQueries({ queryKey: ['historico-proposta', proposta?.id] });
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
      setCipDataEntrada(format(new Date(), 'yyyy-MM-dd'));
      setAguardandoExtra('cip');
    } else {
      updateMutation.mutate({ status: status.nome, status_id: status.id });
    }
  };

  const handleConfirmarPago = () => {
    if (!dataPagamento) {
      toast.error('Informe a data de pagamento');
      return;
    }
    updateMutation.mutate({
      status: statusSelecionado.nome,
      status_id: statusSelecionado.id,
      emprestimo_data_liberacao: dataPagamento,
    });
  };

  const handleConfirmarCip = () => {
    if (!cipDataEntrada) {
      toast.error('Informe a data de entrada no CIP');
      return;
    }
    const dataBase = new Date(cipDataEntrada + 'T12:00:00');
    // Regra: 5 dias úteis contados a partir do dia SEGUINTE à entrada.
    // Ex: entrada 19/03 (qui) → 20(sex)=1, 23(seg)=2, 24(ter)=3, 25(qua)=4, 26(qui)=5 → retorno 26/03 ✅
    const dataRetorno = adicionarDiasUteis(dataBase, 5);
    const dataRetornoStr = format(dataRetorno, 'yyyy-MM-dd');
    const valorNum = parseFloat(cipValorPrevisto.replace(/\./g, '').replace(',', '.')) || 0;

    updateMutation.mutate({
      status: statusSelecionado.nome,
      status_id: statusSelecionado.id,
      cip_data_entrada: cipDataEntrada,
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
            {[...statusList].filter(s => !s.tipo || s.tipo === 'principal').sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map((s) => {
              const colorClass = STATUS_COLOR_MAP[s.cor] || STATUS_COLOR_MAP.slate;
              const isAtual = proposta?.status_id === s.id || proposta?.status === s.nome || proposta?.status === s.codigo;
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

            <div>
              <Label className="text-sm">Data de entrada no CIP *</Label>
              <Input
                type="date"
                value={cipDataEntrada}
                onChange={(e) => setCipDataEntrada(e.target.value)}
                className="mt-1"
                autoFocus
              />
            </div>

            {cipDataEntrada && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                <p className="text-blue-800 font-medium">⏱ Prazo de retorno calculado:</p>
                <p className="text-blue-700 mt-1">
                  5 dias úteis a partir de {format(new Date(cipDataEntrada + 'T12:00:00'), 'dd/MM/yyyy')}
                  {' → '}
                  <strong>{format(adicionarDiasUteis(new Date(cipDataEntrada + 'T12:00:00'), 5), 'dd/MM/yyyy')}</strong>
                </p>
              </div>
            )}

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