import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Building2, Plus, Edit, Trash2, ToggleRight, ToggleLeft, 
  MessageSquare, Users, ShoppingCart, TrendingUp, AlertCircle,
  Filter, Search, Loader2, CheckCircle2, Clock, XCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import NovaSubcontaModal from '@/components/subcontas/NovaSubcontaModal';
import EditarSubcontaModal from '@/components/subcontas/EditarSubcontaModal';
import UsuariosSubcontaModal from '@/components/subcontas/UsuariosSubcontaModal';

export default function GestaoSubcontas() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [novaSubcontaOpen, setNovaSubcontaOpen] = useState(false);
  const [editandoSubconta, setEditandoSubconta] = useState(null);
  const [migrandoSubconta, setMigrandoSubconta] = useState(null);
  const [migratingLoading, setMigratingLoading] = useState(false);
  const [usuariosSubcontaOpen, setUsuariosSubcontaOpen] = useState(false);
  const [subcontaSelecionada, setSubcontaSelecionada] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    base44.auth.me().then(async (me) => {
      if (!me) return;
      if (me.role === 'super_admin' || me.perfil === 'super_admin') {
        setCurrentUser({ ...me, perfil: 'super_admin' });
        return;
      }
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' }, '-created_date');
      const colab = colabs?.[0];
      setCurrentUser({ ...me, perfil: colab?.perfil || 'admin', empresa_id: colab?.empresa_id });
    });
  }, []);

  const { data: empresas = [], isLoading } = useQuery({
    queryKey: ['empresas', currentUser?.perfil],
    enabled: !!currentUser,
    queryFn: async () => {
      const response = await base44.functions.invoke('listarEmpresas', {});
      return response.data?.empresas || [];
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ empresaId, novoStatus }) =>
      base44.asServiceRole.entities.Empresa.update(empresaId, { status: novoStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
      toast.success('Status atualizado com sucesso!');
    },
    onError: () => toast.error('Erro ao atualizar status'),
  });

  const deleteMutation = useMutation({
    mutationFn: (empresaId) => base44.functions.invoke('deleteEmpresa', { empresaId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
      toast.success('Subconta deletada!');
    },
    onError: (err) => toast.error('Erro ao deletar subconta: ' + (err?.message || '')),
  });

  const migrarUsuariosMutation = useMutation({
    mutationFn: async (subconta) => {
      // Buscar empresa JD
      const empresasJd = await base44.asServiceRole.entities.Empresa.filter({});
      const empresaJd = empresasJd.find(e => e.nome && e.nome.toLowerCase().includes('jd'));
      
      if (!empresaJd) {
        throw new Error('Empresa JDPromotora não encontrada');
      }

      // Chamar função backend
      const response = await base44.functions.invoke('migrarUsuariosJDParaSubconta', {
        empresa_jd_id: empresaJd.id,
        subconta_id: subconta.id
      });

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
      toast.success('Usuários migrados com sucesso!');
      setMigrandoSubconta(null);
    },
    onError: (error) => {
      toast.error('Erro ao migrar usuários: ' + (error.message || 'desconhecido'));
      setMigrandoSubconta(null);
    },
  });

  const filteredEmpresas = empresas.filter(e => {
    const matchSearch = e.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        e.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = filterStatus === 'all' || e.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const statusColor = {
    ativa: 'bg-green-100 text-green-800',
    inativa: 'bg-gray-100 text-gray-800',
    suspensa: 'bg-red-100 text-red-800',
  };

  const licencaColor = {
    trial: 'bg-blue-100 text-blue-800',
    ativa: 'bg-green-100 text-green-800',
    expirada: 'bg-red-100 text-red-800',
    suspensa: 'bg-orange-100 text-orange-800',
  };

  const licencaIcon = {
    trial: <Clock className="w-3 h-3" />,
    ativa: <CheckCircle2 className="w-3 h-3" />,
    expirada: <XCircle className="w-3 h-3" />,
    suspensa: <AlertCircle className="w-3 h-3" />,
  };

  const diasAteExpiracao = (data) => {
    if (!data) return null;
    const hoje = new Date();
    const expiracao = new Date(data);
    const dias = Math.ceil((expiracao - hoje) / (1000 * 60 * 60 * 24));
    return dias;
  };

  const usagePercent = (usado, limite) => {
    if (!limite) return 0;
    return Math.min(100, Math.round((usado / limite) * 100));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestão de Subcontas"
        subtitle="Gerencie todas as licenças de usuários ativas no sistema"
        actionLabel="Nova Subconta"
        onAction={() => setNovaSubcontaOpen(true)}
      />

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={filterStatus === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterStatus('all')}
              >
                Todas
              </Button>
              <Button
                variant={filterStatus === 'ativa' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterStatus('ativa')}
              >
                Ativas
              </Button>
              <Button
                variant={filterStatus === 'inativa' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterStatus('inativa')}
              >
                Inativas
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{empresas.length}</div>
              <p className="text-sm text-gray-600">Total de Subcontas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                {empresas.filter(e => e.status === 'ativa').length}
              </div>
              <p className="text-sm text-gray-600">Ativas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-600">
                {empresas.filter(e => e.status_licenca === 'expirada').length}
              </div>
              <p className="text-sm text-gray-600">Licenças Expiradas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">
                {empresas.filter(e => e.whatsapp_conectado).length}
              </div>
              <p className="text-sm text-gray-600">WhatsApp Conectado</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Subcontas */}
      <div className="space-y-4">
        {filteredEmpresas.length === 0 ? (
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">Nenhuma subconta encontrada</p>
            </CardContent>
          </Card>
        ) : (
          filteredEmpresas.map((empresa) => (
            <Card key={empresa.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{empresa.nome}</h3>
                      <p className="text-sm text-gray-500">{empresa.email}</p>
                      {empresa.email_admin && (
                        <p className="text-xs text-gray-400">Admin: {empresa.email_admin}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Badge className={statusColor[empresa.status]}>
                        {empresa.status === 'ativa' ? '✓' : empresa.status === 'inativa' ? '-' : '!'} {empresa.status}
                      </Badge>
                      <Badge className={licencaColor[empresa.status_licenca]}>
                        {licencaIcon[empresa.status_licenca]} {empresa.status_licenca}
                      </Badge>
                    </div>
                  </div>

                  {/* Info Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4 py-4 border-y">
                    <div>
                      <p className="text-xs text-gray-500">Plano</p>
                      <p className="font-semibold text-sm capitalize">{empresa.tipo_licenca}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Usuários</p>
                      <p className="font-semibold text-sm">{empresa.usuarios_ativos}/{empresa.limite_usuarios}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Clientes</p>
                      <p className="font-semibold text-sm">{empresa.total_clientes || 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Vendas</p>
                      <p className="font-semibold text-sm">{empresa.total_vendas || 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">WhatsApp</p>
                      <p className="font-semibold text-sm">
                        {empresa.whatsapp_conectado ? (
                          <span className="text-green-600">✓ Conectado</span>
                        ) : (
                          <span className="text-gray-400">Não</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Valor/Mês</p>
                      <p className="font-semibold text-sm">
                        {empresa.valor_mensal ? `R$ ${empresa.valor_mensal.toFixed(2)}` : '-'}
                      </p>
                    </div>
                  </div>

                  {/* Barra de Uso */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-sm font-medium text-gray-700">Uso de Usuários</p>
                      <span className="text-xs font-bold text-gray-600">
                        {usagePercent(empresa.usuarios_ativos, empresa.limite_usuarios)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          usagePercent(empresa.usuarios_ativos, empresa.limite_usuarios) > 90
                            ? 'bg-red-500'
                            : usagePercent(empresa.usuarios_ativos, empresa.limite_usuarios) > 70
                            ? 'bg-orange-500'
                            : 'bg-green-500'
                        }`}
                        style={{ width: `${usagePercent(empresa.usuarios_ativos, empresa.limite_usuarios)}%` }}
                      />
                    </div>
                  </div>

                  {/* Aviso de Expiração */}
                  {empresa.status_licenca === 'expirada' && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <div className="text-xs text-red-800">
                        <p className="font-semibold">Licença Expirada</p>
                        <p>Renove imediatamente para reativar acesso</p>
                      </div>
                    </div>
                  )}

                  {empresa.status_licenca === 'ativa' && empresa.data_expiracao_licenca && diasAteExpiracao(empresa.data_expiracao_licenca) <= 7 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                      <div className="text-xs text-orange-800">
                        <p className="font-semibold">Licença vence em {diasAteExpiracao(empresa.data_expiracao_licenca)} dias</p>
                        <p>Renove antes do vencimento para não interromper o serviço</p>
                      </div>
                    </div>
                  )}

                  {/* Ações */}
                  <div className="flex flex-wrap gap-2 justify-end pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setMigrandoSubconta(empresa);
                        migrarUsuariosMutation.mutate(empresa);
                      }}
                      disabled={migrarUsuariosMutation.isPending}
                    >
                      <Users className="w-3 h-3 mr-1" />
                      Migrar Usuários JD
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditandoSubconta(empresa)}
                    >
                      <Edit className="w-3 h-3 mr-1" />
                      Editar
                    </Button>

                    <Button
                      size="sm"
                      variant={empresa.status === 'ativa' ? 'outline' : 'default'}
                      onClick={() =>
                        statusMutation.mutate({
                          empresaId: empresa.id,
                          novoStatus: empresa.status === 'ativa' ? 'inativa' : 'ativa',
                        })
                      }
                      disabled={statusMutation.isPending}
                    >
                      {empresa.status === 'ativa' ? (
                        <>
                          <ToggleRight className="w-3 h-3 mr-1" />
                          Desativar
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="w-3 h-3 mr-1" />
                          Ativar
                        </>
                      )}
                    </Button>

                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (confirm(`Tem certeza que quer deletar ${empresa.nome}?`)) {
                          deleteMutation.mutate(empresa.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Deletar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Modals */}
      <NovaSubcontaModal
        open={novaSubcontaOpen}
        onOpenChange={setNovaSubcontaOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['empresas'] });
          setNovaSubcontaOpen(false);
        }}
      />

      {editandoSubconta && (
        <EditarSubcontaModal
          open={!!editandoSubconta}
          onOpenChange={() => setEditandoSubconta(null)}
          empresa={editandoSubconta}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['empresas'] });
            setEditandoSubconta(null);
          }}
        />
      )}
    </div>
  );
}