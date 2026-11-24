import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Search, 
  X, 
  ShoppingCart, 
  Receipt, 
  ArrowUpRight,
  Edit3,
  Save,
  AlertCircle,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useGlobalContext } from '../context/GlobalContext';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { SkeletonTable } from '../components/SkeletonTable';
import { useIsMobile } from '../hooks/useIsMobile';
import type { Proyecto, Orden } from '../types/models';
import { getOrderCostSinIgv as computeOrderCostSinIgv } from '../utils/liquidacionHelpers';

interface Props {
  onNavigate?: (module: string, itemId?: string) => void;
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const RentabilidadProyectoView: React.FC<Props> = ({ onNavigate }) => {
  const { proyectos, clientes, quotes, ordenes, gastosProduccion, proveedores, isLoading, updateProyecto } = useGlobalContext();
  const isMobile = useIsMobile(768);
  const [mobileDisplayMode, setMobileDisplayMode] = useState<'cards' | 'table'>('cards');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedServicio, setSelectedServicio] = useState<string>('todos');
  const [selectedCliente, setSelectedCliente] = useState<string>('todos');
  const [selectedAnio, setSelectedAnio] = useState<string>('todos');
  const [selectedMes, setSelectedMes] = useState<string>('todos');
  const [selectedStatus, setSelectedStatus] = useState<string>('todos');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // Table Scroll & Pagination States
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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedServicio, selectedCliente, selectedAnio, selectedMes, selectedStatus, fechaDesde, fechaHasta]);

  // Project selected for detailed cost breakdown drawer/modal
  const [selectedProjectForDetail, setSelectedProjectForDetail] = useState<Proyecto | null>(null);

  // Project selected for additional expenses modal
  const [selectedProjectForGastosAdic, setSelectedProjectForGastosAdic] = useState<Proyecto | null>(null);
  const [manualGastoInput, setManualGastoInput] = useState<number>(0);
  const [manualGastoNota, setManualGastoNota] = useState<string>('');
  const [isSavingGastoAdic, setIsSavingGastoAdic] = useState<boolean>(false);

  const handleOpenGastosAdicModal = (proj: Proyecto) => {
    setSelectedProjectForGastosAdic(proj);
    setManualGastoInput(Number(proj.gastosAdicionales) || 0);
    setManualGastoNota(proj.gastosAdicionalesNota || '');
  };

  const handleSaveManualGasto = async () => {
    if (!selectedProjectForGastosAdic) return;
    setIsSavingGastoAdic(true);
    try {
      await updateProyecto(selectedProjectForGastosAdic.id, {
        gastosAdicionales: Number(manualGastoInput) || 0,
        gastosAdicionalesNota: manualGastoNota.trim() || undefined
      });
      toast.success('Gastos adicionales actualizados exitosamente');
      setSelectedProjectForGastosAdic(null);
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar gastos adicionales');
    } finally {
      setIsSavingGastoAdic(false);
    }
  };

  const formatCurrency = (amount: number) => {
    const val = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
    return `S/ ${val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  };

  const formatPercent = (val: number) => {
    const num = typeof val === 'number' && !isNaN(val) ? val : 0;
    return `${num.toFixed(1)}%`;
  };

  const getClientName = (id: string) => clientes.find(c => c.id === id)?.empresa || 'Desconocido';

  // Parse date helper to safely get Day, Month, Year
  const parseProjectDate = (dateStr?: string) => {
    if (!dateStr || dateStr === '-' || dateStr === 'NO APLICA') return null;
    const clean = String(dateStr).trim().split(' ')[0];
    if (!clean) return null;

    // Handle DD/MM/YYYY or D/M/YYYY
    if (clean.includes('/')) {
      const parts = clean.split('/');
      if (parts.length === 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const y = parseInt(parts[2], 10);
        const dateObj = new Date(y, m, d);
        if (!isNaN(dateObj.getTime())) {
          return {
            date: dateObj,
            formatted: `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}`,
            mes: MESES[m] || 'N/A',
            anio: String(y)
          };
        }
      }
    }

    // Handle YYYY-MM-DD
    if (clean.includes('-')) {
      const parts = clean.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const dateObj = new Date(y, m, d);
        if (!isNaN(dateObj.getTime())) {
          return {
            date: dateObj,
            formatted: `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}`,
            mes: MESES[m] || 'N/A',
            anio: String(y)
          };
        }
      }
    }

    const fallback = new Date(clean);
    if (!isNaN(fallback.getTime())) {
      return {
        date: fallback,
        formatted: fallback.toLocaleDateString('es-PE'),
        mes: MESES[fallback.getMonth()] || 'N/A',
        anio: String(fallback.getFullYear())
      };
    }

    return null;
  };

  // Costo neto de orden de compra o servicio sin IGV
  const getOrderCostSinIgv = (o: Orden) => computeOrderCostSinIgv(o, proveedores);

  // Calculated Project Metrics - ÚNICAMENTE PROYECTOS APROBADOS
  const projectMetrics = useMemo(() => {
    const proyectosAprobados = (proyectos || []).filter(p => {
      if (!p) return false;
      const st = (p.estado || '').toLowerCase();
      const act = (p.statusActividad || '').toLowerCase();
      return st === 'aprobado' || st.includes('aprob') || st === 'en ejecución' || st === 'en ejecucion' || st === 'finalizado' || st === 'liquidado' || act === 'liquidado';
    });

    return proyectosAprobados.map((p, idx) => {
      const clientName = getClientName(p.clienteId);
      const rawDateStr = p.fechaAprobacion && p.fechaAprobacion !== '-' ? p.fechaAprobacion : p.fechaRegistro;
      const parsedDate = parseProjectDate(rawDateStr);

      // Associated Purchase Orders (Cost without IGV)
      const pOrders = (ordenes || []).filter(o => o.proyectoId === p.id);
      const totalOrdersCost = pOrders.reduce((acc, o) => acc + getOrderCostSinIgv(o), 0);

      // Associated Production Expenses - Regular (not marked as additional)
      const pGastosRegulares = (gastosProduccion || []).filter(g => g.proyectoId === p.id && !g.esGastoAdicional);
      const totalGastosRegularesCost = pGastosRegulares.reduce((acc, g) => acc + (Number(g.total) || 0), 0);

      // Associated Production Expenses - Marked as Additional
      const pGastosAdicionales = (gastosProduccion || []).filter(g => g.proyectoId === p.id && g.esGastoAdicional);
      const totalGastosAdicionalesProd = pGastosAdicionales.reduce((acc, g) => acc + (Number(g.total) || 0), 0);

      // Manual additional expenses from project
      const gastosAdicManual = Number(p.gastosAdicionales) || 0;

      // Combined Total Additional Expenses
      const gastosAdicionales = Number((gastosAdicManual + totalGastosAdicionalesProd).toFixed(2));

      // Regular Cost (Orders + Regular Production Expenses)
      const costoTotal = Number((totalOrdersCost + totalGastosRegularesCost).toFixed(2));

      // 1. Facturación Sin IGV calculada desde Cotizaciones Aprobadas
      const pQuotes = (quotes || []).filter(q => q && q.projectId === p.id && !q.isTemplate);
      const approvedQuotes = pQuotes.filter(q => {
        const st = (q.status || '').toLowerCase();
        return st.includes('aprob') || st.includes('liquid');
      });

      let calculatedFacturacionQuotes = 0;
      if (approvedQuotes.length > 0) {
        // Tomar la versión más reciente por cada requerimiento/cotización aprobada
        const byReqMap = new Map<string, any>();
        approvedQuotes.forEach(q => {
          const key = (q.requirement || q.id).trim().toLowerCase();
          const existing = byReqMap.get(key);
          if (!existing || (Number(q.version) || 1) > (Number(existing.version) || 1)) {
            byReqMap.set(key, q);
          }
        });

        byReqMap.forEach(q => {
          let subTotalClient = 0;
          (q.categories || []).forEach((cat: any) => {
            (cat.items || []).forEach((item: any) => {
              const totalProvider = (item.subItems || []).reduce(
                (acc: number, sub: any) => acc + ((Number(sub.unitCost) || 0) * (Number(sub.quantity) || 0) * (Number(sub.dates) || 0)),
                0
              );
              const internalMultiplierAmount = totalProvider * ((Number(item.internalMultiplierPercent) || 0) / 100);
              const financialExpense = totalProvider * ((Number(item.financialExpensePercent) || 0) / 100);
              const rawClientCost = totalProvider + internalMultiplierAmount + financialExpense;
              subTotalClient += Math.round(rawClientCost);
            });
          });
          const totalWithFee = subTotalClient * 1.12;
          const totalInSoles = q.currency === 'USD' ? totalWithFee * (Number(q.exchangeRate) || 3.75) : totalWithFee;
          calculatedFacturacionQuotes += totalInSoles;
        });
      }

      const facturacionSinIgv = calculatedFacturacionQuotes > 0
        ? Number(calculatedFacturacionQuotes.toFixed(2))
        : Number((p.subtotal || 0).toFixed(2));

      const margen = Number((facturacionSinIgv - costoTotal - gastosAdicionales).toFixed(2));
      
      // Mark Up = (Margen / Costo con Extras) * 100
      const costoConExtras = costoTotal + gastosAdicionales;
      const markUp = costoConExtras > 0 ? Number(((margen / costoConExtras) * 100).toFixed(1)) : (facturacionSinIgv > 0 ? 100 : 0);
      
      // Mark Down = (Margen / Facturación) * 100
      const markDown = facturacionSinIgv > 0 ? Number(((margen / facturacionSinIgv) * 100).toFixed(1)) : 0;

      const servicio = (p.tipoServicio || 'GENERAL').toUpperCase();
      const tipoServicio = (p.tipoProyecto || 'INDIVIDUAL').toUpperCase();
      const status = p.statusActividad === 'Liquidado' ? 'Liquidado' : (p.estado || 'Aprobado');

      return {
        correlativo: idx + 1,
        proyecto: p,
        servicio,
        tipoServicio,
        actividad: p.nombre || 'Sin Nombre',
        cliente: clientName,
        moneda: 'Soles (S/)',
        fechaAceptacionStr: parsedDate?.formatted || p.fechaAprobacion || p.fechaRegistro || '-',
        mes: parsedDate?.mes || 'N/A',
        anio: parsedDate?.anio || 'N/A',
        dateObj: parsedDate?.date || null,
        costoSinIgv: costoTotal,
        gastosAdicionales,
        gastosAdicManual,
        gastosAdicionalesNota: p.gastosAdicionalesNota || '',
        pGastosAdicionales,
        facturacionSinIgv,
        margen,
        markUp,
        markDown,
        status,
        ordersCount: pOrders.length,
        gastosCount: pGastosRegulares.length,
        gastosAdicCount: pGastosAdicionales.length
      };
    });
  }, [proyectos, clientes, quotes, ordenes, gastosProduccion, proveedores]);

  // Distinct Filter Options
  const serviciosList = useMemo(() => {
    const set = new Set<string>();
    projectMetrics.forEach(m => { if (m.servicio) set.add(m.servicio); });
    return Array.from(set).sort();
  }, [projectMetrics]);

  const clientesList = useMemo(() => {
    const set = new Set<string>();
    projectMetrics.forEach(m => { if (m.cliente && m.cliente !== 'Desconocido') set.add(m.cliente); });
    return Array.from(set).sort();
  }, [projectMetrics]);

  const aniosList = useMemo(() => {
    const set = new Set<string>();
    projectMetrics.forEach(m => { if (m.anio && m.anio !== 'N/A') set.add(m.anio); });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [projectMetrics]);

  // Filtered List
  const filteredMetrics = useMemo(() => {
    const term = (searchTerm || '').toLowerCase();

    return projectMetrics.filter(m => {
      // Free search
      if (term) {
        const matchSearch = 
          m.actividad.toLowerCase().includes(term) ||
          m.cliente.toLowerCase().includes(term) ||
          m.servicio.toLowerCase().includes(term) ||
          m.proyecto.id.toLowerCase().includes(term);
        if (!matchSearch) return false;
      }

      // Servicio
      if (selectedServicio !== 'todos' && m.servicio.trim().toUpperCase() !== selectedServicio.trim().toUpperCase()) return false;

      // Cliente
      if (selectedCliente !== 'todos' && m.cliente !== selectedCliente) return false;

      // Año
      if (selectedAnio !== 'todos' && m.anio !== selectedAnio) return false;

      // Mes
      if (selectedMes !== 'todos' && m.mes !== selectedMes) return false;

      // Status
      if (selectedStatus !== 'todos' && m.status !== selectedStatus) return false;

      // Date Range
      if (fechaDesde && m.dateObj) {
        const fromDate = new Date(fechaDesde);
        if (m.dateObj < fromDate) return false;
      }
      if (fechaHasta && m.dateObj) {
        const toDate = new Date(fechaHasta);
        toDate.setHours(23, 59, 59);
        if (m.dateObj > toDate) return false;
      }

      return true;
    });
  }, [projectMetrics, searchTerm, selectedServicio, selectedCliente, selectedAnio, selectedMes, selectedStatus, fechaDesde, fechaHasta]);

  // Consolidated Totals (Fila 9 del Excel)
  const totals = useMemo(() => {
    const totalCosto = filteredMetrics.reduce((acc, m) => acc + m.costoSinIgv, 0);
    const totalGastosAdic = filteredMetrics.reduce((acc, m) => acc + m.gastosAdicionales, 0);
    const totalFacturacion = filteredMetrics.reduce((acc, m) => acc + m.facturacionSinIgv, 0);
    const totalMargen = filteredMetrics.reduce((acc, m) => acc + m.margen, 0);

    const weightedMarkUp = totalCosto > 0 ? Number(((totalMargen / totalCosto) * 100).toFixed(2)) : 0;
    const weightedMarkDown = totalFacturacion > 0 ? Number(((totalMargen / totalFacturacion) * 100).toFixed(2)) : 0;

    return {
      costo: totalCosto,
      gastosAdicionales: totalGastosAdic,
      facturacion: totalFacturacion,
      margen: totalMargen,
      markUp: weightedMarkUp,
      markDown: weightedMarkDown,
      proyectosCount: filteredMetrics.length
    };
  }, [filteredMetrics]);

  const totalPages = Math.ceil(filteredMetrics.length / pageSize) || 1;
  const paginatedMetrics = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredMetrics.slice(start, start + pageSize);
  }, [filteredMetrics, currentPage, pageSize]);

  // Export to Excel Matching Excel Columns
  const handleExportExcel = () => {
    const dataToExport = filteredMetrics.map((m, idx) => ({
      '#': idx + 1,
      'Servicio': m.servicio,
      'Tipo de servicio': m.tipoServicio,
      'Actividad': m.actividad,
      'Cliente': m.cliente,
      'Moneda': m.moneda,
      'Fecha Aceptación': m.fechaAceptacionStr,
      'Mes': m.mes,
      'Año': m.anio,
      'Costo (Sin IGV)': m.costoSinIgv,
      'Gastos Adicionales': m.gastosAdicionales,
      'Facturación (Sin IGV)': m.facturacionSinIgv,
      'Margen': m.margen,
      'Mark Up (%)': `${m.markUp}%`,
      'Mark Down (%)': `${m.markDown}%`,
      'Status': m.status
    }));

    // Add Totals Summary Row at the end
    dataToExport.push({
      '#': 0,
      'Servicio': 'TOTALES CONSOLIDADOS',
      'Tipo de servicio': '',
      'Actividad': `(${totals.proyectosCount} Proyectos)`,
      'Cliente': '',
      'Moneda': 'PEN',
      'Fecha Aceptación': '',
      'Mes': '',
      'Año': '',
      'Costo (Sin IGV)': totals.costo,
      'Gastos Adicionales': totals.gastosAdicionales,
      'Facturación (Sin IGV)': totals.facturacion,
      'Margen': totals.margen,
      'Mark Up (%)': `${totals.markUp}%`,
      'Mark Down (%)': `${totals.markDown}%`,
      'Status': 'CONSOLIDADO'
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rentabilidad por Proyecto');

    // Auto-fit column widths
    const colWidths = [
      { wch: 5 },  // #
      { wch: 25 }, // Servicio
      { wch: 18 }, // Tipo de servicio
      { wch: 40 }, // Actividad
      { wch: 20 }, // Cliente
      { wch: 12 }, // Moneda
      { wch: 16 }, // Fecha
      { wch: 12 }, // Mes
      { wch: 8 },  // Año
      { wch: 16 }, // Costo
      { wch: 16 }, // Gastos Adic
      { wch: 20 }, // Facturacion
      { wch: 16 }, // Margen
      { wch: 12 }, // Mark Up
      { wch: 12 }, // Mark Down
      { wch: 14 }  // Status
    ];
    worksheet['!cols'] = colWidths;

    const fileName = `Rentabilidad_por_Proyecto_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const getStatusBadgeClass = (st: string) => {
    const s = (st || '').toLowerCase();
    if (s.includes('fin') || s.includes('cerrad')) return 'badge-success';
    if (s.includes('ejecuc') || s.includes('proc')) return 'badge-info';
    if (s.includes('aprob')) return 'badge-primary';
    return 'badge-secondary';
  };

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '90px' }}>
      {/* HEADER WITH ACTIONS */}
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
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
            <FileSpreadsheet size={15} />
            <span>Matriz Comercial de Rentabilidad ({filteredMetrics.length} ítems)</span>
          </div>
        </div>

        {/* Date & Info Box */}
        <div className="view-actions">
          <div className="glass-panel" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px' }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 600 }}>FECHA DE ACTUALIZACIÓN</div>
              <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>
                {new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </div>
            </div>
            <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '16px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 600 }}>PROYECTOS EVALUADOS</div>
              <div style={{ fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                {filteredMetrics.length} actividades
              </div>
            </div>
          </div>

          <button 
            type="button"
            className="btn-excel" 
            onClick={handleExportExcel}
            title="Descargar matriz consolidada en Excel"
          >
            <FileSpreadsheet size={16} />
            <span>Exportar Excel</span>
          </button>
        </div>
      </div>

      {/* CONSOLIDATED TOTALS ROW (Identical to Row 9 in Excel) */}
      <div 
        className="glass-panel" 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
          gap: '12px', 
          padding: '16px 20px', 
          marginBottom: '20px',
          background: 'linear-gradient(135deg, rgba(102, 45, 145, 0.05) 0%, rgba(124, 58, 237, 0.03) 100%)',
          border: '1px solid rgba(102, 45, 145, 0.15)'
        }}
      >
        <div style={{ textAlign: 'center', padding: '4px 8px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
            COSTO (SIN IGV)
          </div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-primary)', marginTop: '4px' }}>
            {formatCurrency(totals.costo)}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Órdenes + Gastos Producción
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '4px 8px', borderLeft: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
            GASTOS ADICIONALES
          </div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--danger)', marginTop: '4px' }}>
            {formatCurrency(totals.gastosAdicionales)}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Extras no presupuestados
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '4px 8px', borderLeft: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '11px', color: 'var(--accent-primary)', fontWeight: 700, textTransform: 'uppercase' }}>
            FACTURACIÓN (SIN IGV)
          </div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--accent-primary)', marginTop: '4px' }}>
            {formatCurrency(totals.facturacion)}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Total Venta Aprobada
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '4px 8px', borderLeft: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '11px', color: 'var(--success)', fontWeight: 700, textTransform: 'uppercase' }}>
            MARGEN
          </div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--success)', marginTop: '4px' }}>
            {formatCurrency(totals.margen)}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Facturación - Costos
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '4px 8px', borderLeft: '1px solid var(--border-color)', background: 'rgba(245, 158, 11, 0.06)', borderRadius: '8px' }}>
          <div style={{ fontSize: '11px', color: '#b45309', fontWeight: 700, textTransform: 'uppercase' }}>
            MARK UP
          </div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#b45309', marginTop: '4px' }}>
            {formatPercent(totals.markUp)}
          </div>
          <div style={{ fontSize: '10px', color: '#b45309', opacity: 0.8, marginTop: '2px' }}>
            Margen / Costo
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '4px 8px', borderLeft: '1px solid var(--border-color)', background: 'rgba(99, 102, 241, 0.06)', borderRadius: '8px' }}>
          <div style={{ fontSize: '11px', color: '#4338ca', fontWeight: 700, textTransform: 'uppercase' }}>
            MARK DOWN
          </div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#4338ca', marginTop: '4px' }}>
            {formatPercent(totals.markDown)}
          </div>
          <div style={{ fontSize: '10px', color: '#4338ca', opacity: 0.8, marginTop: '2px' }}>
            Margen / Facturación
          </div>
        </div>
      </div>

      {/* UNIFIED FILTER PANEL */}
      <div className="unified-filter-panel" style={{ flexWrap: 'wrap', gap: '12px' }}>
        {/* Search */}
        <div className="unified-filter-group search-group" style={{ minWidth: '240px', flex: 1 }}>
          <label className="unified-filter-label">Búsqueda Rápida</label>
          <div className="unified-search-wrapper">
            <Search size={16} className="unified-search-icon" />
            <input 
              type="text" 
              placeholder="Buscar por actividad, cliente, servicio..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="unified-search-input" 
            />
          </div>
        </div>

        {/* Filter Servicio */}
        <div className="unified-filter-group" style={{ minWidth: '160px' }}>
          <label className="unified-filter-label">Servicio</label>
          <select 
            value={selectedServicio} 
            onChange={e => setSelectedServicio(e.target.value)}
            className="unified-select"
          >
            <option value="todos">Todos los Servicios</option>
            {serviciosList.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Filter Cliente */}
        <div className="unified-filter-group" style={{ minWidth: '150px' }}>
          <label className="unified-filter-label">Cliente</label>
          <select 
            value={selectedCliente} 
            onChange={e => setSelectedCliente(e.target.value)}
            className="unified-select"
          >
            <option value="todos">Todos los Clientes</option>
            {clientesList.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Filter Año */}
        <div className="unified-filter-group" style={{ minWidth: '100px' }}>
          <label className="unified-filter-label">Año</label>
          <select 
            value={selectedAnio} 
            onChange={e => setSelectedAnio(e.target.value)}
            className="unified-select"
          >
            <option value="todos">Todos</option>
            {aniosList.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Filter Mes */}
        <div className="unified-filter-group" style={{ minWidth: '120px' }}>
          <label className="unified-filter-label">Mes</label>
          <select 
            value={selectedMes} 
            onChange={e => setSelectedMes(e.target.value)}
            className="unified-select"
          >
            <option value="todos">Todos los Meses</option>
            {MESES.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Filter Status */}
        <div className="unified-filter-group" style={{ minWidth: '130px' }}>
          <label className="unified-filter-label">Estado</label>
          <select 
            value={selectedStatus} 
            onChange={e => setSelectedStatus(e.target.value)}
            className="unified-select"
          >
            <option value="todos">Todos (Aprobados)</option>
            <option value="Aprobado">Aprobado</option>
            <option value="En Ejecución">En Ejecución</option>
            <option value="Liquidado">Liquidado</option>
            <option value="Finalizado">Finalizado</option>
          </select>
        </div>

        {/* Date From - To */}
        <div className="unified-filter-group" style={{ minWidth: '130px' }}>
          <label className="unified-filter-label">Desde</label>
          <input 
            type="date" 
            value={fechaDesde} 
            onChange={e => setFechaDesde(e.target.value)}
            className="unified-search-input"
            style={{ padding: '0 10px' }}
          />
        </div>

        <div className="unified-filter-group" style={{ minWidth: '130px' }}>
          <label className="unified-filter-label">Hasta</label>
          <input 
            type="date" 
            value={fechaHasta} 
            onChange={e => setFechaHasta(e.target.value)}
            className="unified-search-input"
            style={{ padding: '0 10px' }}
          />
        </div>

        {/* Clear Filters */}
        {(searchTerm || selectedServicio !== 'todos' || selectedCliente !== 'todos' || selectedAnio !== 'todos' || selectedMes !== 'todos' || selectedStatus !== 'todos' || fechaDesde || fechaHasta) && (
          <button 
            className="btn-clear-filters" 
            onClick={() => {
              setSearchTerm('');
              setSelectedServicio('todos');
              setSelectedCliente('todos');
              setSelectedAnio('todos');
              setSelectedMes('todos');
              setSelectedStatus('todos');
              setFechaDesde('');
              setFechaHasta('');
            }} 
            title="Limpiar todos los filtros"
            style={{ alignSelf: 'flex-end', marginBottom: '4px' }}
          >
            <X size={14} />
            Limpiar
          </button>
        )}
      </div>

      {/* THE 16-COLUMN TABLE */}
      <div className="glass-panel table-container" style={{ marginBottom: '56px' }}>
        {/* ENCABEZADO CON CONTADOR, SUMATORIA Y DESPLAZAMIENTO */}
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
              Rentabilidad de Proyectos
            </h3>
            <span className="badge badge-info" style={{ fontSize: '0.8rem', padding: '3px 10px' }}>
              {filteredMetrics.length} {filteredMetrics.length === 1 ? 'proyecto' : 'proyectos'}
            </span>
            {filteredMetrics.length > 0 && (
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Facturación: <strong style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{formatCurrency(totals.facturacion)}</strong>
                {' | '}
                Margen: <strong style={{ color: totals.margen >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{formatCurrency(totals.margen)}</strong>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* SELECTOR MODO MOBILE: TARJETAS VS TABLA */}
            {isMobile && (
              <div className="mobile-view-switcher">
                <button 
                  type="button"
                  className={`mobile-view-switcher-btn ${mobileDisplayMode === 'cards' ? 'active' : ''}`}
                  onClick={() => setMobileDisplayMode('cards')}
                  title="Ver rentabilidad como tarjetas"
                >
                  📱 Tarjetas
                </button>
                <button 
                  type="button"
                  className={`mobile-view-switcher-btn ${mobileDisplayMode === 'table' ? 'active' : ''}`}
                  onClick={() => setMobileDisplayMode('table')}
                  title="Ver rentabilidad como tabla completa"
                >
                  📋 Tabla
                </button>
              </div>
            )}

            {/* BOTONES DESPLAZAMIENTO HORIZONTAL */}
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
            <SkeletonTable columns={12} rows={6} message="Calculando métricas de rentabilidad por proyecto..." />
          ) : (isMobile && mobileDisplayMode === 'cards') ? (
            <div className="mobile-cards-container" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px', marginBottom: '20px' }}>
              {paginatedMetrics.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
                  <ShoppingCart size={32} color="var(--text-muted)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>No se encontraron proyectos para evaluar rentabilidad.</p>
                </div>
              ) : (
                paginatedMetrics.map((m) => {
                  const isProfitPositive = m.margen >= 0;

                  return (
                    <div 
                      key={m.proyecto.id} 
                      className="mobile-data-card"
                      style={{
                        borderLeft: isProfitPositive ? '4px solid #10b981' : '4px solid #ef4444'
                      }}
                    >
                      <div className="mobile-data-card-header">
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="mobile-data-card-title font-mono" style={{ color: 'var(--accent-primary)', fontSize: '13px' }}>
                              {m.proyecto.id}
                            </span>
                            <span style={{ fontSize: '10px', background: 'rgba(124, 58, 237, 0.08)', color: 'var(--accent-primary)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                              {m.servicio}
                            </span>
                          </div>
                          <div className="mobile-data-card-subtitle">
                            <span>{m.fechaAceptacion.formatted || '-'}</span>
                            {m.moneda && <span>• 🪙 {m.moneda}</span>}
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px', flexShrink: 0 }}>
                          <span style={{ fontWeight: 800, fontSize: '15px', color: isProfitPositive ? '#059669' : '#dc2626' }}>
                            {formatCurrency(m.margen)}
                          </span>
                          <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '10px', background: isProfitPositive ? '#ecfdf5' : '#fee2e2', color: isProfitPositive ? '#047857' : '#b91c1c' }}>
                            MD: {m.markDown}%
                          </span>
                        </div>
                      </div>

                      <div style={{ margin: '4px 0' }}>
                        <div style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--text-primary)', lineHeight: 1.3 }}>
                          {m.actividad}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          🏢 {m.cliente}
                        </div>
                      </div>

                      <div className="mobile-card-grid-meta">
                        <div className="mobile-card-meta-col">
                          <span className="mobile-card-meta-label">Facturación</span>
                          <span className="mobile-card-meta-val" style={{ color: '#059669', fontWeight: 700 }}>
                            {formatCurrency(m.facturacion)}
                          </span>
                        </div>
                        <div className="mobile-card-meta-col">
                          <span className="mobile-card-meta-label">Costo Neto</span>
                          <span className="mobile-card-meta-val" style={{ color: '#e11d48', fontWeight: 600 }}>
                            {formatCurrency(m.costoNeto)}
                          </span>
                        </div>
                        <div className="mobile-card-meta-col">
                          <span className="mobile-card-meta-label">Gastos Adic.</span>
                          <span className="mobile-card-meta-val">
                            {formatCurrency(m.gastosAdicionales)}
                          </span>
                        </div>
                        <div className="mobile-card-meta-col">
                          <span className="mobile-card-meta-label">Mark Up</span>
                          <span className="mobile-card-meta-val" style={{ fontWeight: 600 }}>
                            {m.markUp}%
                          </span>
                        </div>
                      </div>

                      <div className="mobile-card-actions-row">
                        <button 
                          type="button" 
                          className="mobile-action-pill primary" 
                          onClick={() => setSelectedProjectForDetail(m.proyecto)}
                          title="Ver desglose detallado de costos"
                        >
                          <Receipt size={13} />
                          <span>Ver Desglose</span>
                        </button>
                        <button 
                          type="button" 
                          className="mobile-action-pill" 
                          onClick={() => setSelectedProjectForGastosAdic(m.proyecto)}
                          title="Gestionar gastos adicionales"
                        >
                          <Edit3 size={13} />
                          <span>Gastos Adic.</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <table className="data-table" style={{ width: '100%', minWidth: '2040px', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
              <colgroup>
              <col style={{ width: '50px' }} />
              <col style={{ width: '160px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '240px' }} />
              <col style={{ width: '180px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '80px' }} />
              <col style={{ width: '140px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '160px' }} />
              <col style={{ width: '140px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '120px' }} />
            </colgroup>
            <thead style={{ position: 'sticky', top: 0, zIndex: 12, backgroundColor: '#f8fafc' }}>
              <tr>
                <th className="header-custom text-center" style={{ position: 'sticky', left: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '50px' }}>#</th>
                <th className="header-custom" style={{ position: 'sticky', left: '50px', zIndex: 16, backgroundColor: '#f8fafc', width: '160px' }}>SERVICIO</th>
                <th className="header-custom" style={{ width: '130px' }}>TIPO DE SERVICIO</th>
                <th className="header-custom" style={{ width: '240px' }}>ACTIVIDAD</th>
                <th className="header-custom" style={{ width: '180px' }}>CLIENTE</th>
                <th className="header-custom text-center" style={{ width: '90px' }}>MONEDA</th>
                <th className="header-custom text-center" style={{ width: '130px' }}>FECHA ACEPTACIÓN</th>
                <th className="header-custom text-center" style={{ width: '90px' }}>MES</th>
                <th className="header-custom text-center" style={{ width: '80px' }}>AÑO</th>
                <th className="header-custom text-right" style={{ width: '140px' }}>COSTO (SIN IGV)</th>
                <th className="header-custom text-right" style={{ width: '130px' }}>GASTOS ADIC.</th>
                <th className="header-custom text-right" style={{ width: '160px' }}>FACTURACIÓN (SIN IGV)</th>
                <th className="header-custom text-right" style={{ width: '140px' }}>MARGEN</th>
                <th className="header-custom text-center" style={{ width: '100px' }}>MARK UP</th>
                <th className="header-custom text-center" style={{ width: '100px' }}>MARK DOWN</th>
                <th className="header-custom text-center sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '120px' }}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {paginatedMetrics.map((m, index) => {
                const isProfitPositive = m.margen >= 0;
                const rowIdx = (currentPage - 1) * pageSize + index;

                return (
                  <tr key={m.proyecto.id} className="hover-row">
                    {/* 1. # */}
                    <td className="td-custom text-center font-bold text-muted" style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: 'inherit', fontSize: '11px' }}>
                      {rowIdx + 1}
                    </td>

                    {/* 2. Servicio */}
                    <td className="td-custom font-semibold" style={{ position: 'sticky', left: '50px', zIndex: 10, backgroundColor: 'inherit', color: 'var(--accent-primary)', fontSize: '11px', whiteSpace: 'nowrap' }}>
                      {m.servicio}
                  </td>

                  {/* 3. Tipo de servicio */}
                  <td className="td-custom text-muted" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
                    {m.tipoServicio}
                  </td>

                  {/* 4. Actividad */}
                  <td className="td-custom" style={{ minWidth: '220px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '12px' }}>
                        {m.actividad}
                      </span>
                      <button 
                        type="button"
                        title="Ver desglose de costos (Órdenes y Gastos)"
                        onClick={() => setSelectedProjectForDetail(m.proyecto)}
                        style={{ height: '24px', padding: '2px 8px', fontSize: '10px', fontWeight: 600, background: 'rgba(102, 45, 145, 0.08)', color: 'var(--accent-primary)', border: '1px solid rgba(102, 45, 145, 0.2)', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', cursor: 'pointer' }}
                      >
                        <Receipt size={12} />
                        Desglose
                      </button>
                    </div>
                  </td>

                  {/* 5. Cliente */}
                  <td className="td-custom" style={{ fontWeight: 500, fontSize: '12px', whiteSpace: 'nowrap' }}>
                    {m.cliente}
                  </td>

                  {/* 6. Moneda */}
                  <td className="td-custom text-center text-muted" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
                    {m.moneda}
                  </td>

                  {/* 7. Fecha Aceptación */}
                  <td className="td-custom text-center" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
                    {m.fechaAceptacionStr}
                  </td>

                  {/* 8. Mes */}
                  <td className="td-custom text-center text-muted" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
                    {m.mes}
                  </td>

                  {/* 9. Año */}
                  <td className="td-custom text-center font-bold text-muted" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
                    {m.anio}
                  </td>

                  {/* 10. Costo (Sin IGV) */}
                  <td className="td-custom text-right font-medium font-tabular" style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                    {formatCurrency(m.costoSinIgv)}
                  </td>

                  {/* 11. Gastos Adicionales */}
                  <td 
                    className="td-custom text-right font-tabular" 
                    style={{ fontSize: '12px', whiteSpace: 'nowrap', cursor: 'pointer' }}
                    onClick={() => handleOpenGastosAdicModal(m.proyecto)}
                    title="Haga clic para ver el desglose o registrar gastos adicionales"
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px' }}>
                      <span style={{ 
                        fontWeight: m.gastosAdicionales > 0 ? 700 : 500, 
                        color: m.gastosAdicionales > 0 ? '#b45309' : 'var(--text-muted)' 
                      }}>
                        {formatCurrency(m.gastosAdicionales)}
                      </span>
                      <button
                        type="button"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '1px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          color: 'var(--accent-primary)',
                          opacity: 0.75
                        }}
                        title="Gestionar gastos adicionales"
                      >
                        <Edit3 size={12} />
                      </button>
                    </div>
                  </td>

                  {/* 12. Facturación (Sin IGV) */}
                  <td className="td-custom text-right font-bold font-tabular" style={{ color: 'var(--accent-primary)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    {formatCurrency(m.facturacionSinIgv)}
                  </td>

                  {/* 13. Margen */}
                  <td className="td-custom text-right font-bold font-tabular" style={{ color: isProfitPositive ? 'var(--success)' : 'var(--danger)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    {formatCurrency(m.margen)}
                  </td>

                  {/* 14. Mark Up */}
                  <td className="td-custom text-center font-bold font-tabular" style={{ color: '#b45309', background: 'rgba(245, 158, 11, 0.04)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    {formatPercent(m.markUp)}
                  </td>

                  {/* 15. Mark Down */}
                  <td className="td-custom text-center font-bold font-tabular" style={{ color: '#4338ca', background: 'rgba(99, 102, 241, 0.04)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    {formatPercent(m.markDown)}
                  </td>

                  {/* 16. Status */}
                  <td className="td-custom text-center sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 10, backgroundColor: 'inherit', whiteSpace: 'nowrap' }}>
                    <span className={`badge ${getStatusBadgeClass(m.status)}`}>
                      {m.status}
                    </span>
                  </td>
                </tr>
              );
            })}

            {filteredMetrics.length === 0 && (
              <tr>
                <td colSpan={16} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
                  <AlertCircle size={36} color="var(--text-muted)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>No se encontraron proyectos con los criterios de búsqueda seleccionados.</p>
                  {(searchTerm || selectedServicio !== 'todos' || selectedCliente !== 'todos' || selectedAnio !== 'todos' || selectedMes !== 'todos' || selectedStatus !== 'todos' || fechaDesde || fechaHasta) && (
                    <button 
                      type="button" 
                      className="btn-secondary" 
                      onClick={() => {
                        setSearchTerm('');
                        setSelectedServicio('todos');
                        setSelectedCliente('todos');
                        setSelectedAnio('todos');
                        setSelectedMes('todos');
                        setSelectedStatus('todos');
                        setFechaDesde('');
                        setFechaHasta('');
                      }} 
                      style={{ margin: '12px auto 0', fontSize: '12px' }}
                    >
                      Restablecer Filtros
                    </button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
          )}
        </div>

        {/* PAGINATION CONTROLS */}
        {!isLoading && filteredMetrics.length > 0 && (
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
                Mostrando {((currentPage - 1) * pageSize) + 1} a {Math.min(currentPage * pageSize, filteredMetrics.length)} de {filteredMetrics.length} proyectos
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

      {/* DRAWER / MODAL FOR DETAILED COST BREAKDOWN */}
      {selectedProjectForDetail && createPortal(
        <div 
          className="modal-overlay" 
          style={{ zIndex: 9999, padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setSelectedProjectForDetail(null)}
        >
          <div 
            className="modal-content" 
            style={{ 
              maxWidth: '1280px', 
              width: '96vw', 
              maxHeight: '92vh', 
              height: 'auto',
              display: 'flex', 
              flexDirection: 'column', 
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header" style={{ padding: '16px 24px', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--accent-primary)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Desglose de Costos de Producción y Proveedores
                </div>
                <h3 className="modal-title" style={{ marginTop: '2px', fontSize: '1.25rem' }}>
                  {selectedProjectForDetail.nombre}
                </h3>
                {(() => {
                  const m = projectMetrics.find(x => x.proyecto.id === selectedProjectForDetail.id);
                  const effectiveSub = m ? m.facturacionSinIgv : (Number(selectedProjectForDetail.subtotal) || 0);
                  return (
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Cliente: <strong style={{ color: 'var(--text-primary)' }}>{getClientName(selectedProjectForDetail.clienteId)}</strong> | Facturación Aprobada: <strong style={{ color: 'var(--accent-primary)' }}>{formatCurrency(effectiveSub)}</strong>
                    </div>
                  );
                })()}
              </div>
              <button className="btn-icon" onClick={() => setSelectedProjectForDetail(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '24px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* 1. ÓRDENES DE COMPRA */}
              <div>
                <h4 style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-primary)', marginBottom: '10px' }}>
                  <ShoppingCart size={16} />
                  Órdenes de Compra / Servicio a Proveedores
                </h4>
                {(() => {
                  const pOrders = (ordenes || []).filter(o => o.proyectoId === selectedProjectForDetail.id);
                  if (pOrders.length === 0) {
                    return <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '10px', background: '#f8fafc', borderRadius: '6px' }}>No hay órdenes de compra registradas para este proyecto.</div>;
                  }
                  return (
                    <table className="data-table" style={{ fontSize: '12px', width: '100%' }}>
                      <thead>
                        <tr>
                          <th className="header-custom" style={{ width: '170px' }}>N° ORDEN</th>
                          <th className="header-custom">PROVEEDOR</th>
                          <th className="header-custom text-center" style={{ width: '110px' }}>EMISIÓN</th>
                          <th className="header-custom text-right" style={{ width: '140px' }}>SUBTOTAL (SIN IGV)</th>
                          <th className="header-custom text-right" style={{ width: '130px' }}>TOTAL A PAGAR</th>
                          <th className="header-custom text-center" style={{ width: '110px' }}>ESTADO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pOrders.map(o => {
                          const prov = proveedores.find(pr => pr.id === o.proveedorId);
                          const subtotalSinIgv = getOrderCostSinIgv(o);
                          return (
                            <tr key={o.id}>
                              <td className="td-custom font-bold" style={{ color: 'var(--accent-primary)', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span>{o.id}</span>
                                  {o.tipoOrden && (
                                    <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(102, 45, 145, 0.08)', color: 'var(--accent-primary)', fontWeight: 600 }}>
                                      {o.tipoOrden}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="td-custom">{prov ? (prov.razonSocial || prov.nombre) : 'Desconocido'}</td>
                              <td className="td-custom text-center" style={{ whiteSpace: 'nowrap' }}>{o.fechaEmision}</td>
                              <td className="td-custom text-right font-medium" style={{ whiteSpace: 'nowrap', color: 'var(--accent-primary)' }}>
                                {formatCurrency(subtotalSinIgv)}
                              </td>
                              <td className="td-custom text-right font-bold" style={{ whiteSpace: 'nowrap' }}>
                                {formatCurrency(o.total)}
                              </td>
                              <td className="td-custom text-center">
                                <span className={`badge ${o.estadoEntrega === 'Recibido' ? 'badge-success' : 'badge-warning'}`}>
                                  {o.estadoEntrega || 'Pendiente'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                          <td colSpan={3} className="td-custom text-right" style={{ color: 'var(--text-muted)' }}>
                            TOTAL ÓRDENES:
                          </td>
                          <td className="td-custom text-right font-bold" style={{ color: 'var(--accent-primary)', fontSize: '13px' }}>
                            {formatCurrency(pOrders.reduce((acc, o) => acc + getOrderCostSinIgv(o), 0))}
                          </td>
                          <td className="td-custom text-right font-bold" style={{ color: 'var(--text-primary)', fontSize: '13px' }}>
                            {formatCurrency(pOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0))}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  );
                })()}
              </div>

              {/* 2. GASTOS DE PRODUCCIÓN */}
              <div>
                <h4 style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-primary)', marginBottom: '10px' }}>
                  <Receipt size={16} />
                  Gastos Directos de Producción (Caja / Viáticos / Compras)
                </h4>
                {(() => {
                  const pGastos = (gastosProduccion || []).filter(g => g.proyectoId === selectedProjectForDetail.id);
                  if (pGastos.length === 0) {
                    return <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '10px', background: '#f8fafc', borderRadius: '6px' }}>No hay gastos de producción registrados para este proyecto.</div>;
                  }
                  return (
                    <table className="data-table" style={{ fontSize: '12px', width: '100%' }}>
                      <thead>
                        <tr>
                          <th className="header-custom" style={{ width: '140px' }}>COMPROBANTE</th>
                          <th className="header-custom" style={{ width: '160px' }}>N° COMPROBANTE</th>
                          <th className="header-custom">RESPONSABLE</th>
                          <th className="header-custom text-center" style={{ width: '120px' }}>FECHA</th>
                          <th className="header-custom text-right" style={{ width: '140px' }}>TOTAL (S/)</th>
                          <th className="header-custom text-center" style={{ width: '120px' }}>ESTADO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pGastos.map(g => (
                          <tr key={g.id}>
                            <td className="td-custom font-medium">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>{g.tipoComprobante || 'Factura'}</span>
                                {g.esGastoAdicional && (
                                  <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '6px', background: '#fef3c7', color: '#b45309', border: '1px solid #f59e0b', fontWeight: 700 }}>
                                    ⚡ Extra
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="td-custom">{g.numeroComprobante || '-'}</td>
                            <td className="td-custom">{g.areaResponsable || 'Producción'}</td>
                            <td className="td-custom text-center" style={{ whiteSpace: 'nowrap' }}>{g.fechaEmision}</td>
                            <td className="td-custom text-right font-bold" style={{ whiteSpace: 'nowrap' }}>{formatCurrency(g.total)}</td>
                            <td className="td-custom text-center">
                              <span className="badge badge-success">{g.estadoGasto || 'Aprobado'}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                          <td colSpan={4} className="td-custom text-right" style={{ color: 'var(--text-muted)' }}>
                            TOTAL GASTOS DIRECTOS:
                          </td>
                          <td className="td-custom text-right font-bold" style={{ color: 'var(--accent-primary)', fontSize: '13px' }}>
                            {formatCurrency(pGastos.reduce((acc, g) => acc + (Number(g.total) || 0), 0))}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  );
                })()}
              </div>
            </div>

            <div className="modal-footer" style={{ padding: '16px 24px', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button 
                className="btn-secondary" 
                onClick={() => {
                  if (onNavigate) {
                    onNavigate('liquidaciones', selectedProjectForDetail.id);
                  }
                  setSelectedProjectForDetail(null);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
              >
                <span>🔍 Abrir en Liquidaciones Detalladas</span>
                <ArrowUpRight size={14} />
              </button>
              <button className="btn-primary" onClick={() => setSelectedProjectForDetail(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL PARA GESTIONAR GASTOS ADICIONALES */}
      {selectedProjectForGastosAdic && (() => {
        const pGastosAdic = (gastosProduccion || []).filter(g => g.proyectoId === selectedProjectForGastosAdic.id && g.esGastoAdicional);
        const totalProdAdic = pGastosAdic.reduce((acc, g) => acc + (Number(g.total) || 0), 0);
        const totalCombined = (Number(manualGastoInput) || 0) + totalProdAdic;

        return createPortal(
          <div className="modal-overlay" style={{ zIndex: 9999, padding: '20px' }} onClick={() => setSelectedProjectForGastosAdic(null)}>
            <div 
              className="modal-content" 
              style={{ maxWidth: '780px', width: '92vw', maxHeight: '90vh', overflowY: 'auto', borderRadius: '16px' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="modal-header">
                <div>
                  <div style={{ fontSize: '11px', color: '#b45309', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    ⚡ Gestión de Gastos Adicionales
                  </div>
                  <h3 className="modal-title" style={{ marginTop: '2px' }}>
                    {selectedProjectForGastosAdic.nombre}
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Cliente: <strong>{getClientName(selectedProjectForGastosAdic.clienteId)}</strong> | Subtotal: <strong>{formatCurrency(selectedProjectForGastosAdic.subtotal)}</strong>
                  </div>
                </div>
                <button className="btn-icon" onClick={() => setSelectedProjectForGastosAdic(null)}>
                  <X size={20} />
                </button>
              </div>

              <div className="modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* BANNER TOTAL CONSOLIDADO */}
                <div style={{ 
                  padding: '16px', 
                  borderRadius: '10px', 
                  backgroundColor: 'rgba(245, 158, 11, 0.08)', 
                  border: '1px solid #f59e0b',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#b45309' }}>TOTAL GASTOS ADICIONALES</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Ajuste Directo: {formatCurrency(Number(manualGastoInput) || 0)} + Gastos Producción: {formatCurrency(totalProdAdic)}
                    </div>
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#b45309' }}>
                    {formatCurrency(totalCombined)}
                  </div>
                </div>

                {/* 1. AJUSTE MANUAL DIRECTO EN EL PROYECTO */}
                <div style={{ padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-primary)', marginBottom: '12px' }}>
                    <Edit3 size={16} />
                    1. Ajuste Directo en Proyecto (Manual)
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '12px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '12px', fontWeight: 600 }}>Monto Adicional (S/)</label>
                      <input 
                        type="number"
                        step="0.01"
                        min="0"
                        className="form-control"
                        placeholder="0.00"
                        value={manualGastoInput === 0 ? '' : manualGastoInput}
                        onChange={e => setManualGastoInput(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '12px', fontWeight: 600 }}>Motivo / Observación del Gasto</label>
                      <input 
                        type="text"
                        className="form-control"
                        placeholder="Ej. Sobrecosto de transporte, penalidad, merma..."
                        value={manualGastoNota}
                        onChange={e => setManualGastoNota(e.target.value)}
                      />
                    </div>
                  </div>
                  <button 
                    className="btn-primary" 
                    onClick={handleSaveManualGasto}
                    disabled={isSavingGastoAdic}
                    style={{ fontSize: '12px', padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Save size={14} />
                    {isSavingGastoAdic ? 'Guardando...' : 'Guardar Ajuste Manual'}
                  </button>
                </div>

                {/* 2. GASTOS DE PRODUCCIÓN MARCADOS COMO ADICIONALES */}
                <div>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-primary)', marginBottom: '10px' }}>
                    <Receipt size={16} />
                    2. Gastos de Producción / Caja Chica Clasificados como Adicionales
                  </h4>
                  {pGastosAdic.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '14px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertCircle size={16} color="#f59e0b" />
                      <span>No hay gastos de producción marcados como adicionales para este proyecto. Puedes clasificar un gasto como adicional marcando la casilla correspondiente en el módulo <strong>Gastos de Producción</strong>.</span>
                    </div>
                  ) : (
                    <table className="data-table" style={{ fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th className="header-custom">COMPROBANTE</th>
                          <th className="header-custom">N° COMPROBANTE</th>
                          <th className="header-custom">RESPONSABLE</th>
                          <th className="header-custom">MOTIVO / DETALLE</th>
                          <th className="header-custom text-right">MONTO (S/)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pGastosAdic.map(g => (
                          <tr key={g.id}>
                            <td className="td-custom font-medium">{g.tipoComprobante || 'Boleta'}</td>
                            <td className="td-custom">{g.numeroComprobante || '-'}</td>
                            <td className="td-custom">{g.areaResponsable || 'Producción'}</td>
                            <td className="td-custom" style={{ color: '#b45309', fontStyle: 'italic' }}>
                              {g.motivoAdicional || 'Gasto extra'}
                            </td>
                            <td className="td-custom text-right font-bold text-emerald">
                              {formatCurrency(g.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button 
                  className="btn-secondary" 
                  onClick={() => {
                    if (onNavigate) onNavigate('gastos-produccion');
                    setSelectedProjectForGastosAdic(null);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
                >
                  <Receipt size={14} />
                  <span>Ir a Gastos de Producción</span>
                </button>
                <button className="btn-primary" onClick={() => setSelectedProjectForGastosAdic(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
};
