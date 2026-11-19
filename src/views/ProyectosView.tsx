import React, { useState, useMemo, useRef } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';
import { 
  Plus, Search, ChevronDown, ChevronRight, ChevronLeft, FileText, Edit2, Calendar, 
  Receipt, Trash2, X, Folder, User, ArrowUpDown, ArrowUp, ArrowDown, FileSpreadsheet, BookOpen
} from 'lucide-react';
import { useGlobalContext } from '../context/GlobalContext';
import { ProjectModal } from '../components/ProjectModal';
import { ProjectOrdersModal } from '../components/ProjectOrdersModal';
import { GanttBuilderView } from './GanttBuilderView';
import { BookBuilderView } from './BookBuilderView';
import { SkeletonTable } from '../components/SkeletonTable';
import type { Proyecto } from '../types/models';
import type { Quote } from '../types/quote';
import { exportProyectosToExcel } from '../utils/excelExport';
import toast from 'react-hot-toast';

const parseDateToTimestamp = (dateStr?: string | null): number => {
  if (!dateStr || dateStr === '-' || dateStr === 'NO APLICA') return 0;
  const clean = String(dateStr).trim().split(' ')[0];
  if (!clean) return 0;

  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const y = parseInt(parts[2], 10);
      const dateObj = new Date(y, m, d);
      if (!isNaN(dateObj.getTime())) return dateObj.getTime();
    }
  }

  if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const dateObj = new Date(y, m, d);
      if (!isNaN(dateObj.getTime())) return dateObj.getTime();
    }
  }

  const d = new Date(clean);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

const toDateInputValue = (str?: string | null): string => {
  if (!str || str === '-' || str === 'NO APLICA') return '';
  const clean = String(str).trim().split(' ')[0];
  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 3) {
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = parts[2];
      return `${y}-${m}-${d}`;
    }
  }
  if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) return clean;
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return '';
};

const fromDateInputValue = (val: string): string => {
  if (!val) return '-';
  const parts = val.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return val;
};

const ESTADOS_EXCEL = [
  'PENDIENTE CP',
  'PENDIENTE MP',
  'PENDIENTE LP',
  'APROBADO',
  'RECHAZADO',
  'EN EJECUCIÓN',
  'FINALIZADO'
];

const STATUS_ACTIVIDAD_OPTIONS = [
  'EN PROCESO',
  'FINALIZADO',
  'LIQUIDADO',
  'CANCELADO',
  'PENDIENTE'
];

const normalizeStatusActividad = (val?: string): string => {
  if (!val) return '';
  const norm = val.trim().toUpperCase();
  if (norm === 'LIQUIDADO' || norm === 'LIQUIDADA') return 'LIQUIDADO';
  if (norm === 'EN PROCESO') return 'EN PROCESO';
  if (norm === 'FINALIZADO' || norm === 'FINALIZADA') return 'FINALIZADO';
  if (norm === 'CANCELADO' || norm === 'CANCELADA') return 'CANCELADO';
  if (norm === 'PENDIENTE') return 'PENDIENTE';
  return val.trim();
};

const getStatusActividadBadgeStyle = (status?: string): React.CSSProperties => {
  const norm = (status || '').toLowerCase().trim();
  if (!norm) {
    return {
      backgroundColor: 'rgba(0, 0, 0, 0.04)',
      color: 'var(--text-muted)',
      border: '1px dashed var(--border-color)',
      fontWeight: 500,
      padding: '4px 8px',
      borderRadius: '8px',
      fontSize: '11px',
      display: 'inline-block',
      whiteSpace: 'nowrap'
    };
  }
  if (norm.includes('liquid')) {
    return {
      backgroundColor: '#ecfdf5',
      color: '#047857',
      border: '1px solid #6ee7b7',
      fontWeight: 700,
      padding: '4px 8px',
      borderRadius: '8px',
      fontSize: '11px',
      display: 'inline-block',
      whiteSpace: 'nowrap'
    };
  }
  if (norm.includes('proc')) {
    return {
      backgroundColor: '#eff6ff',
      color: '#1d4ed8',
      border: '1px solid #93c5fd',
      fontWeight: 700,
      padding: '4px 8px',
      borderRadius: '8px',
      fontSize: '11px',
      display: 'inline-block',
      whiteSpace: 'nowrap'
    };
  }
  if (norm.includes('final')) {
    return {
      backgroundColor: '#f1f5f9',
      color: '#334155',
      border: '1px solid #cbd5e1',
      fontWeight: 700,
      padding: '4px 8px',
      borderRadius: '8px',
      fontSize: '11px',
      display: 'inline-block',
      whiteSpace: 'nowrap'
    };
  }
  if (norm.includes('cancel')) {
    return {
      backgroundColor: '#fef2f2',
      color: '#b91c1c',
      border: '1px solid #fca5a5',
      fontWeight: 700,
      padding: '4px 8px',
      borderRadius: '8px',
      fontSize: '11px',
      display: 'inline-block',
      whiteSpace: 'nowrap'
    };
  }
  if (norm.includes('pend')) {
    return {
      backgroundColor: '#fefce8',
      color: '#a16207',
      border: '1px solid #fef08a',
      fontWeight: 700,
      padding: '4px 8px',
      borderRadius: '8px',
      fontSize: '11px',
      display: 'inline-block',
      whiteSpace: 'nowrap'
    };
  }
  return {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-color)',
    fontWeight: 600,
    padding: '4px 8px',
    borderRadius: '8px',
    fontSize: '11px',
    display: 'inline-block',
    whiteSpace: 'nowrap'
  };
};

type SortField = 'id' | 'fechaRegistro' | 'fechaAprobacion' | 'nombre' | 'cliente' | 'projectManager' | 'tipoServicio' | 'tipoProyecto' | 'moneda' | 'subtotal' | 'estado' | 'statusActividad';
type SortOrder = 'asc' | 'desc';

export const ProyectosView: React.FC = () => {
  const { proyectos, clientes, quotes, currentUserRole, isLoading, deleteProyecto, updateProyecto } = useGlobalContext();
  const isMobile = useIsMobile(768);
  const [mobileDisplayMode, setMobileDisplayMode] = useState<'cards' | 'table'>('cards');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOrdersModalOpen, setIsOrdersModalOpen] = useState(false);
  const [selectedOrdersProyecto, setSelectedOrdersProyecto] = useState<Proyecto | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [selectedGanttProjectId, setSelectedGanttProjectId] = useState<string | null>(null);
  const [selectedBookProjectId, setSelectedBookProjectId] = useState<string | null>(null);
  const [editingProyecto, setEditingProyecto] = useState<Proyecto | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCliente, setFilterCliente] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterPm, setFilterPm] = useState('');
  const [filterRango, setFilterRango] = useState('');

  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const hasActiveFilters = Boolean(searchTerm || filterCliente || filterEstado || filterPm || filterRango || sortField !== null);
  const resetFilters = () => {
    setSearchTerm('');
    setFilterCliente('');
    setFilterEstado('');
    setFilterPm('');
    setFilterRango('');
    setSortField(null);
    setSortOrder('asc');
    setCurrentPage(1);
  };

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const tableContainerRef = useRef<HTMLDivElement>(null);

  const handleScrollTable = (direction: 'left' | 'right') => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollBy({
        left: direction === 'left' ? -380 : 380,
        behavior: 'smooth'
      });
    }
  };

  const handleSort = (field: SortField) => {
    setCurrentPage(1);
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getClienteName = (clienteId: string) => {
    const c = clientes.find(c => c.id === clienteId);
    return c ? c.empresa : 'Desconocido';
  };

  const formatNumberWithCommas = (val?: number | string | null): string => {
    const num = typeof val === 'number' ? val : Number(val);
    const safeNum = isNaN(num) ? 0 : num;
    return safeNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatCurrency = (val?: number | string | null, moneda: 'PEN' | 'USD' | string = 'PEN') => {
    const symbol = moneda === 'USD' ? '$' : 'S/';
    return `${symbol} ${formatNumberWithCommas(val)}`;
  };

  const formatRangeString = (r: string) => {
    return r.replace(/\b\d{4,}\b/g, (m) => Number(m).toLocaleString('en-US'));
  };

  const getProjectMoneda = (p: Proyecto): 'PEN' | 'USD' => {
    if (p.moneda === 'USD' || p.moneda === 'PEN') return p.moneda;
    const projectQuotes = (quotes || []).filter(q => q && q.projectId === p.id);
    const usdQuote = projectQuotes.find(q => q.currency === 'USD');
    if (usdQuote) return 'USD';
    return 'PEN';
  };

  const calculateQuoteTotal = (quote: Quote): number => {
    if ((quote as any).total && typeof (quote as any).total === 'number') {
      return (quote as any).total;
    }
    let subTotalClient = 0;
    (quote.categories || []).forEach(cat => {
      (cat.items || []).forEach(item => {
        const totalProvider = (item.subItems || []).reduce(
          (acc, sub) => acc + ((Number(sub.unitCost) || 0) * (Number(sub.quantity) || 0) * (Number(sub.dates) || 0)), 
          0
        );
        const internalMultiplierAmount = totalProvider * ((Number(item.internalMultiplierPercent) || 0) / 100);
        const financialExpense = totalProvider * ((Number(item.financialExpensePercent) || 0) / 100);
        const rawClientCost = totalProvider + internalMultiplierAmount + financialExpense;
        const totalClient = Math.round(rawClientCost);
        subTotalClient += totalClient;
      });
    });
    return subTotalClient * 1.12;
  };

  const getQuoteTotalInSoles = (quote: Quote): number => {
    const total = calculateQuoteTotal(quote);
    if (quote.currency === 'USD') {
      return total * (Number(quote.exchangeRate) || 3.75);
    }
    return total;
  };

  /**
   * Obtiene la cotización oficial/relevante de un proyecto según jerarquía estricta:
   * 1. Liquidada (prioridad máxima - cotización final ejecutada)
   * 2. Aprobada / Ganada
   * 3. Enviada / Cotización Enviada
   * 4. En Creación / Borrador
   * 5. Cualquier otra (ej. última versión o mayor importe)
   * Dentro del mismo nivel, prioriza la de mayor monto comercial (para que un adicional menor no opaque a la cotización principal).
   */
  const getProjectRelevantQuote = (proyecto: Proyecto, projectQuotes: Quote[]): Quote | null => {
    if (!projectQuotes || projectQuotes.length === 0) return null;

    const liquidQuotes = projectQuotes.filter(q => (q.status || '').toLowerCase().includes('liquid'));
    const aprobQuotes = projectQuotes.filter(q => {
      const s = (q.status || '').toLowerCase();
      return s.includes('aprob') || s.includes('ganad');
    });
    const enviadQuotes = projectQuotes.filter(q => (q.status || '').toLowerCase().includes('enviad'));
    const draftQuotes = projectQuotes.filter(q => {
      const s = (q.status || '').toLowerCase();
      return s.includes('creac') || s.includes('borrad');
    });

    const sortBestQuote = (arr: Quote[]): Quote => {
      return [...arr].sort((a, b) => {
        const totalA = calculateQuoteTotal(a);
        const totalB = calculateQuoteTotal(b);
        if (Math.abs(totalA - totalB) > 0.01) {
          return totalB - totalA; // Mayor monto primero (cotización principal)
        }
        return (Number(b.version) || 1) - (Number(a.version) || 1);
      })[0];
    };

    if (liquidQuotes.length > 0) return sortBestQuote(liquidQuotes);
    if (aprobQuotes.length > 0) return sortBestQuote(aprobQuotes);
    if (enviadQuotes.length > 0) return sortBestQuote(enviadQuotes);
    if (draftQuotes.length > 0) return sortBestQuote(draftQuotes);

    return sortBestQuote(projectQuotes);
  };

  const getProjectEffectiveSubtotal = (proyecto: Proyecto): number => {
    const projectQuotes = (quotes || []).filter(q => q && q.projectId === proyecto.id);
    const relevantQuote = getProjectRelevantQuote(proyecto, projectQuotes);
    if (relevantQuote) {
      return getQuoteTotalInSoles(relevantQuote);
    }
    if (proyecto.subtotal && Number(proyecto.subtotal) > 0) {
      return Number(proyecto.subtotal);
    }
    return 0;
  };

  const checkAmountInRange = (amount: number, rangeStr: string): boolean => {
    if (rangeStr === '0 - 5000') return amount >= 0 && amount <= 5000;
    if (rangeStr === '5001 - 15000') return amount >= 5001 && amount <= 15000;
    if (rangeStr === '15001 - 50000') return amount >= 15001 && amount <= 50000;
    if (rangeStr === '50000 a más') return amount > 50000;
    return false;
  };

  const normalizeEstadoValue = (estado?: string): string => {
    const norm = (estado || '').toUpperCase().trim();
    if (norm === 'CP' || norm === '1.EN ESPERA CP' || norm === 'REGISTRADO' || norm === 'COTIZACIÓN ENVIADA') return 'PENDIENTE CP';
    if (norm === 'MP' || norm === '2.EN ESPERA MP') return 'PENDIENTE MP';
    if (norm === 'LP' || norm === '3.EN ESPERA LP') return 'PENDIENTE LP';
    if (norm === 'APROBADO' || norm === 'GANADO' || norm === '4.APROBADO') return 'APROBADO';
    if (norm === 'RECHAZADO' || norm === 'PERDIDO' || norm === '5.RECHAZADO') return 'RECHAZADO';
    if (norm === 'EN EJECUCIÓN' || norm === 'EN EJECUCION') return 'EN EJECUCIÓN';
    if (norm === 'FINALIZADO') return 'FINALIZADO';
    return estado || 'PENDIENTE CP';
  };

  const getEstadoWeight = (estado?: string): number => {
    const norm = (estado || '').toLowerCase().trim();
    if (norm.includes('cp') || (norm.includes('pend') && norm.includes('cp'))) return 1;
    if (norm.includes('mp') || (norm.includes('pend') && norm.includes('mp'))) return 2;
    if (norm.includes('lp') || (norm.includes('pend') && norm.includes('lp'))) return 3;
    if (norm.includes('pend') || norm.includes('regist')) return 4;
    if (norm.includes('aprob') || norm.includes('ganad')) return 5;
    if (norm.includes('ejec')) return 6;
    if (norm.includes('final')) return 7;
    if (norm.includes('rechaz') || norm.includes('perdid')) return 8;
    return 9;
  };

  const filteredProyectos = (proyectos || []).filter(p => {
    if (!p || p.estado === 'Archivado') return false;
    const term = (searchTerm || '').toLowerCase();
    const matchesSearch = !term ||
                          String(p.nombre || '').toLowerCase().includes(term) || 
                          String(p.id || '').toLowerCase().includes(term) ||
                          String(p.contactoNombre || '').toLowerCase().includes(term) ||
                          String(p.contactoCargo || '').toLowerCase().includes(term) ||
                          String(getClienteName(p.clienteId) || '').toLowerCase().includes(term);
    const matchesCliente = filterCliente === '' || p.clienteId === filterCliente;

    const pm = p.projectManager || 'Eric Higa';
    const matchesPm = filterPm === '' || pm === filterPm;

    const matchesEstado = filterEstado === '' || p.estado === filterEstado;

    const effectiveSub = getProjectEffectiveSubtotal(p);
    const legacyNum = Number(p.presupuestoEstimado);
    const matchesRango = filterRango === '' ||
      p.presupuestoEstimado === filterRango ||
      (effectiveSub > 0 && checkAmountInRange(effectiveSub, filterRango)) ||
      (!isNaN(legacyNum) && legacyNum > 0 && checkAmountInRange(legacyNum, filterRango));

    return matchesSearch && matchesCliente && matchesPm && matchesRango && matchesEstado;
  });

  const sortedProyectos = useMemo(() => {
    if (!sortField) {
      // Default order: Fecha Registro descendente, Estado y Status de Actividad
      return [...filteredProyectos].sort((a, b) => {
        const timeA = parseDateToTimestamp(a.fechaRegistro);
        const timeB = parseDateToTimestamp(b.fechaRegistro);
        if (timeB !== timeA) return timeB - timeA;

        const wA = getEstadoWeight(a.estado);
        const wB = getEstadoWeight(b.estado);
        if (wA !== wB) return wA - wB;

        return (a.statusActividad || '').localeCompare(b.statusActividad || '', 'es', { sensitivity: 'base' });
      });
    }

    return [...filteredProyectos].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'id':
          comparison = (a.id || '').localeCompare(b.id || '', undefined, { numeric: true, sensitivity: 'base' });
          break;

        case 'fechaRegistro': {
          const timeA = parseDateToTimestamp(a.fechaRegistro);
          const timeB = parseDateToTimestamp(b.fechaRegistro);
          comparison = timeA - timeB;
          break;
        }

        case 'fechaAprobacion': {
          const timeA = parseDateToTimestamp(a.fechaAprobacion);
          const timeB = parseDateToTimestamp(b.fechaAprobacion);
          if (timeA === 0 && timeB !== 0) return 1;
          if (timeB === 0 && timeA !== 0) return -1;
          comparison = timeA - timeB;
          break;
        }

        case 'nombre':
          comparison = (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
          break;

        case 'cliente': {
          const nameA = getClienteName(a.clienteId);
          const nameB = getClienteName(b.clienteId);
          comparison = nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
          break;
        }

        case 'projectManager': {
          const pmA = a.projectManager || 'Eric Higa';
          const pmB = b.projectManager || 'Eric Higa';
          comparison = pmA.localeCompare(pmB, 'es', { sensitivity: 'base' });
          break;
        }

        case 'tipoServicio':
          comparison = (a.tipoServicio || '').localeCompare(b.tipoServicio || '', 'es', { sensitivity: 'base' });
          break;

        case 'tipoProyecto':
          comparison = (a.tipoProyecto || '').localeCompare(b.tipoProyecto || '', 'es', { sensitivity: 'base' });
          break;

        case 'moneda': {
          const monA = getProjectMoneda(a);
          const monB = getProjectMoneda(b);
          comparison = monA.localeCompare(monB);
          break;
        }

        case 'subtotal': {
          const subA = getProjectEffectiveSubtotal(a) || Number(a.presupuestoEstimado) || 0;
          const subB = getProjectEffectiveSubtotal(b) || Number(b.presupuestoEstimado) || 0;
          comparison = subA - subB;
          break;
        }

        case 'estado':
          comparison = (a.estado || '').localeCompare(b.estado || '', 'es', { sensitivity: 'base' });
          break;

        case 'statusActividad':
          comparison = (a.statusActividad || '').localeCompare(b.statusActividad || '', 'es', { sensitivity: 'base' });
          break;

        default:
          comparison = 0;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredProyectos, sortField, sortOrder, clientes, quotes]);

  const totalPages = Math.ceil(sortedProyectos.length / pageSize) || 1;

  const paginatedProyectos = useMemo(() => {
    if (pageSize >= sortedProyectos.length) return sortedProyectos;
    const start = (currentPage - 1) * pageSize;
    return sortedProyectos.slice(start, start + pageSize);
  }, [sortedProyectos, currentPage, pageSize]);

  const renderSortHeader = (label: string, field: SortField, className = 'text-left', style: React.CSSProperties = {}) => {
    const isActive = sortField === field;
    return (
      <th
        className={`header-custom ${className}`}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 12,
          backgroundColor: '#f8fafc',
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background-color 0.15s, color 0.15s',
          borderBottom: '2px solid var(--border-color)',
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

  const handleOpenModal = (proyecto?: Proyecto) => {
    setEditingProyecto(proyecto || null);
    setIsModalOpen(true);
  };

  const getEstadoBadgeStyle = (estado: string): React.CSSProperties => {
    const norm = (estado || '').toLowerCase().trim();
    if (norm.includes('rechaz') || norm.includes('perdid') || norm.includes('cancel')) {
      return {
        backgroundColor: '#fee2e2',
        color: '#b91c1c',
        border: '1px solid #fca5a5',
        fontWeight: 700,
        padding: '4px 8px',
        borderRadius: '8px',
        fontSize: '11px',
        display: 'inline-block',
        whiteSpace: 'nowrap'
      };
    }
    if (norm.includes('aprob') || norm.includes('ganad')) {
      return {
        backgroundColor: '#dcfce7',
        color: '#15803d',
        border: '1px solid #86efac',
        fontWeight: 700,
        padding: '4px 8px',
        borderRadius: '8px',
        fontSize: '11px',
        display: 'inline-block',
        whiteSpace: 'nowrap'
      };
    }
    if (norm.includes('ejec')) {
      return {
        backgroundColor: '#f3e8ff',
        color: '#7e22ce',
        border: '1px solid #d8b4fe',
        fontWeight: 700,
        padding: '4px 8px',
        borderRadius: '8px',
        fontSize: '11px',
        display: 'inline-block',
        whiteSpace: 'nowrap'
      };
    }
    if (norm.includes('final')) {
      return {
        backgroundColor: '#f1f5f9',
        color: '#475569',
        border: '1px solid #cbd5e1',
        fontWeight: 700,
        padding: '4px 8px',
        borderRadius: '8px',
        fontSize: '11px',
        display: 'inline-block',
        whiteSpace: 'nowrap'
      };
    }
    if (norm.includes('mp')) {
      return {
        backgroundColor: '#ffedd5',
        color: '#c2410c',
        border: '1px solid #fed7aa',
        fontWeight: 700,
        padding: '4px 8px',
        borderRadius: '8px',
        fontSize: '11px',
        display: 'inline-block',
        whiteSpace: 'nowrap'
      };
    }
    if (norm.includes('lp')) {
      return {
        backgroundColor: '#e0f2fe',
        color: '#0369a1',
        border: '1px solid #bae6fd',
        fontWeight: 700,
        padding: '4px 8px',
        borderRadius: '8px',
        fontSize: '11px',
        display: 'inline-block',
        whiteSpace: 'nowrap'
      };
    }
    // Default PENDIENTE CP
    return {
      backgroundColor: '#fef3c7',
      color: '#b45309',
      border: '1px solid #fde68a',
      fontWeight: 700,
      padding: '4px 8px',
      borderRadius: '8px',
      fontSize: '11px',
      display: 'inline-block',
      whiteSpace: 'nowrap'
    };
  };

  const getRowStatusClass = (estado: string) => {
    const norm = (estado || '').toLowerCase().trim();
    if (norm.includes('rechaz') || norm.includes('perdid') || norm.includes('cancel')) {
      return 'row-status-rechazado';
    }
    if (norm.includes('aprob') || norm.includes('ganad')) {
      return 'row-status-aprobado';
    }
    if (norm.includes('registr') || norm.includes('pendient')) {
      return 'row-status-registrado';
    }
    return '';
  };

  const formatId = (id: string) => {
    if (!id) return '';
    if (id.startsWith('PRJ-')) return id;
    if (id.length > 15 && id.includes('-')) {
      return `PRJ-${id.split('-')[0].toUpperCase()}`;
    }
    return id.toUpperCase();
  };

  const renderPresupuestoCell = (proyecto: Proyecto) => {
    const projectQuotes = (quotes || []).filter(q => q && q.projectId === proyecto.id);
    const relevantQuote = getProjectRelevantQuote(proyecto, projectQuotes);
    const projectMoneda = getProjectMoneda(proyecto);

    if (relevantQuote) {
      const qTotal = calculateQuoteTotal(relevantQuote);
      const qSymbol = relevantQuote.currency === 'USD' ? '$' : 'S/';
      const sLower = (relevantQuote.status || '').toLowerCase();
      const isLiquid = sLower.includes('liquid');
      const isAprob = sLower.includes('aprob') || sLower.includes('ganad');

      // Cotizaciones con aprobación/liquidación para indicar si hay adicionales
      const allApprovedOrLiquid = projectQuotes.filter(q => {
        const s = (q.status || '').toLowerCase();
        return s.includes('liquid') || s.includes('aprob') || s.includes('ganad');
      });
      const hasMultipleApproved = allApprovedOrLiquid.length > 1;

      return (
        <div style={{ lineHeight: 1.25, textAlign: 'right' }}>
          <div style={{ fontWeight: 700, color: isLiquid ? 'var(--success)' : 'var(--accent-primary)', fontSize: '0.88rem' }}>
            {qSymbol} {formatNumberWithCommas(qTotal)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
            <span>V{relevantQuote.version}</span>
            {isLiquid && (
              <span className="badge badge-success" style={{ fontSize: '0.62rem', padding: '1px 5px', fontWeight: 600 }}>
                Liquidado
              </span>
            )}
            {!isLiquid && isAprob && (
              <span className="badge badge-info" style={{ fontSize: '0.62rem', padding: '1px 5px', fontWeight: 600 }}>
                Aprobado
              </span>
            )}
            {hasMultipleApproved && (
              <span title={`Incluye adicionales (${allApprovedOrLiquid.length} cotizaciones)`} style={{ color: 'var(--accent-primary)', fontWeight: 600, fontSize: '0.68rem' }}>
                (+{allApprovedOrLiquid.length - 1} adic.)
              </span>
            )}
            {proyecto.presupuestoEstimado && (
              <span>• Rango: {formatRangeString(proyecto.presupuestoEstimado)}</span>
            )}
          </div>
        </div>
      );
    }

    if (proyecto.subtotal && Number(proyecto.subtotal) > 0) {
      return (
        <div style={{ lineHeight: 1.25, textAlign: 'right' }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.88rem' }}>
            {formatCurrency(Number(proyecto.subtotal), projectMoneda)}
          </div>
          {proyecto.presupuestoEstimado && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Rango: {formatRangeString(proyecto.presupuestoEstimado)}
            </div>
          )}
        </div>
      );
    }

    if (proyecto.presupuestoEstimado) {
      const num = Number(proyecto.presupuestoEstimado);
      if (!isNaN(num) && num > 0) {
        return (
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {formatCurrency(num, projectMoneda)}
            </span>
          </div>
        );
      }
      return (
        <div style={{ textAlign: 'right' }}>
          <span style={{ 
            fontSize: '0.75rem', 
            fontWeight: 600, 
            padding: '2px 8px', 
            borderRadius: '12px', 
            backgroundColor: 'rgba(0,0,0,0.04)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)'
          }}>
            Rango: {formatRangeString(proyecto.presupuestoEstimado)}
          </span>
        </div>
      );
    }

    return <div style={{ textAlign: 'right', color: 'var(--text-muted)' }}>-</div>;
  };

  if (selectedGanttProjectId) {
    return <GanttBuilderView projectId={selectedGanttProjectId} onBack={() => setSelectedGanttProjectId(null)} />;
  }

  if (selectedBookProjectId) {
    const bookProj = proyectos.find((p) => p.id === selectedBookProjectId);
    if (bookProj) {
      return <BookBuilderView project={bookProj} onBack={() => setSelectedBookProjectId(null)} />;
    }
  }

  return (
    <div className="animate-fade-in" style={{ width: '100%' }}>
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
            <Folder size={15} />
            <span>{proyectos.filter(p => p.estado !== 'Archivado').length} Proyectos Registrados</span>
          </div>
          {filteredProyectos.length !== proyectos.length && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              ({filteredProyectos.length} tras filtrar)
            </span>
          )}
        </div>

        <div className="view-actions">
          <button 
            type="button"
            className="btn-excel" 
            onClick={() => exportProyectosToExcel(proyectos, clientes, quotes)} 
            title="Descargar base de proyectos en Excel"
          >
            <FileSpreadsheet size={16} />
            <span>Descargar Excel</span>
          </button>
          <button className="btn-primary" onClick={() => handleOpenModal()}>
            <Plus size={18} />
            <span>Nuevo Proyecto</span>
          </button>
        </div>
      </div>

      {/* PANEL DE FILTROS UNIFICADOS */}
      <div className="unified-filter-panel" style={{ width: '100%', marginBottom: '18px', padding: '16px 20px' }}>
        <div className="unified-filter-group search-group" style={{ flex: '2 1 280px', minWidth: '240px' }}>
          <label className="unified-filter-label">Búsqueda Rápida</label>
          <div className="unified-search-wrapper">
            <Search size={16} className="unified-search-icon" />
            <input 
              type="text" 
              className="unified-search-input" 
              placeholder="Buscar por proyecto, código, cliente, contacto..." 
              value={searchTerm} 
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }} 
            />
          </div>
        </div>

        <div className="unified-filter-group fixed-width" style={{ flex: '1 1 200px', minWidth: '180px' }}>
          <label className="unified-filter-label">Cliente</label>
          <select 
            className="unified-select"
            value={filterCliente}
            onChange={e => { setFilterCliente(e.target.value); setCurrentPage(1); }}
          >
            <option value="">Todos los Clientes</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>{c.empresa}</option>
            ))}
          </select>
        </div>

        <div className="unified-filter-group fixed-width" style={{ flex: '1 1 170px', minWidth: '160px' }}>
          <label className="unified-filter-label">Estado</label>
          <select 
            className="unified-select"
            value={filterEstado}
            onChange={e => { setFilterEstado(e.target.value); setCurrentPage(1); }}
          >
            <option value="">Todos los Estados</option>
            {ESTADOS_EXCEL.map(est => (
              <option key={est} value={est}>{est}</option>
            ))}
          </select>
        </div>

        <div className="unified-filter-group fixed-width" style={{ flex: '1 1 180px', minWidth: '160px' }}>
          <label className="unified-filter-label">Project Manager</label>
          <select 
            className="unified-select"
            value={filterPm}
            onChange={e => { setFilterPm(e.target.value); setCurrentPage(1); }}
          >
            <option value="">Todos los PMs</option>
            <option value="Eric Higa">Eric Higa</option>
            <option value="Maria Paula de la Puente">Maria Paula de la Puente</option>
          </select>
        </div>

        <div className="unified-filter-group fixed-width" style={{ flex: '1 1 170px', minWidth: '150px' }}>
          <label className="unified-filter-label">Rango Presupuesto</label>
          <select 
            className="unified-select"
            value={filterRango}
            onChange={e => { setFilterRango(e.target.value); setCurrentPage(1); }}
          >
            <option value="">Todos los Rangos</option>
            <option value="0 - 5000">0 - 5,000</option>
            <option value="5001 - 15000">5,001 - 15,000</option>
            <option value="15001 - 50000">15,001 - 50,000</option>
            <option value="50000 a más">50,000 a más</option>
          </select>
        </div>

        {hasActiveFilters && (
          <button 
            type="button"
            className="btn-clear-filters" 
            onClick={resetFilters} 
            title="Limpiar filtros y ordenamiento"
          >
            <X size={14} />
            Limpiar
          </button>
        )}
      </div>

      {/* TABLA DE PROYECTOS — ESTRUCTURA UNIFICADA */}
      <div className="glass-panel table-container" style={{ marginBottom: '56px', padding: 0, overflow: 'hidden' }}>
        {/* ENCABEZADO CON CONTADOR Y CONTROLES DE DESPLAZAMIENTO */}
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
              Listado de Proyectos
            </h3>
            <span className="badge badge-info" style={{ fontSize: '0.8rem', padding: '3px 10px' }}>
              {sortedProyectos.length} {sortedProyectos.length === 1 ? 'proyecto' : 'proyectos'}
            </span>
            {filteredProyectos.length !== proyectos.length && (
              <span style={{ fontSize: '0.82rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
                (Filtros activos)
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Selector de modo para mobile: Tarjetas vs Tabla */}
            {isMobile && (
              <div className="mobile-view-switcher">
                <button 
                  type="button"
                  className={`mobile-view-switcher-btn ${mobileDisplayMode === 'cards' ? 'active' : ''}`}
                  onClick={() => setMobileDisplayMode('cards')}
                  title="Ver proyectos como tarjetas"
                >
                  📱 Tarjetas
                </button>
                <button 
                  type="button"
                  className={`mobile-view-switcher-btn ${mobileDisplayMode === 'table' ? 'active' : ''}`}
                  onClick={() => setMobileDisplayMode('table')}
                  title="Ver proyectos como tabla completa"
                >
                  📋 Tabla
                </button>
              </div>
            )}

            {/* Controles de desplazamiento horizontal de columnas */}
            {(!isMobile || mobileDisplayMode === 'table') && (
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
            )}
          </div>
        </div>

        {/* CONTENEDOR SCROLL CON CABECERA PEGAJOSA */}
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
          <SkeletonTable columns={8} />
        ) : (isMobile && mobileDisplayMode === 'cards') ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px' }}>
            {paginatedProyectos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
                <Folder size={32} color="var(--text-muted)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>No se encontraron proyectos con los filtros seleccionados.</p>
                {hasActiveFilters && (
                  <button type="button" className="btn-secondary" onClick={resetFilters} style={{ margin: '12px auto 0', fontSize: '12px' }}>
                    Restablecer Filtros
                  </button>
                )}
              </div>
            ) : (
              paginatedProyectos.map(proyecto => {
                const clienteName = getClienteName(proyecto.clienteId);
                const effectiveSub = getProjectEffectiveSubtotal(proyecto);
                const isUsd = getProjectMoneda(proyecto) === 'USD';
                const currencySymbol = isUsd ? '$' : 'S/';
                const badgeStyle = getEstadoBadgeStyle(proyecto.estado);

                return (
                  <div 
                    key={proyecto.id} 
                    style={{ 
                      padding: '16px', 
                      borderRadius: '14px', 
                      border: '1px solid var(--border-color)',
                      background: '#ffffff',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                  >
                    {/* Top Row: ID & Status Badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent-primary)' }}>
                        {proyecto.id}
                      </span>
                      <span style={{ 
                        ...badgeStyle,
                        fontSize: '0.74rem', 
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontWeight: 700
                      }}>
                        {normalizeEstadoValue(proyecto.estado)}
                      </span>
                    </div>

                    {/* Project Name and Client */}
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {proyecto.nombre}
                      </h4>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        🏢 {clienteName}
                      </div>
                    </div>

                    {/* Metrics Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '10px 12px', background: '#F8F9FA', borderRadius: '10px' }}>
                      <div>
                        <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 700, display: 'block', textTransform: 'uppercase' }}>Project Manager</span>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{proyecto.projectManager || 'Eric Higa'}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 700, display: 'block', textTransform: 'uppercase' }}>Presupuesto</span>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: effectiveSub > 0 ? '#059669' : 'var(--text-muted)' }}>
                          {effectiveSub > 0 ? `${currencySymbol} ${formatNumberWithCommas(effectiveSub.toFixed(2))}` : '-'}
                        </span>
                      </div>
                    </div>

                    {/* Dates */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
                      <span>Reg: {proyecto.fechaRegistro || '-'}</span>
                      <span>Estado: {proyecto.fechaAprobacion || '-'}</span>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                      <button 
                        type="button" 
                        className="btn-secondary" 
                        style={{ flex: 1, height: '40px', justifyContent: 'center', fontSize: '12px', padding: '0 8px' }}
                        onClick={() => setSelectedGanttProjectId(proyecto.id)}
                      >
                        <Calendar size={14} style={{ color: 'var(--accent-primary)' }} />
                        Gantt
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ flex: 1, height: '40px', justifyContent: 'center', fontSize: '12px', padding: '0 8px' }}
                        onClick={() => setSelectedBookProjectId(proyecto.id)}
                      >
                        <BookOpen size={14} style={{ color: '#7030A0' }} />
                        Book
                      </button>
                      <button 
                        type="button" 
                        className="btn-secondary" 
                        style={{ flex: 1, height: '40px', justifyContent: 'center', fontSize: '12px', padding: '0 8px' }}
                        onClick={() => { setSelectedOrdersProyecto(proyecto); setIsOrdersModalOpen(true); }}
                      >
                        <Receipt size={14} style={{ color: '#059669' }} />
                        Órdenes
                      </button>
                      <button 
                        type="button" 
                        className="btn-primary" 
                        style={{ flex: 1, height: '40px', justifyContent: 'center', fontSize: '12px', padding: '0 8px' }}
                        onClick={() => handleOpenModal(proyecto)}
                      >
                        <Edit2 size={14} />
                        Editar
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <table 
            className="data-table" 
            style={{ 
              width: '100%', 
              minWidth: '2020px',
              tableLayout: 'fixed',
              borderCollapse: 'separate',
              borderSpacing: 0
            }}
          >
            <colgroup>
              <col style={{ width: '135px' }} /> {/* 1. ID */}
              <col style={{ width: '125px' }} /> {/* 2. FECHA REGISTRO */}
              <col style={{ width: '145px' }} /> {/* 3. FECHA DE ESTADO */}
              <col style={{ width: '210px' }} /> {/* 4. CLIENTE */}
              <col style={{ width: '280px' }} /> {/* 5. NOMBRE PROYECTO */}
              <col style={{ width: '165px' }} /> {/* 6. PROJECT MANAGER */}
              <col style={{ width: '195px' }} /> {/* 7. TIPO SERVICIO */}
              <col style={{ width: '135px' }} /> {/* 8. TIPO PROYECTO */}
              <col style={{ width: '100px' }} /> {/* 9. MONEDA */}
              <col style={{ width: '180px' }} /> {/* 10. PRESUPUESTO / COTIZACION */}
              <col style={{ width: '165px' }} /> {/* 11. ESTADO */}
              <col style={{ width: '145px' }} /> {/* 12. STATUS ACTIVIDAD */}
              <col style={{ width: '160px' }} /> {/* 13. ACCIONES */}
            </colgroup>
            <thead style={{ position: 'sticky', top: 0, zIndex: 12, backgroundColor: '#f8fafc' }}>
              <tr>
                {renderSortHeader('ID PROYECTO', 'id', 'text-left sticky-col-left', { width: '135px', left: 0 })}
                {renderSortHeader('FECHA REGISTRO', 'fechaRegistro', 'text-center', { width: '125px' })}
                {renderSortHeader('FECHA DE ESTADO', 'fechaAprobacion', 'text-center', { width: '145px' })}
                {renderSortHeader('CLIENTE', 'cliente', 'text-left', { width: '210px' })}
                {renderSortHeader('NOMBRE DEL PROYECTO', 'nombre', 'text-left', { width: '280px' })}
                {renderSortHeader('PROJECT MANAGER', 'projectManager', 'text-center', { width: '165px' })}
                {renderSortHeader('TIPO DE SERVICIO', 'tipoServicio', 'text-center', { width: '195px' })}
                {renderSortHeader('TIPO DE PROYECTO', 'tipoProyecto', 'text-center', { width: '135px' })}
                {renderSortHeader('MONEDA', 'moneda', 'text-center', { width: '100px' })}
                {renderSortHeader('PRESUPUESTO / COTIZACIÓN', 'subtotal', 'text-right', { width: '180px' })}
                {renderSortHeader('ESTADO', 'estado', 'text-center', { width: '165px' })}
                {renderSortHeader('STATUS ACTIVIDAD', 'statusActividad', 'text-center', { width: '145px' })}
                <th className="header-custom text-center sticky-col-right" style={{ width: '160px', right: 0, position: 'sticky', top: 0, zIndex: 16, backgroundColor: '#f8fafc', whiteSpace: 'nowrap' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProyectos.length === 0 ? (
                <tr>
                  <td colSpan={13} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
                    <Folder size={36} color="var(--text-muted)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>No se encontraron proyectos que coincidan con la búsqueda o filtros.</p>
                    {hasActiveFilters && (
                      <button type="button" className="btn-secondary" onClick={resetFilters} style={{ margin: '12px auto 0', fontSize: '12px' }}>
                        Restablecer Filtros
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedProyectos.map((proyecto) => {
                  const projectQuotes = (quotes || []).filter(q => q && q.projectId === proyecto.id);
                  const isExpanded = expandedProjectId === proyecto.id;
                  const projectMoneda = getProjectMoneda(proyecto);

                  return (
                    <React.Fragment key={proyecto.id}>
                      <tr 
                        onClick={() => setExpandedProjectId(isExpanded ? null : proyecto.id)} 
                        style={{ 
                          cursor: 'pointer',
                          transition: 'background-color 0.15s ease'
                        }} 
                        className={`hover-bg-subtle ${getRowStatusClass(proyecto.estado)}`}
                      >
                        {/* 1. ID PROYECTO */}
                        <td className="td-custom font-mono text-left sticky-col-left" style={{ left: 0, whiteSpace: 'nowrap', verticalAlign: 'middle', fontWeight: 600 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{formatId(proyecto.id)}</span>
                          </div>
                        </td>

                        {/* 2. FECHA REGISTRO */}
                        <td className="td-custom text-center" style={{ whiteSpace: 'nowrap', verticalAlign: 'middle', fontSize: '0.85rem' }}>
                          {proyecto.fechaRegistro || '-'}
                        </td>

                        {/* 3. FECHA DE ESTADO (EDITABLE INLINE) */}
                        <td className="td-custom text-center" style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                          <input 
                            type="date"
                            value={toDateInputValue(proyecto.fechaAprobacion)}
                            onChange={async (e) => {
                              const val = fromDateInputValue(e.target.value);
                              await updateProyecto(proyecto.id, { fechaAprobacion: val });
                              toast.success('Fecha de estado actualizada', { duration: 1500 });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            title="Clic para cambiar Fecha de Estado"
                            style={{
                              background: 'rgba(0,0,0,0.03)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '6px',
                              padding: '3px 6px',
                              fontSize: '0.78rem',
                              color: 'var(--text-primary)',
                              cursor: 'pointer',
                              width: '100%',
                              maxWidth: '130px'
                            }}
                          />
                        </td>

                        {/* 4. CLIENTE */}
                        <td className="td-custom text-left" style={{ verticalAlign: 'middle' }}>
                          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {getClienteName(proyecto.clienteId)}
                          </div>
                          {proyecto.contactoNombre && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <User size={12} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                              <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{proyecto.contactoNombre}</span>
                              {proyecto.contactoCargo && <span style={{ opacity: 0.85 }}>• {proyecto.contactoCargo}</span>}
                            </div>
                          )}
                        </td>

                        {/* 5. NOMBRE DEL PROYECTO */}
                        <td className="td-custom font-bold text-left" style={{ verticalAlign: 'middle', lineHeight: 1.35 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {proyecto.nombre}
                          </div>
                        </td>

                        {/* 6. PROJECT MANAGER (EDITABLE INLINE) */}
                        <td className="td-custom text-center" style={{ verticalAlign: 'middle' }}>
                          <select
                            value={proyecto.projectManager || 'Eric Higa'}
                            onChange={async (e) => {
                              const newPm = e.target.value;
                              await updateProyecto(proyecto.id, { projectManager: newPm });
                              toast.success(`PM asignado: ${newPm}`, { duration: 1500 });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            title="Clic para asignar Project Manager"
                            style={{
                              fontSize: '0.78rem',
                              padding: '3px 6px',
                              borderRadius: '6px',
                              border: '1px solid var(--border-color)',
                              background: 'rgba(0,0,0,0.03)',
                              color: 'var(--text-primary)',
                              cursor: 'pointer',
                              width: '100%',
                              maxWidth: '150px'
                            }}
                          >
                            <option value="Eric Higa">Eric Higa</option>
                            <option value="Maria Paula de la Puente">Maria Paula de la Puente</option>
                            {proyecto.projectManager && !['Eric Higa', 'Maria Paula de la Puente'].includes(proyecto.projectManager) && (
                              <option value={proyecto.projectManager}>{proyecto.projectManager}</option>
                            )}
                          </select>
                        </td>

                        {/* 7. TIPO DE SERVICIO */}
                        <td className="td-custom text-center" style={{ fontSize: 'var(--text-xs)', verticalAlign: 'middle' }}>
                          <span 
                            title={proyecto.tipoServicio || ''}
                            style={{ 
                              display: 'inline-block',
                              maxWidth: '175px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(0,0,0,0.04)',
                              fontWeight: 500
                            }}
                          >
                            {proyecto.tipoServicio || '-'}
                          </span>
                        </td>

                        {/* 8. TIPO DE PROYECTO */}
                        <td className="td-custom text-center" style={{ fontSize: 'var(--text-xs)', verticalAlign: 'middle' }}>
                          <span 
                            title={proyecto.tipoProyecto || ''}
                            style={{ 
                              display: 'inline-block',
                              maxWidth: '120px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontWeight: 500
                            }}
                          >
                            {proyecto.tipoProyecto || '-'}
                          </span>
                        </td>

                        {/* 9. MONEDA (EDITABLE INLINE) */}
                        <td className="td-custom text-center" style={{ verticalAlign: 'middle' }}>
                          <select
                            value={projectMoneda}
                            onChange={async (e) => {
                              const newMoneda = e.target.value as 'PEN' | 'USD';
                              await updateProyecto(proyecto.id, { moneda: newMoneda });
                              toast.success(`Moneda cambiada a ${newMoneda === 'USD' ? 'Dólares ($)' : 'Soles (S/)'}`, { duration: 1500 });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            title="Clic para cambiar Moneda"
                            style={{
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              padding: '3px 6px',
                              borderRadius: '6px',
                              border: '1px solid var(--border-color)',
                              background: projectMoneda === 'USD' ? '#f0fdf4' : 'rgba(0,0,0,0.03)',
                              color: projectMoneda === 'USD' ? '#15803d' : 'var(--text-primary)',
                              cursor: 'pointer',
                              textAlign: 'center',
                              width: '100%',
                              maxWidth: '85px'
                            }}
                          >
                            <option value="PEN">S/ (PEN)</option>
                            <option value="USD">$ (USD)</option>
                          </select>
                        </td>

                        {/* 10. PRESUPUESTO / COTIZACIÓN (CON COMAS EN MILES) */}
                        <td className="td-custom text-right font-bold" style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                          {renderPresupuestoCell(proyecto)}
                        </td>

                        {/* 11. ESTADO (EDITABLE INLINE CON FORMATO EXCEL) */}
                        <td className="td-custom text-center" style={{ verticalAlign: 'middle' }}>
                          <select
                            value={normalizeEstadoValue(proyecto.estado)}
                            onChange={async (e) => {
                              const newEstado = e.target.value;
                              const updates: Partial<Proyecto> = { estado: newEstado };
                              if (newEstado === 'APROBADO' && (!proyecto.fechaAprobacion || proyecto.fechaAprobacion === '-')) {
                                updates.fechaAprobacion = new Date().toLocaleDateString('es-PE');
                              }
                              await updateProyecto(proyecto.id, updates);
                              toast.success(`Estado: ${newEstado}`, { duration: 1500 });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              ...getEstadoBadgeStyle(proyecto.estado),
                              outline: 'none',
                              cursor: 'pointer',
                              textAlign: 'center',
                              textAlignLast: 'center',
                              width: '100%',
                              maxWidth: '150px'
                            }}
                            title="Clic para cambiar Estado del Proyecto"
                          >
                            {ESTADOS_EXCEL.map(st => (
                              <option key={st} value={st} style={{ background: '#ffffff', color: '#1e293b' }}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* 12. STATUS ACTIVIDAD (EDITABLE INLINE CON DROPDOWN DE OPCIONES) */}
                        <td className="td-custom text-center" style={{ verticalAlign: 'middle' }}>
                          <select
                            value={normalizeStatusActividad(proyecto.statusActividad)}
                            onChange={async (e) => {
                              const newStatus = e.target.value;
                              await updateProyecto(proyecto.id, { statusActividad: newStatus });
                              toast.success(newStatus ? `Status actividad: ${newStatus}` : 'Status actividad restablecido', { duration: 1500 });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              ...getStatusActividadBadgeStyle(proyecto.statusActividad),
                              outline: 'none',
                              cursor: 'pointer',
                              textAlign: 'center',
                              textAlignLast: 'center',
                              width: '100%',
                              maxWidth: '135px'
                            }}
                            title="Clic para seleccionar Status de Actividad"
                          >
                            <option value="" style={{ background: '#ffffff', color: '#64748b' }}>
                              Status...
                            </option>
                            {STATUS_ACTIVIDAD_OPTIONS.map(opt => (
                              <option key={opt} value={opt} style={{ background: '#ffffff', color: '#1e293b' }}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* 13. ACCIONES */}
                        <td className="td-custom text-center sticky-col-right" style={{ right: 0, verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: '4px', justifyContent: 'center', alignItems: 'center', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                            {proyecto.driveFolderUrl && (
                              <a 
                                href={proyecto.driveFolderUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="btn-icon" 
                                onClick={(e) => e.stopPropagation()} 
                                title="Abrir carpeta oficial en Google Drive" 
                                style={{ color: '#0284c7' }}
                              >
                                <Folder size={16} />
                              </a>
                            )}
                            {(currentUserRole === 'Directorio' || currentUserRole === 'Admin') && (
                              <button 
                                className="btn-icon" 
                                onClick={(e) => { e.stopPropagation(); setSelectedOrdersProyecto(proyecto); setIsOrdersModalOpen(true); }} 
                                title="Gestionar Órdenes OC/OS y Facturas" 
                                style={{ color: 'var(--accent-primary)' }}
                              >
                                <Receipt size={16} />
                              </button>
                            )}
                            <button 
                              className="btn-icon" 
                              onClick={(e) => { e.stopPropagation(); setSelectedGanttProjectId(proyecto.id); }} 
                              title="Ver Cronogramas Gantt"
                            >
                              <Calendar size={16} />
                            </button>
                            <button
                              className="btn-icon"
                              onClick={(e) => { e.stopPropagation(); setSelectedBookProjectId(proyecto.id); }}
                              title="Books y Presentaciones"
                              style={{ color: '#7030A0' }}
                            >
                              <BookOpen size={16} />
                            </button>
                            {(currentUserRole === 'Directorio' || currentUserRole === 'Admin') && (
                              <>
                                <button 
                                  className="btn-icon" 
                                  onClick={(e) => { e.stopPropagation(); handleOpenModal(proyecto); }} 
                                  title="Editar Proyecto Completo"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button 
                                  className="btn-icon" 
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    if (window.confirm(`¿Está seguro de eliminar el proyecto ${proyecto.nombre}?`)) { 
                                      deleteProyecto(proyecto.id); 
                                    } 
                                  }} 
                                  title="Eliminar Proyecto" 
                                  style={{ color: 'var(--danger)' }}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* SUB-FILA EXPANDIBLE: COTIZACIONES VINCULADAS */}
                      {isExpanded && (
                        <tr className="expanded-detail-row">
                          <td colSpan={13} style={{ padding: '16px 24px', backgroundColor: 'rgba(0,0,0,0.015)', borderBottom: '1px solid var(--border-color)' }}>
                            <div style={{ padding: '8px 0' }}>
                              <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FileText size={16} style={{ color: 'var(--accent-primary)' }} />
                                Cotizaciones del Proyecto ({projectQuotes.length})
                              </h4>
                              
                              {projectQuotes.length > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
                                  {projectQuotes.map(quote => (
                                    <div 
                                      key={quote.id} 
                                      style={{ 
                                        padding: '12px 16px', 
                                        backgroundColor: 'var(--bg-primary)', 
                                        borderRadius: '8px', 
                                        border: '1px solid var(--border-color)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                                      }}
                                    >
                                      <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Versión {quote.version}</span>
                                          <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>{quote.status}</span>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                          Fecha: {quote.date}
                                        </div>
                                      </div>
                                      
                                      <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: 700, color: 'var(--success)', fontSize: '0.9rem' }}>
                                          {quote.currency === 'USD' ? '$ ' : 'S/ '}
                                          {formatNumberWithCommas(calculateQuoteTotal(quote))}
                                        </div>
                                        {quote.currency === 'USD' && (
                                          <div style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', marginTop: '2px', fontWeight: 600 }}>
                                            ≈ S/ {formatNumberWithCommas(calculateQuoteTotal(quote) * (Number(quote.exchangeRate) || 3.75))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>No hay cotizaciones registradas para este proyecto.</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        )}
        </div>
      </div>

      {/* BARRA DE PAGINACIÓN */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '12px 16px', 
        background: 'var(--bg-panel)', 
        borderRadius: '10px', 
        border: '1px solid var(--border-color)', 
        marginBottom: '48px',
        flexWrap: 'wrap', 
        gap: '12px' 
      }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Mostrando {sortedProyectos.length === 0 ? 0 : Math.min((currentPage - 1) * pageSize + 1, sortedProyectos.length)} - {Math.min(currentPage * pageSize, sortedProyectos.length)} de <strong>{sortedProyectos.length}</strong> proyectos
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Filas por página:</span>
            <select 
              value={pageSize} 
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="unified-select"
              style={{ padding: '3px 8px', fontSize: '0.8rem', width: 'auto' }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={99999}>Todos ({sortedProyectos.length})</option>
            </select>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
              >
                Anterior
              </button>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, padding: '0 6px' }}>
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <ProjectModal 
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          proyecto={editingProyecto}
        />
      )}

      {isOrdersModalOpen && selectedOrdersProyecto && (
        <ProjectOrdersModal 
          isOpen={isOrdersModalOpen}
          onClose={() => setIsOrdersModalOpen(false)}
          proyecto={selectedOrdersProyecto}
        />
      )}
    </div>
  );
};
