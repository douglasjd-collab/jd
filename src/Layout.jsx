import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { base44 } from '@/api/base44Client';
import {
        LayoutDashboard,
        Users,
        UserCircle,
        Building2,
        FileSpreadsheet,
        ShoppingCart,
        Upload,
        FileText,
        Settings,
        LogOut,
        Menu,
        X,
        ChevronDown,
        Wallet,
        Image as ImageIcon,
        TrendingUp,
        Camera,
        Calculator,
        Calendar,
        MessageSquare,
        Moon,
        Sun,
        Loader2,
        CheckSquare,
        Plug,
        Send,
        Zap,
        Edit3,
        Shield,
        Car,
        Phone
      } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import LogoUploader from '@/components/ui/LogoUploader';
import EditarPerfilModal from '@/components/ui/EditarPerfilModal';
import EditarNomeEmpresaModal from '@/components/ui/EditarNomeEmpresaModal';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import AntiTranslateGuard from '@/components/AntiTranslateGuard';
import { Toaster, toast } from 'sonner';
import VendaForm from '@/components/forms/VendaForm';

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState({});
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoUploaderOpen, setLogoUploaderOpen] = useState(false);
  const [editarPerfilOpen, setEditarPerfilOpen] = useState(false);
  const [editarNomeEmpresaOpen, setEditarNomeEmpresaOpen] = useState(false);
  const [novaVendaConsorcioOpen, setNovaVendaConsorcioOpen] = useState(false);
  const [tarefasVencidas, setTarefasVencidas] = useState(0);
  const [tarefasNovas, setTarefasNovas] = useState(0);
  const [comissoesPendentes, setComissoesPendentes] = useState(0);
  const [comissoesConsorcioPendentes, setComissoesConsorcioPendentes] = useState(0);
  const [mensagensNaoLidas, setMensagensNaoLidas] = useState(0);
  const [agendaAgendados, setAgendaAgendados] = useState(0);
  const [agendaAtrasados, setAgendaAtrasados] = useState(0);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(!darkMode);

  useEffect(() => {
    loadUser();
    loadLogo();
  }, []);

  useEffect(() => {
    if (!user) return;
    // Buscar comissões pendentes (vendedores com comissão do banco recebida mas não paga ao vendedor)
    const isAdminPerfil = ['master', 'super_admin', 'admin'].includes(user.perfil);
    if (isAdminPerfil) {
      const filtroBase = user.empresa_id ? { empresa_id: user.empresa_id } : {};
      base44.entities.Proposta.filter(filtroBase, null, 3000).then(propostas => {
        const comPendencia = propostas.filter(p =>
          p.produto !== 'consorcio' && p.produto !== 'financiamento' &&
          p.comissao_banco_recebida === true &&
          !p.comissao_vendedor_paga
        );
        // Contar vendedores únicos com pendência
        const vendedoresUnicos = new Set(comPendencia.map(p => p.vendedor_id || 'sem-vendedor'));
        setComissoesPendentes(vendedoresUnicos.size);
      }).catch(() => {});

      // Consórcio: ComissaoAPagar pendentes com grupo/cota
      const filtroConsorcio = user.empresa_id ? { empresa_id: user.empresa_id } : {};
      base44.entities.ComissaoAPagar.filter(filtroConsorcio, null, 2000).then(comissoes => {
        const pendentesConsorcio = comissoes.filter(c =>
          c.grupo && c.cota &&
          ['a_pagar', 'a_apagar', 'pendente'].includes(c.status_pagamento)
        );
        const vendedoresUnicos = new Set(pendentesConsorcio.map(c => c.vendedor_id || 'sem-vendedor'));
        setComissoesConsorcioPendentes(vendedoresUnicos.size);
      }).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const filtroEmpresa = user.empresa_id ? { empresa_id: user.empresa_id } : {};
    if (user.empresa_id) {
      base44.entities.MensagemWhatsapp.filter({ ...filtroEmpresa, remetente: 'cliente' }, '-data_envio', 500)
        .then(msgs => {
          const naoLidas = msgs.filter(m => m.status !== 'lida').length;
          setMensagensNaoLidas(naoLidas);
        }).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const agora = new Date().toISOString();
    const filtroAgenda = user.empresa_id ? { empresa_id: user.empresa_id } : {};
    base44.entities.Agenda.filter(filtroAgenda, null, 500).then(items => {
      const agendados = items.filter(a => a.status === 'agendado' || a.status === 'confirmado').length;
      const atrasados = items.filter(a =>
        (a.status === 'agendado' || a.status === 'confirmado') && a.inicio && a.inicio < agora
      ).length;
      setAgendaAgendados(agendados);
      setAgendaAtrasados(atrasados);
    }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const hoje = new Date().toLocaleDateString('fr-CA'); // YYYY-MM-DD local
    const filtro = user.empresa_id ? { empresa_id: user.empresa_id } : {};
    const isAdminPerfil = ['master', 'super_admin', 'admin'].includes(user.perfil);
    base44.entities.Tarefa.filter(filtro, '-created_date', 500).then(tarefas => {
      const vencidas = tarefas.filter(t => {
        if (!t.data_conclusao_prevista || t.data_conclusao_prevista >= hoje) return false;
        if (t.status === 'concluido' || t.status === 'arquivado') return false;
        if (isAdminPerfil) return true;
        let responsaveisIds = [];
        try { responsaveisIds = t.responsaveis_ids ? JSON.parse(t.responsaveis_ids) : []; } catch {}
        return t.responsavel_principal_id === user.colaborador_id ||
               responsaveisIds.includes(user.colaborador_id);
      }).length;
      setTarefasVencidas(vencidas);

      // Tarefas novas: criadas após a última vez que o colaborador acessou a página de Tarefas
      if (user.colaborador_id) {
        const chave = `tarefas_ultima_visita_${user.colaborador_id}`;
        const ultimaVisita = localStorage.getItem(chave);
        const novas = tarefas.filter(t => {
          if (t.status === 'concluido' || t.status === 'arquivado') return false;
          // Se nunca visitou a página, conta todas as tarefas ativas atribuídas a ele
          if (ultimaVisita && (!t.created_date || t.created_date <= ultimaVisita)) return false;
          let responsaveisIds = [];
          try { responsaveisIds = t.responsaveis_ids ? JSON.parse(t.responsaveis_ids) : []; } catch {}
          return t.responsavel_principal_id === user.colaborador_id ||
                 responsaveisIds.includes(user.colaborador_id);
        }).length;
        setTarefasNovas(novas);
      }
    }).catch(console.error);
  }, [user]);

  // Fecha sidebar e menus ao mudar de página
  useEffect(() => {
    setSidebarOpen(false);
    setExpandedMenus({});
    setLogoUploaderOpen(false);
    setEditarPerfilOpen(false);
  }, [currentPageName]);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();

      if (!me) {
        setUser(null);
        return;
      }

      // Super admin não precisa de Colaborador - acessa tudo
      if (me.role === 'super_admin' || me.perfil === 'super_admin') {
        setUser({
          ...me,
          auth_id: me.id,
          colaborador_id: null,
          empresa_id: null, // Acessa todas empresas
          perfil: 'super_admin',
          nome_perfil: me.full_name,
          foto_perfil: null,
          email: me.email,
        });
        return;
      }

      // Para outros roles, buscar Colaborador
      // Buscar Colaborador sem filtro de status (pode estar inativo temporariamente)
      let colabs = await base44.entities.Colaborador.filter(
        { user_id: me.id },
        '-created_date'
      );

      if (!colabs || colabs.length === 0) {
        // Tentar criar Colaborador automaticamente
        try {
          const respCriar = await base44.functions.invoke('criarColaboradorPrimeiroLogin');
          if (respCriar.data.success) {
            colabs = [respCriar.data.colaborador];
          } else {
            throw new Error('Falha ao criar colaborador');
          }
        } catch (err) {
          console.error('Erro ao criar colaborador:', err);
          setUser(null);
          return;
        }
      }

      // Priorizar ativo, depois qualquer um válido
      const byEmpresa = colabs.find(c => c.empresa_id && c.empresa_id === me.empresa_id && c.status === 'ativo');
      const colab = byEmpresa || colabs.find(c => c.status === 'ativo') || colabs[0];

      // Se o colaborador tem perfil super_admin ou master, tratar sem empresa vinculada
      const isSuperPerfil = ['super_admin', 'master'].includes(colab.perfil);

      setUser({
          ...me,
          auth_id: me.id,
          colaborador_id: isSuperPerfil ? null : colab.id,
          empresa_id: isSuperPerfil ? null : (colab.empresa_id || null),
          perfil: colab.perfil || 'vendedor',
          nome_perfil: colab.nome || me.full_name || '',
          foto_perfil: colab.foto_perfil || null,
          email: colab.email || me.email || '',
          menus_permitidos: isSuperPerfil ? [] : (colab.menus_permitidos || []),
        });
    } catch (e) {
      console.error('Erro ao carregar usuário:', e);
      setUser(null);
    } finally {
      setLoadingUser(false);
    }
  };

  const loadLogo = async () => {
    try {
      const configs = await base44.entities.ConfiguracaoSistema.filter({ chave: 'logo_url' });
      if (configs.length > 0 && configs[0].valor) {
        setLogoUrl(configs[0].valor);
      }
    } catch (e) {
      console.log('No logo configured');
    }
  };

  const handleLogout = async () => {
    try {
      await base44.auth.logout('/');
    } catch (e) {
      console.error('Erro ao fazer logout:', e);
      // Força reload mesmo em caso de erro
      window.location.href = '/';
    }
  };

  const isAdmin = user?.perfil === 'master' || user?.perfil === 'super_admin' || user?.perfil === 'admin';
  const isGerente = user?.perfil === 'gerente';

  const ALL_ROLES = ['master', 'super_admin', 'admin', 'gerente', 'vendedor', 'colaborador', 'funcionario'];

  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard', roles: ALL_ROLES },
    { name: 'Bate - Papo', icon: MessageSquare, page: 'BatePapo', roles: ALL_ROLES },
    { name: 'Funil de Vendas', icon: TrendingUp, page: 'FunilVendas', roles: ALL_ROLES },
    { name: 'Call Center', icon: Phone, page: 'CallCenter', roles: ALL_ROLES },
    { 
      name: 'Empréstimos', 
      icon: FileText, 
      roles: ALL_ROLES,
      submenu: [
        { name: 'Nova Venda', page: 'NovaVendaConsignado' },
        { name: 'Propostas', page: 'VendasEmprestimos' },
        { name: 'Propostas sem Vendedor', page: 'PropostasSemVendedor' },
      ]
    },
    { 
      name: 'Consórcio', 
      icon: ShoppingCart, 
      roles: ALL_ROLES,
      submenu: [
        { name: '+ Nova Venda', page: 'NovaVenda?tipo=consorcio' },
        { name: 'Propostas', page: 'Vendas' },
        { name: 'Planos Canopus', page: 'PlanosCanopus' },
        { name: 'Simulador', page: 'SimuladorEscolha' },
        { name: 'Simulador Inteligente', page: 'SimuladorInteligente' },
        { name: 'Resultado de Assembleia', page: 'HistoricoResultadoAssembleia' },
        { name: 'Oferta de Lance', page: 'OfertaLance' },
        { name: 'Cartas Contempladas', page: 'CartasContempladas' },
      ]
    },
    {
      name: 'Seguros',
      icon: Shield,
      roles: ALL_ROLES,
      submenu: [
        { name: 'Dashboard', page: 'DashboardSeguros' },
        { name: 'Propostas', page: 'Seguros' },
        { name: 'Renovações', page: 'RenovacoesSeguro' },
        { name: 'Cobrança', page: 'CobrancaSeguro' },
        { name: 'Configurações', page: 'ConfiguracaoSeguros' },
      ]
    },
    { name: 'Financiamento de Veículos', icon: Car, page: 'FinanciamentoVeiculos', roles: ALL_ROLES },

    { name: 'Tarefas', icon: CheckSquare, page: 'Tarefas', roles: ALL_ROLES },
    { name: 'Clientes', icon: Users, page: 'Clientes', roles: ALL_ROLES },

    { name: 'Agenda', icon: Calendar, page: 'Agenda', roles: ALL_ROLES },
    { name: 'Contatos CRM', icon: Users, page: 'ContatosCRM', roles: ALL_ROLES },
    { 
      name: 'Financeiro', 
      icon: Wallet, 
      roles: ['master', 'super_admin', 'admin'],
      submenu: [
        { name: 'Dashboard Financeiro', page: 'RelatoriosFinanceiros' },
        { name: 'Contas Bancárias', page: 'ContasBancarias' },
        { name: 'Transações', page: 'Transacoes' },
        { name: 'Receber Comissão', page: 'ReceberComissao' },
        { name: 'Comissões a Pagar (Consórcio)', page: 'ComissoesPagar' },

        { name: 'Comissões a Pagar (Empréstimos)', page: 'ComissoesEmprestimos' },
        { name: 'Adiantamentos', page: 'Adiantamentos' },
        { name: 'Comissões Pagas (Consórcio)', page: 'ComissoesPagas' },
        
      ]
    },
    { 
      name: 'Cadastros', 
      icon: Building2, 
      roles: ['master', 'super_admin', 'admin'],
      submenu: [
         { name: 'Empresas', page: 'Empresas' },
         { name: 'Convênios', page: 'Convenios' },
        { name: 'Bancos', page: 'Bancos' },
        { name: 'Administradoras', page: 'Administradoras' },
        { name: 'Empresas Parceiras', page: 'EmpresasParceiras' },
        { name: 'Status de Propostas', page: 'StatusPropostas' },
        { name: 'Tabela de Comissão Empresa', page: 'TabelasEmprestimo' },
        { name: 'Tabelas de Consórcio', page: 'TabelasConsorcio' },
        { name: 'Planos de Consórcio', page: 'PlanosConsorcio' },
        { name: 'Tipos de Empréstimo', page: 'TiposEmprestimo' },
        { name: 'Comissão Empresa (Empréstimos)', page: 'TabelasComissaoEmprestimo' },
        { name: 'Comissão Vendedor (Níveis)', page: 'TabelasComissaoVendedor' },
        { name: 'Importar Planos (Print)', page: 'ImportarPlanosPrint' },
      ]
    },
    { 
      name: 'Importação', 
      icon: Upload, 
      roles: ['master', 'super_admin', 'admin', 'gerente'],
      submenu: [
        { name: 'IMP. Propostas Empréstimo', page: 'ImportacaoProducao' },
        { name: 'IMP. Comissão Consórcio', page: 'ImportacaoComissao' },
        { name: 'IMP. Comissão Empréstimo', page: 'ImportacaoComissaoEmprestimo' },
        { name: 'Importar Planos', page: 'ImportacaoPlanos' },
        { name: 'Importar Resultado Assembleia', page: 'ImportarResultadoAssembleia' },
        { name: 'Histórico Geral', page: 'Importacao' },
      ]
    },
    { name: 'Minhas Comissões', icon: Wallet, page: 'Saques', roles: ['master', 'super_admin', 'admin', 'vendedor', 'colaborador', 'funcionario'] },
    { name: 'Meus Dados', icon: UserCircle, page: 'MeusDados', roles: ['vendedor', 'gerente', 'colaborador', 'funcionario'] },
    { name: 'Configurações', icon: Settings, page: 'Configuracoes', roles: ['master', 'super_admin', 'admin'] },
    { name: 'Monitor Evolution API', icon: Zap, page: 'MonitorEvolutionAPI', roles: ['master', 'super_admin', 'admin'] },
    { name: 'Campanhas', icon: Send, page: 'Campanhas', roles: ALL_ROLES },
    {
      name: 'Funcionários',
      icon: Users,
      roles: ['master', 'super_admin', 'admin'],
      submenu: [
        { name: 'Colaboradores', page: 'FuncionariosColaboradores' },
        { name: 'Folha Salarial', page: 'FolhaSalarial' },
        { name: 'Adiantamentos', page: 'AdiantamentosFuncionarios' },
        { name: 'Lançamento de Faltas', page: 'LancamentoFaltas' },
        { name: 'Relatórios', page: 'RelatorioFuncionarios' },
      ]
    },
    { name: 'Gestão de Usuários', icon: Building2, page: 'Empresas', roles: ['master', 'super_admin', 'admin'] },
  ];

  // Mapa de chave de permissão por nome do menu
  const menuPermissaoKey = {
    'Dashboard': 'dashboard',
    'Nova Venda': 'nova_venda',
    'Empréstimos': 'emprestimos',
    'Consórcio': 'consorcio',
    'Seguros': 'seguros',
    'Financiamento de Veículos': 'financiamento_veiculos',
    'Funil de Vendas': 'funil_vendas',
    'Tarefas': 'tarefas',
    'Clientes': 'clientes',
    'Cartas Contempladas': 'cartas_contempladas',
    'Agenda': 'agenda',
    'Bate - Papo': 'bate_papo',
    'Call Center': 'call_center',
    'Contatos CRM': 'contatos_crm',
    'Campanhas': 'campanhas',
    'JD Messenger (Central de conversas)': 'bate_papo',
    'Financeiro': 'financeiro',
    'Cadastros': 'cadastros',
    'Importação': 'importacao',
    'Minhas Comissões': 'saques',
    'Relatórios': 'relatorios',
    'Configurações': 'configuracoes',
    'Configuração WhatsApp': 'configuracao_whatsapp',
    'FinantoBank INSS': 'finanto_bank',
  };

  const menus_permitidos = user?.menus_permitidos || [];
  const temPermissoesCustomizadas = menus_permitidos.length > 0;

  // Verifica se uma chave de submenu está liberada (formato 'menuKey:page')
  const isSubmenuPermitido = (menuKey, subPage) => {
    if (!temPermissoesCustomizadas) return true;
    // Normaliza: remove query string (ex: 'NovaVenda?tipo=consorcio' → 'NovaVenda')
    const pageNormalizado = subPage.split('?')[0];
    const subKey = `${menuKey}:${pageNormalizado}`;
    return menus_permitidos.includes(subKey);
  };

  const userRole = user?.perfil || 'vendedor';
  const isAdminRole = ['master', 'super_admin', 'admin'].includes(userRole);

  const filteredMenuItems = menuItems.filter(item => {
    // Filtrar por role primeiro
    if (!item.roles.includes(userRole)) return false;
    // Admin/master/super_admin/gerente/vendedor nunca são bloqueados por permissões customizadas
    if (isAdminRole) return true;
    // Se não há permissões customizadas, libera tudo
    if (!temPermissoesCustomizadas) return true;
    const key = menuPermissaoKey[item.name];
    if (!key) return true;
    // Para menus com submenu: liberar se ao menos 1 submenu estiver permitido
    if (item.submenu) {
      return item.submenu.some(sub => isSubmenuPermitido(key, sub.page));
    }
    return menus_permitidos.includes(key);
  }).map(item => {
    // Filtrar submenus individualmente
    if (
      item.submenu &&
      !isAdminRole &&
      temPermissoesCustomizadas
    ) {
      const key = menuPermissaoKey[item.name];
      if (key) {
        return {
          ...item,
          submenu: item.submenu.filter(sub => isSubmenuPermitido(key, sub.page)),
        };
      }
    }
    return item;
  });

  const toggleSubmenu = (name) => {
    setExpandedMenus(prev => ({ ...prev, [name]: !prev[name] }));
  };

  // Loading inicial
  if (loadingUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[#23BE84] mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Carregando sistema...</p>
        </div>
      </div>
    );
  }



  return (
    <div className={cn("min-h-screen transition-colors", darkMode ? "bg-slate-900" : "bg-slate-50")}>
      <AntiTranslateGuard />
      <Toaster richColors position="top-right" />
      <style>{`
        :root {
          --primary: 180 84% 38%;
          --primary-foreground: 0 0% 100%;
        }
      `}</style>

      {/* Mobile Header */}
      <header className="lg:hidden bg-[#10353C] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <button onClick={() => setSidebarOpen(true)} className="p-2">
          <Menu className="w-6 h-6" />
        </button>
        <h1 className="font-semibold text-lg">CRM Consórcio</h1>
        <div className="w-10" />
      </header>

      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 h-full w-72 bg-[#10353C] text-white z-50 transform transition-transform duration-300 lg:translate-x-0 flex flex-col",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex justify-end lg:hidden p-3 border-b border-white/10">
          <button onClick={() => setSidebarOpen(false)} className="p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Info */}
        {user && (
          <div className="p-4 border-b border-white/10">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full flex items-center gap-3 hover:bg-white/10 p-2 rounded-xl transition-colors">
                  {user.foto_perfil ? (
                    <img 
                      src={user.foto_perfil} 
                      alt="Foto" 
                      className="w-10 h-10 rounded-full object-cover border-2 border-white/20"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm border-2 border-white/20">
                      {(user.nome_perfil || user.full_name)?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-medium truncate">{user.nome_perfil || user.full_name}</p>
                    <p className="text-xs text-white/60 capitalize">{user.perfil === 'funcionario' ? 'Colaborador' : (user.perfil || 'Vendedor')}</p>
                  </div>
                  <ChevronDown className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                {/* Header do Menu */}
                <div className="px-3 py-2 border-b">
                  <div className="flex items-center gap-3">
                    {user.foto_perfil ? (
                      <img 
                        src={user.foto_perfil} 
                        alt="Foto" 
                        className="w-12 h-12 rounded-full object-cover border-2 border-slate-200"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                        {(user.nome_perfil || user.full_name)?.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{user.nome_perfil || user.full_name}</p>
                      <p className="text-xs text-slate-500 capitalize">{user.perfil === 'funcionario' ? 'Colaborador' : user.perfil}</p>
                    </div>
                  </div>
                </div>

                {/* Opções do Menu */}
                <div className="py-1">
                  <DropdownMenuItem 
                    onSelect={(e) => {
                      e.preventDefault();
                      setEditarPerfilOpen(true);
                    }}
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Alterar Foto de Perfil
                  </DropdownMenuItem>

                  {(user.perfil === 'master' || user.perfil === 'super_admin' || user.perfil === 'admin') && (
                    <DropdownMenuItem 
                      onSelect={(e) => {
                        e.preventDefault();
                        setLogoUploaderOpen(true);
                      }}
                    >
                      <ImageIcon className="w-4 h-4 mr-2" />
                      Alterar Logo do Sistema
                    </DropdownMenuItem>
                  )}

                  {user?.empresa_id && (
                    <DropdownMenuItem 
                     onSelect={(e) => {
                       e.preventDefault();
                       setEditarNomeEmpresaOpen(true);
                     }}
                    >
                     <Edit3 className="w-4 h-4 mr-2" />
                     Alterar Nome da Empresa
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuItem 
                   onSelect={(e) => {
                     e.preventDefault();
                     toggleDarkMode();
                   }}
                  >
                   {darkMode ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
                   {darkMode ? 'Modo Claro' : 'Modo Escuro'}
                  </DropdownMenuItem>
                  </div>
                  </DropdownMenuContent>
                  </DropdownMenu>
                  </div>
                  )}

        {/* Navigation */}
        <nav className="p-4 space-y-1 overflow-y-auto flex-1">
          {filteredMenuItems.map((item) => (
            <div key={item.page || item.name}>
              {item.submenu ? (
                        <>
                          <button
                            onClick={() => toggleSubmenu(item.name)}
                            className={cn(
                              "w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all",
                              "hover:bg-white/10"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <item.icon className="w-5 h-5" />
                              <span>{item.name}</span>
                            </div>
                            <ChevronDown className={cn(
                              "w-4 h-4 transition-transform",
                              expandedMenus[item.name] && "rotate-180"
                            )} />
                          </button>
                          {expandedMenus[item.name] && (
                            <div className="ml-6 mt-1 space-y-1">
                              {item.submenu.map((sub) => (
                                <button
                                  key={sub.page}
                                  onClick={() => {
                                    if (sub.page.includes('NovaVenda?tipo=consorcio')) {
                                      setNovaVendaConsorcioOpen(true);
                                    } else {
                                      window.location.href = createPageUrl(sub.page);
                                    }
                                    setSidebarOpen(false);
                                    setExpandedMenus({});
                                  }}
                                  className={cn(
                                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-sm text-left",
                                    currentPageName === sub.page
                                      ? "bg-white/20 text-white"
                                      : "text-white/70 hover:bg-white/10 hover:text-white"
                                  )}
                                >
                                  <span className="flex-1">{sub.name}</span>
                                  {sub.page === 'ComissoesEmprestimos' && comissoesPendentes > 0 && (
                                    <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center leading-tight">
                                      {comissoesPendentes}
                                    </span>
                                  )}
                                  {sub.page === 'ComissoesPagar' && comissoesConsorcioPendentes > 0 && (
                                    <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center leading-tight">
                                      {comissoesConsorcioPendentes}
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                <Link
                  to={createPageUrl(item.page)}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                    currentPageName === item.page
                      ? "bg-white/20 text-white"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="flex-1">{item.name}</span>
                  {item.name === 'Bate - Papo' && mensagensNaoLidas > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center leading-tight">
                      {mensagensNaoLidas}
                    </span>
                  )}
                  {item.name === 'Tarefas' && tarefasNovas > 0 && (
                    <span className="bg-blue-500 text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center leading-tight mr-1" title="Novas tarefas atribuídas a você">
                      {tarefasNovas} nova{tarefasNovas > 1 ? 's' : ''}
                    </span>
                  )}
                  {item.name === 'Tarefas' && tarefasVencidas > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center leading-tight">
                      {tarefasVencidas}
                    </span>
                  )}
                  {item.name === 'Agenda' && agendaAgendados > 0 && (
                    <span className="bg-blue-500 text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center leading-tight mr-1" title="Compromissos agendados">
                      {agendaAgendados}
                    </span>
                  )}
                  {item.name === 'Agenda' && agendaAtrasados > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center leading-tight" title="Compromissos atrasados">
                      {agendaAtrasados}
                    </span>
                  )}
                </Link>
              )}
            </div>
          ))}
        </nav>

        {/* Botão Sair */}
        <div className="p-4 border-t border-white/10 flex-shrink-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <LogOut className="w-5 h-5" />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={cn("lg:ml-72 min-h-screen", darkMode && "bg-slate-900")}>
        <div className="p-4 lg:p-8">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
      </main>

      {/* Logo Uploader Modal */}
      <LogoUploader 
        open={logoUploaderOpen} 
        onOpenChange={setLogoUploaderOpen}
        onSuccess={(url) => {
          setLogoUrl(url);
          loadLogo();
        }}
      />

      {/* Editar Perfil Modal */}
      <EditarPerfilModal
        open={editarPerfilOpen}
        onOpenChange={setEditarPerfilOpen}
        user={user}
        onSuccess={loadUser}
      />

      {/* Editar Nome Empresa Modal */}
      <EditarNomeEmpresaModal
        open={editarNomeEmpresaOpen}
        onOpenChange={setEditarNomeEmpresaOpen}
        empresaId={user?.empresa_id}
        onSuccess={loadUser}
      />

      {/* Nova Venda Consórcio Modal */}
      <VendaForm
        open={novaVendaConsorcioOpen}
        onOpenChange={setNovaVendaConsorcioOpen}
        venda={null}
        onSubmit={async (formData) => {
          const empresaId = formData.empresa_id || user?.empresa_id;
          if (!empresaId) {
            toast.error('Empresa não encontrada. Verifique seu cadastro.');
            return;
          }
          try {
            const vendaData = {
              ...formData,
              empresa_id: empresaId,
              prazo: Number(formData.prazo || 0),
              valorCredito: parseFloat(formData.valorCredito) || 0,
              taxaAdministracao: parseFloat(formData.taxaAdministracao) || 0,
              status: !formData.cota || formData.cota.trim() === '' ? 'pendente' : (formData.status || 'ativa'),
            };
            await base44.entities.Venda.create(vendaData);
            toast.success('Venda cadastrada com sucesso!');
            setNovaVendaConsorcioOpen(false);
            window.location.href = createPageUrl('Vendas');
          } catch (err) {
            console.error('Erro ao salvar venda:', err);
            toast.error('Erro ao salvar venda: ' + (err.message || 'Erro desconhecido'));
          }
        }}
        isLoading={false}
        currentUser={user}
        empresaIdPadrao={user?.empresa_id}
        oportunidade={null}
      />
      </div>
      );
      }