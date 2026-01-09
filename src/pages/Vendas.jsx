import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import VendaForm from '@/components/forms/VendaForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, MoreHorizontal, Pencil, Eye, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function Vendas() {
  const [formOpen, setFormOpen] = useState(false);
  const [selectedVenda, setSelectedVenda] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [currentUser, setCurrentUser] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();

      // Pegue todos os vínculos (colaboradores) desse auth user
      const colabs = await base44.entities.Colaborador.filter(
        { user_id: me.id, status: 'ativo' },
        '-created_date'
      );

      // 1) tenta achar o colab da empresa atual do auth (se existir)
      const byEmpresa = colabs.find(c => c.empresa_id && c.empresa_id === me.empresa_id);

      // 2) senão pega o mais recente (já vem ordenado por -created_date)
      const colab = byEmpresa || colabs?.[0] || null;

      setCurrentUser({
        ...me,
        auth_id: me.id,
        colaborador_id: colab?.id || null,
        empresa_id: colab?.empresa_id || me?.empresa_id || null,
        perfil: colab?.perfil || 'vendedor',
        gerente_id: colab?.gerente_id || null,
      });
    } catch (error) {
      console.error('Erro ao carregar usuário:', error);
      setCurrentUser({ perfil: 'vendedor' });
    }
  };

  const { data: vendas = [], isLoading } = useQuery({
    queryKey: ['vendas'],
    queryFn: () => base44.entities.Venda.list('-created_date'),
  });

  const { data: tabelas = [] } = useQuery({
    queryKey: ['tabelas-consorcio'],
    queryFn: () => base44.entities.TabelaConsorcio.list(),
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      console.log('CreateMutation recebeu:', data);
      const user = await base44.auth.me();
      console.log('currentUser completo:', user);
      
      // Capturar empresa_id de várias formas possíveis
      const empresaId = data.empresa_id || user?.empresa_id || currentUser?.empresa_id;
      
      console.log('empresa_id detectado:', empresaId);
      
      if (!empresaId) {
        throw new Error('empresa_id não encontrado. Vincule o usuário a uma empresa.');
      }
      
      // Se cota estiver vazia, marcar status como pendente
      const vendaData = {
        ...data,
        empresa_id: empresaId,
        status: !data.cota || data.cota.trim() === '' ? 'pendente' : data.status
      };
      
      console.log('Tentando criar venda com:', vendaData);
      
      // Criar venda
      const venda = await base44.entities.Venda.create(vendaData);
      
      console.log('Venda criada:', venda);
      
      // HU 05 - Buscar tabela para gerar comissões automaticamente
      const tabela = tabelas.find(t => t.id === data.tabela_id);
      if (tabela) {
        // Criar parcelas
        if (tabela.num_parcelas_comissao && tabela.comissao_por_parcela) {
          const parcelas = [];
          for (let i = 1; i <= tabela.num_parcelas_comissao; i++) {
            parcelas.push({
              empresa_id: empresaId,
              venda_id: venda.id,
              numero_parcela: i,
              valor_previsto: tabela.comissao_por_parcela,
              status: 'prevista'
            });
          }
          await base44.entities.Parcela.bulkCreate(parcelas);
        }

        // HU 05 - Criar comissões automaticamente
        const comissoes = [];

        // 1. Comissão de Faturamento (se existir)
        if (tabela.comissao_faturamento && tabela.comissao_faturamento > 0) {
          comissoes.push({
            empresa_id: empresaId,
            venda_id: venda.id,
            usuario_id: data.vendedor_id,
            usuario_nome: data.vendedor_nome,
            usuario_perfil: 'vendedor',
            tipo_comissao: 'faturamento',
            tipo: 'receber',
            valor: tabela.comissao_faturamento,
            percentual: tabela.percentual_faturamento || 0,
            status: 'prevista',
            administradora_id: data.administradora_id
          });
        }

        // 2. Comissões por Parcela (vincular cada parcela criada)
        if (tabela.num_parcelas_comissao && tabela.comissao_por_parcela) {
          const parcelasCreated = await base44.entities.Parcela.filter({ venda_id: venda.id });
          for (const parcela of parcelasCreated) {
            comissoes.push({
              empresa_id: empresaId,
              venda_id: venda.id,
              parcela_id: parcela.id,
              usuario_id: data.vendedor_id,
              usuario_nome: data.vendedor_nome,
              usuario_perfil: 'vendedor',
              tipo_comissao: 'parcela',
              tipo: 'receber',
              valor: tabela.comissao_por_parcela,
              percentual: tabela.percentual_comissao || 0,
              status: 'prevista',
              administradora_id: data.administradora_id
            });
          }
        }
        
        // Criar todas as comissões
        if (comissoes.length > 0) {
          await base44.entities.Comissao.bulkCreate(comissoes);
        }
        
        // Atualizar comissão total prevista na venda
        await base44.entities.Venda.update(venda.id, {
          comissao_total_prevista: (tabela.comissao_faturamento || 0) + (tabela.comissao_total || 0)
        });
        
        // HU 08 - Auditoria
        try {
          await base44.entities.LogAuditoria.create({
            empresa_id: empresaId,
            usuario_id: user.id,
            usuario_nome: user.full_name,
            acao: `Criação de venda e geração automática de ${comissoes.length} comissões`,
            entidade: 'Venda',
            entidade_id: venda.id,
            dados_novos: JSON.stringify({ venda, comissoes }),
            tipo: 'criacao'
          });
        } catch (e) {
          console.log('Erro ao criar log:', e);
        }
      }
      
      return venda;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendas'] });
      setFormOpen(false);
      setSelectedVenda(null);
      toast.success('Venda e comissões cadastradas automaticamente!');
    },
    onError: (error) => {
      console.error('Erro completo:', error);
      toast.error('Erro ao cadastrar venda: ' + (error.message || 'Erro desconhecido'));
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Venda.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendas'] });
      setFormOpen(false);
      setSelectedVenda(null);
      toast.success('Venda atualizada com sucesso!');
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.Venda.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendas'] });
      toast.success('Status atualizado com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao atualizar status');
    }
  });

  const handleSubmit = async (formData) => {
    try {
      console.log('📝 Dados brutos do form:', formData);
      
      // Garantir que valorCredito e data_venda estejam corretos
      const data = {
        ...formData,
        valorCredito: parseFloat(formData.valorCredito) || 0,
        taxaAdministracao: parseFloat(formData.taxaAdministracao) || 0,
        data_venda: formData.data_venda || format(new Date(), 'yyyy-MM-dd')
      };
      
      console.log('✅ Dados processados para envio:', data);
      
      if (selectedVenda) {
        updateMutation.mutate({ id: selectedVenda.id, data });
      } else {
        createMutation.mutate(data);
      }
    } catch (error) {
      console.error('Erro ao submeter venda:', error);
      toast.error('Erro ao processar venda: ' + error.message);
    }
  };

  const handleEdit = (venda) => {
    setSelectedVenda(venda);
    setFormOpen(true);
  };

  const isAdmin = currentUser?.perfil === 'master' || currentUser?.perfil === 'super_admin' || currentUser?.perfil === 'admin';
  const isGerente = currentUser?.perfil === 'gerente';

  // Filtrar vendas por perfil - usar colaborador_id
  const filteredByRole = vendas.filter(v => {
    if (isAdmin) return true;
    if (isGerente) return v.gerente_id === currentUser?.colaborador_id || v.vendedor_id === currentUser?.colaborador_id;
    return v.vendedor_id === currentUser?.colaborador_id;
  });

  const filteredVendas = filteredByRole.filter(v => {
    const matchSearch = 
      v.cliente_nome?.toLowerCase().includes(search.toLowerCase()) ||
      v.cliente_cpf?.includes(search) ||
      v.grupo?.includes(search) ||
      v.cota?.includes(search) ||
      v.contrato?.includes(search);
    const matchStatus = filterStatus === 'todos' || v.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const columns = [
    {
      header: 'Cliente',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.cliente_nome}</p>
          <p className="text-sm text-slate-500">{row.cliente_cpf}</p>
        </div>
      )
    },
    {
      header: 'Grupo/Cota',
      cell: (row) => (
        <div>
          <p className="font-medium">{row.grupo} / {row.cota}</p>
          {row.contrato && <p className="text-sm text-slate-500">Contrato: {row.contrato}</p>}
        </div>
      )
    },
    {
      header: 'Administradora',
      cell: (row) => row.administradora_nome || '-'
    },
    {
      header: 'Valor',
      cell: (row) => formatCurrency(row.valorCredito)
    },
    {
      header: 'Vendedor',
      cell: (row) => row.vendedor_nome || '-'
    },
    {
      header: 'Data',
      cell: (row) => {
        if (!row.data_venda) return '-';
        // Adiciona 'T12:00:00' para evitar problemas de timezone
        const date = new Date(row.data_venda + 'T12:00:00');
        return format(date, 'dd/MM/yyyy');
      }
    },
    {
      header: 'Status',
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2">
              <StatusBadge status={row.status} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: row.id, status: 'ativa' })}>
              Ativa
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: row.id, status: 'pendente' })}>
              Pendente
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: row.id, status: 'cancelada' })}>
              Cancelada
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: row.id, status: 'em_atraso' })}>
              Em Atraso
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: row.id, status: 'contemplada' })}>
              Contemplada
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
    {
      header: '',
      className: 'w-12',
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
           <DropdownMenuItem asChild>
             <Link to={createPageUrl(`VendaDetalhes?id=${row.id}`)}>
               <Eye className="w-4 h-4 mr-2" />
               Ver detalhes
             </Link>
           </DropdownMenuItem>
           <DropdownMenuItem onClick={() => handleEdit(row)}>
             <Pencil className="w-4 h-4 mr-2" />
             Editar
           </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendas"
        subtitle={`${filteredVendas.length} vendas`}
        actionLabel="Nova Venda"
        onAction={() => {
          setSelectedVenda(null);
          setFormOpen(true);
        }}
      />

      {/* Filters */}
      <Card className="p-4 border-0 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar por cliente, CPF, grupo, cota ou contrato..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ativa">Ativas</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="cancelada">Canceladas</SelectItem>
              <SelectItem value="em_atraso">Em Atraso</SelectItem>
              <SelectItem value="contemplada">Contempladas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredVendas}
        isLoading={isLoading}
        emptyMessage="Nenhuma venda encontrada"
      />

      {/* Form Modal */}
      <VendaForm
        open={formOpen}
        onOpenChange={setFormOpen}
        venda={selectedVenda}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
        currentUser={currentUser}
      />
    </div>
  );
}