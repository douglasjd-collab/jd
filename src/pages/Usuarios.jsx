import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import UsuarioForm from '@/components/forms/UsuarioForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, MoreHorizontal, Pencil, UserPlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const perfilLabels = {
  master: 'Master',
  admin: 'Administrador',
  gerente: 'Gerente',
  vendedor: 'Vendedor'
};

const perfilColors = {
  master: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  gerente: 'bg-amber-100 text-amber-700',
  vendedor: 'bg-slate-100 text-slate-700'
};

export default function Usuarios() {
  const [formOpen, setFormOpen] = useState(false);
  const [selectedUsuario, setSelectedUsuario] = useState(null);
  const [search, setSearch] = useState('');
  const [filterPerfil, setFilterPerfil] = useState('todos');
  const [currentUser, setCurrentUser] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const user = await base44.auth.me();
    setCurrentUser(user);
  };

  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => base44.entities.User.list('-created_date'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const usuarioAntigo = usuarios.find(u => u.id === id);
      await base44.entities.User.update(id, data);
      
      // Auditoria
      try {
        await base44.entities.LogAuditoria.create({
          usuario_id: currentUser.id,
          usuario_nome: currentUser.full_name,
          acao: `Edição de usuário/vendedor: ${data.full_name}`,
          entidade: 'User',
          entidade_id: id,
          dados_anteriores: JSON.stringify(usuarioAntigo),
          dados_novos: JSON.stringify(data),
          tipo: 'edicao'
        });
      } catch (e) {
        console.log('Erro ao criar log:', e);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      setFormOpen(false);
      setSelectedUsuario(null);
      toast.success('Usuário atualizado com sucesso!');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const usuario = usuarios.find(u => u.id === id);
      await base44.entities.User.delete(id);
      
      // Auditoria
      try {
        await base44.entities.LogAuditoria.create({
          usuario_id: currentUser.id,
          usuario_nome: currentUser.full_name,
          acao: `Exclusão de usuário/vendedor: ${usuario.full_name}`,
          entidade: 'User',
          entidade_id: id,
          dados_anteriores: JSON.stringify(usuario),
          tipo: 'exclusao'
        });
      } catch (e) {
        console.log('Erro ao criar log:', e);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      toast.success('Usuário excluído com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao excluir usuário');
    }
  });

  const handleSubmit = async (data) => {
    // Validação de CPF único
    if (data.cpf) {
      const cpfLimpo = data.cpf.replace(/\D/g, '');
      const usuariosComMesmoCPF = usuarios.filter(u => 
        u.cpf?.replace(/\D/g, '') === cpfLimpo && u.id !== selectedUsuario?.id
      );
      if (usuariosComMesmoCPF.length > 0) {
        toast.error('CPF já cadastrado no sistema');
        return;
      }
    }

    // Normalizar dados (garantir que campos vazios sejam null)
    const normalizedData = {
      ...data,
      gerente_id: data.gerente_id || null,
      cpf: data.cpf || null,
      telefone: data.telefone || null,
      codigo_vendedor: data.codigo_vendedor || null
    };

    if (selectedUsuario) {
      // Edição - sempre permite atualizar nome, mas email só se for gerente ou superior
      const isGerenteOuSuperior = ['gerente', 'admin', 'master'].includes(currentUser?.perfil);
      
      const dataToUpdate = { ...normalizedData };
      // Remove senha e email dos dados de atualização
      delete dataToUpdate.senha;
      if (!isGerenteOuSuperior) {
        delete dataToUpdate.email;
      }
      
      updateMutation.mutate({ id: selectedUsuario.id, data: dataToUpdate });
    } else {
      // Novo usuário - cadastro direto
      try {
        const { senha, ...dadosUsuario } = normalizedData;
        const novoUsuario = await base44.entities.User.create({
          ...dadosUsuario,
          role: 'user',
          status: 'ativo'
        });

        await queryClient.invalidateQueries({ queryKey: ['usuarios'] });
        await queryClient.refetchQueries({ queryKey: ['usuarios'] });
        
        setFormOpen(false);
        toast.success('Usuário cadastrado com sucesso!');
      } catch (error) {
        console.error('Erro ao cadastrar:', error);
        toast.error(error.message || 'Erro ao cadastrar usuário');
      }
    }
  };

  const handleEdit = (usuario) => {
    setSelectedUsuario(usuario);
    setFormOpen(true);
  };

  const getGerenteNome = (gerenteId) => {
    const gerente = usuarios.find(u => u.id === gerenteId);
    return gerente?.full_name || '-';
  };

  const filteredUsuarios = usuarios.filter(u => {
    const matchSearch = u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.cpf?.includes(search);
    const matchPerfil = filterPerfil === 'todos' || u.perfil === filterPerfil;
    return matchSearch && matchPerfil;
  });

  const columns = [
    {
      header: 'Nome',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.full_name}</p>
          <p className="text-sm text-slate-500">{row.email}</p>
        </div>
      )
    },
    {
      header: 'CPF',
      cell: (row) => row.cpf || '-'
    },
    {
      header: 'Código',
      cell: (row) => row.codigo_vendedor || '-'
    },
    {
      header: 'Perfil',
      cell: (row) => (
        <Badge className={perfilColors[row.perfil] || perfilColors.vendedor}>
          {perfilLabels[row.perfil] || 'Vendedor'}
        </Badge>
      )
    },
    {
      header: 'Gerente',
      cell: (row) => row.perfil === 'vendedor' ? getGerenteNome(row.gerente_id) : '-'
    },
    {
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status || 'ativo'} />
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
            <DropdownMenuItem onClick={() => handleEdit(row)}>
              <Pencil className="w-4 h-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => {
                if (confirm(`Tem certeza que deseja excluir o usuário "${row.full_name}"?`)) {
                  deleteMutation.mutate(row.id);
                }
              }}
              className="text-red-600"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuários"
        subtitle={`${usuarios.length} usuários cadastrados`}
        actionLabel="Cadastrar Usuário"
        actionIcon={UserPlus}
        onAction={() => {
          setSelectedUsuario(null);
          setFormOpen(true);
        }}
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar por nome, email ou CPF..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterPerfil} onValueChange={setFilterPerfil}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todos os perfis" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os perfis</SelectItem>
            <SelectItem value="vendedor">Vendedores</SelectItem>
            <SelectItem value="gerente">Gerentes</SelectItem>
            <SelectItem value="admin">Administradores</SelectItem>
            <SelectItem value="master">Masters</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredUsuarios}
        isLoading={isLoading}
        emptyMessage="Nenhum usuário encontrado"
      />

      {/* Form Modal */}
      <UsuarioForm
        open={formOpen}
        onOpenChange={setFormOpen}
        usuario={selectedUsuario}
        onSubmit={handleSubmit}
        isLoading={updateMutation.isPending}
        currentUser={currentUser}
      />
    </div>
  );
}