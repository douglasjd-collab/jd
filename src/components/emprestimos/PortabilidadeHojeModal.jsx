import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { ArrowRightLeft, Building2, User, Calendar, DollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const formatCurrency = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

export default function PortabilidadeHojeModal({ open, onOpenChange, propostas = [] }) {
  const navigate = useNavigate();

  const totalValor = propostas.reduce((acc, p) => acc + (p.valor_credito || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-purple-700">
            <ArrowRightLeft className="w-5 h-5" />
            Portabilidades Previstas para Hoje
          </DialogTitle>
          <p className="text-sm text-slate-500">
            {format(new Date(), 'dd/MM/yyyy')} — {propostas.length} proposta(s) • Total: <strong>{formatCurrency(totalValor)}</strong>
          </p>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 space-y-3 pr-1">
          {propostas.length === 0 ? (
            <p className="text-center text-slate-500 py-8">Nenhuma portabilidade prevista para hoje</p>
          ) : (
            propostas.map(p => (
              <div
                key={p.id}
                className="p-4 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-purple-50 hover:border-purple-200 transition-colors"
                onClick={() => { onOpenChange(false); navigate(createPageUrl(`VendaEmprestimoDetalhes?id=${p.id}`)); }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-base flex-shrink-0">
                      {p.cliente_nome?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{p.cliente_nome}</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {p.administradora_nome && (
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <Building2 className="w-3 h-3" /> {p.administradora_nome}
                          </span>
                        )}
                        {p.emprestimo_banco_anterior && (
                          <span className="text-xs text-slate-400">← {p.emprestimo_banco_anterior}</span>
                        )}
                        {p.vendedor_nome && (
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <User className="w-3 h-3" /> {p.vendedor_nome}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-slate-900">{formatCurrency(p.valor_credito)}</p>
                    {p.data_venda && (
                      <p className="text-xs text-slate-400 flex items-center gap-1 justify-end mt-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(p.data_venda + 'T12:00:00'), 'dd/MM/yyyy')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}