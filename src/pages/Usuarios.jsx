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
  super_admin: 'Super Admin',
  admin: 'Administrador',
  gerente: 'Gerente',
  vendedor: 'Vendedor'
};

const perfilColors = {
  master: 'bg-purple-100 text-purple-700',
  super_admin: 'bg-pink-100 text-pink-700',
  admin: 'bg-blue-100 text-blue-700',
  gerente: 'bg-amber-100 text-amber-700',
  vendedor: 'bg-slate-100 text-slate-700'
};

export default function Usuarios() {
  const [formOpen, setFormOpen] = useState(false);
  const [selectedUsuario, setSelectedUsuario] = useState(null);
  const [search, setSearch] = useState('');
  const [filterPerfil, setFilterPerfil] = useState('todos');
  const [filterEmpresa, setFilterEmpresa] = useState('todas');
  const [currentUser, setCurrentUser] = useState(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();

    // Super admin não precisa de Colaborador - acessa tudo
    if (me.role === 'super_admin') {
      setCurrentUser({
        ...me,
        auth_id: me.id,
        colaborador_id: null,
        empresa_id: null, // Acessa todas empresas
        perfil: 'super_admin',
        nome_perfil: me.full_name,
        email: me.email,
      });
      return;
    }

    // Para outros roles, buscar Colaborador
    const colabs = await base44.entities.Colaborador.filter(
      { user_id: me.id, status: 'ativo' },
      '-created_date'
    );

    const byEmpresa = colabs.find(c => c.empresa_id && c.empresa_id === me.empresa_id);
    const colab = byEmpresa || colabs?.[0] || null;

    setCurrentUser({
      ...me,
      auth_id: me.id,
      colaborador_id: colab?.id || null,
      empresa_id: colab?.empresa_id || me?.empresa_id || null,
      perfil: colab?.perfil || me?.role || 'vendedor',
      nome_perfil: colab?.nome || me?.full_name || '',
      email: colab?.email || me?.email || '',
    });
  };

  const isAdmin = ['master','super_admin','admin'].includes(currentUser?.perfil);
  const isGerente = currentUser?.perfil === 'gerente';
  const podeListar = isAdmin || isGerente;

  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ['usuarios', currentUser?.empresa_id, currentUser?.perfil],
    enabled: !!currentUser && podeListar,
    queryFn: async () => {
      try {
        const isMasterOrSuperAdmin = ['master','super_admin'].includes(currentUser?.perfil);
        
        if (isMasterOrSuperAdmin) {
          return await base44.entities.Colaborador.list('-created_date');
        }
        
        return await base44.entities.Colaborador.filter(
          { empresa_id: currentUser.empresa_id },
          '-created_date'
        );
      } catch (err) {
        console.error('Erro ao listar usuários:', err);
        return [];
      }
    },
  });

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas-usuarios'],
    queryFn: () => base44.entities.Empresa.filter({ status: 'ativa' }),
    enabled: currentUser?.perfil === 'master' || currentUser?.perfil === 'admin'
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const usuarioAntigo = usuarios.find(u => u.id === id);
      await base44.entities.Colaborador.update(id, data);
      
      // Auditoria
      try {
        await base44.entities.LogAuditoria.create({
          usuario_id: currentUser.id,
          usuario_nome: currentUser.full_name || currentUser.nome_perfil,
          acao: `Edição de usuário/vendedor: ${data.nome}`,
          entidade: 'Colaborador',
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
      toast.success('Usuário atualizado com sucesso!');
      safeCloseForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const usuario = usuarios.find(u => u.id === id);
      await base44.entities.Colaborador.delete(id);
      
      // Auditoria
      try {
        await base44.entities.LogAuditoria.create({
          usuario_id: currentUser.id,
          usuario_nome: currentUser.full_name || currentUser.nome_perfil,
          acao: `Exclusão de usuário/vendedor: ${usuario.nome}`,
          entidade: 'Colaborador',
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

  const promoteToSuperAdmin = async (email) => {
    try {
      // 1) achar o user auth pelo email (service role)
      const users = await base44.asServiceRole.entities.User.filter({ email });
      const userAuth = users?.[0];

      if (!userAuth) {
        throw new Error(`User auth não encontrado para: ${email}`);
      }

      // 2) buscar vínculo no Colaborador
      const colabs = await base44.asServiceRole.entities.Colaborador.filter({
        user_id: userAuth.id,
        status: 'ativo',
      });

      const colab = colabs?.[0] || null;

      // 3) se não existir Colaborador, cria um mínimo
      if (!colab) {
        await base44.asServiceRole.entities.Colaborador.create({
          user_id: userAuth.id,
          email,
          nome: userAuth.full_name || 'Super Admin',
          perfil: 'super_admin',
          empresa_id: null,
          status: 'ativo',
        });
      } else {
        // 4) se existir, atualiza para super_admin (e libera empresas)
        await base44.asServiceRole.entities.Colaborador.update(colab.id, {
          perfil: 'super_admin',
          empresa_id: null,
          gerente_id: null,
          status: 'ativo',
        });
      }

      // 5) auditoria (opcional)
      try {
        await base44.asServiceRole.entities.LogAuditoria.create({
          usuario_id: currentUser?.id || null,
          usuario_nome: currentUser?.full_name || currentUser?.nome_perfil || 'Sistema',
          acao: `Promoção para SUPER_ADMIN: ${email}`,
          entidade: 'Colaborador',
          entidade_id: colab?.id || userAuth.id,
          dados_novos: JSON.stringify({ email, perfil: 'super_admin', empresa_id: null }),
          tipo: 'edicao',
        });
      } catch (e) {
        console.log('Erro ao criar log:', e);
      }

      toast.success(`✅ ${email} agora é SUPER_ADMIN`);
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
    } catch (err) {
      console.error(err);
      toast.error(err?.message || 'Erro ao promover para super_admin');
    }
  };

  const handleSubmit = async (data, resetForm) => {
    // Validação de CPF/CNPJ único
    if (data.cpf_cnpj) {
      const cpfCnpjLimpo = data.cpf_cnpj.replace(/\D/g, '');
      const usuariosComMesmoCPFCNPJ = usuarios.filter(u => 
        u.cpf_cnpj?.replace(/\D/g, '') === cpfCnpjLimpo && u.id !== selectedUsuario?.id
      );
      if (usuariosComMesmoCPFCNPJ.length > 0) {
        toast.error('CPF/CNPJ já cadastrado no sistema');
        return;
      }
    }

    // Normalizar dados (garantir que campos vazios sejam null)
    const normalizedData = {
      ...data,
      gerente_id: data.gerente_id || null,
      cpf_cnpj: data.cpf_cnpj || null,
      telefone: data.telefone || null,
      codigo_vendedor: data.codigo_vendedor || null,
      nome_perfil: data.nome_perfil || null
    };

    if (selectedUsuario) {
      // Edição - atualizar Colaborador
      const dataToUpdate = { ...normalizedData };
      delete dataToUpdate.senha;
      
      updateMutation.mutate({ id: selectedUsuario.id, data: dataToUpdate });
    } else {
      // Novo usuário
      setIsSubmitting(true);
      setInviteSuccess(false);
      
      try {
        // 0) procurar user auth existente
        const existingUsers = await base44.asServiceRole.entities.User.filter({ email: normalizedData.email });
        let userAuth = existingUsers?.[0] || null;

        if (!userAuth) {
          // 1) só convida se não existir
          await base44.users.inviteUser(normalizedData.email, 'user');
          await new Promise(r => setTimeout(r, 1500));

          const createdUsers = await base44.asServiceRole.entities.User.filter({ email: normalizedData.email });
          if (!createdUsers?.length) throw new Error('Usuário não foi encontrado após convite');
          userAuth = createdUsers[0];
        }

        // 2) impedir vínculo duplicado (mesmo user_id + empresa)
        const vinculoExistente = await base44.entities.Colaborador.filter({
          user_id: userAuth.id,
          empresa_id: normalizedData.empresa_id,
          status: 'ativo'
        });

        if (vinculoExistente?.length) {
          throw new Error('Esse usuário já está vinculado a essa empresa.');
        }

        // 3) criar Colaborador
        const { email, senha, ...dadosColaborador } = normalizedData;
        await base44.entities.Colaborador.create({
          ...dadosColaborador,
          user_id: userAuth.id,
          email: normalizedData.email,
          status: 'ativo'
        });

        // Auditoria
        try {
          await base44.entities.LogAuditoria.create({
            usuario_id: currentUser.id,
            usuario_nome: currentUser.full_name || currentUser.nome_perfil,
            acao: `Cadastro de novo usuário: ${normalizedData.nome}`,
            entidade: 'Colaborador',
            entidade_id: userAuth.id,
            dados_novos: JSON.stringify(normalizedData),
            tipo: 'criacao'
          });
        } catch (e) {
          console.log('Erro ao criar log:', e);
        }

        await queryClient.invalidateQueries({ queryKey: ['usuarios'] });
        
        // Mostrar sucesso e limpar formulário
        setInviteSuccess(true);
        setFormKey(prev => prev + 1);
        toast.success('Convite enviado com sucesso!');
      } catch (error) {
        console.error('Erro detalhado:', error);
        toast.error(error.message || 'Erro ao enviar convite');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const safeCloseForm = () => {
    setFormOpen(false);

    // espera o Dialog desmontar (animação/portal)
    window.setTimeout(() => {
      setSelectedUsuario(null);
      setInviteSuccess(false);
    }, 200);
  };

  const openNewInvite = () => {
    setSelectedUsuario(null);
    setInviteSuccess(false);
    // força form reset sem desmontar no meio do portal
    setFormKey((k) => k + 1);
    setFormOpen(true);
  };

  const handleEdit = (usuario) => {
    setInviteSuccess(false);
    setSelectedUsuario(usuario);
    setFormOpen(true);
  };

  const getGerenteNome = (gerenteId) => {
    const gerente = usuarios.find(u => u.id === gerenteId);
    return gerente?.nome || '-';
  };

  const filteredUsuarios = usuarios.filter(u => {
    const matchSearch = u.nome?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.cpf_cnpj?.includes(search);
    const matchPerfil = filterPerfil === 'todos' || u.perfil === filterPerfil;
    const matchEmpresa = filterEmpresa === 'todas' || u.empresa_id === filterEmpresa;
    return matchSearch && matchPerfil && matchEmpresa;
  });

  const columns = [
    {
      header: 'Nome',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.nome}</p>
          <p className="text-sm text-slate-500">{row.email}</p>
        </div>
      )
    },
    {
      header: 'CPF/CNPJ',
      cell: (row) => row.cpf_cnpj || '-'
    },
    {
      header: 'Código',
      cell: (row) => row.codigo_vendedor || '-'
    },
    {
      header: 'Empresa',
      cell: (row) => {
        const empresa = empresas.find(e => e.id === row.empresa_id);
        return empresa?.nome || row.empresa_nome || '-';
      }
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
                if (confirm(`Tem certeza que deseja excluir o usuário "${row.nome}"?`)) {
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
        actionLabel="Enviar Convite"
        actionIcon={UserPlus}
        onAction={openNewInvite}
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        {(currentUser?.perfil === 'master' || currentUser?.perfil === 'admin') && (
          <Select value={filterEmpresa} onValueChange={setFilterEmpresa}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Todas as empresas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as empresas</SelectItem>
              {empresas.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        
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
            <SelectItem value="super_admin">Super Admins</SelectItem>
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
        key={formKey}
        open={formOpen}
        onOpenChange={(isOpen) => {
          if (isOpen) {
            setFormOpen(true);
          } else {
            safeCloseForm();
          }
        }}
        usuario={selectedUsuario}
        onSubmit={handleSubmit}
        isLoading={isSubmitting || updateMutation.isPending}
        currentUser={currentUser}
        inviteSuccess={inviteSuccess}
      />
    </div>
  );
}