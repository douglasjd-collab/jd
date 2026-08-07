import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Printer, ArrowLeft, Link2, Copy, Send, Loader2, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import PropostaSimulacaoConteudo from '@/components/simulador/PropostaSimulacaoConteudo';

export default function ImprimirSimulacao() {
  const [simulacao, setSimulacao] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [gerandoLink, setGerandoLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    loadSimulacao();
  }, []);

  // Auto-impressão (2ª via): quando a URL contém ?autoPrint=1, dispara o
  // diálogo de impressão automaticamente após carregar e renderizar a
  // simulação — produz PDF idêntico ao gerado durante a simulação.
  useEffect(() => {
    if (!simulacao) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('autoPrint') === '1') {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [simulacao]);

  const loadSimulacao = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams(window.location.search);
      const id = params.get('id');

      // Buscar a simulação: por id (fluxo normal) ou a mais recente (preview sem id)
      const result = id
        ? await base44.entities.Simulacao.filter({ id })
        : await base44.entities.Simulacao.list('-created_date', 1);

      if (!result || result.length === 0) {
        throw new Error('Simulação não encontrada');
      }

      setSimulacao(result[0]);
    } catch (err) {
      console.error('Erro ao carregar simulação:', err);
      setError(err.message || 'Erro ao carregar simulação');
    } finally {
      setLoading(false);
    }
  };

  const handleImprimir = () => {
    window.print();
  };

  const handleGerarLink = async () => {
    if (!simulacao?.id) {
      toast.error('Simulação não carregada.');
      return;
    }
    setGerandoLink(true);
    setCopiado(false);
    try {
      const resp = await base44.functions.invoke('gerarLinkPropostaSimulacao', {
        simulacao_id: simulacao.id,
        base_url: window.location.origin,
      });
      const url = resp?.data?.link_url;
      if (!url) throw new Error('Não foi possível gerar o link.');
      setLinkUrl(url);
      setLinkModalOpen(true);
    } catch (err) {
      console.error('Erro ao gerar link:', err);
      toast.error('Erro ao gerar link: ' + (err?.message || 'Erro desconhecido'));
    } finally {
      setGerandoLink(false);
    }
  };

  const handleCopiarLink = async () => {
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopiado(true);
      toast.success('Link copiado!');
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error('Não foi possível copiar. Copie manualmente.');
    }
  };

  const handleEnviarWhatsApp = () => {
    const nome = simulacao?.cliente_nome || 'cliente';
    const primeiroNome = nome.split(' ')[0] || nome;
    const msg = `Olá ${primeiroNome}! 👋\n\nSegue o link da sua simulação de consórcio:\n${linkUrl}\n\nQualquer dúvida, estou à disposição!`;
    const telefone = (simulacao?.telefone || '').replace(/\D/g, '');
    let numero = telefone;
    if (!numero.startsWith('55') && numero.length >= 10 && numero.length <= 11) {
      numero = '55' + numero;
    }
    const url = numero
      ? `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#23BE84]"></div>
        <p className="text-slate-600 font-medium">Carregando simulação...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
        <div className="text-red-500 text-6xl">⚠️</div>
        <p className="text-slate-900 font-semibold text-xl">Erro ao carregar simulação</p>
        <p className="text-slate-600">{error}</p>
        <button
          onClick={() => window.close()}
          className="mt-4 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700"
        >
          Fechar
        </button>
      </div>
    );
  }

  if (!simulacao) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="text-slate-400 text-6xl">📄</div>
        <p className="text-slate-900 font-semibold text-xl">Simulação não encontrada</p>
        <p className="text-slate-600">Verifique se o link está correto</p>
        <button
          onClick={() => window.close()}
          className="mt-4 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700"
        >
          Fechar
        </button>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 0.5cm; size: A4; }
          aside, nav, header { display: none !important; }
          main { margin: 0 !important; padding: 0 !important; width: 100% !important; }
        }
      `}</style>

      <div className="bg-white">
        {/* Botões */}
        <div className="no-print fixed top-4 left-4 right-4 z-50 flex justify-between items-center gap-2 flex-wrap">
          <Button variant="outline" className="gap-2 shadow-lg"
            onClick={() => {
              localStorage.setItem('simulacao_ultima_nome', simulacao.cliente_nome || '');
              localStorage.setItem('simulacao_ultimo_telefone', simulacao.telefone || '');
              window.location.href = '/SimuladorNormal';
            }}>
            <ArrowLeft className="w-4 h-4" /> Voltar ao Simulador
          </Button>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={handleGerarLink}
              disabled={gerandoLink}
              variant="outline"
              className="gap-2 shadow-lg border-[#083942] text-[#083942] hover:bg-[#083942]/10"
            >
              {gerandoLink ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Gerando link...</>
              ) : (
                <><Link2 className="w-4 h-4" /> Gerar Link</>
              )}
            </Button>
            <Button onClick={handleImprimir} className="gap-2 shadow-lg bg-[#083942] hover:bg-[#10353C] px-6">
              <Printer className="w-4 h-4" /> Imprimir / Salvar PDF
            </Button>
          </div>
        </div>

        <PropostaSimulacaoConteudo simulacao={simulacao} />
      </div>

      {/* Modal do Link Gerado */}
      <Dialog open={linkModalOpen} onOpenChange={setLinkModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-[#083942]" /> Link da proposta gerado
            </DialogTitle>
            <DialogDescription>
              Envie este link ao cliente. Quando ele abrir, você receberá um alerta no WhatsApp.
              Se ele não abrir em 3h, você também será avisado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <input
                readOnly
                value={linkUrl}
                className="flex-1 bg-transparent text-sm text-slate-700 outline-none min-w-0"
                onFocus={(e) => e.target.select()}
              />
              <Button size="sm" variant="ghost" onClick={handleCopiarLink} className="shrink-0">
                {copiado ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={handleEnviarWhatsApp}
                className="gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white"
              >
                <Send className="w-4 h-4" /> Enviar no WhatsApp
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open(linkUrl, '_blank')}
                className="gap-2"
              >
                <ExternalLink className="w-4 h-4" /> Abrir link
              </Button>
            </div>

            <p className="text-xs text-slate-500 text-center">
              O conteúdo do link é idêntico ao PDF desta simulação.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}