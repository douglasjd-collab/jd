import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Paperclip, Pencil, XCircle, Upload } from 'lucide-react';
import {
  fmt, fmtData, STATUS_BADGE, STATUS_LABEL, tipoBadgeClass, nomeRecebedor,
  labelTipoRecebedor, inicialRecebedor, parseComprovantes, valoresAdiantamento,
} from './adiantamentoHelpers';

export default function AdiantamentoCard({ adiantamentos = [], podeGerenciar = false, onAbrir, onEditar, onAnexar, onCancelar }) {
  return (
    <div className="lg:hidden space-y-2">
      {adiantamentos.map(a => {
        const nome = nomeRecebedor(a);
        const valores = valoresAdiantamento(a);
        const anexos = parseComprovantes(a);
        return (
          <Card key={a.id} className="p-3 active:bg-slate-50" onClick={() => onAbrir(a)}>
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 text-sm font-bold flex items-center justify-center flex-shrink-0">
                {inicialRecebedor(nome)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 text-sm truncate">{nome}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <Badge className={`text-[10px] font-medium border-0 ${tipoBadgeClass(a.pessoa_tipo)}`}>
                    {labelTipoRecebedor(a)}
                  </Badge>
                  <Badge className={`text-[10px] font-medium border ${STATUS_BADGE[a.status] || ''}`}>
                    {STATUS_LABEL[a.status] || a.status}
                  </Badge>
                  {valores.descontoParcial && (
                    <Badge className="text-[10px] font-medium border-0 bg-orange-100 text-orange-700">desconto parcial</Badge>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1 truncate">
                  {fmtData(a.data)}{a.motivo ? ` • ${a.motivo}` : ''}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div className="rounded-lg bg-slate-50 py-1.5">
                <p className="text-[10px] text-slate-500">Adiantado</p>
                <p className="text-xs font-bold text-slate-800">{fmt(valores.valorOriginal)}</p>
              </div>
              <div className="rounded-lg bg-green-50 py-1.5">
                <p className="text-[10px] text-green-700">Descontado</p>
                <p className="text-xs font-bold text-green-700">{fmt(valores.valorDescontado)}</p>
              </div>
              <div className="rounded-lg bg-orange-50 py-1.5">
                <p className="text-[10px] text-orange-700">Saldo</p>
                <p className="text-xs font-bold text-orange-700">{a.status === 'cancelado' ? '—' : fmt(valores.saldoPendente)}</p>
              </div>
            </div>

            <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-slate-100">
              {anexos.length > 0 ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                  <Paperclip className="w-3.5 h-3.5" /> {anexos.length} comprovante{anexos.length > 1 ? 's' : ''}
                </span>
              ) : (
                <span className="text-[11px] text-slate-400">Sem comprovante</span>
              )}
              {podeGerenciar && (
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onEditar(a)}>
                    <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onAnexar(a)}>
                    <Upload className="w-3.5 h-3.5 mr-1" /> Anexar
                  </Button>
                  {a.status === 'pendente' && (
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-600" onClick={() => onCancelar(a)}>
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Cancelar
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}