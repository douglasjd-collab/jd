import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Printer, Calculator, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

const formatCurrency = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const STATUS_BADGE = {
  ativa: 'bg-blue-100 text-blue-700',
  convertida: 'bg-green-100 text-green-700',
  cancelada: 'bg-red-100 text-red-700',
};

function soDigitos(v) {
  return (v || '').toString().replace(/\D/g, '');
}

export default function OportunidadeAbaSimulacoes({ oportunidade }) {
  const telefone = oportunidade?.cliente_telefone || oportunidade?.telefone_lead;

  const { data: simulacoes = [], isLoading } = useQuery({
    queryKey: ['simulacoes-oportunidade', oportunidade?.id, telefone],
    queryFn: async () => {
      const lista = [];
      const vistos = new Set();

      // 1. Vinculadas diretamente à oportunidade
      const porOportunidade = await base44.entities.Simulacao.filter(
        { oportunidade_id: oportunidade.id },
        '-created_date',
        100
      );
      porOportunidade.forEach((s) => {
        if (!vistos.has(s.id)) { vistos.add(s.id); lista.push(s); }
      });

      // 2. Mesmo telefone do cliente (simulações feitas antes do funil)
      if (telefone) {
        const todas = await base44.entities.Simulacao.filter({}, '-created_date', 500);
        const alvo = soDigitos(telefone);
        todas.forEach((s) => {
          if (!vistos.has(s.id) && alvo && soDigitos(s.telefone) === alvo) {
            vistos.add(s.id);
            lista.push(s);
          }
        });
      }

      return lista.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    },
    enabled: !!oportunidade?.id,
  });

  const imprimir = (id) => {
    window.open(`/ImprimirSimulacao?id=${id}`, '_blank');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (simulacoes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-6">
        <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
          <Calculator className="w-7 h-7 text-slate-400" />
        </div>
        <p className="text-slate-600 font-medium">Nenhuma simulação encontrada</p>
        <p className="text-sm text-slate-400 mt-1">
          As simulações feitas para este cliente aparecerão aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {simulacoes.map((s) => (
        <div
          key={s.id}
          className="border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span className="font-semibold text-slate-900 capitalize">
                  {s.tipo_grupo || 'Automóvel'}
                </span>
                {s.status && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_BADGE[s.status] || 'bg-slate-100 text-slate-600'}`}>
                    {s.status}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div className="text-slate-500">
                  Crédito: <span className="font-semibold text-slate-800">{formatCurrency(s.credito_total)}</span>
                </div>
                <div className="text-slate-500">
                  Parcela: <span className="font-semibold text-slate-800">{formatCurrency(s.parcela_total)}</span>
                </div>
                {s.prazo_original > 0 && (
                  <div className="text-slate-500">
                    Prazo: <span className="font-semibold text-slate-800">{s.prazo_original} meses</span>
                  </div>
                )}
                {s.administradora && (
                  <div className="text-slate-500 capitalize">
                    Adm.: <span className="font-semibold text-slate-800">{s.administradora}</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-2">
                {s.created_date ? format(new Date(s.created_date), "dd/MM/yyyy 'às' HH:mm") : ''}
                {s.usuario_nome ? ` • ${s.usuario_nome}` : ''}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 flex-shrink-0"
              onClick={() => imprimir(s.id)}
            >
              <Printer className="w-3.5 h-3.5" />
              2ª via
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}