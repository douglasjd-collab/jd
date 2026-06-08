import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Search, CheckCircle, XCircle, Clock, DollarSign, Car, Bike, FileText, 
  TrendingUp, TrendingDown, RefreshCw, Eye, FileDown, Plus, Trash2,
  ArrowUpRight, ArrowDownRight, Wallet, Receipt, BarChart3
} from 'lucide-react';
import { toast } from 'sonner';

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
  const kpis = {
    comissoes_a_receber: comissoes.filter(c => c.status === 'pendente').reduce((s, c) => s + (c.valor_comissao || 0), 0),
    comissoes_recebidas: comissoes.filter(c => c.status === 'recebida').reduce((s, c) => s + (c.valor_comissao || 0), 0),
    tarifas_recebidas: financiamentos.filter(f => f.tarifa_cadastral_status === 'recebida').reduce((s, f) => s + (f.tarifa_cadastral || 0), 0),
    custos_operacionais: financiamentos.reduce((s, f) => s + (f.custos_operacionais || 0), 0),
    qtd_tarifas: financiamentos.filter(f => f.tarifa_cadastral_status === 'recebida').length,
  };
  kpis.receita_total = kpis.comissoes_recebidas + kpis.tarifas_recebidas;
  kpis.resultado_liquido = kpis.receita_total - kpis.custos_operacionais;

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

      {/* Cards de KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-yellow-50 border-yellow-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-yellow-700 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Comissões a Receber
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-800">{fmt(kpis.comissoes_a_receber)}</p>
            <p className="text-xs text-yellow-600 mt-1">{comissoes.filter(c => c.status === 'pendente').length} comissões pendentes</p>
          </CardContent>
        </Card>

        <Card className="bg-green-50 border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-green-700 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Comissões Recebidas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-800">{fmt(kpis.comissoes_recebidas)}</p>
            <p className="text-xs text-green-600 mt-1">{comissoes.filter(c => c.status === 'recebida').length} comissões recebidas</p>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-blue-700 flex items-center gap-1">
              <Receipt className="w-3 h-3" /> Tarifas Recebidas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-800">{fmt(kpis.tarifas_recebidas)}</p>
            <p className="text-xs text-blue-600 mt-1">{kpis.qtd_tarifas} tarifas recebidas</p>
          </CardContent>
        </Card>

        <Card className="bg-red-50 border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-red-700 flex items-center gap-1">
              <TrendingDown className="w-3 h-3" /> Custos Operacionais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-800">{fmt(kpis.custos_operacionais)}</p>
            <p className="text-xs text-red-600 mt-1">Total de custos</p>
          </CardContent>
        </Card>

        <Card className="bg-purple-50 border-purple-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-purple-700 flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> Receita Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-purple-800">{fmt(kpis.receita_total)}</p>
            <p className="text-xs text-purple-600 mt-1">Comissão + Tarifa</p>
          </CardContent>
        </Card>

        <Card className="bg-emerald-50 border-emerald-200">
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

      {/* Resumo Financeiro */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-600" />
            Resumo de Recebimentos do Financiamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500">Total de Propostas</p>
              <p className="font-bold text-slate-800">{financiamentos.length}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Total Financiado</p>
              <p className="font-bold text-slate-800">{fmt(financiamentos.reduce((s, f) => s + (f.valor_financiado || 0), 0))}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Receita de Comissão</p>
              <p className="font-bold text-green-700">{fmt(kpis.comissoes_recebidas)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Receita de Tarifa</p>
              <p className="font-bold text-blue-700">{fmt(kpis.tarifas_recebidas)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">(-) Custos Operacionais</p>
              <p className="font-bold text-red-700">{fmt(kpis.custos_operacionais)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Resultado Líquido</p>
              <p className="font-bold text-purple-700">{fmt(kpis.resultado_liquido)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

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