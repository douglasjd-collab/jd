import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle,
  XCircle,
  Eye,
  Trash2,
  FileUp,
  TrendingUp,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function Importacao() {
  const queryClient = useQueryClient();

  const deleteImportMutation = useMutation({
    mutationFn: async (importId) => {
      toast.message('Excluindo importação...');
      
      // Excluir RecebimentoComissao relacionados
      const recebimentos = await base44.entities.RecebimentoComissao.filter({
        origem_importacao_id: importId
      });
      
      if (recebimentos.length > 0) {
        toast.message(`Excluindo ${recebimentos.length} recebimentos...`);
        for (const rec of recebimentos) {
          try {
            // Excluir ComissaoAPagar relacionada
            const comissoesAPagar = await base44.entities.ComissaoAPagar.filter({
              recebimento_id: rec.id
            });
            for (const com of comissoesAPagar) {
              await base44.entities.ComissaoAPagar.delete(com.id);
            }
            
            // Excluir RecebimentoComissao
            await base44.entities.RecebimentoComissao.delete(rec.id);
          } catch (e) {
            console.error('Erro ao excluir recebimento:', e);
          }
        }
      }
      
      // Excluir itens de importação
      const itens = await base44.entities.ImportacaoItem.filter({
        importacao_id: importId
      });
      
      if (itens.length > 0) {
        toast.message(`Excluindo ${itens.length} itens...`);
        for (const item of itens) {
          try {
            await base44.entities.ImportacaoItem.delete(item.id);
          } catch (e) {
            console.error('Erro ao excluir item:', e);
          }
        }
      }
      
      // Excluir importação
      await base44.entities.Importacao.delete(importId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['importacoes']);
      queryClient.invalidateQueries(['recebimentos']);
      toast.success('✅ Importação excluída com sucesso');
    },
    onError: (error) => {
      console.error('Erro ao excluir:', error);
      toast.error('Erro ao excluir importação: ' + (error?.message || 'Erro desconhecido'));
    }
  });

  const handleDelete = (importacao) => {
    if (confirm(`Tem certeza que deseja excluir esta importação?\n\n${importacao.registros_processados || 0} recebimentos serão excluídos.\nEsta ação não pode ser desfeita.`)) {
      deleteImportMutation.mutate(importacao.id);
    }
  };

  const { data: importacoes = [], isLoading } = useQuery({
    queryKey: ['importacoes'],
    queryFn: () => base44.entities.Importacao.list('-created_date'),
  });



  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const columns = [
    {
      header: 'Data',
      cell: (row) => new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(new Date(row.created_date))
    },
    {
      header: 'Administradora',
      cell: (row) => row.administradora_nome || '-'
    },
    {
      header: 'Arquivo',
      cell: (row) => row.arquivo_nome || '-'
    },
    {
      header: 'Registros',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span className="text-emerald-600 font-medium">{row.registros_processados || 0}</span>
          <span className="text-slate-400">/</span>
          <span className="text-red-600 font-medium">{row.registros_divergencia || 0}</span>
          <span className="text-slate-400">/</span>
          <span>{row.total_registros || 0}</span>
        </div>
      )
    },
    {
      header: 'Valor',
      cell: (row) => formatCurrency(row.valor_total)
    },
    {
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status} />
    },
    {
      header: '',
      className: 'w-24',
      cell: (row) => (
        <div className="flex items-center gap-1">
          <Link to={createPageUrl(`ImportacaoDetalhes?id=${row.id}`)}>
            <Button variant="ghost" size="icon">
              <Eye className="w-4 h-4" />
            </Button>
          </Link>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => handleDelete(row)}
            disabled={deleteImportMutation.isPending}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            {deleteImportMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </Button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importação"
        subtitle="Importe comissões e planos de consórcio"
      />

      {/* Ações de Importação */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to={createPageUrl('ImportacaoComissao')}>
          <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-50 rounded-xl">
                  <Upload className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg text-slate-900 mb-1">Imp. Comissão Consórcio</h3>
                  <p className="text-sm text-slate-600">Importe arquivos CSV de comissões de Consórcio</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to={createPageUrl('ImportacaoComissaoEmprestimo')}>
          <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-emerald-50 rounded-xl">
                  <FileUp className="w-6 h-6 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg text-slate-900 mb-1">Imp. Comissão Empréstimo</h3>
                  <p className="text-sm text-slate-600">Importe arquivos CSV de comissões de Empréstimos</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to={createPageUrl('ImportacaoProducao')}>
          <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-purple-50 rounded-xl">
                  <TrendingUp className="w-6 h-6 text-purple-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg text-slate-900 mb-1">Imp. Proposta Empréstimos</h3>
                  <p className="text-sm text-slate-600">Importe dados de propostas de empréstimos</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm bg-emerald-50">
          <CardContent className="p-4 flex items-center gap-4">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
            <div>
              <p className="text-sm text-emerald-700">Processados</p>
              <p className="text-2xl font-bold text-emerald-800">
                {importacoes.reduce((acc, i) => acc + (i.registros_processados || 0), 0)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-red-50">
          <CardContent className="p-4 flex items-center gap-4">
            <XCircle className="w-8 h-8 text-red-600" />
            <div>
              <p className="text-sm text-red-700">Divergências</p>
              <p className="text-2xl font-bold text-red-800">
                {importacoes.reduce((acc, i) => acc + (i.registros_divergencia || 0), 0)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-blue-50">
          <CardContent className="p-4 flex items-center gap-4">
            <FileSpreadsheet className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-sm text-blue-700">Valor Importado</p>
              <p className="text-2xl font-bold text-blue-800">
                {formatCurrency(importacoes.reduce((acc, i) => acc + (i.valor_total || 0), 0))}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={importacoes}
        isLoading={isLoading}
        emptyMessage="Nenhuma importação realizada"
      />


    </div>
  );
}