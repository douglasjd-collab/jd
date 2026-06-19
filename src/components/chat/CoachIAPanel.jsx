import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Copy, Send, RefreshCw, X, Bot, AlertTriangle, Thermometer, MapPin, TrendingUp, FileText, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';

// ── Helpers ──────────────────────────────────────────────────────────
const tagColors = { red: 'border-red-300/20 bg-red-500/10 text-red-400', amber: 'border-amber-300/20 bg-amber-500/10 text-amber-400', blue: 'border-blue-300/20 bg-blue-500/10 text-blue-400', green: 'border-green-300/20 bg-green-500/10 text-green-400', purple: 'border-purple-300/20 bg-purple-500/10 text-purple-400' };
const riskClass = (p) => p >= 70 ? 'risk-high' : p >= 40 ? 'risk-med' : 'risk-low';
const riskColors = { 'risk-high': 'bg-red-500/15 text-red-400 border-red-500/25', 'risk-med': 'bg-amber-500/15 text-amber-400 border-amber-500/25', 'risk-low': 'bg-green-500/15 text-green-400 border-green-500/25' };

// ── Componente ────────────────────────────────────────────────────────
export default function CoachIAPanel({ conversaId, mensagens, empresaId, visible, onClose, onSendScript }) {
  const [analise, setAnalise] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('agora');
  const [error, setError] = useState(null);

  // Analisar automaticamente ao abrir
  useEffect(() => {
    if (visible && conversaId && mensagens?.length > 0) {
      analisar();
    }
  }, [visible, conversaId]);

  const analisar = async () => {
    if (!conversaId || !mensagens?.length) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await base44.functions.invoke('analisarConversaCoachIA', {
        conversa_id: conversaId,
        empresa_id: empresaId,
        mensagens
      });
      if (resp?.data?.success) {
        setAnalise(resp.data.analise);
      } else {
        setError(resp?.data?.error || 'Erro na análise');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copiarScript = (texto) => {
    navigator.clipboard.writeText(texto).catch(() => {});
    toast.success('Script copiado!');
  };

  if (!visible) return null;

  const risco = analise?.risco_percentual ?? 0;

  return (
    <div className="coach-panel w-[340px] border-l border-zinc-800 bg-[#0d0d0f] flex flex-col shrink-0 h-full overflow-hidden coach-scroll">
      <style>{`
        .coach-scroll { scrollbar-width: thin; scrollbar-color: #27272a transparent; }
        .coach-scroll::-webkit-scrollbar { width: 4px; }
        .coach-scroll::-webkit-scrollbar-thumb { background: #27272a; border-radius: 4px; }
        .risk-high { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.25); }
        .risk-med  { background: rgba(245,158,11,0.15); color: #fbbf24; border: 1px solid rgba(245,158,11,0.25); }
        .risk-low  { background: rgba(16,185,129,0.15); color: #34d399; border: 1px solid rgba(16,185,129,0.25); }
      `}</style>

      {/* ── Header ── */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2 shrink-0 bg-[#0d0d0f]">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-sm">🤖</div>
        <div>
          <p className="text-xs font-semibold text-zinc-200">Coach IA</p>
          <p className="text-[10px] text-zinc-500">Análise da conversa</p>
        </div>
        {analise && (
          <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold border ${riskColors[riskClass(risco)]}`}>
            Risco {risco}%
          </span>
        )}
        <button onClick={onClose} className="ml-2 p-1 rounded-md hover:bg-zinc-800 text-zinc-500"><X className="w-3.5 h-3.5" /></button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-zinc-800 px-4 shrink-0">
        {['agora', 'analise', 'roteiro'].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`text-[11px] font-medium px-3 py-2 border-b-2 transition-colors ${tab === t ? 'text-violet-400 border-violet-600' : 'text-zinc-500 border-transparent hover:text-zinc-400'}`}>
            {t === 'agora' ? 'Agora' : t === 'analise' ? 'Análise' : 'Roteiro'}
          </button>
        ))}
      </div>

      {/* ── Body ── */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-zinc-700 border-t-violet-500 rounded-full animate-spin" />
              <span className="text-xs text-zinc-500">Analisando conversa...</span>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="text-center py-8">
              <p className="text-xs text-red-400 mb-3">{error}</p>
              <Button size="sm" variant="outline" onClick={analisar} className="text-xs border-zinc-700 text-zinc-400 hover:bg-zinc-800">Tentar novamente</Button>
            </div>
          )}

          {/* Conteúdo */}
          {analise && !loading && (
            <>
              {/* Tab: Agora */}
              {tab === 'agora' && (
                <>
                  {/* Situação */}
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Situação detectada agora</p>
                    <div className="flex flex-wrap gap-1.5">
                      {analise.situacao_tags?.map((tag, i) => (
                        <span key={i} className={`text-[11px] font-medium px-2 py-1 rounded-full border ${tagColors[tag.tipo] || tagColors.blue}`}>
                          {tag.tipo === 'red' ? '⚠' : tag.tipo === 'amber' ? '🌡' : tag.tipo === 'blue' ? '📍' : tag.tipo === 'green' ? '✅' : '💡'} {tag.texto}
                        </span>
                      ))}
                    </div>
                  </div>

                  <hr className="border-zinc-800" />

                  {/* Script ideal */}
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Script ideal para responder agora</p>
                    <div className="bg-[#0f172a] border border-[#1e3a5f] border-l-[3px] border-l-blue-500 rounded-lg p-3">
                      <p className="text-xs text-blue-300 italic leading-relaxed">{analise.script_ideal}</p>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="ghost" className="flex-1 h-7 text-[11px] border border-zinc-700 text-zinc-400 hover:bg-zinc-800 gap-1" onClick={() => copiarScript(analise.script_ideal)}><Copy className="w-3 h-3" /> Copiar</Button>
                      <Button size="sm" className="flex-1 h-7 text-[11px] bg-blue-600 hover:bg-blue-700 gap-1" onClick={() => onSendScript?.(analise.script_ideal)}><Send className="w-3 h-3" /> Enviar</Button>
                      <Button size="sm" variant="ghost" className="flex-1 h-7 text-[11px] border border-zinc-700 text-zinc-400 hover:bg-zinc-800 gap-1" onClick={() => analisar()}><RefreshCw className="w-3 h-3" /> Outro</Button>
                    </div>
                  </div>

                  <hr className="border-zinc-800" />

                  {/* Próximos passos */}
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Próximos passos</p>
                    <ul className="space-y-2">
                      {analise.proximos_passos?.map((p, i) => (
                        <li key={i} className="flex gap-2 items-start">
                          <span className="w-4 h-4 rounded-full border border-zinc-600 flex items-center justify-center text-[9px] font-bold text-zinc-500 shrink-0 mt-0.5">{i + 1}</span>
                          <span className="text-xs text-zinc-400 leading-relaxed">{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {/* Tab: Análise */}
              {tab === 'analise' && (
                <>
                  {/* Resumo */}
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Resumo da conversa</p>
                    <p className="text-xs text-zinc-400 leading-relaxed">{analise.resumo}</p>
                  </div>

                  <hr className="border-zinc-800" />

                  {/* O que foi bem */}
                  <div>
                    <p className="text-[10px] font-semibold text-green-400 uppercase tracking-wider mb-2">✓ O que foi bem</p>
                    <div className="space-y-1.5">
                      {analise.pontos_positivos?.map((p, i) => (
                        <p key={i} className="text-xs text-green-400/80 bg-green-500/5 border-l-2 border-green-500/30 rounded-r px-2 py-1.5 leading-relaxed">{p}</p>
                      ))}
                    </div>
                  </div>

                  {/* Onde perdeu */}
                  <div>
                    <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-2">✗ Onde perdeu oportunidade</p>
                    <div className="space-y-1.5">
                      {analise.pontos_perdidos?.map((p, i) => (
                        <p key={i} className="text-xs text-red-400/80 bg-red-500/5 border-l-2 border-red-500/30 rounded-r px-2 py-1.5 leading-relaxed">{p}</p>
                      ))}
                    </div>
                  </div>

                  <hr className="border-zinc-800" />

                  {/* Objeções */}
                  {analise.objecoes?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Objeções detectadas</p>
                      <div className="flex flex-wrap gap-1.5">
                        {analise.objecoes.map((o, i) => (
                          <span key={i} className={`text-[11px] font-medium px-2 py-1 rounded-full border ${tagColors.red}`}>💰 {o}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Risco */}
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Risco de perda</p>
                    <div className="flex justify-between mb-1">
                      <span className="text-[11px] text-zinc-500">Probabilidade de perder este lead</span>
                      <span className="text-xs font-bold text-red-400">{risco}%</span>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${risco}%`, background: risco >= 70 ? 'linear-gradient(90deg,#f87171,#ef4444)' : risco >= 40 ? 'linear-gradient(90deg,#fbbf24,#f59e0b)' : 'linear-gradient(90deg,#34d399,#10b981)' }} />
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1.5">Se nenhuma ação for tomada hoje</p>
                  </div>

                  {/* Estágio */}
                  {analise.estagio && (
                    <div className="bg-zinc-800/50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-zinc-500 uppercase font-semibold">Estágio atual</p>
                      <p className="text-xs font-bold text-violet-400 mt-0.5">{analise.estagio}</p>
                    </div>
                  )}
                </>
              )}

              {/* Tab: Roteiro */}
              {tab === 'roteiro' && (
                <>
                  {analise.estagio && (
                    <div>
                      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Estágio atual</p>
                      <p className="text-xs text-violet-400 font-medium mb-3 capitalize">{analise.estagio}</p>
                    </div>
                  )}

                  <div className="space-y-3">
                    {analise.roteiro_mensagens?.map((msg, i) => (
                      <div key={i}>
                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Mensagem {i + 1} — {msg.titulo}</p>
                        <div className="bg-[#0f172a] border border-[#1e3a5f] border-l-[3px] border-l-violet-500 rounded-lg p-3">
                          <p className="text-xs text-violet-200 italic leading-relaxed">{msg.texto}</p>
                        </div>
                        <div className="flex gap-1 mt-1.5">
                          <Button size="sm" variant="ghost" className="flex-1 h-6 text-[10px] border border-zinc-700 text-zinc-500 hover:bg-zinc-800" onClick={() => copiarScript(msg.texto)}><Copy className="w-2.5 h-2.5" /> Copiar</Button>
                          <Button size="sm" className="flex-1 h-6 text-[10px] bg-violet-600 hover:bg-violet-700" onClick={() => onSendScript?.(msg.texto)}><Send className="w-2.5 h-2.5" /> Usar</Button>
                        </div>
                        {i < analise.roteiro_mensagens.length - 1 && <hr className="border-zinc-800 mt-3" />}
                      </div>
                    ))}
                  </div>
                </>
              )}

              <hr className="border-zinc-800" />

              {/* Reanalisar */}
              <Button onClick={analisar} disabled={loading} className="w-full h-8 text-[11px] bg-violet-500/10 border border-violet-500/30 text-violet-400 hover:bg-violet-500/20 gap-1.5">
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Reanalisar agora
              </Button>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}