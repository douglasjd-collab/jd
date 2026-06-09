import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Sparkles, Loader2, Mic, MicOff, Brain, AlertTriangle, MessageSquare,
  Zap, Copy, TrendingUp, Thermometer, CheckCircle, Clock, FileText,
  CheckSquare, RefreshCw, PhoneOff, ArrowRight, User
} from 'lucide-react';
import { toast } from 'sonner';

const OBJECOES = [
  'Preço alto', 'Parcela alta', 'Entrada alta', 'Prazo longo',
  'Falta de confiança', 'Concorrência', 'Sem interesse', 'Pediu retorno',
  'Doc. pendente', 'Crédito negado'
];

const TEMP_CONFIG = {
  frio:   { label: 'Frio',   emoji: '🔵', classes: 'bg-blue-100 text-blue-700 border-blue-300' },
  morno:  { label: 'Morno',  emoji: '🟡', classes: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  quente: { label: 'Quente', emoji: '🟢', classes: 'bg-green-100 text-green-700 border-green-300' },
};

const ANALISE_SCHEMA = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    pontos_principais: { type: 'array', items: { type: 'string' } },
    produto_identificado: { type: 'string' },
    temperatura: { type: 'string' },
    probabilidade_fechamento: { type: 'number' },
    objecoes: { type: 'array', items: { type: 'string' } },
    proxima_acao: { type: 'string' },
    proxima_acao_opcoes: { type: 'array', items: { type: 'string' } },
    mensagem_whatsapp: { type: 'string' },
    sugestao_etapa_funil: { type: 'string' },
    motivo_etapa: { type: 'string' },
    comentario_oportunidade: { type: 'string' },
  }
};

function fmt(s) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

export default function AssistenteIALigacao({
  open,
  onOpenChange,
  oportunidade = null,
  clienteNome: nomeCliente = '',
  clienteTelefone = '',
  currentUser = null,
  onSalvarNaOportunidade = null,
}) {
  const clienteNome = nomeCliente || oportunidade?.cliente_nome || '';

  const [fase, setFase] = useState('durante');
  const [timer, setTimer] = useState(0);
  const [transcricao, setTranscricao] = useState('');
  const [reconhecendo, setReconhecendo] = useState(false);
  const [objecoes, setObjecoes] = useState([]);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [insights, setInsights] = useState(null);
  const [loadingAnalise, setLoadingAnalise] = useState(false);
  const [analise, setAnalise] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [criandoTarefa, setCriandoTarefa] = useState(false);

  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const timerFinalRef = useRef(0);

  useEffect(() => {
    if (open && fase === 'durante') {
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [open, fase]);

  useEffect(() => {
    if (!open) {
      setFase('durante'); setTimer(0); setTranscricao(''); setObjecoes([]);
      setInsights(null); setAnalise(null); setReconhecendo(false);
      clearInterval(timerRef.current);
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    }
  }, [open]);

  const startRecognition = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast.error('Transcrição automática disponível apenas no Chrome/Edge.'); return; }
    const rec = new SR();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal)
          setTranscricao(p => p + (p ? '\n' : '') + e.results[i][0].transcript);
      }
    };
    rec.onerror = rec.onend = () => setReconhecendo(false);
    rec.start();
    recognitionRef.current = rec;
    setReconhecendo(true);
  };

  const stopRecognition = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setReconhecendo(false);
  };

  const gerarInsights = async () => {
    if (!transcricao && objecoes.length === 0) { toast.warning('Adicione notas ou selecione objeções.'); return; }
    setLoadingInsights(true);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Você é um assistente comercial. Analise esta conversa de vendas EM TEMPO REAL e forneça insights imediatos:
Cliente: ${clienteNome || 'Não informado'} | Produto: ${oportunidade?.produto || '?'} | Etapa: ${oportunidade?.etapa_nome || '?'}
Objeções marcadas: ${objecoes.join(', ') || 'nenhuma'}
Notas/Transcrição: ${transcricao}
Retorne JSON: {"sentimento":"positivo|neutro|negativo","interesse":"alto|médio|baixo","temperatura":"quente|morno|frio","objecao_principal":"texto curto","sugestao_vendedor":"frase exata para o vendedor usar agora","proximo_passo":"ação imediata"}`,
        response_json_schema: {
          type: 'object',
          properties: {
            sentimento: { type: 'string' }, interesse: { type: 'string' },
            temperatura: { type: 'string' }, objecao_principal: { type: 'string' },
            sugestao_vendedor: { type: 'string' }, proximo_passo: { type: 'string' },
          }
        }
      });
      setInsights(res);
    } catch { toast.error('Erro ao gerar insights.'); }
    finally { setLoadingInsights(false); }
  };

  const runAnalise = async (duracao) => {
    setLoadingAnalise(true);
    setAnalise(null);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Você é especialista em vendas. Analise esta ligação comercial e gere relatório completo:
DADOS: Cliente: ${clienteNome || '?'} | Produto: ${oportunidade?.produto || '?'} | Etapa: ${oportunidade?.etapa_nome || '?'} | Valor: R$ ${oportunidade?.valor_estimado || 0} | Duração: ${fmt(duracao)}
Objeções marcadas pelo vendedor: ${objecoes.join(', ') || 'nenhuma'}
Notas/Transcrição da ligação: ${transcricao || 'nenhuma nota'}
Gere análise completa com: resumo (2-4 frases), pontos_principais (array), produto_identificado, temperatura (frio/morno/quente), probabilidade_fechamento (0-100), objecoes (array), proxima_acao (principal), proxima_acao_opcoes (3 opções), mensagem_whatsapp (texto pronto para enviar), sugestao_etapa_funil (nome da etapa ou null), motivo_etapa, comentario_oportunidade (resumo conciso para registro).`,
        response_json_schema: ANALISE_SCHEMA
      });
      setAnalise(res);
    } catch { toast.error('Erro ao gerar análise completa.'); }
    finally { setLoadingAnalise(false); }
  };

  const encerrarLigacao = async () => {
    clearInterval(timerRef.current);
    stopRecognition();
    timerFinalRef.current = timer;
    setFase('apos');
    await runAnalise(timer);
  };

  const salvarNaOportunidade = async () => {
    if (!oportunidade?.id || !analise) return;
    setSalvando(true);
    try {
      const tempLabel = TEMP_CONFIG[analise.temperatura]?.label || analise.temperatura;
      await base44.entities.ComentarioOportunidade.create({
        oportunidade_id: oportunidade.id,
        empresa_id: oportunidade.empresa_id,
        usuario_id: currentUser?.id,
        usuario_nome: currentUser?.nome_perfil || currentUser?.full_name,
        mensagem: `🤖 Resumo IA da Ligação (${fmt(timerFinalRef.current)})\n\n${analise.comentario_oportunidade || analise.resumo}\n\n📊 Objeções: ${analise.objecoes?.join(', ') || 'Nenhuma'}\n🎯 Próxima Ação: ${analise.proxima_acao}\n🌡️ Temperatura: ${tempLabel}\n📈 Chance de Fechamento: ${analise.probabilidade_fechamento}%`,
        tipo: 'comentario',
      });
      onSalvarNaOportunidade?.(analise);
      toast.success('Análise salva na oportunidade!');
    } catch (e) { toast.error('Erro ao salvar: ' + e.message); }
    finally { setSalvando(false); }
  };

  const criarTarefaFollowUp = async () => {
    if (!oportunidade?.id || !analise) return;
    setCriandoTarefa(true);
    try {
      await base44.entities.Tarefa.create({
        empresa_id: oportunidade.empresa_id,
        titulo: `Follow-up IA: ${analise.proxima_acao} — ${clienteNome || oportunidade.cliente_nome}`,
        descricao: `${analise.resumo}\n\nObjeções: ${analise.objecoes?.join(', ')}\nTemperatura: ${analise.temperatura}\nChance fechamento: ${analise.probabilidade_fechamento}%`,
        responsavel_principal_id: oportunidade.vendedor_id,
        responsavel_principal_nome: oportunidade.vendedor_nome,
        cliente_id: oportunidade.cliente_id,
        cliente_nome: oportunidade.cliente_nome,
        status: 'a_fazer',
        prioridade: analise.temperatura === 'quente' ? 'alta' : 'media',
        data_conclusao_prevista: new Date().toISOString().split('T')[0],
        origem: 'sistema',
      });
      toast.success('Tarefa de follow-up criada!');
    } catch (e) { toast.error('Erro ao criar tarefa: ' + e.message); }
    finally { setCriandoTarefa(false); }
  };

  const toggleObjecao = (obj) => setObjecoes(prev => prev.includes(obj) ? prev.filter(o => o !== obj) : [...prev, obj]);
  const tempCfg = analise?.temperatura ? (TEMP_CONFIG[analise.temperatura] || TEMP_CONFIG.morno) : null;
  const insightsTempCfg = insights?.temperatura ? (TEMP_CONFIG[insights.temperatura] || TEMP_CONFIG.morno) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 overflow-hidden flex flex-col [&>button]:text-white [&>button]:opacity-80"
        style={{ maxWidth: '920px', width: '95vw', height: '88vh', maxHeight: '720px' }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1e3a5f] to-violet-900 text-white px-5 py-4 flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-violet-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">🤖 Assistente Comercial IA</p>
            <p className="text-xs text-white/70 truncate">
              {clienteNome || 'Sem cliente vinculado'}{clienteTelefone && ` · ${clienteTelefone}`}
              {oportunidade?.etapa_nome && ` · ${oportunidade.etapa_nome}`}
            </p>
          </div>
          {fase === 'durante' ? (
            <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1.5 flex-shrink-0">
              <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              <span className="text-sm font-mono font-bold">{fmt(timer)}</span>
            </div>
          ) : (
            <Badge className="bg-white/20 text-white border-0 text-xs flex-shrink-0">
              ✅ Encerrada · {fmt(timerFinalRef.current)}
            </Badge>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex min-h-0">
          {fase === 'durante' ? (
            <>
              {/* Left: notes + objections */}
              <div className="flex-1 flex flex-col overflow-hidden border-r min-w-0">
                <div className="flex-1 overflow-y-auto p-4 space-y-4">

                  {/* Lead data */}
                  {oportunidade && (
                    <div className="bg-slate-50 border rounded-xl p-3 text-xs">
                      <p className="font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5 text-[10px]">
                        <User className="w-3 h-3" /> Dados do Lead
                      </p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                        {[
                          ['Cliente', oportunidade.cliente_nome],
                          ['Produto', oportunidade.produto],
                          ['Etapa', oportunidade.etapa_nome],
                          ['Valor', oportunidade.valor_estimado ? `R$ ${Number(oportunidade.valor_estimado).toLocaleString('pt-BR')}` : null],
                          ['Responsável', oportunidade.vendedor_nome],
                        ].filter(([, v]) => v).map(([l, v]) => (
                          <div key={l} className="flex gap-1 min-w-0">
                            <span className="text-slate-400 flex-shrink-0">{l}:</span>
                            <span className="text-slate-700 font-medium truncate capitalize">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Transcription */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                        <Mic className="w-3.5 h-3.5" /> Notas / Transcrição ao Vivo
                      </p>
                      <Button size="sm" variant={reconhecendo ? 'destructive' : 'outline'} className="h-7 text-xs gap-1"
                        onClick={reconhecendo ? stopRecognition : startRecognition}>
                        {reconhecendo ? <><MicOff className="w-3 h-3" /> Parar</> : <><Mic className="w-3 h-3" /> Mic</>}
                      </Button>
                    </div>
                    {reconhecendo && (
                      <div className="flex items-center gap-2 mb-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Escutando e transcrevendo automaticamente...
                      </div>
                    )}
                    <Textarea
                      placeholder="Digite notas da conversa ou ative o microfone para transcrição automática (Chrome/Edge)..."
                      value={transcricao}
                      onChange={e => setTranscricao(e.target.value)}
                      className="min-h-[130px] text-sm resize-none"
                    />
                  </div>

                  {/* Objections */}
                  <div>
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Marcar Objeções
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {OBJECOES.map(obj => (
                        <button key={obj} onClick={() => toggleObjecao(obj)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                            objecoes.includes(obj)
                              ? 'bg-red-100 text-red-700 border-red-300 font-semibold'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-red-200 hover:bg-red-50'
                          }`}>
                          {obj}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom actions */}
                <div className="p-3 border-t bg-white flex gap-2 flex-shrink-0">
                  <Button className="flex-1 bg-violet-600 hover:bg-violet-700 gap-2" onClick={gerarInsights} disabled={loadingInsights}>
                    {loadingInsights ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                    Analisar com IA
                  </Button>
                  <Button variant="destructive" className="gap-2" onClick={encerrarLigacao}>
                    <PhoneOff className="w-4 h-4" /> Encerrar Ligação
                  </Button>
                </div>
              </div>

              {/* Right: live insights */}
              <div className="w-72 flex-shrink-0 overflow-y-auto bg-slate-50/50">
                <div className="p-4 space-y-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-violet-500" /> Insights em Tempo Real
                  </p>

                  {loadingInsights && (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-violet-500">
                      <Loader2 className="w-8 h-8 animate-spin" />
                      <span className="text-xs text-slate-500">Analisando conversa...</span>
                    </div>
                  )}

                  {!insights && !loadingInsights && (
                    <div className="text-center py-12">
                      <Brain className="w-14 h-14 text-slate-200 mx-auto mb-3" />
                      <p className="text-xs text-slate-400 leading-relaxed px-2">
                        Adicione notas da conversa ou marque objeções e clique em "Analisar com IA" para insights ao vivo.
                      </p>
                    </div>
                  )}

                  {insights && !loadingInsights && (
                    <div className="space-y-3">
                      {insightsTempCfg && (
                        <div className={`rounded-xl p-3 border ${insightsTempCfg.classes}`}>
                          <p className="text-[10px] font-bold uppercase tracking-wide opacity-70 mb-1 flex items-center gap-1"><Thermometer className="w-3 h-3" /> Temperatura</p>
                          <p className="font-bold text-lg">{insightsTempCfg.emoji} {insightsTempCfg.label}</p>
                        </div>
                      )}

                      {insights.interesse && (
                        <div className="bg-white rounded-xl p-3 border shadow-sm">
                          <p className="text-[10px] font-bold uppercase text-slate-400 mb-1.5">Interesse do Cliente</p>
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                            insights.interesse === 'alto' ? 'bg-green-100 text-green-700' :
                            insights.interesse === 'médio' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {insights.interesse === 'alto' ? '⬆️ Alto' : insights.interesse === 'médio' ? '➡️ Médio' : '⬇️ Baixo'}
                          </span>
                        </div>
                      )}

                      {insights.objecao_principal && (
                        <div className="bg-white rounded-xl p-3 border border-red-100 shadow-sm">
                          <p className="text-[10px] font-bold uppercase text-red-400 mb-1 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Objeção Principal
                          </p>
                          <p className="text-xs font-semibold text-red-700">{insights.objecao_principal}</p>
                        </div>
                      )}

                      {insights.sugestao_vendedor && (
                        <div className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-200 rounded-xl p-3">
                          <p className="text-[10px] font-bold uppercase text-violet-600 mb-1.5 flex items-center gap-1">
                            <Zap className="w-3 h-3" /> 💬 Diga Agora
                          </p>
                          <p className="text-xs text-violet-800 leading-relaxed italic">"{insights.sugestao_vendedor}"</p>
                        </div>
                      )}

                      {insights.proximo_passo && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                          <p className="text-[10px] font-bold uppercase text-blue-600 mb-1 flex items-center gap-1">
                            <ArrowRight className="w-3 h-3" /> Próximo Passo
                          </p>
                          <p className="text-xs text-blue-800 font-medium">{insights.proximo_passo}</p>
                        </div>
                      )}

                      <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1.5 mt-1" onClick={gerarInsights}>
                        <RefreshCw className="w-3 h-3" /> Atualizar Insights
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* AFTER CALL */
            <div className="flex-1 overflow-y-auto min-w-0">
              {loadingAnalise ? (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-700">Gerando análise completa com IA...</p>
                    <p className="text-xs text-slate-400 mt-1">Processando ligação de {fmt(timerFinalRef.current)}</p>
                  </div>
                </div>
              ) : analise ? (
                <div className="p-5 space-y-4">
                  {/* Status row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-500 bg-slate-100 rounded-full px-3 py-1 flex items-center gap-1.5">
                      <Clock className="w-3 h-3" /> {fmt(timerFinalRef.current)}
                    </span>
                    {tempCfg && (
                      <span className={`text-xs font-bold px-3 py-1 rounded-full border ${tempCfg.classes}`}>
                        {tempCfg.emoji} {tempCfg.label}
                      </span>
                    )}
                    {analise.probabilidade_fechamento != null && (
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                        analise.probabilidade_fechamento >= 70 ? 'bg-green-100 text-green-700' :
                        analise.probabilidade_fechamento >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                      }`}>
                        📈 {analise.probabilidade_fechamento}% de fechamento
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Column 1 */}
                    <div className="space-y-4">
                      <div className="bg-white border rounded-xl p-4 shadow-sm">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5" /> Resumo da Ligação
                        </p>
                        <p className="text-sm text-slate-700 leading-relaxed">{analise.resumo}</p>
                        {analise.pontos_principais?.length > 0 && (
                          <ul className="mt-3 space-y-1.5">
                            {analise.pontos_principais.map((p, i) => (
                              <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                                <CheckCircle className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" /> {p}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {analise.objecoes?.length > 0 && (
                        <div className="bg-white border rounded-xl p-4 shadow-sm">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Objeções Identificadas
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {analise.objecoes.map((obj, i) => (
                              <span key={i} className="text-xs bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-full">{obj}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {analise.proxima_acao && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                          <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5" /> Próxima Ação Recomendada
                          </p>
                          <p className="text-sm font-semibold text-blue-800">{analise.proxima_acao}</p>
                          {analise.proxima_acao_opcoes?.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {analise.proxima_acao_opcoes.map((op, i) => (
                                <li key={i} className="text-xs text-blue-700 flex items-center gap-1.5">
                                  <ArrowRight className="w-3 h-3 flex-shrink-0" /> {op}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}

                      {analise.sugestao_etapa_funil && (
                        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                          <p className="text-xs font-bold text-purple-600 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                            <TrendingUp className="w-3.5 h-3.5" /> Sugestão no Funil
                          </p>
                          <p className="text-sm font-semibold text-purple-800">→ {analise.sugestao_etapa_funil}</p>
                          {analise.motivo_etapa && <p className="text-xs text-purple-600 mt-1">{analise.motivo_etapa}</p>}
                        </div>
                      )}
                    </div>

                    {/* Column 2 */}
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        {tempCfg && (
                          <div className={`rounded-xl p-4 border text-center ${tempCfg.classes}`}>
                            <p className="text-[10px] font-bold uppercase tracking-wide opacity-60 mb-1 flex items-center justify-center gap-1">
                              <Thermometer className="w-3 h-3" /> Temp.
                            </p>
                            <p className="text-2xl">{tempCfg.emoji}</p>
                            <p className="text-sm font-bold mt-0.5">{tempCfg.label}</p>
                          </div>
                        )}
                        {analise.probabilidade_fechamento != null && (
                          <div className="bg-white border rounded-xl p-4 shadow-sm text-center">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1 flex items-center justify-center gap-1">
                              <TrendingUp className="w-3 h-3" /> Fechamento
                            </p>
                            <p className="text-2xl font-bold text-slate-800">{analise.probabilidade_fechamento}%</p>
                            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                              <div
                                className={`h-1.5 rounded-full ${analise.probabilidade_fechamento >= 70 ? 'bg-green-500' : analise.probabilidade_fechamento >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                style={{ width: `${analise.probabilidade_fechamento}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {analise.mensagem_whatsapp && (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                          <p className="text-xs font-bold text-green-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5" /> Mensagem para WhatsApp
                          </p>
                          <p className="text-xs text-green-800 bg-white border border-green-100 rounded-lg p-3 italic leading-relaxed mb-3">
                            "{analise.mensagem_whatsapp}"
                          </p>
                          <Button size="sm" variant="outline" className="gap-1.5 text-xs border-green-300 text-green-700 hover:bg-green-100 w-full"
                            onClick={() => { navigator.clipboard.writeText(analise.mensagem_whatsapp); toast.success('Copiado!'); }}>
                            <Copy className="w-3.5 h-3.5" /> Copiar mensagem
                          </Button>
                        </div>
                      )}

                      {analise.produto_identificado && (
                        <div className="bg-white border rounded-xl p-4 shadow-sm">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Produto Identificado</p>
                          <p className="text-sm font-bold text-slate-700 capitalize">{analise.produto_identificado}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="border-t pt-4 flex flex-wrap gap-2">
                    {oportunidade && (
                      <>
                        <Button className="gap-2 bg-[#1e3a5f] hover:bg-[#2a4a73]" onClick={salvarNaOportunidade} disabled={salvando}>
                          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                          Salvar na Oportunidade
                        </Button>
                        <Button variant="outline" className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50" onClick={criarTarefaFollowUp} disabled={criandoTarefa}>
                          {criandoTarefa ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
                          Criar Tarefa Follow-up
                        </Button>
                      </>
                    )}
                    <Button variant="outline" className="gap-2" onClick={() => runAnalise(timerFinalRef.current)}>
                      <RefreshCw className="w-4 h-4" /> Reanalisar
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}