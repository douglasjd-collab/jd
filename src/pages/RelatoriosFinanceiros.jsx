import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { DollarSign, TrendingUp, TrendingDown, Wallet, FileText } from 'lucide-react';
import moment from 'moment';

export default function RelatoriosFinanceiros() {
  const [user, setUser] = useState(null);
  const [dataInicio, setDataInicio] = useState(moment().startOf('month').format('YYYY-MM-DD'));
  const [dataFim, setDataFim] = useState(moment().endOf('month').format('YYYY-MM-DD'));

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

  const { data: comissoes = [] } = useQuery({
    queryKey: ['comissoes-relatorio'],
    queryFn: async () => {
      return await base44.entities.Comissao.filter({ tipo_comissao: 'parcela' });
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

  // Filtrar por período
  const filterByPeriod = (item, dateField) => {
    if (!item[dateField]) return false;
    const itemDate = moment(item[dateField]);
    return itemDate.isBetween(dataInicio, dataFim, 'day', '[]');
  };

  // Comissões recebidas (status: confirmada ou paga, tipo: receber)
  const comissoesRecebidas = comissoes.filter(
    (c) =>
      c.tipo === 'receber' &&
      (c.status === 'confirmada' || c.status === 'paga') &&
      filterByPeriod(c, 'data_recebimento')
  );

  // Comissões pagas (status: paga, tipo: pagar)
  const comissoesPagas = comissoes.filter(
    (c) => c.tipo === 'pagar' && c.status === 'paga' && filterByPeriod(c, 'data_pagamento')
  );

  // Comissões a pagar (status: prevista ou confirmada, tipo: pagar)
  const comissoesAPagar = comissoes.filter(
    (c) =>
      c.tipo === 'pagar' &&
      (c.status === 'prevista' || c.status === 'confirmada') &&
      filterByPeriod(c, 'data_recebimento')
  );

  const receitasPeriodo = receitas.filter((r) => filterByPeriod(r, 'data'));
  const despesasPeriodo = despesas.filter((d) => filterByPeriod(d, 'data'));

  const totalComissoesRecebidas = comissoesRecebidas.reduce((acc, c) => acc + (c.valor || 0), 0);
  const totalComissoesPagas = comissoesPagas.reduce((acc, c) => acc + (c.valor || 0), 0);
  const totalComissoesAPagar = comissoesAPagar.reduce((acc, c) => acc + (c.valor || 0), 0);
  const totalReceitas = receitasPeriodo.reduce((acc, r) => acc + (r.valor || 0), 0);
  const totalDespesas = despesasPeriodo.reduce((acc, d) => acc + (d.valor || 0), 0);

  // Resultado Final = (Comissões Recebidas + Receitas) - (Comissões Pagas + Despesas)
  const resultadoFinal = totalComissoesRecebidas + totalReceitas - (totalComissoesPagas + totalDespesas);

  const isAdmin = ['master', 'super_admin', 'admin', 'gerente'].includes(user?.perfil);

  if (!user || !isAdmin) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <p className="text-slate-600">Acesso restrito a administradores e gerentes</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Relatórios Financeiros"
        subtitle="Visão consolidada de todas as movimentações financeiras"
      />

      {/* Filtro de Período */}
      <Card className="p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <Label>Data Início</Label>
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Label>Data Fim</Label>
            <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setDataInicio(moment().startOf('month').format('YYYY-MM-DD'));
              setDataFim(moment().endOf('month').format('YYYY-MM-DD'));
            }}
          >
            Mês Atual
          </Button>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Comissões Recebidas</p>
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

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Comissões Pagas</p>
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

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Comissões a Pagar</p>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total de Receitas</p>
              <p className="text-2xl font-bold text-green-600">
                {totalReceitas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
            <TrendingUp className="w-10 h-10 text-green-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total de Despesas</p>
              <p className="text-2xl font-bold text-red-600">
                {totalDespesas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
            <TrendingDown className="w-10 h-10 text-red-600" />
          </div>
        </Card>
      </div>

      {/* Resultado Final */}
      <Card className="p-8 mb-6 bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg text-slate-700 mb-2">Resultado Final do Período</p>
            <p className="text-xs text-slate-500 mb-4">
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
        <Card>
          <div className="p-4 border-b bg-slate-50">
            <h3 className="font-semibold text-slate-700">Receitas por Categoria</h3>
          </div>
          <div className="p-4">
            {['Bônus', 'Repasse', 'Ajuste', 'Outros'].map((cat) => {
              const total = receitasPeriodo
                .filter((r) => r.categoria === cat)
                .reduce((acc, r) => acc + (r.valor || 0), 0);
              if (total === 0) return null;
              return (
                <div key={cat} className="flex justify-between py-2 border-b last:border-0">
                  <span className="text-slate-600">{cat}</span>
                  <span className="font-semibold text-green-600">
                    {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Despesas Detalhadas */}
        <Card>
          <div className="p-4 border-b bg-slate-50">
            <h3 className="font-semibold text-slate-700">Despesas por Categoria</h3>
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
                .reduce((acc, d) => acc + (d.valor || 0), 0);
              if (total === 0) return null;
              return (
                <div key={cat} className="flex justify-between py-2 border-b last:border-0">
                  <span className="text-slate-600">{cat}</span>
                  <span className="font-semibold text-red-600">
                    {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}