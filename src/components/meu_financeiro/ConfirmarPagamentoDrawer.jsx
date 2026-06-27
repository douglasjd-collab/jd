import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ArrowUpCircle, ArrowDownCircle, CheckCircle2, XCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const fmtMoeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function ConfirmarPagamentoDrawer({ open, onClose, transacao, onConfirmar, tipo }) {
  if (!transacao) return null;

  const isReceita = tipo === 'receita';
  const statusAtual = transacao.status;
  const jaPago = isReceita ? statusAtual === 'recebida' : statusAtual === 'pago';
  const estaPendente = ['pendente', 'previsto'].includes(statusAtual);

  const titulo = isReceita 
    ? (jaPago ? 'Receita já Recebida' : 'Confirmar Recebimento') 
    : (jaPago ? 'Despesa já Paga' : 'Confirmar Pagamento');

  const icone = isReceita ? ArrowUpCircle : ArrowDownCircle;
  const corIcone = isReceita ? 'text-green-600' : 'text-red-600';
  const corBg = isReceita ? 'bg-green-100' : 'bg-red-100';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-800">{titulo}</DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Informações da transação */}
          <div className={`${corBg} rounded-lg p-4 flex items-start gap-3`}>
            <div className={`w-10 h-10 rounded-full ${corBg} flex items-center justify-center flex-shrink-0`}>
              <icone className={`w-5 h-5 ${corIcone}`} />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-800">{transacao.descricao}</p>
              <p className="text-sm text-slate-500">{transacao.categoria || 'Sem categoria'}</p>
              <p className={`text-lg font-bold mt-1 ${isReceita ? 'text-green-600' : 'text-red-600'}`}>
                {isReceita ? '+' : '-'} {fmtMoeda(transacao.valor)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Vencimento: {transacao.data_vencimento || transacao.data ? format(parseISO(transacao.data_vencimento || transacao.data), 'dd/MM/yyyy', { locale: ptBR }) : '-'}
              </p>
            </div>
          </div>

          {/* Status atual */}
          <div className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
            <span className="text-sm font-medium text-slate-700">Status atual:</span>
            <Badge className={jaPago ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
              {jaPago ? (isReceita ? 'Recebida' : 'Pago') : 'Pendente'}
            </Badge>
          </div>

          {jaPago ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
              <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <p className="text-sm text-green-700 font-medium">Esta transação já foi {isReceita ? 'recebida' : 'paga'}!</p>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
              <p className="text-sm text-amber-700 font-medium">
                Deseja marcar esta transação como {isReceita ? 'recebida' : 'paga'}?
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          {!jaPago && (
            <Button 
              onClick={onConfirmar}
              className={isReceita ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Confirmar {isReceita ? 'Recebimento' : 'Pagamento'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}