import React, { useState, useMemo, useRef } from 'react';
import { 
  CreditCard, Eye, CheckCircle, Trash2, Search, ChevronDown, ChevronRight, ChevronLeft, 
  X, FileText, Receipt, Layers, FileSpreadsheet, UploadCloud, AlertCircle,
  ArrowUpDown, ArrowUp, ArrowDown, List, FolderTree, Building2, Briefcase, Store
} from 'lucide-react';
import { useGlobalContext, BASE_URL } from '../context/GlobalContext';
import { CreatePagoModal } from '../components/CreatePagoModal';
import { CreatePagosMasivosModal } from '../components/CreatePagosMasivosModal';
import { PagoDocumentModal } from '../components/PagoDocumentModal';
import { OrdenDocumentModal } from '../components/OrdenDocumentModal';
import { RegularizarComprobanteModal } from '../components/RegularizarComprobanteModal';
import { ConfirmPagoModal } from '../components/ConfirmPagoModal';
import { SkeletonTable } from '../components/SkeletonTable';
import { exportPagosToExcel } from '../utils/excelExport';
import { resolveEffectiveDetraccion } from '../utils/ordenPaymentHelper';
import type { Pago, Orden } from '../types/models';
import toast from 'react-hot-toast';

type SortField = 'id' | 'proveedor' | 'cliente' | 'proyecto' | 'ordenId' | 'fechaRegistro' | 'fechaPago' | 'tipoPago' | 'monto' | 'estado';
type SortOrder = 'asc' | 'desc';

export const PagosView: React.FC = () => {
  const { pagos, proveedores, ordenes, clientes, proyectos, updatePago, deletePago, anularPago, currentUserRole, isLoading } = useGlobalContext();
  
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('flat');
  const [sortField, setSortField] = useState<SortField>('fechaPago');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isMasivoModalOpen, setIsMasivoModalOpen] = useState(false);
  const [pagoToView, setPagoToView] = useState<Pago | null>(null);
  const [ordenToView, setOrdenToView] = useState<Orden | null>(null);
  const [pagoToConfirm, setPagoToConfirm] = useState<Pago | null>(null);
  const [pagoToRegularize, setPagoToRegularize] = useState<Pago | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClienteId, setFilterClienteId] = useState('');
  const [filterProveedorId, setFilterProveedorId] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [activeTab, setActiveTab] = useState<'pagos' | 'autorizacion' | 'regularizar'>('pagos');
  const [selectedPagos, setSelectedPagos] = useState<string[]>([]);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const handleScrollTable = (direction: 'left' | 'right') => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollBy({
        left: direction === 'left' ? -350 : 350,
        behavior: 'smooth'
      });
    }
  };

  const isComprobantePendiente = (p: Pago) => {
    if (!p) return false;
    const num = (p.numeroComprobante || '').trim().toUpperCase();
    return !p.comprobanteUrl || num === 'POR REGULARIZAR' || num === 'PENDIENTE' || num === '';
  };

  const pendingComprobantesCount = useMemo(() => {
    return (pagos || []).filter(p => p && p.estado !== 'Anulado' && isComprobantePendiente(p)).length;
  }, [pagos]);

  const proveedorDict = useMemo(() => proveedores.reduce((acc, p) => ({ ...acc, [p.id]: p.razonSocial }), {} as Record<string, string>), [proveedores]);
  const proveedorTipoDocDict = useMemo(
    () => proveedores.reduce((acc, p) => ({ ...acc, [p.id]: p.tipoDocumento || '' }), {} as Record<string, string>),
    [proveedores]
  );
  const ordenById = useMemo(
    () => ordenes.reduce((acc, o) => ({ ...acc, [o.id]: o }), {} as Record<string, Orden>),
    [ordenes]
  );
  const clienteDict = useMemo(() => clientes.reduce((acc, c) => ({ ...acc, [c.id]: c.empresa }), {} as Record<string, string>), [clientes]);
  const proyectoDict = useMemo(() => proyectos.reduce((acc, p) => ({ ...acc, [p.id]: p.nombre }), {} as Record<string, string>), [proyectos]);

  const getProveedorName = (id?: string) => (id && proveedorDict[id]) ? String(proveedorDict[id]) : 'Desconocido';
  const getClienteName = (id?: string) => (id && clienteDict[id]) ? String(clienteDict[id]) : 'Desconocido';
  const getProyectoName = (id?: string) => (id && proyectoDict[id]) ? String(proyectoDict[id]) : 'Desconocido';

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 }).format(amount);
  };

  // --- FILTRADO DE PAGOS ---
  const filteredPagos = useMemo(() => {
    return (pagos || []).filter(p => {
      if (!p) return false;
      const searchLower = (searchTerm || '').toLowerCase();
      const proveedorName = getProveedorName(p.proveedorId).toLowerCase();
      const clienteName = getClienteName(p.clienteId).toLowerCase();
      const proyectoName = getProyectoName(p.proyectoId).toLowerCase();
      const idLower = String(p.id || '').toLowerCase();
      const ordenId = String(p.ordenId || '').toLowerCase();
      const comprobante = String(p.numeroComprobante || '').toLowerCase();
      const comentarios = String(p.comentarios || p.notas || '').toLowerCase();
      const concepto = String(p.concepto || '').toLowerCase();

      if (searchTerm) {
        const matchSearch =
          proveedorName.includes(searchLower) ||
          clienteName.includes(searchLower) ||
          proyectoName.includes(searchLower) ||
          idLower.includes(searchLower) ||
          ordenId.includes(searchLower) ||
          comprobante.includes(searchLower) ||
          comentarios.includes(searchLower) ||
          concepto.includes(searchLower);

        if (!matchSearch) return false;
      }

      if (filterClienteId && p.clienteId !== filterClienteId) return false;
      if (filterProveedorId && p.proveedorId !== filterProveedorId) return false;
      if (filterEstado && p.estado !== filterEstado) return false;

      if (activeTab === 'autorizacion') {
        return p.estado === 'Pendiente';
      }

      if (activeTab === 'regularizar') {
        if (p.estado === 'Anulado') return false;
        return isComprobantePendiente(p);
      }

      if (currentUserRole === 'Contabilidad') {
        return p.estado === 'Autorizado' || p.estado === 'Pagado';
      }

      return true;
    });
  }, [pagos, searchTerm, filterClienteId, filterProveedorId, filterEstado, activeTab, currentUserRole, proveedorDict, clienteDict, proyectoDict]);

  const visibleTotalSum = useMemo(() => {
    return filteredPagos.reduce((sum, p) => sum + (Number(p.monto) || 0), 0);
  }, [filteredPagos]);

  // --- ORDENAMIENTO DE PAGOS ---
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'monto' || field === 'fechaPago' ? 'desc' : 'asc');
    }
  };

  const renderSortHeader = (label: string, field: SortField, className = 'text-left', style: React.CSSProperties = {}) => {
    const isActive = sortField === field;
    return (
      <th
        className={`header-custom ${className}`}
        style={{
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background-color 0.15s, color 0.15s',
          ...style
        }}
        onClick={() => handleSort(field)}
        title={`Ordenar por ${label} (${isActive && sortOrder === 'asc' ? 'descendente' : 'ascendente'})`}
      >
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          justifyContent: className.includes('text-center') ? 'center' : className.includes('text-right') ? 'flex-end' : 'flex-start',
          width: '100%'
        }}>
          <span style={{ color: isActive ? 'var(--accent-primary)' : 'inherit', fontWeight: isActive ? 700 : 'inherit' }}>
            {label}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', opacity: isActive ? 1 : 0.35, color: isActive ? 'var(--accent-primary)' : 'inherit' }}>
            {isActive ? (
              sortOrder === 'asc' ? <ArrowUp size={13} strokeWidth={2.5} /> : <ArrowDown size={13} strokeWidth={2.5} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </span>
        </div>
      </th>
    );
  };

  const sortedPagos = useMemo(() => {
    return [...filteredPagos].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'id':
          comparison = (a.id || '').localeCompare(b.id || '', undefined, { numeric: true });
          break;
        case 'proveedor':
          comparison = getProveedorName(a.proveedorId).localeCompare(getProveedorName(b.proveedorId));
          break;
        case 'cliente':
          comparison = getClienteName(a.clienteId).localeCompare(getClienteName(b.clienteId));
          break;
        case 'proyecto':
          comparison = getProyectoName(a.proyectoId).localeCompare(getProyectoName(b.proyectoId));
          break;
        case 'ordenId':
          comparison = (a.ordenId || '').localeCompare(b.ordenId || '', undefined, { numeric: true });
          break;
        case 'fechaRegistro':
          comparison = (a.fechaRegistro || '').localeCompare(b.fechaRegistro || '');
          break;
        case 'fechaPago':
          comparison = (a.fechaPago || '').localeCompare(b.fechaPago || '');
          break;
        case 'tipoPago':
          comparison = (a.tipoPago || '').localeCompare(b.tipoPago || '');
          break;
        case 'monto':
          comparison = (Number(a.monto) || 0) - (Number(b.monto) || 0);
          break;
        case 'estado':
          comparison = (a.estado || '').localeCompare(b.estado || '');
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredPagos, sortField, sortOrder, proveedores, clientes, proyectos]);

  // --- PAGINACIÓN ---
  const totalPages = Math.ceil(sortedPagos.length / pageSize) || 1;
  const paginatedPagos = useMemo(() => {
    return viewMode === 'flat'
      ? sortedPagos.slice((currentPage - 1) * pageSize, currentPage * pageSize)
      : sortedPagos;
  }, [sortedPagos, currentPage, pageSize, viewMode]);

  // --- AGRUPACIÓN JERÁRQUICA (VISTA ALTERNATIVA) ---
  const groupedPagos = useMemo(() => {
    const grouped: Record<string, Record<string, Pago[]>> = {};
    filteredPagos.forEach(p => {
      if (!grouped[p.clienteId]) grouped[p.clienteId] = {};
      if (!grouped[p.clienteId][p.proyectoId]) grouped[p.clienteId][p.proyectoId] = [];
      grouped[p.clienteId][p.proyectoId].push(p);
    });
    return grouped;
  }, [filteredPagos]);

  const flattenedRows = useMemo(() => {
    const rows: any[] = [];
    Object.keys(groupedPagos).forEach(clienteId => {
      rows.push({ type: 'client', id: clienteId });
      if (expandedClients[clienteId]) {
        const clientProjects = groupedPagos[clienteId];
        Object.keys(clientProjects).forEach(proyectoId => {
          rows.push({ type: 'project', id: proyectoId, clienteId });
          if (expandedProjects[proyectoId]) {
            const projectPagos = clientProjects[proyectoId];
            projectPagos.forEach(pago => {
              rows.push({ type: 'pago', pago, clienteId, proyectoId });
            });
          }
        });
      }
    });
    return rows;
  }, [groupedPagos, expandedClients, expandedProjects]);

  const formatId = (id: string, prefix = 'PAG') => {
    if (id.length > 15 && id.includes('-')) {
      return `${prefix}-${id.split('-')[0].toUpperCase()}`;
    }
    return id;
  };

  const getBadgeClass = (estado: string) => {
    if (estado === 'Pagado') return 'badge-success';
    if (estado === 'Anulado') return 'badge-danger';
    if (estado === 'Rechazado') return 'badge-danger';
    return 'badge-warning';
  };

  const handleDelete = (id: string) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar este pago silenciosamente (borrado por error de tipeo)? Esta acción no se puede deshacer y no enviará correos.')) {
      deletePago(id);
    }
  };

  const handleAnular = async (id: string) => {
    if (window.confirm('¿Anular formalmente este pago? Se cambiará su estado a "Anulado" y se enviará un correo de notificación al proveedor.')) {
      try {
        await anularPago(id);
        toast.success('Pago anulado y proveedor notificado exitosamente.');
      } catch (err: any) {
        toast.error('Error al anular pago: ' + (err?.message || 'Error'));
      }
    }
  };

  const handleMarcarPagado = (pago: Pago) => {
    setPagoToConfirm(pago);
  };

  const toggleClient = (clientId: string) => {
    setExpandedClients(prev => ({ ...prev, [clientId]: prev[clientId] === false ? true : false }));
  };

  const toggleProject = (projectId: string) => {
    setExpandedProjects(prev => ({ ...prev, [projectId]: prev[projectId] === false ? true : false }));
  };

  const handleAutorizarPagos = async () => {
    if (selectedPagos.length === 0) return toast.error('Seleccione al menos un pago');
    if (!window.confirm(`¿Autorizar ${selectedPagos.length} pago(s) para Contabilidad?`)) return;
    setIsAuthorizing(true);
    try {
      for (const id of selectedPagos) {
        const pago = pagos.find(p => p.id === id);
        if (pago) await updatePago({ ...pago, estado: 'Autorizado' });
      }
      toast.success('Pagos autorizados correctamente');
      setSelectedPagos([]);
    } catch (e: any) {
      console.error('Error al autorizar pagos:', e);
      toast.error('Error al autorizar pagos: ' + (e?.message || 'Error de conexión'));
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleSelectPago = (id: string) => {
    setSelectedPagos(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleToggleSelectAllPagos = () => {
    const visibleIds = paginatedPagos.map(p => p.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedPagos.includes(id));
    if (allSelected) {
      setSelectedPagos(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedPagos(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const hasActiveFilters = Boolean(searchTerm || filterClienteId || filterProveedorId || filterEstado);

  const clearAllFilters = () => {
    setSearchTerm('');
    setFilterClienteId('');
    setFilterProveedorId('');
    setFilterEstado('');
  };

  const pagoOrden = pagoToView ? ordenes.find(o => o.id === pagoToView.ordenId) : undefined;
  const pagoProveedor = pagoToView ? proveedores.find(p => p.id === pagoToView.proveedorId) : undefined;
  const pagoCliente = pagoToView ? clientes.find(c => c.id === pagoToView.clienteId) : undefined;
  const pagoProyecto = pagoToView ? proyectos.find(p => p.id === pagoToView.proyectoId) : undefined;

  return (
    <div className="animate-fade-in">
      {/* HEADER PRINCIPAL UNIFICADO */}
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '14px' }}>
        {/* PESTAÑAS MAESTRAS DE TESORERÍA */}
        <div className="unified-tabs" style={{ marginBottom: 0, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button 
            className={`unified-tab ${activeTab === 'pagos' ? 'active' : ''}`} 
            onClick={() => { setActiveTab('pagos'); setSelectedPagos([]); }}
          >
            Todos los Pagos
            <span className="unified-tab-badge">{pagos.length}</span>
          </button>
          {(currentUserRole === 'Directorio' || currentUserRole === 'Admin') && (
            <button 
              className={`unified-tab ${activeTab === 'autorizacion' ? 'active' : ''}`} 
              onClick={() => { setActiveTab('autorizacion'); setSelectedPagos([]); }}
            >
              Bandeja de Autorización
              {pagos.filter(p => p.estado === 'Pendiente').length > 0 && (
                <span className="unified-tab-badge badge-warning">
                  {pagos.filter(p => p.estado === 'Pendiente').length}
                </span>
              )}
            </button>
          )}
          <button 
            className={`unified-tab ${activeTab === 'regularizar' ? 'active' : ''}`} 
            onClick={() => { setActiveTab('regularizar'); setSelectedPagos([]); }}
            style={{
              color: activeTab === 'regularizar' ? '#b45309' : undefined
            }}
          >
            ⚠️ Por Regularizar Facturas
            {pendingComprobantesCount > 0 && (
              <span className="unified-tab-badge" style={{ backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}>
                {pendingComprobantesCount}
              </span>
            )}
          </button>
        </div>

        {/* ACCIONES DE TESORERÍA */}
        <div className="view-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button 
            type="button" 
            className="btn-excel" 
            onClick={() => exportPagosToExcel(pagos, proveedores, proyectos, ordenes)}
            title="Descargar base completa de pagos a proveedores en Excel (.xlsx)"
          >
            <FileSpreadsheet size={16} />
            <span>Exportar Excel</span>
          </button>
          <button 
            className="btn-secondary" 
            onClick={() => setIsMasivoModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Layers size={18} color="#7c3aed" />
            <span>Registrar Pagos Masivos</span>
          </button>
          <button className="btn-primary" onClick={() => setIsCreateModalOpen(true)}>
            <CreditCard size={18} />
            <span>Registrar Nuevo Pago</span>
          </button>
        </div>
      </div>

      {/* BANNER FLOTANTE DE AUTORIZACIÓN */}
      {activeTab === 'autorizacion' && (
        <div className="glass-panel" style={{ padding: '14px 20px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(102, 45, 145, 0.08)', border: '1.5px solid var(--accent-primary)', borderRadius: '10px' }}>
          <span style={{ fontWeight: 'bold', color: 'var(--accent-primary)', fontSize: '15px' }}>
            ✓ {selectedPagos.length} pago(s) seleccionado(s) para autorización
          </span>
          <button 
            className="btn-primary" 
            onClick={handleAutorizarPagos} 
            disabled={selectedPagos.length === 0 || isAuthorizing}
            style={{ backgroundColor: 'var(--success)', borderColor: 'var(--success)', fontSize: '13px' }}
          >
            {isAuthorizing ? 'Autorizando...' : 'Autorizar para Contabilidad'}
          </button>
        </div>
      )}

      {/* PANEL DE FILTROS UNIFICADO */}
      <div className="unified-filter-panel">
        <div className="unified-filter-group search-group">
          <label className="unified-filter-label">Búsqueda Rápida</label>
          <div className="unified-search-wrapper">
            <Search size={16} className="unified-search-icon" />
            <input 
              type="text" 
              placeholder="Buscar por ID de pago, orden, comprobante, proveedor, cliente o proyecto..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="unified-search-input" 
            />
          </div>
        </div>

        <div className="unified-filter-group fixed-width">
          <label className="unified-filter-label">Cliente</label>
          <select
            value={filterClienteId}
            onChange={e => setFilterClienteId(e.target.value)}
            className="unified-select"
          >
            <option value="">Todos los Clientes</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>{c.empresa}</option>
            ))}
          </select>
        </div>

        <div className="unified-filter-group fixed-width">
          <label className="unified-filter-label">Proveedor</label>
          <select
            value={filterProveedorId}
            onChange={e => setFilterProveedorId(e.target.value)}
            className="unified-select"
          >
            <option value="">Todos los Proveedores</option>
            {proveedores.map(p => (
              <option key={p.id} value={p.id}>{p.razonSocial}</option>
            ))}
          </select>
        </div>

        <div className="unified-filter-group fixed-width">
          <label className="unified-filter-label">Estado Pago</label>
          <select
            value={filterEstado}
            onChange={e => setFilterEstado(e.target.value)}
            className="unified-select"
          >
            <option value="">Todos los Estados</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Autorizado">Autorizado</option>
            <option value="Pagado">Pagado</option>
            <option value="Anulado">Anulado</option>
          </select>
        </div>

        {hasActiveFilters && (
          <button className="btn-clear-filters" onClick={clearAllFilters} title="Limpiar todos los filtros">
            <X size={14} />
            Limpiar
          </button>
        )}
      </div>

      {/* CONTENEDOR PRINCIPAL DE TABLA UNIFICADA */}
      <div className="desktop-table-container glass-panel table-container" style={{ marginBottom: '40px', padding: 0 }}>
        {/* BARRA SUPERIOR DE TABLA CON CONTADORES Y SELECTOR DE VISTA */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 20px',
          borderBottom: '1px solid var(--border-color)',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.05rem', fontWeight: 700 }}>
              Listado de Pagos a Proveedores
            </h3>
            <span className="badge badge-info" style={{ fontSize: '0.8rem', padding: '3px 10px' }}>
              {filteredPagos.length} {filteredPagos.length === 1 ? 'pago' : 'pagos'}
            </span>
            {filteredPagos.length > 0 && (
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Total acumulado: <strong style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{formatCurrency(visibleTotalSum)}</strong>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            {/* Controles de desplazamiento horizontal de columnas */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Desplazar:</span>
              <button
                type="button"
                onClick={() => handleScrollTable('left')}
                className="btn-secondary"
                style={{ padding: '4px 8px', height: '28px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                title="Desplazar tabla a la izquierda"
              >
                <ChevronLeft size={14} /> Izq
              </button>
              <button
                type="button"
                onClick={() => handleScrollTable('right')}
                className="btn-secondary"
                style={{ padding: '4px 8px', height: '28px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                title="Desplazar tabla a la derecha"
              >
                Der <ChevronRight size={14} />
              </button>
            </div>

            {/* SELECTOR DE VISTA PLANA VS AGRUPADA */}
            <div style={{ display: 'inline-flex', backgroundColor: 'var(--bg-subtle, rgba(0,0,0,0.04))', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <button
                type="button"
                onClick={() => setViewMode('flat')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  fontWeight: viewMode === 'flat' ? 700 : 500,
                  backgroundColor: viewMode === 'flat' ? 'var(--accent-primary)' : 'transparent',
                  color: viewMode === 'flat' ? '#ffffff' : 'var(--text-secondary)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title="Vista plana directa (todos los pagos ordenables en una sola grilla)"
              >
                <List size={14} />
                <span>Vista Plana</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grouped')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  fontWeight: viewMode === 'grouped' ? 700 : 500,
                  backgroundColor: viewMode === 'grouped' ? 'var(--accent-primary)' : 'transparent',
                  color: viewMode === 'grouped' ? '#ffffff' : 'var(--text-secondary)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title="Vista jerárquica (agrupada por cliente y proyecto)"
              >
                <FolderTree size={14} />
                <span>Agrupada por Cliente</span>
              </button>
            </div>
          </div>
        </div>

        {/* CONTENEDOR SCROLL CON HEADER STICKY */}
        <div 
          ref={tableContainerRef} 
          className="custom-table-scroll" 
          style={{ 
            width: '100%', 
            overflowX: 'auto', 
            overflowY: 'auto', 
            maxHeight: 'calc(100vh - 280px)', 
            minHeight: '400px', 
            position: 'relative'
          }}
        >
          {isLoading ? (
            <SkeletonTable columns={9} rows={6} message="Cargando pagos y tesorería..." />
          ) : (
            <table className="data-table" style={{ width: '100%', minWidth: viewMode === 'flat' ? '1540px' : '1280px', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
              {viewMode === 'flat' ? (
                <colgroup>
                  <col style={{ width: '48px', minWidth: '48px' }} />
                  <col style={{ width: '150px', minWidth: '150px' }} />
                  <col style={{ width: '220px', minWidth: '220px' }} />
                  <col style={{ width: '180px', minWidth: '180px' }} />
                  <col style={{ width: '180px', minWidth: '180px' }} />
                  <col style={{ width: '140px', minWidth: '140px' }} />
                  <col style={{ width: '110px', minWidth: '110px' }} />
                  <col style={{ width: '110px', minWidth: '110px' }} />
                  <col style={{ width: '110px', minWidth: '110px' }} />
                  <col style={{ width: '140px', minWidth: '140px' }} />
                  <col style={{ width: '170px', minWidth: '170px' }} />
                  <col style={{ width: '120px', minWidth: '120px' }} />
                  <col style={{ width: '230px', minWidth: '230px' }} />
                </colgroup>
              ) : (
                <colgroup>
                  <col style={{ width: '48px', minWidth: '48px' }} />
                  <col style={{ width: '200px', minWidth: '200px' }} />
                  <col style={{ width: '250px', minWidth: '250px' }} />
                  <col style={{ width: '140px', minWidth: '140px' }} />
                  <col style={{ width: '130px', minWidth: '130px' }} />
                  <col style={{ width: '140px', minWidth: '140px' }} />
                  <col style={{ width: '120px', minWidth: '120px' }} />
                  <col style={{ width: '230px', minWidth: '230px' }} />
                </colgroup>
              )}

              <thead style={{ position: 'sticky', top: 0, zIndex: 12, backgroundColor: '#f8fafc' }}>
                {viewMode === 'flat' ? (
                  <tr>
                    <th className="header-custom text-center sticky-col-left" style={{ position: 'sticky', left: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '48px', padding: '0 8px', verticalAlign: 'middle' }}>
                      <input 
                        type="checkbox"
                        checked={paginatedPagos.length > 0 && paginatedPagos.every(p => selectedPagos.includes(p.id))}
                        onChange={handleToggleSelectAllPagos}
                        style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#7c3aed' }}
                        title="Seleccionar todos los pagos visibles"
                      />
                    </th>
                    {renderSortHeader('ID PAGO', 'id', 'text-left font-mono sticky-col-left', { position: 'sticky', left: '48px', zIndex: 16, backgroundColor: '#f8fafc', width: '150px' })}
                    {renderSortHeader('PROVEEDOR', 'proveedor', 'text-left', { minWidth: '220px' })}
                    {renderSortHeader('CLIENTE', 'cliente', 'text-left', { minWidth: '180px' })}
                    {renderSortHeader('PROYECTO', 'proyecto', 'text-left', { minWidth: '180px' })}
                    {renderSortHeader('ORDEN REF.', 'ordenId', 'text-left', { width: '140px' })}
                    {renderSortHeader('F. REGISTRO', 'fechaRegistro', 'text-center', { width: '110px' })}
                    {renderSortHeader('F. PAGO', 'fechaPago', 'text-center', { width: '110px' })}
                    {renderSortHeader('TIPO', 'tipoPago', 'text-center', { width: '110px' })}
                    {renderSortHeader('MONTO', 'monto', 'text-right', { width: '140px' })}
                    <th className="header-custom text-left" style={{ width: '170px' }}>COMPROBANTE</th>
                    {renderSortHeader('ESTADO', 'estado', 'text-center', { width: '120px' })}
                    <th className="header-custom text-center sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '230px', whiteSpace: 'nowrap' }}>
                      ACCIONES
                    </th>
                  </tr>
                ) : (
                  <tr>
                    <th className="header-custom text-center sticky-col-left" style={{ position: 'sticky', left: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '48px', padding: '0 8px' }}>
                      ✓
                    </th>
                    <th className="header-custom sticky-col-left" style={{ position: 'sticky', left: '48px', zIndex: 16, backgroundColor: '#f8fafc' }}>
                      ID PAGO
                    </th>
                    <th className="header-custom">PROVEEDOR</th>
                    <th className="header-custom">ORDEN REF.</th>
                    <th className="header-custom text-center">FECHA PROG. PAGO</th>
                    <th className="header-custom text-right">MONTO A PAGAR</th>
                    <th className="header-custom text-center">ESTADO</th>
                    <th className="header-custom text-center sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '230px', whiteSpace: 'nowrap' }}>
                      ACCIONES
                    </th>
                  </tr>
                )}
              </thead>

              <tbody>
                {filteredPagos.length === 0 ? (
                  <tr>
                    <td colSpan={viewMode === 'flat' ? 13 : 8} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
                      <CreditCard size={36} color="var(--text-muted)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                      <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>No se encontraron pagos que coincidan con la búsqueda.</p>
                      {searchTerm && (
                        <button type="button" className="btn-secondary" onClick={clearAllFilters} style={{ margin: '12px auto 0', fontSize: '12px' }}>
                          Restablecer Filtros
                        </button>
                      )}
                    </td>
                  </tr>
                ) : viewMode === 'flat' ? (
                  paginatedPagos.map(pago => {
                    const isSelected = selectedPagos.includes(pago.id);
                    const provName = getProveedorName(pago.proveedorId);
                    const cliName = getClienteName(pago.clienteId);
                    const proyName = getProyectoName(pago.proyectoId);
                    const provObj = proveedores.find(p => p.id === pago.proveedorId);
                    const compPendiente = isComprobantePendiente(pago);

                    return (
                      <tr key={pago.id} className="hover-bg-subtle" style={{ transition: 'background-color 0.15s ease' }}>
                        {/* Checkbox de selección */}
                        <td className="td-custom text-center sticky-col-left" style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: '#ffffff', width: '48px', padding: '0 8px', verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}>
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectPago(pago.id)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#7c3aed' }}
                          />
                        </td>

                        {/* ID PAGO */}
                        <td className="td-custom text-left font-bold font-mono sticky-col-left" style={{ position: 'sticky', left: '48px', zIndex: 10, backgroundColor: '#ffffff', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <CreditCard size={15} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                            <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{formatId(pago.id)}</span>
                          </div>
                        </td>

                        {/* PROVEEDOR */}
                        <td className="td-custom text-left" style={{ verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Store size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                            <div style={{ minWidth: 0 }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={provName}>
                                {provName}
                              </span>
                              {provObj?.ruc && (
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  RUC {provObj.ruc}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* CLIENTE */}
                        <td className="td-custom text-left" style={{ verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Building2 size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                            <span style={{ color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cliName}>
                              {cliName}
                            </span>
                          </div>
                        </td>

                        {/* PROYECTO */}
                        <td className="td-custom text-left" style={{ verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Briefcase size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                            <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={proyName}>
                              {proyName}
                            </span>
                          </div>
                        </td>

                        {/* ORDEN REF */}
                        <td className="td-custom text-left" style={{ verticalAlign: 'middle' }}>
                          {pago.ordenId ? (
                            <button
                              type="button"
                              onClick={() => {
                                const found = ordenes.find(o => o.id === pago.ordenId);
                                if (found) setOrdenToView(found);
                                else toast.error('No se encontró la orden referenciada');
                              }}
                              style={{ 
                                background: 'transparent', 
                                border: 'none', 
                                padding: 0, 
                                cursor: 'pointer', 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '5px',
                                color: '#7c3aed',
                                fontWeight: 600,
                                fontSize: '12px'
                              }}
                              title="Ver Orden de Compra/Servicio"
                            >
                              <FileText size={13} />
                              <span>{pago.ordenId}</span>
                            </button>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                          )}
                        </td>

                        {/* FECHA REGISTRO */}
                        <td className="td-custom text-center" style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', color: 'var(--text-secondary)', fontSize: '12px' }}>
                          {pago.fechaRegistro || '-'}
                        </td>

                        {/* FECHA PAGO */}
                        <td className="td-custom text-center" style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', fontWeight: 600, color: 'var(--text-primary)', fontSize: '12px' }}>
                          {pago.fechaPago || '-'}
                        </td>

                        {/* TIPO PAGO */}
                        <td className="td-custom text-center" style={{ verticalAlign: 'middle' }}>
                          <span style={{ 
                            fontSize: '11px', 
                            padding: '2px 8px', 
                            borderRadius: '10px', 
                            fontWeight: 600,
                            backgroundColor: pago.tipoPago === 'Total' ? '#ecfdf5' : pago.tipoPago === 'Adelanto' ? '#ede9fe' : '#fef3c7',
                            color: pago.tipoPago === 'Total' ? '#047857' : pago.tipoPago === 'Adelanto' ? '#6d28d9' : '#b45309',
                            border: '1px solid rgba(0,0,0,0.06)'
                          }}>
                            {pago.tipoPago}
                          </span>
                        </td>

                        {/* MONTO */}
                        <td className="td-custom text-right font-bold font-tabular" style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', color: '#059669', fontSize: '13px' }}>
                          <div>{formatCurrency(Number(pago.monto) || 0)}</div>
                          {(() => {
                            const ord = pago.ordenId ? ordenById[pago.ordenId] : undefined;
                            const hasDetr = resolveEffectiveDetraccion({
                              aplicaDetraccion: pago.aplicaDetraccion,
                              porcentajeDetraccion: pago.porcentajeDetraccion,
                              isServicio: ord ? (ord.tipoOrden === 'Servicio' || ord.id.startsWith('OS-')) : true,
                              proveedorTipoDocumento: pago.proveedorId ? proveedorTipoDocDict[pago.proveedorId] : undefined
                            });
                            if (!hasDetr) return null;
                            const pct = pago.porcentajeDetraccion || 12;
                            return (
                              <span
                                style={{
                                  display: 'inline-block',
                                  fontSize: '10px',
                                  color: '#166534',
                                  background: '#dcfce7',
                                  border: '1px solid #86efac',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  fontWeight: 700,
                                  marginTop: '2px'
                                }}
                                title={`Detracción SPOT SUNAT ${pct}% (S/ ${(pago.montoDetraccion || 0).toFixed(2)})`}
                              >
                                SPOT {pct}%
                              </span>
                            );
                          })()}
                        </td>

                        {/* COMPROBANTE / FACTURA */}
                        <td className="td-custom text-left" style={{ verticalAlign: 'middle' }}>
                          {compPendiente ? (
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#b45309', background: '#fef3c7', border: '1px solid #fde68a', padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <AlertCircle size={11} /> Por regularizar
                            </span>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Receipt size={13} style={{ color: '#06b6d4', flexShrink: 0 }} />
                              <span style={{ fontSize: '11.5px', color: 'var(--text-primary)', fontWeight: 600, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pago.numeroComprobante}>
                                {pago.numeroComprobante || 'Factura'}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* ESTADO */}
                        <td className="td-custom text-center" style={{ verticalAlign: 'middle' }}>
                          <span className={`badge ${getBadgeClass(pago.estado)}`} style={{ fontSize: '11px' }}>
                            {pago.estado}
                          </span>
                        </td>

                        {/* ACCIONES */}
                        <td className="td-custom text-center sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 10, backgroundColor: '#ffffff', width: '230px', verticalAlign: 'middle' }}>
                          <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center', justifyContent: 'center' }}>
                            {/* 1. Ver recibo de pago */}
                            <button
                              type="button"
                              className="btn-icon"
                              title="Ver Documento de Pago Formal"
                              onClick={() => setPagoToView(pago)}
                              style={{ color: 'var(--accent-primary)' }}
                            >
                              <Eye size={16} />
                            </button>

                            {/* 2. Ver Factura Proveedor */}
                            {pago.comprobanteUrl && (
                              <button
                                type="button"
                                className="btn-icon"
                                title={`Ver Factura / Recibo (${pago.numeroComprobante || 'Adjunto'})`}
                                onClick={() => {
                                  const url = pago.comprobanteUrl!;
                                  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
                                  window.open(fullUrl, '_blank');
                                }}
                                style={{ color: '#06b6d4' }}
                              >
                                <Receipt size={16} />
                              </button>
                            )}

                            {/* 3. Regularizar si está pendiente */}
                            {pago.estado !== 'Anulado' && (
                              <button
                                type="button"
                                className="btn-icon"
                                title={compPendiente ? "Subir y Regularizar Factura" : "Actualizar Factura"}
                                onClick={() => setPagoToRegularize(pago)}
                                style={{
                                  color: compPendiente ? '#b45309' : '#8b5cf6',
                                  backgroundColor: compPendiente ? '#fef3c7' : 'transparent',
                                  border: compPendiente ? '1px solid #fde68a' : 'none',
                                  borderRadius: '6px',
                                  padding: compPendiente ? '3px 6px' : '4px'
                                }}
                              >
                                <UploadCloud size={15} />
                              </button>
                            )}

                            {/* 4. Voucher Bancario */}
                            {pago.comprobanteDeposito && (
                              <button
                                type="button"
                                className="btn-icon"
                                title="Ver Voucher de Depósito / Transferencia"
                                onClick={() => {
                                  const url = pago.comprobanteDeposito!;
                                  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
                                  window.open(fullUrl, '_blank');
                                }}
                                style={{ color: 'var(--success)' }}
                              >
                                <span style={{ fontSize: '14px' }}>🏦</span>
                              </button>
                            )}

                            {/* 5. Marcar Pagado */}
                            {pago.estado === 'Autorizado' && (currentUserRole === 'Contabilidad' || currentUserRole === 'Directorio' || currentUserRole === 'Admin') && (
                              <button 
                                type="button" 
                                className="btn-icon" 
                                title="Subir Voucher y Marcar Pagado" 
                                onClick={() => handleMarcarPagado(pago)} 
                                style={{ color: 'var(--success)' }}
                              >
                                <CheckCircle size={16} />
                              </button>
                            )}

                            {/* 6. Anular */}
                            {pago.estado !== 'Anulado' && (currentUserRole === 'Directorio' || currentUserRole === 'Admin') && (
                              <button 
                                type="button" 
                                className="btn-icon" 
                                title="Anular formalmente y notificar al proveedor" 
                                onClick={() => handleAnular(pago.id)} 
                                style={{ color: 'var(--danger)' }}
                              >
                                <span style={{ fontSize: '15px' }}>🛑</span>
                              </button>
                            )}

                            {/* 7. Eliminar */}
                            {(currentUserRole === 'Directorio' || currentUserRole === 'Admin' || currentUserRole === 'Producción') && (
                              <button 
                                type="button" 
                                className="btn-icon" 
                                title="Eliminar Pago" 
                                onClick={() => handleDelete(pago.id)} 
                                style={{ color: 'var(--danger)' }}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  // VISTA AGRUPADA (ACCORDION)
                  flattenedRows.map((item, index) => {
                    if (item.type === 'client') {
                      const isClientExpanded = expandedClients[item.id] === true;
                      return (
                        <tr key={`client-${item.id}-${index}`}>
                          <td colSpan={8} onClick={() => toggleClient(item.id)} style={{ padding: '12px 16px', fontWeight: 'bold', color: 'var(--accent-primary)', backgroundColor: 'rgba(102, 45, 145, 0.08)', cursor: 'pointer' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {isClientExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                              🏢 CLIENTE: {getClienteName(item.id).toUpperCase()}
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    if (item.type === 'project') {
                      const isProjectExpanded = expandedProjects[item.id] === true;
                      return (
                        <tr key={`proj-${item.id}-${index}`}>
                          <td colSpan={8} onClick={() => toggleProject(item.id)} style={{ padding: '10px 16px 10px 32px', fontWeight: 'bold', color: 'var(--text-secondary)', backgroundColor: 'rgba(0, 0, 0, 0.02)', cursor: 'pointer' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {isProjectExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              📁 PROYECTO: {getProyectoName(item.id)}
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    const pago = item.pago as Pago;
                    const isSelected = selectedPagos.includes(pago.id);
                    return (
                      <tr key={`pago-${pago.id}`} className="hover-bg-subtle">
                        <td className="td-custom text-center sticky-col-left" style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: '#ffffff', width: '48px', padding: '0 8px' }}>
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectPago(pago.id)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#7c3aed' }}
                          />
                        </td>
                        <td className="td-custom font-bold font-mono" style={{ paddingLeft: '32px', color: 'var(--accent-primary)' }}>
                          {formatId(pago.id)}
                        </td>
                        <td className="td-custom font-bold">{getProveedorName(pago.proveedorId)}</td>
                        <td className="td-custom">{pago.ordenId || '-'}</td>
                        <td className="td-custom text-center">{pago.fechaPago || '-'}</td>
                        <td className="td-custom text-right font-bold" style={{ color: '#059669' }}>{formatCurrency(pago.monto)}</td>
                        <td className="td-custom text-center">
                          <span className={`badge ${getBadgeClass(pago.estado)}`}>{pago.estado}</span>
                        </td>
                        <td className="td-custom text-center sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 10, backgroundColor: '#ffffff' }}>
                          <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center', justifyContent: 'center' }}>
                            <button type="button" className="btn-icon" onClick={() => setPagoToView(pago)} style={{ color: 'var(--accent-primary)' }}>
                              <Eye size={16} />
                            </button>
                            {pago.estado === 'Autorizado' && (currentUserRole === 'Contabilidad' || currentUserRole === 'Directorio' || currentUserRole === 'Admin') && (
                              <button type="button" className="btn-icon" onClick={() => handleMarcarPagado(pago)} style={{ color: 'var(--success)' }}>
                                <CheckCircle size={16} />
                              </button>
                            )}
                            <button type="button" className="btn-icon" onClick={() => handleDelete(pago.id)} style={{ color: 'var(--danger)' }}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* PIE DE PAGINACIÓN UNIFICADO */}
        {viewMode === 'flat' && filteredPagos.length > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 20px',
            borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-subtle, #f8fafc)',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Filas por página:
              </span>
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  fontSize: '12px',
                  background: '#ffffff',
                  color: 'var(--text-primary)'
                }}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Mostrando {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, filteredPagos.length)} de {filteredPagos.length} pagos
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <span style={{ fontSize: '13px', fontWeight: 600, padding: '0 8px' }}>
                Página {currentPage} de {totalPages}
              </span>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL DE CREACIÓN DE PAGO INDIVIDUAL */}
      <CreatePagoModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      {/* MODAL DE PAGOS MASIVOS */}
      <CreatePagosMasivosModal
        isOpen={isMasivoModalOpen}
        onClose={() => setIsMasivoModalOpen(false)}
      />

      {/* MODAL DE DOCUMENTO FORMAL DE PAGO */}
      {pagoToView && (
        <PagoDocumentModal
          isOpen={Boolean(pagoToView)}
          onClose={() => setPagoToView(null)}
          pago={pagoToView}
          orden={pagoOrden}
          proveedor={pagoProveedor}
          cliente={pagoCliente}
          proyecto={pagoProyecto}
        />
      )}

      {/* MODAL DE DOCUMENTO DE ORDEN REFERENCIADA */}
      {ordenToView && (
        <OrdenDocumentModal
          isOpen={Boolean(ordenToView)}
          onClose={() => setOrdenToView(null)}
          orden={ordenToView}
        />
      )}

      {/* MODAL DE REGULARIZAR FACTURA */}
      {pagoToRegularize && (
        <RegularizarComprobanteModal
          isOpen={Boolean(pagoToRegularize)}
          onClose={() => setPagoToRegularize(null)}
          pago={pagoToRegularize}
        />
      )}

      {/* MODAL DE CONFIRMAR PAGO / SUBIR VOUCHER */}
      {pagoToConfirm && (
        <ConfirmPagoModal
          isOpen={Boolean(pagoToConfirm)}
          onClose={() => setPagoToConfirm(null)}
          pago={pagoToConfirm}
        />
      )}
    </div>
  );
};
