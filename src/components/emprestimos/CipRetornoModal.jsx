import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { format } from 'date-fns';
import { DollarSign, User, Building2, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const formatCurrency = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function CipRetornoModal({ open, onOpenChange, propostas }) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-700">
            <DollarSign className="w-5 h-5" />
            Retorno de Saldo CIP — Hoje ({format(new Date(), 'dd/MM/yyyy')})
          </DialogTitle>
          <p className="text-sm text-slate-500">{propostas.length} proposta(s) com retorno previsto para hoje</p>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          {propostas.length === 0 ? (
            <p className="text-center text-slate-400 py-8">Nenhuma proposta com retorno previsto para hoje</p>
          ) : (
            propostas.map((p) => (
              <div
                key={p.id}
                className="bg-orange-50 border border-orange-200 rounded-xl p-4 cursor-pointer hover:bg-orange-100 transition-colors"
                onClick={() => {
                  onOpenChange(false);
                  navigate(createPageUrl(`VendaEmprestimoDetalhes?id=${p.id}`));
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-bold text-slate-900">{p.cliente_nome}</p>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-slate-500">
                      {p.administradora_nome && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" /> {p.administradora_nome}
                        </span>
                      )}
                      {p.vendedor_nome && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" /> {p.vendedor_nome}
                        </span>
                      )}
                      {p.cip_data_entrada && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Entrou na CIP em: {format(new Date(p.cip_data_entrada + 'T12:00:00'), 'dd/MM/yyyy')}
                        </span>
                      )}
                    </div>
                  </div>
                  {p.cip_valor_previsto > 0 && (
                    <div className="text-right">
                      <p className="text-xs text-orange-600 font-medium">Saldo previsto</p>
                      <p className="font-bold text-orange-800 text-base">{formatCurrency(p.cip_valor_previsto)}</p>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}