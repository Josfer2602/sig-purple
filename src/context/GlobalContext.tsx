import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'react-hot-toast';
import type { Quote } from '../types/quote';
import type { Cliente, Proyecto, Proveedor, Orden, Pago, AppConfig, ListasDinamicas, ProjectGantt, ProjectBook, GastoProduccion, User, FacturaCliente } from '../types/models';

export type UserRole = 'Directorio' | 'Cuentas' | 'Producción' | 'Admin' | 'Contabilidad';

interface GlobalState {
  clientes: Cliente[]; proyectos: Proyecto[]; quotes: Quote[]; proveedores: Proveedor[];
  ordenes: Orden[]; pagos: Pago[]; gastosProduccion: GastoProduccion[]; gantts: ProjectGantt[]; books: ProjectBook[];
  facturasCliente: FacturaCliente[];
  appConfig: AppConfig | null; listas: ListasDinamicas | null; currentUser: User | null;
  isLoading: boolean;
  token: string | null; login: (token: string, user: User) => void; logout: () => void;
  currentUserRole: UserRole; setCurrentUserRole: (role: UserRole) => void;
  addCliente: (cliente: Cliente) => Promise<Cliente>; updateCliente: (id: string, fieldOrData: keyof Cliente | Partial<Cliente>, value?: any) => Promise<Cliente>;
  deleteCliente: (id: string) => void; addProyecto: (proyecto: Proyecto) => void;
  updateProyecto: (id: string, fieldOrData: keyof Proyecto | Partial<Proyecto>, value?: any) => Promise<Proyecto>; deleteProyecto: (id: string) => void;
  addQuote: (quote: Quote) => Promise<Quote>; updateQuote: (quote: Quote) => Promise<void>;
  deleteQuote: (id: string) => void;
  bulkUpdateQuoteStatus: (ids: string[], status: string) => Promise<void>;
  bulkDeleteQuotes: (ids: string[]) => Promise<{ deletedIds: string[]; blocked: { id: string; reason: string }[] }>;
  addProveedor: (proveedor: Proveedor) => void;
  updateProveedor: (proveedor: Proveedor) => void; deleteProveedor: (id: string) => void;
  reloadProveedores: () => Promise<void>;
  addOrden: (orden: Orden) => void; addBatchOrdenes: (ordenes: Orden[]) => Promise<Orden[]>; updateOrden: (orden: Orden) => void;
  deleteOrden: (id: string) => void;  addPago: (p: Pago | FormData) => Promise<void>; addBatchPagos: (pagosList: any[]) => Promise<Pago[]>;
  updatePago: (p: Pago | FormData, idParam?: string) => Promise<any>;
  deletePago: (id: string) => Promise<void>;
  anularPago: (id: string) => Promise<void>;
  addGantt: (gantt: ProjectGantt) => Promise<ProjectGantt>; updateGantt: (gantt: ProjectGantt) => void;
  deleteGantt: (id: string) => void;
  addBook: (book: Partial<ProjectBook>) => Promise<ProjectBook>;
  updateBook: (book: ProjectBook) => Promise<ProjectBook>;
  deleteBook: (id: string) => Promise<void>;
  addGastoProduccion: (gasto: GastoProduccion | FormData) => Promise<void>;
  addBatchGastosProduccion: (gastosList: any[]) => Promise<GastoProduccion[]>;
  updateGastoProduccion: (id: string, gasto: GastoProduccion | FormData) => Promise<void>;
  deleteGastoProduccion: (id: string) => void;
  reembolsarGastosLote: (gastoIds: string[], fechaDevolucion: string, codigoDevolucion: string, file: File | null) => Promise<void>;
  updateConfig: (config: Partial<AppConfig>) => Promise<void>;
  addFacturaCliente: (f: Partial<FacturaCliente>) => Promise<void>;
  updateFacturaCliente: (id: string, fieldOrObj: keyof FacturaCliente | Partial<FacturaCliente>, value?: any) => Promise<void>;
  deleteFacturaCliente: (id: string) => Promise<void>;
  reloadFacturasCliente: () => Promise<void>;
  usuarios: User[];
  reloadUsuarios: () => Promise<void>;
  refreshData: () => Promise<void>;
}

const GlobalContext = createContext<GlobalState | undefined>(undefined);
import { API_URL, BASE_URL } from '../utils/apiUrl';
export { API_URL, BASE_URL };

export const GlobalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [gastosProduccion, setGastosProduccion] = useState<GastoProduccion[]>([]);
  const [gantts, setGantts] = useState<ProjectGantt[]>([]);
  const [books, setBooks] = useState<ProjectBook[]>([]);
  const [facturasCliente, setFacturasCliente] = useState<FacturaCliente[]>([]);
  const [usuarios, setUsuarios] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [listas, setListas] = useState<ListasDinamicas | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('user');
    try { return saved ? JSON.parse(saved) : null; } catch(e) { return null; }
  });
  const [token, setToken] = useState<string | null>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken) {
      localStorage.setItem('token', urlToken);
      return urlToken;
    }
    return localStorage.getItem('token');
  });
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>(() => {
    const saved = localStorage.getItem('user');
    try { return saved ? (JSON.parse(saved).role as UserRole) : 'Directorio'; } catch(e) { return 'Directorio'; }
  });

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  });

  // --- FUNCIONES DE LIMPIEZA (EVITAN PANTALLA ROJA) ---
  const sanitizeQuote = (q: any): Quote => ({
    ...q,
    id: String(q?.id || ''),
    requirement: String(q?.requirement || ''),
    client: String(q?.client || ''),
    brand: String(q?.brand || ''),
    categories: (q?.categories || []).filter(Boolean).map((cat: any) => ({
      ...cat,
      name: String(cat?.name || 'CATEGORÍA'),
      items: (cat?.items || []).filter(Boolean).map((it: any) => ({
        ...it,
        id: String(it?.id || `item-${Date.now()}`),
        name: String(it?.name || 'Ítem'),
        quantity: Number(it?.quantity || 1),
        dates: Number(it?.dates || 1),
        details: Array.isArray(it?.details)
          ? it.details
          : (() => {
              try {
                const parsed = JSON.parse(it?.details || '[]');
                return Array.isArray(parsed) ? parsed : [];
              } catch {
                return [];
              }
            })(),
        subItems: (Array.isArray(it?.subItems) ? it.subItems : []).filter(Boolean).map((s: any) => ({
          ...s,
          unitCost: Number(s?.unitCost || 0),
          quantity: Number(s?.quantity || 1),
          dates: Number(s?.dates || 1)
        }))
      }))
    }))
  });

  const sanitizeOrden = (o: any): Orden => ({
    ...o,
    id: String(o.id || ''),
    total: Number(o.total || 0),
    proveedorId: String(o.proveedorId || o.proveedor?.id || ''),
    clienteId: String(o.clienteId || o.cliente?.id || ''),
    proyectoId: String(o.proyectoId || o.proyecto?.id || ''),
    fechaEmision: String(o.fechaEmision || o.createdAt || ''),
    proveedor: o.proveedor || null,
    cliente: o.cliente || null,
    proyecto: o.proyecto || null,
    items: o.items || []
  });

  const sanitizeGastoProduccion = (g: any): GastoProduccion => ({
    ...g,
    id: String(g?.id || ''),
    total: Number(g?.total || 0),
    clienteId: String(g?.clienteId || g?.cliente?.id || ''),
    proyectoId: String(g?.proyectoId || g?.proyecto?.id || ''),
    fechaEmision: String(g?.fechaEmision || g?.createdAt || ''),
    tipoComprobante: g?.tipoComprobante || 'Boleta',
    numeroComprobante: String(g?.numeroComprobante || ''),
    areaResponsable: String(g?.areaResponsable || ''),
    estadoGasto: g?.estadoGasto || 'Generado',
    esGastoAdicional: Boolean(g?.esGastoAdicional),
    motivoAdicional: String(g?.motivoAdicional || ''),
    items: Array.isArray(g?.items) ? g.items : []
  });

  const parseJsonArray = (val: any): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(String).map(s => s.trim()).filter(Boolean);
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const p = JSON.parse(trimmed);
          if (Array.isArray(p)) return p.map(String).map(s => s.trim()).filter(Boolean);
        } catch (e) {}
      }
      if (trimmed.includes(',')) {
        return trimmed.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (trimmed) return [trimmed];
    }
    return [];
  };

  const sanitizeProveedor = (p: any): Proveedor => {
    const categorias = parseJsonArray(p?.categorias);
    if (categorias.length === 0 && p?.categoria && String(p.categoria).trim()) {
      categorias.push(String(p.categoria).trim());
    }
    const subcategorias = parseJsonArray(p?.subcategorias);
    const tags = parseJsonArray(p?.tags);

    return {
      ...p,
      id: String(p?.id || ''),
      razonSocial: String(p?.razonSocial || ''),
      nombre: String(p?.nombre || ''),
      ruc: String(p?.ruc || ''),
      correo: String(p?.correo || ''),
      telefono: String(p?.telefono || ''),
      tipoDocumento: p?.tipoDocumento || 'Factura',
      categoria: categorias[0] || p?.categoria || 'General',
      categorias,
      subcategorias,
      tags,
      cuentas: Array.isArray(p?.cuentas) ? p.cuentas : []
    };
  };

  // --- CARGA DE DATOS ---
  const fetchData = async () => {
    if (!token) return;
    setIsLoading(true);
    const safeFetch = async (endpoint: string, retries = 2): Promise<any> => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const res = await fetch(`${API_URL}/${endpoint}`, { headers: getHeaders() });
          if (res.ok) {
            return await res.json();
          }
          console.warn(`[safeFetch] ${endpoint} returned status ${res.status} (attempt ${attempt + 1}/${retries + 1})`);
        } catch (e) {
          console.warn(`[safeFetch] Error fetching ${endpoint} (attempt ${attempt + 1}/${retries + 1}):`, e);
        }
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
        }
      }
      return [];
    };

    const [c, p, prov, q, o, pag, g, gant, bks, cfg, factRes, uRes] = await Promise.all([
      safeFetch('clientes'), safeFetch('proyectos'), safeFetch('proveedores'),
      safeFetch('quotes'), safeFetch('ordenes'), safeFetch('pagos'),
      safeFetch('gastos-produccion'), safeFetch('gantts'), safeFetch('books'), safeFetch('config'), safeFetch('facturas-cliente'),
      safeFetch('users')
    ]);

    setClientes(c); setProyectos(p); setProveedores((prov || []).map(sanitizeProveedor)); setPagos(pag);
    setGastosProduccion((Array.isArray(g) ? g : []).filter((x: any) => x && x.id).map(sanitizeGastoProduccion));
    setGantts(Array.isArray(gant) ? gant : []);
    setBooks(Array.isArray(bks) ? bks : []);
    setAppConfig(cfg || null);
    setOrdenes((o || []).map(sanitizeOrden));
    setQuotes((q || []).map(sanitizeQuote));
    setFacturasCliente(Array.isArray(factRes) ? factRes : []);
    setUsuarios(Array.isArray(uRes) ? uRes : []);

    if (cfg?.listasDinamicas) {
      try { setListas(typeof cfg.listasDinamicas === 'string' ? JSON.parse(cfg.listasDinamicas) : cfg.listasDinamicas); } catch (e) { }
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  // --- MÉTODOS CRUD (IMPLEMENTADOS PARA QUITAR EL AMARILLO) ---

  const addCliente = async (cliente: Cliente): Promise<Cliente> => {
    const res = await fetch(`${API_URL}/clientes`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(cliente) });
    const data = await res.json(); 
    setClientes(prev => [data, ...prev]);
    return data;
  };
  const updateCliente = async (id: string, fieldOrData: keyof Cliente | Partial<Cliente>, value?: any): Promise<Cliente> => {
    const payload = typeof fieldOrData === 'string' ? { [fieldOrData]: value } : fieldOrData;
    const res = await fetch(`${API_URL}/clientes/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(payload) });
    const data = await res.json(); 
    setClientes(prev => prev.map(c => c.id === id ? data : c));
    return data;
  };
  const deleteCliente = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/clientes/${id}`, { method: 'DELETE', headers: getHeaders() });
      if (res.ok) {
        setClientes(prev => prev.filter(c => c.id !== id));
        toast.success('Cliente eliminado');
      } else {
        const errorData = await res.json().catch(() => ({}));
        const errMsg = String(errorData.error || '');
        if (errMsg.includes('violates foreign key constraint') || errMsg.includes('Foreign key constraint failed')) {
          toast.error('No puedes eliminar este cliente porque tiene proyectos, cotizaciones o pagos vinculados.');
        } else {
          toast.error('No se pudo eliminar el cliente: ' + (errorData.error || 'Conflictos con otros datos.'));
        }
      }
    } catch (error) {
      toast.error('Error de conexión al intentar eliminar.');
    }
  };

  const addProyecto = async (proyecto: Proyecto): Promise<Proyecto> => {
    try {
      const res = await fetch(`${API_URL}/proyectos`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(proyecto) });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al crear proyecto');
      }
      const data = await res.json();
      setProyectos(prev => [data, ...prev]);
      return data;
    } catch (e: any) {
      toast.error(e.message || 'Error al crear proyecto');
      throw e;
    }
  };
  const updateProyecto = async (id: string, fieldOrData: keyof Proyecto | Partial<Proyecto>, value?: any): Promise<Proyecto> => {
    const payload = typeof fieldOrData === 'string' ? { [fieldOrData]: value } : fieldOrData;
    const { cliente, quotes, facturas, ordenes, ...cleanPayload } = payload as any;
    const res = await fetch(`${API_URL}/proyectos/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(cleanPayload) });
    const data = await res.json(); 
    setProyectos(prev => prev.map(p => p.id === id ? data : p));
    return data;
  };
  const deleteProyecto = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/proyectos/${id}`, { method: 'DELETE', headers: getHeaders() });
      if (res.ok) {
        setProyectos(prev => prev.filter(p => p.id !== id));
        toast.success('Proyecto eliminado');
      } else { 
        const e = await res.json().catch(()=>({})); 
        const errMsg = String(e.error || '');
        if (errMsg.includes('violates foreign key constraint') || errMsg.includes('Foreign key constraint failed')) {
          toast.error('No puedes eliminar este proyecto porque tiene cotizaciones, órdenes o gastos vinculados.');
        } else {
          toast.error('Error al eliminar proyecto: ' + (e.error || 'Conflictos con otros datos.')); 
        }
      }
    } catch (err) { toast.error('Error de conexión'); }
  };

  const addQuote = async (quote: Quote) => {
    const { totalClient, history, ordenes, pagos, gastosProduccion, ...cleanQuotePayload } = quote as any;
    const res = await fetch(`${API_URL}/quotes`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(cleanQuotePayload) });
    const data = await res.json();
    if (!res.ok) {
      toast.error('Error al crear cotización: ' + (data.error || ''));
      throw new Error(data.error || 'Error al crear cotización');
    }
    const dataWithCategories = {
      ...data,
      categories: (Array.isArray(data.categories) && data.categories.length > 0)
        ? data.categories
        : (Array.isArray(quote.categories) && quote.categories.length > 0 ? quote.categories : (data.categories || []))
    };
    const clean = sanitizeQuote(dataWithCategories);
    setQuotes(prev => [clean, ...prev.filter(q => q.id !== clean.id)]); 
    if (clean.projectId) {
      fetch(`${API_URL}/proyectos`, { headers: getHeaders() })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setProyectos(data); })
        .catch(() => {});
    }
    return clean;
  };
  const updateQuote = async (quote: Quote) => {
    const { totalClient, history, ordenes, pagos, gastosProduccion, ...cleanQuotePayload } = quote as any;
    const res = await fetch(`${API_URL}/quotes/${quote.id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(cleanQuotePayload) });
    const data = await res.json();
    if (!res.ok) {
      toast.error('Error al actualizar cotización: ' + (data.error || ''));
      throw new Error(data.error || 'Error al actualizar cotización');
    }
    const dataWithCategories = {
      ...data,
      categories: (Array.isArray(data.categories) && data.categories.length > 0)
        ? data.categories
        : (Array.isArray(quote.categories) && quote.categories.length > 0 ? quote.categories : (data.categories || []))
    };
    const clean = sanitizeQuote(dataWithCategories);
    setQuotes(prev => prev.map(q => q.id === quote.id ? clean : q));

    if (clean.projectId) {
      fetch(`${API_URL}/proyectos`, { headers: getHeaders() })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setProyectos(data); })
        .catch(() => {});
    }

    if (clean.projectId && (clean.status || '').toLowerCase().includes('aprob')) {
      const targetProj = proyectos.find(p => p.id === clean.projectId);
      if (targetProj && ['Registrado', 'Cotización Enviada'].includes(targetProj.estado)) {
        updateProyecto(targetProj.id, { estado: 'Aprobado' }).catch(() => {});
      }
    }
  };
  const deleteQuote = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/quotes/${id}`, { method: 'DELETE', headers: getHeaders() });
      if (res.ok) {
        setQuotes(prev => prev.filter(q => q.id !== id));
        toast.success('Cotización eliminada correctamente.');
      } else {
        const e = await res.json().catch(() => ({}));
        const msg = e.error || 'No se puede eliminar la cotización debido a dependencias con órdenes o proyectos.';
        toast.error(msg, { duration: 6000 });
      }
    } catch (err: any) {
      toast.error('Error de conexión al eliminar la cotización.');
    }
  };

  const bulkUpdateQuoteStatus = async (ids: string[], status: string) => {
    try {
      const res = await fetch(`${API_URL}/quotes/bulk-status`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ ids, status })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar estado');
      setQuotes(prev => prev.map(q => ids.includes(q.id) ? { ...q, status } : q));
      toast.success(`${ids.length} cotizaciones actualizadas a estado "${status}".`);
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar cotizaciones.');
      throw err;
    }
  };

  const bulkDeleteQuotes = async (ids: string[]) => {
    try {
      const res = await fetch(`${API_URL}/quotes/bulk-delete`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ ids })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al procesar eliminación masiva');
      if (data.deletedIds && data.deletedIds.length > 0) {
        setQuotes(prev => prev.filter(q => !data.deletedIds.includes(q.id)));
      }
      return data;
    } catch (err: any) {
      toast.error(err.message || 'Error de conexión');
      throw err;
    }
  };

  const addProveedor = async (proveedor: Proveedor) => {
    const payload = {
      ...proveedor,
      categorias: Array.isArray(proveedor.categorias) ? JSON.stringify(proveedor.categorias) : proveedor.categorias,
      subcategorias: Array.isArray(proveedor.subcategorias) ? JSON.stringify(proveedor.subcategorias) : proveedor.subcategorias,
      tags: Array.isArray(proveedor.tags) ? JSON.stringify(proveedor.tags) : proveedor.tags
    };
    const res = await fetch(`${API_URL}/proveedores`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(payload) });
    const data = await res.json(); 
    if (!res.ok) throw new Error(data.error || 'Error al crear proveedor');
    setProveedores(prev => [sanitizeProveedor(data), ...prev]);
  };
  const updateProveedor = async (p: Proveedor) => {
    const payload = {
      ...p,
      categorias: Array.isArray(p.categorias) ? JSON.stringify(p.categorias) : p.categorias,
      subcategorias: Array.isArray(p.subcategorias) ? JSON.stringify(p.subcategorias) : p.subcategorias,
      tags: Array.isArray(p.tags) ? JSON.stringify(p.tags) : p.tags
    };
    const res = await fetch(`${API_URL}/proveedores/${p.id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(payload) });
    const data = await res.json(); 
    if (!res.ok) throw new Error(data.error || 'Error al actualizar proveedor');
    setProveedores(prev => prev.map(x => x.id === p.id ? sanitizeProveedor(data) : x));
  };
  const deleteProveedor = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/proveedores/${id}`, { method: 'DELETE', headers: getHeaders() });
      if (res.ok) {
        setProveedores(prev => prev.filter(p => p.id !== id));
        toast.success('Proveedor eliminado');
      } else { 
        const e = await res.json().catch(()=>({}));
        const errMsg = String(e.error || '');
        if (errMsg.includes('violates foreign key constraint') || errMsg.includes('Foreign key constraint failed')) {
          toast.error('No puedes eliminar este proveedor porque tiene órdenes, gastos o pagos vinculados.');
        } else {
          toast.error('Error al eliminar proveedor: ' + (e.error || 'Conflictos con otros datos.'));
        }
      }
    } catch (err) { toast.error('Error de conexión'); }
  };

  const reloadProveedores = async () => {
    try {
      const res = await fetch(`${API_URL}/proveedores`, { headers: getHeaders() });
      if (res.ok) {
        const prov = await res.json();
        setProveedores((prov || []).map(sanitizeProveedor));
      }
    } catch (e) {
      console.error('Error recargando proveedores:', e);
    }
  };

  const addOrden = async (o: Orden) => {
    const res = await fetch(`${API_URL}/ordenes`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(o) });
    const data = await res.json(); 
    if (!res.ok) throw new Error(data.error || 'Error al crear orden');
    const clean = sanitizeOrden(data);
    setOrdenes(prev => [clean, ...prev]);
  };
  const addBatchOrdenes = async (ordenesList: Orden[]) => {
    const res = await fetch(`${API_URL}/ordenes/batch`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ ordenes: ordenesList }) });
    const data = await res.json(); 
    if (!res.ok) throw new Error(data.error || 'Error al crear órdenes en lote');
    const cleanList = Array.isArray(data) ? data.map(sanitizeOrden) : [];
    setOrdenes(prev => [...cleanList, ...prev]);
    return cleanList;
  };
  const updateOrden = async (o: Orden) => {
    const res = await fetch(`${API_URL}/ordenes/${o.id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(o) });
    const data = await res.json(); 
    if (!res.ok) throw new Error(data.error || 'Error al actualizar orden');
    const clean = sanitizeOrden(data);
    setOrdenes(prev => prev.map(x => x.id === o.id ? clean : x));
  };
  const deleteOrden = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/ordenes/${id}`, { method: 'DELETE', headers: getHeaders() });
      if (res.ok) setOrdenes(prev => prev.filter(o => o.id !== id));
      else { const e = await res.json().catch(()=>({})); toast.error('Error al eliminar orden: ' + (e.error || 'Conflictos con otros datos.')); }
    } catch (err) { toast.error('Error de conexión'); }
  };

  const addBatchPagos = async (pagosList: any[]) => {
    const res = await fetch(`${API_URL}/pagos/batch`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ pagos: pagosList })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al crear pagos en lote');
    const createdList = Array.isArray(data.data) ? data.data : [];
    setPagos(prev => [...createdList, ...prev]);
    return createdList;
  };

  const addPago = async (pago: Pago | FormData) => {
    const isFD = pago instanceof FormData;
    const h = { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };
    if (!isFD) (h as any)['Content-Type'] = 'application/json';
    const res = await fetch(`${API_URL}/pagos`, { method: 'POST', headers: h, body: isFD ? pago : JSON.stringify(pago) });
    const data = await res.json(); 
    if (!res.ok) throw new Error(data.error || 'Error al guardar el pago');
    setPagos(prev => [data, ...prev]);
  };
  const updatePago = async (p: Pago | FormData, idParam?: string) => {
    let pagoId = idParam;
    let fetchOptions: RequestInit;

    if (p instanceof FormData) {
      if (!pagoId) {
        const dataField = p.get('data');
        if (typeof dataField === 'string') {
          try {
            const parsed = JSON.parse(dataField);
            pagoId = parsed.id;
          } catch (e) {}
        }
      }
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      fetchOptions = {
        method: 'PUT',
        headers,
        body: p
      };
    } else {
      pagoId = p.id;
      fetchOptions = {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(p)
      };
    }

    if (!pagoId) throw new Error('ID de pago no especificado');

    const res = await fetch(`${API_URL}/pagos/${pagoId}`, fetchOptions);
    const data = await res.json(); 
    if (!res.ok) throw new Error(data.error || 'Error al actualizar pago');
    setPagos(prev => prev.map(x => x.id === pagoId ? data : x));
    return data;
  };
  const deletePago = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/pagos/${id}`, { method: 'DELETE', headers: getHeaders() });
      if (res.ok) setPagos(prev => prev.filter(p => p.id !== id));
      else { const e = await res.json().catch(()=>({})); toast.error('Error al eliminar pago: ' + (e.error || 'Conflictos con otros datos.')); }
    } catch (err) { toast.error('Error de conexión'); }
  };
  const anularPago = async (id: string) => {
    const res = await fetch(`${API_URL}/pagos/${id}/anular`, { method: 'POST', headers: getHeaders() });
    if (!res.ok) throw new Error('Error al anular pago');
    setPagos(prev => prev.map(p => p.id === id ? { ...p, estado: 'Anulado' } : p));
  };

  const addGantt = async (g: ProjectGantt) => {
    const res = await fetch(`${API_URL}/gantts`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(g) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al guardar cronograma');
    setGantts(prev => [...prev.filter(x => x.id !== data.id), data]);
    return data;
  };
  const updateGantt = async (g: ProjectGantt) => {
    const res = await fetch(`${API_URL}/gantts/${g.id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(g) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al actualizar cronograma');
    setGantts(prev => prev.map(x => x.id === g.id ? data : x));
  };
  const deleteGantt = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/gantts/${id}`, { method: 'DELETE', headers: getHeaders() });
      if (res.ok) setGantts(prev => prev.filter(g => g.id !== id));
      else { const e = await res.json().catch(()=>({})); toast.error('Error al eliminar Gantt: ' + (e.error || 'Conflictos con otros datos.')); }
    } catch (err) { toast.error('Error de conexión'); }
  };

  const addBook = async (b: Partial<ProjectBook>): Promise<ProjectBook> => {
    const res = await fetch(`${API_URL}/books`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(b) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al crear presentación');
    setBooks(prev => [data, ...prev.filter(x => x.id !== data.id)]);
    return data;
  };
  const updateBook = async (b: ProjectBook): Promise<ProjectBook> => {
    const res = await fetch(`${API_URL}/books/${b.id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(b) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al actualizar presentación');
    setBooks(prev => prev.map(x => x.id === b.id ? data : x));
    return data;
  };
  const deleteBook = async (id: string) => {
    const res = await fetch(`${API_URL}/books/${id}`, { method: 'DELETE', headers: getHeaders() });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || 'Error al eliminar presentación');
    }
    setBooks(prev => prev.filter(b => b.id !== id));
  };

  const addGastoProduccion = async (g: GastoProduccion | FormData) => {
    const isFD = g instanceof FormData;
    const res = await fetch(`${API_URL}/gastos-produccion`, {
      method: 'POST',
      headers: isFD ? (token ? { 'Authorization': `Bearer ${token}` } : {}) : getHeaders(),
      body: isFD ? g : JSON.stringify(g)
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error('Error al registrar gasto: ' + (data.error || ''));
      throw new Error(data.error || 'Error al registrar gasto');
    }
    const clean = sanitizeGastoProduccion(data);
    setGastosProduccion(prev => [clean, ...prev]);
  };
  const addBatchGastosProduccion = async (gastosList: any[]) => {
    const res = await fetch(`${API_URL}/gastos-produccion/batch`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ gastos: gastosList })
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error('Error al registrar gastos en lote: ' + (data.error || ''));
      throw new Error(data.error || 'Error al registrar gastos en lote');
    }
    const cleanList = Array.isArray(data) ? data.map(sanitizeGastoProduccion) : [];
    setGastosProduccion(prev => [...cleanList, ...prev]);
    return cleanList;
  };
  const updateGastoProduccion = async (id: string, g: GastoProduccion | FormData) => {
    const isFD = g instanceof FormData;
    const res = await fetch(`${API_URL}/gastos-produccion/${id}`, {
      method: 'PUT',
      headers: isFD ? (token ? { 'Authorization': `Bearer ${token}` } : {}) : getHeaders(),
      body: isFD ? g : JSON.stringify(g)
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error('Error al actualizar gasto: ' + (data.error || ''));
      throw new Error(data.error || 'Error al actualizar gasto');
    }
    const clean = sanitizeGastoProduccion(data);
    setGastosProduccion(prev => prev.map(x => x.id === id ? clean : x));
  };
  const deleteGastoProduccion = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/gastos-produccion/${id}`, { method: 'DELETE', headers: getHeaders() });
      if (res.ok) setGastosProduccion(prev => prev.filter(g => g.id !== id));
      else { const e = await res.json().catch(()=>({})); toast.error('Error al eliminar gasto: ' + (e.error || 'Conflictos con otros datos.')); }
    } catch (error) { toast.error('Error de conexión'); }
  };

  const reembolsarGastosLote = async (gastoIds: string[], fechaDevolucion: string, codigoDevolucion: string, file: File | null) => {
    const formData = new FormData();
    formData.append('gastoIds', JSON.stringify(gastoIds));
    formData.append('fechaDevolucion', fechaDevolucion);
    formData.append('codigoDevolucion', codigoDevolucion);
    if (file) formData.append('comprobanteFile', file);

    const res = await fetch(`${API_URL}/gastos-produccion/devolucion-lote`, {
      method: 'POST',
      headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al procesar la devolución en lote');

    if (Array.isArray(data.gastos)) {
      setGastosProduccion(prev => prev.map(g => {
        const updated = data.gastos.find((u: any) => u.id === g.id);
        return updated ? sanitizeGastoProduccion({ ...g, ...updated }) : g;
      }));
    }
  };

  const updateConfig = async (c: Partial<AppConfig>) => {
    const res = await fetch(`${API_URL}/config`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(c) });
    const data = await res.json(); 
    setAppConfig(data);
    if (data?.listasDinamicas) {
      try {
        setListas(typeof data.listasDinamicas === 'string' ? JSON.parse(data.listasDinamicas) : data.listasDinamicas);
      } catch (e) {}
    }
  };

  const login = (newToken: string, user: User) => {
    setToken(newToken); setCurrentUser(user); setCurrentUserRole(user.role as UserRole);
    localStorage.setItem('token', newToken); localStorage.setItem('user', JSON.stringify(user));
  };
  const logout = () => { setToken(null); setCurrentUser(null); localStorage.removeItem('token'); localStorage.removeItem('user'); };

  const addFacturaCliente = async (f: Partial<FacturaCliente>) => {
    try {
      const res = await fetch(`${API_URL}/facturas-cliente`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(f)
      });
      if (res.ok) {
        const data = await res.json();
        setFacturasCliente(prev => [...prev, data]);
      }
    } catch (error) { console.error(error); }
  };

  const updateFacturaCliente = async (id: string, fieldOrObj: keyof FacturaCliente | Partial<FacturaCliente>, value?: any) => {
    const patch = typeof fieldOrObj === 'string' ? { [fieldOrObj]: value } : fieldOrObj;
    setFacturasCliente(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
    try {
      await fetch(`${API_URL}/facturas-cliente/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(patch)
      });
    } catch (error) { console.error(error); }
  };

  const deleteFacturaCliente = async (id: string) => {
    setFacturasCliente(prev => prev.filter(f => f.id !== id));
    try {
      await fetch(`${API_URL}/facturas-cliente/${id}`, { method: 'DELETE', headers: getHeaders() });
    } catch (error) { console.error(error); }
  };

  const reloadFacturasCliente = async () => {
    try {
      const res = await fetch(`${API_URL}/facturas-cliente`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setFacturasCliente(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Error reloading facturas:', e);
    }
  };

  const reloadUsuarios = async () => {
    try {
      const res = await fetch(`${API_URL}/users`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setUsuarios(Array.isArray(data) ? data : []);
      }
    } catch (e) { console.error(e); }
  };

  return (
    <GlobalContext.Provider value={{
      clientes, proyectos, quotes, proveedores, ordenes, pagos, gastosProduccion, gantts, books,
      appConfig, listas, currentUser, isLoading, token, login, logout, currentUserRole, setCurrentUserRole,
      addCliente, updateCliente, deleteCliente,
      addProyecto, updateProyecto, deleteProyecto, facturasCliente, addFacturaCliente, updateFacturaCliente, deleteFacturaCliente, reloadFacturasCliente,
      addQuote, updateQuote, deleteQuote, bulkUpdateQuoteStatus, bulkDeleteQuotes,
      addProveedor, updateProveedor, deleteProveedor, reloadProveedores,
      addOrden, addBatchOrdenes, updateOrden, deleteOrden,
      addPago, addBatchPagos, updatePago, deletePago, anularPago,
      addGantt, updateGantt, deleteGantt,
      addBook, updateBook, deleteBook,
      addGastoProduccion, addBatchGastosProduccion, updateGastoProduccion, deleteGastoProduccion, reembolsarGastosLote,
      updateConfig,
      usuarios, reloadUsuarios, refreshData: fetchData
    }}>
      {children}
    </GlobalContext.Provider>
  );
};

export const useGlobalContext = () => {
  const context = useContext(GlobalContext);
  if (context === undefined) throw new Error('useGlobalContext must be used within a GlobalProvider');
  return context;
};