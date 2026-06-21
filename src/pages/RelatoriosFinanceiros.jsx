import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { DollarSign, TrendingUp, TrendingDown, Wallet, FileText, AlertCircle, Moon, Sun, ArrowRight, Clock, CalendarDays, CalendarClock, CheckCircle } from 'lucide-react';
import moment from 'moment';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function RelatoriosFinanceiros() {
  const [user, setUser] = useState(null);
  const [dataInicio, setDataInicio] = useState(moment().startOf('month').format('YYYY-MM-DD'));
  const [dataFim, setDataFim] = useState(moment().endOf('month').format('YYYY-MM-DD'));
  const [darkMode, setDarkMode] = useState(false);
  const [contasModal, setContasModal] = useState(null); // { titulo, contas, cor }
  const [pagandoConta, setPagandoConta] = useState(null); // { despesa, dataPagamento }
  const queryClient = useQueryClient();

  React.useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    if (me.role === 'super_admin') {
      setUser({ ...me, perfil: 'super_admin', empresa_id: null });
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      if (colabs.length > 0) {
        const colab = colabs[0];
        setUser({ ...me, perfil: colab.perfil, empresa_id: colab.empresa_id });
      }
    }
  };

  // Buscar RecebimentoComissao (mesma fonte que ComissoesRecebidas)
  const { data: recebimentosComissao = [] } = useQuery({
    queryKey: ['recebimentos-comissao-relatorio', user?.empresa_id],
    queryFn: async () => {
      return await base44.entities.RecebimentoComissao.filter({ status_recebimento: 'recebida' });
    },
    enabled: !!user,
  });

  // Buscar Receitas Recebidas (para somar com comissões recebidas)
  const { data: receitasRecebidas = [] } = useQuery({
    queryKey: ['receitas-recebidas-relatorio', user?.empresa_id],
    queryFn: async () => {
      const filter = user?.perfil === 'super_admin' || user?.perfil === 'master'
        ? { status: 'recebida' }
        : { status: 'recebida', empresa_id: user?.empresa_id };
      return await base44.entities.Receita.filter(filter);
    },
    enabled: !!user,
  });

  // Buscar Comissões a Pagar/Pagas (aos vendedores)
  const { data: comissoesAPagar = [] } = useQuery({
    queryKey: ['comissoes-a-pagar-relatorio'],
    queryFn: async () => {
      return await base44.entities.ComissaoAPagar.filter({});
    },
    enabled: !!user,
  });

  // Buscar Comissões Pagas
  const { data: comissoesPagasLote = [] } = useQuery({
    queryKey: ['pagamentos-comissao-lote-relatorio'],
    queryFn: async () => {
      return await base44.entities.PagamentoComissaoLote.filter({});
    },
    enabled: !!user,
  });

  const { data: contasBancarias = [] } = useQuery({
    queryKey: ['contas-bancarias-relatorio', user?.empresa_id],
    queryFn: async () => {
      const filtro = user?.empresa_id ? { empresa_id: user.empresa_id, status: 'ativa' } : { status: 'ativa' };
      return await base44.entities.ContaBancaria.filter(filtro);
    },
    enabled: !!user,
  });

  const { data: receitas = [] } = useQuery({
    queryKey: ['receitas-relatorio'],
    queryFn: async () => {
      return await base44.entities.Receita.filter({});
    },
    enabled: !!user,
  });

  const { data: despesas = [] } = useQuery({
    queryKey: ['despesas-relatorio'],
    queryFn: async () => {
      return await base44.entities.Despesa.filter({});
    },
    enabled: !!user,
  });

  // Converter string para number (parse BR)
  const toNumber = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

    const s = String(value)
      .replace(/\s/g, '')
      .replace('R$', '')
      .replace(/\./g, '')
      .replace(',', '.');

    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };

  // Normalizar data para comparação (YYYY-MM-DD)
  const normalizeDate = (date) => {
    if (!date) return null;

    const formats = [
      moment.ISO_8601,
      'YYYY-MM-DD',
      'YYYY-MM-DDTHH:mm:ss',
      'YYYY-MM-DDTHH:mm:ss.SSSZ',
      'DD/MM/YYYY',
      'DD/MM/YYYY HH:mm',
      'DD/MM/YYYY HH:mm:ss',
    ];

    const m = moment(date, formats, true);
    return m.isValid() ? m.format('YYYY-MM-DD') : null;
  };

  // Combinar RecebimentoComissao + Receitas (mesma lógica que ComissoesRecebidas)
  const todosRecebimentos = [
    ...recebimentosComissao.map(r => ({ 
      ...r, 
      tipo: 'comissao',
      data_recebimento: r.data_recebimento,
      valor_recebido: r.valor_recebido 
    })),
    ...receitasRecebidas.map(r => ({ 
      ...r, 
      tipo: 'receita',
      data_recebimento: r.data_recebimento || r.data,
      valor_recebido: r.valor 
    }))
  ];

  const comissoesRecebidas = todosRecebimentos.filter((c) => {
    const d = normalizeDate(c.data_recebimento);
    if (!d) return false;
    return d >= dataInicio && d <= dataFim;
  });

  const totalComissoesRecebidas = comissoesRecebidas.reduce((acc, c) => {
    return acc + toNumber(c.valor_recebido);
  }, 0);
  
  const recebidas_count = comissoesRecebidas.length;

  // Comissões a Pagar (todas as pendentes, sem filtro de período)
  const comissoesAPagarPendentes = comissoesAPagar.filter((c) => {
    return c.status_pagamento === 'a_pagar';
  });
  const totalComissoesAPagar = comissoesAPagarPendentes.reduce((acc, c) => acc + toNumber(c.valor_a_pagar), 0);
  const a_pagar_count = comissoesAPagarPendentes.length;

  // Comissões Pagas (filtrar por data_pagamento)
  const comissoesPagasPeriodo = comissoesAPagar.filter((c) => {
    if (c.status_pagamento !== 'paga' || !c.data_pagamento) return false;
    const normalized = normalizeDate(c.data_pagamento);
    if (!normalized) return false;
    return normalized >= dataInicio && normalized <= dataFim;
  });
  const totalComissoesPagas = comissoesPagasPeriodo.reduce((acc, c) => acc + toNumber(c.valor_a_pagar), 0);
  const pagas_count = comissoesPagasPeriodo.length;

  // Receitas (filtrar por data)
  const receitasPeriodo = receitas.filter((r) => {
    if (!r.data) return false;
    const normalized = normalizeDate(r.data);
    if (!normalized) return false;
    return normalized >= dataInicio && normalized <= dataFim;
  });
  const totalReceitas = receitasPeriodo.reduce((acc, r) => acc + toNumber(r.valor), 0);
  const receitas_count = receitasPeriodo.length;

  // Despesas (filtrar por data)
  const despesasPeriodo = despesas.filter((d) => {
    if (!d.data) return false;
    const normalized = normalizeDate(d.data);
    if (!normalized) return false;
    return normalized >= dataInicio && normalized <= dataFim;
  });
  const totalDespesas = despesasPeriodo.reduce((acc, d) => acc + toNumber(d.valor), 0);
  const despesas_count = despesasPeriodo.length;

  // Resultado Final = (Comissões Recebidas + Receitas) - (Comissões Pagas + Despesas)
  const resultadoFinal = totalComissoesRecebidas + totalReceitas - (totalComissoesPagas + totalDespesas);

  // Indicadores de contas (despesas com data_vencimento)
  const hoje = moment().format('YYYY-MM-DD');
  const em7Dias = moment().add(7, 'days').format('YYYY-MM-DD');

  const contasVencendoHoje = despesas.filter(d => {
    const venc = normalizeDate(d.data_vencimento || d.data);
    return venc === hoje && d.status !== 'pago' && d.status !== 'paga';
  });
  const valorVencendoHoje = contasVencendoHoje.reduce((acc, d) => acc + toNumber(d.valor), 0);

  const contasAtrasadas = despesas.filter(d => {
    const venc = normalizeDate(d.data_vencimento || d.data);
    return venc && venc < hoje && d.status !== 'pago' && d.status !== 'paga';
  });
  const valorAtrasadas = contasAtrasadas.reduce((acc, d) => acc + toNumber(d.valor), 0);

  const contasAVencer7Dias = despesas.filter(d => {
    const venc = normalizeDate(d.data_vencimento || d.data);
    return venc && venc > hoje && venc <= em7Dias && d.status !== 'pago' && d.status !== 'paga';
  });
  const valorAVencer7Dias = contasAVencer7Dias.reduce((acc, d) => acc + toNumber(d.valor), 0);

  const isAdmin = ['master', 'super_admin', 'admin', 'gerente'].includes(user?.perfil);
  const isParceiro = user?.perfil === 'parceiro';

  const handlePagarConta = async () => {
    if (!pagandoConta) return;
    const { despesa, dataPagamento } = pagandoConta;
    await base44.entities.Despesa.update(despesa.id, {
      status: 'pago',
      data_pagamento: dataPagamento || moment().format('YYYY-MM-DD'),
    });
    queryClient.invalidateQueries(['despesas-relatorio']);
    setPagandoConta(null);
    // Atualiza a lista no modal
    setContasModal(prev => prev ? {
      ...prev,
      contas: prev.contas.filter(c => c.id !== despesa.id)
    } : null);
  };

  if (!user || (!isAdmin && !isParceiro)) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <p className="text-slate-600">Acesso restrito a administradores e gerentes</p>
        </Card>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="p-6 max-w-7xl mx-auto">
      
      {/* Toggle Tema */}
      <div className="flex justify-end mb-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setDarkMode(!darkMode)}
          className={darkMode ? 'bg-slate-800 text-yellow-400 hover:bg-slate-700 border-slate-600' : ''}
        >
          {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </Button>
      </div>
      
      <div className={darkMode ? 'text-white' : ''}>
        <h1 className={`text-3xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{isParceiro ? 'Minhas Finanças' : 'Dashboard Financeiro'}</h1>
        <p className={`mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{isParceiro ? 'Controle financeiro individual' : 'Visão consolidada de todas as movimentações financeiras'}</p>
      </div>

      {/* Saldo Total em Contas Bancárias */}
      {contasBancarias.length > 0 && (() => {
        const saldoTotal = contasBancarias.reduce((s, c) => s + (c.saldo_atual || 0), 0);
        return (
          <Card className={`mb-6 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-gradient-to-r from-[#10353C] to-[#1a4f5a] border-0'}`}>
            <CardContent className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-white/70 text-sm mb-1">Saldo Total em Contas Ativas</p>
                  <p className="text-4xl font-bold text-white">{saldoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {contasBancarias.map(c => (
                    <div key={c.id} className="bg-white/10 rounded-lg px-4 py-2 min-w-[130px]">
                      <p className="text-white/60 text-xs truncate">{c.banco}</p>
                      <p className="text-white/80 text-xs truncate">{c.nome_conta}</p>
                      <p className={`text-sm font-bold mt-1 ${(c.saldo_atual || 0) >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                        {(c.saldo_atual || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Botões de Acesso Rápido */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Link to={createPageUrl('ComissoesPagar')}>
          <Card className={`p-4 hover:shadow-lg transition-all cursor-pointer ${darkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'hover:border-orange-200'}`}>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <FileText className="w-5 h-5 text-orange-600" />
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>Comissões a Pagar</p>
              </div>
              <ArrowRight className={`w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-slate-400'}`} />
            </div>
          </Card>
        </Link>

        <Link to={createPageUrl('ComissoesPagas')}>
          <Card className={`p-4 hover:shadow-lg transition-all cursor-pointer ${darkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'hover:border-red-200'}`}>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Wallet className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>Comissões Pagas</p>
              </div>
              <ArrowRight className={`w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-slate-400'}`} />
            </div>
          </Card>
        </Link>

        <Link to={createPageUrl('ComissoesRecebidas')}>
          <Card className={`p-4 hover:shadow-lg transition-all cursor-pointer ${darkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'hover:border-green-200'}`}>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>Comissões Recebidas</p>
              </div>
              <ArrowRight className={`w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-slate-400'}`} />
            </div>
          </Card>
        </Link>

        <Link to={createPageUrl('LancamentoReceitas')}>
          <Card className={`p-4 hover:shadow-lg transition-all cursor-pointer ${darkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'hover:border-blue-200'}`}>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>Lançamento de Receitas</p>
              </div>
              <ArrowRight className={`w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-slate-400'}`} />
            </div>
          </Card>
        </Link>

        <Link to={createPageUrl('LancamentoDespesas')}>
          <Card className={`p-4 hover:shadow-lg transition-all cursor-pointer ${darkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'hover:border-purple-200'}`}>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrendingDown className="w-5 h-5 text-purple-600" />
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>Lançamento de Despesas</p>
              </div>
              <ArrowRight className={`w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-slate-400'}`} />
            </div>
          </Card>
        </Link>
      </div>

      {/* Filtro de Período */}
      <Card className={`p-6 mb-6 ${darkMode ? 'bg-slate-800 border-slate-700' : ''}`}>
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <Label className={darkMode ? 'text-slate-300' : ''}>Data Início</Label>
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
            />
          </div>
          <div className="flex-1">
            <Label className={darkMode ? 'text-slate-300' : ''}>Data Fim</Label>
            <Input 
              type="date" 
              value={dataFim} 
              onChange={(e) => setDataFim(e.target.value)}
              className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
            />
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setDataInicio(moment().startOf('month').format('YYYY-MM-DD'));
              setDataFim(moment().endOf('month').format('YYYY-MM-DD'));
            }}
            className={darkMode ? 'bg-slate-700 border-slate-600 text-white hover:bg-slate-600' : ''}
          >
            Mês Atual
          </Button>
        </div>
      </Card>

      {/* Alerta Inteligente */}
      {(contasVencendoHoje.length > 0 || contasAtrasadas.length > 0 || contasAVencer7Dias.length > 0) && (
        <div className={`p-4 mb-6 rounded-xl border space-y-2 ${darkMode ? 'bg-amber-900/20 border-amber-700' : 'bg-amber-50 border-amber-300'}`}>
          <p className={`font-semibold mb-1 ${darkMode ? 'text-amber-300' : 'text-amber-800'}`}>⚠️ Alertas do Sistema</p>
          {contasVencendoHoje.length > 0 && (
            <p className={`text-sm ${darkMode ? 'text-yellow-300' : 'text-yellow-700'}`}>
              ⚠️ Você tem <strong>{contasVencendoHoje.length}</strong> conta(s) vencendo hoje!
            </p>
          )}
          {contasAtrasadas.length > 0 && (
            <p className={`text-sm ${darkMode ? 'text-red-300' : 'text-red-700'}`}>
              ⛔ Existem <strong>{contasAtrasadas.length}</strong> conta(s) atrasada(s)!
            </p>
          )}
          {contasAVencer7Dias.length > 0 && (
            <p className={`text-sm ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
              📅 <strong>{contasAVencer7Dias.length}</strong> conta(s) com vencimento nos próximos 7 dias.
            </p>
          )}
        </div>
      )}

      {/* Cards de Contas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card
          className={`p-6 border-l-4 border-yellow-500 cursor-pointer hover:shadow-md transition-shadow ${darkMode ? 'bg-slate-800' : ''}`}
          onClick={() => setContasModal({ titulo: 'Contas Vencendo Hoje', contas: contasVencendoHoje, cor: 'yellow' })}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Contas Vencendo Hoje</p>
              <p className="text-2xl font-bold text-yellow-600">
                {valorVencendoHoje.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
              <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>{contasVencendoHoje.length} conta(s) — clique para ver</p>
            </div>
            <CalendarDays className="w-10 h-10 text-yellow-500" />
          </div>
        </Card>

        <Card
          className={`p-6 border-l-4 border-red-500 cursor-pointer hover:shadow-md transition-shadow ${darkMode ? 'bg-slate-800' : ''}`}
          onClick={() => setContasModal({ titulo: 'Contas Atrasadas', contas: contasAtrasadas, cor: 'red' })}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Contas Atrasadas</p>
              <p className="text-2xl font-bold text-red-600">
                {valorAtrasadas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
              <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>{contasAtrasadas.length} conta(s) — clique para ver</p>
            </div>
            <Clock className="w-10 h-10 text-red-500" />
          </div>
        </Card>

        <Card
          className={`p-6 border-l-4 border-blue-500 cursor-pointer hover:shadow-md transition-shadow ${darkMode ? 'bg-slate-800' : ''}`}
          onClick={() => setContasModal({ titulo: 'Contas a Vencer (Próximos 7 dias)', contas: contasAVencer7Dias, cor: 'blue' })}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>A Vencer (7 dias)</p>
              <p className="text-2xl font-bold text-blue-600">
                {valorAVencer7Dias.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
              <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>{contasAVencer7Dias.length} conta(s) — clique para ver</p>
            </div>
            <CalendarClock className="w-10 h-10 text-blue-500" />
          </div>
        </Card>
      </div>

      {/* Modal de Contas */}
      {contasModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setContasModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className={`p-5 border-b flex items-center justify-between ${
              contasModal.cor === 'red' ? 'bg-red-50' : contasModal.cor === 'yellow' ? 'bg-yellow-50' : 'bg-blue-50'
            }`}>
              <h2 className={`text-lg font-bold ${
                contasModal.cor === 'red' ? 'text-red-800' : contasModal.cor === 'yellow' ? 'text-yellow-800' : 'text-blue-800'
              }`}>{contasModal.titulo}</h2>
              <button onClick={() => setContasModal(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">✕</button>
            </div>
            <div className="overflow-y-auto max-h-[calc(80vh-130px)] p-4 space-y-3">
              {contasModal.contas.length === 0 ? (
                <p className="text-center text-slate-500 py-8">Nenhuma conta encontrada</p>
              ) : (
                contasModal.contas.map((d, i) => {
                  const venc = normalizeDate(d.data_vencimento || d.data);
                  return (
                    <div key={d.id || i} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900">{d.descricao || d.categoria || 'Despesa'}</p>
                        <p className="text-sm text-slate-500">
                          {d.categoria && <span className="mr-2">{d.categoria}</span>}
                          {venc && <span>Vencimento: {moment(venc).format('DD/MM/YYYY')}</span>}
                        </p>
                        {d.observacoes && <p className="text-xs text-slate-400 mt-1">{d.observacoes}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-lg font-bold ${
                          contasModal.cor === 'red' ? 'text-red-600' : contasModal.cor === 'yellow' ? 'text-yellow-600' : 'text-blue-600'
                        }`}>
                          {toNumber(d.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          d.status === 'pago' || d.status === 'paga' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>{d.status || 'pendente'}</span>
                      </div>
                      <button
                        onClick={() => setPagandoConta({ despesa: d, dataPagamento: moment().format('YYYY-MM-DD') })}
                        className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors"
                        title="Registrar pagamento"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Pagar
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div className="p-4 border-t flex justify-between items-center">
              <p className="text-sm text-slate-500">
                Total: <strong>{contasModal.contas.reduce((acc, d) => acc + toNumber(d.valor), 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
              </p>
              <button onClick={() => setContasModal(null)} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg font-medium transition-colors text-sm">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mini-modal confirmar pagamento */}
      {pagandoConta && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={() => setPagandoConta(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Confirmar Pagamento</h3>
            <p className="text-sm text-slate-500 mb-4">{pagandoConta.despesa.descricao || pagandoConta.despesa.categoria || 'Despesa'}</p>
            <p className="text-2xl font-bold text-green-600 mb-4">
              {toNumber(pagandoConta.despesa.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <div className="mb-4">
              <Label className="text-sm text-slate-700 mb-1 block">Data de Pagamento</Label>
              <Input
                type="date"
                value={pagandoConta.dataPagamento}
                onChange={e => setPagandoConta(prev => ({ ...prev, dataPagamento: e.target.value }))}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setPagandoConta(null)}>Cancelar</Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handlePagarConta}>
                <CheckCircle className="w-4 h-4 mr-1" /> Confirmar Pagamento
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className={`p-6 ${darkMode ? 'bg-slate-800 border-slate-700' : ''}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Comissões Recebidas</p>
              <p className="text-2xl font-bold text-green-600">
                {totalComissoesRecebidas.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </p>
            </div>
            <DollarSign className="w-10 h-10 text-green-600" />
          </div>
        </Card>

        <Card className={`p-6 ${darkMode ? 'bg-slate-800 border-slate-700' : ''}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Comissões Pagas</p>
              <p className="text-2xl font-bold text-red-600">
                {totalComissoesPagas.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </p>
            </div>
            <Wallet className="w-10 h-10 text-red-600" />
          </div>
        </Card>

        <Card className={`p-6 ${darkMode ? 'bg-slate-800 border-slate-700' : ''}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Comissões a Pagar</p>
              <p className="text-2xl font-bold text-orange-600">
                {totalComissoesAPagar.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </p>
            </div>
            <FileText className="w-10 h-10 text-orange-600" />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
         <Card className={`p-6 ${darkMode ? 'bg-slate-800 border-slate-700' : ''}`}>
           <div className="flex items-center justify-between">
             <div>
               <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Total de Receitas</p>
               <p className="text-2xl font-bold text-green-600">
                 {totalReceitas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
               </p>
             </div>
             <TrendingUp className="w-10 h-10 text-green-600" />
           </div>
         </Card>

         <Card className={`p-6 ${darkMode ? 'bg-slate-800 border-slate-700' : ''}`}>
           <div className="flex items-center justify-between">
             <div>
               <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Receitas + Comissões Recebidas</p>
               <p className="text-2xl font-bold text-green-600">
                 {(totalReceitas + totalComissoesRecebidas).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
               </p>
             </div>
             <Wallet className="w-10 h-10 text-green-600" />
           </div>
         </Card>

         <Card className={`p-6 ${darkMode ? 'bg-slate-800 border-slate-700' : ''}`}>
           <div className="flex items-center justify-between">
             <div>
               <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Total de Despesas</p>
               <p className="text-2xl font-bold text-red-600">
                 {totalDespesas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
               </p>
             </div>
             <TrendingDown className="w-10 h-10 text-red-600" />
           </div>
         </Card>
       </div>

      {/* Resultado Final */}
      <Card className={`p-8 mb-6 ${darkMode ? 'bg-gradient-to-r from-slate-800 to-slate-700 border-slate-600' : 'bg-gradient-to-r from-blue-50 to-purple-50'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-lg mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Resultado Final do Período</p>
            <p className={`text-xs mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              (Comissões Recebidas + Receitas) - (Comissões Pagas + Despesas)
            </p>
            <p
              className={`text-4xl font-bold ${
                resultadoFinal >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {resultadoFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
          <div>
            {resultadoFinal >= 0 ? (
              <Badge className="bg-green-100 text-green-800 text-lg px-4 py-2">Lucro</Badge>
            ) : (
              <Badge className="bg-red-100 text-red-800 text-lg px-4 py-2">Prejuízo</Badge>
            )}
          </div>
        </div>
      </Card>

      {/* Detalhamento */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Receitas Detalhadas */}
        <Card className={darkMode ? 'bg-slate-800 border-slate-700' : ''}>
          <div className={`p-4 border-b ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-50'}`}>
            <h3 className={`font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Receitas por Categoria</h3>
          </div>
          <div className="p-4">
            {['Bônus', 'Repasse', 'Ajuste', 'Outros'].map((cat) => {
              const total = receitasPeriodo
                .filter((r) => r.categoria === cat)
                .reduce((acc, r) => acc + toNumber(r.valor), 0);
              if (total === 0) return null;
              return (
                <div key={cat} className={`flex justify-between py-2 border-b last:border-0 ${darkMode ? 'border-slate-700' : ''}`}>
                  <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>{cat}</span>
                  <span className="font-semibold text-green-600">
                    {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Despesas Detalhadas */}
        <Card className={darkMode ? 'bg-slate-800 border-slate-700' : ''}>
          <div className={`p-4 border-b ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-50'}`}>
            <h3 className={`font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Despesas por Categoria</h3>
          </div>
          <div className="p-4">
            {[
              'Almoço',
              'Reunião',
              'Visita externa',
              'Adiantamento',
              'Pagamento de salários',
              'Combustível',
              'Escritório',
              'Marketing',
              'Outros',
            ].map((cat) => {
              const total = despesasPeriodo
                .filter((d) => d.categoria === cat)
                .reduce((acc, d) => acc + toNumber(d.valor), 0);
              if (total === 0) return null;
              return (
                <div key={cat} className={`flex justify-between py-2 border-b last:border-0 ${darkMode ? 'border-slate-700' : ''}`}>
                  <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>{cat}</span>
                  <span className="font-semibold text-red-600">
                    {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Diagnóstico (somente ADM) */}
      {user?.perfil === 'super_admin' && (
        <Card className={`p-6 mt-6 ${darkMode ? 'bg-amber-900/20 border-amber-700' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle className={`w-5 h-5 mt-0.5 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`} />
            <div className="flex-1">
              <h3 className={`font-semibold mb-3 ${darkMode ? 'text-amber-400' : 'text-amber-900'}`}>Diagnóstico (ADM)</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm mb-4">
                <div>
                  <p className={darkMode ? 'text-amber-400' : 'text-amber-700'}>Total ComissaoAPagar (all)</p>
                  <p className={`font-bold text-lg ${darkMode ? 'text-amber-300' : 'text-amber-900'}`}>{comissoesAPagar.length}</p>
                </div>
                <div>
                  <p className={darkMode ? 'text-amber-400' : 'text-amber-700'}>Recebidas (period)</p>
                  <p className={`font-bold text-lg ${darkMode ? 'text-amber-300' : 'text-amber-900'}`}>{comissoesRecebidas.length}</p>
                </div>
                <div>
                  <p className={darkMode ? 'text-amber-400' : 'text-amber-700'}>A Pagar</p>
                  <p className={`font-bold text-lg ${darkMode ? 'text-amber-300' : 'text-amber-900'}`}>{a_pagar_count}</p>
                </div>
                <div>
                  <p className={darkMode ? 'text-amber-400' : 'text-amber-700'}>Pagas</p>
                  <p className={`font-bold text-lg ${darkMode ? 'text-amber-300' : 'text-amber-900'}`}>{pagas_count}</p>
                </div>
                <div>
                  <p className={darkMode ? 'text-amber-400' : 'text-amber-700'}>Receitas</p>
                  <p className={`font-bold text-lg ${darkMode ? 'text-amber-300' : 'text-amber-900'}`}>{receitas_count}</p>
                </div>
              </div>
              {todosRecebimentos.length > 0 && (
              <div className={`text-xs p-3 rounded border max-h-40 overflow-auto space-y-1 ${darkMode ? 'bg-slate-800 border-amber-800' : 'bg-white border-amber-200'}`}>
                <p className={`font-mono ${darkMode ? 'text-amber-400' : 'text-amber-900'}`}>Total Recebimentos: {todosRecebimentos.length}</p>
                <p className={`font-mono ${darkMode ? 'text-amber-400' : 'text-amber-900'}`}>- RecebimentoComissao: {recebimentosComissao.length}</p>
                <p className={`font-mono ${darkMode ? 'text-amber-400' : 'text-amber-900'}`}>- Receitas (status=recebida): {receitasRecebidas.length}</p>
                <p className={`font-mono ${darkMode ? 'text-amber-500' : 'text-amber-700'}`}>Período: {dataInicio} até {dataFim}</p>
                <p className={`font-mono ${darkMode ? 'text-amber-500' : 'text-amber-700'}`}>Recebidas no período: {recebidas_count}</p>
                <p className={`font-mono ${darkMode ? 'text-amber-500' : 'text-amber-700'}`}>Total: {totalComissoesRecebidas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
              </div>
              )}
            </div>
          </div>
        </Card>
      )}
      </div>
    </div>
  );
}