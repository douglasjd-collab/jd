import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Eye, Trash2, Search, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

export default function HistoricoImportacaoPropostas() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);
  const [detalhesOpen, setDetalhesOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [logToDelete, setLogToDelete] = useState(null);
  const [criadasList, setCriadasList] = useState([]);
  const [atualizadasList, setAtualizadasList] = useState([]);
  const [loadingDetalhes, setLoadingDetalhes] = useState(false);

  const queryClient = useQueryClient();

  React.useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);
    
    if (me) {
      if (me.role === 'super_admin' || me.perfil === 'super_admin') {
        setEmpresaId('all');
      } else {
        const colabs = await base44.entities.Colaborador.filter(
          { user_id: me.id, status: 'ativo' },
          '-created_date',
          1
        );
        if (colabs?.[0]?.empresa_id) {
          setEmpresaId(colabs[0].empresa_id);
        }
      }
    }
  };

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['historico-importacao-propostas', empresaId],
    queryFn: async () => {
      if (!empresaId) return [];
      const query = empresaId === 'all' ? {} : { empresa_id: empresaId };
      return await base44.entities.ImportacaoPropostasLog.filter(query, '-created_date', 500);
    },
    enabled: !!empresaId
  });

  const handleVerDetalhes = async (log) => {
    setSelectedLog(log);
    setDetalhesOpen(true);
    setLoadingDetalhes(true);

    try {
      const propostasCriadasIds = log.propostas_ids_criadas ? JSON.parse(log.propostas_ids_criadas) : [];
      
      // Buscar todas as propostas criadas
      const criadas = propostasCriadasIds.length > 0
        ? await base44.entities.Proposta.filter({ id: { $in: propostasCriadasIds } }, null, 1000)
        : [];
      
      setCriadasList(criadas);
      setAtualizadasList([]);
    } catch (err) {
      console.error('Erro ao carregar detalhes:', err);
      toast.error('Erro ao carregar detalhes: ' + err.message);
    } finally {
      setLoadingDetalhes(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (logId) => {
      await base44.entities.ImportacaoPropostasLog.delete(logId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['historico-importacao-propostas'] });
      toast.success('Histórico excluído com sucesso');
      setDeleteDialogOpen(false);
      setLogToDelete(null);
    },
    onError: (error) => {
      toast.error('Erro ao excluir histórico: ' + error.message);
    }
  });

  const handleDeleteClick = (log) => {
    setLogToDelete(log);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (logToDelete) {
      deleteMutation.mutate(logToDelete.id);
    }
  };

  const filteredLogs = logs.filter(h => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      h.arquivo_nome?.toLowerCase().includes(searchLower) ||
      h.usuario_nome?.toLowerCase().includes(searchLower) ||
      h.empresa_parceira_nome?.toLowerCase().includes(searchLower)
    );
  });

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'BRL' 
    }).format(value || 0);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Histórico de Importações de Propostas"
        subtitle="Visualize os resultados das importações de empréstimos"
      />

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Buscar por arquivo, usuário ou empresa..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Importações */}
      {isLoading ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
            <p className="text-slate-500 mt-4">Carregando histórico...</p>
          </CardContent>
        </Card>
      ) : filteredLogs.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-slate-500">Nenhuma importação encontrada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredLogs.map((log) => (
            <Card key={log.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg truncate">
                      {log.arquivo_nome}
                    </CardTitle>
                    <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-600">
                      <div>
                        <Badge variant="outline">{log.layout_nome}</Badge>
                      </div>
                      {log.empresa_parceira_nome && (
                        <div className="flex items-center gap-1">
                          <span>{log.empresa_parceira_nome}</span>
                        </div>
                      )}
                      <div>
                        Importado por: {log.usuario_nome}
                      </div>
                      <div>
                        {format(new Date(log.created_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-3">
                      <Badge className="bg-green-100 text-green-800">
                        ✓ {log.criadas} criadas
                      </Badge>
                      <Badge className="bg-blue-100 text-blue-800">
                        ↻ {log.atualizadas} atualizadas
                      </Badge>
                      <Badge className="bg-yellow-100 text-yellow-800">
                        ⊘ {log.ignoradas} ignoradas
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      onClick={() => handleVerDetalhes(log)}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      Ver
                    </Button>
                    <Button
                      onClick={() => handleDeleteClick(log)}
                      variant="outline"
                      size="sm"
                      className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de Detalhes */}
      <Dialog open={detalhesOpen} onOpenChange={setDetalhesOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Detalhes da Importação - {selectedLog?.arquivo_nome}
            </DialogTitle>
          </DialogHeader>

          {loadingDetalhes ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Resumo */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="pt-6 text-center">
                    <p className="text-2xl font-bold text-green-700">{selectedLog?.criadas}</p>
                    <p className="text-sm text-green-600 mt-1">Propostas Criadas</p>
                  </CardContent>
                </Card>
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="pt-6 text-center">
                    <p className="text-2xl font-bold text-blue-700">{selectedLog?.atualizadas}</p>
                    <p className="text-sm text-blue-600 mt-1">Propostas Atualizadas</p>
                  </CardContent>
                </Card>
                <Card className="bg-yellow-50 border-yellow-200">
                  <CardContent className="pt-6 text-center">
                    <p className="text-2xl font-bold text-yellow-700">{selectedLog?.ignoradas}</p>
                    <p className="text-sm text-yellow-600 mt-1">Linhas Ignoradas</p>
                  </CardContent>
                </Card>
              </div>

              {/* Propostas Criadas */}
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">Propostas Criadas ({criadasList.length})</h3>
                <div className="border rounded-lg overflow-hidden">
                  {criadasList.length === 0 ? (
                    <div className="p-6 text-center text-slate-500">
                      Nenhuma proposta criada nesta importação
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100 border-b">
                          <tr>
                            <th className="px-4 py-2 text-left font-semibold text-slate-700">Cliente</th>
                            <th className="px-4 py-2 text-left font-semibold text-slate-700">CPF</th>
                            <th className="px-4 py-2 text-left font-semibold text-slate-700">Contrato</th>
                            <th className="px-4 py-2 text-left font-semibold text-slate-700">Banco</th>
                            <th className="px-4 py-2 text-right font-semibold text-slate-700">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {criadasList.map((prop, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="px-4 py-2">{prop.cliente_nome || '-'}</td>
                              <td className="px-4 py-2 font-mono text-xs">{prop.cliente_cpf || '-'}</td>
                              <td className="px-4 py-2 font-mono">{prop.contrato || '-'}</td>
                              <td className="px-4 py-2">{prop.administradora_nome || '-'}</td>
                              <td className="px-4 py-2 text-right font-semibold">
                                {formatCurrency(prop.valor_credito)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este histórico de importação?
              <br />
              <br />
              <strong>{logToDelete?.arquivo_nome}</strong>
              <br />
              <br />
              <span className="text-red-600 font-semibold">Esta ação irá apenas remover o registro do histórico, não as propostas importadas.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}