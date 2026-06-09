import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Sparkles, Loader2 } from 'lucide-react';

export default function PainelIAFunil({ oportunidade, onClose, formatCurrency, calcularTempoNaEtapa }) {
  const [loading, setLoading] = useState(false);
  const [analise, setAnalise] = useState(null);

  const gerarAnalise = async () => {
    setLoading(true);
    try {
      const prompt = `Analise esta oportunidade de vendas e responda em JSON:
Nome: ${oportunidade.titulo}
Cliente: ${oportunidade.cliente_nome || 'Não informado'}
Produto: ${oportunidade.produto || 'Consórcio'}
Valor: ${formatCurrency(oportunidade.valor_estimado || 0)}
Status: ${oportunidade.status}
Última movimentação: ${oportunidade.data_ultima_movimentacao ? calcularTempoNaEtapa(oportunidade.data_ultima_movimentacao) : 'Desconhecida'}
Previsão fechamento: ${oportunidade.data_fechamento_prevista || 'Não informada'}
Observações: ${oportunidade.observacoes || 'Nenhuma'}

Retorne JSON com: resumo (string curta), temperatura (string: "Quente","Morno","Frio"), chance_fechamento (número 0-100), proxima_acao (string), mensagem_sugerida (string em português para WhatsApp).`;

      const resp = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            resumo: { type: 'string' },
            temperatura: { type: 'string' },
            chance_fechamento: { type: 'number' },
            proxima_acao: { type: 'string' },
            mensagem_sugerida: { type: 'string' },
          }
        }
      });
      setAnalise(resp);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const tempCor = {
    Quente: 'text-red-600 bg-red-50 border-red-200',
    Morno: 'text-orange-600 bg-orange-50 border-orange-200',
    Frio: 'text-blue-600 bg-blue-50 border-blue-200',
  };

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200" onClick={e => e.stopPropagation()}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600 to-purple-700 text-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          <span className="font-bold">Análise IA</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/20 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Info do lead */}
        <div className="bg-slate-50 rounded-xl p-3 border">
          <p className="text-xs text-slate-500 font-medium">Lead</p>
          <p className="font-semibold text-slate-800">{oportunidade.titulo}</p>
          {oportunidade.cliente_nome && <p className="text-xs text-slate-500 mt-0.5">{oportunidade.cliente_nome}</p>}
          <p className="text-sm font-bold text-emerald-600 mt-1">{formatCurrency(oportunidade.valor_estimado || 0)}</p>
          {oportunidade.data_ultima_movimentacao && (
            <p className="text-xs text-orange-600 mt-1">⏱️ Há {calcularTempoNaEtapa(oportunidade.data_ultima_movimentacao)}</p>
          )}
        </div>

        {!analise && !loading && (
          <button
            onClick={gerarAnalise}
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shadow-md"
          >
            <Sparkles className="w-4 h-4" /> Gerar Análise IA
          </button>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
            <p className="text-sm text-slate-500">Analisando oportunidade...</p>
          </div>
        )}

        {analise && (
          <div className="space-y-3">
            {/* Temperatura */}
            <div className={`px-3 py-2 rounded-xl border flex items-center gap-2 font-bold text-sm ${tempCor[analise.temperatura] || 'text-slate-600 bg-slate-50 border-slate-200'}`}>
              {analise.temperatura === 'Quente' ? '🔥' : analise.temperatura === 'Morno' ? '🌡️' : '❄️'}
              Lead {analise.temperatura}
            </div>

            {/* Resumo */}
            <div className="bg-slate-50 rounded-xl p-3 border space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Resumo</p>
              <p className="text-sm text-slate-800 leading-relaxed">{analise.resumo}</p>
            </div>

            {/* Probabilidade */}
            <div className="bg-slate-50 rounded-xl p-3 border">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Probabilidade de Fechamento</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-purple-500 to-violet-600 transition-all"
                    style={{ width: `${analise.chance_fechamento}%` }}
                  />
                </div>
                <span className="font-bold text-purple-700 text-base">{analise.chance_fechamento}%</span>
              </div>
            </div>

            {/* Próxima ação */}
            <div className="bg-slate-50 rounded-xl p-3 border space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Próxima Ação</p>
              <p className="text-sm text-slate-800">📌 {analise.proxima_acao}</p>
            </div>

            {/* Mensagem sugerida */}
            <div className="bg-green-50 rounded-xl p-3 border border-green-200 space-y-1">
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">💬 Mensagem Sugerida</p>
              <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{analise.mensagem_sugerida}</p>
            </div>

            <button
              onClick={gerarAnalise}
              className="w-full py-2 border border-purple-300 text-purple-700 rounded-xl text-sm font-medium hover:bg-purple-50 flex items-center justify-center gap-2 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" /> Gerar novamente
            </button>
          </div>
        )}
      </div>
    </div>
  );
}