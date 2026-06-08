import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import ModalNovaDespesa from '@/components/financeiro/ModalNovaDespesa';
import ModalNovaReceita from '@/components/financeiro/ModalNovaReceita';
import DashboardFinanceiro from '@/components/financeiro/DashboardFinanceiro';
import AbaTransacoes from '@/components/financeiro/AbaTransacoes';
import AbaContasReceber from '@/components/financeiro/AbaContasReceber';
import AbaContasPagar from '@/components/financeiro/AbaContasPagar';
import AbaComissoes from '@/components/financeiro/AbaComissoes';
import AbaDRE from '@/components/financeiro/AbaDRE';
import AbaConciliacao from '@/components/financeiro/AbaConciliacao';

export default function Transacoes() {
  const [user, setUser] = useState(null);
  const [novaDespesaOpen, setNovaDespesaOpen] = useState(false);
  const [novaReceitaOpen, setNovaReceitaOpen] = useState(false);
  const [editandoDespesa, setEditandoDespesa] = useState(null);
  const [editandoReceita, setEditandoReceita] = useState(null);
  const [periodo, setPeriodo] = useState(() => moment().format('YYYY-MM'));
  const queryClient = useQueryClient();

  React.useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    if (me.role === 'super_admin') {
      setUser({ ...me, perfil: 'super_admin', empresa_id: null });
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      if (colabs.length > 0) {
        const colab = colabs[0];
        setUser({ ...me, perfil: colab.perfil, empresa_id: colab.empresa_id, nome: colab.nome, colaborador_id: colab.id });
      }
    }
  };

  const empresaFiltro = user?.empresa_id ? { empresa_id: user.empresa_id } : {};

  const { data: despesas = [], isLoading: loadingDespesas, refetch: refetchDespesas } = useQuery({
    queryKey: ['despesas-transacoes', user?.empresa_id],
    queryFn: () => base44.entities.Despesa.filter(empresaFiltro, '-data', 2000),
    enabled: !!user,
  });

  const { data: receitas = [], isLoading: loadingReceitas, refetch: refetchReceitas } = useQuery({
    queryKey: ['receitas-transacoes', user?.empresa_id],
    queryFn: () => base44.entities.Receita.filter(empresaFiltro, '-data', 2000),
    enabled: !!user,
  });

  const { data: comissoes = [], refetch: refetchComissoes } = useQuery({
    queryKey: ['comissoes-transacoes', user?.empresa_id],
    queryFn: () => base44.entities.ComissaoAPagar.filter(empresaFiltro, '-created_date', 2000),
    enabled: !!user,
  });

  const { data: filiais = [] } = useQuery({
    queryKey: ['filiais-transacoes', user?.empresa_id],
    queryFn: () => base44.entities.Filial.filter(user?.empresa_id ? { empresa_id: user.empresa_id } : {}, 'nome'),
    enabled: !!user,
  });

  const { data: categoriasDespesa = [] } = useQuery({
    queryKey: ['categorias-despesa', user?.empresa_id],
    queryFn: () => base44.entities.CategoriaDespesa.filter({ empresa_id: user.empresa_id, status: 'ativa' }),
    enabled: !!user?.empresa_id,
  });

  const { data: contasBancarias = [] } = useQuery({
    queryKey: ['contas-bancarias-transacoes', user?.empresa_id],
    queryFn: () => base44.entities.ContaBancaria.filter(user?.empresa_id ? { empresa_id: user.empresa_id, status: 'ativa' } : { status: 'ativa' }),
    enabled: !!user,
  });

  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ['despesas-transacoes'] });
    queryClient.invalidateQueries({ queryKey: ['receitas-transacoes'] });
    queryClient.invalidateQueries({ queryKey: ['comissoes-transacoes'] });
  };

  const isAdmin = ['master', 'super_admin', 'admin', 'gerente'].includes(user?.perfil);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <p className="text-slate-600">Acesso restrito a administradores e gerentes</p>
        </Card>
      </div>
    );
  }

  const sharedProps = {
    user, despesas, receitas, comissoes, categoriasDespesa, contasBancarias,
    filiais, periodo, setPeriodo, refetchAll, queryClient,
    loadingDespesas, loadingReceitas,
    onEditDespesa: (d) => setEditandoDespesa(d),
    onEditReceita: (r) => setEditandoReceita(r),
  };

  return (
    <div className="p-4 lg:p-6 max-w-[1600px] mx-auto">
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Central Financeira</h1>
          <p className="text-slate-500 text-sm">JD Promotora — Gestão financeira completa</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setNovaDespesaOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            ↓ Nova Despesa
          </button>
          <button
            onClick={() => setNovaReceitaOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            ↑ Nova Receita
          </button>
        </div>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList className="flex flex-wrap h-auto gap-1 mb-6 bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="dashboard" className="rounded-lg text-xs sm:text-sm">📊 Dashboard</TabsTrigger>
          <TabsTrigger value="transacoes" className="rounded-lg text-xs sm:text-sm">💳 Transações</TabsTrigger>
          <TabsTrigger value="receber" className="rounded-lg text-xs sm:text-sm">📥 A Receber</TabsTrigger>
          <TabsTrigger value="pagar" className="rounded-lg text-xs sm:text-sm">📤 A Pagar</TabsTrigger>
          <TabsTrigger value="comissoes" className="rounded-lg text-xs sm:text-sm">💰 Comissões</TabsTrigger>
          <TabsTrigger value="dre" className="rounded-lg text-xs sm:text-sm">📋 DRE</TabsTrigger>
          <TabsTrigger value="conciliacao" className="rounded-lg text-xs sm:text-sm">🔗 Conciliação</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><DashboardFinanceiro {...sharedProps} /></TabsContent>
        <TabsContent value="transacoes"><AbaTransacoes {...sharedProps} /></TabsContent>
        <TabsContent value="receber"><AbaContasReceber {...sharedProps} /></TabsContent>
        <TabsContent value="pagar"><AbaContasPagar {...sharedProps} /></TabsContent>
        <TabsContent value="comissoes"><AbaComissoes {...sharedProps} /></TabsContent>
        <TabsContent value="dre"><AbaDRE {...sharedProps} /></TabsContent>
        <TabsContent value="conciliacao"><AbaConciliacao {...sharedProps} /></TabsContent>
      </Tabs>

      <ModalNovaDespesa open={novaDespesaOpen} onOpenChange={setNovaDespesaOpen} user={user} onSuccess={refetchAll} />
      <ModalNovaReceita open={novaReceitaOpen} onOpenChange={setNovaReceitaOpen} user={user} onSuccess={refetchAll} />
      <ModalNovaDespesa open={!!editandoDespesa} onOpenChange={(v) => { if (!v) setEditandoDespesa(null); }} user={user} onSuccess={refetchAll} despesaParaEditar={editandoDespesa} />
      <ModalNovaReceita open={!!editandoReceita} onOpenChange={(v) => { if (!v) setEditandoReceita(null); }} user={user} onSuccess={refetchAll} receitaParaEditar={editandoReceita} />
    </div>
  );
}