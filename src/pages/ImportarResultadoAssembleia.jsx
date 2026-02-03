import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Loader2, FileSpreadsheet, Trash2, Calendar, Search, Eye } from 'lucide-react';
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
  const [detalhesModalOpen, setDetalhesModalOpen] = useState(false);
  const [historicoSelecionado, setHistoricoSelecionado] = useState(null);
  const [buscaGrupo, setBuscaGrupo] = useState('');
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
    queryKey: ['historico-lance-grupo', empresaId, user?.perfil],
    enabled: !!user,
    queryFn: async () => {
      if (user?.perfil === 'super_admin' || user?.perfil === 'master') {
        // Super admin vê importações globais (empresa_id null) + específicas de empresas
        const all = await base44.entities.HistoricoLanceGrupo.list('-criado_em');
        return all;
      }
      // Outros veem apenas da sua empresa + globais
      const all = await base44.entities.HistoricoLanceGrupo.list('-criado_em');
      return all.filter(h => !h.empresa_id || h.empresa_id === empresaId);
    }
  });

  const { data: resumos = [] } = useQuery({
    queryKey: ['historico-lance-resumo', historicoSelecionado?.id],
    enabled: !!historicoSelecionado?.id,
    queryFn: () => base44.entities.HistoricoLanceResumo.filter({ historico_id: historicoSelecionado.id })
  });

  const importarMutation = useMutation({
    mutationFn: async () => {
      if (!arquivo) throw new Error('Selecione um arquivo');
      if (!assembleiadata) throw new Error('Informe a data da assembleia');

      // 1. Upload do arquivo
      const { file_url } = await base44.integrations.Core.UploadFile({ file: arquivo });

      // 2. Super admin faz importação global (sem empresa_id)
      const isGlobal = user?.perfil === 'super_admin' || user?.perfil === 'master';

      // 3. Processar via backend
      const response = await base44.functions.invoke('importarResultadoAssembleia', {
        file_url,
        assembleia_data: assembleiadata,
        empresa_id: isGlobal ? null : empresaId,
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
      
      // Deletar um por um para evitar problemas de permissão
      for (const resumo of resumos) {
        await base44.entities.HistoricoLanceResumo.delete(resumo.id);
      }
      
      // Deletar histórico
      await base44.entities.HistoricoLanceGrupo.delete(id);
    },
    onSuccess: () => {
      toast.success('Histórico excluído com sucesso');
      queryClient.invalidateQueries(['historico-lance-grupo']);
      setDeleteId(null);
    },
    onError: (error) => {
      console.error('Erro ao excluir:', error);
      toast.error(error?.message || 'Erro ao excluir histórico');
    }
  });

  const columns = [
    {
      header: 'Data Assembleia',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          {new Date(row.assembleia_data).toLocaleDateString('pt-BR')}
        </div>
      )
    },
    {
      header: 'Arquivo',
      cell: (row) => (
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span className="text-sm">{row.arquivo_nome || 'Sem nome'}</span>
          </div>
          {!row.empresa_id && (
            <Badge variant="outline" className="mt-1 text-xs bg-blue-50 text-blue-700 border-blue-200">
              Global
            </Badge>
          )}
        </div>
      )
    },
    {
      header: 'Grupos',
      cell: (row) => (
        <Badge variant="outline">{row.total_grupos || 0} grupos</Badge>
      )
    },
    {
      header: 'Registros',
      cell: (row) => (
        <Badge variant="secondary">{row.total_registros || 0} registros</Badge>
      )
    },
    {
      header: 'Importado em',
      cell: (row) => (
        <span className="text-xs text-slate-500">
          {new Date(row.criado_em).toLocaleString('pt-BR')}
        </span>
      )
    },
    {
      header: 'Usuário',
      cell: (row) => (
        <span className="text-sm">{row.usuario_nome || '-'}</span>
      )
    },
    {
      header: 'Ações',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setHistoricoSelecionado(row);
              setDetalhesModalOpen(true);
            }}
            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
          >
            <Eye className="w-4 h-4" />
          </Button>
          {(user?.perfil === 'super_admin' || user?.perfil === 'master') && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleteId(row.id)}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
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
              <Label>Arquivo PDF *</Label>
              <div className="relative">
                <Input
                  id="file-input"
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setArquivo(e.target.files[0])}
                  className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
                />
                <div className={`
                  border-2 border-dashed rounded-lg px-4 py-2.5 text-center transition-all
                  ${arquivo 
                    ? 'border-emerald-500 bg-emerald-50' 
                    : 'border-slate-300 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/50'
                  }
                `}>
                  {arquivo ? (
                    <div className="flex items-center gap-2 justify-center">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      <p className="text-sm font-medium text-emerald-900">{arquivo.name}</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 justify-center">
                      <Upload className="w-4 h-4 text-slate-400" />
                      <p className="text-sm text-slate-700">Escolher arquivo</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900 font-semibold mb-2">📋 Formato esperado do PDF:</p>
            <p className="text-xs text-blue-800">
              O sistema irá extrair automaticamente os dados de lances do PDF da assembleia
            </p>
            <p className="text-xs text-blue-700 mt-1">
              <strong>Suportado:</strong> Resultados de assembleia com lances por grupo e modalidade
            </p>
            {(user?.perfil === 'super_admin' || user?.perfil === 'master') && (
              <p className="text-xs text-blue-800 font-semibold mt-2">
                ✓ Importação global - dados visíveis para todas as empresas
              </p>
            )}
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

      {/* Modal de Detalhes do Histórico */}
      {detalhesModalOpen && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setDetalhesModalOpen(false);
            setBuscaGrupo('');
          }}
        >
          <div 
            className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    Detalhes da Importação
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Assembleia: {historicoSelecionado && new Date(historicoSelecionado.assembleia_data).toLocaleDateString('pt-BR')} • 
                    {historicoSelecionado?.total_grupos} grupos • 
                    {historicoSelecionado?.total_registros} registros
                  </p>
                </div>
                <button
                  onClick={() => {
                    setDetalhesModalOpen(false);
                    setBuscaGrupo('');
                  }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Buscar por grupo..."
                  value={buscaGrupo}
                  onChange={(e) => setBuscaGrupo(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              {(() => {
                const gruposUnicos = [...new Set(resumos.map(r => r.grupo))].sort();
                const gruposFiltrados = buscaGrupo 
                  ? gruposUnicos.filter(g => g.includes(buscaGrupo))
                  : gruposUnicos;

                if (gruposFiltrados.length === 0) {
                  return (
                    <div className="text-center py-12 text-slate-500">
                      <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p>Nenhum grupo encontrado</p>
                    </div>
                  );
                }

                const modalidadeLabel = {
                  lance_livre: 'Lance Livre',
                  lance_limitado: 'Lance Limitado',
                  sorteio: 'Sorteio',
                  lance_fixo_15: 'Lance Fixo 15%',
                  lance_fixo_30: 'Lance Fixo 30%',
                  lance_fixo_50: 'Lance Fixo 50%'
                };

                return (
                  <div className="space-y-6">
                    {gruposFiltrados.map(grupo => {
                      const resumosGrupo = resumos.filter(r => r.grupo === grupo);
                      return (
                        <Card key={grupo} className="border-2">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-lg flex items-center gap-2">
                              <FileSpreadsheet className="w-5 h-5 text-[#23BE84]" />
                              Grupo {grupo}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {resumosGrupo.map((resumo, idx) => (
                                <div key={idx} className="p-3 bg-slate-50 rounded-lg">
                                  <p className="font-semibold text-sm text-slate-700 mb-2">
                                    {modalidadeLabel[resumo.modalidade] || resumo.modalidade}
                                  </p>
                                  <div className="space-y-1 text-xs">
                                    {resumo.menor_lance_percent !== null && (
                                      <p className="text-slate-600">
                                        <span className="font-medium">Menor:</span> {resumo.menor_lance_percent}%
                                      </p>
                                    )}
                                    {resumo.maior_lance_percent !== null && (
                                      <p className="text-slate-600">
                                        <span className="font-medium">Maior:</span> {resumo.maior_lance_percent}%
                                      </p>
                                    )}
                                    <p className="text-slate-600">
                                      <span className="font-medium">Ocorrências:</span> {resumo.qtd_ocorrencias}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}