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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { Plus, MoreHorizontal, Pencil, Eye, DollarSign, Calendar, User, TrendingUp, Filter, UserCheck, MoveHorizontal, Trash2, MessageCircle, X, Search, Loader2, Settings2, Users, Globe, AlertTriangle, Clock, Flame, Target, Settings, ChevronDown, Zap, MessageSquare, Bell, PhoneCall, PhoneOff, Bot } from 'lucide-react';
import useSoftphone from '@/components/callcenter/useSoftphone';
import ChatFunilModal from '@/components/funil/ChatFunilModal';
import OportunidadeModal from '@/components/oportunidade/OportunidadeModal';
import PainelIAFunil from '@/components/funil/PainelIAFunil';
import { getProdutoConfig } from '@/components/funil/produtoConfig';
import CampanhasPlanejamentoBadge from '@/components/funil/CampanhasPlanejamentoBadge';
import CampanhasStatusModal from '@/components/funil/CampanhasStatusModal';
import AlertasPreFechamentoBell from '@/components/funil/AlertasPreFechamentoBell';
import ConfiguracaoAlertasPreFechamento from '@/components/funil/ConfiguracaoAlertasPreFechamento';
import FunilIndicadoresExecutivos from '@/components/funil/FunilIndicadoresExecutivos';
import FunilOrigemLeads from '@/components/funil/FunilOrigemLeads';
import FunilMotivosPerda from '@/components/funil/FunilMotivosPerda';
import { ModalAlterarResponsavel, ModalComentarios, ModalAlterarQuadro, ModalCriarFunil, ModalVenda } from '@/components/funil/FunilModais';
import VendedorSearchSelect from '@/components/funil/VendedorSearchSelect';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import ClienteSearchModal from '@/components/forms/ClienteSearchModal';

export default function FunilVendas() {
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedOportunidade, setSelectedOportunidade] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [filterVendedor, setFilterVendedor] = useState('todos');
  const [filterProduto, setFilterProduto] = useState('todos');
  const [filterVisao, setFilterVisao] = useState('todos'); // 'meus' | 'equipe' | 'todos' | 'sem_responsavel'
  const [filtroRapido, setFiltroRapido] = useState(null); // null | 'atrasados' | 'sem_resposta' | 'quentes'
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
  const [clienteSelecionado, setClienteSelecionado] = useState(null); // guarda o objeto completo do cliente
  const [criarFunilOpen, setCriarFunilOpen] = useState(false);
  const [novoFunil, setNovoFunil] = useState({ nome: '', cor: '#3b82f6' });
  const [searchCard, setSearchCard] = useState('');
  const [chatFunilOportunidade, setChatFunilOportunidade] = useState(null);
  const [oportunidadeModalId, setOportunidadeModalId] = useState(null);
  const [configAlertasOpen, setConfigAlertasOpen] = useState(false);
  const [abaSelecionada, setAbaSelecionada] = useState('funil'); // 'funil' | 'relatorio'
  const [painelIAOportunidade, setPainelIAOportunidade] = useState(null);

  // ── Softphone WebRTC (mesmo do BatePapo/CallCenter) ───────────────────────
  const { data: nvoipConfig } = useQuery({
    queryKey: ['nvoip-config-usuario', currentUser?.colaborador_id],
    enabled: !!currentUser?.colaborador_id,
    queryFn: async () => {
      const configs = await base44.entities.ConfiguracaoNvoipUsuario.filter({ colaborador_id: currentUser.colaborador_id });
      return configs.find(c => c.ativo) || null;
    },
  });
  const softphone = useSoftphone(nvoipConfig || null);

  const handleLigarFunil = async (e, telefone) => {
    e.stopPropagation();
    if (softphone.chamadaAtiva) {
      softphone.encerrarChamada();
    } else {
      await softphone.realizarChamada(telefone);
    }
  };

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
  const [funilDestino, setFunilDestino] = useState('');
  const [formData, setFormData] = useState({
    titulo: '',
    cliente_id: '',
    valor_estimado: '',
    etapa_id: '',
    produto: '',
    vendedor_id: '',
    origem: '',
    observacoes: '',
    data_fechamento_prevista: '',
    data_pre_fechamento: '',
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

      let userData = { ...user };
      let empresaIdFinal = user.empresa_id || '';
      
      // Tentar buscar empresa_id do colaborador
      if (user.role !== 'super_admin') {
        const colabs = await base44.entities.Colaborador.filter({ user_id: user.id });
        if (colabs && colabs.length > 0) {
          const colab = colabs.find(c => c.status === 'ativo' && c.empresa_id) 
            || colabs.find(c => c.empresa_id) 
            || colabs[0];
          userData = {
            ...user,
            colaborador_id: colab.id,
            empresa_id: colab.empresa_id || empresaIdFinal || '',
            perfil: colab.perfil || 'vendedor',
            full_name: colab.nome || user.full_name
          };
          empresaIdFinal = userData.empresa_id;
        }
      } else {
        userData.perfil = 'super_admin';
      }

      // Se ainda não tem empresa_id, buscar primeira empresa (para super_admin sem empresa_id preenchido)
      if (!empresaIdFinal) {
        try {
          const empresas = await base44.entities.Empresa.list(undefined, 1);
          if (empresas && empresas.length > 0) {
            empresaIdFinal = empresas[0].id;
            userData.empresa_id = empresaIdFinal;
          }
        } catch (e) {
          console.warn('Erro ao buscar primeira empresa:', e);
        }
      }

      userData.empresa_id = empresaIdFinal || '';
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
  const isVendedor = currentUser?.perfil === 'vendedor';
  const isColaborador = currentUser?.perfil === 'colaborador' || currentUser?.perfil === 'funcionario';
  const podeVerTodos = isAdmin || isGerente;
  const podeAlterarResponsavel = isAdmin || isGerente || isVendedor || isColaborador;
  const podeAlterarQuadro = isAdmin || isGerente;

  const { data: etapas = [], isLoading: loadingEtapas } = useQuery({
    queryKey: ['etapas-funil'],
    queryFn: () => base44.entities.EtapaFunil.list('ordem', 500),
  });

  const { data: oportunidades = [], isLoading: loadingOportunidades } = useQuery({
    queryKey: ['oportunidades', currentUser?.empresa_id],
    enabled: !!currentUser?.empresa_id,
    queryFn: async () => {
      if (!currentUser?.empresa_id) return [];
      return base44.entities.Oportunidade.filter(
        { empresa_id: currentUser.empresa_id },
        '-data_ultima_movimentacao',
        1000
      );
    },
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes-funil', currentUser?.empresa_id],
    enabled: !!currentUser?.empresa_id,
    queryFn: () => base44.entities.Cliente.filter({ status: 'ativo', empresa_id: currentUser.empresa_id }),
  });

  const { data: vendedores = [], isLoading: loadingVendedores } = useQuery({
    queryKey: ['vendedores', currentUser?.empresa_id],
    enabled: !!currentUser && (isAdmin || isGerente),
    queryFn: async () => {
      const filtro = { status: 'ativo' };
      if (currentUser?.empresa_id) filtro.empresa_id = currentUser.empresa_id;
      const colabs = await base44.entities.Colaborador.filter(filtro);
      return colabs.filter(c =>
        ['vendedor', 'gerente', 'admin', 'master', 'super_admin'].includes(c.perfil)
      );
    },
  });

  const FUNIS_META_CHAVE = 'funis_meta_v1';
  const { data: funisMeta = {} } = useQuery({
    queryKey: ['funis-meta'],
    enabled: !!currentUser,
    queryFn: async () => {
      const configs = await base44.entities.ConfiguracaoSistema.filter({ chave: FUNIS_META_CHAVE });
      if (configs.length > 0 && configs[0].valor) {
        try { return JSON.parse(configs[0].valor); } catch { return {}; }
      }
      return {};
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

      const empresaId = data.empresa_id || currentUser?.empresa_id || '';

      const oportunidade = await base44.entities.Oportunidade.create({
        ...data,
        empresa_id: empresaId,
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
      setSelectedOportunidade(null);
      resetForm();
      toast.success('Oportunidade criada!');
    },
    onError: (error) => {
      toast.error('Erro ao criar oportunidade: ' + (error.message || 'Erro desconhecido'));
    }
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
      // Vendedores/colaboradores só podem alterar responsáveis de suas próprias oportunidades
      const oportunidade = oportunidades.find(o => o.id === oportunidadeId);
      const isResponsavel = oportunidade?.vendedor_id === currentUser?.id || oportunidade?.vendedor_id === currentUser?.colaborador_id;
      if (!podeAlterarResponsavel && !isResponsavel) {
        throw new Error('Você não tem permissão para alterar o responsável.');
      }
      
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
    mutationFn: async ({ oportunidadeId, novaEtapaId, novoFunil }) => {
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
        status: etapaDestino?.tipo === 'ganho' ? 'ganha' : etapaDestino?.tipo === 'perdida' ? 'perdida' : 'aberta',
        ...(novoFunil ? { produto: novoFunil } : {}),
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
      setFunilDestino('');
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

  const criarFunilMutation = useMutation({
    mutationFn: async (data) => {
      const baseOrdem = (etapas?.length || 0) + 1;
      const empresaId = currentUser?.empresa_id || '';
      // Gerar slug do produto a partir do nome
      const produtoSlug = data.nome.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

      // Criar etapa principal do funil
      const etapaPrincipal = await base44.entities.EtapaFunil.create({
        nome: data.nome,
        cor: data.cor,
        status: 'ativa',
        ordem: baseOrdem,
        tipo: 'aberta',
        empresa_id: empresaId,
        produto: produtoSlug,
      });

      // Criar etapa "Planejamento de Compra" pré-fixada
      await base44.entities.EtapaFunil.create({
        nome: 'Planejamento de Compra',
        cor: '#8b5cf6',
        status: 'ativa',
        ordem: baseOrdem + 1,
        tipo: 'planejamento',
        empresa_id: empresaId,
        produto: produtoSlug,
      });

      return { etapaPrincipal, produtoSlug };
    },
    onSuccess: ({ produtoSlug }) => {
      queryClient.invalidateQueries({ queryKey: ['etapas-funil'] });
      queryClient.invalidateQueries({ queryKey: ['oportunidades'] });
      setCriarFunilOpen(false);
      setNovoFunil({ nome: '', cor: '#3b82f6' });
      setFilterProduto(produtoSlug);
      toast.success('Funil criado com sucesso! Agora você pode criar oportunidades nele.');
    },
    onError: (error) => {
      toast.error('Erro ao criar funil: ' + error.message);
    }
  });

  const inicializarEtapasPadraoMutation = useMutation({
    mutationFn: async () => {
      const empresaId = currentUser?.empresa_id || '';
      const etapasPadrao = [
        { nome: 'Novo Lead', cor: '#3b82f6', tipo: 'aberta', ordem: 1, produto: 'consorcio' },
        { nome: 'Em Contato', cor: '#f59e0b', tipo: 'aberta', ordem: 2, produto: 'consorcio' },
        { nome: 'Proposta Enviada', cor: '#8b5cf6', tipo: 'aberta', ordem: 3, produto: 'consorcio' },
        { nome: 'Qualificação', cor: '#6366f1', tipo: 'aberta', ordem: 4, produto: 'consorcio' },
        { nome: 'Simulação', cor: '#8b5cf6', tipo: 'aberta', ordem: 5, produto: 'consorcio' },
        { nome: 'Planejamento de Compra', cor: '#7c3aed', tipo: 'planejamento', ordem: 6, produto: 'consorcio' },
        { nome: 'Follow-up', cor: '#f59e0b', tipo: 'aberta', ordem: 7, produto: 'consorcio' },
        { nome: 'Ganho', cor: '#10b981', tipo: 'ganho', ordem: 8, produto: 'consorcio' },
        { nome: 'Perdido', cor: '#ef4444', tipo: 'perdida', ordem: 9, produto: 'consorcio' },
      ];
      for (const e of etapasPadrao) {
        await base44.entities.EtapaFunil.create({ ...e, empresa_id: empresaId, status: 'ativa' });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['etapas-funil'] });
      toast.success('Funil inicializado com etapas padrão!');
    },
    onError: (e) => toast.error('Erro: ' + e.message),
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

      // Se está sendo movido para etapa de planejamento E é consórcio, registrar data de entrada
      const entrandoNoPlanejamento = etapaDestino?.tipo === 'planejamento' && !oportunidade?.data_entrada_planejamento && oportunidade?.produto === 'consorcio';
      const saindoDoPlanejamento = oportunidade?.etapa_id && (() => {
        const etapaOrigem = etapas.find(e => e.id === oportunidade.etapa_id);
        return etapaOrigem?.tipo === 'planejamento' && etapaDestino?.tipo !== 'planejamento';
      })();

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
        ...(entrandoNoPlanejamento ? {
          data_entrada_planejamento: new Date().toISOString(),
          campanha_planejamento_ultima: 0,
        } : {}),
      });

      // Se estava em Pré-Fechamento e saiu, encerrar alertas ativos
      const etapaOrigemObj = etapas.find(e => e.id === oportunidade?.etapa_id);
      const eraPreFechamento = etapaOrigemObj?.nome?.toLowerCase().includes('pré-fechamento') ||
        etapaOrigemObj?.nome?.toLowerCase().includes('pre-fechamento') ||
        etapaOrigemObj?.nome?.toLowerCase().includes('pré fechamento') ||
        etapaOrigemObj?.nome?.toLowerCase().includes('pre fechamento');
      const continuaPreFechamento = etapaDestino?.nome?.toLowerCase().includes('pré-fechamento') ||
        etapaDestino?.nome?.toLowerCase().includes('pre-fechamento') ||
        etapaDestino?.nome?.toLowerCase().includes('pré fechamento') ||
        etapaDestino?.nome?.toLowerCase().includes('pre fechamento');
      if (eraPreFechamento && !continuaPreFechamento) {
        // Encerrar alertas ativos deste lead
        const alertasAtivos = await base44.entities.AlertePreFechamento.filter({
          oportunidade_id: oportunidadeId,
          status: 'ativo'
        });
        for (const alerta of alertasAtivos) {
          await base44.entities.AlertePreFechamento.update(alerta.id, { status: 'encerrado' });
        }
      }

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
    if (!result.destination) return;
    if (result.source.droppableId === result.destination.droppableId &&
        result.source.index === result.destination.index) return;

    const oportunidadeId = result.draggableId;
    const novaEtapaId = result.destination.droppableId;
    const oportunidade = oportunidades.find(o => o.id === oportunidadeId);
    const isResponsavelMovimentar = oportunidade?.vendedor_id === currentUser?.id || oportunidade?.vendedor_id === currentUser?.colaborador_id;
    const podeMovimentar = podeAlterarQuadro || isResponsavelMovimentar;

    if (!podeMovimentar) {
      toast.error('Você não tem permissão para mover esta oportunidade');
      return;
    }

    try {
      await moverOportunidadeMutation.mutateAsync({ oportunidadeId, novaEtapaId });
    } catch (error) {
      toast.error(`Erro: ${error.message}`);
      queryClient.invalidateQueries({ queryKey: ['oportunidades'] });
    }
  };

  const handleSubmit = async () => {
    if (!formData.titulo) {
      toast.error('Preencha o Título');
      return;
    }
    if (!formData.produto) {
      toast.error('Selecione o Funil');
      return;
    }
    if (!formData.etapa_id) {
      toast.error('Selecione a Etapa');
      return;
    }

    const cli = clienteSelecionado || (formData.cliente_id ? clientes.find(c => c.id === formData.cliente_id) : null);
    const vendedorIdFinal = formData.vendedor_id || currentUser?.id || '';
    const vendedor = vendedores.find(v => v.id === vendedorIdFinal);
    const etapa = etapas.find(e => e.id === formData.etapa_id);

    const produtoFinal = formData.produto;

    // Normalizar telefone: adicionar prefixo 55 se não tiver
    const normalizarTelefone = (tel) => {
      if (!tel) return '';
      const nums = tel.replace(/\D/g, '');
      if (!nums) return '';
      if (nums.startsWith('55') && nums.length >= 12) return nums;
      return '55' + nums;
    };

    const data = {
      ...formData,
      empresa_id: currentUser?.empresa_id || '',
      produto: produtoFinal,
      cliente_nome: cli?.nome_completo || cli?.pj_razao_social || formData.cliente_nome || '',
      cliente_telefone: cli?.celular || cli?.pj_celular || formData.cliente_telefone || '',
      vendedor_nome: vendedor?.razao_social || vendedor?.full_name || '',
      gerente_id: vendedor?.gerente_id || '',
      etapa_nome: etapa?.nome || '',
      valor_estimado: parseFloat(formData.valor_estimado) || 0,
      vendedor_id: vendedorIdFinal,
      telefone_lead: normalizarTelefone(formData.telefone_lead),
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
      produto: filterProduto !== 'todos' ? filterProduto : '',
      vendedor_id: currentUser?.id || '',
      origem: '',
      observacoes: '',
      data_fechamento_prevista: '',
      data_pre_fechamento: '',
      telefone_lead: '',
      data_cadastro_lead: format(new Date(), 'yyyy-MM-dd')
    });
    setClienteSelecionado(null);
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

  // Base de oportunidades visíveis para o usuário atual (respeita visão/perfil + filtro de responsável)
  const oportunidadesDoVendedor = !currentUser ? [] : oportunidades.filter(o => {
    // Primeiro filtro: quem pode ver
    let podeVer = false;
    if (!isAdmin && !isGerente) {
      podeVer = (
        o.vendedor_id === currentUser.id ||
        o.vendedor_id === currentUser.colaborador_id ||
        o.vendedor_id === currentUser.auth_id
      );
    } else if (filterVisao === 'meus') {
      podeVer = (
        o.vendedor_id === currentUser.id ||
        o.vendedor_id === currentUser.colaborador_id ||
        o.vendedor_id === currentUser.auth_id
      );
    } else if (filterVisao === 'sem_responsavel') {
      podeVer = !o.vendedor_id;
    } else {
      podeVer = true; // 'equipe' ou 'todos'
    }

    if (!podeVer) return false;

    // Segundo filtro: responsável específico (apenas admins/gerentes)
    if (podeVerTodos && filterVendedor !== 'todos') {
      return o.vendedor_id === filterVendedor;
    }

    return true;
  });

  // HU 05 - Indicadores
  const filteredOportunidades = (() => {
    const agora = new Date();
    const hoje = agora.toISOString().split('T')[0];
    const inicioSemana = new Date(agora);
    inicioSemana.setDate(agora.getDate() - agora.getDay());
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    
    const base = oportunidadesDoVendedor
      .filter((o) => {
        if (filterProduto === 'todos') return true;
        const produtoOport = o.produto || 'consorcio';
        return produtoOport === filterProduto;
      })
      .filter((o) => {
        if (!podeVerTodos) return true;
        if (!filterVendedor || filterVendedor === 'todos') return true;
        return o.vendedor_id === filterVendedor;
      })
      .filter((o) => {
        if (!searchCard.trim()) return true;
        const t = searchCard.toLowerCase();
        return (
          o.titulo?.toLowerCase().includes(t) ||
          o.cliente_nome?.toLowerCase().includes(t) ||
          o.telefone_lead?.toLowerCase().includes(t)
        );
      })
      .filter((o) => {
        if (!filtroRapido) return true;
        
        const dataMovimentacao = new Date(o.data_ultima_movimentacao || o.created_date || agora);
        const diffMs = agora - dataMovimentacao;
        const diffDias = diffMs / (1000 * 60 * 60 * 24);
        const dataOport = o.data_cadastro_lead ? new Date(o.data_cadastro_lead) : dataMovimentacao;
        
        if (filtroRapido === 'hoje') {
          return o.data_cadastro_lead && o.data_cadastro_lead === hoje;
        }
        if (filtroRapido === 'esta_semana') {
          return dataOport >= inicioSemana;
        }
        if (filtroRapido === 'este_mes') {
          return dataOport >= inicioMes && dataOport.getMonth() === agora.getMonth();
        }
        if (filtroRapido === 'atrasados') {
          return o.data_fechamento_prevista && o.data_fechamento_prevista < hoje && o.status === 'aberta';
        }
        if (filtroRapido === 'sem_resposta') {
          return diffDias >= 1 && o.status === 'aberta';
        }
        if (filtroRapido === 'sem_movimento_3') {
          return diffDias >= 3 && o.status === 'aberta';
        }
        if (filtroRapido === 'sem_movimento_7') {
          return diffDias >= 7 && o.status === 'aberta';
        }
        if (filtroRapido === 'sem_movimento_15') {
          return diffDias >= 15 && o.status === 'aberta';
        }
        if (filtroRapido === 'quentes') {
          return (o.valor_estimado || 0) > 50000 && o.status === 'aberta';
        }
        if (filtroRapido === 'ganhos') {
          return o.status === 'ganha';
        }
        if (filtroRapido === 'perdidos') {
          return o.status === 'perdida';
        }
        if (filtroRapido === 'em_negociacao') {
          return o.status === 'aberta';
        }
        if (filtroRapido === 'sem_responsavel') {
          return !o.vendedor_id;
        }
        return true;
      });

    return base;
  })();

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

  // Produtos únicos: das etapas (funis criados) + das oportunidades existentes
  // Se há etapas sem produto defininado mas têm nome de consórcio, assume que são consórcio
  const etapasComProduto = etapas.map(e => ({
    ...e,
    produto: e.produto || (e.nome && ['Novo Lead', 'Em Contato', 'Proposta Enviada', 'Qualificação', 'Simulação', 'Follow-up', 'Planejamento de Compra'].some(nome => e.nome.includes(nome)) ? 'consorcio' : null)
  }));

  const etapasOrdenadas = [...etapasComProduto].sort((a, b) => a.ordem - b.ordem);
  
  const produtosDasEtapas = [...new Set(etapasComProduto.map(e => e.produto).filter(Boolean))];
  const produtosDasOportunidades = [...new Set(oportunidades.map(o => o.produto).filter(Boolean))];
  const todosProdutos = [...new Set([...produtosDasEtapas, ...produtosDasOportunidades])];
  const todosOsFunis = [
    { value: 'consorcio', label: 'Consórcio' },
    { value: 'emprestimo', label: 'Empréstimo Consignado' },
    ...todosProdutos
      .filter(p => p !== 'consorcio' && p !== 'emprestimo')
      .map(p => ({ value: p, label: p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) })),
  ];

  const openNovaOportunidade = () => {
    setSelectedOportunidade(null);
    const produtoSelecionado = filterProduto !== 'todos' ? filterProduto : '';
    setFormData({
      titulo: '', cliente_id: '', valor_estimado: '', etapa_id: '',
      produto: produtoSelecionado, vendedor_id: currentUser?.id || '',
      origem: '', observacoes: '', data_fechamento_prevista: '',
      telefone_lead: '', data_cadastro_lead: format(new Date(), 'yyyy-MM-dd')
    });
    setClienteSelecionado(null);
    setIndicadorNome('');
    setIndicadorTelefone('');
    setFormOpen(true);
  };

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
          <Button
            onClick={() => inicializarEtapasPadraoMutation.mutate()}
            disabled={inicializarEtapasPadraoMutation.isPending}
            className="bg-purple-600 hover:bg-purple-700 gap-2"
          >
            {inicializarEtapasPadraoMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Criar Funil Padrão (com Planejamento)
          </Button>
          <Link to={createPageUrl('ConfiguracaoFunil')}>
            <Button variant="outline">Configurar Manualmente</Button>
          </Link>
        </PageHeader>
      </div>
    );
  }

  // Métricas computadas
  const totalAtivos = filteredOportunidades.filter(o => o.status === 'aberta').length;
  const totalGanhos = filteredOportunidades.filter(o => o.status === 'ganha').length;
  const agora2 = new Date();
  const totalAtrasados = filteredOportunidades.filter(o =>
    o.data_fechamento_prevista && o.data_fechamento_prevista < agora2.toISOString().split('T')[0] && o.status === 'aberta'
  ).length;
  const totalSemResposta = filteredOportunidades.filter(o => {
    const diffMs = agora2 - new Date(o.data_ultima_movimentacao || o.created_date || agora2);
    return diffMs / (1000 * 60 * 60) >= 24 && o.status === 'aberta';
  }).length;
  // Usar o tipo da ETAPA (não o status da oportunidade) para garantir consistência com as colunas do Kanban
  const getTipoEtapa = (etapaId) => etapasComProduto.find(e => e.id === etapaId)?.tipo || 'aberta';
  const valorNegociacao = filteredOportunidades
    .filter(o => { const t = getTipoEtapa(o.etapa_id); return t !== 'ganho' && t !== 'perdida'; })
    .reduce((s, o) => s + (o.valor_estimado || 0), 0);
  const valorGanhos = filteredOportunidades
    .filter(o => getTipoEtapa(o.etapa_id) === 'ganho')
    .reduce((s, o) => s + (o.valor_estimado || 0), 0);
  const valorPerdidos = filteredOportunidades
    .filter(o => getTipoEtapa(o.etapa_id) === 'perdida')
    .reduce((s, o) => s + (o.valor_estimado || 0), 0);

  return (
    <div className="space-y-4 pb-24">
      {/* ── HEADER ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Funil de Vendas</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            <span className="font-semibold text-slate-700">{filteredOportunidades.length}</span> oportunidades
            {totalGanhos > 0 && <> · <span className="text-green-600 font-semibold">{totalGanhos} ganhos</span></>}
            {totalAtrasados > 0 && <> · <span className="text-red-600 font-semibold">{totalAtrasados} atrasados</span></>}
            {totalSemResposta > 0 && <> · <span className="text-orange-600 font-semibold">{totalSemResposta} sem resposta</span></>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Buscar lead..." value={searchCard} onChange={(e) => setSearchCard(e.target.value)} className="pl-9 w-48 h-9" />
            {searchCard && <button onClick={() => setSearchCard('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
          </div>
          <AlertasPreFechamentoBell
            empresaId={currentUser?.empresa_id}
            userId={currentUser?.id}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 h-9"><Settings className="w-4 h-4" /> Configurar</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setCriarFunilOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> Novo Funil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(createPageUrl('ConfiguracaoFunis'))}>
                <Settings className="w-4 h-4 mr-2" /> Configurar Etapas
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(createPageUrl('AutomacaoFunis'))}>
                <Zap className="w-4 h-4 mr-2" /> Automação de Funis
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setConfigAlertasOpen(true)}>
                <Target className="w-4 h-4 mr-2" /> Alertas Pré-Fechamento
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── LINHA 1: VISÃO ── */}
      {(isAdmin || isGerente) && (
        <div className="flex items-center gap-2 flex-wrap">
           {[
             { key: 'meus', label: '👤 Meus Leads', count: oportunidades.filter(o => o.vendedor_id === currentUser?.id && o.status === 'aberta').length },
             { key: 'equipe', label: '👥 Equipe', count: oportunidades.filter(o => o.status === 'aberta').length },
             { key: 'todos', label: '🌎 Todos', count: oportunidades.length },
             { key: 'sem_responsavel', label: '⚠️ Sem Responsável', count: oportunidades.filter(o => !o.vendedor_id).length },
           ].map(v => (
             <button key={v.key} onClick={() => setFilterVisao(v.key)}
               className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${filterVisao === v.key ? 'bg-[#1e3a5f] text-white border-[#1e3a5f] shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
               {v.label}
               {v.count > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${filterVisao === v.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>{v.count}</span>}
             </button>
           ))}
           <div className="ml-auto">
             <Select value={filterVendedor} onValueChange={setFilterVendedor} disabled={!podeVerTodos}>
               <SelectTrigger className="h-8 text-xs w-44 border-slate-200">
                 <User className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                 <SelectValue placeholder="Responsável" />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="todos">Todos os responsáveis</SelectItem>
                 {vendedores.map((v) => {
                   const countVendedor = oportunidades.filter(o => {
                     const produtoOport = o.produto || (etapasComProduto.find(e => e.id === o.etapa_id)?.produto) || 'consorcio';
                     return o.vendedor_id === v.id && o.status === 'aberta' && (filterProduto === 'todos' || produtoOport === filterProduto);
                   }).length;
                   return <SelectItem key={v.id} value={v.id}>{v.nome || v.razao_social || v.full_name} <span className="text-slate-400 ml-2">({countVendedor})</span></SelectItem>;
                 })}
               </SelectContent>
             </Select>
           </div>
         </div>
       )}

      {/* ── LINHA 2: FUNIS (cards) ── */}
      <div className="flex gap-3 flex-wrap items-center">
        <button onClick={() => setFilterProduto('todos')}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${filterProduto === 'todos' ? 'bg-[#1e3a5f] text-white border-[#1e3a5f] shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-[#1e3a5f] hover:text-[#1e3a5f]'}`}>
          <Globe className="w-4 h-4" /> <span>Todos</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${filterProduto === 'todos' ? 'bg-white/20' : 'bg-slate-100'}`}>{oportunidadesDoVendedor.filter(o => o.status === 'aberta').length}</span>

        </button>
        {todosOsFunis.map(funil => {
          const funiEmojis = { consorcio: '🏦', emprestimo: '💳' };
          const emoji = funiEmojis[funil.value] || '🗂️';
          const iconUrl = funisMeta[funil.value]?.iconUrl;
          const nomeExibicao = funisMeta[funil.value]?.nome || funil.label;
          const count = oportunidadesDoVendedor.filter(o => {
            const produtoOport = o.produto || (etapasComProduto.find(e => e.id === o.etapa_id)?.produto) || 'consorcio';
            return produtoOport === funil.value && o.status === 'aberta';
          }).length;
          const isActive = filterProduto === funil.value;
          return (
            <button key={funil.value} onClick={() => setFilterProduto(funil.value)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${isActive ? 'bg-[#1e3a5f] text-white border-[#1e3a5f] shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-[#1e3a5f] hover:text-[#1e3a5f]'}`}>
              {iconUrl ? (
                <img src={iconUrl} alt={nomeExibicao} className="w-5 h-5 rounded object-cover flex-shrink-0" />
              ) : (
                <span>{emoji}</span>
              )}
              <span>{nomeExibicao}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${isActive ? 'bg-white/20' : 'bg-slate-100'}`}>{count}</span>
            </button>
          );
        })}

      </div>

      {/* ── FILTROS RÁPIDOS ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Filtro rápido:</span>
        {[
          { key: null, label: 'Todos', urgent: false },
          { key: 'hoje', label: '📅 Hoje', urgent: false },
          { key: 'esta_semana', label: '📆 Esta Semana', urgent: false },
          { key: 'este_mes', label: '📅 Este Mês', urgent: false },
          { key: 'atrasados', label: `⏰ Atrasados${totalAtrasados > 0 ? ` (${totalAtrasados})` : ''}`, urgent: totalAtrasados > 0 },
          { key: 'sem_resposta', label: `🔕 Sem Resposta${totalSemResposta > 0 ? ` (${totalSemResposta})` : ''}`, urgent: totalSemResposta > 0 },
          { key: 'sem_movimento_3', label: '😴 3+ dias', urgent: false },
          { key: 'sem_movimento_7', label: '😴 7+ dias', urgent: true },
          { key: 'sem_movimento_15', label: '😴 15+ dias', urgent: true },
          { key: 'quentes', label: '🔥 Quentes (+50k)', urgent: false },
          { key: 'ganhos', label: '✅ Ganhos', urgent: false },
          { key: 'perdidos', label: '❌ Perdidos', urgent: false },
          { key: 'em_negociacao', label: '💼 Em Negociação', urgent: false },
          { key: 'sem_responsavel', label: '⚠️ Sem Resp.', urgent: true },
        ].map(f => (
          <button key={String(f.key)} onClick={() => setFiltroRapido(f.key)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
              filtroRapido === f.key
                ? f.urgent ? 'bg-red-600 text-white border-red-600' : 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                : f.urgent ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}>{f.label}</button>
        ))}
      </div>

      {/* ── ABAS: FUNIL vs RELATÓRIO ── */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setAbaSelecionada('funil')}
          className={`px-4 py-2.5 font-medium text-sm border-b-2 transition-colors ${
            abaSelecionada === 'funil'
              ? 'border-[#1e3a5f] text-[#1e3a5f]'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          📊 Funil
        </button>
        <button
          onClick={() => setAbaSelecionada('relatorio')}
          className={`px-4 py-2.5 font-medium text-sm border-b-2 transition-colors ${
            abaSelecionada === 'relatorio'
              ? 'border-[#1e3a5f] text-[#1e3a5f]'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          📈 Relatório
        </button>
      </div>

      {/* ── ABA FUNIL ── */}
      {abaSelecionada === 'funil' && (
        <>
          {/* ── BARRA DE MÉTRICAS (mantida para compatibilidade) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3 border-l-4 border-l-blue-500 border-t-0 border-r-0 border-b-0 shadow-sm bg-blue-50/50">
          <p className="text-xs text-blue-600 font-medium">💰 Em negociação</p>
          <p className="text-xl font-bold text-blue-700">{formatCurrency(valorNegociacao)}</p>
        </Card>
        <Card className="p-3 border-l-4 border-l-green-500 border-t-0 border-r-0 border-b-0 shadow-sm bg-green-50/50">
          <p className="text-xs text-green-600 font-medium">✅ Ganhos</p>
          <p className="text-xl font-bold text-green-700">{formatCurrency(valorGanhos)}</p>
        </Card>
        <Card className="p-3 border-l-4 border-l-red-500 border-t-0 border-r-0 border-b-0 shadow-sm bg-red-50/50">
          <p className="text-xs text-red-600 font-medium">❌ Perdidos</p>
          <p className="text-xl font-bold text-red-700">{formatCurrency(valorPerdidos)}</p>
        </Card>
        <Card className="p-3 border-l-4 border-l-orange-500 border-t-0 border-r-0 border-b-0 shadow-sm bg-orange-50/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-orange-600 font-medium">⏰ Atrasados</p>
              <p className="text-xl font-bold text-orange-700">{totalAtrasados}</p>
            </div>
            {totalAtrasados > 0 && <button onClick={() => setFiltroRapido(filtroRapido === 'atrasados' ? null : 'atrasados')} className="text-xs text-orange-600 underline">ver</button>}
          </div>
        </Card>
      </div>

      {/* HU 01 e HU 03 - Kanban */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {etapasOrdenadas
          .filter(etapa => filterProduto === 'todos' || etapa.produto === filterProduto)
          .map((etapa) => {
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
                      {/* Header da coluna melhorado */}
                      <div className="p-3 border-b" style={{ borderTopColor: etapa.cor, borderTopWidth: 4 }}>
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-semibold text-slate-900 text-sm">{etapa.nome}</h3>
                          <Badge variant="secondary" className="text-xs">{quantidade}</Badge>
                        </div>
                        <div className="text-sm font-bold text-emerald-700">{formatCurrency(valor)}</div>
                        {filterProduto === 'todos' && (() => {
                          const dist = {};
                          oportEtapa.forEach(o => { const p = o.produto || 'consorcio'; dist[p] = (dist[p] || 0) + 1; });
                          const entries = Object.entries(dist);
                          if (entries.length <= 1) return null;
                          return (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {entries.slice(0, 3).map(([prod, cnt]) => {
                                const cfg = getProdutoConfig(prod);
                                return <span key={prod} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.text}`}>{cfg.emoji} {cfg.label} ({cnt})</span>;
                              })}
                            </div>
                          );
                        })()}
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

                             const etapaAtual = etapas.find(e => e.id === oport.etapa_id);
                             const isVendaFechada = etapaAtual?.tipo === 'ganho';

                             // Detectar Pré-Fechamento
                             const isPreFechamento = etapaAtual?.nome?.toLowerCase().includes('pré-fechamento') ||
                               etapaAtual?.nome?.toLowerCase().includes('pre-fechamento') ||
                               etapaAtual?.nome?.toLowerCase().includes('pré fechamento') ||
                               etapaAtual?.nome?.toLowerCase().includes('pre fechamento');
                             const hoje = new Date().toISOString().split('T')[0];
                             const preFechamentoAtivo = isPreFechamento && oport.data_pre_fechamento && oport.data_pre_fechamento <= hoje;
                             const diasAtrasoPreFech = preFechamentoAtivo
                               ? Math.floor((new Date(hoje) - new Date(oport.data_pre_fechamento)) / (1000 * 60 * 60 * 24))
                               : 0;

                             // Calcular se está sem resposta (>24h sem movimentação)
                             const diffHorasSemResposta = (new Date() - new Date(oport.data_ultima_movimentacao || oport.created_date || new Date())) / (1000 * 60 * 60);
                             const semResposta = diffHorasSemResposta >= 24 && oport.status === 'aberta';

                             // Prioridade visual
                             let cardClasses = 'bg-white border border-slate-200 hover:shadow-md';
                             let prioridadeLabel = null;

                             if (oport.status === 'ganha' || isVendaFechada) {
                               cardClasses = 'bg-green-50 border-2 border-green-500';
                               prioridadeLabel = <span className="text-xs font-bold text-green-600">🟢 Ganho</span>;
                             } else if (oport.status === 'perdida') {
                               cardClasses = 'bg-red-50 border-2 border-red-500';
                               prioridadeLabel = <span className="text-xs font-bold text-red-600">🔴 Perdido</span>;
                             } else if (preFechamentoAtivo) {
                               cardClasses = 'bg-purple-50 border-2 border-purple-500 shadow-[0_0_14px_rgba(168,85,247,0.3)]';
                               prioridadeLabel = (
                                 <span className="text-xs font-bold text-purple-700 flex items-center gap-1">
                                   🎯 Pré-Fechamento{diasAtrasoPreFech > 0 ? ` · ${diasAtrasoPreFech}d atraso` : ' · Hoje!'}
                                 </span>
                               );
                             } else if (dataAtrasada) {
                               cardClasses = 'bg-orange-50 border-2 border-orange-400 shadow-[0_0_12px_rgba(251,146,60,0.25)]';
                               prioridadeLabel = <span className="text-xs font-bold text-orange-600">🔴 Urgente</span>;
                             } else if (semResposta) {
                               cardClasses = 'bg-yellow-50 border border-yellow-300';
                               prioridadeLabel = <span className="text-xs font-bold text-yellow-700">🟡 Sem resposta</span>;
                             } else if (podeVerTodos && !isResponsavel) {
                               cardClasses = 'bg-slate-50 border border-slate-200';
                             }

                             const prodCfg = getProdutoConfig(oport.produto);
                             return (
                             <div
                               ref={provided.innerRef}
                               {...provided.draggableProps}
                               {...provided.dragHandleProps}
                               className={`rounded-lg shadow-sm transition-all cursor-move overflow-hidden ${
                                 snapshot.isDragging ? 'shadow-lg ring-2 ring-blue-400' : ''
                               } ${cardClasses}`}
                               onDoubleClick={() => setOportunidadeModalId(oport.id)}
                             >
                                {/* Barra colorida do produto */}
                                <div className="h-1.5 w-full" style={{ backgroundColor: prodCfg.barra }} />
                                <div className="p-3">
                                {/* Badge do produto */}
                                <div className="mb-2">
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${prodCfg.bg} ${prodCfg.text}`}>
                                    {prodCfg.emoji} {prodCfg.label}
                                  </span>
                                </div>
                                {prioridadeLabel && <div className="mb-1.5">{prioridadeLabel}</div>}
                                {preFechamentoAtivo && (
                                  <div className="mb-2 p-2 bg-purple-100 rounded-lg border border-purple-300 text-xs text-purple-800">
                                    <p className="font-semibold">⚡ Atenção: este lead está pronto para fechar!</p>
                                    <p className="mt-0.5 text-purple-600">
                                      Data Pré-Fechamento: {oport.data_pre_fechamento?.split('-').reverse().join('/')}
                                    </p>
                                  </div>
                                )}
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
                                          produto: oport.produto || '',
                                          vendedor_id: oport.vendedor_id,
                                          origem: oport.origem || '',
                                          observacoes: oport.observacoes || '',
                                          data_fechamento_prevista: oport.data_fechamento_prevista || '',
                                          data_pre_fechamento: oport.data_pre_fechamento || '',
                                          telefone_lead: oport.telefone_lead || oport.cliente_telefone || '',
                                          data_cadastro_lead: oport.data_cadastro_lead || format(new Date(), 'yyyy-MM-dd')
                                         });
                                         // Carregar cliente selecionado para exibição correta
                                         if (oport.cliente_id) {
                                           const cliExistente = clientes.find(c => c.id === oport.cliente_id);
                                           setClienteSelecionado(cliExistente || null);
                                         } else {
                                           setClienteSelecionado(null);
                                         }
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
                                     {(podeAlterarResponsavel || isResponsavel) && (
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
                                         Adicionar Responsáveis
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
                                  <p className="text-xs text-slate-600 mb-1">👤 {oport.cliente_nome}</p>
                                )}

                                {(oport.telefone_lead || oport.cliente_telefone) && (
                                  <p className="text-xs text-slate-900 font-semibold mb-3">📱 {oport.telefone_lead || oport.cliente_telefone}</p>
                                )}

                                {/* Badge campanhas planejamento */}
                                {etapaAtual?.tipo === 'planejamento' && (
                                  <div className="mb-2">
                                    <p className="text-[9px] text-slate-400 uppercase font-semibold mb-1">Jornada 60 dias</p>
                                    <div className="flex items-center gap-2">
                                      <CampanhasPlanejamentoBadge
                                        ultimaCampanha={oport.campanha_planejamento_ultima || 0}
                                        dataEntrada={oport.data_entrada_planejamento}
                                        compact={true}
                                      />
                                      <CampanhasStatusModal
                                        oportunidade={oport}
                                        ultimaCampanha={oport.campanha_planejamento_ultima || 0}
                                        dataEntrada={oport.data_entrada_planejamento}
                                      />
                                    </div>
                                  </div>
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
                                      title="Notas internas"
                                    >
                                      <MessageCircle className="w-4 h-4 text-blue-600" />
                                    </Button>
                                    {(oport.telefone_lead || oport.cliente_telefone) && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6 hover:bg-green-100"
                                        onClick={(e) => { e.stopPropagation(); setChatFunilOportunidade(oport); }}
                                        title="WhatsApp"
                                      >
                                        <MessageSquare className="w-4 h-4 text-green-600" />
                                      </Button>
                                    )}
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6 hover:bg-purple-100"
                                      onClick={(e) => { e.stopPropagation(); setPainelIAOportunidade(oport); }}
                                      title="Análise IA"
                                    >
                                      <Bot className="w-4 h-4 text-purple-600" />
                                    </Button>
                                    {(oport.telefone_lead || oport.cliente_telefone) && nvoipConfig?.ativo && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className={`h-6 w-6 ${softphone.chamadaAtiva?.destino === (oport.telefone_lead || oport.cliente_telefone)?.replace(/\D/g,'') ? 'hover:bg-red-100 animate-pulse' : 'hover:bg-teal-100'}`}
                                        onClick={(e) => handleLigarFunil(e, oport.telefone_lead || oport.cliente_telefone)}
                                        title={softphone.chamadaAtiva ? 'Encerrar chamada' : 'Ligar via WebRTC (NVOIP)'}
                                        disabled={!softphone.chamadaAtiva && softphone.sipStatus !== 'registrado'}
                                      >
                                        {softphone.chamadaAtiva?.destino === (oport.telefone_lead || oport.cliente_telefone)?.replace(/\D/g,'').replace(/^55/,'')
                                          ? <PhoneOff className="w-4 h-4 text-red-600" />
                                          : <PhoneCall className="w-4 h-4 text-teal-600" />
                                        }
                                      </Button>
                                    )}
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
                                    {oport.data_fechamento_prevista && (
                                      <div className="flex items-center gap-1 text-slate-500">
                                        <Calendar className="w-3 h-3" />
                                        {oport.data_fechamento_prevista.split('-').reverse().join('/')}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                </div>{/* fim p-3 */}
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
        </>
      )}

      {/* ── ABA RELATÓRIO ── */}
      {abaSelecionada === 'relatorio' && (
        <>
          {/* ── NOVA BARRA DE INDICADORES EXECUTIVOS ── */}
          <FunilIndicadoresExecutivos
            oportunidades={filteredOportunidades}
            etapas={etapasOrdenadas}
            vendedores={vendedores}
            filterProduto={filterProduto}
          />

          {/* ── PAINEL DE ORIGEM DOS LEADS ── */}
          <FunilOrigemLeads oportunidades={oportunidadesDoVendedor} />

          {/* ── PAINEL DE MOTIVOS DE PERDA ── */}
          <FunilMotivosPerda oportunidades={oportunidadesDoVendedor} />
        </>
      )}

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
                    clienteSelecionado?.nome_completo || clienteSelecionado?.pj_razao_social || 'Cliente selecionado'
                  ) : (
                    <span className="text-slate-500">Buscar cliente...</span>
                  )}
                </Button>
                {formData.cliente_id && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setFormData({ ...formData, cliente_id: '', cliente_nome: '', cliente_telefone: '' }); setClienteSelecionado(null); }}
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
                <Label>Funil *</Label>
                <Select
                  value={formData.produto || ''}
                  onValueChange={(value) => setFormData({ ...formData, produto: value, etapa_id: '' })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o funil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consorcio">🏦 Consórcio</SelectItem>
                    <SelectItem value="emprestimo">💳 Empréstimo Consignado</SelectItem>
                    {todosOsFunis
                      .filter(f => f.value !== 'consorcio' && f.value !== 'emprestimo')
                      .map(f => (
                        <SelectItem key={f.value} value={f.value}>🗂️ {f.label}</SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Etapa * {!formData.produto && <span className="text-red-600">(Selecione funil primeiro)</span>}</Label>
                <Select
                  value={formData.etapa_id}
                  onValueChange={(value) => setFormData({ ...formData, etapa_id: value })}
                  disabled={!formData.produto}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {etapasOrdenadas
                      .filter((e) => !formData.produto || e.produto === formData.produto)
                      .map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(isAdmin || isGerente) && (
              <div>
                <Label>Vendedor</Label>
                <VendedorSearchSelect
                  vendedores={vendedores}
                  value={formData.vendedor_id}
                  onChange={(value) => setFormData({ ...formData, vendedor_id: value })}
                />
              </div>
            )}

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

      {/* Modais extraídos */}
      <ModalAlterarResponsavel
        open={alterarResponsavelOpen}
        onOpenChange={setAlterarResponsavelOpen}
        oportunidade={oportunidadeParaAlterar}
        vendedores={vendedores}
        loadingVendedores={loadingVendedores}
        responsaveisSelecionados={responsaveisSelecionados}
        setResponsaveisSelecionados={setResponsaveisSelecionados}
        podeAlterarResponsavel={podeAlterarResponsavel}
        onConfirmar={() => {
          if (!podeAlterarResponsavel) { toast.error('Sem permissão'); return; }
          if (responsaveisSelecionados.length === 0) { toast.error('Selecione ao menos um responsável'); return; }
          alterarResponsavelMutation.mutate({ oportunidadeId: oportunidadeParaAlterar.id, responsaveisIds: responsaveisSelecionados });
        }}
        isPending={alterarResponsavelMutation.isPending}
      />

      <ModalComentarios
        open={comentariosOpen}
        onOpenChange={setComentariosOpen}
        oportunidade={oportunidadeComentarios}
        comentarios={comentarios}
        novoComentario={novoComentario}
        setNovoComentario={setNovoComentario}
        tipoComentario={tipoComentario}
        setTipoComentario={setTipoComentario}
        mostrarFormComentario={mostrarFormComentario}
        setMostrarFormComentario={setMostrarFormComentario}
        onEnviar={() => criarComentarioMutation.mutate({ oportunidadeId: oportunidadeComentarios.id, mensagem: novoComentario, tipo: tipoComentario })}
        isPending={criarComentarioMutation.isPending}
      />

      <ModalAlterarQuadro
        open={alterarQuadroOpen}
        onOpenChange={setAlterarQuadroOpen}
        oportunidade={oportunidadeParaAlterar}
        etapasOrdenadas={etapasOrdenadas}
        todosOsFunis={todosOsFunis}
        novaEtapaId={novaEtapaId}
        setNovaEtapaId={setNovaEtapaId}
        funilDestino={funilDestino}
        setFunilDestino={setFunilDestino}
        onConfirmar={() => {
          if (!novaEtapaId) { toast.error('Selecione uma etapa'); return; }
          alterarQuadroMutation.mutate({ oportunidadeId: oportunidadeParaAlterar.id, novaEtapaId, novoFunil: funilDestino && funilDestino !== 'todos' ? funilDestino : undefined });
        }}
        isPending={alterarQuadroMutation.isPending}
      />

      <ClienteSearchModal
        open={clienteSearchOpen}
        onOpenChange={setClienteSearchOpen}
        onSelectCliente={(cliente) => {
          const telefoneCliente = cliente.celular || cliente.pj_celular || '';
          setClienteSelecionado(cliente);
          setFormData({ ...formData, cliente_id: cliente.id, cliente_nome: cliente.nome_completo || cliente.pj_razao_social || '', cliente_telefone: telefoneCliente, telefone_lead: telefoneCliente });
          setClienteSearchOpen(false);
        }}
        currentUser={currentUser}
        empresaIdSelecionada={currentUser?.empresa_id}
      />

      <ModalCriarFunil
        open={criarFunilOpen}
        onOpenChange={setCriarFunilOpen}
        novoFunil={novoFunil}
        setNovoFunil={setNovoFunil}
        onCriar={() => { if (!novoFunil.nome.trim()) { toast.error('Digite um nome'); return; } criarFunilMutation.mutate(novoFunil); }}
        isPending={criarFunilMutation.isPending}
      />

      <ModalVenda
        open={vendaFormOpen}
        onOpenChange={setVendaFormOpen}
        oportunidade={oportunidadeParaVenda}
        currentUser={currentUser}
        onSuccess={() => { setVendaFormOpen(false); setOportunidadeParaVenda(null); }}
      />

      {/* Chat Funil Modal */}
      {chatFunilOportunidade && (
        <ChatFunilModal
          open={!!chatFunilOportunidade}
          onOpenChange={(v) => { if (!v) setChatFunilOportunidade(null); }}
          oportunidade={chatFunilOportunidade}
          currentUser={currentUser}
          etapas={etapasOrdenadas}
          vendedores={vendedores}
          onOportunidadeChanged={() => queryClient.invalidateQueries({ queryKey: ['oportunidades'] })}
        />
      )}

      <ConfiguracaoAlertasPreFechamento
        open={configAlertasOpen}
        onOpenChange={setConfigAlertasOpen}
      />

      {/* Modal de detalhes da oportunidade (duplo clique) */}
      <OportunidadeModal
        open={!!oportunidadeModalId}
        onOpenChange={(v) => { if (!v) setOportunidadeModalId(null); }}
        oportunidadeId={oportunidadeModalId}
        currentUser={currentUser}
        onUpdate={() => queryClient.invalidateQueries({ queryKey: ['oportunidades'] })}
      />

      {/* Painel IA */}
      {painelIAOportunidade && (
        <PainelIAFunil
          oportunidade={painelIAOportunidade}
          onClose={() => setPainelIAOportunidade(null)}
          formatCurrency={formatCurrency}
          calcularTempoNaEtapa={calcularTempoNaEtapa}
        />
      )}

      {/* FAB - Nova Oportunidade */}
      <button
        onClick={openNovaOportunidade}
        className={`fixed bottom-8 right-8 z-50 flex items-center gap-2 bg-[#1e3a5f] hover:bg-[#2a4a73] text-white px-5 py-3.5 rounded-full shadow-2xl transition-all hover:scale-105 font-semibold text-sm ${!!oportunidadeModalId || !!painelIAOportunidade ? 'hidden' : ''}`}
      >
        <Plus className="w-5 h-5" />
        Nova Oportunidade
      </button>
      </div>
      );
      }