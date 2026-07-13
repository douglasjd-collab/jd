import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileSignature, Download, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import TermoAutorizacaoModal from './TermoAutorizacaoModal';
import AcompanhamentoAssinaturaCard from './AcompanhamentoAssinaturaCard';

const STATUS_LABELS = {
  gerado: 'Gerado',
  aguardando_assinatura: 'Aguardando assinatura',
  visualizado: 'Visualizado pelo cliente',
  assinado: 'Assinado',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
  substituido: 'Substituído por nova versão',
  invalidado: 'Assinatura invalidada',
};

const STATUS_COLORS = {
  gerado: 'bg-blue-100 text-blue-700',
  aguardando_assinatura: 'bg-amber-100 text-amber-700',
  visualizado: 'bg-cyan-100 text-cyan-700',
  assinado: 'bg-green-100 text-green-700',
  recusado: 'bg-red-100 text-red-700',
  cancelado: 'bg-slate-200 text-slate-600',
  substituido: 'bg-slate-100 text-slate-500',
  invalidado: 'bg-red-100 text-red-800',
};

const fmtDateTime = (d) => (d ? format(new Date(d), 'dd/MM/yyyy HH:mm') : '-');

export default function TermoAutorizacaoTab({ proposta, cliente, empresa, currentUser }) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: termos = [], isLoading } = useQuery({
    queryKey: ['termos-autorizacao', proposta?.id],
    enabled: !!proposta?.id,
    queryFn: () => base44.entities.TermoAutorizacao.filter({ proposta_id: proposta.id }, '-versao', 50),
  });

  const atual = termos[0];

  if (isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-800">Termo de Autorização</h3>
        <Button size="sm" className="gap-1.5 bg-[#23BE84] hover:bg-[#1da570]" onClick={() => setModalOpen(true)}>
          <FileSignature className="w-4 h-4" /> {atual ? 'Gerar Nova Versão' : 'Gerar Termo'}
        </Button>
      </div>

      <AcompanhamentoAssinaturaCard propostaId={proposta?.id} />

      {!atual ? (
        <div className="bg-slate-50 rounded-lg p-6 text-center text-sm text-slate-500">
          Nenhum Termo de Autorização gerado ainda para esta proposta.
        </div>
      ) : (
        <>
          <div className="bg-white border border-slate-100 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <Badge className={STATUS_COLORS[atual.status] || 'bg-slate-100 text-slate-600'}>
                {STATUS_LABELS[atual.status] || atual.status}
              </Badge>
              <span className="text-xs text-slate-400">Versão {atual.versao}</span>
            </div>
            {atual.status === 'invalidado' && (
              <div className="bg-red-50 border border-red-100 rounded-lg p-2 text-xs text-red-700">
                {atual.invalidado_motivo || 'Documento alterado após a assinatura. Gere uma nova versão e solicite as assinaturas novamente.'}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm mt-2">
              <div><span className="text-slate-400 text-xs">Cliente</span><p className="font-medium">{atual.cliente_nome || '-'}</p></div>
              <div><span className="text-slate-400 text-xs">CPF</span><p className="font-medium">{atual.cliente_cpf || '-'}</p></div>
              <div><span className="text-slate-400 text-xs">Banco</span><p className="font-medium">{atual.banco || '-'}</p></div>
              <div><span className="text-slate-400 text-xs">Tipo de Operação</span><p className="font-medium">{atual.tipo_operacao || '-'}</p></div>
              <div><span className="text-slate-400 text-xs">Contrato</span><p className="font-medium">{atual.contrato || '-'}</p></div>
              <div><span className="text-slate-400 text-xs">Gerado por</span><p className="font-medium">{atual.gerado_por_nome || '-'}</p></div>
              <div><span className="text-slate-400 text-xs">Data de geração</span><p className="font-medium">{fmtDateTime(atual.data_geracao)}</p></div>
              {atual.data_envio && <div><span className="text-slate-400 text-xs">Data de envio</span><p className="font-medium">{fmtDateTime(atual.data_envio)}</p></div>}
              {atual.data_assinatura && <div><span className="text-slate-400 text-xs">Data de assinatura</span><p className="font-medium">{fmtDateTime(atual.data_assinatura)}</p></div>}
              {atual.forma_assinatura && <div><span className="text-slate-400 text-xs">Forma de assinatura</span><p className="font-medium capitalize">{atual.forma_assinatura}</p></div>}
            </div>
            {atual.pdf_url && (
              <a href={atual.pdf_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5 mt-2">
                  <Download className="w-3.5 h-3.5" /> Ver PDF
                </Button>
              </a>
            )}
          </div>

          {termos.length > 1 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-600 mb-2">Histórico de versões</h4>
              <div className="space-y-2">
                {termos.slice(1).map((t) => (
                  <div key={t.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">v{t.versao}</span>
                      <Badge className={`${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-600'} text-xs`}>
                        {STATUS_LABELS[t.status] || t.status}
                      </Badge>
                      <span className="text-xs text-slate-400">{fmtDateTime(t.data_geracao)}</span>
                    </div>
                    {t.pdf_url && (
                      <a href={t.pdf_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs font-medium hover:underline">
                        Ver PDF
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <TermoAutorizacaoModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        proposta={proposta}
        cliente={cliente}
        empresa={empresa}
        currentUser={currentUser}
        onGerado={() => queryClient.invalidateQueries({ queryKey: ['termos-autorizacao', proposta.id] })}
      />
    </div>
  );
}