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
  Wallet
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState({});

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
    } catch (e) {
      console.log('User not logged in');
    }
  };

  const handleLogout = async () => {
    await base44.auth.logout();
  };

  const isAdmin = user?.perfil === 'master' || user?.perfil === 'admin';
  const isGerente = user?.perfil === 'gerente';

  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard', roles: ['master', 'admin', 'gerente', 'vendedor'] },
    { name: 'Clientes', icon: Users, page: 'Clientes', roles: ['master', 'admin', 'gerente', 'vendedor'] },
    { name: 'Vendas', icon: ShoppingCart, page: 'Vendas', roles: ['master', 'admin', 'gerente', 'vendedor'] },
    { 
      name: 'Cadastros', 
      icon: Building2, 
      roles: ['master', 'admin'],
      submenu: [
        { name: 'Usuários', page: 'Usuarios' },
        { name: 'Administradoras', page: 'Administradoras' },
        { name: 'Tabelas de Consórcio', page: 'TabelasConsorcio' },
        { name: 'Planos de Consórcio', page: 'PlanosConsorcio' },
      ]
    },
    { name: 'Importação', icon: Upload, page: 'Importacao', roles: ['master', 'admin'] },
    { name: 'Comissões', icon: Wallet, page: 'Comissoes', roles: ['master', 'admin', 'gerente', 'vendedor'] },
    { name: 'Relatórios', icon: FileText, page: 'Relatorios', roles: ['master', 'admin', 'gerente'] },
    { name: 'Configurações', icon: Settings, page: 'Configuracoes', roles: ['master', 'admin'] },
  ];

  const filteredMenuItems = menuItems.filter(item => 
    item.roles.includes(user?.perfil || 'vendedor')
  );

  const toggleSubmenu = (name) => {
    setExpandedMenus(prev => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`
        :root {
          --primary: 222 47% 24%;
          --primary-foreground: 210 40% 98%;
        }
      `}</style>

      {/* Mobile Header */}
      <header className="lg:hidden bg-[#1e3a5f] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50">
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
        "fixed top-0 left-0 h-full w-72 bg-[#1e3a5f] text-white z-50 transform transition-transform duration-300 lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
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
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                <UserCircle className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{user.full_name}</p>
                <p className="text-xs text-white/60 capitalize">{user.perfil || 'Vendedor'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="p-4 space-y-1 overflow-y-auto max-h-[calc(100vh-250px)]">
          {filteredMenuItems.map((item) => (
            <div key={item.name}>
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
                          onClick={() => setSidebarOpen(false)}
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

        {/* Logout */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:bg-white/10 hover:text-white transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-72 min-h-screen">
        <div className="p-4 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}