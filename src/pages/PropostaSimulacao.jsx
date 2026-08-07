import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Printer, Loader2, ShieldCheck } from 'lucide-react';
import PropostaSimulacaoConteudo from '@/components/simulador/PropostaSimulacaoConteudo';

// Página PÚBLICA (sem login) que exibe a proposta de simulação de consórcio via link.
// O conteúdo é idêntico ao PDF gerado na tela de impressão (mesmo componente).
// Ao carregar, registra a abertura e dispara o alerta no WhatsApp do vendedor.

export default function PropostaSimulacao() {
  const { token } = useParams();
  const [simulacao, setSimulacao] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Auto-impressão opcional (?autoPrint=1)
  useEffect(() => {
    if (!simulacao) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('autoPrint') === '1') {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [simulacao]);

  const carregar = async () => {
    try {
      setLoading(true);
      setError(null);
      const resp = await base44.functions.invoke('acessarPropostaLink', { token });
      if (resp?.data?.simulacao) {
        setSimulacao(resp.data.simulacao);
      } else {
        setError('Não foi possível carregar a proposta.');
      }
    } catch (err) {
      console.error('Erro ao carregar proposta:', err);
      setError(err?.response?.data?.error || err?.message || 'Erro ao carregar proposta');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-[#23BE84]" />
        <p className="text-slate-600 font-medium">Carregando proposta...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
        <div className="text-red-500 text-6xl">⚠️</div>
        <p className="text-slate-900 font-semibold text-xl">Proposta não encontrada</p>
        <p className="text-slate-600 text-center max-w-md">{error}</p>
      </div>
    );
  }

  if (!simulacao) return null;

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 0.5cm; size: A4; }
        }
      `}</style>

      <div className="bg-white min-h-screen">
        <div className="no-print fixed top-4 right-4 z-50 flex justify-end">
          <Button onClick={() => window.print()} className="gap-2 shadow-lg bg-[#083942] hover:bg-[#10353C] px-6">
            <Printer className="w-4 h-4" /> Imprimir / Salvar PDF
          </Button>
        </div>

        <PropostaSimulacaoConteudo simulacao={simulacao} />

        <div className="no-print max-w-3xl mx-auto px-6 pb-10 text-center">
          <p className="text-xs text-slate-400 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Proposta gerada por JD Promotora
          </p>
        </div>
      </div>
    </>
  );
}