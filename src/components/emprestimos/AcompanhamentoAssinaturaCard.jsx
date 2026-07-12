import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy, XCircle, FileSignature } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_LABELS = {
  nao_aplicavel: 'Não liberado',
  pendente: 'Aguardando',
  visualizado: 'Visualizado',
  assinado: 'Assinado',
  recusado: 'Recusado',
};

const STATUS_COLORS = {
  nao_aplicavel: 'bg-slate-100 text-slate-500',
  pendente: 'bg-amber-100 text-amber-700',
  visualizado: 'bg-cyan-100 text-cyan-700',
  assinado: 'bg-green-100 text-green-700',
  recusado: 'bg-red-100 text-red-700',
};

const ROLE_LABELS = {
  cliente: 'Cliente',
  testemunha1: 'Testemunha 1',
  testemunha2: 'Testemunha 2',
  representante: 'Representante da empresa',
};

export default function AcompanhamentoAssinaturaCard({ propostaId }) {
  const queryClient = useQueryClient();

  const { data: solicitacoes = [] } = useQuery({
    queryKey: ['solicitacoes-assinatura', propostaId],
    enabled: !!propostaId,
    queryFn: () => base44.entities.SolicitacaoAssinatura.filter({ proposta_id: propostaId }, '-data_criacao', 1),
  });

  const sol = solicitacoes[0];
  if (!sol) return null;

  let ordem = [];
  try { ordem = JSON.parse(sol.ordem_json || '[]'); } catch { ordem = []; }

  const linkFor = (token) => `${window.location.origin}/assinar/${token}`;
  const copiar = (token) => {
    navigator.clipboard.writeText(linkFor(token));
    toast.success('Link copiado!');
  };

  const cancelar = async () => {
    await base44.entities.SolicitacaoAssinatura.update(sol.id, { status: 'cancelado' });
    queryClient.invalidateQueries({ queryKey: ['solicitacoes-assinatura', propostaId] });
    toast.success('Solicitação cancelada.');
  };

  const emAndamento = !['assinado', 'recusado', 'cancelado'].includes(sol.status);

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-slate-700 flex items-center gap-1.5"><FileSignature className="w-4 h-4" /> Acompanhamento de Assinatura</h4>
        {emAndamento && (
          <Button variant="outline" size="sm" className="gap-1.5 text-red-600" onClick={cancelar}>
            <XCircle className="w-3.5 h-3.5" /> Cancelar solicitação
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {ordem.map((role) => {
          const status = sol[`${role}_status`] || 'nao_aplicavel';
          const token = sol[`${role}_token`];
          return (
            <div key={role} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{ROLE_LABELS[role]}</span>
                <Badge className={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Badge>
              </div>
              {token && status !== 'assinado' && status !== 'recusado' && (
                <Button variant="ghost" size="sm" className="gap-1 text-blue-600" onClick={() => copiar(token)}>
                  <Copy className="w-3.5 h-3.5" /> Copiar link
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {sol.status === 'recusado' && sol.motivo_recusa && (
        <p className="text-xs text-red-600">Motivo da recusa: {sol.motivo_recusa}</p>
      )}
    </div>
  );
}