import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Copy, FileSignature, CheckCircle2, Clock, Download, Loader2, ShieldCheck, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { gerarTermoComAssinaturasPDF } from './gerarTermoComAssinaturas';

const STATUS_LABELS = {
  nao_aplicavel: 'Não liberado',
  pendente: 'Aguardando assinatura',
  visualizado: 'Visualizou o documento',
  assinado: 'Assinado',
  recusado: 'Recusou assinar',
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

export default function AcompanhamentoAssinaturasModal({ open, onOpenChange, proposta, currentUser }) {
  const propostaId = proposta?.id;
  const queryClient = useQueryClient();
  const [baixando, setBaixando] = useState(false);
  const [conferindo, setConferindo] = useState(null); // 'aprovar' | 'reprovar' | null
  const [showReprovar, setShowReprovar] = useState(false);
  const [motivoReprovacao, setMotivoReprovacao] = useState('');

  const { data: solicitacoes = [], isLoading } = useQuery({
    queryKey: ['solicitacoes-assinatura', propostaId],
    enabled: open && !!propostaId,
    queryFn: () => base44.entities.SolicitacaoAssinatura.filter({ proposta_id: propostaId }, '-data_criacao', 1),
  });

  const sol = solicitacoes[0];
  let ordem = [];
  try { ordem = JSON.parse(sol?.ordem_json || '[]'); } catch { ordem = []; }

  const todasAssinaturasConcluidas = sol?.status === 'assinado' || sol?.status === 'aguardando_conferencia';
  const aguardandoConferencia = sol?.status === 'aguardando_conferencia';

  const { data: termo } = useQuery({
    queryKey: ['termo-autorizacao-assinatura', sol?.termo_autorizacao_id],
    enabled: !!sol?.termo_autorizacao_id && todasAssinaturasConcluidas,
    queryFn: () => base44.entities.TermoAutorizacao.get(sol.termo_autorizacao_id),
  });

  const { data: cliente } = useQuery({
    queryKey: ['cliente-assinatura', proposta?.cliente_id],
    enabled: open && !!proposta?.cliente_id && todasAssinaturasConcluidas,
    queryFn: () => base44.entities.Cliente.get(proposta.cliente_id),
  });

  const { data: empresa } = useQuery({
    queryKey: ['empresa-assinatura', proposta?.empresa_id],
    enabled: open && !!proposta?.empresa_id && todasAssinaturasConcluidas,
    queryFn: async () => (await base44.entities.Empresa.filter({ id: proposta.empresa_id }))?.[0] || null,
  });

  const copiarLink = (token) => {
    const link = `${window.location.origin}/assinar/${token}`;
    navigator.clipboard.writeText(link);
    toast.success('Link de assinatura copiado!');
  };

  const nomeArquivo = () =>
    `Contrato_Assinado_${(proposta?.cliente_nome || 'cliente').replace(/\s+/g, '_')}_${(proposta?.contrato || '').replace(/\s+/g, '_')}.pdf`;

  const handleBaixarAssinado = async () => {
    if (termo?.pdf_assinado_url) {
      window.open(termo.pdf_assinado_url, '_blank');
      return;
    }
    setBaixando(true);
    try {
      const { doc: docPdf, hashFinal } = await gerarTermoComAssinaturasPDF({ proposta, cliente, empresa, solicitacao: sol, termo });
      if (termo) {
        const blob = docPdf.output('blob');
        const file = new File([blob], nomeArquivo(), { type: 'application/pdf' });
        const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
        await base44.entities.TermoAutorizacao.update(termo.id, {
          pdf_assinado_url: file_url,
          hash_final: hashFinal,
          qr_code_url: `${window.location.origin}/validar/${termo.id}`,
        });
        queryClient.invalidateQueries({ queryKey: ['termo-autorizacao-assinatura', sol.termo_autorizacao_id] });
      }
      docPdf.save(nomeArquivo());
    } catch (e) {
      toast.error('Erro ao gerar o termo assinado: ' + e.message);
    } finally {
      setBaixando(false);
    }
  };

  const handleAprovar = async () => {
    setConferindo('aprovar');
    try {
      const agora = new Date().toISOString();
      await base44.entities.SolicitacaoAssinatura.update(sol.id, {
        status: 'assinado',
        conferido_por_id: currentUser?.auth_id || currentUser?.id,
        conferido_por_nome: currentUser?.nome_perfil || currentUser?.full_name,
        data_conferencia: agora,
      });
      if (sol.termo_autorizacao_id) {
        await base44.entities.TermoAutorizacao.update(sol.termo_autorizacao_id, {
          status: 'assinado',
          conferido_por_id: currentUser?.auth_id || currentUser?.id,
          conferido_por_nome: currentUser?.nome_perfil || currentUser?.full_name,
          data_conferencia: agora,
        });
      }
      toast.success('Assinatura conferida e aprovada! Processo finalizado.');
      queryClient.invalidateQueries({ queryKey: ['solicitacoes-assinatura', propostaId] });
      queryClient.invalidateQueries({ queryKey: ['termo-autorizacao-assinatura', sol.termo_autorizacao_id] });
      queryClient.invalidateQueries({ queryKey: ['gerenciador-assinaturas'] });
      onOpenChange(false);
    } catch (e) {
      toast.error('Erro ao aprovar: ' + e.message);
    } finally {
      setConferindo(null);
    }
  };

  const handleReprovar = async () => {
    if (!motivoReprovacao.trim()) {
      toast.error('Informe o motivo da reprovação.');
      return;
    }
    setConferindo('reprovar');
    try {
      const agora = new Date().toISOString();
      await base44.entities.SolicitacaoAssinatura.update(sol.id, {
        status: 'cancelado',
        conferido_por_id: currentUser?.auth_id || currentUser?.id,
        conferido_por_nome: currentUser?.nome_perfil || currentUser?.full_name,
        data_conferencia: agora,
        motivo_reprovacao: motivoReprovacao.trim(),
      });
      if (sol.termo_autorizacao_id) {
        await base44.entities.TermoAutorizacao.update(sol.termo_autorizacao_id, {
          status: 'cancelado',
          conferido_por_id: currentUser?.auth_id || currentUser?.id,
          conferido_por_nome: currentUser?.nome_perfil || currentUser?.full_name,
          data_conferencia: agora,
          motivo_reprovacao: motivoReprovacao.trim(),
        });
      }
      toast.success('Assinatura reprovada e cancelada. Você pode gerar um novo termo e reenviar para assinatura.');
      queryClient.invalidateQueries({ queryKey: ['solicitacoes-assinatura', propostaId] });
      queryClient.invalidateQueries({ queryKey: ['termo-autorizacao-assinatura', sol.termo_autorizacao_id] });
      queryClient.invalidateQueries({ queryKey: ['gerenciador-assinaturas'] });
      onOpenChange(false);
    } catch (e) {
      toast.error('Erro ao reprovar: ' + e.message);
    } finally {
      setConferindo(null);
    }
  };

  const assinaram = ordem.filter((role) => sol?.[`${role}_status`] === 'assinado');
  const faltam = ordem.filter((role) => sol?.[`${role}_status`] !== 'assinado' && sol?.[`${role}_status`] !== 'nao_aplicavel');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="w-5 h-5" /> Acompanhamento de Assinaturas
          </DialogTitle>
        </DialogHeader>

        {proposta && (
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <p className="font-semibold text-slate-700">{proposta.cliente_nome}</p>
            <p className="text-slate-500">Contrato: {proposta.contrato || '-'}</p>
          </div>
        )}

        {aguardandoConferencia && (
          <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3 text-sm text-cyan-800 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Todas as assinaturas foram coletadas. Aguardando conferência para aprovação.</span>
          </div>
        )}

        {aguardandoConferencia && !showReprovar && (
          <div className="flex gap-2">
            <Button
              className="gap-1.5 bg-[#23BE84] hover:bg-[#1da570] flex-1"
              onClick={handleAprovar}
              disabled={!!conferindo}
            >
              {conferindo === 'aprovar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Aprovar Assinatura
            </Button>
            <Button
              variant="outline"
              className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 flex-1"
              onClick={() => setShowReprovar(true)}
              disabled={!!conferindo}
            >
              <XCircle className="w-4 h-4" />
              Reprovar e Refazer
            </Button>
          </div>
        )}

        {aguardandoConferencia && showReprovar && (
          <div className="space-y-3 border border-red-200 rounded-lg p-3 bg-red-50">
            <div className="flex items-start gap-2 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>A assinatura será cancelada e todos os signatários deverão assinar novamente. Informe o motivo:</span>
            </div>
            <Textarea
              placeholder="Motivo da reprovação (ex: assinatura divergente, dados incorretos...)"
              value={motivoReprovacao}
              onChange={(e) => setMotivoReprovacao(e.target.value)}
              rows={3}
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setShowReprovar(false); setMotivoReprovacao(''); }} disabled={!!conferindo}>
                Cancelar
              </Button>
              <Button variant="destructive" className="gap-1.5 flex-1" onClick={handleReprovar} disabled={!!conferindo}>
                {conferindo === 'reprovar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Confirmar Reprovação
              </Button>
            </div>
          </div>
        )}

        {todasAssinaturasConcluidas && (
          <Button
            className="gap-1.5 bg-[#23BE84] hover:bg-[#1da570] w-full"
            onClick={handleBaixarAssinado}
            disabled={baixando}
          >
            {baixando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Baixar Contrato com Assinaturas
          </Button>
        )}

        {isLoading ? (
          <p className="text-sm text-slate-400 text-center py-6">Carregando...</p>
        ) : !sol ? (
          <div className="text-center py-8 text-sm text-slate-500">
            Nenhuma solicitação de assinatura foi enviada para esta proposta ainda.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-green-700">
                <CheckCircle2 className="w-4 h-4" /> {assinaram.length} assinaram
              </span>
              <span className="flex items-center gap-1.5 text-amber-700">
                <Clock className="w-4 h-4" /> {faltam.length} faltam
              </span>
            </div>

            <div className="space-y-2">
              {ordem.map((role) => {
                const status = sol[`${role}_status`] || 'nao_aplicavel';
                const token = sol[`${role}_token`];
                const nome = sol[`${role}_nome`];
                const podeCopiar = token && status !== 'assinado' && status !== 'recusado';
                return (
                  <div key={role} className="flex items-center justify-between bg-white border border-slate-100 rounded-lg px-3 py-2.5 text-sm">
                    <div>
                      <p className="font-medium text-slate-700">{ROLE_LABELS[role]}{nome ? ` — ${nome}` : ''}</p>
                      <Badge className={`${STATUS_COLORS[status]} mt-1`}>{STATUS_LABELS[status]}</Badge>
                    </div>
                    {podeCopiar && (
                      <Button variant="outline" size="sm" className="gap-1.5 text-blue-600 border-blue-200" onClick={() => copiarLink(token)}>
                        <Copy className="w-3.5 h-3.5" /> Copiar link
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {sol.status === 'recusado' && sol.motivo_recusa && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">
                Motivo da recusa: {sol.motivo_recusa}
              </p>
            )}

            {sol.status === 'cancelado' && sol.motivo_reprovacao && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">
                Reprovado em conferência: {sol.motivo_reprovacao}
              </p>
            )}

            {sol.status === 'assinado' && sol.data_conferencia && (
              <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg p-2">
                Conferido e aprovado por {sol.conferido_por_nome || 'administrador'} em {new Date(sol.data_conferencia).toLocaleString('pt-BR')}.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}