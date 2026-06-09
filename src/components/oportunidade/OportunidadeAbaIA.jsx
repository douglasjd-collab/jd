import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import {
  Sparkles, Loader2, RefreshCw, Thermometer, TrendingUp, AlertTriangle,
  MessageSquare, Zap, Copy, CheckCircle, XCircle, Clock, FileText,
  Mic, ChevronDown, ChevronUp, User, Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import IAInputAudio from './IAInputAudio';

const TEMP_CONFIG = {
  frio:   { label: 'Frio',   emoji: '🔵', classes: 'bg-blue-50 border-blue-200 text-blue-700' },
  morno:  { label: 'Morno',  emoji: '🟡', classes: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
  quente: { label: 'Quente', emoji: '🟢', classes: 'bg-green-50 border-green-200 text-green-700' },
};

const INTERESSE_CONFIG = {
  baixo:      { label: 'Baixo',     color: 'bg-red-100 text-red-700' },
  médio:      { label: 'Médio',     color: 'bg-yellow-100 text-yellow-700' },
  alto:       { label: 'Alto',      color: 'bg-green-100 text-green-700' },
  'muito alto': { label: 'Muito Alto', color: 'bg-emerald-100 text-emerald-700' },
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
    interesse: { type: 'string' },
    proxima_acao: { type: 'string' },
    proxima_acao_opcoes: { type: 'array', items: { type: 'string' } },
    mensagem_whatsapp: { type: 'string' },
    comentario_registro: { type: 'string' },
  }
};

function AnaliseResultado({ analise, transcricao, audioUrl, onSalvar, salvando }) {
  const tempCfg = analise?.temperatura ? (TEMP_CONFIG[analise.temperatura] || TEMP_CONFIG.morno) : null;
  const interesseCfg = analise?.interesse ? (INTERESSE_CONFIG[analise.interesse?.toLowerCase()] || INTERESSE_CONFIG['médio']) : null;
  const [transcricaoAberta, setTranscricaoAberta] = useState(false);

  return (
    <div className="space-y-4">
      {/* Transcrição */}
      {transcricao && (
        <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
          <button
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
            onClick={() => setTranscricaoAberta(p => !p)}
          >
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-violet-500" /> 📄 Transcrição do Áudio
            </span>
            {transcricaoAberta ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          {transcricaoAberta && (
            <div className="px-4 pb-4 border-t bg-slate-50">
              <p className="text-sm text-slate-700 italic leading-relaxed mt-3">"{transcricao}"</p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Col 1 */}
        <div className="space-y-3">
          {/* Resumo */}
          <div className="bg-white border rounded-xl p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-violet-500" /> Resumo do Atendimento
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

          {/* Objeções */}
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

          {/* Próxima ação */}
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
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" /> {op}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Col 2 */}
        <div className="space-y-3">
          {/* Temperatura + Probabilidade */}
          <div className="grid grid-cols-2 gap-3">
            {tempCfg && (
              <div className={`rounded-xl p-4 border text-center ${tempCfg.classes}`}>
                <p className="text-[10px] font-bold uppercase tracking-wide opacity-70 mb-1 flex items-center justify-center gap-1">
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
                    className={`h-1.5 rounded-full transition-all ${analise.probabilidade_fechamento >= 70 ? 'bg-green-500' : analise.probabilidade_fechamento >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${analise.probabilidade_fechamento}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Interesse + Produto */}
          <div className="grid grid-cols-2 gap-3">
            {interesseCfg && (
              <div className="bg-white border rounded-xl p-3 shadow-sm">
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-1.5">Interesse</p>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${interesseCfg.color}`}>
                  {interesseCfg.label}
                </span>
              </div>
            )}
            {analise.produto_identificado && (
              <div className="bg-white border rounded-xl p-3 shadow-sm">
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-1.5">Produto</p>
                <p className="text-xs font-bold text-slate-700 capitalize">{analise.produto_identificado}</p>
              </div>
            )}
          </div>

          {/* Mensagem WhatsApp */}
          {analise.mensagem_whatsapp && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-xs font-bold text-green-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> Mensagem para WhatsApp
              </p>
              <p className="text-xs text-green-800 bg-white border border-green-100 rounded-lg p-3 italic leading-relaxed mb-3">
                "{analise.mensagem_whatsapp}"
              </p>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs border-green-300 text-green-700 hover:bg-green-100 w-full"
                onClick={() => { navigator.clipboard.writeText(analise.mensagem_whatsapp); toast.success('Mensagem copiada!'); }}>
                <Copy className="w-3.5 h-3.5" /> 📋 Copiar mensagem
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Salvar */}
      <div className="pt-2">
        <Button className="gap-2 bg-[#1e3a5f] hover:bg-[#2a4a73]" onClick={onSalvar} disabled={salvando}>
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          Salvar na Oportunidade
        </Button>
      </div>
    </div>
  );
}

function CardUltimoAtendimento({ comentario }) {
  const [aberto, setAberto] = useState(false);
  const data = comentario.created_date ? format(new Date(comentario.created_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '';

  return (
    <div className="bg-white border-2 border-violet-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 bg-violet-50 flex items-center gap-2">
        <Mic className="w-4 h-4 text-violet-600" />
        <span className="font-bold text-sm text-violet-800">Último Atendimento</span>
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><User className="w-3 h-3" /> {comentario.usuario_nome}</span>
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {data}</span>
          <button onClick={() => setAberto(p => !p)} className="text-violet-600 hover:text-violet-800">
            {aberto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {aberto && (
        <div className="px-4 py-3">
          <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{comentario.mensagem}</p>
        </div>
      )}
      {!aberto && (
        <div className="px-4 py-2">
          <p className="text-xs text-slate-500 truncate">{comentario.mensagem?.split('\n')[0]}</p>
        </div>
      )}
    </div>
  );
}

export default function OportunidadeAbaIA({ oportunidade, comentarios = [], movimentacoes = [], checklistItems = [], currentUser }) {
  const [analise, setAnalise] = useState(null);
  const [transcricaoAtual, setTranscricaoAtual] = useState('');
  const [audioUrlAtual, setAudioUrlAtual] = useState(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [loadingGeral, setLoadingGeral] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [historicoAberto, setHistoricoAberto] = useState(false);

  // Filtrar histórico de análises IA nos comentários
  const historicoIA = (comentarios || []).filter(c =>
    c.mensagem?.includes('🤖 Análise IA') || c.mensagem?.includes('🤖 Resumo IA')
  ).sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

  const ultimoAtendimento = historicoIA[0] || null;

  const gerarAnaliseIA = async (texto) => {
    const tempConfig = TEMP_CONFIG;
    const prompt = `Você é um especialista em vendas. Analise este relato de atendimento comercial e gere inteligência de vendas:

DADOS DA OPORTUNIDADE:
- Cliente: ${oportunidade?.cliente_nome || 'Não informado'}
- Produto: ${oportunidade?.produto || 'Não informado'}
- Etapa: ${oportunidade?.etapa_nome || 'Não informada'}
- Valor estimado: R$ ${oportunidade?.valor_estimado || 0}

RELATO/TRANSCRIÇÃO DO ATENDIMENTO:
${texto}

Gere análise completa. Responda em JSON:
- resumo: resumo profissional em 2-4 frases
- pontos_principais: array com 3-5 pontos chave da conversa
- produto_identificado: produto mencionado (consórcio/financiamento/consignado/seguro/outro)
- temperatura: "frio" | "morno" | "quente"
- probabilidade_fechamento: número de 0 a 100
- objecoes: array de objeções detectadas
- interesse: "baixo" | "médio" | "alto" | "muito alto"
- proxima_acao: principal ação recomendada (1 frase)
- proxima_acao_opcoes: array com 3 opções de próximas ações
- mensagem_whatsapp: mensagem pronta e personalizada para enviar ao cliente via WhatsApp
- comentario_registro: resumo conciso para registrar no histórico da oportunidade`;

    return await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: ANALISE_SCHEMA
    });
  };

  const handleAnalisarAudio = async ({ transcricao, audio_url, duracao_segundos }) => {
    setLoadingAudio(true);
    setAnalise(null);
    try {
      // Enriquecer com contexto existente para análise combinada
      const resumoComentarios = comentarios.slice(-5).map(c => `${c.usuario_nome}: ${c.mensagem?.slice(0, 150)}`).join('\n');
      const textoEnriquecido = resumoComentarios
        ? `RELATO ATUAL DO VENDEDOR:\n${transcricao}\n\nCONTEXTO HISTÓRICO DA OPORTUNIDADE:\n${resumoComentarios}`
        : transcricao;
      const resultado = await gerarAnaliseIA(textoEnriquecido);
      setAnalise(resultado);
      setTranscricaoAtual(transcricao);
      setAudioUrlAtual(audio_url);
    } catch (e) {
      toast.error('Erro ao gerar análise: ' + e.message);
    } finally {
      setLoadingAudio(false);
    }
  };

  const gerarAnaliseGeral = async () => {
    setLoadingGeral(true);
    setAnalise(null);
    try {
      const resumoComentarios = comentarios.slice(-10).map(c => `${c.usuario_nome}: ${c.mensagem}`).join('\n');
      const resumoMovs = movimentacoes.slice(0, 5).map(m => `De "${m.etapa_origem_nome}" para "${m.etapa_destino_nome}"`).join('; ');
      const texto = `Histórico de comentários:\n${resumoComentarios || 'Nenhum'}\n\nMovimentações: ${resumoMovs || 'Nenhuma'}\n\nAnalises IA anteriores: ${historicoIA.slice(0,3).map(c => c.mensagem?.slice(0,200)).join(' | ') || 'Nenhuma'}`;
      const resultado = await gerarAnaliseIA(texto);
      setAnalise(resultado);
      setTranscricaoAtual('');
      setAudioUrlAtual(null);
    } catch (e) {
      toast.error('Erro ao gerar análise: ' + e.message);
    } finally {
      setLoadingGeral(false);
    }
  };

  const salvarNaOportunidade = async () => {
    if (!oportunidade?.id || !analise) return;
    setSalvando(true);
    try {
      const tempLabel = TEMP_CONFIG[analise.temperatura]?.label || analise.temperatura || '';
      const mensagem = `🤖 Análise IA ${transcricaoAtual ? '(Áudio)' : '(Histórico)'}\n\n${analise.comentario_registro || analise.resumo}\n\nProduto: ${analise.produto_identificado || '-'}\n🌡️ Temperatura: ${tempCfg?.emoji || ''} ${tempLabel}\n📈 Fechamento: ${analise.probabilidade_fechamento}%\n⚠️ Objeções: ${analise.objecoes?.join(', ') || 'Nenhuma'}\n🎯 Próxima Ação: ${analise.proxima_acao || '-'}${transcricaoAtual ? `\n\n📄 Transcrição: "${transcricaoAtual.slice(0, 300)}${transcricaoAtual.length > 300 ? '...' : ''}"` : ''}`;

      await base44.entities.ComentarioOportunidade.create({
        oportunidade_id: oportunidade.id,
        empresa_id: oportunidade.empresa_id,
        usuario_id: currentUser?.id,
        usuario_nome: currentUser?.nome_perfil || currentUser?.full_name,
        mensagem,
        tipo: 'comentario',
      });
      toast.success('Análise salva na oportunidade!');
      setAnalise(null);
      setTranscricaoAtual('');
    } catch (e) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  const tempCfg = analise?.temperatura ? (TEMP_CONFIG[analise.temperatura] || TEMP_CONFIG.morno) : null;
  const isLoading = loadingAudio || loadingGeral;

  return (
    <div className="p-5 max-w-3xl space-y-5">
      {/* Último Atendimento */}
      {ultimoAtendimento && <CardUltimoAtendimento comentario={ultimoAtendimento} />}

      {/* Input Audio */}
      <IAInputAudio onAnalisar={handleAnalisarAudio} loading={loadingAudio} />

      {/* Resultado da análise via áudio */}
      {loadingAudio && (
        <div className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-200 rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
          <Loader2 className="w-10 h-10 animate-spin text-violet-500" />
          <p className="text-sm font-semibold text-violet-800">Processando áudio e gerando análise comercial...</p>
          <p className="text-xs text-violet-500">Transcrevendo → Analisando com IA → Gerando insights</p>
        </div>
      )}

      {analise && !isLoading && (
        <div className="bg-white border rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-violet-600" />
            <p className="font-bold text-slate-800">Análise da IA</p>
            {tempCfg && (
              <span className={`ml-auto text-xs font-bold px-2.5 py-1 rounded-full border ${tempCfg.classes}`}>
                {tempCfg.emoji} {tempCfg.label}
              </span>
            )}
          </div>
          <AnaliseResultado
            analise={analise}
            transcricao={transcricaoAtual}
            audioUrl={audioUrlAtual}
            onSalvar={salvarNaOportunidade}
            salvando={salvando}
          />
        </div>
      )}

      {/* Separador */}
      <div className="border-t pt-4">
        {/* Análise pelo histórico */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-600" />
            <p className="font-semibold text-slate-700 text-sm">Central de Inteligência Artificial</p>
            <span className="text-xs bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full font-medium">Beta</span>
          </div>
          <Button onClick={gerarAnaliseGeral} disabled={loadingGeral} size="sm" className="bg-violet-600 hover:bg-violet-700 gap-2">
            {loadingGeral ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Analisar Histórico
          </Button>
        </div>
        <p className="text-xs text-slate-400 mb-3">Analisa os comentários e movimentações registradas na oportunidade.</p>
      </div>

      {/* Histórico de Análises */}
      {historicoIA.length > 0 && (
        <div className="border rounded-2xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
            onClick={() => setHistoricoAberto(p => !p)}
          >
            <span className="font-semibold text-sm text-slate-700 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              Histórico de Análises ({historicoIA.length})
            </span>
            {historicoAberto ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          {historicoAberto && (
            <div className="divide-y">
              {historicoIA.map((c, i) => (
                <div key={c.id || i} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs text-slate-400 flex items-center gap-1"><User className="w-3 h-3" /> {c.usuario_nome}</span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {c.created_date ? format(new Date(c.created_date), "dd/MM/yyyy HH:mm") : ''}
                    </span>
                    {i === 0 && <span className="ml-auto text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">Mais recente</span>}
                  </div>
                  <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed line-clamp-4">{c.mensagem}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}