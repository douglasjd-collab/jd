import React from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ehDespesaRecorrente, calcularExclusao, SCOPES_EXCLUSAO } from '@/components/meu_financeiro/exclusaoRecorrencia';

const fmtMoeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function ExclusaoDespesaDialog({ open, item, escopo, onEscopoChange, despesas, onConfirm, onClose, executando }) {
  if (!item) return null;

  const recorrente = ehDespesaRecorrente(item);
  const escopoAtual = recorrente ? escopo : 'esta';
  const selecionado = calcularExclusao(item, escopoAtual, despesas);

  const contagens = (recorrente ? SCOPES_EXCLUSAO : SCOPES_EXCLUSAO.slice(0, 1)).map(scope => ({
    ...scope,
    ...calcularExclusao(item, scope.valor, despesas),
  }));

  const nadaExcluir = selecionado.excluir.length === 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !executando && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir {item._tipo === 'receita' ? 'receita' : 'despesa'}</DialogTitle>
          <DialogDescription>
            {item.descricao}
            {item.valor != null && (
              <span className="block mt-1 font-semibold text-slate-700 dark:text-slate-200">{fmtMoeda(item.valor)}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        {recorrente && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">O que excluir</p>
            <div className="space-y-1.5">
              {contagens.map(scope => (
                <button
                  key={scope.valor}
                  type="button"
                  onClick={() => onEscopoChange(scope.valor)}
                  className={`w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    escopoAtual === scope.valor
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="font-medium">{scope.label}</span>
                  <span className="text-xs whitespace-nowrap">{scope.excluir.length} lançamento(s)</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3 space-y-1.5">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {selecionado.excluir.length} lançamento(s) serão excluídos definitivamente.
          </p>
          {selecionado.preservar.length > 0 && (
            <p className="text-xs text-amber-700 flex items-start gap-1.5">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
              {selecionado.preservar.length} parcela(s) já paga(s) serão preservadas para manter pagamentos e conciliação bancária.
            </p>
          )}
          {nadaExcluir && (
            <p className="text-xs text-amber-700 flex items-start gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              Nada pode ser excluído neste escopo: as parcelas estão pagas. Estorne o pagamento antes de excluir.
            </p>
          )}
          {!nadaExcluir && (
            <p className="text-xs text-slate-500">Esta ação não pode ser desfeita.</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={executando}>Cancelar</Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={onConfirm}
            disabled={executando || nadaExcluir}
          >
            {executando ? 'Excluindo...' : `Excluir ${selecionado.excluir.length} lançamento(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}