import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { X, RefreshCw, Download, TrendingUp, MessageCircle, Users, Zap, Calendar, Bell, CheckSquare, FileText, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, startOfDay, startOfWeek, startOfMonth, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const SCORE_RULES = {
  conversas: 5,
  oportunidades: 15,
  tarefas: 3,
  compromissos: 4,
  mensagens: 0.2,
};

function calcScore(m) {
  return Math.round(
    (m.conversas || 0) * SCORE_RULES.conversas +
    (m.oportunidades || 0) * SCORE_RULES.oportunidades +
    (m.tarefas || 0) * SCORE_RULES.tarefas +
    (m.compromissos || 0) * SCORE_RULES.compromissos +
    (m.mensagens || 0) * SCORE_RULES.mensagens
  );
}

function getInitials(nome) {
  if (!nome) return '?';
  return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

const PERIOD_COLORS = ['bg-emerald-500', 'bg-blue-500', 'bg-amber-500'];

export default function PainelProdutividade({ empresaId, onClose }) {
  const [periodo, setPeriodo] = useState('hoje');
  const [loading, setLoading] = useState(true);
  const [colaboradores, setColaboradores] = useState([]);
  const [conversas, setConversas] = useState([]);
  const [mensagens, setMensagens] = useState([]);
  const [tarefas, setTarefas] = useState([]);
  const [oportunidades, setOportunidades] = useState([]);
  const [agenda, setAgenda] = useState([]);
  const [countdown, setCountdown] = useState(60);
  const [expandedUser, setExpandedUser] = useState(null);
  const [tab, setTab] = useState('resumo');
  const [filtroUser, setFiltroUser] = useState('all');
  const [lastUpdate, setLastUpdate] = useState(null);

  const getPeriodStart = useCallback(() => {
    const now = new Date();
    if (periodo === 'hoje') return startOfDay(now);
    if (periodo === 'semana') return startOfWeek(now, { locale: ptBR });
    return startOfMonth(now);
  }, [periodo]);

  const loadData = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const [colabs, convs, msgs, tars, ops, agd] = await Promise.all([
        base44.entities.Colaborador.filter({ empresa_id: empresaId, status: 'ativo' }, 'nome', 100),
        base44.entities.ConversaWhatsapp.filter({ empresa_id: empresaId }, '-updated_date', 2000),
        base44.entities.MensagemWhatsapp.filter({ empresa_id: empresaId, remetente: 'vendedor' }, '-data_envio', 3000),
        base44.entities.Tarefa.filter({ empresa_id: empresaId }, '-created_date', 1000),
        base44.entities.Oportunidade.filter({ empresa_id: empresaId }, '-created_date', 1000),
        base44.entities.Agenda.filter({ empresa_id: empresaId }, '-created_date', 500),
      ]);
      setColaboradores(colabs || []);
      setConversas(convs || []);
      setMensagens(msgs || []);
      setTarefas(tars || []);
      setOportunidades(ops || []);
      setAgenda(agd || []);
      setLastUpdate(new Date());
    } catch (e) {
      console.error('Erro ao carregar produtividade:', e);
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Countdown e auto-refresh a cada 60s
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { loadData(); return 60; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  const periodStart = getPeriodStart();

  // Calcular métricas por colaborador
  const metricas = useMemo(() => {
    return colaboradores.map(colab => {
      const userId = colab.user_id;
      const colabId = colab.id;

      const convAtivas = conversas.filter(c =>
        c.responsavel_id === colabId &&
        c.responsavel_expira_em &&
        isAfter(new Date(c.responsavel_expira_em), new Date())
      ).length;

      const msgsEnv = mensagens.filter(m =>
        m.usuario_id === userId &&
        m.data_envio && isAfter(new Date(m.data_envio), periodStart)
      ).length;

      const tarsColab = tarefas.filter(t => {
        if (!t.data_conclusao_prevista) return false;
        let resps = [];
        try { resps = t.responsaveis_ids ? JSON.parse(t.responsaveis_ids) : []; } catch {}
        const isResp = t.responsavel_principal_id === colabId || resps.includes(colabId);
        return isResp && isAfter(new Date(t.created_date || 0), periodStart);
      }).length;

      const opsColab = oportunidades.filter(o =>
        o.vendedor_id === userId &&
        isAfter(new Date(o.created_date || 0), periodStart)
      ).length;

      const agdColab = agenda.filter(a =>
        a.responsavel_id === colabId &&
        isAfter(new Date(a.created_date || 0), periodStart)
      ).length;

      const m = { conversas: convAtivas, mensagens: msgsEnv, tarefas: tarsColab, oportunidades: opsColab, compromissos: agdColab };
      return { ...colab, ...m, score: calcScore(m), online: convAtivas > 0 };
    }).sort((a, b) => b.score - a.score);
  }, [colaboradores, conversas, mensagens, tarefas, oportunidades, agenda, periodStart]);

  const metricasFiltradas = filtroUser === 'all' ? metricas : metricas.filter(m => m.id === filtroUser);

  // KPIs globais
  const kpis = useMemo(() => {
    const totalOport = oportunidades.filter(o => isAfter(new Date(o.created_date || 0), periodStart)).length;
    const convAtivas = conversas.filter(c => c.status === 'ativa').length;
    const online = metricas.filter(m => m.online).length;
    const scoreTotal = metricas.reduce((acc, m) => acc + m.score, 0);
    const totalTarefas = tarefas.filter(t => isAfter(new Date(t.created_date || 0), periodStart)).length;
    const totalAgenda = agenda.filter(a => isAfter(new Date(a.created_date || 0), periodStart)).length;
    const totalMsgs = mensagens.filter(m => m.data_envio && isAfter(new Date(m.data_envio), periodStart)).length;
    return { totalOport, convAtivas, online, total: metricas.length, scoreTotal, totalTarefas, totalAgenda, totalMsgs };
  }, [metricas, oportunidades, conversas, tarefas, agenda, mensagens, periodStart]);

  const exportCSV = () => {
    const rows = [['Nome', 'Score', 'Oportunidades', 'Conversas Ativas', 'Tarefas', 'Compromissos', 'Msgs Enviadas']];
    metricasFiltradas.forEach(m => {
      rows.push([m.nome, m.score, m.oportunidades, m.conversas, m.tarefas, m.compromissos, m.mensagens]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `produtividade_${periodo}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const scoreColor = (score) => {
    if (score >= 80) return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30';
    if (score >= 50) return 'text-amber-400 bg-amber-400/10 border-amber-400/30';
    return 'text-slate-400 bg-slate-400/10 border-slate-400/30';
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={e => e.target === e.currentTarget && onClose()}>
      <div
        className="relative w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col rounded-2xl shadow-2xl"
        style={{ background: '#0b0f14', color: '#e2eaf4', fontFamily: 'DM Sans, sans-serif' }}
      >
        {/* CSS inline para estilos específicos */}
        <style>{`
          .prod-kpi { background: #161d28; border: 1px solid #1e2a38; border-radius: 14px; padding: 18px 20px; display: flex; flex-direction: column; gap: 6px; }
          .prod-kpi.green { border-color: rgba(34,208,122,.18); }
          .prod-kpi.blue { border-color: rgba(59,158,255,.18); }
          .prod-kpi.amber { border-color: rgba(245,166,35,.18); }
          .prod-kpi.purple { border-color: rgba(163,102,255,.18); }
          .prod-sec { background: #161d28; border: 1px solid #1e2a38; border-radius: 10px; padding: 12px 16px; display: flex; align-items: center; gap: 12px; }
          .prod-user { background: #161d28; border: 1px solid #1e2a38; border-radius: 14px; overflow: hidden; cursor: pointer; transition: border-color .15s; }
          .prod-user:hover { border-color: #243040; }
          .prod-tab { padding: 6px 16px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; background: transparent; color: #5a7190; transition: all .15s; }
          .prod-tab.active { background: #1e2a38; color: #e2eaf4; }
          .prod-metric { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #5a7190; }
          .prod-metric .val { color: #e2eaf4; font-weight: 600; }
          .prod-pill { border-radius: 999px; padding: 3px 10px; font-size: 12px; font-weight: 700; border: 1px solid; }
          .prod-period { padding: 5px 14px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; background: #1e2a38; color: #5a7190; transition: all .15s; }
          .prod-period.active { background: #22d07a; color: #0b0f14; }
        `}</style>

        {/* Header */}
        <div style={{ background: '#111720', borderBottom: '1px solid #1e2a38' }} className="flex items-center justify-between px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(34,208,122,.12)' }}>
              <TrendingUp className="w-5 h-5" style={{ color: '#22d07a' }} />
            </div>
            <div>
              <h2 className="font-bold text-base" style={{ color: '#e2eaf4' }}>Visão Geral — Time Comercial</h2>
              <p className="text-xs" style={{ color: '#5a7190' }}>Acompanhe o desempenho de cada vendedor</p>
            </div>
            <span className="ml-2 text-xs font-semibold px-2 py-1 rounded-full" style={{ background: 'rgba(34,208,122,.12)', color: '#22d07a', border: '1px solid rgba(34,208,122,.25)' }}>
              ● AO VIVO
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadData} className="p-2 rounded-lg hover:bg-white/5 transition-colors" title="Atualizar">
              <RefreshCw className="w-4 h-4" style={{ color: '#5a7190' }} />
            </button>
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: '#1e2a38', color: '#e2eaf4', border: '1px solid #243040' }}
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 transition-colors">
              <X className="w-4 h-4" style={{ color: '#5a7190' }} />
            </button>
          </div>
        </div>

        {/* Scroll content */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-3" style={{ background: '#111720', border: '1px solid #1e2a38', borderRadius: '10px', padding: '10px 16px' }}>
            <span className="text-xs font-medium" style={{ color: '#5a7190' }}>Período:</span>
            <div className="flex gap-1">
              {[['hoje', 'Hoje'], ['semana', 'Esta Semana'], ['mes', 'Este Mês']].map(([v, l]) => (
                <button key={v} className={`prod-period ${periodo === v ? 'active' : ''}`} onClick={() => setPeriodo(v)}>{l}</button>
              ))}
            </div>
            <div style={{ width: '1px', height: '20px', background: '#1e2a38' }} />
            <span className="text-xs font-medium" style={{ color: '#5a7190' }}>Usuário:</span>
            <select
              value={filtroUser}
              onChange={e => setFiltroUser(e.target.value)}
              className="text-xs rounded-lg px-3 py-1.5"
              style={{ background: '#1e2a38', color: '#e2eaf4', border: '1px solid #243040', outline: 'none' }}
            >
              <option value="all">Todos os usuários</option>
              {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <div style={{ width: '1px', height: '20px', background: '#1e2a38' }} />
            <span className="text-xs" style={{ color: '#5a7190' }}>🔄 Atualiza em <span style={{ color: '#e2eaf4', fontWeight: 600 }}>{countdown}s</span></span>
            {lastUpdate && (
              <span className="text-xs ml-auto" style={{ color: '#3a5068' }}>
                Última atualização: {format(lastUpdate, 'HH:mm:ss')}
              </span>
            )}
          </div>

          {/* KPIs principais */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="prod-kpi green">
                  <div className="text-lg">📈</div>
                  <div className="text-3xl font-bold" style={{ color: '#22d07a' }}>{kpis.totalOport}</div>
                  <div className="text-xs" style={{ color: '#5a7190' }}>Oportunidades Geradas</div>
                </div>
                <div className="prod-kpi blue">
                  <div className="text-lg">💬</div>
                  <div className="text-3xl font-bold" style={{ color: '#3b9eff' }}>{kpis.convAtivas}</div>
                  <div className="text-xs" style={{ color: '#5a7190' }}>Conversas Ativas</div>
                </div>
                <div className="prod-kpi amber">
                  <div className="text-lg">👥</div>
                  <div className="text-3xl font-bold" style={{ color: '#f5a623' }}>
                    {kpis.online}<span className="text-base font-normal" style={{ color: '#5a7190' }}>/{kpis.total}</span>
                  </div>
                  <div className="text-xs" style={{ color: '#5a7190' }}>Usuários em Atendimento</div>
                </div>
                <div className="prod-kpi purple">
                  <div className="text-lg">⚡</div>
                  <div className="text-3xl font-bold" style={{ color: '#a366ff' }}>{kpis.scoreTotal}</div>
                  <div className="text-xs" style={{ color: '#5a7190' }}>Score Total do Time</div>
                </div>
              </div>

              {/* KPIs secundários */}
              <div className="grid grid-cols-3 lg:grid-cols-5 gap-2">
                {[
                  { icon: '📅', val: kpis.totalAgenda, label: 'Compromissos' },
                  { icon: '🔔', val: 0, label: 'Lembretes' },
                  { icon: '✅', val: kpis.totalTarefas, label: 'Tarefas' },
                  { icon: '📋', val: 0, label: 'Prontuários' },
                  { icon: '📤', val: kpis.totalMsgs, label: 'Msgs Enviadas' },
                ].map(({ icon, val, label }) => (
                  <div key={label} className="prod-sec">
                    <span className="text-xl">{icon}</span>
                    <div>
                      <div className="text-xl font-bold" style={{ color: '#e2eaf4' }}>{val}</div>
                      <div className="text-xs" style={{ color: '#5a7190' }}>{label}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Tabs */}
              <div style={{ borderBottom: '1px solid #1e2a38' }} className="flex gap-1 pb-1">
                {[['resumo', '📊 Resumo'], ['aovivo', '● Ao Vivo'], ['ranking', '🏆 Ranking']].map(([v, l]) => (
                  <button key={v} className={`prod-tab ${tab === v ? 'active' : ''}`} onClick={() => setTab(v)}>{l}</button>
                ))}
              </div>

              {/* Tab: Resumo */}
              {tab === 'resumo' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: '#5a7190' }}>Detalhamento por Usuário</h3>
                    <span className="text-xs" style={{ color: '#5a7190' }}>{metricasFiltradas.length} vendedores</span>
                  </div>
                  {metricasFiltradas.length === 0 && (
                    <div className="text-center py-10" style={{ color: '#5a7190' }}>Nenhum colaborador encontrado</div>
                  )}
                  {metricasFiltradas.map(m => (
                    <div key={m.id} className="prod-user" onClick={() => setExpandedUser(expandedUser === m.id ? null : m.id)}>
                      <div className="flex items-center gap-3 p-4">
                        {/* Avatar */}
                        <div className="relative flex-shrink-0">
                          {m.foto_perfil ? (
                            <img src={m.foto_perfil} className="w-12 h-12 rounded-full object-cover" />
                          ) : (
                            <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm" style={{ background: 'linear-gradient(135deg, #1a3020, #223828)', color: '#22d07a' }}>
                              {getInitials(m.nome)}
                            </div>
                          )}
                          <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 ${m.online ? 'bg-emerald-400' : 'bg-slate-600'}`} style={{ borderColor: '#161d28' }} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm" style={{ color: '#e2eaf4' }}>{m.nome}</span>
                            {m.online && <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(34,208,122,.12)', color: '#22d07a' }}>● Online</span>}
                            {m.conversas > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(59,158,255,.12)', color: '#3b9eff' }}>{m.conversas} conv.</span>}
                          </div>
                          <div className="flex flex-wrap gap-3 mt-1.5">
                            <span className="prod-metric">📈 <span className="val">{m.oportunidades}</span> oport.</span>
                            <span className="prod-metric">💬 <span className="val">{m.conversas}</span> conv.</span>
                            <span className="prod-metric">📅 <span className="val">{m.compromissos}</span> comp.</span>
                            <span className="prod-metric">✅ <span className="val">{m.tarefas}</span> tarefas</span>
                            <span className="prod-metric">📤 <span className="val">{m.mensagens}</span> msgs</span>
                          </div>
                        </div>

                        {/* Score + chevron */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className={`prod-pill ${scoreColor(m.score)}`}>⚡ {m.score} pts</span>
                          {expandedUser === m.id ? <ChevronUp className="w-4 h-4" style={{ color: '#5a7190' }} /> : <ChevronDown className="w-4 h-4" style={{ color: '#5a7190' }} />}
                        </div>
                      </div>

                      {/* Expanded */}
                      {expandedUser === m.id && (
                        <div style={{ borderTop: '1px solid #1e2a38', background: '#111720' }} className="px-4 py-3">
                          <p className="text-xs font-semibold mb-2" style={{ color: '#5a7190' }}>📊 Detalhes de atividade no período</p>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                            {[
                              { label: 'Oportunidades', val: m.oportunidades, color: '#22d07a', pts: m.oportunidades * SCORE_RULES.oportunidades },
                              { label: 'Conv. Ativas', val: m.conversas, color: '#3b9eff', pts: m.conversas * SCORE_RULES.conversas },
                              { label: 'Compromissos', val: m.compromissos, color: '#f5a623', pts: m.compromissos * SCORE_RULES.compromissos },
                              { label: 'Tarefas', val: m.tarefas, color: '#a366ff', pts: m.tarefas * SCORE_RULES.tarefas },
                              { label: 'Msgs Enviadas', val: m.mensagens, color: '#5a7190', pts: Math.round(m.mensagens * SCORE_RULES.mensagens) },
                            ].map(({ label, val, color, pts }) => (
                              <div key={label} className="rounded-lg p-2 text-center" style={{ background: '#161d28', border: '1px solid #1e2a38' }}>
                                <div className="text-xl font-bold" style={{ color }}>{val}</div>
                                <div className="text-xs" style={{ color: '#5a7190' }}>{label}</div>
                                <div className="text-xs mt-0.5" style={{ color: '#3a5068' }}>+{pts} pts</div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 text-right">
                            <span className="text-xs font-bold" style={{ color: '#22d07a' }}>Total: {m.score} pontos</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Tab: Ao Vivo */}
              {tab === 'aovivo' && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#5a7190' }}>Em Atendimento Agora</h3>
                  {metricasFiltradas.filter(m => m.online).length === 0 && (
                    <div className="text-center py-10" style={{ color: '#5a7190' }}>Nenhum usuário em atendimento ativo</div>
                  )}
                  {metricasFiltradas.filter(m => m.online).map(m => (
                    <div key={m.id} className="prod-user p-4">
                      <div className="flex items-center gap-3">
                        <div className="relative flex-shrink-0">
                          {m.foto_perfil ? (
                            <img src={m.foto_perfil} className="w-10 h-10 rounded-full object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm" style={{ background: 'linear-gradient(135deg,#1a3020,#223828)', color: '#22d07a' }}>
                              {getInitials(m.nome)}
                            </div>
                          )}
                          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2" style={{ borderColor: '#161d28' }} />
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-sm" style={{ color: '#e2eaf4' }}>{m.nome}</div>
                          <div className="text-xs mt-0.5" style={{ color: '#5a7190' }}>
                            {m.conversas} conversa{m.conversas !== 1 ? 's' : ''} ativas · {m.mensagens} msgs enviadas hoje
                          </div>
                        </div>
                        <span className={`prod-pill ${scoreColor(m.score)}`}>⚡ {m.score} pts</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab: Ranking */}
              {tab === 'ranking' && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#5a7190' }}>Ranking por Score</h3>
                  {metricasFiltradas.map((m, i) => (
                    <div key={m.id} className="prod-user p-4">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl font-black w-8 text-center" style={{ color: i === 0 ? '#f5a623' : i === 1 ? '#9ca3af' : i === 2 ? '#cd7c39' : '#3a5068' }}>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                        </span>
                        {m.foto_perfil ? (
                          <img src={m.foto_perfil} className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm" style={{ background: 'linear-gradient(135deg,#1a2030,#222838)', color: '#3b9eff' }}>
                            {getInitials(m.nome)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm" style={{ color: '#e2eaf4' }}>{m.nome}</div>
                          <div className="flex gap-3 mt-0.5">
                            <span className="prod-metric">📈 <span className="val">{m.oportunidades}</span></span>
                            <span className="prod-metric">💬 <span className="val">{m.conversas}</span></span>
                            <span className="prod-metric">✅ <span className="val">{m.tarefas}</span></span>
                            <span className="prod-metric">📤 <span className="val">{m.mensagens}</span></span>
                          </div>
                        </div>
                        {/* Barra de progresso */}
                        <div className="w-24 hidden sm:block">
                          <div className="h-1.5 rounded-full" style={{ background: '#1e2a38' }}>
                            <div
                              className="h-1.5 rounded-full"
                              style={{
                                width: `${metricas[0]?.score > 0 ? Math.round((m.score / metricas[0].score) * 100) : 0}%`,
                                background: i === 0 ? '#22d07a' : i === 1 ? '#3b9eff' : '#f5a623'
                              }}
                            />
                          </div>
                          <div className="text-right text-xs mt-0.5" style={{ color: '#5a7190' }}>{m.score} pts</div>
                        </div>
                        <span className={`prod-pill ${scoreColor(m.score)} sm:hidden`}>⚡ {m.score}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}