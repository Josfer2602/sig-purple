import { Suspense, lazy, useState, useEffect } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import './App.css';
import { Layout } from './components/Layout';
import { GlobalProvider, useGlobalContext } from './context/GlobalContext';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { ChatBot } from './components/ChatBot';
import { useAutoLogout } from './hooks/useAutoLogout';
import { SmartMeetingProvider } from './context/SmartMeetingContext';
import { SmartMeetingModal } from './components/SmartMeetingModal';
import { SmartMeetingFloatingWidget } from './components/SmartMeetingFloatingWidget';

const ModuleFallback = () => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '380px',
    height: '100%',
    width: '100%',
    gap: '12px',
    color: 'var(--text-muted)'
  }}>
    <div style={{
      width: '44px',
      height: '44px',
      borderRadius: '50%',
      background: 'rgba(139, 92, 246, 0.08)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--accent-primary, #8b5cf6)'
    }}>
      <Loader2 size={24} className="animate-spin" />
    </div>
    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
      Cargando módulo...
    </span>
  </div>
);

const LoginView = lazy(() => import('./views/LoginView').then(module => ({ default: module.LoginView })));
const DashboardView = lazy(() => import('./views/DashboardView').then(module => ({ default: module.DashboardView })));
const ClientesView = lazy(() => import('./views/ClientesView').then(module => ({ default: module.ClientesView })));
const ProyectosView = lazy(() => import('./views/ProyectosView').then(module => ({ default: module.ProyectosView })));
const CotizacionesView = lazy(() => import('./views/CotizacionesView').then(module => ({ default: module.CotizacionesView })));
const ProveedoresView = lazy(() => import('./views/ProveedoresView').then(module => ({ default: module.ProveedoresView })));
const OrdenesView = lazy(() => import('./views/OrdenesView').then(module => ({ default: module.OrdenesView })));
const FacturacionView = lazy(() => import('./views/FacturacionView').then(module => ({ default: module.FacturacionView })));
const RentabilidadProyectoView = lazy(() => import('./views/RentabilidadProyectoView').then(module => ({ default: module.RentabilidadProyectoView })));
const PagosView = lazy(() => import('./views/PagosView').then(module => ({ default: module.PagosView })));
const GastosProduccionView = lazy(() => import('./views/GastosProduccionView').then(module => ({ default: module.GastosProduccionView })));
const LiquidacionesView = lazy(() => import('./views/LiquidacionesView').then(module => ({ default: module.LiquidacionesView })));
const ConfiguracionView = lazy(() => import('./views/ConfiguracionView').then(module => ({ default: module.ConfiguracionView })));
const UsuariosView = lazy(() => import('./views/UsuariosView').then(module => ({ default: module.UsuariosView })));
const PerfilView = lazy(() => import('./views/PerfilView').then(module => ({ default: module.PerfilView })));
const PrintCotizacionView = lazy(() => import('./views/PrintCotizacionView').then(module => ({ default: module.PrintCotizacionView })));
const PrintOrdenView = lazy(() => import('./views/PrintOrdenView').then(module => ({ default: module.PrintOrdenView })));
const PrintPagoView = lazy(() => import('./views/PrintPagoView').then(module => ({ default: module.PrintPagoView })));
const PublicGanttView = lazy(() => import('./views/PublicGanttView').then(module => ({ default: module.PublicGanttView })));
const GanttsView = lazy(() => import('./views/GanttsView').then(module => ({ default: module.GanttsView })));
const PublicBookView = lazy(() => import('./views/PublicBookView').then(module => ({ default: module.PublicBookView })));
const BooksView = lazy(() => import('./views/BooksView').then(module => ({ default: module.BooksView })));
const CalendarioView = lazy(() => import('./views/CalendarioView').then(module => ({ default: module.CalendarioView })));
const DriveView = lazy(() => import('./views/DriveView').then(module => ({ default: module.DriveView })));

const ROLE_ACCESS: Record<string, string[]> = {
  'Admin': ['dashboard', 'clientes', 'proyectos', 'cotizaciones', 'proveedores', 'ordenes', 'facturacion', 'rentabilidad', 'pagos', 'gastos', 'liquidaciones', 'gantts', 'books', 'calendario', 'drive', 'configuracion', 'usuarios', 'perfil'],
  'Directorio': ['dashboard', 'clientes', 'proyectos', 'cotizaciones', 'proveedores', 'ordenes', 'facturacion', 'rentabilidad', 'pagos', 'gastos', 'liquidaciones', 'gantts', 'books', 'calendario', 'drive', 'perfil'],
  'Cuentas': ['dashboard', 'clientes', 'proyectos', 'cotizaciones', 'proveedores', 'gantts', 'books', 'calendario', 'drive', 'perfil', 'facturacion', 'rentabilidad', 'pagos', 'liquidaciones'],
  'Producción': ['dashboard', 'proveedores', 'ordenes', 'gastos', 'gantts', 'books', 'calendario', 'drive', 'perfil', 'cotizaciones', 'pagos'],
  'Contabilidad': ['proveedores', 'facturacion', 'pagos', 'calendario', 'drive', 'perfil']
};

function AppContent() {
  const { currentUserRole, token } = useGlobalContext();
  useAutoLogout();
  const [activeModule, setActiveModule] = useState(() => {
    return currentUserRole === 'Contabilidad' ? 'pagos' : 'dashboard';
  });
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    if (!ROLE_ACCESS[currentUserRole]?.includes(activeModule)) {
      setActiveModule(ROLE_ACCESS[currentUserRole]?.[0] || 'dashboard');
    }
  }, [currentUserRole, activeModule]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_login') === 'success') {
      toast.success('¡Sesión iniciada con Google Workspace!');
      params.delete('google_login');
      params.delete('token');
      params.delete('user');
      const newQuery = params.toString() ? '?' + params.toString() : '';
      window.history.replaceState(null, '', window.location.pathname + newQuery);
    } else if (params.get('calendar_connected') === 'true') {
      toast.success('¡Google Calendar vinculado exitosamente!');
      params.delete('calendar_connected');
      const newQuery = params.toString() ? '?' + params.toString() : '';
      window.history.replaceState(null, '', window.location.pathname + newQuery);
    } else if (params.get('calendar_error')) {
      toast.error(`Error al vincular Google Calendar: ${params.get('calendar_error')}`);
      params.delete('calendar_error');
      const newQuery = params.toString() ? '?' + params.toString() : '';
      window.history.replaceState(null, '', window.location.pathname + newQuery);
    }
  }, []);

    useEffect(() => {
    const handleGlobalNav = (e: any) => {
      if (e.detail?.module) {
        handleNavigate(e.detail.module, e.detail.itemId || e.detail.quoteId || e.detail.projectId);
      }
    };
    window.addEventListener("app:navigate", handleGlobalNav);
    return () => window.removeEventListener("app:navigate", handleGlobalNav);
  }, []);

  const handleNavigate = (module: string, itemId?: string) => {
    setActiveModule(module);
    if (itemId) {
      setTimeout(() => {
        const event = new CustomEvent('navigate', { detail: { module, quoteId: module === 'cotizaciones' ? itemId : undefined, projectId: module === 'proyectos' ? itemId : undefined } });
        window.dispatchEvent(event);
      }, 100);
    }
  };

  const urlParams = new URLSearchParams(window.location.search);
  const printQuoteId = urlParams.get('print');
  const printOrdenId = urlParams.get('printOrden');
  const printPagoId = urlParams.get('printPago');
  const shareGanttToken = urlParams.get('gantt');
  const shareBookToken = urlParams.get('book');

  if (printQuoteId) {
    const cli = urlParams.get('cliente');
    const pro = urlParams.get('proyecto');
    const v = urlParams.get('v') || urlParams.get('version');
    if (cli || pro) {
      document.title = `Cotización | ${cli || 'Cliente'} - ${pro || 'Proyecto'}${v ? ` (V${v})` : ''} - PURPLE`;
    }
    return (
      <GlobalProvider>
        <Suspense fallback={<div className="flex h-screen items-center justify-center">Cargando...</div>}>
          <PrintCotizacionView quoteId={printQuoteId} />
        </Suspense>
      </GlobalProvider>
    );
  }

  if (printOrdenId) {
    return (
      <GlobalProvider>
        <Suspense fallback={<div className="flex h-screen items-center justify-center">Cargando...</div>}>
          <PrintOrdenView ordenId={printOrdenId} />
        </Suspense>
      </GlobalProvider>
    );
  }

  if (printPagoId) {
    return (
      <GlobalProvider>
        <Suspense fallback={<div className="flex h-screen items-center justify-center">Cargando...</div>}>
          <PrintPagoView pagoId={printPagoId} />
        </Suspense>
      </GlobalProvider>
    );
  }

  if (shareGanttToken) {
    const cli = urlParams.get('cliente');
    const pro = urlParams.get('proyecto');
    const v = urlParams.get('v') || urlParams.get('version');
    if (cli || pro) {
      document.title = `Cronograma | ${cli || 'Cliente'} - ${pro || 'Proyecto'}${v ? ` (V${v})` : ''} - PURPLE`;
    }
    return (
      <Suspense fallback={<div className="flex h-screen items-center justify-center">Cargando...</div>}>
        <PublicGanttView token={shareGanttToken} />
      </Suspense>
    );
  }

  if (shareBookToken) {
    const cli = urlParams.get('cliente');
    const pro = urlParams.get('proyecto');
    const v = urlParams.get('v') || urlParams.get('version');
    if (cli || pro) {
      document.title = `Presentación | ${cli || 'Cliente'} - ${pro || 'Proyecto'}${v ? ` (${v})` : ''} - PURPLE`;
    }
    return (
      <Suspense fallback={<div className="flex h-screen items-center justify-center">Cargando...</div>}>
        <PublicBookView token={shareBookToken} />
      </Suspense>
    );
  }

  if (!token) {
    return (
      <Suspense fallback={<div className="flex h-screen items-center justify-center">Cargando...</div>}>
        <LoginView />
      </Suspense>
    );
  }

  const renderView = () => {
    if (!ROLE_ACCESS[currentUserRole]?.includes(activeModule)) {
      const fallbackMod = ROLE_ACCESS[currentUserRole]?.[0] || 'dashboard';
      if (fallbackMod === 'facturacion') return <FacturacionView />;
      if (fallbackMod === 'pagos') return <PagosView />;
      return <DashboardView />;
    }

    switch (activeModule) {
      case 'dashboard': return <DashboardView />;
      case 'clientes': return <ClientesView />;
      case 'proyectos': return <ProyectosView />;
      case 'cotizaciones': return <CotizacionesView />;
      case 'proveedores': return <ProveedoresView />;
      case 'ordenes': return <OrdenesView />;
      case 'facturacion': return <FacturacionView />;
      case 'rentabilidad': return <RentabilidadProyectoView onNavigate={handleNavigate} />;
      case 'pagos': return <PagosView />;
      case 'gastos': return <GastosProduccionView />;
      case 'liquidaciones': return <LiquidacionesView />;
      case 'configuracion': return <ConfiguracionView />;
      case 'usuarios': return <UsuariosView />;
      case 'gantts': return <GanttsView />;
      case 'books': return <BooksView />;
      case 'calendario': return <CalendarioView />;
      case 'drive': return <DriveView />;
      case 'perfil': return <PerfilView />;
      default: return <DashboardView />;
    }
  };

  return (
    <Layout activeModule={activeModule} setActiveModule={setActiveModule} onOpenSearch={() => setIsSearchOpen(true)}>
      <div key={activeModule} className="page-transition" style={{ width: '100%', height: '100%' }}>
        <Suspense fallback={<ModuleFallback />}>
          {renderView()}
        </Suspense>
      </div>
      <GlobalSearchModal 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)} 
        onNavigate={handleNavigate} 
      />
      <ChatBot />
      <SmartMeetingModal />
      <SmartMeetingFloatingWidget />
    </Layout>
  );
}

function App() {
  return (
    <GlobalProvider>
      <SmartMeetingProvider>
      <Toaster 
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--bg-panel)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
            borderRadius: '12px'
          },
          success: {
            iconTheme: { primary: '#10b981', secondary: '#fff' }
          }
        }}
      />
      <AppContent />
      </SmartMeetingProvider>
    </GlobalProvider>
  );
}

export default App;
