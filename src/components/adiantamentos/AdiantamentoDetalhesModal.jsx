import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Pencil, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import ComprovantesAnexos from './ComprovantesAnexos';
import {
  fmt, fmtData, STATUS_BADGE, STATUS_LABEL, tipoBadgeClass, nomeRecebedor,
  labelTipoRecebedor, inicialRecebedor, parseComprovantes, valoresAdiantamento, observacoesAdiantamento,
} from './adiantamentoHelpers';

function Campo({ label, children }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      <div className="text-sm text-slate-700 mt-0.5">{children}</div>
    </div>
  );
}

export default function AdiantamentoDetalhesModal({ open, onOpenChange, adiantamento, podeGerenciar = false, onEditar, onCancelar, onSalvarComprovantes }) {
  const [comprovantes, setComprovantes] = useState([]);

  useEffect(() => {
    setComprovantes(parseComprovantes(adiantamento));
  }, [adiantamento?.id, adiantamento?.comprovantes_json]);

  if (!adiantamento) return null;

  const nome = nomeRecebedor(adiantamento);
  const valores = valoresAdiantamento(adiantamento);
  const observacoes = observacoesAdiantamento(adiantamento);

  const alterarComprovantes = async (lista) => {
    const anterior = comprovantes;
    setComprovantes(lista);
    try {
      await onSalvarComprovantes(adiantamento, lista);
    } catch (e) {
      setComprovantes(anterior);
      toast.error('Não foi possível salvar o comprovante. Tente novamente.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 text-sm font-bold flex items-center justify-center">
              {inicialRecebedor(nome)}
            </span>
            <span className="min-w-0">
              <span className="block truncate">{nome}</span>
              <span className="flex items-center gap-1.5 mt-1">
                <Badge className={`text-[10px] font-medium border-0 ${tipoBadgeClass(adiantamento.pessoa_tipo)}`}>
                  {labelTipoRecebedor(adiantamento)}
                </Badge>
                <Badge className={`text-[10px] font-medium border ${STATUS_BADGE[adiantamento.status] || ''}`}>
                  {STATUS_LABEL[adiantamento.status] || adiantamento.status}
                </Badge>
              </span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Data">{fmtData(adiantamento.data)}</Campo>
            <Campo label="Motivo">{adiantamento.motivo || '—'}</Campo>
            <div className="col-span-2">
              <Campo label="Observações">{observacoes || '—'}</Campo>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-slate-50 py-2">
              <p className="text-[10px] text-slate-500">Valor original</p>
              <p className="text-sm font-bold text-slate-800">{fmt(valores.valorOriginal)}</p>
            </div>
            <div className="rounded-xl bg-green-50 py-2">
              <p className="text-[10px] text-green-700">Descontado</p>
              <p className="text-sm font-bold text-green-700">{fmt(valores.valorDescontado)}</p>
            </div>
            <div className="rounded-xl bg-orange-50 py-2">
              <p className="text-[10px] text-orange-700">Saldo pendente</p>
              <p className="text-sm font-bold text-orange-700">{adiantamento.status === 'cancelado' ? '—' : fmt(valores.saldoPendente)}</p>
            </div>
          </div>

          {valores.historico.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1.5">Histórico de descontos</p>
              <div className="space-y-1.5">
                {valores.historico.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-600 border-l-2 border-orange-200 pl-2.5">
                    <span className="font-semibold text-orange-700">{fmt(h.valor)}</span>
                    <span className="text-slate-400">•</span>
                    <span>{fmtData(h.data_desconto)}</span>
                    {(h.lote_codigo || h.lote_id) && (
                      <>
                        <span className="text-slate-400">•</span>
                        <span className="font-mono text-slate-500">{h.lote_codigo || h.lote_id}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {adiantamento.status === 'descontado' && valores.historico.length === 0 && adiantamento.data_desconto && (
            <p className="text-xs text-green-700">Descontado em {fmtData(adiantamento.data_desconto)}.</p>
          )}

          <div className="border-t border-slate-100 pt-4">
            <ComprovantesAnexos
              comprovantes={comprovantes}
              onChange={alterarComprovantes}
              podeEditar={podeGerenciar}
            />
          </div>
        </div>

        {podeGerenciar && (
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => onEditar(adiantamento)}>
              <Pencil className="w-4 h-4 mr-2" /> Editar
            </Button>
            {adiantamento.status === 'pendente' && (
              <Button variant="outline" className="text-red-600 hover:text-red-700" onClick={() => onCancelar(adiantamento)}>
                <XCircle className="w-4 h-4 mr-2" /> Cancelar
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}