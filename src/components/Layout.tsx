import React, { useState } from 'react';
import { LayoutDashboard, Users, FolderKanban, Search, FileText, Building2, ShoppingCart, CreditCard, PieChart, Settings, Menu, Receipt, UserPlus, UserCog, LogOut, DollarSign, Calendar, HardDrive, TrendingUp, PanelLeftClose, PanelLeftOpen, BookOpen } from 'lucide-react';
import { useGlobalContext } from '../context/GlobalContext';
import { NotificationsDropdown } from './NotificationsDropdown';

interface LayoutProps {
  children: React.ReactNode;
  activeModule: string;
  setActiveModule: (module: string) => void;
  onOpenSearch?: () => void;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'clientes', label: 'Clientes', icon: Users },
  { id: 'proyectos', label: 'Proyectos', icon: FolderKanban },
  { id: 'cotizaciones', label: 'Cotizaciones', icon: FileText },
  { id: 'proveedores', label: 'Proveedores', icon: Building2 },
  { id: 'ordenes', label: 'Órdenes', icon: ShoppingCart },
  { id: 'facturacion', label: 'Facturación', icon: DollarSign },
  { id: 'rentabilidad', label: 'Rentabilidad por Proyecto', icon: TrendingUp },
  { id: 'pagos', label: 'Pago a Proveedores', icon: CreditCard },
  { id: 'gastos', label: 'Gastos Producción', icon: Receipt },
  { id: 'liquidaciones', label: 'Liquidaciones', icon: PieChart },
  { id: 'gantts', label: 'Gantts', icon: FolderKanban },
  { id: 'books', label: 'Books / Presentaciones', icon: BookOpen },
  { id: 'calendario', label: 'Reuniones', icon: Calendar },
  { id: 'drive', label: 'Archivos Drive', icon: HardDrive },

  { id: 'configuracion', label: 'Configuración', icon: Settings },
  { id: 'usuarios', label: 'Usuarios', icon: UserPlus },
  { id: 'perfil', label: 'Mi Perfil', icon: UserCog },
];

const ROLE_ACCESS: Record<string, string[]> = {
  'Admin': ['dashboard', 'clientes', 'proyectos', 'cotizaciones', 'proveedores', 'ordenes', 'facturacion', 'rentabilidad', 'pagos', 'gastos', 'liquidaciones', 'gantts', 'books', 'calendario', 'drive', 'configuracion', 'usuarios', 'perfil'],
  'Directorio': ['dashboard', 'clientes', 'proyectos', 'cotizaciones', 'proveedores', 'ordenes', 'facturacion', 'rentabilidad', 'pagos', 'gastos', 'liquidaciones', 'gantts', 'books', 'calendario', 'drive', 'perfil'],
  'Cuentas': ['dashboard', 'clientes', 'proyectos', 'cotizaciones', 'proveedores', 'gantts', 'books', 'calendario', 'drive', 'perfil', 'facturacion', 'rentabilidad', 'pagos', 'liquidaciones'],
  'Producción': ['dashboard', 'proveedores', 'ordenes', 'gastos', 'gantts', 'books', 'calendario', 'drive', 'perfil', 'cotizaciones', 'pagos'],
  'Contabilidad': ['proveedores', 'facturacion', 'pagos', 'calendario', 'drive', 'perfil']
};

export const Layout: React.FC<LayoutProps> = ({ children, activeModule, setActiveModule, onOpenSearch }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sig_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('sig_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };
  const { currentUserRole, currentUser, logout, isLoading } = useGlobalContext();

  const handleLogout = () => {
    if (window.confirm('¿Estás seguro de que deseas cerrar sesión en SIG Purple?')) {
      logout();
    }
  };

  const filteredNavItems = navItems.filter(item => ROLE_ACCESS[currentUserRole || 'Directorio']?.includes(item.id));

  return (
    <div className="app-container">
      {/* Mobile Overlay */}
      <div 
        className={`mobile-overlay ${isMobileMenuOpen ? 'mobile-open' : ''}`}
        onClick={() => setIsMobileMenuOpen(false)}
      />

      {/* Sidebar Navigation */}
      <aside className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''} ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header" style={{ position: 'relative', justifyContent: 'center', padding: isSidebarCollapsed ? '20px 8px' : '24px 16px' }}>
          {!isSidebarCollapsed ? (
            <img 
              src="https://brandgeeks.pe/wp-content/uploads/2026/06/PurpleNEW-01-1-1.png" 
              alt="SIG Purple" 
              style={{ maxWidth: '100%', height: 'auto', maxHeight: '85px', objectFit: 'contain' }} 
            />
          ) : (
            <img 
              src="https://brandgeeks.pe/wp-content/uploads/2026/06/PurpleNEW-02.png" 
              alt="Purple" 
              style={{ width: '36px', height: '36px', objectFit: 'contain' }} 
              title="SIG Purple (Expandir menú)"
              onClick={toggleSidebar}
            />
          )}
          <button 
            type="button"
            className="desktop-sidebar-toggle-btn"
            onClick={toggleSidebar}
            title={isSidebarCollapsed ? "Expandir menú lateral" : "Colapsar menú lateral"}
            aria-label="Alternar barra lateral"
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${activeModule === item.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveModule(item.id);
                  setIsMobileMenuOpen(false);
                }}
                title={isSidebarCollapsed ? item.label : undefined}
              >
                <Icon className="icon" />
                <span className="nav-item-label">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left" style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu size={22} />
            </button>
            <button
              type="button"
              className="desktop-sidebar-topbar-toggle"
              onClick={toggleSidebar}
              title={isSidebarCollapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
              aria-label="Alternar menú lateral"
            >
              {isSidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            </button>
            <h1 className="topbar-title">
              {navItems.find(item => item.id === activeModule)?.label}
            </h1>
            
            {/* Interactive Global Search Trigger (Desktop) */}
            {onOpenSearch && (
              <button 
                type="button"
                className="topbar-search-trigger" 
                onClick={onOpenSearch}
                title="Búsqueda rápida en todo el sistema (Ctrl + K)"
                aria-label="Abrir buscador global"
              >
                <Search size={14} className="topbar-search-icon" />
                <span className="topbar-search-text">Buscar en SIG Purple...</span>
                <kbd className="topbar-search-shortcut">Ctrl K</kbd>
              </button>
            )}
          </div>

          <div className="user-profile">
            {onOpenSearch && (
              <button
                type="button"
                className="mobile-topbar-search-btn"
                onClick={onOpenSearch}
                title="Buscar en el sistema"
                aria-label="Abrir búsqueda global"
              >
                <Search size={19} />
              </button>
            )}
            <div className="topbar-notifications" style={{ display: 'flex', alignItems: 'center', gap: '16px', borderRight: '1px solid var(--border-color)', paddingRight: '16px' }}>
              <NotificationsDropdown setActiveModule={setActiveModule} />
            </div>
            <div className="topbar-user-section" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 0 }}>
                <span className="user-email-text" style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }} title={currentUser?.email || 'Usuario'}>{currentUser?.email || 'Usuario'}</span>
                <span className="user-role-badge" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{currentUserRole}</span>
              </div>
              <img 
                src="https://brandgeeks.pe/wp-content/uploads/2026/06/PurpleNEW-02.png" 
                alt="Purple Logo" 
                className="topbar-logo"
                style={{ height: '30px', objectFit: 'contain' }}
              />
              <button 
                onClick={handleLogout}
                className="btn-logout"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginLeft: '6px', padding: '4px' }}
                title="Cerrar Sesión"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
          {isLoading && <div className="topbar-loading-indicator" title="Sincronizando con base de datos..." />}
        </header>

        <div className="content-area">
          {children}
        </div>

        {/* Mobile Bottom Navigation Bar (Trento / Modern ERP Thumb Zone) */}
        <nav className="mobile-bottom-nav">
          <button 
            className={`bottom-nav-item ${activeModule === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveModule('dashboard')}
          >
            <LayoutDashboard className="bottom-nav-icon" size={20} />
            <span>Dashboard</span>
          </button>
          <button 
            className={`bottom-nav-item ${activeModule === 'cotizaciones' ? 'active' : ''}`}
            onClick={() => setActiveModule('cotizaciones')}
          >
            <FileText className="bottom-nav-icon" size={20} />
            <span>Cotizar</span>
          </button>
          <button 
            className={`bottom-nav-item ${activeModule === 'proyectos' ? 'active' : ''}`}
            onClick={() => setActiveModule('proyectos')}
          >
            <FolderKanban className="bottom-nav-icon" size={20} />
            <span>Proyectos</span>
          </button>
          <button 
            className={`bottom-nav-item ${activeModule === 'proveedores' ? 'active' : ''}`}
            onClick={() => setActiveModule('proveedores')}
          >
            <Building2 className="bottom-nav-icon" size={20} />
            <span>Proveedores</span>
          </button>
          <button 
            className="bottom-nav-item"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu className="bottom-nav-icon" size={20} />
            <span>Menú</span>
          </button>
        </nav>
      </main>
    </div>
  );
};
