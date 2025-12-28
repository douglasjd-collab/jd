import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/card';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Loader2, User, DollarSign, Calendar, TrendingUp, History } from 'lucide-react';
import { format } from 'date-fns';

export default function OportunidadeDetalhes() {
  const urlParams = new URLSearchParams(window.location.search);
  const oportunidadeId = urlParams.get('id');

  const { data: oportunidade, isLoading } = useQuery({
    queryKey: ['oportunidade', oportunidadeId],
    queryFn: async () => {
      const oports = await base44.entities.Oportunidade.filter({ id: oportunidadeId });
      return oports[0];
    },
  });

  const { data: movimentacoes = [], isLoading: loadingMovimentacoes } = useQuery({
    queryKey: ['movimentacoes', oportunidadeId],
    queryFn: () => base44.entities.MovimentacaoFunil.filter({ oportunidade_id: oportunidadeId }),
  });

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!oportunidade) {
    return <div className="p-8">Oportunidade não encontrada</div>;
  }

  const columns = [
    {
      header: 'Data/Hora',
      cell: (row) => format(new Date(row.created_date), 'dd/MM/yyyy HH:mm')
    },
    {
      header: 'De',
      cell: (row) => row.etapa_origem_nome || 'Início'
    },
    {
      header: 'Para',
      cell: (row) => row.etapa_destino_nome
    },
    {
      header: 'Usuário',
      cell: (row) => row.usuario_nome
    },
    {
      header: 'Observação',
      cell: (row) => row.observacao || '-'
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={oportunidade.titulo}
        subtitle={`Status: ${oportunidade.etapa_nome}`}
        backTo="FunilVendas"
      />

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 border-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Cliente</p>
              <p className="font-medium text-slate-900">{oportunidade.cliente_nome || 'Não vinculado'}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 border-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Valor Estimado</p>
              <p className="font-medium text-emerald-600">{formatCurrency(oportunidade.valor_estimado)}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 border-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <User className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Vendedor</p>
              <p className="font-medium text-slate-900">{oportunidade.vendedor_nome}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 border-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Calendar className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Previsão Fechamento</p>
              <p className="font-medium text-slate-900">
                {oportunidade.data_fechamento_prevista 
                  ? format(new Date(oportunidade.data_fechamento_prevista), 'dd/MM/yyyy')
                  : 'Não definida'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Informações Detalhadas */}
      <Card className="p-6 border-0 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Informações</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-500">Origem:</p>
            <p className="font-medium">{oportunidade.origem || '-'}</p>
          </div>
          <div>
            <p className="text-slate-500">Telefone:</p>
            <p className="font-medium">{oportunidade.cliente_telefone || '-'}</p>
          </div>
          <div>
            <p className="text-slate-500">Data Criação:</p>
            <p className="font-medium">{format(new Date(oportunidade.created_date), 'dd/MM/yyyy HH:mm')}</p>
          </div>
          <div>
            <p className="text-slate-500">Última Movimentação:</p>
            <p className="font-medium">
              {oportunidade.data_ultima_movimentacao 
                ? format(new Date(oportunidade.data_ultima_movimentacao), 'dd/MM/yyyy HH:mm')
                : '-'}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-slate-500">Observações:</p>
            <p className="font-medium whitespace-pre-wrap">{oportunidade.observacoes || '-'}</p>
          </div>
        </div>
      </Card>

      {/* Histórico de Movimentações */}
      <Card className="p-6 border-0 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-5 h-5 text-slate-600" />
          <h3 className="text-lg font-semibold">Histórico de Movimentações</h3>
        </div>
        <DataTable
          columns={columns}
          data={movimentacoes.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))}
          isLoading={loadingMovimentacoes}
          emptyMessage="Nenhuma movimentação registrada"
        />
      </Card>
    </div>
  );
}