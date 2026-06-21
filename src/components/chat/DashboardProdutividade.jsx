import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { X, RefreshCw, TrendingUp, Users, MessageCircle, Clock, AlertTriangle, CheckCircle, XCircle, Target, Phone, BarChart3 } from 'lucide-react';
import { format, startOfDay, parseISO, isAfter, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function getInitials(nome) {
  if (!nome) return '?';
  return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

const SCORE_RULES = { conversaIniciada: 1, clienteRespondeu: 2, propostaEnviada: 5, vendaFechada: 20 };

export default function DashboardProdutividade({ empresaId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [colaboradores, setColaboradores] = useState([]);
  const [conversas, setConversas] = useState([]);
  const [mensagens, setMensagens] = useState([]);
  const [oportunidades, setOportunidades] = useState([]);
  const [vendas, setVendas] = useState([]);
  const [countdown, setCountdown] = useState(60);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [tab, setTab] = useState('resumo');

  const hoje = useMemo(() => startOfDay(new Date()), []);

  const loadData = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [colabs, convs, msgs, ops] = await Promise.all([
        base44.entities.Colaborador.filter({ empresa_id: empresaId, status: 'ativo' }, 'nome', 100),
        base44.entities.ConversaWhatsapp.filter({ empresa_id: empresaId }, '-data_ultima_mensagem', 5000),
        base44.entities.MensagemWhatsapp.filter({ empresa_id: empresaId }, '-data_envio', 10000),
        base44.entities.Oportunidade.filter({ empresa_id: empresaId }, '-created_date', 2000),
      ]);
      setColaboradores(colabs || []);
      setConversas(convs || []);
      setMensagens(msgs || []);
      setOportunidades(ops || []);
      setVendas([]);
      // Buscar vendas separadamente (entidade pode não existir para algumas empresas)
      try {
        const vendasData = await base44.entities.Venda.filter({ empresa_id: empresaId }, '-created_date', 1000);
        setVendas(vendasData || []);
      } catch (e2) {
        console.warn('Vendas não disponíveis:', e2.message);
        setVendas([]);
      }
      setLastUpdate(new Date());
    } catch (e) {
      console.error('Erro ao carregar dashboard:', e);
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(prev => { if (prev <= 1) { loadData(); return 60; } return prev - 1; });
    }, 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  // ── FILTRAR MENSAGENS DE HOJE ──
  const msgsHoje = useMemo(() => mensagens.filter(m => m.data_envio && isAfter(new Date(m.data_envio), hoje)), [mensagens, hoje]);
  const msgsEnviadasHoje = useMemo(() => msgsHoje.filter(m => m.remetente === 'vendedor'), [msgsHoje]);
  const msgsRecebidasHoje = useMemo(() => msgsHoje.filter(m => m.remetente === 'cliente'), [msgsHoje]);

  // ── CONVERSAS DE HOJE ──
  const conversasHoje = useMemo(() => conversas.filter(c => c.data_ultima_mensagem && isAfter(new Date(c.data_ultima_mensagem), hoje)), [conversas, hoje]);

  // ── CALCULAR TEMPO DE RESPOSTA ──
  const temposResposta = useMemo(() => {
    const tempos = [];
    const msgsPorConversa = {};
    msgsHoje.forEach(m => {
      if (!m.conversa_id) return;
      if (!msgsPorConversa[m.conversa_id]) msgsPorConversa[m.conversa_id] = [];
      msgsPorConversa[m.conversa_id].push(m);
    });

    Object.values(msgsPorConversa).forEach(msgsConv => {
      msgsConv.sort((a, b) => new Date(a.data_envio) - new Date(b.data_envio));
      for (let i = 1; i < msgsConv.length; i++) {
        if (msgsConv[i].remetente === 'vendedor' && msgsConv[i-1].remetente === 'cliente') {
          const diffMin = (new Date(msgsConv[i].data_envio) - new Date(msgsConv[i-1].data_envio)) / 60000;
          if (diffMin >= 0 && diffMin <= 120) tempos.push(diffMin);
        }
      }
    });
    return tempos;
  }, [msgsHoje]);

  const tempoMedioResposta = temposResposta.length > 0
    ? Math.round(temposResposta.reduce((a, b) => a + b, 0) / temposResposta.length)
    : null;

  // ── CLIENTES QUE RESPONDERAM ──
  const clientesResponderam = useMemo(() => {
    const resp = new Set();
    const msgsPorConversa = {};
    msgsHoje.forEach(m => {
      if (!m.conversa_id) return;
      if (!msgsPorConversa[m.conversa_id]) msgsPorConversa[m.conversa_id] = [];
      msgsPorConversa[m.conversa_id].push(m);
    });

    Object.entries(msgsPorConversa).forEach(([convId, msgsConv]) => {
      msgsConv.sort((a, b) => new Date(a.data_envio) - new Date(b.data_envio));
      let teveVendedor = false;
      for (const m of msgsConv) {
        if (m.remetente === 'vendedor') teveVendedor = true;
        if (m.remetente === 'cliente' && teveVendedor) { resp.add(convId); break; }
      }
    });
    return resp.size;
  }, [msgsHoje]);

  const totalAtendidos = useMemo(() => {
    const set = new Set();
    msgsEnviadasHoje.forEach(m => { if (m.conversa_id) set.add(m.conversa_id); });
    return set.size;
  }, [msgsEnviadasHoje]);

  const clientesSemResposta = Math.max(0, totalAtendidos - clientesResponderam);
  const taxaResposta = totalAtendidos > 0 ? Math.round((clientesResponderam / totalAtendidos) * 100) : 0;

  // ── VENDAS DE HOJE ──
  const vendasHoje = useMemo(() => vendas.filter(v => v.created_date && isAfter(new Date(v.created_date), hoje)).length, [vendas, hoje]);

  // ── OPORTUNIDADES DE HOJE ──
  const opsHoje = useMemo(() => oportunidades.filter(o => o.created_date && isAfter(new Date(o.created_date), hoje)), [oportunidades, hoje]);

  // ── FUNIL: Contatos → Responderam → Propostas → Vendas ──
  const funil = useMemo(() => ({
    contatos: totalAtendidos,
    responderam: clientesResponderam,
    propostas: opsHoje.length,
    fecharam: vendasHoje,
  }), [totalAtendidos, clientesResponderam, opsHoje, vendasHoje]);

  // ── MENSAGENS POR HORA ──
  const msgsPorHora = useMemo(() => {
    const horas = Array(24).fill(0);
    msgsHoje.forEach(m => {
      const h = new Date(m.data_envio).getHours();
      if (h >= 0 && h < 24) horas[h]++;
    });
    return horas;
  }, [msgsHoje]);

  const maxMsgsHora = Math.max(...msgsPorHora, 1);

  // ── MÉTRICAS POR COLABORADOR ──
  const ranking = useMemo(() => {
    return colaboradores.map(colab => {
      const userId = colab.user_id;
      const colabId = colab.id;

      const msgsEnviadas = msgsEnviadasHoje.filter(m => m.usuario_id === userId).length;

      const convsAtendidas = new Set();
      msgsEnviadasHoje.filter(m => m.usuario_id === userId).forEach(m => {
        if (m.conversa_id) convsAtendidas.add(m.conversa_id);
      });

      // Clientes que responderam a este vendedor
      const clientesResp = new Set();
      const msgsPorConvVend = {};
      msgsHoje.forEach(m => {
        if (!m.conversa_id) return;
        if (!msgsPorConvVend[m.conversa_id]) msgsPorConvVend[m.conversa_id] = [];
        msgsPorConvVend[m.conversa_id].push(m);
      });
      Object.entries(msgsPorConvVend).forEach(([convId, msgsConv]) => {
        msgsConv.sort((a, b) => new Date(a.data_envio) - new Date(b.data_envio));
        let teveVendedor = false;
        for (const m of msgsConv) {
          if (m.remetente === 'vendedor' && m.usuario_id === userId) teveVendedor = true;
          if (m.remetente === 'cliente' && teveVendedor) { clientesResp.add(convId); break; }
        }
      });

      const taxaVendedor = convsAtendidas.size > 0 ? Math.round((clientesResp.size / convsAtendidas.size) * 100) : 0;

      // Oportunidades geradas
      const opsVendedor = opsHoje.filter(o => o.vendedor_id === userId).length;

      // Vendas fechadas
      const vendasVendedor = vendas.filter(v => v.created_date && isAfter(new Date(v.created_date), hoje) && v.vendedor_id === userId).length;

      // Score
      const score = (convsAtendidas.size * SCORE_RULES.conversaIniciada)
        + (clientesResp.size * SCORE_RULES.clienteRespondeu)
        + (opsVendedor * SCORE_RULES.propostaEnviada)
        + (vendasVendedor * SCORE_RULES.vendaFechada);

      return {
        ...colab,
        conversas: convsAtendidas.size,
        msgsEnviadas,
        clientesRespondidos: clientesResp.size,
        taxaResposta: taxaVendedor,
        oportunidades: opsVendedor,
        vendas: vendasVendedor,
        score,
      };
    }).sort((a, b) => b.score - a.score);
  }, [colaboradores, msgsEnviadasHoje, msgsHoje, opsHoje, vendas, hoje]);

  // ── INDICADORES DE CONVERSA ──
  const indicadoresConversa = useMemo(() => ({
    novas: conversas.filter(c => isToday(new Date(c.created_date || 0))).length,
    emAndamento: conversas.filter(c => c.status === 'ativa').length,
    finalizadas: conversas.filter(c => c.status === 'encerrada').length,
    semAtendimento: conversas.filter(c => c.status === 'ativa' && !c.responsavel_id).length,
  }), [conversas]);

  // ── ALERTAS ──
  const alertas = useMemo(() => {
    const agora = new Date();
    const lista = [];

    // Vendedor parado (>2h sem enviar)
    colaboradores.forEach(colab => {
      const userId = colab.user_id;
      const ultimaMsg = msgsEnviadasHoje
        .filter(m => m.usuario_id === userId)
        .sort((a, b) => new Date(b.data_envio) - new Date(a.data_envio))[0];
      if (!ultimaMsg) {
        lista.push({ tipo: 'parado', texto: `${colab.nome} não enviou mensagens hoje`, gravidade: 'alta' });
      } else {
        const diffHoras = (agora - new Date(ultimaMsg.data_envio)) / 3600000;
        if (diffHoras > 2) {
          lista.push({ tipo: 'parado', texto: `${colab.nome} parado há ${Math.round(diffHoras)}h`, gravidade: 'media' });
        }
      }
    });

    // Conversas esquecidas (cliente respondeu, sem resposta >30min)
    const msgsPorConversa = {};
    msgsHoje.forEach(m => {
      if (!m.conversa_id) return;
      if (!msgsPorConversa[m.conversa_id]) msgsPorConversa[m.conversa_id] = [];
      msgsPorConversa[m.conversa_id].push(m);
    });
    Object.entries(msgsPorConversa).forEach(([convId, msgsConv]) => {
      msgsConv.sort((a, b) => new Date(b.data_envio) - new Date(a.data_envio));
      const ultima = msgsConv[0];
      if (ultima?.remetente === 'cliente') {
        const diffMin = (agora - new Date(ultima.data_envio)) / 60000;
        if (diffMin > 30) {
          const conv = conversas.find(c => c.id === convId);
          const nome = conv?.cliente_nome || conv?.cliente_telefone || 'Cliente';
          lista.push({ tipo: 'esquecida', texto: `${nome} aguardando resposta há ${Math.round(diffMin)}min`, gravidade: 'alta' });
        }
      }
    });

    // Clientes quentes (>5 msgs nas últimas 24h)
    const contagem24h = {};
    const limite24h = new Date(agora - 24 * 3600000);
    mensagens.filter(m => m.data_envio && new Date(m.data_envio) > limite24h && m.remetente === 'cliente').forEach(m => {
      if (!m.conversa_id) return;
      contagem24h[m.conversa_id] = (contagem24h[m.conversa_id] || 0) + 1;
    });
    Object.entries(contagem24h).forEach(([convId, count]) => {
      if (count > 5) {
        const conv = conversas.find(c => c.id === convId);
        const nome = conv?.cliente_nome || conv?.cliente_telefone || 'Cliente';
        lista.push({ tipo: 'quente', texto: `${nome} enviou ${count} mensagens em 24h`, gravidade: 'media' });
      }
    });

    return lista.slice(0, 8);
  }, [colaboradores, msgsEnviadasHoje, msgsHoje, conversas, mensagens]);

  // ── FOLLOW-UPS ──
  const [tarefas, setTarefas] = useState([]);
  useEffect(() => {
    if (!empresaId) return;
    base44.entities.Tarefa.filter({ empresa_id: empresaId }, '-created_date', 500).then(setTarefas).catch(() => {});
  }, [empresaId]);

  const followUps = useMemo(() => {
    const realizados = tarefas.filter(t => isToday(new Date(t.data_conclusao_real || 0))).length;
    const pendentes = tarefas.filter(t => t.status !== 'concluido' && t.status !== 'arquivado' && t.data_conclusao_prevista && isAfter(new Date(t.data_conclusao_prevista), hoje)).length;
    const atrasados = tarefas.filter(t => t.status !== 'concluido' && t.status !== 'arquivado' && t.data_conclusao_prevista && !isAfter(new Date(t.data_conclusao_prevista), hoje)).length;
    return { realizados, pendentes, atrasados };
  }, [tarefas, hoje]);

  const scoreColor = (score) => {
    if (score >= 80) return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30';
    if (score >= 50) return 'text-amber-400 bg-amber-400/10 border-amber-400/30';
    return 'text-slate-400 bg-slate-400/10 border-slate-400/30';
  };

  const formatHora = (h) => `${String(h).padStart(2, '0')}h`;

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="w-full max-w-6xl max-h-[92vh] rounded-2xl shadow-2xl flex items-center justify-center py-20" style={{ background: '#0b0f14' }}>
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="relative w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col rounded-2xl shadow-2xl" style={{ background: '#0b0f14', color: '#e2eaf4' }}>
        {/* Header */}
        <div style={{ background: '#111720', borderBottom: '1px solid #1e2a38' }} className="flex items-center justify-between px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(34,208,122,.12)' }}>
              <TrendingUp className="w-5 h-5" style={{ color: '#22d07a' }} />
            </div>
            <div>
              <h2 className="font-bold text-base">📊 Dashboard de Produtividade</h2>
              <p className="text-xs" style={{ color: '#5a7190' }}>Resumo do Dia — {format(new Date(), "dd 'de' MMMM", { locale: ptBR })}</p>
            </div>
            <span className="ml-2 text-xs font-semibold px-2 py-1 rounded-full" style={{ background: 'rgba(34,208,122,.12)', color: '#22d07a', border: '1px solid rgba(34,208,122,.25)' }}>● AO VIVO</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: '#5a7190' }}>🔄 {countdown}s</span>
            <button onClick={loadData} className="p-2 rounded-lg hover:bg-white/5 transition-colors"><RefreshCw className="w-4 h-4" style={{ color: '#5a7190' }} /></button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 transition-colors"><X className="w-4 h-4" style={{ color: '#5a7190' }} /></button>
          </div>
        </div>

        {/* Scroll */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* ── LINHA 1: CARDS ── */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { icon: '💬', label: 'Conversas Hoje', val: conversasHoje.length, color: '#3b9eff' },
              { icon: '✅', label: 'Clientes Responderam', val: clientesResponderam, sub: `${taxaResposta}%`, color: '#22d07a' },
              { icon: '🔕', label: 'Clientes Sem Resposta', val: clientesSemResposta, sub: `${totalAtendidos > 0 ? Math.round((clientesSemResposta / totalAtendidos) * 100) : 0}%`, color: '#f5a623' },
              { icon: '⏱️', label: 'Tempo Médio Resposta', val: tempoMedioResposta !== null ? `${tempoMedioResposta}min` : '—', color: '#a366ff' },
              { icon: '💰', label: 'Vendas Fechadas', val: vendasHoje, color: '#ef4444' },
            ].map(({ icon, label, val, sub, color }) => (
              <div key={label} className="rounded-xl p-4 flex flex-col gap-1" style={{ background: '#161d28', border: `1px solid ${color}22` }}>
                <span className="text-lg">{icon}</span>
                <span className="text-2xl font-bold" style={{ color }}>{val}</span>
                <span className="text-xs" style={{ color: '#5a7190' }}>{label}{sub ? <span className="ml-1" style={{ color }}>({sub})</span> : null}</span>
              </div>
            ))}
          </div>

          {/* ── LINHA 2: GRÁFICO DE HORÁRIOS ── */}
          <div className="rounded-xl p-5" style={{ background: '#161d28', border: '1px solid #1e2a38' }}>
            <h3 className="text-sm font-bold mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4" style={{ color: '#3b9eff' }} /> Mensagens por Hora</h3>
            <div className="flex items-end gap-1 h-32">
              {msgsPorHora.map((count, h) => (
                <div key={h} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <span className="text-[10px] font-semibold" style={{ color: count > 0 ? '#e2eaf4' : '#3a5068' }}>{count}</span>
                  <div
                    className="w-full rounded-t transition-all"
                    style={{
                      height: `${(count / maxMsgsHora) * 100}%`,
                      minHeight: count > 0 ? '4px' : '0',
                      background: count > 0 ? 'linear-gradient(180deg, #22d07a, #1a8a50)' : '#1e2a38',
                    }}
                  />
                  <span className="text-[9px]" style={{ color: '#5a7190' }}>{formatHora(h)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── LINHA 3: RANKING DE VENDEDORES ── */}
          <div className="rounded-xl overflow-hidden" style={{ background: '#161d28', border: '1px solid #1e2a38' }}>
            <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: '#1e2a38' }}>
              <h3 className="text-sm font-bold flex items-center gap-2">👨‍💼 Ranking dos Vendedores</h3>
              <span className="text-xs" style={{ color: '#5a7190' }}>{ranking.length} vendedores</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs" style={{ color: '#5a7190' }}>
                    <th className="text-left px-5 py-2 font-medium">Vendedor</th>
                    <th className="text-center px-3 py-2 font-medium">Conversas</th>
                    <th className="text-center px-3 py-2 font-medium">Msgs Enviadas</th>
                    <th className="text-center px-3 py-2 font-medium">Respondidos</th>
                    <th className="text-center px-3 py-2 font-medium">Taxa Resp.</th>
                    <th className="text-center px-3 py-2 font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((m, i) => (
                    <tr key={m.id} className="border-t" style={{ borderColor: '#1e2a38' }}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold w-5" style={{ color: i === 0 ? '#f5a623' : i === 1 ? '#9ca3af' : i === 2 ? '#cd7c39' : '#3a5068' }}>
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}
                          </span>
                          {m.foto_perfil ? <img src={m.foto_perfil} className="w-7 h-7 rounded-full object-cover" /> :
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: 'linear-gradient(135deg,#1a2030,#222838)', color: '#3b9eff' }}>{getInitials(m.nome)}</div>}
                          <span className="font-medium" style={{ color: '#e2eaf4' }}>{m.nome}</span>
                        </div>
                      </td>
                      <td className="text-center px-3 py-3 font-semibold" style={{ color: '#3b9eff' }}>{m.conversas}</td>
                      <td className="text-center px-3 py-3 font-semibold">{m.msgsEnviadas}</td>
                      <td className="text-center px-3 py-3 font-semibold" style={{ color: '#22d07a' }}>{m.clientesRespondidos}</td>
                      <td className="text-center px-3 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: m.taxaResposta >= 60 ? 'rgba(34,208,122,.12)' : m.taxaResposta >= 30 ? 'rgba(245,166,35,.12)' : 'rgba(239,68,68,.12)', color: m.taxaResposta >= 60 ? '#22d07a' : m.taxaResposta >= 30 ? '#f5a623' : '#ef4444' }}>
                          {m.taxaResposta}%
                        </span>
                      </td>
                      <td className="text-center px-3 py-3">
                        <span className={`inline-flex text-xs font-bold px-2 py-0.5 rounded-full border ${scoreColor(m.score)}`}>⚡ {m.score}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── LINHA 4: FUNIL + INDICADORES ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Funil de Conversão */}
            <div className="rounded-xl p-5" style={{ background: '#161d28', border: '1px solid #1e2a38' }}>
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2">📊 Funil de Conversão</h3>
              <div className="space-y-3">
                {[
                  { label: 'Conversas', val: funil.contatos, pct: 100, color: '#3b9eff', icon: '💬' },
                  { label: 'Responderam', val: funil.responderam, pct: funil.contatos > 0 ? Math.round((funil.responderam / funil.contatos) * 100) : 0, color: '#22d07a', icon: '✅' },
                  { label: 'Propostas', val: funil.propostas, pct: funil.responderam > 0 ? Math.round((funil.propostas / funil.responderam) * 100) : 0, color: '#f5a623', icon: '📋' },
                  { label: 'Fechadas', val: funil.fecharam, pct: funil.propostas > 0 ? Math.round((funil.fecharam / funil.propostas) * 100) : 0, color: '#ef4444', icon: '💰' },
                ].map(({ label, val, pct, color, icon }) => (
                  <div key={label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="flex items-center gap-1" style={{ color: '#e2eaf4' }}>{icon} {label}</span>
                      <span className="font-bold" style={{ color }}>{val} <span className="font-normal" style={{ color: '#5a7190' }}>({pct}%)</span></span>
                    </div>
                    <div className="h-2 rounded-full" style={{ background: '#1e2a38' }}>
                      <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Indicadores de Conversa */}
            <div className="rounded-xl p-5" style={{ background: '#161d28', border: '1px solid #1e2a38' }}>
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2">📞 Indicadores de Conversa</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Novas Conversas', val: indicadoresConversa.novas, color: '#3b9eff', icon: '🆕' },
                  { label: 'Em Andamento', val: indicadoresConversa.emAndamento, color: '#22d07a', icon: '🔄' },
                  { label: 'Finalizadas', val: indicadoresConversa.finalizadas, color: '#9ca3af', icon: '✅' },
                  { label: 'Sem Atendimento', val: indicadoresConversa.semAtendimento, color: '#ef4444', icon: '⚠️' },
                ].map(({ label, val, color, icon }) => (
                  <div key={label} className="rounded-lg p-3 text-center" style={{ background: '#111720', border: '1px solid #1e2a38' }}>
                    <span className="text-lg">{icon}</span>
                    <div className="text-2xl font-bold" style={{ color }}>{val}</div>
                    <div className="text-xs" style={{ color: '#5a7190' }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Follow-ups */}
              <h3 className="text-sm font-bold mt-4 mb-3 flex items-center gap-2">🎯 Follow-up</h3>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Realizados', val: followUps.realizados, color: '#22d07a' },
                  { label: 'Pendentes', val: followUps.pendentes, color: '#f5a623' },
                  { label: 'Atrasados', val: followUps.atrasados, color: '#ef4444' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="rounded-lg p-2 text-center" style={{ background: '#111720', border: '1px solid #1e2a38' }}>
                    <div className="text-xl font-bold" style={{ color }}>{val}</div>
                    <div className="text-[10px]" style={{ color: '#5a7190' }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── LINHA 5: ALERTAS ── */}
          {alertas.length > 0 && (
            <div className="rounded-xl p-5" style={{ background: '#161d28', border: '1px solid #1e2a38' }}>
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">🚨 Alertas Inteligentes</h3>
              <div className="space-y-2">
                {alertas.map((a, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg px-4 py-2.5" style={{ background: a.gravidade === 'alta' ? 'rgba(239,68,68,.08)' : 'rgba(245,166,35,.08)', border: `1px solid ${a.gravidade === 'alta' ? 'rgba(239,68,68,.2)' : 'rgba(245,166,35,.2)'}` }}>
                    <span>{a.tipo === 'parado' ? '😴' : a.tipo === 'esquecida' ? '⏰' : '🔥'}</span>
                    <span className="text-sm flex-1" style={{ color: '#e2eaf4' }}>{a.texto}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: a.gravidade === 'alta' ? 'rgba(239,68,68,.15)' : 'rgba(245,166,35,.15)', color: a.gravidade === 'alta' ? '#ef4444' : '#f5a623' }}>
                      {a.gravidade === 'alta' ? 'URGENTE' : 'ATENÇÃO'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}