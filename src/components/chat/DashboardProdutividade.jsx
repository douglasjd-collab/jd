import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { X, RefreshCw, TrendingUp, BarChart3 } from 'lucide-react';
import { format, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { getPeriodoRange, calcularMetricas, conversaParaItem } from './produtividade/produtividadeHelpers';
import FiltrosProdutividade from './produtividade/FiltrosProdutividade';
import PainelDetalheIndicador from './produtividade/PainelDetalheIndicador';
import AlertasPrioritarios from './produtividade/AlertasPrioritarios';

function getInitials(nome) {
  if (!nome) return '?';
  return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

export default function DashboardProdutividade({ empresaId, onClose, onAbrirConversa, currentUser }) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [colaboradores, setColaboradores] = useState([]);
  const [conversas, setConversas] = useState([]);
  const [mensagens, setMensagens] = useState([]);
  const [countdown, setCountdown] = useState(60);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [indicadorAberto, setIndicadorAberto] = useState(null); // { titulo, itens }

  const [periodo, setPeriodo] = useState('hoje');
  const [dataInicioCustom, setDataInicioCustom] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dataFimCustom, setDataFimCustom] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [canalFiltro, setCanalFiltro] = useState('todos');
  const [vendedorFiltro, setVendedorFiltro] = useState('all');

  const loadData = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [colabs, convs, msgs] = await Promise.all([
        base44.entities.Colaborador.filter({ empresa_id: empresaId, status: 'ativo' }, 'nome', 100),
        base44.entities.ConversaWhatsapp.filter({ empresa_id: empresaId }, '-data_ultima_mensagem', 5000),
        base44.entities.MensagemWhatsapp.filter({ empresa_id: empresaId }, '-data_envio', 10000),
      ]);
      setColaboradores(colabs || []);
      setConversas(convs || []);
      setMensagens(msgs || []);
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

  const { inicio, fim } = useMemo(() => getPeriodoRange(periodo, dataInicioCustom, dataFimCustom), [periodo, dataInicioCustom, dataFimCustom]);

  const m = useMemo(() => calcularMetricas({ conversas, mensagens, inicio, fim, canalFiltro, vendedorFiltro }), [conversas, mensagens, inicio, fim, canalFiltro, vendedorFiltro]);

  const abrirIndicador = (titulo, conversasOuItens) => {
    const itens = conversasOuItens.map(c => c.tempoEsperaMin != null ? conversaParaItem(c) : conversaParaItem(c));
    setIndicadorAberto({ titulo, itens });
  };

  const abrirIndicadorPorIds = (titulo, ids) => {
    const itens = [...ids].map(id => m.conversasMap[id]).filter(Boolean).map(conversaParaItem);
    setIndicadorAberto({ titulo, itens });
  };

  const removerItemDoPainel = (conversaId) => {
    setIndicadorAberto(prev => prev ? { ...prev, itens: prev.itens.filter(i => i.id !== conversaId) } : prev);
  };

  const handleAssumir = async (conversaId) => {
    try {
      await base44.entities.ConversaWhatsapp.update(conversaId, {
        responsavel_id: currentUser?.colaborador_id || currentUser?.id || 'atendente',
        responsavel_nome: currentUser?.nome_perfil || currentUser?.full_name || currentUser?.email || 'Atendente',
        responsavel_expira_em: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        status: 'ativa',
      });
      toast.success('Conversa assumida');
      removerItemDoPainel(conversaId);
      queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
      loadData();
    } catch (e) { toast.error('Erro ao assumir: ' + e.message); }
  };

  const handleFinalizar = async (conversaId) => {
    try {
      await base44.entities.ConversaWhatsapp.update(conversaId, { status: 'encerrada' });
      toast.success('Conversa encerrada');
      removerItemDoPainel(conversaId);
      queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
      loadData();
    } catch (e) { toast.error('Erro ao encerrar: ' + e.message); }
  };

  const handleAbrirConversa = (conversaId) => {
    setIndicadorAberto(null);
    if (onAbrirConversa) onAbrirConversa(conversaId);
    else onClose();
  };

  const cards = useMemo(() => ([
    { label: 'Conversas Iniciadas', val: m.iniciadas.size, color: '#3b9eff', onClick: () => abrirIndicadorPorIds('Conversas Iniciadas', m.iniciadas) },
    { label: 'Iniciadas pelo Vendedor', val: m.iniciadasVendedor.size, color: '#22d07a', onClick: () => abrirIndicadorPorIds('Iniciadas pelo Vendedor', m.iniciadasVendedor) },
    { label: 'Iniciadas pelo Cliente', val: m.iniciadasCliente.size, color: '#a366ff', onClick: () => abrirIndicadorPorIds('Iniciadas pelo Cliente', m.iniciadasCliente) },
    { label: 'Clientes que Responderam', val: m.responderamSet.size, color: '#22d07a', onClick: () => abrirIndicadorPorIds('Clientes que Responderam', m.responderamSet) },
    { label: 'Taxa de Resposta', val: `${m.taxaResposta}%`, color: '#3b9eff' },
    { label: 'Clientes Sem Resposta', val: m.semRespostaSet.size, color: '#f5a623', onClick: () => abrirIndicadorPorIds('Clientes Sem Resposta', m.semRespostaSet) },
    { label: 'Aguardando Vendedor', val: m.aguardandoVendedor.length, color: '#ef4444', onClick: () => abrirIndicador('Clientes Aguardando Vendedor', m.aguardandoVendedor) },
    { label: 'Deram Vácuo (>2h)', val: m.deramVacuo.length, color: '#ef4444', onClick: () => abrirIndicador('Clientes que Deram Vácuo (>2h)', m.deramVacuo) },
    { label: 'Não Finalizadas', val: m.naoFinalizadas.length, color: '#5a7190', onClick: () => abrirIndicador('Conversas Não Finalizadas', m.naoFinalizadas) },
    { label: 'Sem Responsável', val: m.semResponsavel.length, color: '#ef4444', onClick: () => abrirIndicador('Conversas Sem Responsável', m.semResponsavel) },
    { label: 'Em Atendimento', val: m.emAtendimento.length, color: '#22d07a', onClick: () => abrirIndicador('Conversas em Atendimento', m.emAtendimento) },
    { label: 'Finalizadas', val: m.finalizadas.length, color: '#9ca3af', onClick: () => abrirIndicador('Conversas Finalizadas', m.finalizadas) },
    { label: 'Tempo Médio 1ª Resposta', val: m.tempoMedioResposta != null ? `${m.tempoMedioResposta} min` : '—', color: '#a366ff' },
    { label: 'Maior Tempo de Espera', val: `${m.maiorTempoEspera} min`, color: '#ef4444' },
  ]), [m]);

  // Ranking simplificado dos vendedores no período
  const ranking = useMemo(() => {
    return colaboradores.map(colab => {
      const msgsVendedor = mensagens.filter(msg => msg.usuario_id === colab.user_id && msg.data_envio && isAfter(new Date(msg.data_envio), inicio) && new Date(msg.data_envio) <= fim);
      const convsIds = new Set(msgsVendedor.map(msg => msg.conversa_id));
      return { ...colab, msgsEnviadas: msgsVendedor.length, conversas: convsIds.size };
    }).filter(c => c.msgsEnviadas > 0).sort((a, b) => b.msgsEnviadas - a.msgsEnviadas);
  }, [colaboradores, mensagens, inicio, fim]);

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
      <style>{`.prod-period { padding: 5px 14px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; background: #1e2a38; color: #5a7190; }`}</style>
      <div className="relative w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col rounded-2xl shadow-2xl" style={{ background: '#0b0f14', color: '#e2eaf4' }}>
        <div style={{ background: '#111720', borderBottom: '1px solid #1e2a38' }} className="flex items-center justify-between px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(34,208,122,.12)' }}>
              <TrendingUp className="w-5 h-5" style={{ color: '#22d07a' }} />
            </div>
            <div>
              <h2 className="font-bold text-base">📊 Central de Produtividade</h2>
              <p className="text-xs" style={{ color: '#5a7190' }}>{format(new Date(), "dd 'de' MMMM", { locale: ptBR })}</p>
            </div>
            <span className="ml-2 text-xs font-semibold px-2 py-1 rounded-full" style={{ background: 'rgba(34,208,122,.12)', color: '#22d07a', border: '1px solid rgba(34,208,122,.25)' }}>● AO VIVO</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadData} className="p-2 rounded-lg hover:bg-white/5"><RefreshCw className="w-4 h-4" style={{ color: '#5a7190' }} /></button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5"><X className="w-4 h-4" style={{ color: '#5a7190' }} /></button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <FiltrosProdutividade
            periodo={periodo} setPeriodo={setPeriodo}
            dataInicioCustom={dataInicioCustom} setDataInicioCustom={setDataInicioCustom}
            dataFimCustom={dataFimCustom} setDataFimCustom={setDataFimCustom}
            canalFiltro={canalFiltro} setCanalFiltro={setCanalFiltro}
            vendedorFiltro={vendedorFiltro} setVendedorFiltro={setVendedorFiltro}
            colaboradores={colaboradores}
            inicio={inicio} fim={fim} lastUpdate={lastUpdate} countdown={countdown}
          />

          {/* Cards de indicadores */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {cards.map(c => (
              <button
                key={c.label}
                onClick={c.onClick}
                disabled={!c.onClick}
                className="rounded-xl p-4 flex flex-col gap-1 text-left"
                style={{ background: '#161d28', border: `1px solid ${c.color}22`, cursor: c.onClick ? 'pointer' : 'default' }}
              >
                <span className="text-2xl font-bold" style={{ color: c.color }}>{c.val}</span>
                <span className="text-xs" style={{ color: '#5a7190' }}>{c.label}</span>
              </button>
            ))}
          </div>

          <AlertasPrioritarios
            aguardandoVendedor={m.aguardandoVendedor}
            naoFinalizadas={m.naoFinalizadas}
            semResponsavel={m.semResponsavel}
            deramVacuo={m.deramVacuo}
            onAbrirConversa={handleAbrirConversa}
          />

          {/* Ranking dos vendedores */}
          <div className="rounded-xl overflow-hidden" style={{ background: '#161d28', border: '1px solid #1e2a38' }}>
            <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: '#1e2a38' }}>
              <h3 className="text-sm font-bold flex items-center gap-2"><BarChart3 className="w-4 h-4" style={{ color: '#3b9eff' }} /> Ranking dos Vendedores (no período)</h3>
              <span className="text-xs" style={{ color: '#5a7190' }}>{ranking.length} com atividade</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs" style={{ color: '#5a7190' }}>
                    <th className="text-left px-5 py-2 font-medium">Vendedor</th>
                    <th className="text-center px-3 py-2 font-medium">Conversas</th>
                    <th className="text-center px-3 py-2 font-medium">Msgs Enviadas</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map(v => (
                    <tr key={v.id} className="border-t" style={{ borderColor: '#1e2a38' }}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {v.foto_perfil ? <img src={v.foto_perfil} className="w-7 h-7 rounded-full object-cover" /> :
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: 'linear-gradient(135deg,#1a2030,#222838)', color: '#3b9eff' }}>{getInitials(v.nome)}</div>}
                          <span className="font-medium">{v.nome}</span>
                        </div>
                      </td>
                      <td className="text-center px-3 py-3 font-semibold" style={{ color: '#3b9eff' }}>{v.conversas}</td>
                      <td className="text-center px-3 py-3 font-semibold">{v.msgsEnviadas}</td>
                    </tr>
                  ))}
                  {ranking.length === 0 && (
                    <tr><td colSpan={3} className="text-center py-6 text-xs" style={{ color: '#5a7190' }}>Nenhum vendedor com atividade no período</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {indicadorAberto && (
        <PainelDetalheIndicador
          titulo={indicadorAberto.titulo}
          itens={indicadorAberto.itens}
          onClose={() => setIndicadorAberto(null)}
          onAbrirConversa={handleAbrirConversa}
          onAssumir={handleAssumir}
          onFinalizar={handleFinalizar}
        />
      )}
    </div>
  );
}