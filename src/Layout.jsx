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
  Moon,
  Sun
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

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState({});
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoUploaderOpen, setLogoUploaderOpen] = useState(false);
  const [editarPerfilOpen, setEditarPerfilOpen] = useState(false);
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
      if (me.role === 'super_admin') {
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
      const colabs = await base44.entities.Colaborador.filter(
        { user_id: me.id, status: 'ativo' },
        '-created_date'
      );

      if (!colabs || colabs.length === 0) {
        console.warn('Usuário sem Colaborador vinculado:', me.email);
        // Criar um usuário básico mesmo sem Colaborador
        setUser({
          ...me,
          auth_id: me.id,
          colaborador_id: null,
          empresa_id: null,
          perfil: 'vendedor',
          nome_perfil: me.full_name || '',
          foto_perfil: null,
          email: me.email || '',
        });
        return;
      }

      const byEmpresa = colabs.find(c => c.empresa_id && c.empresa_id === me.empresa_id);
      const colab = byEmpresa || colabs[0];

      setUser({
        ...me,
        auth_id: me.id,
        colaborador_id: colab.id,
        empresa_id: colab.empresa_id || null,
        perfil: colab.perfil || 'vendedor',
        nome_perfil: colab.nome || me.full_name || '',
        foto_perfil: colab.foto_perfil || null,
        email: colab.email || me.email || '',
      });
    } catch (e) {
      console.log('Erro ao carregar usuário:', e);
      setUser(null);
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

  const menuItems = [
    { name: 'Empresas', icon: Building2, page: 'Empresas', roles: ['master', 'super_admin'] },
    { name: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard', roles: ['master', 'super_admin', 'admin', 'gerente', 'vendedor'] },
    { name: 'Planos Canopus', icon: FileSpreadsheet, page: 'PlanosCanopus', roles: ['master', 'super_admin', 'admin'] },
    { name: 'Simulador', icon: Calculator, page: 'SimuladorEscolha', roles: ['master', 'super_admin', 'admin', 'gerente', 'vendedor'] },
    { name: 'Funil de Vendas', icon: TrendingUp, page: 'FunilVendas', roles: ['master', 'super_admin', 'admin', 'gerente', 'vendedor'] },
    { name: 'Clientes', icon: Users, page: 'Clientes', roles: ['master', 'super_admin', 'admin', 'gerente', 'vendedor'] },
    { name: 'Vendas', icon: ShoppingCart, page: 'Vendas', roles: ['master', 'super_admin', 'admin', 'gerente', 'vendedor'] },
    { name: 'Oferta de Lance', icon: TrendingUp, page: 'OfertaLance', roles: ['master', 'super_admin', 'admin', 'gerente', 'vendedor'] },
    { name: 'Agenda', icon: Calendar, page: 'Agenda', roles: ['master', 'super_admin', 'admin', 'gerente', 'vendedor'] },
    { name: 'Financeiro', icon: Wallet, page: 'RelatoriosFinanceiros', roles: ['master', 'super_admin', 'admin'] },
    { 
      name: 'Cadastros', 
      icon: Building2, 
      roles: ['master', 'super_admin', 'admin'],
      submenu: [
        { name: 'Usuários', page: 'Usuarios' },
        { name: 'Administradoras', page: 'Administradoras' },
        { name: 'Tabelas de Consórcio', page: 'TabelasConsorcio' },
        { name: 'Planos de Consórcio', page: 'PlanosConsorcio' },
        { name: 'Importar Planos (Print)', page: 'ImportarPlanosPrint' },
      ]
    },
    { 
      name: 'Importação', 
      icon: Upload, 
      roles: ['master', 'super_admin', 'admin'],
      submenu: [
        { name: 'Importar Comissões', page: 'ImportacaoComissao' },
        { name: 'Importar Planos', page: 'ImportacaoPlanos' },
        { name: 'Importar Produção', page: 'ImportacaoProducao' },
        { name: 'Histórico', page: 'Importacao' },
      ]
    },
    { name: 'Saques', icon: Wallet, page: 'Saques', roles: ['master', 'super_admin', 'admin', 'vendedor'] },
    { name: 'Relatórios', icon: FileText, page: 'Relatorios', roles: ['master', 'super_admin', 'admin', 'gerente'] },
    { name: 'Meus Dados', icon: UserCircle, page: 'MeusDados', roles: ['vendedor', 'gerente'] },
    { name: 'Configurações', icon: Settings, page: 'Configuracoes', roles: ['master', 'super_admin', 'admin'] },
  ];

  const filteredMenuItems = menuItems.filter(item => 
    item.roles.includes(user?.perfil || 'vendedor')
  );

  const toggleSubmenu = (name) => {
    setExpandedMenus(prev => ({ ...prev, [name]: !prev[name] }));
  };

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
                    <p className="text-xs text-white/60 capitalize">{user.perfil || 'Vendedor'}</p>
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
                      <p className="text-xs text-slate-500 capitalize">{user.perfil}</p>
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
                        <Link
                          key={sub.page}
                          to={createPageUrl(sub.page)}
                          onClick={() => {
                            setSidebarOpen(false);
                            setExpandedMenus({});
                          }}
                          className={cn(
                            "flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-sm",
                            currentPageName === sub.page
                              ? "bg-white/20 text-white"
                              : "text-white/70 hover:bg-white/10 hover:text-white"
                          )}
                        >
                          {sub.name}
                        </Link>
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
          {children}
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
    </div>
  );
}