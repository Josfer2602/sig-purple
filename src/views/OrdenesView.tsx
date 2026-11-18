import React, { useState, useMemo, useRef } from 'react';
import { 
  Plus, 
  FileText, 
  Trash2, 
  Eye, 
  Edit, 
  Search, 
  ChevronDown, 
  ChevronRight,
  ChevronLeft, 
  X, 
  Layers,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  List,
  FolderTree,
  Building2,
  Briefcase,
  Store,
  FileSpreadsheet,
  Mail,
  CheckSquare,
  Paperclip,
  Upload,
  ExternalLink
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useGlobalContext } from '../context/GlobalContext';
import { CreateOrdenModal } from '../components/CreateOrdenModal';
import { exportOrdenesToExcel } from '../utils/excelExport';
import { CreateOrdenesMasivasModal } from '../components/CreateOrdenesMasivasModal';
import { OrdenDocumentModal } from '../components/OrdenDocumentModal';
import { SendOrdenesEmailModal } from '../components/SendOrdenesEmailModal';
import { SkeletonTable } from '../components/SkeletonTable';
import { resolveEffectiveDetraccion } from '../utils/ordenPaymentHelper';
import type { Orden } from '../types/models';

type SortField = 'id' | 'proveedor' | 'cliente' | 'proyecto' | 'fechaEmision' | 'total' | 'tipoOrden';
type SortOrder = 'asc' | 'desc';

export const OrdenesView: React.FC = () => {
  const { ordenes, proveedores, clientes, proyectos, deleteOrden, updateOrden, isLoading } = useGlobalContext();
  const [uploadingOrdenId, setUploadingOrdenId] = useState<string | null>(null);
  const cotizacionInputRef = useRef<HTMLInputElement>(null);

  const triggerUploadCotizacion = (ordenId: string) => {
    setUploadingOrdenId(ordenId);
    if (cotizacionInputRef.current) {
      cotizacionInputRef.current.value = '';
      cotizacionInputRef.current.click();
    }
  };

  const handleCotizacionFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingOrdenId) return;

    const loadingToast = toast.loading(`Subiendo cotización "${file.name}" a Google Drive...`);
    try {
      const formData = new FormData();
      formData.append('cotizacionFile', file);
      const token = localStorage.getItem('token') || '';
      const res = await fetch(`/api/ordenes/${uploadingOrdenId}/upload-cotizacion`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al subir archivo');

      toast.success(`✅ Cotización archivada en Drive: ${data.fileName || file.name}`, { id: loadingToast });
      if (data.orden) {
        updateOrden(data.orden);
      }
    } catch (err: any) {
      console.error('Error subiendo cotización:', err);
      toast.error(`Error al subir cotización: ${err.message}`, { id: loadingToast });
    } finally {
      setUploadingOrdenId(null);
    }
  };
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('flat');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMasivoModalOpen, setIsMasivoModalOpen] = useState(false);
  const [ordenToView, setOrdenToView] = useState<Orden | null>(null);
  const [ordenToEdit, setOrdenToEdit] = useState<Orden | null>(null);
  
  // Selección múltiple para envío por correo
  const [selectedOrdenIds, setSelectedOrdenIds] = useState<string[]>([]);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [ordenesToEmail, setOrdenesToEmail] = useState<Orden[]>([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClienteId, setFilterClienteId] = useState('');
  const [filterProveedorId, setFilterProveedorId] = useState('');
  const [filterTipoOrden, setFilterTipoOrden] = useState('');
  
  const [sortField, setSortField] = useState<SortField>('fechaEmision');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

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

  const proveedorDict = useMemo(() => proveedores.reduce((acc, p) => ({ ...acc, [p.id]: p.razonSocial }), {} as Record<string, string>), [proveedores]);
  const proveedorTipoDocDict = useMemo(
    () => proveedores.reduce((acc, p) => ({ ...acc, [p.id]: p.tipoDocumento || '' }), {} as Record<string, string>),
    [proveedores]
  );
  const clienteDict = useMemo(() => clientes.reduce((acc, c) => ({ ...acc, [c.id]: c.empresa }), {} as Record<string, string>), [clientes]);
  const proyectoDict = useMemo(() => proyectos.reduce((acc, p) => ({ ...acc, [p.id]: p.nombre }), {} as Record<string, string>), [proyectos]);

  const getProveedorName = (id?: string) => (id && proveedorDict[id]) ? proveedorDict[id] : 'Desconocido';
  const getClienteName = (id?: string) => (id && clienteDict[id]) ? clienteDict[id] : 'Desconocido';
  const getProyectoName = (id?: string) => (id && proyectoDict[id]) ? proyectoDict[id] : 'Desconocido';

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 }).format(amount);
  };

  const renderSpotBadge = (orden: Orden) => {
    const hasDetr = resolveEffectiveDetraccion({
      aplicaDetraccion: orden.aplicaDetraccion,
      porcentajeDetraccion: orden.porcentajeDetraccion,
      isServicio: orden.tipoOrden === 'Servicio' || orden.id.startsWith('OS-'),
      proveedorTipoDocumento: proveedorTipoDocDict[orden.proveedorId]
    });
    if (!hasDetr) return null;
    const pct = orden.porcentajeDetraccion || 12;
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
        title={`Detracción SPOT ${pct}% (Neto comercial: S/ ${(orden.montoNeto || 0).toFixed(2)})`}
      >
        SPOT {pct}%
      </span>
    );
  };

  // --- LÓGICA DE FILTRADO ---
  const filteredOrdenes = useMemo(() => {
    return ordenes.filter(o => {
      if (!o || !o.id) return false;
      const searchLower = (searchTerm || '').toLowerCase();
      const proveedorName = getProveedorName(o.proveedorId || '').toLowerCase();
      const clienteName = getClienteName(o.clienteId || '').toLowerCase();
      const proyectoName = getProyectoName(o.proyectoId || '').toLowerCase();
      const idLower = (o.id || '').toLowerCase();

      if (searchTerm) {
        const matchSearch =
          proveedorName.includes(searchLower) ||
          clienteName.includes(searchLower) ||
          proyectoName.includes(searchLower) ||
          idLower.includes(searchLower);

        if (!matchSearch) return false;
      }

      if (filterClienteId && o.clienteId !== filterClienteId) return false;
      if (filterProveedorId && o.proveedorId !== filterProveedorId) return false;
      if (filterTipoOrden && (o.tipoOrden || 'Compra') !== filterTipoOrden) return false;

      return true;
    });
  }, [ordenes, searchTerm, filterClienteId, filterProveedorId, filterTipoOrden, proveedorDict, clienteDict, proyectoDict]);

  // --- ORDENAMIENTO DINÁMICO ---
  const sortedOrdenes = useMemo(() => {
    return [...filteredOrdenes].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'id':
          comparison = (a.id || '').localeCompare(b.id || '', undefined, { numeric: true });
          break;
        case 'proveedor': {
          const pA = getProveedorName(a.proveedorId || '');
          const pB = getProveedorName(b.proveedorId || '');
          comparison = pA.localeCompare(pB);
          break;
        }
        case 'cliente': {
          const cA = getClienteName(a.clienteId || '');
          const cB = getClienteName(b.clienteId || '');
          comparison = cA.localeCompare(cB);
          break;
        }
        case 'proyecto': {
          const prjA = getProyectoName(a.proyectoId || '');
          const prjB = getProyectoName(b.proyectoId || '');
          comparison = prjA.localeCompare(prjB);
          break;
        }
        case 'fechaEmision': {
          const fA = a.fechaEmision || '';
          const fB = b.fechaEmision || '';
          comparison = fA.localeCompare(fB);
          break;
        }
        case 'total':
          comparison = (Number(a.total) || 0) - (Number(b.total) || 0);
          break;
        case 'tipoOrden':
          comparison = (a.tipoOrden || 'Compra').localeCompare(b.tipoOrden || 'Compra');
          break;
        default:
          comparison = 0;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredOrdenes, sortField, sortOrder, proveedorDict, clienteDict, proyectoDict]);

  const visibleTotalSum = useMemo(() => {
    return filteredOrdenes.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
  }, [filteredOrdenes]);

  const totalPages = Math.ceil(sortedOrdenes.length / pageSize) || 1;
  const paginatedOrdenes = useMemo(() => {
    return viewMode === 'flat' 
      ? sortedOrdenes.slice((currentPage - 1) * pageSize, currentPage * pageSize)
      : sortedOrdenes;
  }, [sortedOrdenes, currentPage, pageSize, viewMode]);

  const groupedOrdenes = useMemo(() => {
    const grouped: Record<string, Record<string, Orden[]>> = {};
    filteredOrdenes.forEach(o => {
      const cId = o.clienteId || 'sin-cliente';
      const pId = o.proyectoId || 'sin-proyecto';
      if (!grouped[cId]) grouped[cId] = {};
      if (!grouped[cId][pId]) grouped[cId][pId] = [];
      grouped[cId][pId].push(o);
    });
    return grouped;
  }, [filteredOrdenes]);

  const toggleClient = (clientId: string) => {
    setExpandedClients(prev => ({ ...prev, [clientId]: !prev[clientId] }));
  };

  const toggleProject = (projectId: string) => {
    setExpandedProjects(prev => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'total' || field === 'fechaEmision' ? 'desc' : 'asc');
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

  const hasActiveFilters = Boolean(searchTerm || filterClienteId || filterProveedorId || filterTipoOrden);

  const clearAllFilters = () => {
    setSearchTerm('');
    setFilterClienteId('');
    setFilterProveedorId('');
    setFilterTipoOrden('');
  };

  const selectedTotal = useMemo(() => {
    return ordenes
      .filter(o => selectedOrdenIds.includes(o.id))
      .reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  }, [ordenes, selectedOrdenIds]);

  const handleToggleSelectOrden = (id: string, e?: React.MouseEvent | React.ChangeEvent) => {
    e?.stopPropagation();
    setSelectedOrdenIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    const allFilteredIds = filteredOrdenes.map(o => o.id);
    const areAllSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedOrdenIds.includes(id));
    if (areAllSelected) {
      setSelectedOrdenIds(prev => prev.filter(id => !allFilteredIds.includes(id)));
    } else {
      setSelectedOrdenIds(prev => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  const handleOpenBulkEmail = () => {
    const selected = ordenes.filter(o => selectedOrdenIds.includes(o.id));
    if (selected.length === 0) {
      toast.error('Selecciona al menos una orden para enviar por correo');
      return;
    }
    setOrdenesToEmail(selected);
    setIsEmailModalOpen(true);
  };

  const handleOpenSingleEmail = (orden: Orden) => {
    setOrdenesToEmail([orden]);
    setIsEmailModalOpen(true);
  };

  const renderOrdenActions = (orden: Orden) => (
    <div style={{ display: 'inline-flex', gap: '4px', justifyContent: 'center', alignItems: 'center', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
      <button 
        className="btn-icon" 
        onClick={(e) => {
          e.stopPropagation();
          handleOpenSingleEmail(orden);
        }} 
        title="Enviar Orden por Correo (PDF)" 
        style={{ color: '#0284c7' }}
      >
        <Mail size={16} />
      </button>
      <button 
        className="btn-icon" 
        onClick={(e) => {
          e.stopPropagation();
          setOrdenToEdit(orden);
          setIsModalOpen(true);
        }} 
        title="Editar Orden" 
        style={{ color: 'var(--accent-primary)' }}
      >
        <Edit size={16} />
      </button>
      <button 
        className="btn-icon" 
        onClick={(e) => {
          e.stopPropagation();
          setOrdenToView(orden);
        }} 
        title="Ver Documento" 
        style={{ color: 'var(--text-primary)' }}
      >
        <Eye size={16} />
      </button>

      {/* PDF Oficial en Google Drive */}
      {orden.pdfUrl && (
        <a 
          href={orden.pdfUrl} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="btn-icon" 
          title="Abrir PDF oficial en Google Drive" 
          style={{ color: '#059669', display: 'inline-flex', alignItems: 'center' }}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={16} />
        </a>
      )}

      {/* Cotización del Proveedor: Abrir en Drive si existe, o subir directamente */}
      {orden.cotizacionProveedorUrl ? (
        <a 
          href={orden.cotizacionProveedorUrl} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="btn-icon" 
          title={`Cotización Proveedor: ${orden.cotizacionProveedorName || 'Ver en Drive'}`} 
          style={{ color: '#d97706', display: 'inline-flex', alignItems: 'center' }}
          onClick={(e) => e.stopPropagation()}
        >
          <Paperclip size={16} />
        </a>
      ) : (
        <button 
          type="button"
          className="btn-icon" 
          onClick={(e) => {
            e.stopPropagation();
            triggerUploadCotizacion(orden.id);
          }} 
          title="Adjuntar Cotización de Proveedor a Drive (PDF/Imagen)" 
          style={{ color: '#94a3b8' }}
        >
          <Upload size={16} />
        </button>
      )}
      <button 
        className="btn-icon" 
        onClick={(e) => {
          e.stopPropagation();
          if (window.confirm('¿Borrar esta orden permanentemente?')) deleteOrden(orden.id);
        }} 
        title="Eliminar Orden" 
        style={{ color: 'var(--danger)' }}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );

  return (
    <div className="animate-fade-in">
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            backgroundColor: 'rgba(102, 45, 145, 0.08)',
            border: '1px solid rgba(102, 45, 145, 0.18)',
            borderRadius: '20px',
            fontSize: '0.82rem',
            fontWeight: 600,
            color: 'var(--accent-primary)'
          }}>
            <FileText size={15} />
            <span>{ordenes.length} Órdenes Registradas</span>
          </div>
          {selectedOrdenIds.length > 0 && (
            <span style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
              ({selectedOrdenIds.length} seleccionadas)
            </span>
          )}
        </div>

        <div className="view-actions">
          <button 
            type="button" 
            className="btn-secondary" 
            onClick={handleOpenBulkEmail}
            disabled={selectedOrdenIds.length === 0}
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px',
              opacity: selectedOrdenIds.length === 0 ? 0.6 : 1,
              color: selectedOrdenIds.length > 0 ? 'var(--accent-primary)' : undefined,
              borderColor: selectedOrdenIds.length > 0 ? 'var(--accent-primary)' : undefined
            }}
            title={selectedOrdenIds.length === 0 ? "Selecciona una o más órdenes en la tabla para enviar" : `Enviar ${selectedOrdenIds.length} orden(es) por correo`}
          >
            <Mail size={16} />
            <span>Enviar por Correo {selectedOrdenIds.length > 0 ? `(${selectedOrdenIds.length})` : ''}</span>
          </button>
          <button 
            className="btn-secondary" 
            onClick={() => setIsMasivoModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Layers size={18} color="var(--accent-primary)" />
            Generación Masiva
          </button>
          <button 
            type="button" 
            className="btn-excel" 
            onClick={() => exportOrdenesToExcel(ordenes, proveedores, proyectos, clientes)}
            title="Descargar base completa de órdenes en Excel (.xlsx)"
          >
            <FileSpreadsheet size={16} />
            <span>Exportar Excel</span>
          </button>
          <button className="btn-primary" onClick={() => {
            setOrdenToEdit(null);
            setIsModalOpen(true);
          }}>
            <Plus size={18} />
            Nueva Orden
          </button>
        </div>
      </div>

      {/* PANEL DE FILTROS UNIFICADO */}
      <div className="unified-filter-panel">
        <div className="unified-filter-group search-group">
          <label className="unified-filter-label">Búsqueda Rápida</label>
          <div className="unified-search-wrapper">
            <Search size={16} className="unified-search-icon" />
            <input
              type="text"
              placeholder="Buscar por ID de orden, proveedor, cliente o proyecto..."
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
            onChange={(e) => setFilterClienteId(e.target.value)}
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
            onChange={(e) => setFilterProveedorId(e.target.value)}
            className="unified-select"
          >
            <option value="">Todos los Proveedores</option>
            {proveedores.map(p => (
              <option key={p.id} value={p.id}>{p.razonSocial}</option>
            ))}
          </select>
        </div>

        <div className="unified-filter-group fixed-width">
          <label className="unified-filter-label">Tipo de Orden</label>
          <select
            value={filterTipoOrden}
            onChange={(e) => setFilterTipoOrden(e.target.value)}
            className="unified-select"
          >
            <option value="">Todos los Tipos</option>
            <option value="Compra">Orden de Compra</option>
            <option value="Servicio">Orden de Servicio</option>
          </select>
        </div>

        {hasActiveFilters && (
          <button className="btn-clear-filters" onClick={clearAllFilters} title="Limpiar todos los filtros">
            <X size={14} />
            Limpiar
          </button>
        )}
      </div>

      <div className="desktop-table-container glass-panel table-container" style={{ marginBottom: '56px', padding: 0, overflow: 'hidden' }}>
        {/* ENCABEZADO CON CONTADOR, SUMATORIA, SELECTOR DE VISTA Y CONTROLES DE DESPLAZAMIENTO */}
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
              Listado de Órdenes
            </h3>
            <span className="badge badge-info" style={{ fontSize: '0.8rem', padding: '3px 10px' }}>
              {filteredOrdenes.length} {filteredOrdenes.length === 1 ? 'orden' : 'órdenes'}
            </span>
            {filteredOrdenes.length > 0 && (
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
                title="Vista plana directa (todas las órdenes ordenables en una sola grilla)"
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

        {/* BARRA FLOTANTE DE ACCIÓN MULTI-SELECCIÓN */}
        {selectedOrdenIds.length > 0 && (
          <div 
            className="animate-fade-in"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 20px',
              margin: '12px 16px',
              background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)',
              border: '1px solid rgba(124, 58, 237, 0.3)',
              borderRadius: '12px',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ 
                fontWeight: 700, 
                color: 'var(--accent-primary)',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <CheckSquare size={18} />
                {selectedOrdenIds.length} orden{selectedOrdenIds.length > 1 ? 'es' : ''} seleccionada{selectedOrdenIds.length > 1 ? 's' : ''}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                • Total acumulado: <strong style={{ color: '#059669', fontSize: '14px' }}>{formatCurrency(selectedTotal)}</strong>
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={handleOpenBulkEmail}
                style={{
                  height: '38px',
                  padding: '0 16px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px'
                }}
              >
                <Mail size={16} />
                <span>Enviar por Correo ({selectedOrdenIds.length} PDF{selectedOrdenIds.length > 1 ? 's' : ''})</span>
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedOrdenIds([])}
                style={{ height: '38px', padding: '0 14px', fontSize: '13px' }}
              >
                Deseleccionar
              </button>
            </div>
          </div>
        )}

        {/* CONTENEDOR SCROLL CON ESTÁNDAR PROYECTOS */}
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
            <SkeletonTable columns={8} rows={6} message="Cargando órdenes de compra y servicio..." />
          ) : (
            <table className="data-table" style={{ width: '100%', minWidth: viewMode === 'flat' ? '1360px' : '1100px', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
              {viewMode === 'flat' ? (
                <colgroup>
                <col style={{ width: '48px', minWidth: '48px' }} /> {/* Checkbox */}
                <col style={{ width: '200px', minWidth: '200px' }} /> {/* ID Orden + Tipo */}
                <col style={{ width: '240px', minWidth: '240px' }} /> {/* Proveedor */}
                <col style={{ width: '200px', minWidth: '200px' }} /> {/* Cliente */}
                <col style={{ width: '220px', minWidth: '220px' }} /> {/* Proyecto */}
                <col style={{ width: '130px', minWidth: '130px' }} /> {/* Fecha */}
                <col style={{ width: '150px', minWidth: '150px' }} /> {/* Total */}
                <col style={{ width: '170px', minWidth: '170px' }} /> {/* Acciones */}
              </colgroup>
            ) : (
              <colgroup>
                <col style={{ width: '48px', minWidth: '48px' }} /> {/* Checkbox */}
                <col style={{ width: '220px', minWidth: '220px' }} /> {/* ID Orden */}
                <col style={{ width: '320px', minWidth: '320px' }} /> {/* Proveedor */}
                <col style={{ width: '150px', minWidth: '150px' }} /> {/* Fecha */}
                <col style={{ width: '160px', minWidth: '160px' }} /> {/* Total */}
                <col style={{ width: '170px', minWidth: '170px' }} /> {/* Acciones */}
              </colgroup>
            )}
            <thead style={{ position: 'sticky', top: 0, zIndex: 12, backgroundColor: '#f8fafc' }}>
              {viewMode === 'flat' ? (
                <tr>
                  <th className="header-custom text-center sticky-col-left" style={{ position: 'sticky', left: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '48px', padding: '0 8px', verticalAlign: 'middle' }}>
                    <input 
                      type="checkbox"
                      checked={filteredOrdenes.length > 0 && filteredOrdenes.every(o => selectedOrdenIds.includes(o.id))}
                      onChange={handleToggleSelectAll}
                      style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#7c3aed' }}
                      title="Seleccionar todas las órdenes filtradas"
                    />
                  </th>
                  {renderSortHeader('ID ORDEN', 'id', 'text-left sticky-col-left', { position: 'sticky', left: '48px', zIndex: 16, backgroundColor: '#f8fafc', width: '200px', whiteSpace: 'nowrap' })}
                  {renderSortHeader('PROVEEDOR', 'proveedor', 'text-left', { width: '240px' })}
                  {renderSortHeader('CLIENTE', 'cliente', 'text-left', { width: '200px' })}
                  {renderSortHeader('PROYECTO', 'proyecto', 'text-left', { width: '220px' })}
                  {renderSortHeader('FECHA EMISIÓN', 'fechaEmision', 'text-center', { width: '130px', whiteSpace: 'nowrap' })}
                  {renderSortHeader('TOTAL', 'total', 'text-right', { width: '150px', whiteSpace: 'nowrap' })}
                  <th className="header-custom text-center sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '170px', whiteSpace: 'nowrap' }}>ACCIONES</th>
                </tr>
              ) : (
                <tr>
                  <th className="header-custom text-center sticky-col-left" style={{ position: 'sticky', left: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '48px', padding: '0 8px', verticalAlign: 'middle' }}>
                    <input 
                      type="checkbox"
                      checked={filteredOrdenes.length > 0 && filteredOrdenes.every(o => selectedOrdenIds.includes(o.id))}
                      onChange={handleToggleSelectAll}
                      style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#7c3aed' }}
                      title="Seleccionar todas las órdenes"
                    />
                  </th>
                  <th className="header-custom sticky-col-left" style={{ position: 'sticky', left: '48px', zIndex: 16, backgroundColor: '#f8fafc', width: '220px' }}>ID ORDEN</th>
                  <th className="header-custom" style={{ width: '320px' }}>PROVEEDOR</th>
                  <th className="header-custom text-center" style={{ width: '150px' }}>FECHA EMISIÓN</th>
                  <th className="header-custom text-right" style={{ width: '160px' }}>TOTAL</th>
                  <th className="header-custom text-center sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '170px' }}>ACCIONES</th>
                </tr>
              )}
            </thead>
            <tbody>
              {filteredOrdenes.length === 0 ? (
                <tr>
                  <td colSpan={viewMode === 'flat' ? 8 : 6} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        No se encontraron órdenes registradas
                      </span>
                      <span style={{ fontSize: '0.8rem' }}>
                        Intenta ajustar los filtros de búsqueda o crea una nueva orden.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : viewMode === 'flat' ? (
                paginatedOrdenes.map(orden => (
                  <tr key={orden.id} className="hover-bg-subtle" style={{ transition: 'background-color 0.15s ease' }}>
                    <td className="td-custom text-center sticky-col-left" style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: 'inherit', width: '48px', padding: '0 8px', verticalAlign: 'middle' }} onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox"
                        checked={selectedOrdenIds.includes(orden.id)}
                        onChange={(e) => handleToggleSelectOrden(orden.id, e)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#7c3aed' }}
                      />
                    </td>
                    <td className="td-custom text-left font-bold font-mono sticky-col-left" style={{ position: 'sticky', left: '48px', zIndex: 10, backgroundColor: 'inherit', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
                        <FileText size={16} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                        <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{orden.id}</span>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: orden.tipoOrden === 'Servicio' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                          color: orden.tipoOrden === 'Servicio' ? '#2563eb' : '#059669',
                          border: orden.tipoOrden === 'Servicio' ? '1px solid rgba(59, 130, 246, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)'
                        }}>
                          {orden.tipoOrden || 'Compra'}
                        </span>
                      </div>
                      {orden.items && orden.items.length > 0 && (
                        <div 
                          style={{ 
                            fontSize: '11px', 
                            fontWeight: 500, 
                            color: 'var(--text-secondary)', 
                            marginTop: '3px', 
                            maxWidth: '220px', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap' 
                          }} 
                          title={orden.items.map(it => `${it.quantity || 1} un. x ${it.name}`).join(', ')}
                        >
                          📦 {orden.items.map(it => `${it.quantity || 1} un. - ${it.name}`).slice(0, 2).join(' • ')}
                          {orden.items.length > 2 && ` (+${orden.items.length - 2})`}
                        </div>
                      )}
                    </td>
                    <td className="td-custom text-left" style={{ verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Store size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {getProveedorName(orden.proveedorId)}
                        </span>
                      </div>
                    </td>
                    <td className="td-custom text-left" style={{ verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Building2 size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                          {getClienteName(orden.clienteId)}
                        </span>
                      </div>
                    </td>
                    <td className="td-custom text-left" style={{ verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Briefcase size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {getProyectoName(orden.proyectoId)}
                        </span>
                      </div>
                    </td>
                    <td className="td-custom text-center" style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', color: 'var(--text-secondary)' }}>
                      {orden.fechaEmision || '-'}
                    </td>
                    <td className="td-custom text-right font-bold text-emerald font-tabular" style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      <div>{formatCurrency(Number(orden.total) || 0)}</div>
                      {renderSpotBadge(orden)}
                    </td>
                    <td className="td-custom sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 10, backgroundColor: 'inherit', verticalAlign: 'middle' }}>
                      {renderOrdenActions(orden)}
                    </td>
                  </tr>
                ))
              ) : (
                Object.keys(groupedOrdenes).map(clienteId => {
                  const clientProjects = groupedOrdenes[clienteId];
                  const isClientExpanded = expandedClients[clienteId] === true;

                  return (
                    <React.Fragment key={clienteId}>
                      <tr
                        style={{ backgroundColor: 'rgba(102, 45, 145, 0.08)', cursor: 'pointer' }}
                        onClick={() => toggleClient(clienteId)}
                      >
                        <td colSpan={6} style={{ padding: '12px 16px', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isClientExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                            🏢 CLIENTE: {getClienteName(clienteId).toUpperCase()}
                          </div>
                        </td>
                      </tr>

                      {isClientExpanded && Object.keys(clientProjects).map(proyectoId => {
                        const projectOrders = clientProjects[proyectoId];
                        const isProjectExpanded = expandedProjects[proyectoId] === true;

                        return (
                          <React.Fragment key={proyectoId}>
                            <tr
                              style={{ backgroundColor: 'rgba(0, 0, 0, 0.03)', cursor: 'pointer' }}
                              onClick={() => toggleProject(proyectoId)}
                            >
                              <td colSpan={6} style={{ padding: '8px 16px 8px 32px', fontWeight: 'bold', fontSize: '13px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {isProjectExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                  📁 Proyecto: {getProyectoName(proyectoId)}
                                </div>
                              </td>
                            </tr>

                            {isProjectExpanded && projectOrders.map(orden => (
                              <tr key={orden.id} className="expandable-row">
                                <td className="td-custom text-center sticky-col-left" style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: 'inherit', width: '48px', padding: '0 8px', verticalAlign: 'middle' }} onClick={(e) => e.stopPropagation()}>
                                  <input 
                                    type="checkbox"
                                    checked={selectedOrdenIds.includes(orden.id)}
                                    onChange={(e) => handleToggleSelectOrden(orden.id, e)}
                                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#7c3aed' }}
                                  />
                                </td>
                                <td className="td-custom sticky-col-left" style={{ position: 'sticky', left: '48px', zIndex: 10, backgroundColor: 'inherit', fontWeight: 600, color: 'var(--accent-primary)', paddingLeft: '24px' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <FileText size={16} />
                                      {orden.id}
                                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', width: 'fit-content' }}>
                                        {orden.tipoOrden || 'Compra'}
                                      </span>
                                    </div>
                                    {orden.items && orden.items.length > 0 && (
                                      <div 
                                        style={{ 
                                          fontSize: '11px', 
                                          fontWeight: 500, 
                                          color: 'var(--text-secondary)', 
                                          maxWidth: '220px', 
                                          overflow: 'hidden', 
                                          textOverflow: 'ellipsis', 
                                          whiteSpace: 'nowrap' 
                                        }} 
                                        title={orden.items.map(it => `${it.quantity || 1} un. x ${it.name}`).join(', ')}
                                      >
                                        📦 {orden.items.map(it => `${it.quantity || 1} un. - ${it.name}`).slice(0, 2).join(' • ')}
                                        {orden.items.length > 2 && ` (+${orden.items.length - 2})`}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="td-custom" style={{ fontWeight: 'bold' }}>{getProveedorName(orden.proveedorId)}</td>
                                <td className="td-custom">{orden.fechaEmision}</td>
                                <td className="td-custom font-bold text-emerald font-tabular">
                                  <div>{formatCurrency(Number(orden.total) || 0)}</div>
                                  {renderSpotBadge(orden)}
                                </td>
                                <td className="td-custom sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 10, backgroundColor: 'inherit', textAlign: 'center' }}>
                                  {renderOrdenActions(orden)}
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
          )}
        </div>

        {/* BARRA DE PAGINACIÓN CUANDO ESTÁ EN VISTA PLANA */}
        {viewMode === 'flat' && !isLoading && filteredOrdenes.length > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 20px',
            borderTop: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-card)',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Mostrar</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  fontSize: '13px',
                  backgroundColor: 'var(--bg-main)',
                  color: 'var(--text-primary)'
                }}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={500}>Todos (500)</option>
              </select>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                órdenes por página • Mostrando {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, filteredOrdenes.length)} de {filteredOrdenes.length}
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

      {/* Mobile Adaptive Cards View for Ordenes */}
      <div className="mobile-cards-container">
        {isLoading ? (
          <SkeletonTable columns={1} rows={4} message="Cargando órdenes..." />
        ) : filteredOrdenes.length === 0 ? (
          <div className="glass-panel" style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
            No se encontraron órdenes registradas.
          </div>
        ) : (
          sortedOrdenes.map(orden => {
            const proveedorName = getProveedorName(orden.proveedorId);
            const clienteName = getClienteName(orden.clienteId);
            const proyectoName = getProyectoName(orden.proyectoId);
            const isServicio = orden.tipoOrden === 'Servicio';
            const isSelected = selectedOrdenIds.includes(orden.id);

            return (
              <div 
                key={orden.id} 
                className="mobile-data-card"
                style={{
                  borderLeft: isSelected ? '4px solid var(--accent-primary)' : undefined,
                  background: isSelected ? 'rgba(124, 58, 237, 0.03)' : undefined
                }}
              >
                <div className="mobile-data-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <input 
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => handleToggleSelectOrden(orden.id, e)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#7c3aed', flexShrink: 0 }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div className="mobile-data-card-title font-mono" style={{ color: 'var(--accent-primary)', fontSize: '13px' }}>
                        {orden.id}
                      </div>
                      <div className="mobile-data-card-subtitle">
                        <span>{orden.fechaEmision || '-'}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
                    <span style={{ fontWeight: 800, fontSize: '15px', color: '#059669' }}>
                      {formatCurrency(Number(orden.total) || 0)}
                    </span>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: isServicio ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                      color: isServicio ? '#2563eb' : '#059669'
                    }}>
                      {orden.tipoOrden || 'Compra'}
                    </span>
                  </div>
                </div>

                <div className="mobile-card-grid-meta">
                  <div className="mobile-card-meta-col">
                    <span className="mobile-card-meta-label">Proveedor</span>
                    <span className="mobile-card-meta-val" title={proveedorName}>{proveedorName}</span>
                  </div>
                  <div className="mobile-card-meta-col">
                    <span className="mobile-card-meta-label">Cliente</span>
                    <span className="mobile-card-meta-val" title={clienteName}>{clienteName}</span>
                  </div>
                  <div className="mobile-card-meta-col" style={{ gridColumn: 'span 2' }}>
                    <span className="mobile-card-meta-label">Proyecto</span>
                    <span className="mobile-card-meta-val" title={proyectoName}>{proyectoName}</span>
                  </div>
                </div>

                <div className="mobile-card-actions-row">
                  <button 
                    type="button" 
                    className="mobile-action-pill" 
                    onClick={() => setOrdenToView(orden)}
                    title="Ver Documento"
                  >
                    <Eye size={13} />
                    <span>Ver</span>
                  </button>
                  <button 
                    type="button" 
                    className="mobile-action-pill" 
                    onClick={() => handleOpenSingleEmail(orden)}
                    title="Enviar por Correo"
                    style={{ color: '#0284c7' }}
                  >
                    <Mail size={13} />
                    <span>Correo</span>
                  </button>
                  <button 
                    type="button" 
                    className="mobile-action-pill" 
                    onClick={() => {
                      setOrdenToEdit(orden);
                      setIsModalOpen(true);
                    }}
                    title="Editar Orden"
                  >
                    <Edit size={13} />
                    <span>Editar</span>
                  </button>
                  <button 
                    type="button" 
                    className="mobile-action-pill danger" 
                    onClick={() => {
                      if (window.confirm(`¿Borrar la orden ${orden.id} permanentemente?`)) {
                        deleteOrden(orden.id);
                      }
                    }}
                    title="Eliminar Orden"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <CreateOrdenModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setOrdenToEdit(null);
        }}
        ordenToEdit={ordenToEdit}
      />

      <CreateOrdenesMasivasModal
        isOpen={isMasivoModalOpen}
        onClose={() => setIsMasivoModalOpen(false)}
      />

      <OrdenDocumentModal
        isOpen={!!ordenToView}
        onClose={() => setOrdenToView(null)}
        orden={ordenToView}
        onSendEmail={handleOpenSingleEmail}
      />

      <SendOrdenesEmailModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        ordenes={ordenesToEmail}
        proveedores={proveedores}
        clientes={clientes}
        proyectos={proyectos}
        onSuccess={() => {
          setSelectedOrdenIds([]);
        }}
      />

      {/* Input oculto para subir cotización del proveedor directamente desde la tabla */}
      <input 
        type="file" 
        ref={cotizacionInputRef} 
        style={{ display: 'none' }} 
        accept=".pdf,image/png,image/jpeg,image/jpg,image/webp" 
        onChange={handleCotizacionFileChange} 
      />
    </div>
  );
};
