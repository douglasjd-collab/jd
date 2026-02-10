import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Plus, Loader2 } from 'lucide-react';
import { createPageUrl } from './utils';

export default function VendasFinanciamento() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);

    if (me.role === 'super_admin' || me.perfil === 'super_admin') {
      const empresas = await base44.entities.Empresa.filter({ status: 'ativa' });
      if (empresas.length > 0) setEmpresaId(empresas[0].id);
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      if (colabs.length > 0) setEmpresaId(colabs[0].empresa_id);
    }
  };

  const isSuperAdmin = user?.role === 'super_admin' || user?.perfil === 'super_admin';

  const { data: vendas = [], isLoading } = useQuery({
    queryKey: ['vendas-financiamento', empresaId, isSuperAdmin],
    enabled: !!user && (isSuperAdmin || !!empresaId),
    queryFn: async () => {
      let vendasBase;
      if (isSuperAdmin) {
        vendasBase = await base44.entities.VendaBase.filter({ produto: 'FINANCIAMENTO' });
      } else {
        vendasBase = await base44.entities.VendaBase.filter({ empresa_id: empresaId, produto: 'FINANCIAMENTO' });
      }

      const vendasComDetalhes = await Promise.all(
        vendasBase.map(async (vb) => {
          const detalhes = await base44.entities.VendaFinanciamento.filter({ venda_base_id: vb.id });
          return { ...vb, detalhes: detalhes[0] };
        })
      );

      return vendasComDetalhes;
    }
  });

  const statusColors = {
    em_andamento: 'bg-blue-100 text-blue-800',
    pendente: 'bg-yellow-100 text-yellow-800',
    aguardando_formalizacao: 'bg-orange-100 text-orange-800',
    aguardando_pagamento: 'bg-purple-100 text-purple-800',
    pago: 'bg-emerald-100 text-emerald-800',
    cancelado: 'bg-red-100 text-red-800'
  };

  const statusLabels = {
    em_andamento: 'Em Andamento',
    pendente: 'Pendente',
    aguardando_formalizacao: 'Aguardando Formalização',
    aguardando_pagamento: 'Aguardando Pagamento',
    pago: 'Pago',
    cancelado: 'Cancelado'
  };

  if (!user || !empresaId) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financiamentos"
        subtitle="Gestão de vendas de financiamento"
        action={
          <Link to={createPageUrl('NovaVendaFinanciamento')}>
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-2" />
              Novo Financiamento
            </Button>
          </Link>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : vendas.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <CreditCard className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500">Nenhum financiamento cadastrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {vendas.map((venda) => (
            <Card key={venda.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
                      <CreditCard className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{venda.cliente_nome}</h3>
                      <p className="text-sm text-slate-600">{venda.tipo}</p>
                    </div>
                  </div>
                  <Badge className={statusColors[venda.status]}>
                    {statusLabels[venda.status]}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-slate-500">Banco</span>
                    <p className="font-medium">{venda.detalhes?.banco || '-'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Valor Financiado</span>
                    <p className="font-medium">
                      {venda.detalhes?.valor_financiado 
                        ? `R$ ${venda.detalhes.valor_financiado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Parcela</span>
                    <p className="font-medium">
                      {venda.detalhes?.parcela 
                        ? `R$ ${venda.detalhes.parcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Prazo</span>
                    <p className="font-medium">{venda.detalhes?.prazo ? `${venda.detalhes.prazo}x` : '-'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}