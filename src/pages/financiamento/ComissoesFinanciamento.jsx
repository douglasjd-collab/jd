import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Search, CheckCircle, XCircle, Clock, DollarSign, Car, Bike, FileText, 
  TrendingUp, TrendingDown, RefreshCw, Eye, FileDown, Plus, Trash2,
  ArrowUpRight, ArrowDownRight, Wallet, Receipt, BarChart3, PieChart,
  Calendar, Filter, Download, Edit2, ExternalLink, Activity
} from 'lucide-react';
import { toast } from 'sonner';
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

const STATUS_MAP = {
  pendente: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  recebida: { label: 'Recebida', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  cancelada: { label: 'Cancelada', color: 'bg-red-100 text-red-700', icon: XCircle },
};

const fmt = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

export default function FinanceiroFinanciamento({ user }) {
  const [financiamentos, setFinanciamentos] = useState([]);
  const [comissoes, setComissoes] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Filtros
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('all');
  const [filtroBanco, setFiltroBanco] = useState('all');
  const [filtroVendedor, setFiltroVendedor] = useState('all');
  const [filtroFilial, setFiltroFilial] = useState('all');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  // Modal de recebimento
  const [receberModal, setReceberModal] = useState(null);
  const [formReceber, setFormReceber] = useState({
    data_recebimento: new Date().toISOString().split('T')[0],
    valor_comissao: '',
    percentual_comissao_vendedor: '',
    valor_comissao_vendedor: '',
    observacoes: '',
  });
  const [salvando, setSalvando] = useState(false);

  // Modal de custo operacional
  const [custoModal, setCustoModal] = useState(null);
  const [formCusto, setFormCusto] = useState({ valor: '', descricao: '', data: '' });

  const carregar = useCallback(async () => {
    if (!user?.empresa_id) return;
    setLoading(true);
    try {
      const [fins, coms] = await Promise.all([
        base44.entities.FinanciamentoVeiculo.filter({ empresa_id: user.empresa_id }, '-created_date', 500),
        base44.entities.ComissaoFinanciamento.filter({ empresa_id: user.empresa_id }, '-created_date', 500),
      ]);
      setFinanciamentos(fins || []);
      setComissoes(coms || []);
    } catch (e) {
      toast.error('Erro ao carregar: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [user?.empresa_id]);

  useEffect(() => { carregar(); }, [carregar]);

  // Cálculos de KPIs
  const kpis = useMemo(() => {
    const comissoesPendentes = comissoes.filter(c => c.status === 'pendente');
    const comissoesRecebidas = comissoes.filter(c => c.status === 'recebida');
    const tarifasPendentes = financiamentos.filter(f => f.tarifa_cadastral_status === 'aguardando_pagamento');
    const tarifasRecebidas = financiamentos.filter(f => f.tarifa_cadastral_status === 'recebida');
    
    const comissoes_a_receber = comissoesPendentes.reduce((s, c) => s + (c.valor_comissao || 0), 0);
    const comissoes_recebidas = comissoesRecebidas.reduce((s, c) => s + (c.valor_comissao || 0), 0);
    const tarifas_a_receber = tarifasPendentes.reduce((s, f) => s + (f.tarifa_cadastral || 0), 0);
    const tarifas_recebidas = tarifasRecebidas.reduce((s, f) => s + (f.tarifa_cadastral || 0), 0);
    const custos_operacionais = financiamentos.reduce((s, f) => s + (f.custos_operacionais || 0), 0);
    
    const receita_total = comissoes_recebidas + tarifas_recebidas;
    const resultado_liquido = receita_total - custos_operacionais;

    return {
      comissoes_a_receber,
      comissoes_recebidas,
      tarifas_a_receber,
      tarifas_recebidas,
      qtd_tarifas_total: financiamentos.filter(f => f.tarifa_cadastral && f.tarifa_cadastral > 0).length,
      qtd_tarifas_recebidas: tarifasRecebidas.length,
      qtd_tarifas_pendentes: tarifasPendentes.length,
      qtd_comissoes_total: comissoes.length,
      qtd_comissoes_recebidas: comissoesRecebidas.length,
      qtd_comissoes_pendentes: comissoesPendentes.length,
      custos_operacionais,
      receita_total,
      resultado_liquido,
    };
  }, [comissoes, financiamentos]);

  // Dados para gráficos
  const dadosGraficoEntradasSaidas = useMemo(() => [
    { nome: 'Tarifas', valor: kpis.tarifas_recebidas, cor: '#3b82f6' },
    { nome: 'Comissões', valor: kpis.comissoes_recebidas, cor: '#22c55e' },
    { nome: 'Custos', valor: kpis.custos_operacionais, cor: '#ef4444' },
  ], [kpis]);

  const dadosGraficoTarifasStatus = useMemo(() => [
    { nome: 'Recebidas', valor: kpis.qtd_tarifas_recebidas, cor: '#22c55e' },
    { nome: 'Pendentes', valor: kpis.qtd_tarifas_pendentes, cor: '#eab308' },
  ], [kpis]);

  const dadosGraficoComissoesStatus = useMemo(() => [
    { nome: 'Recebidas', valor: kpis.qtd_comissoes_recebidas, cor: '#22c55e' },
    { nome: 'Pendentes', valor: kpis.qtd_comissoes_pendentes, cor: '#eab308' },
  ], [kpis]);

  // Dados únicos para filtros
  const bancos = [...new Set(financiamentos.map(f => f.banco).filter(Boolean))];
  const vendedores = [...new Set(financiamentos.map(f => f.vendedor_nome).filter(Boolean))];
  const filiais = [...new Set(financiamentos.map(f => f.filial_nome).filter(Boolean))];

  // Filtragem
  const dadosFiltrados = financiamentos.filter(f => {
    if (busca) {
      const b = busca.toLowerCase();
      if (!(f.cliente_nome?.toLowerCase().includes(b) || f.banco?.toLowerCase().includes(b) || 
            f.numero_proposta?.toLowerCase().includes(b) || f.veiculo_modelo?.toLowerCase().includes(b))) return false;
    }
    if (filtroStatus !== 'all' && f.status !== filtroStatus) return false;
    if (filtroBanco !== 'all' && f.banco !== filtroBanco) return false;
    if (filtroVendedor !== 'all' && f.vendedor_nome !== filtroVendedor) return false;
    if (filtroFilial !== 'all' && f.filial_nome !== filtroFilial) return false;
    if (dataInicio && f.data_proposta && f.data_proposta < dataInicio) return false;
    if (dataFim && f.data_proposta && f.data_proposta > dataFim) return false;
    return true;
  });

  const abrirReceber = (f) => {
    const comissao = comissoes.find(c => c.financiamento_id === f.id);
    setFormReceber({
      data_recebimento: new Date().toISOString().split('T')[0],
      valor_comissao: comissao?.valor_comissao || f.valor_financiado * 0.03,
      percentual_comissao_vendedor: comissao?.percentual_comissao_vendedor || 30,
      valor_comissao_vendedor: '',
      observacoes: '',
    });
    setReceberModal(f);
  };

  const abrirCusto = (f) => {
    setFormCusto({ valor: f.custos_operacionais || '', descricao: 'Custos operacionais', data: f.data_proposta || '' });
    setCustoModal(f);
  };

  const calcularComissaoVendedor = (val, pct) => {
    const v = parseFloat(val) || 0;
    const p = parseFloat(pct) || 0;
    return p > 0 ? ((v * p) / 100).toFixed(2) : '';
  };

  const confirmarRecebimento = async () => {
    if (!receberModal) return;
    setSalvando(true);
    try {
      const valorComissao = parseFloat(formReceber.valor_comissao) || 0;
      const valorVendedor = parseFloat(formReceber.valor_comissao_vendedor) || 0;
      const f = receberModal;

      // 1. Criar Receita Financeira
      const receita = await base44.entities.Receita.create({
        empresa_id: user.empresa_id,
        filial_id: f.filial_id || '',
        filial_nome: f.filial_nome || '',
        descricao: `Comissão de Financiamento - ${f.cliente_nome} - ${f.banco || ''}`,
        categoria_id: 'financiamento_comissao',
        categoria_nome: 'Comissão de Financiamento',
        valor: valorComissao,
        data: formReceber.data_recebimento,
        data_recebimento: formReceber.data_recebimento,
        status: 'recebida',
        cliente_nome: f.cliente_nome,
        responsavel_id: f.vendedor_id || '',
        responsavel_nome: f.vendedor_nome || '',
        origem: 'financiamento',
      });

      // 2. Atualizar/criar comissão
      const comissaoExistente = comissoes.find(c => c.financiamento_id === f.id);
      if (comissaoExistente) {
        await base44.entities.ComissaoFinanciamento.update(comissaoExistente.id, {
          status: 'recebida',
          data_recebimento: formReceber.data_recebimento,
          valor_comissao: valorComissao,
          percentual_comissao_vendedor: parseFloat(formReceber.percentual_comissao_vendedor) || 0,
          valor_comissao_vendedor: valorVendedor,
          receita_id: receita.id,
        });
      } else {
        await base44.entities.ComissaoFinanciamento.create({
          empresa_id: user.empresa_id,
          filial_id: f.filial_id || '',
          filial_nome: f.filial_nome || '',
          financiamento_id: f.id,
          numero_proposta: f.numero_proposta || '',
          cliente_nome: f.cliente_nome,
          cliente_cpf: f.cliente_cpf || '',
          banco: f.banco || '',
          valor_financiado: f.valor_financiado,
          valor_comissao: valorComissao,
          percentual_comissao: f.percentual_comissao || 0,
          percentual_comissao_vendedor: parseFloat(formReceber.percentual_comissao_vendedor) || 0,
          valor_comissao_vendedor: valorVendedor,
          status: 'recebida',
          data_recebimento: formReceber.data_recebimento,
          vendedor_id: f.vendedor_id || '',
          vendedor_nome: f.vendedor_nome || '',
          receita_id: receita.id,
        });
      }

      // 3. Atualizar proposta
      await base44.entities.FinanciamentoVeiculo.update(f.id, {
        status: 'pago_pelo_banco',
        data_pagamento: formReceber.data_recebimento,
        comissao_financiamento_id: comissaoExistente?.id || '',
      });

      // 4. Criar comissão a pagar ao vendedor
      if (valorVendedor > 0 && f.vendedor_id) {
        await base44.entities.ComissaoAPagar.create({
          empresa_id: user.empresa_id,
          vendedor_id: f.vendedor_id,
          vendedor_nome: f.vendedor_nome || '',
          proposta_id: f.id,
          tipo: 'financiamento',
          valor: valorVendedor,
          status_pagamento: 'pendente',
          descricao: `Comissão Financiamento - ${f.cliente_nome}`,
          data_prevista: formReceber.data_recebimento,
        });
      }

      toast.success('Comissão recebida! Receita e comissão do vendedor criadas.');
      setReceberModal(null);
      carregar();
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  const confirmarCusto = async () => {
    if (!custoModal) return;
    setSalvando(true);
    try {
      const valor = parseFloat(formCusto.valor) || 0;
      const f = custoModal;

      // Criar Despesa
      const despesa = await base44.entities.Despesa.create({
        empresa_id: user.empresa_id,
        filial_id: f.filial_id || '',
        filial_nome: f.filial_nome || '',
        descricao: formCusto.descricao || 'Custos operacionais - Financiamento',
        categoria: 'Custos Operacionais',
        produto: 'Financiamento',
        valor: valor,
        data: formCusto.data || new Date().toISOString().split('T')[0],
        status: 'paga',
        data_pagamento: formCusto.data,
        responsavel_id: f.vendedor_id || '',
        responsavel_nome: f.vendedor_nome || '',
      });

      // Atualizar financiamento
      await base44.entities.FinanciamentoVeiculo.update(f.id, {
        custos_operacionais: valor,
        custos_despesa_id: despesa.id,
      });

      toast.success('Custo operacional lançado com sucesso!');
      setCustoModal(null);
      carregar();
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-blue-600" />
            Financeiro do Financiamento
          </h2>
          <p className="text-sm text-slate-500 mt-1">Recebimentos, comissões e resultados</p>
        </div>
      </div>

      {/* Cards de KPIs - 8 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Comissões a Receber */}
        <Card className="bg-amber-50 border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-amber-700 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Comissões a Receber
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-amber-800">{fmt(kpis.comissoes_a_receber)}</p>
            <p className="text-xs text-amber-600 mt-1">{kpis.qtd_comissoes_pendentes} comissões</p>
          </CardContent>
        </Card>

        {/* Card 2: Comissões Recebidas */}
        <Card className="bg-green-50 border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-green-700 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Comissões Recebidas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-green-800">{fmt(kpis.comissoes_recebidas)}</p>
            <p className="text-xs text-green-600 mt-1">{kpis.qtd_comissoes_recebidas} comissões</p>
          </CardContent>
        </Card>

        {/* Card 3: Quantidade de Tarifas */}
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-blue-700 flex items-center gap-1">
              <Receipt className="w-3 h-3" /> Qtd. Tarifas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-blue-800">{kpis.qtd_tarifas_total}</p>
            <p className="text-xs text-blue-600 mt-1">
              <span className="text-green-600">{kpis.qtd_tarifas_recebidas} recebidas</span> • 
              <span className="text-amber-600 ml-1">{kpis.qtd_tarifas_pendentes} pendentes</span>
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Valor Total de Tarifas */}
        <Card className="bg-teal-50 border-teal-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-teal-700 flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> Total Tarifas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-teal-800">{fmt(kpis.tarifas_recebidas + kpis.tarifas_a_receber)}</p>
            <p className="text-xs text-teal-600 mt-1">
              <span className="text-green-600">{fmt(kpis.tarifas_recebidas)} rec.</span> • 
              <span className="text-amber-600 ml-1">{fmt(kpis.tarifas_a_receber)} pend.</span>
            </p>
          </CardContent>
        </Card>

        {/* Card 5: Valor Total de Comissões */}
        <Card className="bg-purple-50 border-purple-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-purple-700 flex items-center gap-1">
              <Wallet className="w-3 h-3" /> Total Comissões
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-purple-800">{fmt(kpis.comissoes_recebidas + kpis.comissoes_a_receber)}</p>
            <p className="text-xs text-purple-600 mt-1">Recebidas + Pendentes</p>
          </CardContent>
        </Card>

        {/* Card 6: Custos Operacionais */}
        <Card className="bg-red-50 border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-red-700 flex items-center gap-1">
              <TrendingDown className="w-3 h-3" /> Custos Operacionais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-red-800">{fmt(kpis.custos_operacionais)}</p>
            <p className="text-xs text-red-600 mt-1">Despesas totais</p>
          </CardContent>
        </Card>

        {/* Card 7: Total Tarifa + Comissão (PRINCIPAL) */}
        <Card className="bg-indigo-50 border-indigo-200 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-indigo-700 flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" /> Receita Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-indigo-800">{fmt(kpis.receita_total)}</p>
            <p className="text-xs text-indigo-600 mt-1">Tarifas + Comissões recebidas</p>
          </CardContent>
        </Card>

        {/* Card 8: Resultado Líquido (PRINCIPAL) */}
        <Card className="bg-emerald-50 border-emerald-200 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Resultado Líquido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-800">{fmt(kpis.resultado_liquido)}</p>
            <p className="text-xs text-emerald-600 mt-1">Receita - Custos</p>
          </CardContent>
        </Card>
      </div>

      {/* Painel de Resumo Financeiro */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Resumo Central - Entradas x Saídas */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" />
              Painel Financeiro do Financiamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Entradas */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-xs font-semibold text-green-700 mb-2">📈 ENTRADAS</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-green-600">Tarifas Recebidas</p>
                    <p className="text-lg font-bold text-green-800">{fmt(kpis.tarifas_recebidas)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-green-600">Comissões Recebidas</p>
                    <p className="text-lg font-bold text-green-800">{fmt(kpis.comissoes_recebidas)}</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-green-200">
                  <p className="text-xs text-green-600">TOTAL DE ENTRADAS</p>
                  <p className="text-xl font-bold text-green-800">{fmt(kpis.receita_total)}</p>
                </div>
              </div>

              {/* Saídas */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-xs font-semibold text-red-700 mb-2">📉 SAÍDAS</p>
                <div>
                  <p className="text-xs text-red-600">Custos Operacionais</p>
                  <p className="text-lg font-bold text-red-800">{fmt(kpis.custos_operacionais)}</p>
                </div>
                <div className="mt-3 pt-3 border-t border-red-200">
                  <p className="text-xs text-red-600">TOTAL DE SAÍDAS</p>
                  <p className="text-xl font-bold text-red-800">{fmt(kpis.custos_operacionais)}</p>
                </div>
              </div>

              {/* Resultado Líquido */}
              <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 border border-emerald-300 rounded-lg p-4">
                <p className="text-xs font-semibold text-emerald-700 mb-2">💰 RESULTADO LÍQUIDO</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-emerald-600">Receita Total - Custos</p>
                    <p className="text-2xl font-bold text-emerald-800">{fmt(kpis.resultado_liquido)}</p>
                  </div>
                  <TrendingUp className={`w-10 h-10 ${kpis.resultado_liquido >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resumo Lateral - Quantidades e Gráficos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <PieChart className="w-4 h-4 text-purple-600" />
              Resumo Quantitativo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Tarifas */}
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2">TARIFAS</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Total</span>
                  <span className="font-semibold">{kpis.qtd_tarifas_total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-600">Recebidas</span>
                  <span className="font-semibold text-green-700">{kpis.qtd_tarifas_recebidas}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-amber-600">Pendentes</span>
                  <span className="font-semibold text-amber-700">{kpis.qtd_tarifas_pendentes}</span>
                </div>
              </div>
            </div>

            {/* Comissões */}
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2">COMISSÕES</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Total</span>
                  <span className="font-semibold">{kpis.qtd_comissoes_total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-600">Recebidas</span>
                  <span className="font-semibold text-green-700">{kpis.qtd_comissoes_recebidas}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-amber-600">Pendentes</span>
                  <span className="font-semibold text-amber-700">{kpis.qtd_comissoes_pendentes}</span>
                </div>
              </div>
            </div>

            {/* Gráfico Entradas x Saídas */}
            <div className="pt-3 border-t">
              <p className="text-xs font-semibold text-slate-600 mb-2">Entradas x Saídas</p>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dadosGraficoEntradasSaidas}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="nome" fontSize={10} />
                    <YAxis fontSize={10} tickFormatter={(v) => `R$ ${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => fmt(v)} />
                    <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                      {dadosGraficoEntradasSaidas.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.cor} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfico Tarifas por Status */}
            <div className="pt-3 border-t">
              <p className="text-xs font-semibold text-slate-600 mb-2">Tarifas por Status</p>
              <div className="h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={dadosGraficoTarifasStatus}
                      cx="50%"
                      cy="50%"
                      innerRadius={30}
                      outerRadius={40}
                      paddingAngle={2}
                      dataKey="valor"
                    >
                      {dadosGraficoTarifasStatus.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.cor} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-3 text-xs mt-1">
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-green-500"></div> Recebidas</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-yellow-500"></div> Pendentes</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Buscar por cliente, banco, proposta, veículo..." className="pl-9" value={busca} onChange={e => setBusca(e.target.value)} />
            </div>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="em_analise">Em análise</SelectItem>
                <SelectItem value="aprovado">Aprovado</SelectItem>
                <SelectItem value="pago_pelo_banco">Operação Finalizada</SelectItem>
                <SelectItem value="comissao_recebida">Comissão Recebida</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroBanco} onValueChange={setFiltroBanco}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Banco" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos bancos</SelectItem>
                {bancos.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Vendedor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos vendedores</SelectItem>
                {vendedores.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroFilial} onValueChange={setFiltroFilial}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Filial" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas filiais</SelectItem>
                {filiais.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" className="w-36" value={dataInicio} onChange={e => setDataInicio(e.target.value)} placeholder="Início" />
            <Input type="date" className="w-36" value={dataFim} onChange={e => setDataFim(e.target.value)} placeholder="Fim" />
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Proposta</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Cliente</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Banco</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Vendedor</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Vr. Financiado</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Tarifa</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Comissão</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Custos</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Receita Total</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Resultado Líq.</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Data Prev.</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={13} className="text-center py-10 text-slate-400">Carregando...</td></tr>
                ) : dadosFiltrados.length === 0 ? (
                  <tr><td colSpan={13} className="text-center py-10 text-slate-400">Nenhum financiamento encontrado</td></tr>
                ) : dadosFiltrados.map(f => {
                  const st = STATUS_MAP[f.status] || { label: f.status, color: 'bg-slate-100 text-slate-600' };
                  const tarifaRec = f.tarifa_cadastral_status === 'recebida' ? (f.tarifa_cadastral || 0) : 0;
                  const comissao = comissoes.find(c => c.financiamento_id === f.id);
                  const comissaoRec = comissao?.status === 'recebida' ? (comissao.valor_comissao || 0) : 0;
                  const receitaTotal = tarifaRec + comissaoRec;
                  const resultadoLiq = receitaTotal - (f.custos_operacionais || 0);

                  return (
                    <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-700">{f.numero_proposta || '—'}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{f.cliente_nome}</p>
                        <p className="text-xs text-slate-400">{f.cliente_cpf}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{f.banco || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{f.vendedor_nome || '—'}</td>
                      <td className="px-4 py-3 text-right font-medium">{fmt(f.valor_financiado)}</td>
                      <td className="px-4 py-3 text-right">
                        <p className={f.tarifa_cadastral_status === 'recebida' ? 'text-blue-600 font-medium' : 'text-slate-400'}>
                          {fmt(f.tarifa_cadastral || 0)}
                        </p>
                        <p className="text-xs text-slate-400">{f.tarifa_cadastral_status === 'recebida' ? 'Recebida' : 'Pendente'}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className={comissao?.status === 'recebida' ? 'text-green-600 font-medium' : 'text-slate-400'}>
                          {fmt(comissao?.valor_comissao || 0)}
                        </p>
                        <p className="text-xs text-slate-400">{comissao?.status === 'recebida' ? 'Recebida' : (comissao ? 'Pendente' : '—')}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-red-600 font-medium">{fmt(f.custos_operacionais || 0)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-purple-700">{fmt(receitaTotal)}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">{fmt(resultadoLiq)}</td>
                      <td className="px-4 py-3 text-slate-500">{fmtDate(f.data_pagamento || f.data_proposta)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.color}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {f.status === 'pago_pelo_banco' && !comissao?.receita_id && (
                            <Button size="sm" variant="outline" onClick={() => abrirReceber(f)}
                              className="text-green-600 border-green-200 hover:bg-green-50 gap-1 text-xs h-7">
                              <DollarSign className="w-3 h-3" /> Receber
                            </Button>
                          )}
                          {!f.custos_operacionais && (
                            <Button size="sm" variant="outline" onClick={() => abrirCusto(f)}
                              className="text-red-600 border-red-200 hover:bg-red-50 gap-1 text-xs h-7">
                              <Plus className="w-3 h-3" /> Custo
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="text-slate-500 hover:bg-slate-100 h-7 w-7 p-0">
                            <Eye className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal Receber */}
      <Dialog open={!!receberModal} onOpenChange={v => !v && setReceberModal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              Registrar Recebimento de Comissão
            </DialogTitle>
          </DialogHeader>
          {receberModal && (
            <div className="space-y-4 py-2">
              <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                <p><span className="text-slate-500">Cliente:</span> <span className="font-medium">{receberModal.cliente_nome}</span></p>
                <p><span className="text-slate-500">Banco:</span> <span className="font-medium">{receberModal.banco || '—'}</span></p>
                <p><span className="text-slate-500">Valor Financiado:</span> <span className="font-medium">{fmt(receberModal.valor_financiado)}</span></p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Valor da Comissão Recebida (R$) *</Label>
                <Input type="number" value={formReceber.valor_comissao}
                  onChange={e => {
                    const v = e.target.value;
                    setFormReceber(f => ({
                      ...f,
                      valor_comissao: v,
                      valor_comissao_vendedor: calcularComissaoVendedor(v, f.percentual_comissao_vendedor),
                    }));
                  }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Data de Recebimento *</Label>
                <Input type="date" value={formReceber.data_recebimento}
                  onChange={e => setFormReceber(f => ({ ...f, data_recebimento: e.target.value }))} />
              </div>
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-slate-600 mb-2">Comissão do Vendedor ({receberModal.vendedor_nome || 'não informado'})</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Percentual (%)</Label>
                    <Input type="number" step="0.01" value={formReceber.percentual_comissao_vendedor}
                      onChange={e => {
                        const p = e.target.value;
                        setFormReceber(f => ({
                          ...f,
                          percentual_comissao_vendedor: p,
                          valor_comissao_vendedor: calcularComissaoVendedor(f.valor_comissao, p),
                        }));
                      }} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Valor (R$)</Label>
                    <Input type="number" value={formReceber.valor_comissao_vendedor}
                      onChange={e => setFormReceber(f => ({ ...f, valor_comissao_vendedor: e.target.value }))} />
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-1">Será criada automaticamente como Comissão a Pagar para o vendedor em Financeiro {'>'} Comissões a Pagar.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceberModal(null)}>Cancelar</Button>
            <Button onClick={confirmarRecebimento} disabled={salvando} className="bg-green-600 hover:bg-green-700 text-white gap-1.5">
              {salvando ? 'Salvando...' : <><DollarSign className="w-4 h-4" /> Confirmar Recebimento</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Custo */}
      <Dialog open={!!custoModal} onOpenChange={v => !v && setCustoModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-red-600" />
              Lançar Custo Operacional
            </DialogTitle>
          </DialogHeader>
          {custoModal && (
            <div className="space-y-4 py-2">
              <div className="bg-slate-50 rounded-lg p-3 text-sm">
                <p><span className="text-slate-500">Cliente:</span> <span className="font-medium">{custoModal.cliente_nome}</span></p>
                <p><span className="text-slate-500">Proposta:</span> <span className="font-medium">{custoModal.numero_proposta}</span></p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Descrição</Label>
                <Input value={formCusto.descricao} onChange={e => setFormCusto(f => ({ ...f, descricao: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Valor (R$) *</Label>
                  <Input type="number" value={formCusto.valor} onChange={e => setFormCusto(f => ({ ...f, valor: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Data *</Label>
                  <Input type="date" value={formCusto.data} onChange={e => setFormCusto(f => ({ ...f, data: e.target.value }))} />
                </div>
              </div>
              <p className="text-xs text-slate-400">Será criada uma Despesa automática em Movimentações Financeiras.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustoModal(null)}>Cancelar</Button>
            <Button onClick={confirmarCusto} disabled={salvando} className="bg-red-600 hover:bg-red-700 text-white gap-1.5">
              {salvando ? 'Salvando...' : <><TrendingDown className="w-4 h-4" /> Lançar Custo</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}