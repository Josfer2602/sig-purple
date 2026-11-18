import React, { useState, useMemo, useRef } from 'react';
import { Plus, FileText, Copy, Edit2, Archive, Trash2, Search, ChevronDown, ChevronRight, History, Download, X, Eye, Link2, FileSpreadsheet, Check, Layers, ArrowUpDown, ArrowUp, ArrowDown, List, FolderTree, Building2, Briefcase, CheckSquare, AlertTriangle } from 'lucide-react';
import type { Quote } from '../types/quote';
import { QuoteHistoryModal } from './QuoteHistoryModal';
import { SkeletonTable } from './SkeletonTable';
import { useGlobalContext, API_URL } from '../context/GlobalContext';
import { buildQuoteClientUrl } from '../utils/clientLinks';
import { exportCotizacionesToExcel } from '../utils/excelExport';
import toast from 'react-hot-toast';

const getAvailableStatuses = (role: string, currentStatus: string) => {
  const allStatuses = ['Creación', 'En Producción', 'Revisión Cuentas', 'Revisión Directorio', 'Enviado', 'Aprobado', 'Rechazado'];
  let allowed: string[] = [];

  if (role === 'Producción') {
    allowed = ['En Producción', 'Revisión Cuentas'];
  } else if (role === 'Cuentas') {
    allowed = ['En Producción', 'Revisión Directorio', 'Enviado', 'Rechazado', 'Aprobado'];
  } else {
    allowed = allStatuses;
  }

  // Ensure currentStatus is always in the list to prevent select value issues
  return Array.from(new Set([...allowed, currentStatus || 'Creación'])).sort((a, b) => {
    return allStatuses.indexOf(a) - allStatuses.indexOf(b);
  });
};

export const canEditQuote = (status: string, role: string) => {
  if (role === 'Admin' || role === 'Directorio') return true;
  const s = (status || '').toLowerCase();
  if (role === 'Producción') {
    return s.includes('creación') || s.includes('producción') || s.includes('rechazado');
  }
  if (role === 'Cuentas') {
    return !s.includes('producción') || s.includes('creación');
  }
  return true;
};

export const isQuotePendingForRole = (quote: Quote, role: string) => {
  if (!quote || quote.isTemplate || quote.status === 'Archivado') return false;
  if (role === 'Cuentas') {
    return quote.status === 'Revisión Cuentas' || quote.status === 'Por Revisar - Cuentas';
  }
  if (role === 'Directorio' || role === 'Admin') {
    return quote.status === 'Revisión Directorio' || quote.status === 'Por Revisar - Directorio';
  }
  if (role === 'Producción') {
    return quote.status === 'Creación' || quote.status === 'En Creación' || quote.status === 'En Producción' || quote.status === 'Rechazado';
  }
  return false;
};

interface CotizacionesListProps {
  quotes: Quote[];
  onNew: () => void;
  onImportExcel?: () => void;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onNewVersion: (id: string) => void;
  onSaveAsTemplate: (id: string) => void;
  onUpdateStatus: (id: string, newStatus: string) => void;
  onDelete: (id: string) => void;
  onGenerateOrders?: (id: string) => void;
}

type SortField = 'id' | 'requirement' | 'version' | 'client' | 'project' | 'total' | 'status';
type SortOrder = 'asc' | 'desc';

export const CotizacionesList: React.FC<CotizacionesListProps> = ({
  quotes, onNew, onImportExcel, onEdit, onDuplicate, onNewVersion, onSaveAsTemplate, onUpdateStatus, onDelete, onGenerateOrders
}) => {
  const { proyectos, clientes, currentUserRole, currentUser, updateQuote, isLoading, bulkUpdateQuoteStatus, bulkDeleteQuotes } = useGlobalContext();
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('flat');
  const [sortField, setSortField] = useState<SortField>('id');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedClienteId, setSelectedClienteId] = useState<string>('');
  const [selectedProyectoId, setSelectedProyectoId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'pendientes' | 'todas'>('todas');
  const [historyQuoteId, setHistoryQuoteId] = useState<string | null>(null);

  // Multi-selección y acciones masivas
  const [selectedQuoteIds, setSelectedQuoteIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<string>('');
  const [isBulkUpdating, setIsBulkUpdating] = useState<boolean>(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState<boolean>(false);
  const [blockedDeleteReport, setBlockedDeleteReport] = useState<{ id: string; reason: string }[] | null>(null);

  const handleToggleSelectQuote = (id: string) => {
    setSelectedQuoteIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = (visibleList: Quote[]) => {
    const visibleIds = visibleList.map(q => q.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedQuoteIds.includes(id));
    if (allSelected) {
      setSelectedQuoteIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedQuoteIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleApplyBulkStatus = async () => {
    if (!bulkStatus || selectedQuoteIds.length === 0) return;
    setIsBulkUpdating(true);
    try {
      await bulkUpdateQuoteStatus(selectedQuoteIds, bulkStatus);
      setSelectedQuoteIds([]);
      setBulkStatus('');
    } catch {
      // toast emitido por GlobalContext
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleApplyBulkDelete = async () => {
    if (selectedQuoteIds.length === 0) return;
    if (!window.confirm(`¿Estás seguro de que deseas eliminar las ${selectedQuoteIds.length} cotizaciones seleccionadas?`)) {
      return;
    }
    setIsBulkDeleting(true);
    try {
      const res = await bulkDeleteQuotes(selectedQuoteIds);
      setSelectedQuoteIds([]);
      if (res.blocked && res.blocked.length > 0) {
        setBlockedDeleteReport(res.blocked);
      }
    } catch {
      // toast emitido por GlobalContext
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const handleScrollTable = (direction: 'left' | 'right') => {
    if (tableContainerRef.current) {
      const scrollAmount = 350;
      tableContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedClienteId, selectedProyectoId, filterStatus, activeTab, viewMode]);

  const [editingQuoteNameId, setEditingQuoteNameId] = useState<string | null>(null);
  const [editingQuoteNameValue, setEditingQuoteNameValue] = useState<string>('');

  const handleSaveQuoteName = async (quote: Quote) => {
    const trimmed = editingQuoteNameValue.trim();
    if (!trimmed) {
      toast.error('El nombre de la cotización no puede estar vacío');
      return;
    }
    try {
      await updateQuote({
        ...quote,
        requirement: trimmed
      });
      toast.success('Nombre de cotización actualizado');
      setEditingQuoteNameId(null);
    } catch (e: any) {
      toast.error('Error al actualizar nombre: ' + (e.message || 'Error'));
    }
  };

  interface ActiveLock {
    quoteId?: string;
    userId?: string;
    userName?: string;
    userEmail: string;
    userRole?: string;
    lockedAt: number | string;
    lastHeartbeat?: number | string;
    isSelf?: boolean;
  }
  const [activeLocks, setActiveLocks] = useState<Record<string, ActiveLock>>({});

  React.useEffect(() => {
    let isMounted = true;
    const fetchLocks = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/quotes/locks`, {
          headers: {
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          }
        });
        if (res.ok && isMounted) {
          const data = await res.json();
          setActiveLocks(data.locks || data || {});
        }
      } catch (e) {}
    };

    fetchLocks();
    const interval = setInterval(fetchLocks, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);
  
  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  const toggleClient = (clientName: string) => {
    setExpandedClients(prev => ({ ...prev, [clientName]: !prev[clientName] }));
  };

  const toggleProject = (projectKey: string) => {
    setExpandedProjects(prev => ({ ...prev, [projectKey]: !prev[projectKey] }));
  };

  const handleClienteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedClienteId(e.target.value);
    setSelectedProyectoId('');
  };

  const getProjectName = (projectId?: string) => {
    if (!projectId) return '-';
    return proyectos.find(p => p.id === projectId)?.nombre || 'Proyecto Desconocido';
  };

  const getClientName = (projectId?: string, quoteClient?: string) => {
    if (quoteClient) {
      const found = clientes.find(c => c.id === quoteClient);
      if (found) return found.empresa;
      return quoteClient;
    }
    if (!projectId) return '-';
    const proyecto = proyectos.find(p => p.id === projectId);
    if (!proyecto) return '-';
    const cliente = clientes.find(c => c.id === proyecto.clienteId);
    return cliente ? cliente.empresa : '-';
  };

  const handleExportExcel = async (quote: Quote) => {
    toast.loading('Generando Excel...', { id: 'excel-toast' });
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/quotes/${quote.id}/export-excel`, {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error en el servidor al generar el Excel');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Nombre solicitado: Cotización [Cliente] - [Requerimiento o Proyecto]
      const clientName = getClientName(quote.projectId, quote.client);
      const clientPart = (clientName && clientName !== '-' ? clientName : (quote.client || '')).trim();
      const reqPart = (quote.requirement || (quote.projectId ? getProjectName(quote.projectId) : '') || '').trim();
      let fileBase = 'Cotización';
      if (clientPart && reqPart && reqPart !== '-') {
        fileBase = `Cotización ${clientPart} - ${reqPart}`;
      } else if (clientPart && clientPart !== '-') {
        fileBase = `Cotización ${clientPart}`;
      } else if (reqPart && reqPart !== '-') {
        fileBase = `Cotización ${reqPart}`;
      }
      const cleanFileName = fileBase.replace(/[\\/:*?"<>|]/g, '_').trim();
      a.download = `${cleanFileName}.xlsm`;

      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      toast.success('Excel descargado con éxito', { id: 'excel-toast' });
    } catch (err: any) {
      console.error('Error al descargar Excel:', err);
      toast.error('Error al generar Excel: ' + err.message, { id: 'excel-toast' });
    }
  };

  const formatId = (id: string) => {
    if (!id) return '';
    if (id.startsWith('COT-SEED-')) return id.replace('COT-SEED-', 'COT-');
    if (id.startsWith('Q-HIST-')) return id.replace('Q-HIST-', 'COT-');
    if (id.startsWith('Q-')) return id.replace('Q-', 'COT-');
    if (id.length > 15 && id.includes('-')) {
      return `COT-${id.split('-')[0].toUpperCase()}`;
    }
    if (id.length > 15) {
      return `COT-${id.slice(0, 8).toUpperCase()}`;
    }
    return id;
  };
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Aprobado':
      case 'Aprobada': return 'badge-success';
      case 'Revisión Cuentas':
      case 'Por Revisar - Cuentas':
      case 'Revisión Directorio':
      case 'Por Revisar - Directorio': return 'badge-warning';
      case 'Enviado': return 'badge-info';
      case 'Rechazado': return 'badge-danger';
      case 'Creación':
      case 'En Creación':
      case 'En Producción': return 'badge-info';
      default: return 'badge-info';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 }).format(amount);
  };

  const calculateTotal = (quote: Quote) => {
    let subTotalClient = 0;
    (quote.categories || []).forEach(cat => {
      (cat.items || []).forEach(item => {
        const totalProvider = (item.subItems || []).reduce((acc, sub) => acc + ((sub.unitCost || 0) * (sub.quantity || 0) * (sub.dates || 0)), 0);
        const internalMultiplierAmount = totalProvider * ((item.internalMultiplierPercent || 0) / 100);
        const financialExpense = totalProvider * ((item.financialExpensePercent || 0) / 100);
        const rawClientCost = totalProvider + internalMultiplierAmount + financialExpense;
        const totalClient = Math.round(rawClientCost);
        subTotalClient += totalClient;
      });
    });
    if (subTotalClient > 0) {
      return subTotalClient * 1.12; // final total client (incl fee)
    }
    // Si es una cotización histórica importada que no tiene subítems desglosados, mostrar el subtotal comercial registrado del proyecto
    if (quote.projectId) {
      const proj = proyectos.find(p => p.id === quote.projectId);
      if (proj && proj.subtotal > 0) {
        return proj.subtotal;
      }
    }
    return 0;
  };

  const filteredQuotes = (quotes || []).filter(q => {
    if (!q || q.status === 'Archivado') return false;
    let match = true;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const projName = String(getProjectName(q.projectId) || '').toLowerCase();
      const cliName = String(getClientName(q.projectId, q.client) || '').toLowerCase();
      const idLower = String(q.id || '').toLowerCase();
      const reqLower = String(q.requirement || '').toLowerCase();
      if (!idLower.includes(term) && !reqLower.includes(term) && !projName.includes(term) && !cliName.includes(term)) {
        match = false;
      }
    }
    if (selectedClienteId) {
      const p = proyectos.find(proj => proj.id === q.projectId);
      const cId = p ? p.clienteId : q.client;
      if (cId !== selectedClienteId) match = false;
    }
    if (selectedProyectoId && q.projectId !== selectedProyectoId) {
      match = false;
    }
    if (filterStatus && q.status !== filterStatus) {
      match = false;
    }
    if (activeTab === 'pendientes') {
      if (!isQuotePendingForRole(q, currentUserRole || '')) {
        match = false;
      }
    }
    return match;
  });

  const realQuotes = filteredQuotes.filter(q => !q.isTemplate);
  const templates = quotes.filter(q => q.isTemplate);

  const groupedQuotes = realQuotes.reduce((acc, quote) => {
    const clientName = getClientName(quote.projectId, quote.client);
    const projectName = getProjectName(quote.projectId);
    
    if (!acc[clientName]) acc[clientName] = {};
    if (!acc[clientName][projectName]) acc[clientName][projectName] = [];
    
    acc[clientName][projectName].push(quote);
    return acc;
  }, {} as Record<string, Record<string, Quote[]>>);

  const pendingQuotesCount = useMemo(() => {
    return quotes.filter(q => isQuotePendingForRole(q, currentUserRole || '')).length;
  }, [quotes, currentUserRole]);

  // Auto-expandir clientes y proyectos de cotizaciones pendientes para que se vean de inmediato
  React.useEffect(() => {
    if (activeTab === 'pendientes') {
      const newExpClients: Record<string, boolean> = {};
      const newExpProjects: Record<string, boolean> = {};
      realQuotes.forEach(q => {
        const clientName = getClientName(q.projectId, q.client);
        const projectName = getProjectName(q.projectId);
        newExpClients[clientName] = true;
        newExpProjects[`${clientName}_${projectName}`] = true;
      });
      setExpandedClients(prev => ({ ...prev, ...newExpClients }));
      setExpandedProjects(prev => ({ ...prev, ...newExpProjects }));
    }
  }, [activeTab, realQuotes.length]);

  const hasActiveFilters = Boolean(searchTerm || selectedClienteId || selectedProyectoId || filterStatus);

  const clearAllFilters = () => {
    setSearchTerm('');
    setSelectedClienteId('');
    setSelectedProyectoId('');
    setFilterStatus('');
  };


  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'total' || field === 'version' ? 'desc' : 'asc');
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

  const sortedQuotes = useMemo(() => {
    return [...realQuotes].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'id':
          comparison = (a.id || '').localeCompare(b.id || '', undefined, { numeric: true });
          break;
        case 'requirement': {
          const nameA = a.requirement || getProjectName(a.projectId) || '';
          const nameB = b.requirement || getProjectName(b.projectId) || '';
          comparison = nameA.localeCompare(nameB);
          break;
        }
        case 'client': {
          const clientA = getClientName(a.projectId, a.client);
          const clientB = getClientName(b.projectId, b.client);
          comparison = clientA.localeCompare(clientB);
          break;
        }
        case 'project': {
          const projA = getProjectName(a.projectId);
          const projB = getProjectName(b.projectId);
          comparison = projA.localeCompare(projB);
          break;
        }
        case 'version':
          comparison = (Number(a.version) || 1) - (Number(b.version) || 1);
          break;
        case 'total':
          comparison = calculateTotal(a) - calculateTotal(b);
          break;
        case 'status':
          comparison = (a.status || '').localeCompare(b.status || '');
          break;
        default:
          comparison = 0;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [realQuotes, sortField, sortOrder, proyectos, clientes]);

  const visibleTotalSum = useMemo(() => {
    return realQuotes.reduce((acc, q) => acc + calculateTotal(q), 0);
  }, [realQuotes]);

  const totalPages = Math.ceil(sortedQuotes.length / pageSize) || 1;
  const paginatedQuotes = useMemo(() => {
    if (viewMode === 'grouped') return sortedQuotes;
    const start = (currentPage - 1) * pageSize;
    return sortedQuotes.slice(start, start + pageSize);
  }, [sortedQuotes, currentPage, pageSize, viewMode]);

  const renderQuoteActions = (quote: Quote) => {
    const clientName = getClientName(quote.projectId, quote.client);
    const quoteTitle = (quote.requirement || getProjectName(quote.projectId) || '').trim();
    const cleanClient = clientName && clientName !== '-' ? clientName : '';
    const cleanProj = quoteTitle && quoteTitle !== '-' ? quoteTitle : '';

    return (
      <div className="quote-actions-row" style={{ display: 'inline-flex', gap: '4px', alignItems: 'center', justifyContent: 'center', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
        {canEditQuote(quote.status, currentUserRole || '') && (
          <>
            <button 
              className="btn-icon" 
              onClick={() => onEdit(quote.id)} 
              title={
                activeLocks[quote.id] && !activeLocks[quote.id].isSelf && activeLocks[quote.id].userId !== currentUser?.id
                  ? `En edición por ${activeLocks[quote.id].userEmail} (Se abrirá en modo solo lectura)`
                  : "Editar"
              }
              style={
                activeLocks[quote.id] && !activeLocks[quote.id].isSelf && activeLocks[quote.id].userId !== currentUser?.id
                  ? { color: '#f59e0b' }
                  : undefined
              }
            >
              <Edit2 size={16} />
            </button>
            <button className="btn-icon" onClick={() => onDuplicate(quote.id)} title="Duplicar"><Copy size={16} /></button>
            <button className="btn-icon" onClick={() => onNewVersion(quote.id)} title="Nueva Versión (V+1)"><FileText size={16} /></button>
          </>
        )}
        <button 
          className="btn-icon" 
          onClick={() => {
            window.open(buildQuoteClientUrl(quote.id, cleanClient, cleanProj, quote.version), '_blank');
          }} 
          title="Ver Versión Cliente (Actualizada)"
          style={{ color: 'var(--accent-primary)' }}
        >
          <Eye size={16} />
        </button>
        <button 
          className="btn-icon" 
          onClick={() => {
            const url = buildQuoteClientUrl(quote.id, cleanClient, cleanProj, quote.version);
            navigator.clipboard.writeText(url);
            toast.success(`¡Enlace copiado!\n${cleanClient ? cleanClient + ' - ' : ''}${cleanProj} (V${quote.version})`);
          }} 
          title="Copiar Link Permanente para Cliente"
          style={{ color: 'var(--cyan)' }}
        >
          <Link2 size={16} />
        </button>
        <button className="btn-icon" onClick={() => handleExportExcel(quote)} title="Exportar a Excel (.xlsm)"><Download size={16} /></button>
        {onGenerateOrders && (quote.status || '').toLowerCase().includes('aprob') && (
          <button 
            className="btn-icon" 
            onClick={() => onGenerateOrders(quote.id)} 
            title="Generación Masiva de Órdenes para esta cotización"
            style={{ color: '#7c3aed' }}
          >
            <Layers size={16} />
          </button>
        )}
        {canEditQuote(quote.status, currentUserRole || '') && (
          <>
            <button className="btn-icon" onClick={() => onSaveAsTemplate(quote.id)} title="Guardar como Plantilla"><Archive size={16} /></button>
            <button className="btn-icon" onClick={(e) => { e.stopPropagation(); onDelete(quote.id); }} title="Eliminar Cotización" style={{ color: 'var(--danger)' }}><Trash2 size={16} /></button>
          </>
        )}
        <button className="btn-icon" onClick={() => setHistoryQuoteId(quote.id)} title="Ver Historial"><History size={16} /></button>
      </div>
    );
  };

  const renderQuoteNameCell = (quote: Quote, projectName: string) => {
    return (
      <td className="td-custom" style={{ textAlign: 'left', paddingLeft: '16px', minWidth: '220px' }}>
        {editingQuoteNameId === quote.id ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={e => e.stopPropagation()}>
            <input
              type="text"
              value={editingQuoteNameValue}
              onChange={e => setEditingQuoteNameValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveQuoteName(quote);
                if (e.key === 'Escape') setEditingQuoteNameId(null);
              }}
              autoFocus
              className="form-control"
              style={{ fontSize: '13px', padding: '4px 8px', height: '28px', minWidth: '220px' }}
            />
            <button
              type="button"
              className="btn-icon"
              style={{ color: '#10b981', padding: '2px' }}
              onClick={() => handleSaveQuoteName(quote)}
              title="Guardar nombre"
            >
              <Check size={16} />
            </button>
            <button
              type="button"
              className="btn-icon"
              style={{ color: 'var(--text-muted)', padding: '2px' }}
              onClick={() => setEditingQuoteNameId(null)}
              title="Cancelar"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div 
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            title="Clic en el lápiz o doble clic para editar el nombre de la cotización"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span 
                style={{ 
                  fontWeight: 600, 
                  color: 'var(--text-primary)', 
                  cursor: canEditQuote(quote.status, currentUserRole || '') ? 'pointer' : 'default',
                  lineHeight: 1.3
                }}
                onDoubleClick={() => {
                  if (canEditQuote(quote.status, currentUserRole || '')) {
                    setEditingQuoteNameId(quote.id);
                    setEditingQuoteNameValue(quote.requirement || projectName || '');
                  }
                }}
              >
                {quote.requirement?.trim() || projectName}
              </span>
              {quote.requirement && quote.requirement.trim().toLowerCase() !== projectName.trim().toLowerCase() && (
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  📁 {projectName}
                </span>
              )}
            </div>
            {canEditQuote(quote.status, currentUserRole || '') && (
              <button
                type="button"
                className="btn-icon"
                style={{ opacity: 0.5, padding: '2px', cursor: 'pointer', flexShrink: 0 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingQuoteNameId(quote.id);
                  setEditingQuoteNameValue(quote.requirement || projectName || '');
                }}
                title="Renombrar cotización"
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.5')}
              >
                <Edit2 size={13} />
              </button>
            )}
          </div>
        )}
      </td>
    );
  };

  return (
    <div className="animate-fade-in">
      {/* UNIFIED TOOLBAR: TABS ON THE LEFT, ACTIONS ON THE RIGHT */}
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
        {/* UNIFIED TABS */}
        <div className="unified-tabs" style={{ marginBottom: 0 }}>
          <button 
            className={`unified-tab ${activeTab === 'pendientes' ? 'active' : ''}`}
            onClick={() => setActiveTab('pendientes')}
          >
            Mis Pendientes
            {pendingQuotesCount > 0 && (
              <span className="unified-tab-badge badge-warning">{pendingQuotesCount}</span>
            )}
          </button>
          <button 
            className={`unified-tab ${activeTab === 'todas' ? 'active' : ''}`}
            onClick={() => setActiveTab('todas')}
          >
            Todas
            <span className="unified-tab-badge">{quotes.filter(q => !q.isTemplate && q.status !== 'Archivado').length}</span>
          </button>
        </div>

        {/* VIEW ACTIONS */}
        <div className="view-actions">
          <button 
            type="button"
            className="btn-excel" 
            onClick={() => exportCotizacionesToExcel(quotes, proyectos, clientes)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            title="Exportar base completa de cotizaciones a Excel con detección y diagnóstico de cotizaciones duplicadas"
          >
            <FileSpreadsheet size={18} />
            <span>Exportar Base (Detección Duplicados)</span>
          </button>
          {onImportExcel && (
            <button 
              className="btn-secondary" 
              onClick={onImportExcel}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              title="Crear una cotización importando una plantilla o cotización Excel (.xlsm / .xlsx)"
            >
              <FileSpreadsheet size={18} style={{ color: '#10b981' }} />
              <span>Importar Excel</span>
            </button>
          )}
          <button className="btn-primary" onClick={onNew}>
            <Plus size={18} />
            Nueva Cotización
          </button>
        </div>
      </div>

      {/* UNIFIED FILTER PANEL */}
      <div className="unified-filter-panel">
        <div className="unified-filter-group search-group">
          <label className="unified-filter-label">Búsqueda Rápida</label>
          <div className="unified-search-wrapper">
            <Search size={16} className="unified-search-icon" />
            <input 
              type="text" 
              placeholder="Buscar por ID, requerimiento, proyecto o cliente..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="unified-search-input" 
            />
          </div>
        </div>

        <div className="unified-filter-group fixed-width">
          <label className="unified-filter-label">Cliente</label>
          <select
            value={selectedClienteId}
            onChange={handleClienteChange}
            className="unified-select"
          >
            <option value="">Todos los Clientes</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>{c.empresa}</option>
            ))}
          </select>
        </div>

        <div className="unified-filter-group fixed-width">
          <label className="unified-filter-label">Proyecto</label>
          <select
            value={selectedProyectoId}
            onChange={(e) => setSelectedProyectoId(e.target.value)}
            className="unified-select"
            disabled={!selectedClienteId}
            style={{ opacity: selectedClienteId ? 1 : 0.6 }}
          >
            <option value="">Todos los Proyectos</option>
            {proyectos.filter(p => p.clienteId === selectedClienteId).map(p => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>

        <div className="unified-filter-group fixed-width">
          <label className="unified-filter-label">Estado</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="unified-select"
          >
            <option value="">Todos los Estados</option>
            {['Creación', 'En Producción', 'Revisión Cuentas', 'Revisión Directorio', 'Enviado', 'Aprobado', 'Rechazado'].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <button className="btn-clear-filters" onClick={clearAllFilters} title="Limpiar todos los filtros">
            <X size={14} />
            Limpiar
          </button>
        )}
      </div>

      <div className="desktop-table-container glass-panel table-container" style={{ marginBottom: '32px' }}>
        {/* ENCABEZADO CON CONTADOR, SUMATORIA Y SELECTOR DE VISTA */}
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
              Cotizaciones Activas
            </h3>
            <span className="badge badge-info" style={{ fontSize: '0.8rem', padding: '3px 10px' }}>
              {realQuotes.length} {realQuotes.length === 1 ? 'cotización' : 'cotizaciones'}
            </span>
            {realQuotes.length > 0 && (
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Total acumulado: <strong style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{formatCurrency(visibleTotalSum)}</strong>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* BOTONES DESPLAZAMIENTO HORIZONTAL */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Desplazar:</span>
              <button
                type="button"
                onClick={() => handleScrollTable('left')}
                className="btn-secondary"
                style={{ padding: '3px 8px', fontSize: '0.75rem', height: '26px' }}
                title="Desplazar tabla a la izquierda"
              >
                ◄ Izq
              </button>
              <button
                type="button"
                onClick={() => handleScrollTable('right')}
                className="btn-secondary"
                style={{ padding: '3px 8px', fontSize: '0.75rem', height: '26px' }}
                title="Desplazar tabla a la derecha"
              >
                Der ►
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
                title="Vista plana directa (todas las cotizaciones ordenables en una grilla unificada)"
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
                title="Vista jerárquica tradicional (agrupada por cliente y proyecto)"
              >
                <FolderTree size={14} />
                <span>Agrupada por Cliente</span>
              </button>
            </div>
          </div>
        </div>

        {/* BARRA FLOTANTE DE ACCIÓN MULTI-SELECCIÓN */}
        {selectedQuoteIds.length > 0 && (
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
                {selectedQuoteIds.length} cotización{selectedQuoteIds.length > 1 ? 'es' : ''} seleccionada{selectedQuoteIds.length > 1 ? 's' : ''}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <select
                  value={bulkStatus}
                  onChange={e => setBulkStatus(e.target.value)}
                  className="form-control"
                  style={{ fontSize: '12px', padding: '6px 10px', height: '36px', minWidth: '160px', background: '#ffffff', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                >
                  <option value="">Cambiar Estado a...</option>
                  {['Creación', 'En Producción', 'Revisión Cuentas', 'Revisión Directorio', 'Enviado', 'Aprobado', 'Rechazado', 'Archivado'].map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleApplyBulkStatus}
                  disabled={!bulkStatus || isBulkUpdating}
                  style={{ height: '36px', fontSize: '12px', padding: '0 14px' }}
                >
                  {isBulkUpdating ? 'Aplicando...' : 'Aplicar Estado'}
                </button>
              </div>

              <button
                type="button"
                className="btn-secondary"
                onClick={handleApplyBulkDelete}
                disabled={isBulkDeleting}
                style={{ height: '36px', fontSize: '12px', padding: '0 14px', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                title="Eliminar de forma segura las cotizaciones seleccionadas"
              >
                <Trash2 size={14} style={{ marginRight: '6px' }} />
                {isBulkDeleting ? 'Eliminando...' : 'Eliminar Seleccionadas'}
              </button>

              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedQuoteIds([])}
                style={{ height: '36px', padding: '0 12px', fontSize: '12px' }}
              >
                Deseleccionar
              </button>
            </div>
          </div>
        )}

        <div 
          ref={tableContainerRef} 
          className="custom-table-scroll" 
          style={{ 
            maxHeight: 'calc(100vh - 280px)', 
            minHeight: '400px', 
            overflowX: 'auto', 
            overflowY: 'auto', 
            position: 'relative' 
          }}
        >
          {isLoading ? (
            <SkeletonTable 
              columns={viewMode === 'flat' ? 9 : 7} 
              rows={6} 
              message="Cargando cotizaciones desde la base de datos..." 
            />
          ) : (
            <table className="data-table" style={{ width: '100%', minWidth: viewMode === 'flat' ? '1630px' : '1400px', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
              {viewMode === 'flat' ? (
                <colgroup>
                <col style={{ width: '48px' }} />
                <col style={{ width: '140px' }} />
                <col style={{ width: '320px' }} />
                <col style={{ width: '200px' }} />
                <col style={{ width: '220px' }} />
                <col style={{ width: '90px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '160px' }} />
                <col style={{ width: '300px' }} />
              </colgroup>
            ) : (
              <colgroup>
                <col style={{ width: '140px' }} />
                <col style={{ width: '350px' }} />
                <col style={{ width: '90px' }} />
                <col style={{ width: '220px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '300px' }} />
              </colgroup>
            )}
            <thead style={{ position: 'sticky', top: 0, zIndex: 12, backgroundColor: '#f8fafc' }}>
              {viewMode === 'flat' ? (
                <tr>
                  <th className="header-custom text-center sticky-col-left" style={{ position: 'sticky', left: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '48px', minWidth: '48px', maxWidth: '48px', padding: '0 8px', verticalAlign: 'middle' }}>
                    <input
                      type="checkbox"
                      checked={paginatedQuotes.length > 0 && paginatedQuotes.every(q => selectedQuoteIds.includes(q.id))}
                      onChange={() => handleToggleSelectAll(paginatedQuotes)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#7c3aed' }}
                      title="Seleccionar todas las cotizaciones visibles"
                    />
                  </th>
                  {renderSortHeader('ID', 'id', 'text-center sticky-col-left', { position: 'sticky', left: '48px', zIndex: 16, backgroundColor: '#f8fafc', width: '140px', minWidth: '140px', maxWidth: '140px', whiteSpace: 'nowrap' })}
                  {renderSortHeader('NOMBRE DE COTIZACIÓN', 'requirement', 'text-left', { minWidth: '220px' })}
                  {renderSortHeader('CLIENTE', 'client', 'text-left', { minWidth: '180px' })}
                  {renderSortHeader('PROYECTO', 'project', 'text-left', { minWidth: '190px' })}
                  {renderSortHeader('VERSIÓN', 'version', 'text-center', { width: '90px', whiteSpace: 'nowrap' })}
                  {renderSortHeader('TOTAL CLIENTE', 'total', 'text-right', { width: '150px', whiteSpace: 'nowrap' })}
                  {renderSortHeader('ESTADO', 'status', 'text-center', { width: '160px', whiteSpace: 'nowrap' })}
                  <th className="header-custom text-center sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '300px', minWidth: '300px', whiteSpace: 'nowrap' }}>ACCIONES</th>
                </tr>
              ) : (
                <tr>
                  <th className="header-custom sticky-col-left" style={{ position: 'sticky', left: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '140px', minWidth: '140px', maxWidth: '140px' }}>ID</th>
                  <th className="header-custom" style={{ textAlign: 'left', paddingLeft: '16px' }}>NOMBRE DE COTIZACIÓN</th>
                  <th className="header-custom">VERSIÓN</th>
                  <th className="header-custom">CLIENTE</th>
                  <th className="header-custom">TOTAL CLIENTE</th>
                  <th className="header-custom">ESTADO</th>
                  <th className="header-custom text-center sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '300px', minWidth: '300px', whiteSpace: 'nowrap' }}>ACCIONES</th>
                </tr>
              )}
            </thead>
            <tbody>
              {viewMode === 'flat' ? (
                paginatedQuotes.map(quote => {
                  const clientName = getClientName(quote.projectId, quote.client);
                  const projectName = getProjectName(quote.projectId);
                  return (
                    <tr key={quote.id} className="hover-bg-subtle" style={{ transition: 'background-color 0.15s ease' }}>
                      <td className="td-custom text-center sticky-col-left" style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: '#ffffff', width: '48px', minWidth: '48px', maxWidth: '48px', padding: '0 8px', verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedQuoteIds.includes(quote.id)}
                          onChange={() => handleToggleSelectQuote(quote.id)}
                          style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#7c3aed' }}
                        />
                      </td>
                      <td className="td-custom text-center font-bold font-mono sticky-col-left" style={{ position: 'sticky', left: '48px', zIndex: 10, backgroundColor: '#ffffff', color: 'var(--accent-primary)', width: '140px', minWidth: '140px', maxWidth: '140px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {formatId(quote.id)}
                      </td>
                    {renderQuoteNameCell(quote, projectName)}
                    <td className="td-custom text-left" style={{ verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Building2 size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {clientName}
                        </span>
                      </div>
                    </td>
                    <td className="td-custom text-left" style={{ verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Briefcase size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {projectName}
                        </span>
                      </div>
                    </td>
                    <td className="td-custom text-center font-bold" style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      <span style={{ 
                        backgroundColor: 'rgba(102, 45, 145, 0.08)', 
                        color: 'var(--accent-primary)', 
                        padding: '3px 8px', 
                        borderRadius: '4px',
                        fontSize: '0.78rem'
                      }}>
                        V{quote.version}
                      </span>
                    </td>
                    <td className="td-custom text-right font-bold text-cyan font-tabular" style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      {formatCurrency(calculateTotal(quote))}
                    </td>
                    <td className="td-custom text-center" style={{ verticalAlign: 'middle' }}>
                      <select
                        value={quote.status}
                        onChange={(e) => onUpdateStatus(quote.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className={`badge ${getStatusBadge(quote.status)}`}
                        style={{ background: 'transparent', border: '1px solid var(--border-color)', outline: 'none', cursor: 'pointer' }}
                      >
                        {getAvailableStatuses(currentUserRole, quote.status).map(t => (
                          <option key={t} value={t} style={{ color: 'black' }}>{t}</option>
                        ))}
                      </select>
                      {activeLocks[quote.id] && (
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            marginTop: '5px',
                            fontSize: '0.72rem',
                            backgroundColor: '#fffbeb',
                            color: '#b45309',
                            border: '1px solid #fde68a',
                            borderRadius: '12px',
                            padding: '2px 8px',
                            whiteSpace: 'nowrap'
                          }}
                          title={`En edición activa por ${activeLocks[quote.id].userEmail}`}
                        >
                          <span style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            backgroundColor: '#f59e0b',
                            display: 'inline-block'
                          }} />
                          <span>
                            {activeLocks[quote.id].isSelf || currentUser?.id === activeLocks[quote.id].userId
                              ? 'Editando (Tú)' 
                              : `Editando: ${activeLocks[quote.id].userEmail?.split('@')[0]}`}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="td-custom sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 10, backgroundColor: 'inherit', verticalAlign: 'middle' }}>
                      {renderQuoteActions(quote)}
                    </td>
                  </tr>
                );
              })
            ) : (
              Object.entries(groupedQuotes).map(([clientName, projects]) => (
                <React.Fragment key={clientName}>
                  <tr 
                    style={{ backgroundColor: 'rgba(102, 45, 145, 0.08)', cursor: 'pointer' }}
                    onClick={() => toggleClient(clientName)}
                  >
                    <td colSpan={7} style={{ padding: '12px 16px', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {expandedClients[clientName] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        🏢 CLIENTE: {clientName.toUpperCase()}
                      </div>
                    </td>
                  </tr>
                  
                  {expandedClients[clientName] && Object.entries(projects).map(([projectName, quotesList]) => {
                    const projectKey = `${clientName}_${projectName}`;
                    return (
                      <React.Fragment key={projectName}>
                        <tr 
                          style={{ backgroundColor: 'rgba(0, 0, 0, 0.03)', cursor: 'pointer' }}
                          onClick={() => toggleProject(projectKey)}
                        >
                          <td colSpan={7} style={{ padding: '8px 16px 8px 32px', fontWeight: 'bold', fontSize: '13px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {expandedProjects[projectKey] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              📁 Proyecto: {projectName}
                            </div>
                          </td>
                        </tr>
                        
                        {expandedProjects[projectKey] && quotesList.map(quote => (
                          <tr key={quote.id} className="expandable-row">
                            <td className="td-custom text-center font-bold font-mono sticky-col-left" style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: '#ffffff', width: '140px', minWidth: '140px', maxWidth: '140px', padding: '10px 12px', color: 'var(--accent-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatId(quote.id)}</td>
                            {renderQuoteNameCell(quote, projectName)}
                            <td className="td-custom text-center font-bold">V{quote.version}</td>
                            <td className="td-custom text-center">{clientName}</td>
                            <td className="td-custom text-right font-bold text-cyan font-tabular">{formatCurrency(calculateTotal(quote))}</td>
                            <td className="td-custom text-center">
                              <select
                                value={quote.status}
                                onChange={(e) => onUpdateStatus(quote.id, e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className={`badge ${getStatusBadge(quote.status)}`}
                                style={{ background: 'transparent', border: '1px solid var(--border-color)', outline: 'none', cursor: 'pointer' }}
                              >
                                {getAvailableStatuses(currentUserRole, quote.status).map(t => (
                                  <option key={t} value={t} style={{ color: 'black' }}>{t}</option>
                                ))}
                              </select>
                              {activeLocks[quote.id] && (
                                <div
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    marginTop: '5px',
                                    fontSize: '0.72rem',
                                    backgroundColor: '#fffbeb',
                                    color: '#b45309',
                                    border: '1px solid #fde68a',
                                    borderRadius: '12px',
                                    padding: '2px 8px',
                                    whiteSpace: 'nowrap'
                                  }}
                                  title={`En edición activa por ${activeLocks[quote.id].userEmail}`}
                                >
                                  <span style={{
                                    width: '7px',
                                    height: '7px',
                                    borderRadius: '50%',
                                    backgroundColor: '#f59e0b',
                                    display: 'inline-block'
                                  }} />
                                  <span>
                                    {activeLocks[quote.id].isSelf || currentUser?.id === activeLocks[quote.id].userId
                                      ? 'Editando (Tú)' 
                                      : `Editando: ${activeLocks[quote.id].userEmail?.split('@')[0]}`}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="td-custom sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 10, backgroundColor: 'inherit' }}>
                              {renderQuoteActions(quote)}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              ))
            )}
            
            {realQuotes.length === 0 && (
              <tr>
                <td colSpan={viewMode === 'flat' ? 8 : 7} className="td-custom text-center" style={{ padding: '36px 16px', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {activeTab === 'pendientes' 
                        ? 'No tienes cotizaciones pendientes de revisión' 
                        : 'No se encontraron cotizaciones registradas'}
                    </span>
                    <span style={{ fontSize: '0.8rem' }}>
                      {activeTab === 'pendientes'
                        ? 'Todas tus cotizaciones están al día o no requieren acción en este momento.'
                        : 'Intenta ajustar los filtros de búsqueda o crea una nueva cotización.'}
                    </span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
          )}
        </div>

        {/* PAGINATION CONTROLS */}
        {viewMode === 'flat' && !isLoading && sortedQuotes.length > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 20px',
            borderTop: '1px solid var(--border-color)',
            backgroundColor: '#fafafa',
            flexWrap: 'wrap',
            gap: '12px',
            borderRadius: '0 0 12px 12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Mostrando {((currentPage - 1) * pageSize) + 1} a {Math.min(currentPage * pageSize, sortedQuotes.length)} de {sortedQuotes.length} cotizaciones
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Por página:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="form-control"
                  style={{ width: '75px', padding: '3px 8px', fontSize: '0.82rem', height: '28px' }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={500}>500</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                style={{ padding: '4px 12px', fontSize: '0.82rem', height: '28px', opacity: currentPage <= 1 ? 0.5 : 1, cursor: currentPage <= 1 ? 'not-allowed' : 'pointer' }}
              >
                Anterior
              </button>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', padding: '0 4px' }}>
                Página {currentPage} de {totalPages}
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                style={{ padding: '4px 12px', fontSize: '0.82rem', height: '28px', opacity: currentPage >= totalPages ? 0.5 : 1, cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer' }}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="glass-panel table-container" style={{ marginTop: '24px', marginBottom: '64px' }}>
        <h3 style={{ padding: '16px 24px', margin: 0, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)' }}>
          Plantillas Guardadas
        </h3>
        <table className="data-table">
          <thead>
            <tr>
              <th className="header-custom">ID PLANTILLA</th>
              <th className="header-custom">NOMBRE DE PLANTILLA</th>
              <th className="header-custom">REQUERIMIENTO</th>
              <th className="header-custom">ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {templates.map(tpl => (
              <tr key={tpl.id} className="expandable-row">
                <td className="td-custom text-center font-bold" style={{ color: 'var(--accent-primary)' }}>{formatId(tpl.id)}</td>
                <td className="td-custom font-bold">{tpl.templateName}</td>
                <td className="td-custom">{tpl.requirement}</td>
                <td className="td-custom">
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button className="btn-icon" onClick={() => onEdit(tpl.id)} title="Editar Plantilla"><Edit2 size={16} /></button>
                    <button className="btn-icon" onClick={() => onDuplicate(tpl.id)} title="Crear Cotización desde Plantilla"><Copy size={16} /></button>
                    <button className="btn-icon" onClick={() => onDelete(tpl.id)} title="Eliminar Plantilla" style={{ color: 'var(--danger)' }}><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr><td colSpan={4} className="td-custom text-center">No hay plantillas registradas.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <QuoteHistoryModal 
        isOpen={!!historyQuoteId} 
        onClose={() => setHistoryQuoteId(null)} 
        quoteId={historyQuoteId || ''} 
      />

      {/* DIÁLOGO INFORMATIVO DE COTIZACIONES BLOQUEADAS (PREVENCIÓN DE ERRORES CRÍTICOS) */}
      {blockedDeleteReport && (
        <div 
          className="modal-overlay" 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            backgroundColor: 'rgba(15, 23, 42, 0.65)', 
            backdropFilter: 'blur(4px)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 9999, 
            padding: '16px' 
          }}
          onClick={() => setBlockedDeleteReport(null)}
        >
          <div 
            className="glass-panel" 
            style={{ 
              backgroundColor: '#ffffff', 
              borderRadius: '16px', 
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', 
              maxWidth: '540px', 
              width: '100%', 
              padding: '24px', 
              border: '1.5px solid #fde047' 
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '14px' }}>
              <div style={{ background: '#fef9c3', padding: '10px', borderRadius: '12px', color: '#ca8a04', flexShrink: 0 }}>
                <AlertTriangle size={26} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b', fontWeight: 700 }}>
                  Aviso: Algunas cotizaciones no se pudieron eliminar
                </h3>
                <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5 }}>
                  Para evitar inconsistencias en tus reportes de costos y finanzas, el sistema protege las cotizaciones que tienen órdenes de compra o pagos asociados:
                </p>
              </div>
            </div>

            <div style={{ maxHeight: '220px', overflowY: 'auto', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px' }}>
              {blockedDeleteReport.map((b, idx) => (
                <div key={b.id || idx} style={{ fontSize: '0.82rem', padding: '8px 0', borderBottom: idx < blockedDeleteReport.length - 1 ? '1px solid #e2e8f0' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <span style={{ fontWeight: 700, color: 'var(--accent-primary)', fontFamily: 'monospace' }}>
                    {formatId(b.id)}
                  </span>
                  <span style={{ color: '#dc2626', fontWeight: 500 }}>
                    ⚠️ {b.reason}
                  </span>
                </div>
              ))}
            </div>

            <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 18px 0' }}>
              💡 Si deseas eliminarlas, primero debes anular o reasignar las órdenes y pagos asociados en sus respectivos módulos.
            </p>

            <button
              type="button"
              className="btn-primary"
              onClick={() => setBlockedDeleteReport(null)}
              style={{ width: '100%', height: '40px', fontSize: '0.9rem', fontWeight: 600 }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
