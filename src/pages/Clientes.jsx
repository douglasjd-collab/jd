import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import ClienteForm from '@/components/forms/ClienteForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, MoreHorizontal, Pencil, Trash2, Eye, GitMerge, Loader2, Phone, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function Clientes() {
  const navigate = useNavigate();
  const [clienteParaEditar, setClienteParaEditar] = useState(null);
  const [clienteParaExcluir, setClienteParaExcluir] = useState(null);
  const [openForm, setOpenForm] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [search, setSearch] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [deduplicando, setDeduplicando] = useState(false);
  const [confirmDedup, setConfirmDedup] = useState(false);
  const queryClient = useQueryClient();
  const salvandoClienteRef = React.useRef(false);

  React.useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const user = await base44.auth.me();
      
      if (!user) {
        console.error('Usuário não autenticado');
        return;
      }

      // Super admin não precisa de Colaborador - acessa tudo
      if (user.role === 'super_admin') {
        setCurrentUser({
          ...user,
          auth_id: user.id,
          colaborador_id: null,
          empresa_id: null,
          perfil: 'super_admin',
          nome_perfil: user.full_name,
          email: user.email,
        });
        return;
      }

      // Para outros roles, buscar Colaborador
      const colabs = await base44.entities.Colaborador.filter(
        { user_id: user.id, status: 'ativo' },
        '-created_date'
      );

      if (!colabs || colabs.length === 0) {
        console.warn('Usuário sem Colaborador vinculado:', user.email);
        setCurrentUser({
          ...user,
          auth_id: user.id,
          colaborador_id: null,
          empresa_id: null,
          perfil: 'vendedor',
          nome_perfil: user.full_name || '',
          email: user.email || '',
        });
        return;
      }

      const byEmpresa = colabs.find(c => c.empresa_id && c.empresa_id === user.empresa_id);
      const colab = byEmpresa || colabs[0];

      setCurrentUser({
        ...user,
        auth_id: user.id,
        colaborador_id: colab.id,
        empresa_id: colab.empresa_id || null,
        perfil: colab.perfil || 'vendedor',
        nome_perfil: colab.nome || user.full_name || '',
        email: colab.email || user.email || '',
      });
    } catch (error) {
      console.error('Erro ao carregar usuário:', error);
    }
  };

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ['clientes', currentUser?.empresa_id, currentUser?.perfil],
    enabled: !!currentUser,
    queryFn: async () => {
      // Super admin e master veem todos os clientes
      if (['super_admin', 'master'].includes(currentUser?.perfil)) {
        return base44.entities.Cliente.list('-created_date', 5000);
      }
      
      // Parceiro vê apenas seus próprios clientes
      if (currentUser?.perfil === 'parceiro') {
        if (currentUser?.colaborador_id && currentUser?.empresa_id) {
          return base44.entities.Cliente.filter(
            { empresa_id: currentUser.empresa_id, vendedor_id: currentUser.colaborador_id },
            '-created_date',
            5000
          );
        }
        return [];
      }

      // Vendedor vê todos os clientes da empresa (a regra de segurança já restringe por empresa_id)
      if (currentUser?.perfil === 'vendedor') {
        if (currentUser?.empresa_id) {
          return base44.entities.Cliente.filter(
            { empresa_id: currentUser.empresa_id },
            '-created_date',
            5000
          );
        }
        return [];
      }

      // Todos os outros perfis com empresa_id veem clientes da empresa
      if (currentUser?.empresa_id) {
        return base44.entities.Cliente.filter(
          { empresa_id: currentUser.empresa_id },
          '-created_date',
          5000
        );
      }

      // Fallback: vendedor sem empresa_id no Colaborador — tenta buscar pelo auth user
      try {
        const me = await base44.auth.me();
        if (me?.empresa_id) {
          return base44.entities.Cliente.filter(
            { empresa_id: me.empresa_id },
            '-created_date',
            5000
          );
        }
      } catch {}
      
      return [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const criado = await base44.entities.Cliente.create(data);
      return criado;
    },
    onSuccess: (criado) => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      setOpenForm(false);
      setClienteParaEditar(null);
      toast.success('Cliente cadastrado com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao criar cliente:', error);
      toast.error('Erro ao cadastrar cliente');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const atualizado = await base44.entities.Cliente.update(id, data);
      return { ...atualizado, id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      setOpenForm(false);
      setClienteParaEditar(null);
      toast.success('Cliente atualizado com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao atualizar cliente:', error);
      toast.error('Erro ao atualizar cliente');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Cliente.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      setOpenDelete(false);
      setClienteParaExcluir(null);
      toast.success('Cliente excluído com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao excluir cliente:', error);
      toast.error('Erro ao excluir cliente');
      setOpenDelete(false);
      setClienteParaExcluir(null);
    }
  });

  const normCpf = (cpf) => String(cpf || '').replace(/\D/g, '');
  const formatDocumento = (documento) => {
    const numeros = normCpf(documento);
    if (numeros.length === 11) {
      return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    if (numeros.length === 14) {
      return numeros.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return documento || '-';
  };

  const handleSubmit = async (data) => {
    // Trava síncrona: impede dois cliques/submits antes de o estado da mutation atualizar.
    if (salvandoClienteRef.current) {
      toast.info('O cadastro deste cliente já está sendo processado.');
      return null;
    }
    salvandoClienteRef.current = true;

    try {
      const user = await base44.auth.me();
      
      if (!user) {
        toast.error('Sessão expirada. Faça login novamente.');
        return;
      }
      
      // Verificar duplicatas se for um novo cliente
      if (!clienteParaEditar) {
        const tipopessoa = data.tipo_pessoa;
        let clienteJaExiste = false;
        
        if (tipopessoa === 'Física' && data.cpf) {
          const cpfNorm = normCpf(data.cpf);
          clienteJaExiste = clientes.some(c => 
            c.tipo_pessoa === 'Física' && normCpf(c.cpf) === cpfNorm
          );
          if (clienteJaExiste) {
            toast.error('Já existe um cliente com este CPF cadastrado.');
            return;
          }
        } else if (tipopessoa === 'Jurídica' && data.pj_cnpj) {
          const cnpjNorm = normCpf(data.pj_cnpj);
          clienteJaExiste = clientes.some(c => 
            c.tipo_pessoa === 'Jurídica' && normCpf(c.pj_cnpj) === cnpjNorm
          );
          if (clienteJaExiste) {
            toast.error('Já existe um cliente com este CNPJ cadastrado.');
            return;
          }
        }
      }
      
      let empresa_id = user.empresa_id || null;
      let vendedor_id = user.id;
      let vendedor_nome = user.full_name;

      // Buscar Colaborador se não for super_admin
      if (user.role !== 'super_admin') {
        const colabs = await base44.entities.Colaborador.filter(
          { user_id: user.id, status: 'ativo' },
          '-created_date'
        );
        
        if (colabs && colabs.length > 0) {
          const byEmpresa = colabs.find(c => c.empresa_id && c.empresa_id === user.empresa_id);
          const colab = byEmpresa || colabs[0];
          
          empresa_id = colab.empresa_id || empresa_id;
          vendedor_id = colab.id;
          vendedor_nome = colab.nome || vendedor_nome;
        }
      }

      // Garantir que empresa_id seja uma string válida
      // Normalizar CPF/CNPJ antes de salvar (remover formatação)
      if (data.cpf) data.cpf = normCpf(data.cpf);
      if (data.pj_cnpj) data.pj_cnpj = normCpf(data.pj_cnpj);

      const clienteData = {
        ...data,
        vendedor_id,
        vendedor_nome
      };

      // Só adicionar empresa_id se for uma string válida e não vazia
      if (empresa_id && typeof empresa_id === 'string' && empresa_id.trim() !== '') {
        clienteData.empresa_id = empresa_id;
      }

      // Conferência fresca no banco imediatamente antes de salvar.
      // A lista da tela pode estar desatualizada quando outra aba ou usuário acabou de cadastrar.
      const clientesAtuais = empresa_id
        ? await base44.entities.Cliente.filter({ empresa_id }, '-created_date', 5000)
        : await base44.entities.Cliente.list('-created_date', 5000);
      const documentoNorm = data.tipo_pessoa === 'Jurídica'
        ? normCpf(clienteData.pj_cnpj)
        : normCpf(clienteData.cpf);
      const campoDocumento = data.tipo_pessoa === 'Jurídica' ? 'pj_cnpj' : 'cpf';
      const duplicado = documentoNorm && clientesAtuais.find((c) =>
        c.id !== clienteParaEditar?.id &&
        c.tipo_pessoa === data.tipo_pessoa &&
        normCpf(c[campoDocumento]) === documentoNorm
      );

      if (duplicado) {
        const rotulo = data.tipo_pessoa === 'Jurídica' ? 'CNPJ' : 'CPF';
        toast.error(`Já existe um cliente com este ${rotulo} cadastrado.`);
        return null;
      }

      let clienteSalvo = null;
      if (clienteParaEditar) {
        clienteSalvo = await updateMutation.mutateAsync({ id: clienteParaEditar.id, data: clienteData });
        // Garante o id (em caso do retorno do update não trazer)
        if (!clienteSalvo?.id) clienteSalvo = { ...clienteSalvo, id: clienteParaEditar.id, empresa_id: clienteParaEditar.empresa_id };
      } else {
        clienteSalvo = await createMutation.mutateAsync(clienteData);
        if (!clienteSalvo?.id) clienteSalvo = { ...clienteSalvo, empresa_id: empresa_id };
      }
      return clienteSalvo;
    } catch (error) {
      console.error('Erro ao salvar cliente:', error);
      toast.error('Erro ao salvar cliente: ' + error.message);
      return null;
    } finally {
      salvandoClienteRef.current = false;
    }
  };

  // Quando o usuário confirma atualização de cliente existente via OCR,
  // trocamos o formulário para o modo de edição com aquele cliente.
  const handleClienteExistenteCarregado = (clienteExistente) => {
    setClienteParaEditar(clienteExistente);
    // Garante que o form esteja aberto
    if (!openForm) setOpenForm(true);
  };

  const isAdmin = ['admin', 'gerente', 'master', 'super_admin'].includes(currentUser?.perfil);
  const isParceiro = currentUser?.perfil === 'parceiro';

  const handleDeduplicar = async () => {
    setConfirmDedup(false);
    setDeduplicando(true);
    try {
      const resp = await base44.functions.invoke('deduplicarClientes', {
        empresa_id: currentUser?.empresa_id || null
      });
      if (resp.data.error) {
        toast.error(resp.data.error);
      } else {
        toast.success(resp.data.message);
        queryClient.invalidateQueries({ queryKey: ['clientes'] });
      }
    } catch (err) {
      toast.error('Erro ao deduplicar: ' + err.message);
    } finally {
      setDeduplicando(false);
    }
  };

  const searchNorm = search.replace(/\D/g, '');
  const filteredClientes = clientes.filter(c => {
    const s = search.toLowerCase();
    if (c.nome?.toLowerCase().includes(s)) return true;
    if (c.nome_completo?.toLowerCase().includes(s)) return true;
    if (c.email?.toLowerCase().includes(s)) return true;
    if (c.pj_razao_social?.toLowerCase().includes(s)) return true;
    // CPF/CNPJ: comparar sem pontuação
    if (searchNorm && normCpf(c.cpf).includes(searchNorm)) return true;
    if (searchNorm && normCpf(c.pj_cnpj).includes(searchNorm)) return true;
    return false;
  });

  // Telefones vinculados (entidade ClienteTelefone)
  const { data: todosTelefones = [] } = useQuery({
    queryKey: ['cliente-telefones', currentUser?.empresa_id, currentUser?.perfil],
    enabled: !!currentUser,
    queryFn: async () => {
      if (['super_admin', 'master'].includes(currentUser?.perfil)) {
        return base44.entities.ClienteTelefone.list('-created_date', 5000);
      }
      if (currentUser?.empresa_id) {
        return base44.entities.ClienteTelefone.filter({ empresa_id: currentUser.empresa_id }, '-created_date', 5000);
      }
      return [];
    },
  });

  const telefonesPorCliente = useMemo(() => {
    const map = {};
    const adicionar = (clienteId, telefone, tipo, isWhatsapp = false, isPrincipal = false) => {
      if (!clienteId || !telefone) return;
      if (!map[clienteId]) map[clienteId] = [];
      const numeroNormalizado = String(telefone).replace(/\D/g, '');
      if (!numeroNormalizado || map[clienteId].some((x) => String(x.telefone).replace(/\D/g, '') === numeroNormalizado)) return;
      map[clienteId].push({ telefone, tipo, is_whatsapp: isWhatsapp, is_principal: isPrincipal });
    };

    for (const t of todosTelefones) {
      adicionar(t.cliente_id, t.telefone, t.tipo || 'contato', t.is_whatsapp, t.is_principal);
    }

    // Compatibilidade com cadastros que armazenam os telefones diretamente no Cliente.
    for (const cliente of clientes) {
      if (cliente.tipo_pessoa === 'Jurídica') {
        adicionar(cliente.id, cliente.pj_celular, 'celular', true, true);
        adicionar(cliente.id, cliente.pj_telefone_fixo, 'fixo');
      } else {
        adicionar(cliente.id, cliente.celular, 'celular', true, true);
        adicionar(cliente.id, cliente.telefone_fixo, 'fixo');
      }
    }
    return map;
  }, [todosTelefones, clientes]);

  const columns = [
    {
      header: 'Nome',
      accessor: 'nome',
      cell: (row) => (
        <p className="font-medium text-slate-900">
          {row.tipo_pessoa === 'Jurídica' ? row.pj_razao_social : (row.nome_completo || row.nome)}
        </p>
      )
    },
    {
      header: 'CPF/CNPJ',
      cell: (row) => (
        <span className="text-sm text-slate-600">
          {formatDocumento(row.tipo_pessoa === 'Jurídica' ? row.pj_cnpj : row.cpf)}
        </span>
      )
    },
    {
      header: 'Cidade',
      cell: (row) => (
        <span className="text-sm text-slate-600">{row.res_cidade || row.com_cidade || '-'}</span>
      )
    },
    {
      header: 'Telefones',
      cell: (row) => <TelefonesBadge telefones={telefonesPorCliente[row.id] || []} />
    },
    {
      header: 'Email',
      cell: (row) => (
        <span className="text-sm text-slate-600">{row.tipo_pessoa === 'Jurídica' ? (row.pj_email || row.email || '-') : (row.email || '-')}</span>
      )
    },
    {
      header: 'Cadastro',
      cell: (row) => row.created_date ? format(new Date(row.created_date), 'dd/MM/yyyy') : '-'
    },
    {
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status} />
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
          <DropdownMenuContent align="end" className="z-50">
            <DropdownMenuItem asChild>
              <Link to={createPageUrl(`ClienteDetalhes?id=${row.id}`)} className="flex items-center cursor-pointer">
                <Eye className="w-4 h-4 mr-2" />
                Ver detalhes
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setClienteParaEditar(row); setOpenForm(true); }}>
              <Pencil className="w-4 h-4 mr-2" />
              Editar
            </DropdownMenuItem>
            {!isParceiro && (
              <DropdownMenuItem 
                onClick={() => { setClienteParaExcluir(row); setOpenDelete(true); }}
                className="text-red-600"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        subtitle={`${clientes.length} clientes cadastrados`}
        actionLabel="Novo Cliente"
        onAction={() => {
          setClienteParaEditar(null);
          setOpenForm(true);
        }}>
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-orange-600 border-orange-300 hover:bg-orange-50"
            onClick={() => setConfirmDedup(true)}
            disabled={deduplicando}
          >
            {deduplicando ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
            Deduplicar Clientes
          </Button>
        )}
      </PageHeader>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar por nome, CPF ou email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredClientes}
        isLoading={isLoading}
        emptyMessage="Nenhum cliente encontrado"
        onRowDoubleClick={(row) => navigate(createPageUrl(`ClienteDetalhes?id=${row.id}`))}
      />

      {/* Form Modal */}
      <ClienteForm
        open={openForm}
        onOpenChange={(v) => { setOpenForm(v); if (!v) setClienteParaEditar(null); }}
        cliente={clienteParaEditar}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
        clientes={clientes}
        currentUser={currentUser}
        onClienteExistenteCarregado={handleClienteExistenteCarregado}
      />

      {/* Confirm Deduplicar */}
      <AlertDialog open={confirmDedup} onOpenChange={setConfirmDedup}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deduplicar Clientes por CPF?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá localizar clientes duplicados por CPF, CNPJ ou nome e manter apenas um registro por cliente. Será sempre mantido o cliente que possui telefone cadastrado. Clientes sem telefone são removidos quando já existe outro com o mesmo dado. Dados complementares serão mesclados. Propostas, oportunidades e tarefas serão reatribuídas ao cliente mantido. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeduplicar} className="bg-orange-600 hover:bg-orange-700">
              Confirmar Deduplicação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O cliente será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setClienteParaExcluir(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(clienteParaExcluir?.id)}
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

function TelefonesBadge({ telefones }) {
  const count = telefones.length;
  if (count === 0) return <span className="text-slate-400">—</span>;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100">
          <Phone className="w-3 h-3" />
          {count} {count > 1 ? 'telefones' : 'telefone'}
          <ChevronDown className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="space-y-1.5">
          {telefones.map((t, i) => (
            <div key={i} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800">{t.telefone}</p>
                <p className="text-[10px] text-slate-500 capitalize">{t.tipo}{t.is_whatsapp ? ' · WhatsApp' : ''}</p>
              </div>
              {t.is_principal && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Principal</span>}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}