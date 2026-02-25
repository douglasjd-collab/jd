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
import { Plus, MoreHorizontal, Pencil, Eye, DollarSign, Calendar, User, TrendingUp, Filter, UserCheck, MoveHorizontal, Trash2, MessageCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import VendaForm from '@/components/forms/VendaForm';
import ClienteSearchModal from '@/components/forms/ClienteSearchModal';

export default function FunilVendas() {
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedOportunidade, setSelectedOportunidade] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [filterVendedor, setFilterVendedor] = useState('todos');
  const [filterProduto, setFilterProduto] = useState('consorcio');
  const [alterarResponsavelOpen, setAlterarResponsavelOpen] = useState(false);
  const [comentariosOpen, setComentariosOpen] = useState(false);
  const [oportunidadeComentarios, setOportunidadeComentarios] = useState(null);
  const [novoComentario, setNovoComentario] = useState('');
  const [tipoComentario, setTipoComentario] = useState('comentario');
  const [mostrarFormComentario, setMostrarFormComentario] = useState(false);
  const [vendaFormOpen, setVendaFormOpen] = useState(false);
  const [oportunidadeParaVenda, setOportunidadeParaVenda] = useState(null);
  const [indicadorNome, setIndicadorNome] = useState('');
  const [indicadorTelefone, setIndicadorTelefone] = useState('');
  const [clienteSearchOpen, setClienteSearchOpen] = useState(false);

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
  const [responsaveisSelecionados, setResponsaveisSelecionados] = useState([]);
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
    try {
      const user = await base44.auth.me();
      
      if (!user) {
        console.error('Usuário não autenticado');
        return;
      }

      // Para super admin, buscar Colaborador para obter empresa_id
      let userData = { ...user };
      
      if (user.role !== 'super_admin') {
        const colabs = await base44.entities.Colaborador.filter(
          { user_id: user.id, status: 'ativo' }
        );
        
        if (colabs && colabs.length > 0) {
          const colab = colabs[0];
          userData = {
            ...user,
            colaborador_id: colab.id,
            empresa_id: colab.empresa_id,
            perfil: colab.perfil,
            full_name: colab.nome || user.full_name
          };
        } else {
          console.warn('Usuário sem Colaborador vinculado:', user.email);
          userData = {
            ...user,
            colaborador_id: null,
            empresa_id: null,
            perfil: 'vendedor',
            full_name: user.full_name
          };
        }
      } else {
        userData.perfil = 'super_admin';
      }

      setCurrentUser(userData);
      setFormData((prev) => ({
        ...prev,
        vendedor_id: prev.vendedor_id || userData?.id || '',
      }));
    } catch (error) {
      console.error('Erro ao carregar usuário:', error);
      toast.error('Erro ao carregar dados do usuário');
    }
  };

  const isAdmin = currentUser?.perfil === 'master' || currentUser?.perfil === 'super_admin' || currentUser?.perfil === 'admin';
  const isGerente = currentUser?.perfil === 'gerente';
  const podeVerTodos = isAdmin || isGerente;
  const podeAlterarResponsavel = isAdmin || isGerente;
  const podeAlterarQuadro = isAdmin || isGerente;

  const { data: etapas = [], isLoading: loadingEtapas } = useQuery({
    queryKey: ['etapas-funil'],
    queryFn: () => base44.entities.EtapaFunil.filter({ status: 'ativa' }),
  });

  const { data: oportunidades = [], isLoading: loadingOportunidades } = useQuery({
    queryKey: ['oportunidades', filterProduto],
    queryFn: () => {
      if (filterProduto === 'emprestimo') {
        return base44.entities.Oportunidade.filter({ produto: 'emprestimo' }, '-data_ultima_movimentacao');
      }
      return base44.entities.Oportunidade.filter({ produto: 'consorcio' }, '-data_ultima_movimentacao');
    },
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => base44.entities.Cliente.filter({ status: 'ativo' }),
  });

  const { data: vendedores = [], isLoading: loadingVendedores } = useQuery({
    queryKey: ['vendedores'],
    enabled: !!currentUser && (isAdmin || isGerente),
    queryFn: async () => {
      const colabs = await base44.entities.Colaborador.filter({ status: 'ativo' });
      return colabs.filter(c => ['vendedor', 'gerente', 'admin', 'master', 'super_admin'].includes(c.perfil));
    },
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
    mutationFn: ({ id, data }) => {
      const oportunidade = oportunidades.find(o => o.id === id);
      return base44.entities.Oportunidade.update(id, {
        ...data,
        empresa_id: oportunidade?.empresa_id || currentUser?.empresa_id
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['oportunidades'] });
      setFormOpen(false);
      setSelectedOportunidade(null);
      resetForm();
      toast.success('Oportunidade atualizada!');
    },
  });

  const alterarResponsavelMutation = useMutation({
    mutationFn: async ({ oportunidadeId, responsaveisIds }) => {
      if (!podeAlterarResponsavel) {
        throw new Error('Você não tem permissão para alterar o responsável.');
      }
      const oportunidade = oportunidades.find(o => o.id === oportunidadeId);
      
      // Obter dados dos responsáveis selecionados
      const responsaveisData = responsaveisIds.map(id => {
        const user = vendedores.find(v => v.id === id);
        return {
          id,
          nome: user?.razao_social || user?.full_name || '',
          foto: user?.foto_perfil || ''
        };
      });

      const responsavelPrincipal = responsaveisData[0];
      
      await base44.entities.Oportunidade.update(oportunidadeId, {
        empresa_id: oportunidade.empresa_id || currentUser?.empresa_id,
        titulo: oportunidade.titulo,
        etapa_id: oportunidade.etapa_id,
        vendedor_id: responsavelPrincipal.id,
        vendedor_nome: responsavelPrincipal.nome,
        foto_perfil_responsavel: responsavelPrincipal.foto,
        responsaveis_ids: JSON.stringify(responsaveisIds),
        responsaveis_nomes: JSON.stringify(responsaveisData.map(r => r.nome)),
        responsaveis_fotos: JSON.stringify(responsaveisData.map(r => r.foto)),
        data_ultima_movimentacao: new Date().toISOString()
      });

      // Auditoria
      await base44.entities.LogAuditoria.create({
        usuario_id: currentUser.id,
        usuario_nome: currentUser.full_name,
        acao: `Alterou responsáveis da oportunidade "${oportunidade?.titulo}" para: ${responsaveisData.map(r => r.nome).join(', ')}`,
        entidade: 'Oportunidade',
        entidade_id: oportunidadeId,
        tipo: 'edicao'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['oportunidades'] });
      setAlterarResponsavelOpen(false);
      setOportunidadeParaAlterar(null);
      setResponsaveisSelecionados([]);
      toast.success('Responsáveis atualizados!');
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
        empresa_id: oportunidade.empresa_id || currentUser?.empresa_id,
        titulo: oportunidade.titulo,
        vendedor_id: oportunidade.vendedor_id,
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
      const oportunidadeAtual = oportunidades.find(o => o.id === oportunidadeId);
      await base44.entities.Oportunidade.update(oportunidadeId, {
        empresa_id: oportunidadeAtual.empresa_id || currentUser?.empresa_id,
        titulo: oportunidadeAtual.titulo,
        etapa_id: oportunidadeAtual.etapa_id,
        vendedor_id: oportunidadeAtual.vendedor_id,
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
    mutationFn: async ({ oportunidadeId, novaEtapaId, updates = {} }) => {
      const user = await base44.auth.me();
      const oportunidade = oportunidades.find(o => o.id === oportunidadeId);
      const etapaDestino = etapas.find(e => e.id === novaEtapaId);

      // ✅ empresa_id com fallback REAL (prioriza o que já existe na oportunidade)
      const empresaId =
        updates.empresa_id ||
        oportunidade?.empresa_id ||
        currentUserFull?.empresa_id ||
        currentUser?.empresa_id ||
        user?.empresa_id ||
        user?.empresa?.id;

      if (!empresaId) {
        throw new Error("empresa_id não encontrado. Verifique se o usuário e a oportunidade estão vinculados a uma empresa.");
      }

      // HU 04 - avisos
      if (etapaDestino?.requer_cliente && !oportunidade?.cliente_id) {
        toast.warning('Atenção: Esta etapa requer cliente vinculado');
      }

      // ✅ UPDATE sempre com empresa_id + campos essenciais
      await base44.entities.Oportunidade.update(oportunidadeId, {
        ...updates,
        empresa_id: empresaId,
        etapa_id: novaEtapaId,
        etapa_nome: etapaDestino?.nome || '',
        titulo: oportunidade?.titulo || '',
        vendedor_id: oportunidade?.vendedor_id || '',
        data_ultima_movimentacao: new Date().toISOString(),
        status:
          etapaDestino?.tipo === 'ganho'
            ? 'ganha'
            : etapaDestino?.tipo === 'perdida'
            ? 'perdida'
            : 'aberta',
      });

      // histórico
      await base44.entities.MovimentacaoFunil.create({
        oportunidade_id: oportunidadeId,
        etapa_origem_id: oportunidade?.etapa_id,
        etapa_origem_nome: oportunidade?.etapa_nome || '',
        etapa_destino_id: novaEtapaId,
        etapa_destino_nome: etapaDestino?.nome || '',
        usuario_id: user.id,
        usuario_nome: user.full_name
      });

      // integração com vendas
      if (etapaDestino?.tipo === 'ganho' && !oportunidade?.venda_id) {
        return { oportunidadeId, novaEtapaId, etapaDestino, abrirFormVenda: true, oportunidade };
      }

      // auditoria
      await base44.entities.LogAuditoria.create({
        usuario_id: user.id,
        usuario_nome: user.full_name,
        acao: `Moveu oportunidade "${oportunidade?.titulo}" de "${oportunidade?.etapa_nome}" para "${etapaDestino?.nome}"`,
        entidade: 'Oportunidade',
        entidade_id: oportunidadeId,
        tipo: 'edicao'
      });

      return { oportunidadeId, novaEtapaId, etapaDestino, abrirFormVenda: false };
    },

    onSuccess: (data) => {
      if (data?.abrirFormVenda && data?.oportunidade) {
        setOportunidadeParaVenda(data.oportunidade);
        setVendaFormOpen(true);
        toast.success('Oportunidade movida para "Ganho". Registre a venda agora!');
      }
    },

    onMutate: async ({ oportunidadeId, novaEtapaId }) => {
      await queryClient.cancelQueries({ queryKey: ['oportunidades'] });
      const previousOportunidades = queryClient.getQueryData(['oportunidades']);

      queryClient.setQueryData(['oportunidades'], (old) => {
        if (!old || !Array.isArray(old)) return old;
        const etapaDestino = etapas.find(e => e.id === novaEtapaId);

        return old.map(o => {
          if (o.id !== oportunidadeId) return o;
          return {
            ...o,
            etapa_id: novaEtapaId,
            etapa_nome: etapaDestino?.nome || '',
            data_ultima_movimentacao: new Date().toISOString(),
            status:
              etapaDestino?.tipo === 'ganho'
                ? 'ganha'
                : etapaDestino?.tipo === 'perdida'
                ? 'perdida'
                : 'aberta'
          };
        });
      });

      return { previousOportunidades };
    },

    onError: (error, variables, context) => {
      if (context?.previousOportunidades) {
        queryClient.setQueryData(['oportunidades'], context.previousOportunidades);
      }
      toast.error(error.message || 'Erro ao mover oportunidade');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['oportunidades'] });
    }
  });

  const handleDragEnd = async (result) => {
    console.log('🎯 handleDragEnd iniciado:', result);
    
    if (!result.destination) {
      console.log('❌ Sem destino - cancelando');
      return;
    }
    
    // Não fazer nada se soltar no mesmo lugar
    if (result.source.droppableId === result.destination.droppableId && 
        result.source.index === result.destination.index) {
      console.log('⚠️ Mesma posição - cancelando');
      return;
    }

    const oportunidadeId = result.draggableId;
    const novaEtapaId = result.destination.droppableId;
    const oportunidade = oportunidades.find(o => o.id === oportunidadeId);
    
    console.log('📋 Dados do drag:', {
      oportunidadeId,
      novaEtapaId,
      oportunidade: oportunidade?.titulo,
      currentUser: currentUser?.full_name
    });
    
    // Verificar permissões: usuários superiores ou responsável pela oportunidade podem mover
    const podeMovimentar = podeAlterarQuadro || oportunidade?.vendedor_id === currentUser?.id;
    
    console.log('🔐 Permissões:', {
      podeAlterarQuadro,
      isResponsavel: oportunidade?.vendedor_id === currentUser?.id,
      podeMovimentar
    });
    
    if (!podeMovimentar) {
      console.log('❌ SEM PERMISSÃO');
      toast.error('Você não tem permissão para mover esta oportunidade');
      return;
    }

    try {
      console.log('🚀 Iniciando mutation...');
      const result = await moverOportunidadeMutation.mutateAsync({ oportunidadeId, novaEtapaId });
      console.log('✅ Mutation concluída:', result);
    } catch (error) {
      console.error('❌ ERRO na mutation:', error);
      console.error('Detalhes:', {
        message: error.message,
        stack: error.stack,
        response: error.response
      });
      toast.error(`Erro: ${error.message}`);
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
      empresa_id: currentUser?.empresa_id || '',
      cliente_nome: cliente?.nome_completo || cliente?.pj_razao_social || '',
      cliente_telefone: cliente?.celular || cliente?.pj_celular || '',
      vendedor_nome: vendedor?.razao_social || vendedor?.full_name || '',
      gerente_id: vendedor?.gerente_id || '',
      etapa_nome: etapa?.nome || '',
      valor_estimado: parseFloat(formData.valor_estimado) || 0,
      vendedor_id: vendedorIdFinal,
      observacoes: formData.origem === 'Indicação' && (indicadorNome || indicadorTelefone)
        ? `${formData.observacoes ? formData.observacoes + '\n\n' : ''}👤 Indicado por: ${indicadorNome || 'N/A'}\n📞 Telefone: ${indicadorTelefone || 'N/A'}`
        : formData.observacoes
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
    setIndicadorNome('');
    setIndicadorTelefone('');
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

  if (loadingEtapas || loadingOportunidades || !currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1e3a5f] mx-auto mb-4"></div>
          <p className="text-slate-600">Carregando funil...</p>
        </div>
      </div>
    );
  }

  if (etapas.length === 0) {
    return (
      <div className="p-8">
        <PageHeader
          title="Funil de Vendas"
          subtitle="Configure as etapas do funil primeiro"
        >
          <Link to={createPageUrl('ConfiguracaoFunil')}>
            <Button>Configurar Etapas</Button>
          </Link>
        </PageHeader>
      </div>
    );
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
                  <SelectItem key={v.id} value={v.id}>{v.razao_social || v.full_name}</SelectItem>
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

                             // Verificar se a data de fechamento chegou ou passou
                             const dataAtrasada = oport.data_fechamento_prevista && 
                               format(new Date(oport.data_fechamento_prevista), 'yyyy-MM-dd') <= format(new Date(), 'yyyy-MM-dd');

                             // Definir cores baseadas no status
                             let cardClasses = 'bg-white border border-slate-200 hover:shadow-md';

                             // Verificar se a etapa é "venda fechada" ou tipo "ganho"
                             const etapaAtual = etapas.find(e => e.id === oport.etapa_id);
                             const isVendaFechada = etapaAtual?.nome?.toLowerCase().includes('venda fechada') || 
                                                    etapaAtual?.nome?.toLowerCase().includes('fechada') ||
                                                    etapaAtual?.tipo === 'ganho';

                             if (oport.status === 'ganha' || isVendaFechada) {
                               cardClasses = 'bg-green-50 border-2 border-green-600';
                             } else if (oport.status === 'perdida') {
                               cardClasses = 'bg-red-50 border-2 border-red-600';
                             } else if (dataAtrasada) {
                               cardClasses = 'bg-orange-50 border-2 border-orange-400 shadow-[0_0_15px_rgba(251,146,60,0.3)]';
                             } else if (podeVerTodos && !isResponsavel) {
                               cardClasses = 'bg-purple-200/40 border border-transparent';
                             }

                             return (
                             <div
                               ref={provided.innerRef}
                               {...provided.draggableProps}
                               {...provided.dragHandleProps}
                               className={`p-3 rounded-lg shadow-sm transition-all cursor-move ${
                                 snapshot.isDragging ? 'shadow-lg ring-2 ring-blue-400' : ''
                               } ${cardClasses}`}
                               onDoubleClick={() => navigate(createPageUrl(`OportunidadeDetalhes?id=${oport.id}`))}
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
                                     {(isResponsavel || podeAlterarQuadro) && (
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
                                         // Extrair dados do indicador se existir
                                         const obsMatch = oport.observacoes?.match(/👤 Indicado por: (.+)\n📞 Telefone: (.+)/);
                                         if (obsMatch) {
                                           setIndicadorNome(obsMatch[1] === 'N/A' ? '' : obsMatch[1]);
                                           setIndicadorTelefone(obsMatch[2] === 'N/A' ? '' : obsMatch[2]);
                                         }
                                         setFormOpen(true);
                                       }}>
                                         <Pencil className="w-4 h-4 mr-2" />
                                         Editar
                                       </DropdownMenuItem>
                                     )}
                                     {podeAlterarResponsavel && (
                                       <DropdownMenuItem onClick={() => {
                                         setOportunidadeParaAlterar(oport);
                                         // Carregar responsáveis atuais
                                         try {
                                           const idsAtuais = oport.responsaveis_ids ? JSON.parse(oport.responsaveis_ids) : [oport.vendedor_id];
                                           setResponsaveisSelecionados(idsAtuais);
                                         } catch {
                                           setResponsaveisSelecionados([oport.vendedor_id]);
                                         }
                                         setAlterarResponsavelOpen(true);
                                       }}>
                                         <UserCheck className="w-4 h-4 mr-2" />
                                         Alterar Responsáveis
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
                                   {formatCurrency(oport.valor_estimado || 0)}
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
                                    <div className="flex items-center -space-x-2">
                                      {(() => {
                                        try {
                                          const responsaveisIds = oport.responsaveis_ids ? JSON.parse(oport.responsaveis_ids) : [oport.vendedor_id];
                                          const responsaveisFotos = oport.responsaveis_fotos ? JSON.parse(oport.responsaveis_fotos) : [avatarUrl];
                                          const responsaveisNomes = oport.responsaveis_nomes ? JSON.parse(oport.responsaveis_nomes) : [oport.vendedor_nome];

                                          return responsaveisIds.slice(0, 3).map((id, idx) => (
                                            <Avatar key={id} className="h-6 w-6 border-2 border-white" title={responsaveisNomes[idx] || 'Responsável'}>
                                              <AvatarImage src={responsaveisFotos[idx]} alt={responsaveisNomes[idx]} />
                                              <AvatarFallback className="text-xs">
                                                {getInitials(responsaveisNomes[idx] || '') || 'RV'}
                                              </AvatarFallback>
                                            </Avatar>
                                          ));
                                        } catch {
                                          return (
                                            <Avatar className="h-6 w-6">
                                              <AvatarImage src={avatarUrl} alt={oport.vendedor_nome || 'Responsável'} />
                                              <AvatarFallback className="text-xs">
                                                {getInitials(oport.vendedor_nome || '') || 'RV'}
                                              </AvatarFallback>
                                            </Avatar>
                                          );
                                        }
                                      })()}
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
                                        {oport.data_fechamento_prevista.split('-').reverse().join('/')}
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                  onClick={() => setClienteSearchOpen(true)}
                >
                  {formData.cliente_id ? (
                    (() => {
                      const cliente = clientes.find(c => c.id === formData.cliente_id);
                      return cliente?.nome_completo || cliente?.pj_razao_social || 'Cliente selecionado';
                    })()
                  ) : (
                    <span className="text-slate-500">Buscar cliente...</span>
                  )}
                </Button>
                {formData.cliente_id && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFormData({ ...formData, cliente_id: '' })}
                    className="mt-1 w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    Remover Cliente
                  </Button>
                )}
              </div>

              <div>
                <Label htmlFor="valor_estimado">Valor Estimado (R$)</Label>
                <Input
                  id="valor_estimado"
                  type="text"
                  value={formData.valor_estimado ? parseFloat(formData.valor_estimado).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                  onChange={(e) => {
                    const numeros = e.target.value.replace(/\D/g, '');
                    const valorNumerico = parseFloat(numeros) / 100;
                    setFormData({ ...formData, valor_estimado: valorNumerico > 0 ? valorNumerico.toString() : '' });
                  }}
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
                    <SelectContent className="max-h-[200px]">
                      {vendedores.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.nome || v.razao_social || v.full_name}</SelectItem>
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
                <Select
                  value={formData.origem}
                  onValueChange={(value) => {
                    setFormData({ ...formData, origem: value });
                    if (value !== 'Indicação') {
                      setIndicadorNome('');
                      setIndicadorTelefone('');
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a origem" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Trafego Pago">Tráfego Pago</SelectItem>
                    <SelectItem value="Facebook">Facebook</SelectItem>
                    <SelectItem value="Instagram">Instagram</SelectItem>
                    <SelectItem value="Indicação">Indicação</SelectItem>
                    <SelectItem value="Já é Cliente">Já é Cliente</SelectItem>
                    <SelectItem value="Visita">Visita</SelectItem>
                  </SelectContent>
                </Select>
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

            {formData.origem === 'Indicação' && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div>
                  <Label htmlFor="indicador_nome">Nome do Indicador</Label>
                  <Input
                    id="indicador_nome"
                    value={indicadorNome}
                    onChange={(e) => setIndicadorNome(e.target.value)}
                    placeholder="Nome completo"
                  />
                </div>
                <div>
                  <Label htmlFor="indicador_telefone">Telefone do Indicador</Label>
                  <Input
                    id="indicador_telefone"
                    value={indicadorTelefone}
                    onChange={(e) => setIndicadorTelefone(formatPhone(e.target.value))}
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                  />
                </div>
              </div>
            )}

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
            <DialogTitle>Gerenciar Responsáveis</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm text-slate-600">Oportunidade</Label>
              <p className="font-semibold">{oportunidadeParaAlterar?.titulo}</p>
            </div>

            <div>
              <Label className="text-sm mb-2 block">Responsáveis da Oportunidade *</Label>
              <p className="text-xs text-slate-500 mb-2">Selecione um ou mais responsáveis. O primeiro será o principal.</p>

              <div className="space-y-2 max-h-[300px] overflow-y-auto border rounded-lg p-2">
                {loadingVendedores ? (
                  <p className="text-sm text-slate-500 p-2">Carregando...</p>
                ) : vendedores.length === 0 ? (
                  <p className="text-sm text-slate-500 p-2">Nenhum vendedor disponível</p>
                ) : (
                  vendedores
                    .filter(v => ['vendedor', 'gerente', 'admin', 'master'].includes(v.perfil) && v.status === 'ativo')
                    .map((v) => (
                      <div 
                        key={v.id} 
                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                          responsaveisSelecionados.includes(v.id) 
                            ? 'bg-blue-100 border border-blue-300' 
                            : 'hover:bg-slate-50 border border-transparent'
                        }`}
                        onClick={() => {
                          setResponsaveisSelecionados(prev => {
                            if (prev.includes(v.id)) {
                              return prev.filter(id => id !== v.id);
                            } else {
                              return [...prev, v.id];
                            }
                          });
                        }}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={v.foto_perfil} alt={v.full_name} />
                          <AvatarFallback className="text-xs">
                            {getInitials(v.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{v.razao_social || v.full_name}</p>
                          <p className="text-xs text-slate-500 capitalize">{v.perfil}</p>
                        </div>
                        {responsaveisSelecionados.includes(v.id) && (
                          <div className="flex items-center gap-1">
                            {responsaveisSelecionados[0] === v.id && (
                              <Badge variant="outline" className="text-xs">Principal</Badge>
                            )}
                            <div className="h-5 w-5 bg-blue-600 rounded-full flex items-center justify-center">
                              <span className="text-white text-xs">✓</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                )}
              </div>
            </div>

            {responsaveisSelecionados.length > 0 && (
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-xs text-blue-700 mb-1">
                  {responsaveisSelecionados.length} responsável(is) selecionado(s)
                </p>
                <p className="text-xs text-blue-600">
                  Principal: {vendedores.find(v => v.id === responsaveisSelecionados[0])?.razao_social || vendedores.find(v => v.id === responsaveisSelecionados[0])?.full_name}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setAlterarResponsavelOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => {
                  if (!podeAlterarResponsavel) {
                    toast.error('Você não tem permissão para alterar responsáveis');
                    return;
                  }
                  if (responsaveisSelecionados.length === 0) {
                    toast.error('Selecione pelo menos um responsável');
                    return;
                  }
                  alterarResponsavelMutation.mutate({ 
                    oportunidadeId: oportunidadeParaAlterar.id, 
                    responsaveisIds: responsaveisSelecionados 
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

      {/* Modal de Busca de Cliente */}
      <ClienteSearchModal
        open={clienteSearchOpen}
        onOpenChange={setClienteSearchOpen}
        onSelectCliente={(cliente) => {
          setFormData({ ...formData, cliente_id: cliente.id });
          setClienteSearchOpen(false);
        }}
        currentUser={currentUser}
        empresaIdSelecionada={currentUser?.empresa_id}
      />

      {/* Dialog Criar Venda */}
      <Dialog open={vendaFormOpen} onOpenChange={setVendaFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Registrar Venda - {oportunidadeParaVenda?.titulo}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setVendaFormOpen(false);
                  setOportunidadeParaVenda(null);
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>

          <VendaForm
            open={vendaFormOpen}
            onOpenChange={setVendaFormOpen}
            venda={null}
            oportunidade={oportunidadeParaVenda}
            currentUser={currentUser}
            onSubmit={async (data) => {
              try {
                // Criar venda via mutation da página Vendas
                const response = await base44.entities.Venda.create(data);
                
                // Vincular venda à oportunidade
                await base44.entities.Oportunidade.update(oportunidadeParaVenda.id, {
                  venda_id: response.id,
                  empresa_id: oportunidadeParaVenda.empresa_id || currentUser?.empresa_id
                });
                
                toast.success('Venda registrada com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['oportunidades'] });
                setVendaFormOpen(false);
                setOportunidadeParaVenda(null);
              } catch (error) {
                toast.error('Erro ao registrar venda: ' + error.message);
              }
            }}
            isLoading={false}
          />
        </DialogContent>
      </Dialog>
      </div>
      );
      }