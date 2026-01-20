import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/card';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, User, DollarSign, Calendar, TrendingUp, History, Calculator, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { createPageUrl } from '@/utils';

export default function OportunidadeDetalhes() {
  const urlParams = new URLSearchParams(window.location.search);
  const oportunidadeId = urlParams.get('id');
  const [simulacaoSelecionada, setSimulacaoSelecionada] = useState(null);

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

  const { data: simulacoes = [], isLoading: loadingSimulacoes } = useQuery({
    queryKey: ['simulacoes', oportunidadeId],
    queryFn: () => base44.entities.Simulacao.filter({ oportunidade_id: oportunidadeId }),
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

      {/* Histórico de Simulações */}
      {simulacoes.length > 0 && (
        <Card className="p-6 border-0 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Calculator className="w-5 h-5 text-slate-600" />
            <h3 className="text-lg font-semibold">Histórico de Simulações</h3>
          </div>
          <div className="space-y-4">
            {simulacoes
              .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
              .map((sim, index) => (
                <div key={sim.id} className="p-4 bg-slate-50 rounded-lg border">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-100 text-blue-700">
                        Simulação #{simulacoes.length - index}
                      </Badge>
                      <span className="text-sm text-slate-600">
                        {format(new Date(sim.created_date), 'dd/MM/yyyy HH:mm')}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">
                      Por: {sim.usuario_nome}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500 text-xs">💰 Crédito Total</p>
                      <p className="font-semibold text-slate-900">{formatCurrency(sim.credito_total)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs">📅 Parcela Original</p>
                      <p className="font-semibold text-slate-900">{formatCurrency(sim.parcela_total)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs">🎯 Lance Total</p>
                      <p className="font-semibold text-emerald-600">{formatCurrency(sim.lance_total)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs">⏱️ Prazo Original</p>
                      <p className="font-semibold text-slate-900">{sim.prazo_original} meses</p>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-slate-500">✨ Após Contemplação:</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2 h-7 text-xs"
                        onClick={() => window.open(createPageUrl('ImprimirSimulacao') + `?id=${sim.id}`, '_blank')}
                      >
                        <Printer className="w-3 h-3" />
                        Imprimir 2ª Via
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500 text-xs">💵 Nova Parcela</p>
                        <p className="font-bold text-purple-600">{formatCurrency(sim.nova_parcela)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">📆 Novo Prazo</p>
                        <p className="font-bold text-purple-600">{sim.novo_prazo} meses</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">💳 Saldo Devedor</p>
                        <p className="font-semibold text-slate-900">{formatCurrency(sim.saldo_apos_contemplacao)}</p>
                      </div>
                    </div>
                  </div>

                  {(sim.lance_embutido_ativo || sim.lance_proprio_ativo) && (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <p className="text-xs text-slate-500 mb-2">🏆 Detalhes do Lance:</p>
                      <div className="flex flex-wrap gap-3 text-xs">
                        {sim.lance_embutido_ativo && (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                            Lance Embutido: {sim.lance_embutido_percentual}% = {formatCurrency(sim.lance_embutido_valor)}
                          </Badge>
                        )}
                        {sim.lance_proprio_ativo && (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                            Lance Próprio: {formatCurrency(sim.lance_proprio_valor)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </Card>
      )}

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