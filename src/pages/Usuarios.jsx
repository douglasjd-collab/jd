import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import UsuarioForm from '@/components/forms/UsuarioForm';
import VincularUsuarioModal from '@/components/forms/VincularUsuarioModal';
import ConfirmarExclusaoUsuarioModal from '@/components/forms/ConfirmarExclusaoUsuarioModal';
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
import { Search, MoreHorizontal, Pencil, UserPlus, Trash2, ChevronDown, ChevronRight, Building2, Landmark, Smartphone, ShieldCheck, MapPin } from 'lucide-react';
import UsuariosBancoModal from '@/components/forms/UsuariosBancoModal';
import GerenciarPermissoesModal from '@/components/forms/GerenciarPermissoesModal';
import VincularFilialModal from '@/components/forms/VincularFilialModal';
import { toast } from 'sonner';
import { format } from 'date-fns';

const perfilLabels = {
  master: 'Master',
  super_admin: 'Super Admin',
  admin: 'Administrador',
  gerente: 'Gerente',
  vendedor: 'Vendedor',
  colaborador: 'Colaborador',
  funcionario: 'Colaborador' // retrocompatibilidade
};

const perfilColors = {
  master: 'bg-purple-100 text-purple-700',
  super_admin: 'bg-pink-100 text-pink-700',
  admin: 'bg-blue-100 text-blue-700',
  gerente: 'bg-amber-100 text-amber-700',
  vendedor: 'bg-slate-100 text-slate-700',
  colaborador: 'bg-teal-100 text-teal-700',
  funcionario: 'bg-teal-100 text-teal-700' // retrocompatibilidade
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
  const [vincularOpen, setVincularOpen] = useState(false);
  const [usuarioToVincular, setUsuarioToVincular] = useState(null);
  const [excluirOpen, setExcluirOpen] = useState(false);
  const [usuarioToExcluir, setUsuarioToExcluir] = useState(null);
  const [bancoModalOpen, setBancoModalOpen] = useState(false);
  const [usuarioBanco, setUsuarioBanco] = useState(null);
  const [permissoesOpen, setPermissoesOpen] = useState(false);
  const [usuarioPermissoes, setUsuarioPermissoes] = useState(null);
  const [filialModalOpen, setFilialModalOpen] = useState(false);
  const [usuarioFilial, setUsuarioFilial] = useState(null);
  const [empresasExpandidas, setEmpresasExpandidas] = useState(new Set());
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();

      if (!me) {
        console.warn('Usuário não autenticado');
        return;
      }

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

      if (!colabs || colabs.length === 0) {
        console.warn('Usuário sem Colaborador vinculado:', me.email);
        // Criar usuário básico mesmo sem Colaborador
        setCurrentUser({
          ...me,
          auth_id: me.id,
          colaborador_id: null,
          empresa_id: null,
          perfil: 'vendedor',
          nome_perfil: me.full_name || '',
          email: me.email || '',
        });
        return;
      }

      const byEmpresa = colabs.find(c => c.empresa_id && c.empresa_id === me.empresa_id);
      const colab = byEmpresa || colabs[0];

      setCurrentUser({
        ...me,
        auth_id: me.id,
        colaborador_id: colab.id,
        empresa_id: colab.empresa_id || null,
        perfil: colab.perfil || 'vendedor',
        nome_perfil: colab.nome || me.full_name || '',
        email: colab.email || me.email || '',
      });
    } catch (error) {
      console.error('Erro ao carregar usuário:', error);
    }
  };

  const isAdmin = ['master','super_admin','admin'].includes(currentUser?.perfil);
  const isGerente = currentUser?.perfil === 'gerente';
  const podeListar = isAdmin || isGerente;

  const { data: usuarios = [], isLoading, refetch: refetchUsuarios } = useQuery({
    queryKey: ['usuarios', currentUser?.empresa_id, currentUser?.perfil],
    enabled: !!currentUser && podeListar,
    queryFn: async () => {
      try {
        const isMasterOrSuperAdmin = ['master','super_admin'].includes(currentUser?.perfil);
        
        // Buscar Colaboradores
        let colaboradores = [];
        if (isMasterOrSuperAdmin) {
          colaboradores = await base44.asServiceRole.entities.Colaborador.list('-created_date');
        } else {
          // Admin/Gerente vê apenas usuários da sua empresa
          colaboradores = await base44.entities.Colaborador.filter(
            { empresa_id: currentUser.empresa_id },
            '-created_date'
          );
        }

        // Apenas master/super_admin busca usuários pendentes (sem Colaborador) de todo o sistema
        if (isMasterOrSuperAdmin) {
          try {
            const response = await base44.functions.invoke('listarUsuariosPendentes', {});
            const todosUsuarios = response?.data?.users || [];
            
            const idsComColab = new Set(colaboradores.map(c => c.user_id).filter(Boolean));
            
            const usuariosSemColab = todosUsuarios
              .filter(u => !idsComColab.has(u.id) && u.role !== 'super_admin')
              .map(u => ({
                id: u.id,
                user_id: u.id,
                nome: u.full_name || u.email,
                email: u.email,
                perfil: null,
                empresa_id: u.empresa_id || null,
                empresa_nome: null,
                status: 'pendente',
                cpf_cnpj: null,
                telefone: null,
                codigo_vendedor: null,
                gerente_id: null,
                aguardando_configuracao: true,
                created_date: u.created_date
              }));

            return [...usuariosSemColab, ...colaboradores];
          } catch (err) {
            console.error('Erro ao buscar usuários pendentes:', err);
            return colaboradores;
          }
        }
        
        return colaboradores;
      } catch (err) {
        console.error('Erro ao listar usuários:', err);
        return [];
      }
    },
  });

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas-usuarios'],
    queryFn: async () => {
      return await base44.entities.Empresa.list('-created_date', 200);
    },
    enabled: ['master', 'super_admin', 'admin'].includes(currentUser?.perfil)
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
      refetchUsuarios();
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
      const response = await base44.functions.invoke('updateUserToMaster', { 
        email, 
        perfil: 'super_admin' 
      });
      
      if (response.data.error) {
        throw new Error(response.data.error);
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
      nome_perfil: data.nome_perfil || null,
      percentual_comissao_agente: data.percentual_comissao_agente !== '' && data.percentual_comissao_agente != null
        ? parseFloat(data.percentual_comissao_agente)
        : null,
    };

    if (selectedUsuario) {
      // Edição - atualizar Colaborador
      const dataToUpdate = { ...normalizedData };
      delete dataToUpdate.senha;
      
      updateMutation.mutate({ id: selectedUsuario.id, data: dataToUpdate });
    } else {
      // Novo usuário - chamar função backend
      setIsSubmitting(true);
      
      try {
        // Validações antes de enviar
        if (!normalizedData.email) {
          toast.error('Email é obrigatório');
          setIsSubmitting(false);
          return;
        }
        
        if (!normalizedData.nome) {
          toast.error('Nome é obrigatório');
          setIsSubmitting(false);
          return;
        }
        
        if (!normalizedData.perfil) {
          toast.error('Perfil é obrigatório');
          setIsSubmitting(false);
          return;
        }
        
        // Preencher empresa automaticamente com a empresa do usuário logado se não informada
        if (!normalizedData.empresa_id && currentUser?.empresa_id) {
          normalizedData.empresa_id = currentUser.empresa_id;
        }

        // Bloquear apenas se ainda não tiver empresa e não for perfil global
        if (!normalizedData.empresa_id && !['master', 'super_admin'].includes(normalizedData.perfil)) {
          toast.error('Empresa não identificada. Verifique seu cadastro.');
          setIsSubmitting(false);
          return;
        }
        
        console.log('[INVITE] payload:', normalizedData);
        toast.message('Enviando convite...');

        const res = await base44.functions.invoke('inviteUser', normalizedData);
        
        const resData = res?.data ?? null;
        const err = res?.error ?? null;

        console.log('[INVITE] response:', res);

        if (err) {
          throw new Error(err.message || 'Erro ao enviar convite (invoke error)');
        }

        if (resData?.error) {
          throw new Error(resData.error);
        }

        // Atualizar lista
        await queryClient.invalidateQueries({ queryKey: ['usuarios'] });
        
        // Mostrar mensagem de sucesso
        toast.success('✅ Convite enviado com sucesso!', { 
          duration: 4000
        });
        
        // Limpar formulário completamente
        if (resetForm) resetForm();
        setInviteSuccess(false);
        setFormKey(k => k + 1);
        
        // Fechar modal
        safeCloseForm();
      } catch (error) {
        // Capturar detalhes completos do erro
        const status = error?.response?.status;
        const errResponseData = error?.response?.data;
        const msg =
          errResponseData?.error ||
          errResponseData?.message ||
          error?.message ||
          'Erro ao enviar convite';

        console.error('[INVITE] status:', status);
        console.error('[INVITE] data:', data);
        console.error('[INVITE] full error:', error);

        // Se o erro é sobre usuário não encontrado após convite, tratar como sucesso parcial
        if (msg.includes('Usuário não foi encontrado após convite') || 
            msg.includes('não foi encontrado') ||
            msg.includes('User not found')) {
          toast.success('✅ Convite enviado! O usuário aparecerá após aceitar e acessar o sistema.', {
            duration: 5000
          });
          
          // Atualizar lista mesmo assim
          await queryClient.invalidateQueries({ queryKey: ['usuarios'] });
          
          safeCloseForm();
          return;
        }

        toast.error(`Erro${status ? ` (${status})` : ''}: ${msg}`);
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
      setFormKey(k => k + 1);
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
    const matchPerfil = filterPerfil === 'todos' || 
      (filterPerfil === 'pendente' && u.aguardando_configuracao) ||
      (filterPerfil !== 'pendente' && u.perfil === filterPerfil);
    const matchEmpresa = filterEmpresa === 'todas' || u.empresa_id === filterEmpresa;
    return matchSearch && matchPerfil && matchEmpresa;
  });

  // Agrupar usuários por empresa
  const usuariosAgrupados = React.useMemo(() => {
    const grupos = {};
    
    filteredUsuarios.forEach(u => {
      const empresaId = u.empresa_id || 'sem_empresa';
      if (!grupos[empresaId]) {
        grupos[empresaId] = {
          empresa_id: empresaId,
          empresa_nome: u.empresa_nome || empresas.find(e => e.id === empresaId)?.nome || 'JD Promotora',
          usuarios: []
        };
      }
      grupos[empresaId].usuarios.push(u);
    });

    return Object.values(grupos).sort((a, b) => {
      if (a.empresa_id === 'sem_empresa') return 1;
      if (b.empresa_id === 'sem_empresa') return -1;
      return a.empresa_nome.localeCompare(b.empresa_nome);
    });
  }, [filteredUsuarios, empresas]);

  // Expandir todos os grupos automaticamente quando carregados
  React.useEffect(() => {
    if (usuariosAgrupados.length > 0) {
      setEmpresasExpandidas(new Set(usuariosAgrupados.map(g => g.empresa_id)));
    }
  }, [usuariosAgrupados.length]);

  const toggleEmpresa = (empresaId) => {
    setEmpresasExpandidas(prev => {
      const newSet = new Set(prev);
      if (newSet.has(empresaId)) {
        newSet.delete(empresaId);
      } else {
        newSet.add(empresaId);
      }
      return newSet;
    });
  };

  const columns = [
    {
      header: 'Nome',
      cell: (row) => (
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-slate-900">{row.nome}</p>
            {row.aguardando_configuracao && (
              <Badge className="bg-amber-100 text-amber-700 text-xs">Pendente</Badge>
            )}
          </div>
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
          <DropdownMenuContent align="end" className="w-48">
            {row.aguardando_configuracao ? (
              <DropdownMenuItem 
                onClick={() => {
                  setUsuarioToVincular(row);
                  setVincularOpen(true);
                }}
                className="text-[#23BE84] font-medium"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Configurar Usuário
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem onClick={() => handleEdit(row)}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => {
                    setUsuarioToVincular(row);
                    setVincularOpen(true);
                  }}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Vincular a Empresa
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log('Clicou em excluir usuário:', row);
                    setUsuarioToExcluir(row);
                    setExcluirOpen(true);
                  }}
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  // Evitar renderização enquanto carrega usuário
  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#23BE84]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuários"
        subtitle={`${usuarios.length} usuários cadastrados`}
        actionLabel="Enviar Convite"
        actionIcon={UserPlus}
        onAction={openNewInvite}
      >
        {(currentUser?.perfil === 'master' || currentUser?.perfil === 'super_admin') && (
          <Button
            variant="outline"
            onClick={() => promoteToSuperAdmin('douglas.jdpromotora@gmail.com')}
          >
            Tornar Douglas Super Admin
          </Button>
        )}
      </PageHeader>

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
            <SelectItem value="pendente">⏳ Pendentes</SelectItem>
            <SelectItem value="vendedor">Vendedores</SelectItem>
            <SelectItem value="colaborador">Colaboradores</SelectItem>
            <SelectItem value="gerente">Gerentes</SelectItem>
            <SelectItem value="admin">Administradores</SelectItem>
            <SelectItem value="super_admin">Super Admins</SelectItem>
            <SelectItem value="master">Masters</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table Agrupada */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-700 pl-10">Nome / CPF</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-700">Telefone</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-700">Perfil</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-700">Filial</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-700">PIX</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-700">Banco</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-700">Status</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Carregando...
                  </td>
                </tr>
              ) : usuariosAgrupados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Nenhum usuário encontrado
                  </td>
                </tr>
              ) : (
                usuariosAgrupados.map((grupo) => (
                  <React.Fragment key={grupo.empresa_id}>
                    {/* Linha da Empresa (Header) */}
                    <tr 
                      className="bg-slate-100 hover:bg-slate-200 cursor-pointer border-b border-slate-200"
                      onClick={() => toggleEmpresa(grupo.empresa_id)}
                    >
                      <td colSpan={8} className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {empresasExpandidas.has(grupo.empresa_id) ? (
                            <ChevronDown className="w-5 h-5 text-slate-600" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-slate-600" />
                          )}
                          <Building2 className="w-5 h-5 text-slate-600" />
                          <span className="font-semibold text-slate-900">{grupo.empresa_nome}</span>
                          <Badge variant="secondary" className="ml-2">
                            {grupo.usuarios.length} {grupo.usuarios.length === 1 ? 'usuário' : 'usuários'}
                          </Badge>
                        </div>
                      </td>
                    </tr>
                    
                    {/* Usuários da Empresa (Expandidos) */}
                    {empresasExpandidas.has(grupo.empresa_id) && grupo.usuarios.map((usuario) => (
                      <tr 
                        key={usuario.id} 
                        className="border-b border-slate-100 hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 pl-10">
                          <div className="flex items-center gap-3">
                            {usuario.foto_perfil ? (
                              <img src={usuario.foto_perfil} alt="" className="w-9 h-9 rounded-full object-cover border border-slate-200 flex-shrink-0" />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#10353C] to-[#23BE84] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                                {usuario.nome?.charAt(0).toUpperCase() || '?'}
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-slate-900">{usuario.nome}</p>
                                {usuario.evolution_instance_name && (
                                  <span title={`WhatsApp: ${usuario.evolution_instance_name}`}>
                                    <Smartphone className="w-3.5 h-3.5 text-green-500" />
                                  </span>
                                )}
                                {usuario.aguardando_configuracao && (
                                  <Badge className="bg-amber-100 text-amber-700 text-xs">Pendente</Badge>
                                )}
                              </div>
                              <p className="text-xs text-slate-500">{usuario.email}</p>
                              {usuario.cpf_cnpj && <p className="text-xs text-slate-400">{usuario.cpf_cnpj}</p>}
                              {usuario.filial_nome && (
                                <p className="text-xs text-blue-600 flex items-center gap-1 mt-0.5">
                                  <MapPin className="w-3 h-3" />{usuario.filial_nome}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{usuario.telefone || '-'}</td>
                        <td className="px-4 py-3">
                          <Badge className={perfilColors[usuario.perfil] || perfilColors.vendedor}>
                            {perfilLabels[usuario.perfil] || 'Vendedor'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {usuario.filial_nome ? (
                            <span className="flex items-center gap-1 text-blue-600 font-medium">
                              <MapPin className="w-3 h-3 flex-shrink-0" />
                              {usuario.filial_nome}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {usuario.pix_chave || usuario.chave_pix ? (
                            <div>
                              <p className="text-xs text-slate-400 capitalize">{usuario.pix_tipo || usuario.tipo_chave_pix || 'pix'}</p>
                              <p className="font-medium text-slate-700 text-xs truncate max-w-[120px]">{usuario.pix_chave || usuario.chave_pix}</p>
                            </div>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {usuario.banco ? (
                            <div>
                              <p className="font-medium">{usuario.banco}</p>
                              {usuario.agencia && <p className="text-slate-400">Ag {usuario.agencia} / Cc {usuario.conta}</p>}
                            </div>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={usuario.status || 'ativo'} />
                        </td>
                        <td className="px-4 py-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {usuario.aguardando_configuracao ? (
                                <DropdownMenuItem 
                                  onClick={() => {
                                    setUsuarioToVincular(usuario);
                                    setVincularOpen(true);
                                  }}
                                  className="text-[#23BE84] font-medium"
                                >
                                  <UserPlus className="w-4 h-4 mr-2" />
                                  Configurar Usuário
                                </DropdownMenuItem>
                              ) : (
                                <>
                                  <DropdownMenuItem onClick={() => handleEdit(usuario)}>
                                    <Pencil className="w-4 h-4 mr-2" />
                                    Editar
                                  </DropdownMenuItem>
                                  {isAdmin && usuario.empresa_id && (
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setUsuarioFilial(usuario);
                                        setFilialModalOpen(true);
                                      }}
                                    >
                                      <MapPin className="w-4 h-4 mr-2 text-blue-500" />
                                      Vincular Filial
                                      {usuario.filial_nome && (
                                        <span className="ml-auto text-xs text-slate-400 truncate max-w-[80px]">{usuario.filial_nome}</span>
                                      )}
                                    </DropdownMenuItem>
                                  )}
                                  {isAdmin && (
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setUsuarioPermissoes(usuario);
                                        setPermissoesOpen(true);
                                      }}
                                    >
                                      <ShieldCheck className="w-4 h-4 mr-2 text-[#23BE84]" />
                                      Gerenciar Permissões
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setUsuarioBanco(usuario);
                                      setBancoModalOpen(true);
                                    }}
                                  >
                                    <Landmark className="w-4 h-4 mr-2" />
                                    Usuários Banco
                                    {usuario.usuarios_banco?.length > 0 && (
                                      <Badge className="ml-auto bg-blue-100 text-blue-700 text-xs">
                                        {usuario.usuarios_banco.length}
                                      </Badge>
                                    )}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => {
                                      setUsuarioToVincular(usuario);
                                      setVincularOpen(true);
                                    }}
                                  >
                                    <UserPlus className="w-4 h-4 mr-2" />
                                    Vincular a Empresa
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setUsuarioToExcluir(usuario);
                                      setExcluirOpen(true);
                                    }}
                                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Excluir
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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

      {/* Vincular Modal */}
      <VincularUsuarioModal
        open={vincularOpen}
        onOpenChange={setVincularOpen}
        usuario={usuarioToVincular}
        empresas={empresas}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['usuarios'] });
          setVincularOpen(false);
          setUsuarioToVincular(null);
        }}
      />

      {/* Usuários Banco Modal */}
      <UsuariosBancoModal
        open={bancoModalOpen}
        onOpenChange={setBancoModalOpen}
        colaborador={usuarioBanco}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['usuarios'] });
          setUsuarioBanco(null);
        }}
      />

      {/* Gerenciar Permissões Modal */}
      <GerenciarPermissoesModal
        open={permissoesOpen}
        onOpenChange={setPermissoesOpen}
        usuario={usuarioPermissoes}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['usuarios'] });
          setUsuarioPermissoes(null);
        }}
      />

      {/* Vincular Filial Modal */}
      <VincularFilialModal
        open={filialModalOpen}
        onOpenChange={(open) => {
          setFilialModalOpen(open);
          if (!open) setUsuarioFilial(null);
        }}
        usuario={usuarioFilial}
        onSuccess={() => {
          refetchUsuarios();
        }}
      />

      {/* Confirmar Exclusão Modal */}
      <ConfirmarExclusaoUsuarioModal
        open={excluirOpen}
        onOpenChange={setExcluirOpen}
        usuario={usuarioToExcluir}
        onConfirm={() => {
          deleteMutation.mutate(usuarioToExcluir?.id);
          setUsuarioToExcluir(null);
        }}
      />
    </div>
  );
}