import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import {
  Sparkles, Loader2, RefreshCw, Thermometer, TrendingUp, AlertTriangle,
  MessageSquare, Zap, Copy, Send, CheckCircle, XCircle, Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const TEMPERATURA_CONFIG = {
  frio: { label: 'Frio', emoji: '🔵', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
  morno: { label: 'Morno', emoji: '🟡', color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' },
  quente: { label: 'Quente', emoji: '🟢', color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
};

export default function OportunidadeAbaIA({ oportunidade, comentarios = [], movimentacoes = [], checklistItems = [], currentUser }) {
  const [analise, setAnalise] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);

  const gerarAnalise = async () => {
    setLoading(true);
    setErro(null);
    try {
      const resumoComentarios = comentarios
        .slice(-10)
        .map(c => `${c.usuario_nome}: ${c.mensagem}`)
        .join('\n');

      const resumoMovimentacoes = movimentacoes
        .slice(0, 5)
        .map(m => `Moveu de "${m.etapa_origem_nome}" para "${m.etapa_destino_nome}"`)
        .join('; ');

      const checklistConcluido = checklistItems.filter(i => i.checked).length;
      const checklistTotal = checklistItems.length;

      const tempoParado = oportunidade.data_ultima_movimentacao
        ? formatDistanceToNow(new Date(oportunidade.data_ultima_movimentacao), { locale: ptBR })
        : 'desconhecido';

      const prompt = `Você é um especialista em vendas e CRM. Analise esta oportunidade e forneça insights profissionais:

DADOS DA OPORTUNIDADE:
- Cliente: ${oportunidade.cliente_nome || 'Não informado'}
- Produto: ${oportunidade.produto || 'Não informado'}
- Etapa atual: ${oportunidade.etapa_nome || 'Não informado'}
- Status: ${oportunidade.status}
- Valor estimado: R$ ${oportunidade.valor_estimado || 0}
- Parado há: ${tempoParado}
- Checklist: ${checklistConcluido}/${checklistTotal} itens concluídos
- Origem do lead: ${oportunidade.origem || 'Não informado'}

HISTÓRICO DE MOVIMENTAÇÕES (últimas):
${resumoMovimentacoes || 'Nenhuma movimentação'}

COMENTÁRIOS RECENTES:
${resumoComentarios || 'Nenhum comentário'}

Responda em JSON com esta estrutura exata:
{
  "resumo": "Resumo executivo do atendimento em 2-3 frases",
  "objetivo_cliente": "O que o cliente está buscando",
  "temperatura": "frio | morno | quente",
  "probabilidade_fechamento": número entre 0 e 100,
  "objecoes_identificadas": ["objeção 1", "objeção 2"],
  "proxima_acao": "Próxima ação recomendada em 1 frase",
  "mensagem_sugerida": "Mensagem pronta para enviar ao cliente via WhatsApp",
  "alertas": ["alerta 1", "alerta 2"]
}`;

      const resultado = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            resumo: { type: 'string' },
            objetivo_cliente: { type: 'string' },
            temperatura: { type: 'string' },
            probabilidade_fechamento: { type: 'number' },
            objecoes_identificadas: { type: 'array', items: { type: 'string' } },
            proxima_acao: { type: 'string' },
            mensagem_sugerida: { type: 'string' },
            alertas: { type: 'array', items: { type: 'string' } },
          }
        }
      });
      setAnalise(resultado);
    } catch (e) {
      setErro('Erro ao gerar análise. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const copiarMensagem = () => {
    if (analise?.mensagem_sugerida) {
      navigator.clipboard.writeText(analise.mensagem_sugerida);
      toast.success('Mensagem copiada!');
    }
  };

  const tempConfig = analise?.temperatura ? (TEMPERATURA_CONFIG[analise.temperatura] || TEMPERATURA_CONFIG.morno) : null;

  return (
    <div className="p-6 max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-violet-600" />
          <h3 className="text-base font-semibold text-slate-800">Análise Inteligente com IA</h3>
          <span className="text-xs bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full font-medium">Beta</span>
        </div>
        <Button
          onClick={gerarAnalise}
          disabled={loading}
          size="sm"
          className="bg-violet-600 hover:bg-violet-700 gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {analise ? 'Atualizar' : 'Gerar Análise'}
        </Button>
      </div>

      {erro && <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{erro}</p>}

      {loading && (
        <div className="bg-gradient-to-br from-violet-50 to-blue-50 border border-violet-200 rounded-2xl p-8 flex items-center justify-center gap-3 text-violet-600">
          <Loader2 className="w-6 h-6 animate-spin" />
          <p className="text-sm font-medium">Analisando dados com IA...</p>
        </div>
      )}

      {!analise && !loading && !erro && (
        <div className="bg-gradient-to-br from-violet-50 to-blue-50 border border-violet-200 rounded-2xl p-10 flex flex-col items-center text-center">
          <Sparkles className="w-14 h-14 text-violet-300 mb-4" />
          <p className="text-base font-semibold text-slate-700 mb-1">Central de Inteligência Artificial</p>
          <p className="text-sm text-slate-500 max-w-sm mb-5">
            Clique em "Gerar Análise" para obter insights sobre temperatura do lead, probabilidade de fechamento, objeções e mensagem sugerida.
          </p>
          <Button onClick={gerarAnalise} className="bg-violet-600 hover:bg-violet-700 gap-2">
            <Sparkles className="w-4 h-4" /> Gerar Análise
          </Button>
        </div>
      )}

      {analise && !loading && (
        <div className="space-y-4">
          {/* Resumo */}
          <div className="bg-white border rounded-2xl p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" /> Resumo do Atendimento
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">{analise.resumo}</p>
            {analise.objetivo_cliente && (
              <p className="text-xs text-slate-500 mt-2 italic">🎯 Objetivo: {analise.objetivo_cliente}</p>
            )}
          </div>

          {/* Temperatura + Probabilidade */}
          <div className="grid grid-cols-2 gap-4">
            {tempConfig && (
              <div className={`border rounded-2xl p-4 ${tempConfig.bg}`}>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
                  <Thermometer className="w-3.5 h-3.5" /> Temperatura do Lead
                </p>
                <p className={`text-2xl font-bold ${tempConfig.color}`}>
                  {tempConfig.emoji} {tempConfig.label}
                </p>
              </div>
            )}
            {analise.probabilidade_fechamento != null && (
              <div className="bg-white border rounded-2xl p-4 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" /> Chance de Fechamento
                </p>
                <p className="text-2xl font-bold text-slate-800">{analise.probabilidade_fechamento}%</p>
                <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                  <div
                    className={`h-2 rounded-full transition-all ${analise.probabilidade_fechamento >= 70 ? 'bg-green-500' : analise.probabilidade_fechamento >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${analise.probabilidade_fechamento}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Objeções */}
          {analise.objecoes_identificadas?.length > 0 && (
            <div className="bg-white border rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3 flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 text-red-400" /> Objeções Identificadas
              </p>
              <div className="flex flex-wrap gap-2">
                {analise.objecoes_identificadas.map((obj, i) => (
                  <span key={i} className="text-xs bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-full">
                    {obj}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Próxima ação */}
          {analise.proxima_acao && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-600 mb-2 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" /> Próxima Ação Recomendada
              </p>
              <p className="text-sm font-semibold text-blue-800">{analise.proxima_acao}</p>
            </div>
          )}

          {/* Alertas */}
          {analise.alertas?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-600 mb-3 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Alertas
              </p>
              <ul className="space-y-1.5">
                {analise.alertas.map((al, i) => (
                  <li key={i} className="text-sm text-amber-800 flex items-start gap-2">
                    <span className="mt-0.5">⚠️</span> {al}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Mensagem sugerida */}
          {analise.mensagem_sugerida && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-green-600 mb-3 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> Mensagem Sugerida pela IA
              </p>
              <p className="text-sm text-green-800 bg-white border border-green-200 rounded-xl p-3 italic leading-relaxed mb-3">
                "{analise.mensagem_sugerida}"
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1.5 text-xs border-green-300 text-green-700 hover:bg-green-100" onClick={copiarMensagem}>
                  <Copy className="w-3.5 h-3.5" /> Copiar mensagem
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}