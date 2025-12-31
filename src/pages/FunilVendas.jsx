import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Plus, MoreHorizontal, Pencil, Eye, DollarSign, Calendar, User, TrendingUp, Filter, UserCheck, MoveHorizontal, Trash2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function FunilVendas() {
  const [formOpen, setFormOpen] = useState(false);
  const [selectedOportunidade, setSelectedOportunidade] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [filterVendedor, setFilterVendedor] = useState('todos');
  const [alterarResponsavelOpen, setAlterarResponsavelOpen] = useState(false);
  const [comentariosOpen, setComentariosOpen] = useState(false);
  const [oportunidadeComentarios, setOportunidadeComentarios] = useState(null);
  const [novoComentario, setNovoComentario] = useState('');
  const [tipoComentario, setTipoComentario] = useState('comentario');
  const [mostrarFormComentario, setMostrarFormComentario] = useState(false);

  const { data: currentUserFull } = useQuery({
    queryKey: ['current-user-full', currentUser?.id],
    enabled: !!currentUser?.id,
    queryFn: async () => {
      const users = await base44.entities.User.list();
      return users.find(u => u.id === currentUser.id);
    },
  });
  const [alterarQuadroOpen, setAlterarQuadroOpen] = useState(false);
  const [oportunidadeParaAlterar, setOportunidadeParaAlterar] = useState(null);
  const [novoResponsavelId, setNovoResponsavelId] = useState('');
  const [novaEtapaId, setNovaEtapaId] = useState('');
  const [formData, setFormData] = useState({
    titulo: '',
    cliente_id: '',
    valor_estimado: '',
    etapa_id: '',
    vendedor_id: '',
    origem: '',
    observacoes: '',
    data_fechamento_prevista: '',
    telefone_lead: '',
    data_cadastro_lead: format(new Date(), 'yyyy-MM-dd')
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const user = await base44.auth.me();
    setCurrentUser(user);
    setFormData((prev) => ({
      ...prev,
      vendedor_id: prev.vendedor_id || user?.id || '',
    }));
  };

  const isAdmin = currentUser?.perfil === 'master' || currentUser?.perfil === 'admin';
  const isGerente = currentUser?.perfil === 'gerente';
  const podeVerTodos = isAdmin || isGerente;
  const podeAlterarResponsavel = isAdmin || isGerente;
  const podeAlterarQuadro = isAdmin || isGerente;

  const { data: etapas = [], isLoading: loadingEtapas } = useQuery({
    queryKey: ['etapas-funil'],
    queryFn: () => base44.entities.EtapaFunil.filter({ status: 'ativa' }),
  });

  const { data: oportunidades = [], isLoading: loadingOportunidades } = useQuery({
    queryKey: ['oportunidades'],
    queryFn: () => base44.entities.Oportunidade.list('-data_ultima_movimentacao'),
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => base44.entities.Cliente.filter({ status: 'ativo' }),
  });

  const { data: vendedores = [], isLoading: loadingVendedores } = useQuery({
    queryKey: ['vendedores'],
    enabled: !!currentUser && (isAdmin || isGerente),
    queryFn: () => base44.entities.User.list(),
  });

  const { data: comentarios = [] } = useQuery({
    queryKey: ['comentarios', oportunidadeComentarios?.id],
    enabled: !!oportunidadeComentarios?.id,
    queryFn: () => base44.entities.ComentarioOportunidade.filter(
      { oportunidade_id: oportunidadeComentarios.id },
      '-created_date'
    ),
  });

  const criarOportunidadeMutation = useMutation({
    mutationFn: async (data) => {
      const vendedorIdFinal = data.vendedor_id || currentUser?.id;
      const vendedorObj =
        vendedorIdFinal === currentUser?.id ? (currentUserFull || currentUser) : getVendedorById(vendedorIdFinal);
      const fotoPerfil = vendedorObj?.foto_perfil || '';

      const oportunidade = await base44.entities.Oportunidade.create({
        ...data,
        data_ultima_movimentacao: new Date().toISOString(),
        status: 'aberta',
        foto_perfil_responsavel: fotoPerfil
      });

      // Registrar movimentação inicial
      const etapa = etapas.find(e => e.id === data.etapa_id);
      await base44.entities.MovimentacaoFunil.create({
        oportunidade_id: oportunidade.id,
        etapa_destino_id: data.etapa_id,
        etapa_destino_nome: etapa?.nome || '',
        usuario_id: currentUser.id,
        usuario_nome: currentUser.full_name,
        observacao: 'Oportunidade criada'
      });

      return oportunidade;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['oportunidades'] });
      setFormOpen(false);
      resetForm();
      toast.success('Oportunidade criada!');
    },
  });

  const atualizarOportunidadeMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Oportunidade.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['oportunidades'] });
      setFormOpen(false);
      setSelectedOportunidade(null);
      resetForm();
      toast.success('Oportunidade atualizada!');
    },
  });

  const alterarResponsavelMutation = useMutation({
    mutationFn: async ({ oportunidadeId, novoResponsavelId }) => {
      if (!podeAlterarResponsavel) {
        throw new Error('Você não tem permissão para alterar o responsável.');
      }
      const oportunidade = oportunidades.find(o => o.id === oportunidadeId);
      const novoResponsavel = vendedores.find(v => v.id === novoResponsavelId);
      const novaFoto = novoResponsavel?.foto_perfil || '';
      
      await base44.entities.Oportunidade.update(oportunidadeId, {
        vendedor_id: novoResponsavelId,
        vendedor_nome: novoResponsavel?.full_name || '',
        gerente_id: novoResponsavel?.gerente_id || '',
        foto_perfil_responsavel: novaFoto,
        data_ultima_movimentacao: new Date().toISOString()
      });

      // Auditoria
      await base44.entities.LogAuditoria.create({
        usuario_id: currentUser.id,
        usuario_nome: currentUser.full_name,
        acao: `Alterou responsável da oportunidade "${oportunidade?.titulo}" de "${oportunidade?.vendedor_nome}" para "${novoResponsavel?.full_name}"`,
        entidade: 'Oportunidade',
        entidade_id: oportunidadeId,
        dados_anteriores: JSON.stringify({ vendedor_id: oportunidade?.vendedor_id, vendedor_nome: oportunidade?.vendedor_nome }),
        dados_novos: JSON.stringify({ vendedor_id: novoResponsavelId, vendedor_nome: novoResponsavel?.full_name }),
        tipo: 'edicao'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['oportunidades'] });
      setAlterarResponsavelOpen(false);
      setOportunidadeParaAlterar(null);
      setNovoResponsavelId('');
      toast.success('Responsável alterado!');
    },
    onError: (error) => {
      toast.error('Erro ao alterar responsável');
    }
  });

  const alterarQuadroMutation = useMutation({
    mutationFn: async ({ oportunidadeId, novaEtapaId }) => {
      const oportunidade = oportunidades.find(o => o.id === oportunidadeId);
      const etapaDestino = etapas.find(e => e.id === novaEtapaId);

      // Validações de regras (apenas aviso, não bloqueia)
      if (etapaDestino?.requer_cliente && !oportunidade?.cliente_id) {
        toast.warning('Atenção: Esta etapa requer cliente vinculado');
      }

      await base44.entities.Oportunidade.update(oportunidadeId, {
        etapa_id: novaEtapaId,
        etapa_nome: etapaDestino?.nome || '',
        data_ultima_movimentacao: new Date().toISOString(),
        status: etapaDestino?.tipo === 'ganho' ? 'ganha' : etapaDestino?.tipo === 'perdida' ? 'perdida' : 'aberta'
      });

      // Registrar movimentação
      await base44.entities.MovimentacaoFunil.create({
        oportunidade_id: oportunidadeId,
        etapa_origem_id: oportunidade?.etapa_id,
        etapa_origem_nome: oportunidade?.etapa_nome || '',
        etapa_destino_id: novaEtapaId,
        etapa_destino_nome: etapaDestino?.nome || '',
        usuario_id: currentUser.id,
        usuario_nome: currentUser.full_name
      });

      // Auditoria
      await base44.entities.LogAuditoria.create({
        usuario_id: currentUser.id,
        usuario_nome: currentUser.full_name,
        acao: `Alterou quadro da oportunidade "${oportunidade?.titulo}" de "${oportunidade?.etapa_nome}" para "${etapaDestino?.nome}"`,
        entidade: 'Oportunidade',
        entidade_id: oportunidadeId,
        tipo: 'edicao'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['oportunidades'] });
      setAlterarQuadroOpen(false);
      setOportunidadeParaAlterar(null);
      setNovaEtapaId('');
      toast.success('Quadro alterado!');
    },
    onError: (error) => {
      toast.error(error.message || 'Erro ao alterar quadro');
    }
  });

  const criarComentarioMutation = useMutation({
    mutationFn: async ({ oportunidadeId, mensagem, tipo }) => {
      if (!mensagem.trim()) {
        throw new Error('Digite uma mensagem');
      }

      const comentario = await base44.entities.ComentarioOportunidade.create({
        oportunidade_id: oportunidadeId,
        usuario_id: currentUser.id,
        usuario_nome: currentUser.full_name,
        mensagem: mensagem.trim(),
        tipo: tipo
      });

      // Atualizar data de última movimentação
      await base44.entities.Oportunidade.update(oportunidadeId, {
        data_ultima_movimentacao: new Date().toISOString()
      });

      return comentario;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comentarios'] });
      queryClient.invalidateQueries({ queryKey: ['oportunidades'] });
      setNovoComentario('');
      setTipoComentario('comentario');
      setMostrarFormComentario(false);
      toast.success('Comentário adicionado!');
    },
    onError: (error) => {
      toast.error(error.message || 'Erro ao adicionar comentário');
    }
  });

  const excluirOportunidadeMutation = useMutation({
    mutationFn: async (oportunidadeId) => {
      const oportunidade = oportunidades.find(o => o.id === oportunidadeId);
      
      await base44.entities.Oportunidade.delete(oportunidadeId);

      // Auditoria
      await base44.entities.LogAuditoria.create({
        usuario_id: currentUser.id,
        usuario_nome: currentUser.full_name,
        acao: `Excluiu oportunidade "${oportunidade?.titulo}"`,
        entidade: 'Oportunidade',
        entidade_id: oportunidadeId,
        dados_anteriores: JSON.stringify(oportunidade),
        tipo: 'exclusao'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['oportunidades'] });
      toast.success('Oportunidade excluída!');
    },
    onError: (error) => {
      toast.error(error.message || 'Erro ao excluir oportunidade');
    }
  });

  const moverOportunidadeMutation = useMutation({
    mutationFn: async ({ oportunidadeId, novaEtapaId }) => {
      const oportunidade = oportunidades.find(o => o.id === oportunidadeId);
      const etapaDestino = etapas.find(e => e.id === novaEtapaId);

      // HU 04 - Validações de regras (apenas aviso, não bloqueia)
      if (etapaDestino?.requer_cliente && !oportunidade?.cliente_id) {
        toast.warning('Atenção: Esta etapa requer cliente vinculado');
      }

      // Atualizar oportunidade
      await base44.entities.Oportunidade.update(oportunidadeId, {
        etapa_id: novaEtapaId,
        etapa_nome: etapaDestino?.nome || '',
        data_ultima_movimentacao: new Date().toISOString(),
        status: etapaDestino?.tipo === 'ganho' ? 'ganha' : etapaDestino?.tipo === 'perdida' ? 'perdida' : 'aberta'
      });

      // HU 03 - Registrar movimentação no histórico
      await base44.entities.MovimentacaoFunil.create({
        oportunidade_id: oportunidadeId,
        etapa_origem_id: oportunidade?.etapa_id,
        etapa_origem_nome: oportunidade?.etapa_nome || '',
        etapa_destino_id: novaEtapaId,
        etapa_destino_nome: etapaDestino?.nome || '',
        usuario_id: currentUser.id,
        usuario_nome: currentUser.full_name
      });

      // HU 07 - Integração com vendas
      if (etapaDestino?.tipo === 'ganho' && !oportunidade?.venda_id) {
        toast.success('Oportunidade movida para "Ganho". Lembre-se de registrar a venda!');
      }

      // HU 08 - Auditoria
      await base44.entities.LogAuditoria.create({
        usuario_id: currentUser.id,
        usuario_nome: currentUser.full_name,
        acao: `Moveu oportunidade "${oportunidade?.titulo}" de "${oportunidade?.etapa_nome}" para "${etapaDestino?.nome}"`,
        entidade: 'Oportunidade',
        entidade_id: oportunidadeId,
        tipo: 'edicao'
      });

      return { oportunidadeId, novaEtapaId, etapaDestino };
    },
    onMutate: async ({ oportunidadeId, novaEtapaId }) => {
      // Cancelar queries em andamento
      await queryClient.cancelQueries({ queryKey: ['oportunidades'] });

      // Snapshot do estado anterior
      const previousOportunidades = queryClient.getQueryData(['oportunidades']);

      // Atualização otimista
      queryClient.setQueryData(['oportunidades'], (old) => {
        return old.map(o => {
          if (o.id === oportunidadeId) {
            const etapaDestino = etapas.find(e => e.id === novaEtapaId);
            return {
              ...o,
              etapa_id: novaEtapaId,
              etapa_nome: etapaDestino?.nome || '',
              data_ultima_movimentacao: new Date().toISOString(),
              status: etapaDestino?.tipo === 'ganho' ? 'ganha' : etapaDestino?.tipo === 'perdida' ? 'perdida' : 'aberta'
            };
          }
          return o;
        });
      });

      return { previousOportunidades };
    },
    onError: (error, variables, context) => {
      // Rollback em caso de erro
      queryClient.setQueryData(['oportunidades'], context.previousOportunidades);
      toast.error(error.message || 'Erro ao mover oportunidade');
      
      // Log de auditoria do erro
      base44.entities.LogAuditoria.create({
        usuario_id: currentUser?.id || 'system',
        usuario_nome: currentUser?.full_name || 'Sistema',
        acao: `Erro ao mover oportunidade: ${error.message}`,
        entidade: 'Oportunidade',
        entidade_id: variables.oportunidadeId,
        tipo: 'edicao'
      }).catch(console.error);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['oportunidades'] });
    }
  });

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    
    // Não fazer nada se soltar no mesmo lugar
    if (result.source.droppableId === result.destination.droppableId && 
        result.source.index === result.destination.index) {
      return;
    }

    const oportunidadeId = result.draggableId;
    const novaEtapaId = result.destination.droppableId;

    try {
      await moverOportunidadeMutation.mutateAsync({ oportunidadeId, novaEtapaId });
    } catch (error) {
      console.error('Erro ao mover:', error);
      queryClient.invalidateQueries({ queryKey: ['oportunidades'] });
    }
  };

  const handleSubmit = () => {
    if (!formData.titulo || !formData.etapa_id) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    const cliente = clientes.find(c => c.id === formData.cliente_id);
    const vendedorIdFinal = formData.vendedor_id || currentUser?.id || '';
    const vendedor = vendedores.find(v => v.id === vendedorIdFinal);
    const etapa = etapas.find(e => e.id === formData.etapa_id);

    const data = {
      ...formData,
      cliente_nome: cliente?.nome || '',
      cliente_telefone: cliente?.telefone || '',
      vendedor_nome: vendedor?.full_name || '',
      gerente_id: vendedor?.gerente_id || '',
      etapa_nome: etapa?.nome || '',
      valor_estimado: parseFloat(formData.valor_estimado) || 0,
      vendedor_id: vendedorIdFinal
    };

    if (selectedOportunidade) {
      atualizarOportunidadeMutation.mutate({ id: selectedOportunidade.id, data });
    } else {
      criarOportunidadeMutation.mutate(data);
    }
  };

  const resetForm = () => {
    setFormData({
      titulo: '',
      cliente_id: '',
      valor_estimado: '',
      etapa_id: '',
      vendedor_id: currentUser?.id || '',
      origem: '',
      observacoes: '',
      data_fechamento_prevista: '',
      telefone_lead: '',
      data_cadastro_lead: format(new Date(), 'yyyy-MM-dd')
    });
  };

  const formatPhone = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 10) {
      return numbers.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return numbers.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const calcularTempoNaEtapa = (dataUltimaMovimentacao) => {
    if (!dataUltimaMovimentacao) return 'Sem data';
    
    const agora = new Date();
    const dataMovimentacao = new Date(dataUltimaMovimentacao);
    const diffMs = agora - dataMovimentacao;
    const diffMinutos = Math.floor(diffMs / (1000 * 60));
    const diffHoras = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDias > 0) {
      return `${diffDias} ${diffDias === 1 ? 'dia' : 'dias'}`;
    } else if (diffHoras > 0) {
      return `${diffHoras} ${diffHoras === 1 ? 'hora' : 'horas'}`;
    } else {
      return `${diffMinutos} ${diffMinutos === 1 ? 'minuto' : 'minutos'}`;
    }
  };

  // HU 05 - Indicadores
  const filteredOportunidades = oportunidades
    .filter((o) => {
      if (!currentUser) return false;
      if (podeVerTodos) return true;
      return o.vendedor_id === currentUser.id;
    })
    .filter((o) => {
      if (!podeVerTodos) return true;
      if (filterVendedor === 'todos') return true;
      return o.vendedor_id === filterVendedor;
    });

  const calcularIndicadores = (etapaId) => {
    const oportEtapa = filteredOportunidades.filter(o => o.etapa_id === etapaId);
    const quantidade = oportEtapa.length;
    const valor = oportEtapa.reduce((sum, o) => sum + (o.valor_estimado || 0), 0);
    return { quantidade, valor };
  };

  const getVendedorById = (id) => vendedores.find(v => v.id === id);
  const getAvatarUrlFromUser = (u) => u?.foto_perfil || '';

  const getAvatarUrlForOportunidade = (oport) => {
    if (oport?.foto_perfil_responsavel) return oport.foto_perfil_responsavel;
    if (oport?.vendedor_id === currentUser?.id) {
      return getAvatarUrlFromUser(currentUserFull || currentUser);
    }
    const v = getVendedorById(oport?.vendedor_id);
    return getAvatarUrlFromUser(v);
  };

  const getInitials = (name = '') => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
  };

  const etapasOrdenadas = [...etapas].sort((a, b) => a.ordem - b.ordem);

  if (loadingEtapas || loadingOportunidades) {
    return <div className="p-8">Carregando funil...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Funil de Vendas"
        subtitle="Gerencie suas oportunidades"
        actionLabel="Nova Oportunidade"
        onAction={() => {
          setSelectedOportunidade(null);
          resetForm();
          setFormOpen(true);
        }}
      >
        {podeVerTodos && (
          <>
            <Select value={filterVendedor} onValueChange={setFilterVendedor}>
              <SelectTrigger className="w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filtrar vendedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os vendedores</SelectItem>
                {vendedores.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Link to={createPageUrl('ConfiguracaoFunil')}>
              <Button variant="outline">Configurar Etapas</Button>
            </Link>
          </>
        )}
      </PageHeader>

      {/* HU 05 - Indicadores Gerais */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 border-0 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total de Oportunidades</p>
              <p className="text-2xl font-bold text-slate-900">{filteredOportunidades.length}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-blue-500" />
          </div>
        </Card>
        <Card className="p-4 border-0 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Valor Total</p>
              <p className="text-2xl font-bold text-emerald-600">
                {formatCurrency(filteredOportunidades.reduce((sum, o) => sum + (o.valor_estimado || 0), 0))}
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-emerald-500" />
          </div>
        </Card>
        <Card className="p-4 border-0 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">
                Ganhos ({filteredOportunidades.filter(o => o.status === 'ganha').length})
              </p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(filteredOportunidades.filter(o => o.status === 'ganha').reduce((acc, o) => acc + (o.valor_estimado || 0), 0))}
              </p>
            </div>
            <Badge className="bg-green-100 text-green-700">✓</Badge>
          </div>
        </Card>
        <Card className="p-4 border-0 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">
                Perdidas ({filteredOportunidades.filter(o => o.status === 'perdida').length})
              </p>
              <p className="text-2xl font-bold text-red-600">
                {formatCurrency(filteredOportunidades.filter(o => o.status === 'perdida').reduce((acc, o) => acc + (o.valor_estimado || 0), 0))}
              </p>
            </div>
            <Badge className="bg-red-100 text-red-700">✗</Badge>
          </div>
        </Card>
      </div>

      {/* HU 01 e HU 03 - Kanban */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {etapasOrdenadas.map((etapa) => {
            const { quantidade, valor } = calcularIndicadores(etapa.id);
            const oportEtapa = filteredOportunidades.filter(o => o.etapa_id === etapa.id);

            return (
              <Droppable key={etapa.id} droppableId={etapa.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="flex-shrink-0 w-80"
                  >
                    <Card className={`border-0 shadow-sm ${snapshot.isDraggingOver ? 'ring-2 ring-blue-400' : ''}`}>
                      {/* Header da coluna */}
                      <div className="p-4 border-b" style={{ borderTopColor: etapa.cor, borderTopWidth: 4 }}>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-slate-900">{etapa.nome}</h3>
                          <Badge variant="secondary">{quantidade}</Badge>
                        </div>
                        <div className="text-sm text-slate-600">
                          {formatCurrency(valor)}
                        </div>
                      </div>

                      {/* Cards das oportunidades */}
                      <div className="p-2 space-y-2 min-h-[250px] max-h-[600px] overflow-y-auto">
                        {oportEtapa.map((oport, index) => (
                          <Draggable key={oport.id} draggableId={oport.id} index={index}>
                            {(provided, snapshot) => {
                              const isResponsavel = oport.vendedor_id === currentUser?.id;
                              const avatarUrl = getAvatarUrlForOportunidade(oport);
                              return (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`p-3 rounded-lg shadow-sm transition-shadow cursor-move ${
                                  snapshot.isDragging ? 'shadow-lg ring-2 ring-blue-400' : ''
                                } ${
                                  podeVerTodos && !isResponsavel
                                    ? 'bg-purple-200/40 border border-transparent'
                                    : 'bg-white border border-slate-200 hover:shadow-md'
                                }`}
                              >
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex-1">
                                    <h4 className="font-medium text-slate-900 text-sm">{oport.titulo}</h4>
                                  </div>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-6 w-6">
                                        <MoreHorizontal className="w-4 h-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                      <DropdownMenuItem onClick={() => {
                                        setSelectedOportunidade(oport);
                                        setFormData({
                                          titulo: oport.titulo,
                                          cliente_id: oport.cliente_id || '',
                                          valor_estimado: oport.valor_estimado?.toString() || '',
                                          etapa_id: oport.etapa_id,
                                          vendedor_id: oport.vendedor_id,
                                          origem: oport.origem || '',
                                          observacoes: oport.observacoes || '',
                                          data_fechamento_prevista: oport.data_fechamento_prevista || '',
                                          telefone_lead: oport.telefone_lead || '',
                                          data_cadastro_lead: oport.data_cadastro_lead || format(new Date(), 'yyyy-MM-dd')
                                        });
                                        setFormOpen(true);
                                      }}>
                                        <Pencil className="w-4 h-4 mr-2" />
                                        Editar
                                        </DropdownMenuItem>
                                        {podeAlterarResponsavel && (
                                        <DropdownMenuItem onClick={() => {
                                          setOportunidadeParaAlterar(oport);
                                          setNovoResponsavelId(oport.vendedor_id);
                                          setAlterarResponsavelOpen(true);
                                        }}>
                                          <UserCheck className="w-4 h-4 mr-2" />
                                          Alterar Responsável
                                        </DropdownMenuItem>
                                        )}
                                        {podeAlterarQuadro && (
                                        <>
                                          <DropdownMenuItem onClick={() => {
                                            setOportunidadeParaAlterar(oport);
                                            setNovaEtapaId(oport.etapa_id);
                                            setAlterarQuadroOpen(true);
                                          }}>
                                            <MoveHorizontal className="w-4 h-4 mr-2" />
                                            Alterar Quadro
                                          </DropdownMenuItem>
                                          <DropdownMenuItem 
                                            onClick={() => {
                                              if (confirm(`Tem certeza que deseja excluir a oportunidade "${oport.titulo}"?`)) {
                                                excluirOportunidadeMutation.mutate(oport.id);
                                              }
                                            }}
                                            className="text-red-600"
                                          >
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            Excluir Lead
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                      <DropdownMenuItem asChild>
                                        <Link to={createPageUrl(`OportunidadeDetalhes?id=${oport.id}`)}>
                                          <Eye className="w-4 h-4 mr-2" />
                                          Ver detalhes
                                        </Link>
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>

                                {oport.cliente_nome && (
                                  <p className="text-xs text-slate-600 mb-2">👤 {oport.cliente_nome}</p>
                                )}

                                {oport.telefone_lead && (
                                  <p className="text-xs text-slate-600 mb-2">📞 {oport.telefone_lead}</p>
                                )}

                                <div className="flex items-center justify-between text-xs mb-2">
                                  <span className="font-semibold text-emerald-600">
                                    {formatCurrency(oport.valor_estimado)}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6 hover:bg-blue-100"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOportunidadeComentarios(oport);
                                        setMostrarFormComentario(false);
                                        setComentariosOpen(true);
                                      }}
                                      title="Ver conversas"
                                    >
                                      <MessageCircle className="w-4 h-4 text-blue-600" />
                                    </Button>
                                    <div
                                      className="flex items-center gap-2"
                                      title={oport.vendedor_nome || 'Responsável'}
                                    >
                                      <Avatar className="h-6 w-6">
                                        <AvatarImage src={avatarUrl} alt={oport.vendedor_nome || 'Responsável'} />
                                        <AvatarFallback className="text-xs">
                                          {getInitials(oport.vendedor_nome || '') || 'RV'}
                                        </AvatarFallback>
                                      </Avatar>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-slate-100">
                                  <div className="flex items-center gap-1 text-orange-600 font-medium">
                                    ⏱️ Há {calcularTempoNaEtapa(oport.data_ultima_movimentacao)}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {oport.data_cadastro_lead && (
                                      <div className="flex items-center gap-1 text-slate-500">
                                        📅 {format(new Date(oport.data_cadastro_lead), 'dd/MM/yyyy')}
                                      </div>
                                    )}
                                    {oport.data_fechamento_prevista && (
                                      <div className="flex items-center gap-1 text-slate-500">
                                        <Calendar className="w-3 h-3" />
                                        {format(new Date(oport.data_fechamento_prevista), 'dd/MM/yyyy')}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                            }}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    </Card>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>

      {/* Form Modal */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedOportunidade ? 'Editar Oportunidade' : 'Nova Oportunidade'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="titulo">Título *</Label>
              <Input
                id="titulo"
                value={formData.titulo}
                onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                placeholder="Ex: Venda consórcio para João"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Cliente</Label>
                <Select
                  value={formData.cliente_id}
                  onValueChange={(value) => setFormData({ ...formData, cliente_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Nenhum</SelectItem>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="valor_estimado">Valor Estimado (R$)</Label>
                <Input
                  id="valor_estimado"
                  type="number"
                  step="0.01"
                  value={formData.valor_estimado}
                  onChange={(e) => setFormData({ ...formData, valor_estimado: e.target.value })}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Etapa *</Label>
                <Select
                  value={formData.etapa_id}
                  onValueChange={(value) => setFormData({ ...formData, etapa_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {etapasOrdenadas.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(isAdmin || isGerente) && (
                <div>
                  <Label>Vendedor</Label>
                  <Select
                    value={formData.vendedor_id}
                    onValueChange={(value) => setFormData({ ...formData, vendedor_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendedores.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="telefone_lead">Telefone do Lead</Label>
                <Input
                  id="telefone_lead"
                  value={formData.telefone_lead}
                  onChange={(e) => setFormData({ ...formData, telefone_lead: formatPhone(e.target.value) })}
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                />
              </div>

              <div>
                <Label htmlFor="data_cadastro_lead">Data de Cadastro do Lead</Label>
                <Input
                  id="data_cadastro_lead"
                  type="date"
                  value={formData.data_cadastro_lead}
                  onChange={(e) => setFormData({ ...formData, data_cadastro_lead: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="origem">Origem</Label>
                <Input
                  id="origem"
                  value={formData.origem}
                  onChange={(e) => setFormData({ ...formData, origem: e.target.value })}
                  placeholder="Ex: Indicação, Site, etc"
                />
              </div>

              <div>
                <Label htmlFor="data_fechamento_prevista">Previsão Fechamento</Label>
                <Input
                  id="data_fechamento_prevista"
                  type="date"
                  value={formData.data_fechamento_prevista}
                  onChange={(e) => setFormData({ ...formData, data_fechamento_prevista: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                placeholder="Informações adicionais..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={criarOportunidadeMutation.isPending || atualizarOportunidadeMutation.isPending}
                className="bg-[#1e3a5f] hover:bg-[#2a4a73]"
              >
                {selectedOportunidade ? 'Salvar' : 'Criar Oportunidade'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Alterar Responsável */}
      <Dialog open={alterarResponsavelOpen} onOpenChange={setAlterarResponsavelOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar Responsável</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm text-slate-600">Oportunidade</Label>
              <p className="font-semibold">{oportunidadeParaAlterar?.titulo}</p>
            </div>
            <div>
              <Label className="text-sm text-slate-600 mb-2 block">Responsável Atual</Label>
              <p className="text-sm mb-4">{oportunidadeParaAlterar?.vendedor_nome}</p>
            </div>
            <div>
              <Label>Novo Responsável *</Label>
              <Select value={novoResponsavelId} onValueChange={setNovoResponsavelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o vendedor" />
                </SelectTrigger>
                <SelectContent>
                  {loadingVendedores ? (
                    <SelectItem value={null} disabled>Carregando...</SelectItem>
                  ) : vendedores.length === 0 ? (
                    <SelectItem value={null} disabled>Nenhum vendedor disponível</SelectItem>
                  ) : (
                    vendedores
                      .filter(v => ['vendedor', 'gerente', 'admin', 'master'].includes(v.perfil) && v.status === 'ativo')
                      .map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.full_name}</SelectItem>
                      ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setAlterarResponsavelOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => {
                  if (!podeAlterarResponsavel) {
                    toast.error('Você não tem permissão para alterar o responsável');
                    return;
                  }
                  if (!novoResponsavelId) {
                    toast.error('Selecione um responsável');
                    return;
                  }
                  alterarResponsavelMutation.mutate({ 
                    oportunidadeId: oportunidadeParaAlterar.id, 
                    novoResponsavelId 
                  });
                }}
                disabled={alterarResponsavelMutation.isPending}
                className="bg-[#1e3a5f] hover:bg-[#2a4a73]"
              >
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Comentários/Conversas */}
      <Dialog open={comentariosOpen} onOpenChange={setComentariosOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>💬 Conversas - {oportunidadeComentarios?.titulo}</DialogTitle>
            <p className="text-sm text-slate-600">
              Cliente: {oportunidadeComentarios?.cliente_nome || oportunidadeComentarios?.telefone_lead || 'Sem cliente'}
            </p>
          </DialogHeader>

          {/* Lista de Comentários */}
          <div className="space-y-3 flex-1 overflow-y-auto pr-2">
            {comentarios.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Nenhuma conversa registrada ainda</p>
              </div>
            ) : (
              comentarios.map((comentario) => (
                <div key={comentario.id} className="bg-slate-50 p-3 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                          {getInitials(comentario.usuario_nome)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{comentario.usuario_nome}</p>
                        <p className="text-xs text-slate-500">
                          {format(new Date(comentario.created_date), 'dd/MM/yyyy HH:mm')}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {comentario.tipo === 'comentario' && '💬 Comentário'}
                      {comentario.tipo === 'ligacao' && '📞 Ligação'}
                      {comentario.tipo === 'reuniao' && '🤝 Reunião'}
                      {comentario.tipo === 'email' && '📧 Email'}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{comentario.mensagem}</p>
                </div>
              ))
            )}
          </div>

          {/* Form Novo Comentário */}
          <div className="border-t pt-4">
            {!mostrarFormComentario ? (
              <div className="flex justify-between items-center">
                <Button
                  variant="outline"
                  onClick={() => {
                    setComentariosOpen(false);
                    setNovoComentario('');
                    setTipoComentario('comentario');
                    setMostrarFormComentario(false);
                  }}
                >
                  Fechar
                </Button>
                <Button
                  onClick={() => setMostrarFormComentario(true)}
                  className="bg-[#23BE84] hover:bg-[#1da570] gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar Comentário
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label className="text-sm mb-2 block">Tipo de Interação</Label>
                  <Select value={tipoComentario} onValueChange={setTipoComentario}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comentario">💬 Comentário</SelectItem>
                      <SelectItem value="ligacao">📞 Ligação</SelectItem>
                      <SelectItem value="reuniao">🤝 Reunião</SelectItem>
                      <SelectItem value="email">📧 Email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-sm mb-2 block">Mensagem *</Label>
                  <Textarea
                    value={novoComentario}
                    onChange={(e) => setNovoComentario(e.target.value)}
                    placeholder="Digite sua mensagem ou anotação..."
                    rows={3}
                    className="resize-none"
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setMostrarFormComentario(false);
                      setNovoComentario('');
                      setTipoComentario('comentario');
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => {
                      criarComentarioMutation.mutate({
                        oportunidadeId: oportunidadeComentarios.id,
                        mensagem: novoComentario,
                        tipo: tipoComentario
                      });
                    }}
                    disabled={criarComentarioMutation.isPending || !novoComentario.trim()}
                    className="bg-[#23BE84] hover:bg-[#1da570]"
                  >
                    {criarComentarioMutation.isPending ? 'Enviando...' : 'Enviar'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Alterar Quadro */}
      <Dialog open={alterarQuadroOpen} onOpenChange={setAlterarQuadroOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar Quadro / Etapa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm text-slate-600">Oportunidade</Label>
              <p className="font-semibold">{oportunidadeParaAlterar?.titulo}</p>
            </div>
            <div>
              <Label className="text-sm text-slate-600 mb-2 block">Quadro Atual</Label>
              <p className="text-sm mb-4">{oportunidadeParaAlterar?.etapa_nome}</p>
            </div>
            <div>
              <Label>Novo Quadro *</Label>
              <Select value={novaEtapaId} onValueChange={setNovaEtapaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {etapasOrdenadas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: e.cor }}
                        />
                        {e.nome}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setAlterarQuadroOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => {
                  if (!novaEtapaId) {
                    toast.error('Selecione uma etapa');
                    return;
                  }
                  alterarQuadroMutation.mutate({ 
                    oportunidadeId: oportunidadeParaAlterar.id, 
                    novaEtapaId 
                  });
                }}
                disabled={alterarQuadroMutation.isPending}
                className="bg-[#1e3a5f] hover:bg-[#2a4a73]"
              >
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}