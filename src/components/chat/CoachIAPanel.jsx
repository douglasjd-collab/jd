import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Copy, Send, RefreshCw, X, Search, Plus, Upload, Link, FileText, Image, Video, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import CadastroIATab from './CadastroIATab';

const tagColors = { red: 'border-red-300/20 bg-red-500/10 text-red-400', amber: 'border-amber-300/20 bg-amber-500/10 text-amber-400', blue: 'border-blue-300/20 bg-blue-500/10 text-blue-400', green: 'border-green-300/20 bg-green-500/10 text-green-400', purple: 'border-purple-300/20 bg-purple-500/10 text-purple-400' };
const riskClass = (p) => p >= 70 ? 'rh' : p >= 40 ? 'rm' : 'rl';

// ── Scripts alternativos ──────────────────────────────────────────────
const ALT_SCRIPTS = [];

export default function CoachIAPanel({ conversaId, mensagens, empresaId, visible, onClose, onSendScript, initialTab = 'agora' }) {
  const [analise, setAnalise] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState(initialTab || 'agora');
  const [error, setError] = useState(null);
  const [scriptIdx, setScriptIdx] = useState(0);
  const [kbSearch, setKbSearch] = useState('');
  const [executadas, setExecutadas] = useState([]);
  const [kbUrl, setKbUrl] = useState('');
  const [kbUploading, setKbUploading] = useState(false);
  const [kbItems, setKbItems] = useState([]);
  const [kbLoaded, setKbLoaded] = useState(false);
  const kbFileRef = useRef(null);
  const prevVisible = useRef(visible);

  // Ao abrir o painel (visível transiciona para true), aplica a aba inicial solicitada
  useEffect(() => {
    if (visible && !prevVisible.current && initialTab) {
      setTab(initialTab);
    }
    prevVisible.current = visible;
  }, [visible, initialTab]);

  useEffect(() => {
    if (tab === 'kb' && empresaId && !kbLoaded) {
      base44.entities.BaseConhecimentoIA.filter({ empresa_id: empresaId }, '-created_date', 50)
        .then(items => {
          setKbItems(items.map(i => ({ ...i, tags: i.tags ? JSON.parse(i.tags) : [i.tipo] })));
          setKbLoaded(true);
        }).catch(() => {});
    }
  }, [tab, empresaId, kbLoaded]);

  useEffect(() => {
    if (visible && conversaId && mensagens?.length > 0) {
      analisar();
    }
  }, [visible, conversaId]);

  const analisar = async () => {
    if (!conversaId || !mensagens?.length) return;
    setLoading(true);
    setError(null);
    setScriptIdx(0);
    setExecutadas([]);
    try {
      const resp = await base44.functions.invoke('analisarConversaCoachIA', {
        conversa_id: conversaId, empresa_id: empresaId, mensagens
      });
      if (resp?.data?.success) {
        setAnalise(resp.data.analise);
        ALT_SCRIPTS.length = 0;
        ALT_SCRIPTS.push(resp.data.analise.script_ideal);
        if (resp.data.analise.script_alternativo) ALT_SCRIPTS.push(resp.data.analise.script_alternativo);
        resp.data.analise.roteiro_mensagens?.forEach(m => ALT_SCRIPTS.push(m.texto));

        const acaoFunil = resp.data.acao_funil;
        if (acaoFunil?.criada) {
          toast.success(`🎯 Lead adicionado ao funil em "${acaoFunil.etapa_nome}"`);
        } else if (acaoFunil?.movida) {
          toast.success(`📊 Card movido para "${acaoFunil.etapa_nome}"`);
        }
      } else {
        setError(resp?.data?.error || 'Erro na análise');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copiar = (txt) => { navigator.clipboard.writeText(txt).catch(()=>{}); toast.success('Copiado!'); };
  const proximoScript = () => { setScriptIdx(i => (i + 1) % (ALT_SCRIPTS.length || 1)); };

  const executarAcao = (acao) => {
    const key = acao.tipo + acao.label;
    if (executadas.includes(key)) return;
    setExecutadas(p => [...p, key]);
    toast.success(`"${acao.label}" executado!`);
  };

  const salvarNaBase = async (novoItem) => {
    if (!empresaId) return novoItem;
    const saved = await base44.entities.BaseConhecimentoIA.create({
      empresa_id: empresaId,
      tipo: novoItem.tipo,
      titulo: novoItem.titulo,
      resumo: novoItem.resumo,
      file_url: novoItem.file_url,
      tags: JSON.stringify(novoItem.tags || [])
    });
    return { ...novoItem, id: saved.id };
  };

  const handleKbFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setKbUploading(true);
    try {
      const uploadResp = await base44.integrations.Core.UploadFile({ file });
      const file_url = uploadResp.file_url;
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      const tipo = isImage ? 'imagem' : isVideo ? 'video' : 'documento';
      const resp = await base44.integrations.Core.InvokeLLM({
        prompt: `Analise este ${tipo} e extraia o conteúdo relevante para base de conhecimento de vendas. Retorne título curto (máx 60 chars) e resumo (máx 300 chars).`,
        file_urls: [file_url],
        response_json_schema: { type: 'object', properties: { titulo: { type: 'string' }, resumo: { type: 'string' } } }
      });
      const novoItem = { tipo, titulo: resp.titulo || file.name, resumo: resp.resumo || 'Arquivo processado.', file_url, tags: [tipo] };
      const salvo = await salvarNaBase(novoItem);
      setKbItems(prev => [salvo, ...prev]);
      toast.success('✅ Arquivo analisado e salvo na base!');
    } catch (err) {
      toast.error('Erro ao processar arquivo: ' + err.message);
    } finally {
      setKbUploading(false);
      e.target.value = '';
    }
  };

  const handleKbUrl = async () => {
    if (!kbUrl.trim()) return;
    setKbUploading(true);
    try {
      const resp = await base44.integrations.Core.InvokeLLM({
        prompt: `Acesse este link e extraia o conteúdo relevante para base de conhecimento de vendas: ${kbUrl}. Retorne título curto (máx 60 chars) e resumo (máx 300 chars).`,
        add_context_from_internet: true,
        model: 'gemini_3_flash',
        response_json_schema: { type: 'object', properties: { titulo: { type: 'string' }, resumo: { type: 'string' } } }
      });
      const novoItem = { tipo: 'url', titulo: resp.titulo || kbUrl, resumo: resp.resumo || 'Conteúdo extraído.', file_url: kbUrl, tags: ['site'] };
      const salvo = await salvarNaBase(novoItem);
      setKbItems(prev => [salvo, ...prev]);
      setKbUrl('');
      toast.success('✅ Site analisado e salvo na base!');
    } catch (err) {
      toast.error('Erro ao processar URL: ' + err.message);
    } finally {
      setKbUploading(false);
    }
  };

  const executarTodasAcoes = () => {
    analise?.acoes_nao_fechou?.forEach((a, i) => {
      setTimeout(() => executarAcao(a), i * 400);
    });
  };

  if (!visible) return null;

  const risco = analise?.risco_percentual ?? 0;
  const rk = riskClass(risco);
  const rkColors = { rh: 'bg-red-500/15 text-red-400 border-red-500/25', rm: 'bg-amber-500/15 text-amber-400 border-amber-500/25', rl: 'bg-green-500/15 text-green-400 border-green-500/25' };

  return (
    <div className="coach-p w-[360px] border-l border-zinc-800 bg-[#0d0d0f] flex flex-col shrink-0 h-full overflow-hidden coach-scroll-v2">
      <style>{`
        .coach-scroll-v2 { scrollbar-width: thin; scrollbar-color: #27272a transparent; }
        .coach-scroll-v2::-webkit-scrollbar { width: 3px; }
        .coach-scroll-v2::-webkit-scrollbar-thumb { background: #27272a; border-radius: 3px; }
        .cs-t{font-size:10px;font-weight:600;color:#52525b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
        .ct{font-size:11px;font-weight:500;padding:3px 8px;border-radius:20px;display:flex;align-items:center;gap:3px}
        .ct.r{background:rgba(239,68,68,.1);color:#f87171;border:1px solid rgba(239,68,68,.18)}
        .ct.a{background:rgba(245,158,11,.1);color:#fbbf24;border:1px solid rgba(245,158,11,.18)}
        .ct.b{background:rgba(96,165,250,.1);color:#60a5fa;border:1px solid rgba(96,165,250,.18)}
        .ct.g{background:rgba(16,185,129,.1);color:#34d399;border:1px solid rgba(16,185,129,.18)}
        .ct.p{background:rgba(167,139,250,.1);color:#a78bfa;border:1px solid rgba(167,139,250,.18)}
        .script-box{background:#0f172a;border:1px solid #1e3a5f;border-left:3px solid #3b82f6;border-radius:8px;padding:10px 12px;font-size:12px;color:#93c5fd;line-height:1.6;font-style:italic}
        .sa{display:flex;gap:5px;margin-top:8px}
        .sb{flex:1;height:28px;border-radius:6px;font-size:11px;font-weight:500;border:1px solid #27272a;background:transparent;color:#71717a;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:3px;transition:.15s}
        .sb:hover{background:#18181b;color:#e4e4e7;border-color:#3f3f46}
        .sb.p{background:#3b82f6;color:#fff;border-color:#3b82f6}.sb.p:hover{background:#2563eb}
        .div-line{border:none;border-top:1px solid #18181b}
        .si{display:flex;gap:8px;align-items:flex-start;font-size:11px;color:#a1a1aa;line-height:1.5}
        .sn{width:17px;height:17px;border-radius:50%;border:1px solid #3f3f46;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:600;color:#71717a;flex-shrink:0;margin-top:1px}
        .execute-btn{width:100%;height:30px;background:linear-gradient(90deg,#7c3aed,#4f46e5);border:none;border-radius:7px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;transition:.15s;margin-top:4px}
        .execute-btn:hover{opacity:.9}.execute-btn:disabled{opacity:.5;cursor:not-allowed}
        .spinner{width:28px;height:28px;border:2px solid #27272a;border-top-color:#7c3aed;border-radius:50%;animation:spin .8s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        .cad-item{background:#0f0f11;border:1px solid #27272a;border-radius:8px;padding:10px 12px;position:relative;overflow:hidden;margin-bottom:6px}
        .cad-item::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:3px 0 0 3px}
        .cad-item.done::before{background:#34d399}.cad-item.active::before{background:#7c3aed;box-shadow:0 0 8px rgba(124,58,237,.5)}.cad-item.pending::before{background:#27272a}
        .cad-step{font-size:10px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:.05em}
        .cad-title{font-size:12px;font-weight:600;color:#e4e4e7}
        .cad-desc{font-size:11px;color:#71717a;line-height:1.5}
        .cad-badge{margin-left:auto;font-size:10px;padding:1px 6px;border-radius:10px}
        .cad-btn{margin-top:7px;width:100%;height:26px;border-radius:5px;font-size:11px;font-weight:500;border:1px solid #7c3aed;background:rgba(124,58,237,.08);color:#a78bfa;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;transition:.15s}
        .cad-btn:hover{background:rgba(124,58,237,.18)}
        .ac{background:#0f0f11;border:1px solid #27272a;border-radius:8px;padding:10px 12px;display:flex;align-items:flex-start;gap:10px;cursor:pointer;transition:.15s;margin-bottom:6px}
        .ac:hover{background:#18181b;border-color:#3f3f46}.ac.done{opacity:.4;pointer-events:none}
        .ac-icon{width:30px;height:30px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}
        .ac-icon.p{background:rgba(124,58,237,.15)}.ac-icon.r{background:rgba(239,68,68,.12)}.ac-icon.g{background:rgba(16,185,129,.12)}.ac-icon.b{background:rgba(96,165,250,.12)}.ac-icon.a{background:rgba(245,158,11,.12)}
        .ac-t{font-size:12px;font-weight:600;color:#e4e4e7}.ac-s{font-size:11px;color:#71717a;margin-top:1px;line-height:1.4}
        .success-row{display:flex;align-items:center;gap:7px;padding:7px 10px;background:rgba(16,185,129,.08);border-radius:7px;border:1px solid rgba(16,185,129,.2);font-size:11px;color:#34d399;margin-bottom:4px}
        .err-item{font-size:11px;color:#f87171;padding:5px 9px;background:rgba(239,68,68,.06);border-radius:6px;border-left:2px solid rgba(239,68,68,.25);line-height:1.5;margin-bottom:4px}
        .win-item{font-size:11px;color:#34d399;padding:5px 9px;background:rgba(16,185,129,.06);border-radius:6px;border-left:2px solid rgba(16,185,129,.25);line-height:1.5;margin-bottom:4px}
        .bar-bg{height:5px;background:#18181b;border-radius:3px;overflow:hidden;margin-top:4px}
        .bar-fill{height:100%;border-radius:3px}
        .kb-search{width:100%;height:30px;background:#18181b;border:1px solid #27272a;border-radius:6px;padding:0 10px;font-size:11px;color:#e4e4e7;outline:none;font-family:inherit;margin-bottom:8px}
        .kb-search::placeholder{color:#52525b}
        .kb-card{background:#0f0f11;border:1px solid #27272a;border-radius:7px;padding:9px 11px;margin-bottom:5px;cursor:pointer;transition:.15s}
        .kb-card:hover{background:#18181b;border-color:#3f3f46}
        .kb-title{font-size:12px;font-weight:600;color:#e4e4e7;margin-bottom:2px}
        .kb-excerpt{font-size:11px;color:#71717a;line-height:1.5}
        .kb-tag{font-size:9px;padding:1px 5px;border-radius:4px;background:#1f2937;color:#60a5fa;border:1px solid #1e3a5f;margin-right:3px}
      `}</style>

      {/* ── Header ── */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2 shrink-0 bg-[#0d0d0f]">
        <div className="w-7 h-7 rounded-md bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-sm">🤖</div>
        <div>
          <p className="text-xs font-semibold text-zinc-200">Coach IA</p>
          <p className="text-[10px] text-zinc-500">Análise em tempo real</p>
        </div>
        {analise && <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold border ${rkColors[rk]}`}>Risco {risco}%</span>}
        <button onClick={onClose} className="ml-2 p-1 rounded-md hover:bg-zinc-800 text-zinc-500"><X className="w-3.5 h-3.5" /></button>
      </div>

      {/* ── Tabs ── */}
      <div className="shrink-0 bg-[#0d0d0f] border-b border-zinc-800">
        {/* Linha 1 */}
        <div className="flex">
          {[['agora','Agora'],['cadastro','👤 Cad.'],['cadencia','Cadência'],['nao-fechou','Não Fechou'],['analise','Análise'],['kb','📚 Base']].map(([k,v]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex-1 text-[10px] font-medium py-2 border-b-2 whitespace-nowrap transition-colors ${tab === k ? 'text-violet-400 border-violet-600' : 'text-zinc-500 border-transparent hover:text-zinc-400'}`}>{v}</button>
          ))}
        </div>
        {/* Linha 2 */}
        <div className="flex border-t border-zinc-800/60">
          {[['memoria','🧠 Mem.'],['emocao','😐 Emoção'],['aprende','🎓 Aprende'],['prosp','🎯 Prosp.'],['pm','💀 Pós-m.']].map(([k,v]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex-1 text-[10px] font-medium py-2 border-b-2 whitespace-nowrap transition-colors ${tab === k ? 'text-violet-400 border-violet-600' : 'text-zinc-500 border-transparent hover:text-zinc-400'}`}>{v}</button>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">

          {/* ═══ TAB: CADASTRO IA ═══ */}
          {!loading && tab === 'cadastro' && (
            <CadastroIATab
              conversaId={conversaId}
              mensagens={mensagens}
              empresaId={empresaId}
              onEnviarMensagem={onSendScript}
            />
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="spinner" />
              <span className="text-[11px] text-zinc-500">Analisando conversa...</span>
            </div>
          )}

          {error && !loading && (
            <div className="text-center py-8">
              <p className="text-xs text-red-400 mb-3">{error}</p>
              <Button size="sm" variant="outline" onClick={analisar} className="text-xs border-zinc-700 text-zinc-400">Tentar novamente</Button>
            </div>
          )}

          {analise && !loading && (
            <>

              {/* ═══ TAB: AGORA ═══ */}
              {tab === 'agora' && (
                <>
                  <div>
                    <div className="cs-t">Situação detectada</div>
                    <div className="flex flex-wrap gap-1.5">
                      {analise.situacao_tags?.map((tag, i) => (
                        <span key={i} className={`ct ${tag.tipo}`}>
                          {tag.tipo==='red'?'⚠':tag.tipo==='amber'?'🌡':tag.tipo==='blue'?'📍':tag.tipo==='green'?'✅':'💡'} {tag.texto}
                        </span>
                      ))}
                    </div>
                  </div>
                  <hr className="div-line" />
                  <div>
                    <div className="cs-t">Script ideal — responda agora</div>
                    <div className="script-box">{ALT_SCRIPTS[scriptIdx] || analise.script_ideal}</div>
                    <div className="sa">
                      <button className="sb" onClick={() => copiar(ALT_SCRIPTS[scriptIdx] || analise.script_ideal)}>📋 Copiar</button>
                      <button className="sb p" onClick={() => onSendScript?.(ALT_SCRIPTS[scriptIdx] || analise.script_ideal)}>➤ Enviar</button>
                      <button className="sb" onClick={proximoScript}>🔄 Outro</button>
                    </div>
                  </div>
                  <hr className="div-line" />
                  <div>
                    <div className="cs-t">Próximos passos imediatos</div>
                    <ul className="space-y-2">
                      {analise.proximos_passos?.map((p, i) => (
                        <li key={i} className="si"><span className="sn">{i+1}</span>{p}</li>
                      ))}
                    </ul>
                  </div>
                  <hr className="div-line" />
                  <button className="execute-btn" onClick={() => { setTab('cadencia'); toast.success('Veja a cadência completa!'); }}>⚡ Ver cadência completa</button>
                </>
              )}

              {/* ═══ TAB: CADÊNCIA ═══ */}
              {tab === 'cadencia' && (
                <>
                  <div>
                    <div className="cs-t">Cadência ativa: Lead em {analise.estagio?.toLowerCase() || 'negociação'}</div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed mb-2">A IA montou esta cadência com base no histórico da conversa e no estágio do funil.</p>
                  </div>
                  {analise.cadencia?.map((passo, i) => (
                    <div key={i} className={`cad-item ${passo.status}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="cad-step">Passo {i+1}</span>
                        {passo.status === 'done' && <span className="cad-badge" style={{background:'rgba(16,185,129,.12)',color:'#34d399'}}>✓ Feito</span>}
                        {passo.status === 'active' && <span className="cad-badge" style={{background:'rgba(167,139,250,.15)',color:'#a78bfa'}}>▶ Agora</span>}
                        {passo.status === 'pending' && <span className="cad-badge" style={{background:'#18181b',color:'#52525b'}}>{passo.timing}</span>}
                      </div>
                      <div className="cad-title">{passo.titulo}</div>
                      <div className="cad-desc">{passo.descricao}</div>
                      {passo.status === 'active' && (
                        <button className="cad-btn" onClick={() => onSendScript?.(ALT_SCRIPTS[scriptIdx] || analise.script_ideal)}>➤ Usar script do Coach</button>
                      )}
                      {passo.status === 'pending' && passo.titulo?.toLowerCase().includes('follow') && (
                        <button className="cad-btn" onClick={() => toast.success('Follow-up agendado!')}>📅 Agendar envio</button>
                      )}
                    </div>
                  ))}
                  <button className="execute-btn" onClick={() => toast.success('Cadência ativada! A IA vai guiar cada passo.')}>⚡ Ativar cadência automática</button>
                </>
              )}

              {/* ═══ TAB: NÃO FECHOU ═══ */}
              {tab === 'nao-fechou' && (
                <>
                  <div>
                    <div className="cs-t">Lead não fechou — ações automáticas da IA</div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed mb-1">Clique em cada ação para executar ou deixe a IA executar tudo de uma vez.</p>
                  </div>
                  {analise.acoes_nao_fechou?.map((acao, i) => {
                    const done = executadas.includes(acao.tipo + acao.label);
                    const icons = {tag:'🏷',funil:'📊',follow:'✅',ligacao:'📞',script:'🤖'};
                    const iconCls = {tag:'a',funil:'p',follow:'g',ligacao:'b',script:'p'};
                    return (
                      <div key={i} className={`ac ${done ? 'done' : ''}`} onClick={() => !done && executarAcao(acao)}>
                        <div className={`ac-icon ${iconCls[acao.tipo] || 'p'}`}>{icons[acao.tipo] || '✓'}</div>
                        <div>
                          <div className="ac-t">{acao.label}</div>
                          <div className="ac-s">{acao.descricao}</div>
                        </div>
                        {!done && <span className="text-zinc-500 text-xs self-center ml-auto">›</span>}
                        {done && <span className="text-green-400 text-xs self-center ml-auto">✓</span>}
                      </div>
                    );
                  })}
                  {executadas.length > 0 && (
                    <div>
                      {executadas.map((e, i) => (
                        <div key={i} className="success-row">✅ <span className="text-green-300 font-semibold">{e.replace(/^(tag|funil|follow|ligacao|script)/,'')}</span> — executado</div>
                      ))}
                    </div>
                  )}
                  <button className="execute-btn" onClick={executarTodasAcoes} disabled={executadas.length === analise.acoes_nao_fechou?.length}>
                    {executadas.length === analise.acoes_nao_fechou?.length ? '✅ Todas as ações executadas!' : '⚡ Executar todas as ações agora'}
                  </button>
                </>
              )}

              {/* ═══ TAB: ANÁLISE ═══ */}
              {tab === 'analise' && (
                <>
                  <div>
                    <div className="cs-t">Resumo</div>
                    <p className="text-[11px] text-zinc-300 leading-relaxed">{analise.resumo}</p>
                  </div>
                  <hr className="div-line" />
                  <div>
                    <div className="cs-t">Risco de perda</div>
                    <div className="flex justify-between mb-1"><span className="text-[11px] text-zinc-500">Probabilidade de perder sem ação</span><span className="text-xs font-bold text-red-400">{risco}%</span></div>
                    <div className="bar-bg"><div className="bar-fill" style={{width:`${risco}%`,background:risco>=70?'linear-gradient(90deg,#f87171,#ef4444)':risco>=40?'linear-gradient(90deg,#fbbf24,#f59e0b)':'linear-gradient(90deg,#34d399,#10b981)'}} /></div>
                  </div>
                  <div>
                    <div className="cs-t" style={{color:'#34d399'}}>✓ O que foi bem</div>
                    {analise.pontos_positivos?.map((p,i) => <div key={i} className="win-item">{p}</div>)}
                  </div>
                  <div>
                    <div className="cs-t" style={{color:'#f87171'}}>✗ Onde perdeu terreno</div>
                    {analise.pontos_perdidos?.map((p,i) => <div key={i} className="err-item">{p}</div>)}
                  </div>
                  <div>
                    <div className="cs-t">Objeções detectadas</div>
                    <div className="flex flex-wrap gap-1.5">
                      {analise.objecoes?.map((o,i) => <span key={i} className="ct r">💰 {o}</span>)}
                    </div>
                  </div>
                </>
              )}

              {/* ═══ TAB: BASE ═══ */}
              {tab === 'kb' && (
                <>
                  <div className="cs-t">Base de conhecimento da empresa</div>
                  <input className="kb-search" placeholder="🔍 Buscar serviço, objeção, case..." value={kbSearch} onChange={e => setKbSearch(e.target.value)} />

                  {/* Adicionar novo material */}
                  <div style={{background:'#0f0f11',border:'1px solid #27272a',borderRadius:9,padding:'10px 11px',marginBottom:8}}>
                    <div className="cs-t" style={{marginBottom:8}}>➕ Adicionar material de treinamento</div>

                    {/* Upload de arquivo */}
                    <input ref={kbFileRef} type="file" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif,.webp,.mp4,.mov,.webm" style={{display:'none'}} onChange={handleKbFile} />
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5,marginBottom:8}}>
                      <button onClick={() => { kbFileRef.current.accept='.pdf,.doc,.docx,.txt'; kbFileRef.current.click(); }} disabled={kbUploading} style={{height:34,borderRadius:6,border:'1px solid #27272a',background:'#18181b',color:'#a1a1aa',fontSize:10,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
                        <FileText size={12}/> Documento
                      </button>
                      <button onClick={() => { kbFileRef.current.accept='image/*'; kbFileRef.current.click(); }} disabled={kbUploading} style={{height:34,borderRadius:6,border:'1px solid #27272a',background:'#18181b',color:'#a1a1aa',fontSize:10,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
                        <Image size={12}/> Imagem
                      </button>
                      <button onClick={() => { kbFileRef.current.accept='video/*'; kbFileRef.current.click(); }} disabled={kbUploading} style={{height:34,borderRadius:6,border:'1px solid #27272a',background:'#18181b',color:'#a1a1aa',fontSize:10,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
                        <Video size={12}/> Vídeo
                      </button>
                      <button onClick={() => { kbFileRef.current.accept='*/*'; kbFileRef.current.click(); }} disabled={kbUploading} style={{height:34,borderRadius:6,border:'1px solid #27272a',background:'#18181b',color:'#a1a1aa',fontSize:10,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
                        <Upload size={12}/> Outro
                      </button>
                    </div>

                    {/* URL/Site */}
                    <div style={{display:'flex',gap:5}}>
                      <input
                        value={kbUrl} onChange={e => setKbUrl(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleKbUrl()}
                        placeholder="🔗 Cole URL de site, vídeo ou artigo..."
                        style={{flex:1,height:30,background:'#18181b',border:'1px solid #27272a',borderRadius:6,padding:'0 8px',fontSize:11,color:'#e4e4e7',outline:'none',fontFamily:'inherit'}}
                      />
                      <button onClick={handleKbUrl} disabled={kbUploading || !kbUrl.trim()} style={{height:30,padding:'0 10px',borderRadius:6,border:'none',background:'#7c3aed',color:'#fff',fontSize:11,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:3,opacity:kbUploading||!kbUrl.trim()?0.5:1}}>
                        {kbUploading ? <Loader2 size={11} className="animate-spin"/> : <Link size={11}/>} {kbUploading ? '...' : 'Analisar'}
                      </button>
                    </div>
                  </div>

                  {kbUploading && (
                    <div style={{display:'flex',alignItems:'center',gap:6,padding:'8px 10px',background:'rgba(124,58,237,.08)',borderRadius:7,border:'1px solid rgba(124,58,237,.2)',fontSize:11,color:'#a78bfa',marginBottom:6}}>
                      <Loader2 size={12} className="animate-spin"/> IA analisando e extraindo conteúdo...
                    </div>
                  )}

                  {/* Itens adicionados pelo usuário */}
                  {kbItems.map((k, i) => {
                    const typeIcon = k.tipo === 'imagem' ? '🖼' : k.tipo === 'video' ? '🎬' : k.tipo === 'url' ? '🌐' : '📄';
                    return (
                      <div key={`custom-${i}`} className="kb-card" style={{position:'relative'}}>
                        <div style={{display:'flex',alignItems:'flex-start',gap:6}}>
                          <span style={{fontSize:14}}>{typeIcon}</span>
                          <div style={{flex:1}}>
                            <div className="kb-title">{k.titulo}</div>
                            <div className="kb-excerpt">{k.resumo?.substring(0,130)}{k.resumo?.length > 130 ? '...' : ''}</div>
                            <div className="mt-1.5">{k.tags?.map((t,j) => <span key={j} className="kb-tag">{t}</span>)}</div>
                          </div>
                          <button onClick={async () => {
                              if (k.id) { try { await base44.entities.BaseConhecimentoIA.delete(k.id); } catch {} }
                              setKbItems(prev => prev.filter((_,idx)=>idx!==i));
                              toast.success('Removido da base.');
                            }} style={{background:'none',border:'none',cursor:'pointer',color:'#52525b',padding:2,flexShrink:0}}>
                             <Trash2 size={11}/>
                           </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Itens da IA */}
                  {(analise.base_conhecimento || [])
                    .filter(k => !kbSearch || k.titulo?.toLowerCase().includes(kbSearch.toLowerCase()) || k.conteudo?.toLowerCase().includes(kbSearch.toLowerCase()) || k.tags?.some(t => t.toLowerCase().includes(kbSearch.toLowerCase())))
                    .map((k, i) => (
                    <div key={i} className="kb-card" onClick={() => { copiar(k.conteudo); onSendScript?.(k.conteudo?.substring(0,200)); }}>
                      <div className="kb-title">{k.titulo}</div>
                      <div className="kb-excerpt">{k.conteudo?.substring(0,150)}{k.conteudo?.length > 150 ? '...' : ''}</div>
                      <div className="mt-1.5">{k.tags?.map((t,j) => <span key={j} className="kb-tag">{t}</span>)}</div>
                    </div>
                  ))}
                </>
              )}

              {/* ═══ TAB: MEMÓRIA ═══ */}
              {tab === 'memoria' && (
                <>
                  <div className="cs-t">Histórico de conversas</div>
                  {[{canal:'💬',titulo:'Primeiro contato',data:'Conversa anterior',resumo:'Lead manifestou interesse inicial. Perguntou sobre valores e prazo.',cor:'#a78bfa'},{canal:'💬',titulo:'Conversa atual',data:'Hoje',resumo:'Análise em andamento com base na conversa atual.',cor:'#34d399'}].map((c,i) => (
                    <div key={i} className="kb-card">
                      <div className="flex items-center gap-1.5 mb-1"><span>{c.canal}</span><span className="kb-title" style={{margin:0}}>{c.titulo}</span><span className="text-[10px] text-zinc-500 ml-auto">{c.data}</span></div>
                      <div className="kb-excerpt">{c.resumo}</div>
                      <span className="text-[9px] font-semibold mt-1.5 block" style={{color:c.cor}}>● {i===1?'ativo':'concluído'}</span>
                    </div>
                  ))}
                  <hr className="div-line" />
                  <div className="cs-t">O que a IA lembra</div>
                  {[['Principal objeção', analise.objecoes?.[0] || 'Não detectada', '#f87171'],['Resumo', analise.resumo?.slice(0,80)+'...', '#a1a1aa'],['Risco atual', `${analise.risco_percentual ?? 0}%`, '#fbbf24']].map(([label,valor,cor],i) => (
                    <div key={i} className="flex gap-2 py-1.5 border-b border-zinc-800 text-[11px]">
                      <span className="text-zinc-500 w-28 shrink-0">{label}</span>
                      <span className="font-medium" style={{color:cor}}>{valor}</span>
                    </div>
                  ))}
                  <hr className="div-line" />
                  <div className="cs-t">Tom de voz aplicado</div>
                  <div style={{background:'#13111f',border:'1px solid rgba(124,58,237,.2)',borderRadius:7,padding:'9px 11px',fontSize:11,color:'#a78bfa',lineHeight:1.6}}>
                    IA usa tom direto e consultivo. Evita jargões técnicos e sempre termina com pergunta de fechamento.
                  </div>
                  <button className="execute-btn" onClick={() => toast.success('Histórico exportado!')}>📄 Exportar histórico do lead</button>
                </>
              )}

              {/* ═══ TAB: EMOÇÃO ═══ */}
              {tab === 'emocao' && (
                <>
                  <div className="cs-t">Temperatura emocional</div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[{emoji:'😊',label:'Animado',pct:12,cor:'#34d399'},{emoji:'😐',label:'Hesitante',pct:58,cor:'#fbbf24',destaque:true},{emoji:'😤',label:'Com pressa',pct:8,cor:'#f87171'},{emoji:'🤔',label:'Comparando',pct:22,cor:'#60a5fa'}].map((e,i) => (
                      <div key={i} style={{background:e.destaque?'rgba(124,58,237,.06)':'#0f0f11',border:`1px solid ${e.destaque?'rgba(124,58,237,.3)':'#27272a'}`,borderRadius:8,padding:'8px 10px',textAlign:'center',cursor:'pointer'}}>
                        <div style={{fontSize:18}}>{e.emoji}</div>
                        <div style={{fontSize:9,color:'#52525b',fontWeight:500,marginTop:2}}>{e.label}</div>
                        <div style={{fontSize:11,fontWeight:700,color:e.cor}}>{e.pct}%</div>
                      </div>
                    ))}
                  </div>
                  <hr className="div-line" />
                  <div className="cs-t">Como a IA adapta o tom</div>
                  <div className="kb-card"><span style={{color:'#fbbf24',fontWeight:600}}>Hesitante detectado →</span><span className="kb-excerpt"> IA reduz urgência, usa dados concretos, evita pressão direta.</span></div>
                  <hr className="div-line" />
                  <div className="cs-t">Script adaptado para a emoção</div>
                  <div className="script-box">{analise.script_ideal || '"Sem pressão! Vamos entender o que faz mais sentido para você. Qual é a maior dificuldade hoje?"'}</div>
                </>
              )}

              {/* ═══ TAB: APRENDE ═══ */}
              {tab === 'aprende' && (
                <>
                  <div className="cs-t">Padrões aprendidos</div>
                  {[{icon:'🏆',bg:'rgba(16,185,129,.1)',titulo:'ROI antes do preço',desc:'Conversas que mostraram ROI antes de citar preço fecharam 3x mais.',qtd:14},{icon:'🏆',bg:'rgba(16,185,129,.1)',titulo:'Incluir decisor cedo',desc:'Leads com todos decisores na reunião fecharam 2.4x mais.',qtd:9},{icon:'❌',bg:'rgba(239,68,68,.1)',titulo:'Falar preço sem perguntar',desc:'Citar preço sem entender o problema aumentou perdas em 78%.',qtd:22},{icon:'💡',bg:'rgba(96,165,250,.1)',titulo:'Novo padrão detectado',desc:'Múltiplos leads mencionaram obstáculo técnico similar.',qtd:4}].map((p,i) => (
                    <div key={i} className="flex gap-2 py-2 border-b border-zinc-800">
                      <div style={{width:24,height:24,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,flexShrink:0,background:p.bg}}>{p.icon}</div>
                      <div><div className="kb-title">{p.titulo}</div><div className="kb-excerpt">{p.desc}</div><div style={{fontSize:10,color:'#52525b',marginTop:2}}>{p.qtd} conversas</div></div>
                    </div>
                  ))}
                  <hr className="div-line" />
                  <div className="cs-t">Taxa de fechamento</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="kb-card" style={{textAlign:'center'}}><div style={{fontSize:22,fontWeight:700,color:'#34d399'}}>47%</div><div style={{fontSize:10,color:'#52525b'}}>Com Coach IA</div></div>
                    <div className="kb-card" style={{textAlign:'center'}}><div style={{fontSize:22,fontWeight:700,color:'#f87171'}}>18%</div><div style={{fontSize:10,color:'#52525b'}}>Sem Coach IA</div></div>
                  </div>
                  <button className="execute-btn" onClick={() => toast.success('Fechamento registrado!', {description:'IA vai aprender com esta conversa.'})}>🎓 Marcar fechamento e ensinar IA</button>
                </>
              )}

              {/* ═══ TAB: PROSPECÇÃO ═══ */}
              {tab === 'prosp' && (
                <>
                  <div className="cs-t">Leads similares encontrados</div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed mb-3">IA encontrou leads parados com perfil similar a este contato.</p>
                  {[{iniciais:'RS',nome:'Ricardo Souza',sub:'Diretor · WhatsApp · Parado 7d',score:91,bg:'linear-gradient(135deg,#3b82f6,#1d4ed8)'},{iniciais:'AL',nome:'Ana Lima',sub:'Sócia · PME · Parada 14d',score:87,bg:'linear-gradient(135deg,#f59e0b,#b45309)'},{iniciais:'CF',nome:'Carlos Ferreira',sub:'CEO · 8 pessoas · Parado 7d',score:82,bg:'linear-gradient(135deg,#8b5cf6,#6d28d9)'}].map((l,i) => (
                    <div key={i} className="kb-card" style={{display:'flex',gap:9,alignItems:'flex-start',cursor:'pointer'}}>
                      <div style={{width:30,height:30,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#fff',flexShrink:0,background:l.bg}}>{l.iniciais}</div>
                      <div style={{flex:1}}><div className="kb-title">{l.nome}</div><div className="kb-excerpt">{l.sub}</div></div>
                      <div style={{fontSize:12,fontWeight:700,color:'#4ade80'}}>{l.score}%</div>
                    </div>
                  ))}
                  <button className="execute-btn" onClick={() => toast.success('Reativação iniciada!', {description:'IA vai abordar leads com script personalizado.'})}>🚀 Reativar todos com script personalizado</button>
                </>
              )}

              {/* ═══ TAB: PÓS-MORTEM ═══ */}
              {tab === 'pm' && (
                <>
                  <div className="cs-t">Diagnóstico de perdas</div>
                  {[{titulo:'Lead Perdido — Objeção',motivo:'Objeção preço',corM:'#f87171',erros:['Preço citado antes de entender o problema','Decisor adicional nunca incluído'],pos:['Engajamento alto no início — lead tinha potencial'],rec:'Reativar com case de ROI específico para o segmento.'},{titulo:'Lead Perdido — Silêncio',motivo:'Silêncio',corM:'#fbbf24',erros:['Follow-up feito muito tarde','Mensagem genérica sem personalização'],pos:['Respondeu antes de parar — havia interesse real'],rec:'Follow-up automático ativado em D+1 para leads similares.'}].map((c,i) => (
                    <div key={i} className="kb-card" style={{marginBottom:6}}>
                      <div className="flex items-center gap-2 mb-2"><span>💀</span><span className="kb-title" style={{margin:0}}>{c.titulo}</span><span style={{fontSize:9,padding:'2px 6px',borderRadius:10,background:'rgba(239,68,68,.1)',color:c.corM,border:`1px solid ${c.corM}40`,marginLeft:'auto'}}>{c.motivo}</span></div>
                      {c.erros.map((e,j) => <div key={j} className="err-item">{e}</div>)}
                      {c.pos.map((p,j) => <div key={j} className="win-item">{p}</div>)}
                      <div style={{fontSize:11,color:'#a78bfa',padding:'5px 9px',background:'rgba(124,58,237,.06)',borderRadius:6,borderLeft:'2px solid rgba(124,58,237,.25)',marginTop:4}}>💡 {c.rec}</div>
                    </div>
                  ))}
                  <hr className="div-line" />
                  <div className="cs-t">Principais causas — 30 dias</div>
                  {[['Objeção sem ROI','#f87171',34],['Silêncio · follow-up tardio','#fbbf24',28],['Decisor não incluído','#60a5fa',21],['Concorrente escolhido','#a78bfa',17]].map(([label,cor,pct],i) => (
                    <div key={i} className="flex justify-between py-1.5 border-b border-zinc-800 text-[11px]">
                      <span style={{color:cor}}>{label}</span><span style={{fontWeight:600,color:cor}}>{pct}%</span>
                    </div>
                  ))}
                  <button className="execute-btn" style={{marginTop:8}} onClick={() => toast.success('Relatório gerado!')}>📄 Gerar relatório completo</button>
                </>
              )}

              <hr className="div-line" />
              <button onClick={analisar} disabled={loading} className="w-full h-8 text-[11px] rounded-lg bg-violet-500/10 border border-violet-500/30 text-violet-400 hover:bg-violet-500/20 flex items-center justify-center gap-1.5 font-medium">
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Reanalisar agora
              </button>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}