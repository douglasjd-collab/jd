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
        CheckSquare
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
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import AntiTranslateGuard from '@/components/AntiTranslateGuard';
import { Toaster } from 'sonner';
import VendaForm from '@/components/forms/VendaForm';

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState({});
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoUploaderOpen, setLogoUploaderOpen] = useState(false);
  const [editarPerfilOpen, setEditarPerfilOpen] = useState(false);
  const [novaVendaConsorcioOpen, setNovaVendaConsorcioOpen] = useState(false);
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

      setUser({
          ...me,
          auth_id: me.id,
          colaborador_id: colab.id,
          empresa_id: colab.empresa_id || null,
          perfil: colab.perfil || 'vendedor',
          nome_perfil: colab.nome || me.full_name || '',
          foto_perfil: colab.foto_perfil || null,
          email: colab.email || me.email || '',
          menus_permitidos: colab.menus_permitidos || [],
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
    await base44.auth.logout();
  };

  const isAdmin = user?.perfil === 'master' || user?.perfil === 'super_admin' || user?.perfil === 'admin';
  const isGerente = user?.perfil === 'gerente';

  const ALL_ROLES = ['master', 'super_admin', 'admin', 'gerente', 'vendedor', 'colaborador', 'funcionario'];

  const menuItems = [
    { name: 'Gestão de Usuários', icon: Building2, page: 'Empresas', roles: ['master', 'super_admin', 'admin'] },
    { name: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard', roles: ALL_ROLES },
    { name: 'Nova Venda', icon: ShoppingCart, page: 'NovaVenda', roles: ALL_ROLES },
    { 
      name: 'Empréstimos', 
      icon: FileText, 
      roles: ALL_ROLES,
      submenu: [
        { name: 'Propostas', page: 'VendasEmprestimos' },
        { name: 'Propostas sem Vendedor', page: 'PropostasSemVendedor' },
        { name: 'Importar Propostas', page: 'ImportacaoProducao' },
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
        { name: 'Resultado de Assembleia', page: 'HistoricoResultadoAssembleia' },
        { name: 'Oferta de Lance', page: 'OfertaLance' },
      ]
    },
    { name: 'Funil de Vendas', icon: TrendingUp, page: 'FunilVendas', roles: ALL_ROLES },
    { name: 'Tarefas', icon: CheckSquare, page: 'Tarefas', roles: ALL_ROLES },
    { name: 'Clientes', icon: Users, page: 'Clientes', roles: ALL_ROLES },
    { name: 'Cartas Contempladas', icon: FileText, page: 'CartasContempladas', roles: ALL_ROLES },
    { name: 'Agenda', icon: Calendar, page: 'Agenda', roles: ALL_ROLES },
    { name: 'Bate-papo', icon: MessageSquare, page: 'BatePapo', roles: ALL_ROLES },
    { 
      name: 'Financeiro', 
      icon: Wallet, 
      roles: ['master', 'super_admin', 'admin'],
      submenu: [
        { name: 'Dashboard Financeiro', page: 'RelatoriosFinanceiros' },
        { name: 'Transações', page: 'Transacoes' },
        { name: 'Receber Comissão', page: 'ReceberComissao' },
        { name: 'Comissões a Pagar (Consórcio)', page: 'ComissoesPagar' },
        { name: 'Comissões a Pagar (Empréstimos)', page: 'ComissoesEmprestimos' },
        { name: 'Comissões Pagas', page: 'ComissoesPagas' },
        { name: 'Comissões Pagas (Empréstimos)', page: 'ComissoesPagasEmprestimos' },
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
        { name: 'Comissões Empréstimos', page: 'TabelasComissaoEmprestimo' },
        { name: 'Tabela de Comissão Vendedor', page: 'TabelasComissaoVendedor' },
        { name: 'Importar Planos (Print)', page: 'ImportarPlanosPrint' },
      ]
    },
    { 
      name: 'Importação', 
      icon: Upload, 
      roles: ['master', 'super_admin', 'admin', 'gerente'],
      submenu: [
        { name: 'IMP. Comissão Consórcio', page: 'ImportacaoComissao' },
        { name: 'IMP. Comissão Empréstimo', page: 'ImportacaoComissaoEmprestimo' },
        { name: 'Importar Planos', page: 'ImportacaoPlanos' },
        { name: 'Importar Resultado Assembleia', page: 'ImportarResultadoAssembleia' },
        { name: 'Histórico Geral', page: 'Importacao' },
      ]
    },
    { name: 'Saques', icon: Wallet, page: 'Saques', roles: ['master', 'super_admin', 'admin', 'vendedor', 'colaborador', 'funcionario'] },
    { name: 'Relatórios', icon: FileText, page: 'Relatorios', roles: ['master', 'super_admin', 'admin', 'gerente'] },
    { name: 'Meus Dados', icon: UserCircle, page: 'MeusDados', roles: ['vendedor', 'gerente', 'colaborador', 'funcionario'] },
    { name: 'Configurações', icon: Settings, page: 'Configuracoes', roles: ['master', 'super_admin', 'admin'] },
    { name: 'Configuração WhatsApp', icon: MessageSquare, page: 'ConfiguracaoWhatsApp', roles: ['master', 'super_admin', 'admin'] },
  ];

  // Mapa de chave de permissão por nome do menu
  const menuPermissaoKey = {
    'Dashboard': 'dashboard',
    'Nova Venda': 'nova_venda',
    'Empréstimos': 'emprestimos',
    'Consórcio': 'consorcio',
    'Funil de Vendas': 'funil_vendas',
    'Clientes': 'clientes',
    'Cartas Contempladas': 'cartas_contempladas',
    'Agenda': 'agenda',
    'Bate-papo': 'bate_papo',
    'Financeiro': 'financeiro',
    'Cadastros': 'cadastros',
    'Importação': 'importacao',
    'Saques': 'saques',
    'Relatórios': 'relatorios',
    'Configurações': 'configuracoes',
    'Configuração WhatsApp': 'configuracao_whatsapp',
  };

  const menus_permitidos = user?.menus_permitidos || [];
  const temPermissoesCustomizadas = menus_permitidos.length > 0;

  // Verifica se uma chave de submenu está liberada (formato 'menuKey:page')
  const isSubmenuPermitido = (menuKey, subPage) => {
    if (!temPermissoesCustomizadas) return true;
    const subKey = `${menuKey}:${subPage}`;
    return menus_permitidos.includes(subKey);
  };

  const filteredMenuItems = menuItems.filter(item => {
    // Filtrar por role primeiro
    if (!item.roles.includes(user?.perfil || 'vendedor')) return false;
    // Admin/master/super_admin/gerente/vendedor nunca são bloqueados por permissões customizadas
    if (['master', 'super_admin', 'admin', 'gerente', 'vendedor'].includes(user?.perfil)) return true;
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
      !['master', 'super_admin', 'admin', 'gerente', 'vendedor'].includes(user?.perfil) &&
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
        <div className="p-6 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-10 w-auto object-contain" />
            ) : (
              <div className="w-10 h-10 bg-[#23BE84] rounded-xl flex items-center justify-center">
                <Wallet className="w-5 h-5" />
              </div>
            )}
            <div>
              <h1 className="font-bold text-lg">CRM Consórcio</h1>
              <p className="text-xs text-white/60">Gestão Financeira</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1">
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
        <nav className="p-4 space-y-1 overflow-y-auto max-h-[calc(100vh-280px)]">
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
                                  {sub.name}
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
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                    currentPageName === item.page
                      ? "bg-white/20 text-white"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </Link>
              )}
            </div>
          ))}
        </nav>

        {/* Botão Sair */}
        <div className="p-4 border-t border-white/10 mt-auto">
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

      {/* Nova Venda Consórcio Modal */}
      <VendaForm
        open={novaVendaConsorcioOpen}
        onOpenChange={setNovaVendaConsorcioOpen}
        venda={null}
        onSubmit={async () => {
          setNovaVendaConsorcioOpen(false);
          window.location.href = createPageUrl('Vendas');
        }}
        isLoading={false}
        currentUser={user}
        empresaIdPadrao={user?.empresa_id}
        oportunidade={null}
      />
      </div>
      );
      }