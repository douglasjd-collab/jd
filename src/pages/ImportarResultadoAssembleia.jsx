import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Loader2, FileSpreadsheet, Trash2, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import DataTable from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function ImportarResultadoAssembleia() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [arquivo, setArquivo] = useState(null);
  const [assembleiadata, setAssembleiaData] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);

    if (me.perfil === 'super_admin' || me.perfil === 'master') {
      const empresas = await base44.entities.Empresa.filter({ status: 'ativa' }, '-created_date', 1);
      if (empresas.length > 0) setEmpresaId(empresas[0].id);
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      if (colabs.length > 0) setEmpresaId(colabs[0].empresa_id);
    }
  };

  const { data: historicos = [], isLoading } = useQuery({
    queryKey: ['historico-lance-grupo', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.HistoricoLanceGrupo.filter({ empresa_id: empresaId }, '-criado_em')
  });

  const importarMutation = useMutation({
    mutationFn: async () => {
      if (!arquivo) throw new Error('Selecione um arquivo');
      if (!assembleiadata) throw new Error('Informe a data da assembleia');
      if (!empresaId) throw new Error('Empresa não identificada');

      // 1. Upload do arquivo
      const { file_url } = await base44.integrations.Core.UploadFile({ file: arquivo });

      // 2. Processar via backend
      const response = await base44.functions.invoke('importarResultadoAssembleia', {
        file_url,
        assembleia_data: assembleiadata,
        empresa_id: empresaId,
        usuario_id: user.id,
        usuario_nome: user.full_name
      });

      return response.data;
    },
    onSuccess: (data) => {
      toast.success(`Importado: ${data.total_grupos} grupos, ${data.total_registros} registros`);
      queryClient.invalidateQueries(['historico-lance-grupo']);
      setArquivo(null);
      setAssembleiaData('');
      document.getElementById('file-input').value = '';
    },
    onError: (error) => {
      toast.error(error.message || 'Erro ao importar');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      // Deletar resumos associados
      const resumos = await base44.entities.HistoricoLanceResumo.filter({ historico_id: id });
      for (const resumo of resumos) {
        await base44.entities.HistoricoLanceResumo.delete(resumo.id);
      }
      // Deletar histórico
      await base44.entities.HistoricoLanceGrupo.delete(id);
    },
    onSuccess: () => {
      toast.success('Histórico excluído');
      queryClient.invalidateQueries(['historico-lance-grupo']);
      setDeleteId(null);
    },
    onError: () => {
      toast.error('Erro ao excluir');
    }
  });

  const columns = [
    {
      accessorKey: 'assembleia_data',
      header: 'Data Assembleia',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          {new Date(row.original.assembleia_data).toLocaleDateString('pt-BR')}
        </div>
      )
    },
    {
      accessorKey: 'arquivo_nome',
      header: 'Arquivo',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span className="text-sm">{row.original.arquivo_nome || 'Sem nome'}</span>
        </div>
      )
    },
    {
      accessorKey: 'total_grupos',
      header: 'Grupos',
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.total_grupos || 0} grupos</Badge>
      )
    },
    {
      accessorKey: 'total_registros',
      header: 'Registros',
      cell: ({ row }) => (
        <Badge variant="secondary">{row.original.total_registros || 0} registros</Badge>
      )
    },
    {
      accessorKey: 'criado_em',
      header: 'Importado em',
      cell: ({ row }) => (
        <span className="text-xs text-slate-500">
          {new Date(row.original.criado_em).toLocaleString('pt-BR')}
        </span>
      )
    },
    {
      accessorKey: 'usuario_nome',
      header: 'Usuário',
      cell: ({ row }) => (
        <span className="text-sm">{row.original.usuario_nome || '-'}</span>
      )
    },
    {
      id: 'actions',
      header: 'Ações',
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setDeleteId(row.original.id)}
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )
    }
  ];

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
        title="Importar Resultado de Assembleia"
        subtitle="Importar histórico de lances dos grupos"
        backTo="Importacao"
      />

      {/* Formulário de Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload do Arquivo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Data da Assembleia *</Label>
              <Input
                type="date"
                value={assembleiadata}
                onChange={(e) => setAssembleiaData(e.target.value)}
              />
            </div>
            <div>
              <Label>Arquivo CSV/Excel *</Label>
              <Input
                id="file-input"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => setArquivo(e.target.files[0])}
              />
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900 font-semibold mb-2">📋 Formato esperado do arquivo:</p>
            <p className="text-xs text-blue-800">
              <strong>Colunas:</strong> Grupo, Modalidade, Menor_Lance_%, Maior_Lance_%, Quantidade
            </p>
            <p className="text-xs text-blue-700 mt-1">
              <strong>Modalidades:</strong> lance_livre, lance_limitado, sorteio, lance_fixo_30, lance_fixo_50
            </p>
          </div>

          <Button
            onClick={() => importarMutation.mutate()}
            disabled={!arquivo || !assembleiadata || importarMutation.isPending}
            className="w-full bg-[#23BE84] hover:bg-[#1da570]"
          >
            {importarMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Importar Resultado
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Histórico de Importações */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Importações</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : historicos.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>Nenhuma importação realizada ainda</p>
            </div>
          ) : (
            <DataTable columns={columns} data={historicos} />
          )}
        </CardContent>
      </Card>

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este histórico? Todos os resumos de lances associados também serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deleteId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}