import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, DollarSign, CheckCircle, Clock, AlertTriangle, Save, X, Trash2, Plus, FileText, Upload, Paperclip, RotateCw, FileSpreadsheet, ChevronLeft, ChevronRight } from 'lucide-react';
import { useGlobalContext, API_URL, BASE_URL } from '../context/GlobalContext';
import { SkeletonTable } from '../components/SkeletonTable';
import { CreateFacturaModal } from '../components/CreateFacturaModal';
import { toast } from 'react-hot-toast';
import type { FacturaCliente } from '../types/models';
import { exportFacturasToExcel } from '../utils/excelExport';
import { useIsMobile } from '../hooks/useIsMobile';

export const FacturacionView: React.FC = () => {
  const { facturasCliente, proyectos, clientes, updateFacturaCliente, deleteFacturaCliente, reloadFacturasCliente, currentUserRole, isLoading, token } = useGlobalContext();
  const isMobile = useIsMobile(768);
  const [mobileDisplayMode, setMobileDisplayMode] = useState<'cards' | 'table'>('cards');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'todas' | 'pendientes' | 'vencidas' | 'cobradas'>('todas');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Scroll & Pagination
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

  // Auto-cargar facturas si la lista está vacía al montar la vista
  useEffect(() => {
    if (token && facturasCliente.length === 0 && !isLoading) {
      reloadFacturasCliente();
    }
  }, [token, facturasCliente.length, isLoading]);

  // Edit states
  const [editImporte, setEditImporte] = useState(0);
  const [editFechaPago, setEditFechaPago] = useState('');
  const [editImpuestos, setEditImpuestos] = useState(false);

  // Upload Voucher modal state
  const [voucherModalFactura, setVoucherModalFactura] = useState<{ id: string, tipo: 'factura' | 'pago', numero: string } | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploadingVoucher, setIsUploadingVoucher] = useState(false);

  const canAccess = currentUserRole === 'Directorio' || currentUserRole === 'Admin' || currentUserRole === 'Cuentas' || currentUserRole === 'Contabilidad';

  const formatCurrency = (val: number) => {
    const num = typeof val === 'number' && !isNaN(val) ? val : 0;
    return `S/ ${num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  };

  const getProyecto = (id: string) => proyectos.find(p => p.id === id);
  const getCliente = (pid: string) => {
    const p = getProyecto(pid);
    if (!p) return 'Desconocido';
    const c = clientes.find(c => c.id === p.clienteId);
    return c ? c.empresa : 'Desconocido';
  };

  const safeParseDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'NO APLICA' || dateStr === '-') return null;
    const cleanStr = String(dateStr).trim().split(' ')[0];
    if (!cleanStr || cleanStr.length < 8) return null;
    const d = new Date(cleanStr.includes('T') ? cleanStr : `${cleanStr}T00:00:00`);
    if (isNaN(d.getTime())) return null;
    return d;
  };

  const TOLERANCIA_DIFERENCIA_PAGO = 2.00;

  const getDetraccionRetencion = (f: FacturaCliente) => {
    if (f.aplicaDetraccion) return { tipo: 'Detracción (12%)', monto: Number((f.montoConIgv * 0.12).toFixed(2)) };
    if (f.aplicaRetencion) return { tipo: 'Retención (3%)', monto: Number((f.montoConIgv * 0.03).toFixed(2)) };
    return { tipo: '-', monto: 0 };
  };

  const getNetoACobrar = (f: FacturaCliente) => {
    const retDet = getDetraccionRetencion(f);
    return Number((f.montoConIgv - retDet.monto).toFixed(2));
  };

  const getDiferenciaVsNeto = (f: FacturaCliente) => {
    const neto = getNetoACobrar(f);
    const recibido = Number(f.importeRecibido || 0);
    const diff = Number((neto - recibido).toFixed(2));
    if (recibido > 0 && (diff <= TOLERANCIA_DIFERENCIA_PAGO || (f.montoConIgv - recibido) <= TOLERANCIA_DIFERENCIA_PAGO)) {
      return 0;
    }
    return Math.max(0, diff);
  };

  const isFacturaCobrada = (f: FacturaCliente): boolean => {
    if (!f) return false;
    const neto = getNetoACobrar(f);
    const recibido = Number(f.importeRecibido || 0);
    if (recibido > 0 && ((neto - recibido) <= TOLERANCIA_DIFERENCIA_PAGO || (f.montoConIgv - recibido) <= TOLERANCIA_DIFERENCIA_PAGO)) {
      return true;
    }
    return f.estado === 'Pagado' || f.estado === 'Neto Cobrado';
  };

  const calcularVencimiento = (fechaEmision: string, diasPago: number) => {
    const d = safeParseDate(fechaEmision);
    if (!d) return '-';
    d.setDate(d.getDate() + (Number(diasPago) || 0));
    if (isNaN(d.getTime())) return '-';
    return d.toISOString().split('T')[0];
  };

  const calcularEstadoVencimiento = (fechaEmision: string, diasPago: number, f: FacturaCliente) => {
    if (isFacturaCobrada(f)) return 'Pagado';
    const v = calcularVencimiento(fechaEmision, diasPago);
    if (v === '-') return 'Pendiente';
    const hoy = new Date().toISOString().split('T')[0];
    if (v < hoy) return 'Vencido';
    return 'Al día';
  };

  const startEditing = (f: FacturaCliente) => {
    setEditingId(f.id);
    setEditImporte(f.importeRecibido || 0);
    setEditFechaPago(f.fechaPago || new Date().toISOString().split('T')[0]);
    setEditImpuestos(f.pagoImpuestos || false);
  };

  const handleSave = async (f: FacturaCliente) => {
    const retDet = getDetraccionRetencion(f);
    const neto = getNetoACobrar(f);
    const diffVsNeto = Number((neto - editImporte).toFixed(2));
    const diffVsBruto = Number(((f.montoConIgv || 0) - editImporte).toFixed(2));

    let nuevoEstado = 'Pendiente';
    const isNetoCompleto = editImporte > 0 && (diffVsNeto <= TOLERANCIA_DIFERENCIA_PAGO || diffVsBruto <= TOLERANCIA_DIFERENCIA_PAGO);

    if (isNetoCompleto) {
      if (retDet.monto > 0 && !editImpuestos) {
        nuevoEstado = 'Neto Cobrado';
      } else {
        nuevoEstado = 'Pagado';
      }
    } else if (editImporte > 0) {
      nuevoEstado = 'Pagado Parcial';
    } else {
      nuevoEstado = 'Pendiente';
    }

    await updateFacturaCliente(f.id, {
      importeRecibido: editImporte,
      fechaPago: editFechaPago,
      pagoImpuestos: editImpuestos,
      estado: nuevoEstado
    });
    
    setEditingId(null);
    toast.success('Cobranza actualizada');
  };

  const handleOpenVoucher = (url?: string) => {
    if (!url) return;
    const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
    window.open(fullUrl, '_blank');
  };

  const handleUploadVoucherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voucherModalFactura || !uploadFile) return;

    setIsUploadingVoucher(true);
    try {
      const targetFactura = facturasCliente.find(f => f.id === voucherModalFactura.id);
      const formData = new FormData();
      formData.append('file', uploadFile);
      if (targetFactura?.proyectoId) formData.append('projectId', targetFactura.proyectoId);
      formData.append('area', 'Cuentas');
      formData.append('subfolder', 'Cotización Cliente');

      const res = await fetch(`${API_URL}/drive/upload`, {
        method: 'POST',
        headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: formData,
      });

      if (!res.ok) throw new Error('Error al subir el archivo');
      const data = await res.json();
      const fileUrl = data.webViewLink || data.webContentLink || data.url || '';

      if (voucherModalFactura.tipo === 'factura') {
        await updateFacturaCliente(voucherModalFactura.id, 'comprobanteUrl', fileUrl);
        toast.success('Comprobante de factura adjuntado');
      } else {
        await updateFacturaCliente(voucherModalFactura.id, 'comprobantePagoUrl', fileUrl);
        toast.success('Voucher de cobranza adjuntado');
      }

      setVoucherModalFactura(null);
      setUploadFile(null);
    } catch (err: any) {
      console.error(err);
      toast.error('Error al subir archivo');
    } finally {
      setIsUploadingVoucher(false);
    }
  };

  const filteredFacturas = useMemo(() => {
    const term = (searchTerm || '').toLowerCase();
    return (facturasCliente || []).filter(f => {
      if (!f) return false;
      const matchSearch = !term ||
        String(f.numeroFactura || '').toLowerCase().includes(term) ||
        String(f.numeroOrden || '').toLowerCase().includes(term) ||
        String(getCliente(f.proyectoId) || '').toLowerCase().includes(term) ||
        String(getProyecto(f.proyectoId)?.nombre || '').toLowerCase().includes(term);
      
      if (!matchSearch) return false;

      const cobrada = isFacturaCobrada(f);
      const statusVenc = calcularEstadoVencimiento(f.fechaEmision, f.diasPago, f);

      if (activeTab === 'pendientes') {
        return !cobrada;
      }
      if (activeTab === 'vencidas') {
        return !cobrada && statusVenc === 'Vencido';
      }
      if (activeTab === 'cobradas') {
        return cobrada;
      }
      
      return true;
    });
  }, [facturasCliente, searchTerm, activeTab, proyectos, clientes]);

  const totalPages = Math.ceil(filteredFacturas.length / pageSize) || 1;
  const paginatedFacturas = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredFacturas.slice(start, start + pageSize);
  }, [filteredFacturas, currentPage, pageSize]);

  // KPIs
  const totalFacturado = useMemo(() => facturasCliente.reduce((acc, f) => acc + (f.montoConIgv || 0), 0), [facturasCliente]);
  const totalNetoEsperado = useMemo(() => facturasCliente.reduce((acc, f) => acc + getNetoACobrar(f), 0), [facturasCliente]);
  const totalCobrado = useMemo(() => facturasCliente.reduce((acc, f) => acc + (f.importeRecibido || 0), 0), [facturasCliente]);
  const totalPendiente = useMemo(() => {
    return facturasCliente.reduce((acc, f) => {
      if (isFacturaCobrada(f)) return acc;
      return acc + getDiferenciaVsNeto(f);
    }, 0);
  }, [facturasCliente]);
  const facturasVencidasCount = useMemo(() => {
    return facturasCliente.filter(f => !isFacturaCobrada(f) && calcularEstadoVencimiento(f.fechaEmision, f.diasPago, f) === 'Vencido').length;
  }, [facturasCliente]);
  const facturasPendientesCobroCount = useMemo(() => {
    return facturasCliente.filter(f => !isFacturaCobrada(f)).length;
  }, [facturasCliente]);
  const facturasCobradasCount = useMemo(() => {
    return facturasCliente.filter(f => isFacturaCobrada(f)).length;
  }, [facturasCliente]);

  if (!canAccess) {
    return (
      <div className="view-container animate-fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <AlertTriangle size={48} style={{ margin: '0 auto 16px' }} />
          <h3>Acceso Restringido</h3>
          <p>No tienes permisos suficientes para ver el módulo de Facturación.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '80px' }}>
      {/* UNIFIED MASTER TOOLBAR: TABS ON LEFT, ACTIONS ON RIGHT */}
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '14px' }}>
        {/* UNIFIED TABS */}
        <div className="unified-tabs" style={{ marginBottom: 0, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button 
            className={`unified-tab ${activeTab === 'todas' ? 'active' : ''}`}
            onClick={() => setActiveTab('todas')}
          >
            Todas
            <span className="unified-tab-badge">{facturasCliente.length}</span>
          </button>
          <button 
            className={`unified-tab ${activeTab === 'pendientes' ? 'active' : ''}`}
            onClick={() => setActiveTab('pendientes')}
          >
            Pendientes de Cobro
            {facturasPendientesCobroCount > 0 && (
              <span className="unified-tab-badge badge-warning">{facturasPendientesCobroCount}</span>
            )}
          </button>
          <button 
            className={`unified-tab ${activeTab === 'vencidas' ? 'active' : ''}`}
            onClick={() => setActiveTab('vencidas')}
          >
            Vencidas
            {facturasVencidasCount > 0 && (
              <span className="unified-tab-badge badge-danger">{facturasVencidasCount}</span>
            )}
          </button>
          <button 
            className={`unified-tab ${activeTab === 'cobradas' ? 'active' : ''}`}
            onClick={() => setActiveTab('cobradas')}
          >
            Cobradas
            <span className="unified-tab-badge badge-success">{facturasCobradasCount}</span>
          </button>
        </div>

        {/* VIEW ACTIONS */}
        <div className="view-actions">
          <button 
            className="btn-secondary" 
            disabled={isRefreshing}
            onClick={async () => {
              setIsRefreshing(true);
              try {
                await reloadFacturasCliente();
                toast.success('Facturas actualizadas');
              } catch (e) {
                toast.error('Error al actualizar');
              } finally {
                setIsRefreshing(false);
              }
            }}
            title="Refrescar lista de facturas"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RotateCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            Actualizar
          </button>
          <button 
            type="button" 
            className="btn-excel" 
            onClick={() => exportFacturasToExcel(facturasCliente, proyectos, clientes)}
            title="Descargar base completa de facturación en Excel (.xlsx)"
          >
            <FileSpreadsheet size={16} />
            <span>Exportar Excel</span>
          </button>
          <button className="btn-primary" onClick={() => setIsCreateModalOpen(true)}>
            <Plus size={18} />
            Nueva Factura de Cliente
          </button>
        </div>
      </div>

      {/* KPI METRICS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <div className="glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(102, 45, 145, 0.1)', color: 'var(--accent-primary)', flexShrink: 0 }}>
            <DollarSign size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>TOTAL FACTURADO</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--accent-primary)', marginTop: '2px' }}>
              {formatCurrency(totalFacturado)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
              Neto: <strong style={{ color: 'var(--accent-primary)' }}>{formatCurrency(totalNetoEsperado)}</strong>
            </div>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', flexShrink: 0 }}>
            <CheckCircle size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>TOTAL COBRADO (NETO)</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--success)', marginTop: '2px' }}>
              {formatCurrency(totalCobrado)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
              En cuenta bancaria
            </div>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', flexShrink: 0 }}>
            <Clock size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>PENDIENTE DE COBRO</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--warning)', marginTop: '2px' }}>
              {formatCurrency(totalPendiente)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
              Diferencia vs Neto
            </div>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', flexShrink: 0 }}>
            <AlertTriangle size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>FACTURAS VENCIDAS</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--danger)', marginTop: '2px' }}>
              {facturasVencidasCount}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
              Sin cobro comercial
            </div>
          </div>
        </div>
      </div>

      {/* UNIFIED SEARCH & FILTER PANEL */}
      <div className="unified-filter-panel">
        <div className="unified-filter-group search-group">
          <label className="unified-filter-label">Búsqueda Rápida</label>
          <div className="unified-search-wrapper">
            <Search size={16} className="unified-search-icon" />
            <input 
              type="text" 
              placeholder="Buscar por N° Factura, Orden, Cliente o Proyecto..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="unified-search-input" 
            />
          </div>
        </div>
        {searchTerm && (
          <button className="btn-clear-filters" onClick={() => setSearchTerm('')} title="Limpiar búsqueda">
            <X size={14} />
            Limpiar
          </button>
        )}
      </div>

      {/* TABLE */}
      <div className="glass-panel table-container" style={{ marginBottom: '56px', padding: 0, overflow: 'hidden', display: (isMobile && mobileDisplayMode === 'cards') ? 'none' : 'block' }}>
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
              Control de Facturación a Clientes
            </h3>
            <span className="badge badge-info" style={{ fontSize: '0.8rem', padding: '3px 10px' }}>
              {filteredFacturas.length} {filteredFacturas.length === 1 ? 'factura' : 'facturas'}
            </span>
          </div>

          {isMobile && (
            <div className="mobile-view-switcher">
              <button 
                type="button"
                className={`mobile-view-switcher-btn ${mobileDisplayMode === 'cards' ? 'active' : ''}`}
                onClick={() => setMobileDisplayMode('cards')}
                title="Ver facturas como tarjetas"
              >
                📱 Tarjetas
              </button>
              <button 
                type="button"
                className={`mobile-view-switcher-btn ${mobileDisplayMode === 'table' ? 'active' : ''}`}
                onClick={() => setMobileDisplayMode('table')}
                title="Ver facturas como tabla completa"
              >
                📋 Tabla
              </button>
            </div>
          )}
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
        </div>

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
            <SkeletonTable rows={5} columns={11} />
          ) : (
            <table className="data-table" style={{ width: '100%', minWidth: '1720px', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
              <colgroup>
                <col style={{ width: '160px', minWidth: '160px' }} /> {/* N° Factura */}
                <col style={{ width: '240px', minWidth: '240px' }} /> {/* Cliente / Proyecto */}
                <col style={{ width: '150px', minWidth: '150px' }} /> {/* Orden Asociada */}
                <col style={{ width: '160px', minWidth: '160px' }} /> {/* Emisión / Vencimiento */}
                <col style={{ width: '140px', minWidth: '140px' }} /> {/* Total con IGV */}
                <col style={{ width: '140px', minWidth: '140px' }} /> {/* Neto Recibido */}
                <col style={{ width: '150px', minWidth: '150px' }} /> {/* Diferencia vs Neto */}
                <col style={{ width: '150px', minWidth: '150px' }} /> {/* Detracc. / Retenc. */}
                <col style={{ width: '140px', minWidth: '140px' }} /> {/* Comprobantes */}
                <col style={{ width: '130px', minWidth: '130px' }} /> {/* Estado Cobro */}
                <col style={{ width: '160px', minWidth: '160px' }} /> {/* Acciones */}
              </colgroup>
              <thead style={{ position: 'sticky', top: 0, zIndex: 12, backgroundColor: '#f8fafc' }}>
                <tr>
                  <th className="header-custom sticky-col-left" style={{ position: 'sticky', left: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '160px' }}>N° FACTURA</th>
                  <th className="header-custom">CLIENTE / PROYECTO</th>
                  <th className="header-custom">ORDEN ASOCIADA</th>
                  <th className="header-custom text-center">EMISIÓN / VENCIMIENTO</th>
                  <th className="header-custom text-right">TOTAL CON IGV</th>
                  <th className="header-custom text-right">NETO RECIBIDO</th>
                  <th className="header-custom text-right">DIFERENCIA VS NETO</th>
                  <th className="header-custom text-center">DETRACC. / RETENC.</th>
                  <th className="header-custom text-center">COMPROBANTES</th>
                  <th className="header-custom text-center">ESTADO COBRO</th>
                  <th className="header-custom text-center sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '160px' }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {paginatedFacturas.map(f => {
                  const proyecto = getProyecto(f.proyectoId);
                  const vencimiento = calcularVencimiento(f.fechaEmision, f.diasPago);
                  const cobrada = isFacturaCobrada(f);
                  const statusVenc = calcularEstadoVencimiento(f.fechaEmision, f.diasPago, f);
                  const retDet = getDetraccionRetencion(f);
                  const netoEsperado = getNetoACobrar(f);
                  const recibido = Number(f.importeRecibido || 0);
                  const diffVsNeto = getDiferenciaVsNeto(f);
                  const isEditing = editingId === f.id;

                  return (
                    <tr key={f.id} className="hover-bg-subtle" style={{ transition: 'background-color 0.15s ease' }}>
                      <td className="td-custom sticky-col-left" style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: 'inherit', fontWeight: 'bold', color: 'var(--accent-primary)', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <FileText size={16} />
                          {f.numeroFactura}
                        </div>
                      </td>
                    <td className="td-custom">
                      <div style={{ fontWeight: 600 }}>{getCliente(f.proyectoId)}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{proyecto?.nombre}</div>
                    </td>
                    <td className="td-custom" style={{ wordBreak: 'break-all' }}>
                      {(!f.tipoOrden || f.tipoOrden === 'Sin Orden' || !f.numeroOrden || f.numeroOrden === '-') ? (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: '#f1f5f9', padding: '3px 8px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          Sin OC / OS
                        </span>
                      ) : (
                        <div style={{ fontSize: '11px', background: 'rgba(124, 58, 237, 0.08)', color: 'var(--accent-primary)', fontWeight: 600, padding: '3px 8px', borderRadius: '12px', display: 'inline-block' }}>
                          {f.tipoOrden}: {f.numeroOrden}
                        </div>
                      )}
                    </td>
                    <td className="td-custom text-center" style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: '11px' }}>Emisión: {f.fechaEmision}</div>
                      <div style={{ fontSize: '11px', fontWeight: 'bold', color: statusVenc === 'Vencido' ? 'var(--danger)' : 'var(--text-muted)' }}>
                        Vence: {vencimiento}
                      </div>
                    </td>
                    <td className="td-custom text-right font-bold font-tabular" style={{ color: 'var(--accent-primary)', whiteSpace: 'nowrap' }}>
                      <div>{formatCurrency(f.montoConIgv)}</div>
                      <div style={{ fontSize: '11px', color: '#6366f1', fontWeight: 600, marginTop: '2px' }}>
                        Neto: {formatCurrency(netoEsperado)}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', marginTop: '2px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500 }}>
                          Sin IGV: {formatCurrency(f.montoSinIgv)}
                        </span>
                        {f.porcentajeFacturacion && f.porcentajeFacturacion < 100 ? (
                          <span style={{ fontSize: '10px', background: 'rgba(124, 58, 237, 0.12)', color: 'var(--accent-primary)', padding: '1px 6px', borderRadius: '8px', fontWeight: 700 }}>
                            {f.porcentajeFacturacion}%
                          </span>
                        ) : (
                          <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#64748b', padding: '1px 5px', borderRadius: '8px', fontWeight: 600 }}>
                            100%
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="td-custom text-right font-tabular" style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 'bold', color: recibido > 0 ? (cobrada ? 'var(--success)' : 'var(--accent-primary)') : 'var(--text-muted)' }}>
                        {formatCurrency(recibido)}
                      </div>
                      {recibido > 0 && f.fechaPago && (
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {f.fechaPago}
                        </div>
                      )}
                    </td>
                    <td className="td-custom text-right font-tabular" style={{ whiteSpace: 'nowrap' }}>
                      {diffVsNeto === 0 ? (
                        <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: '12px' }}>
                          S/ 0.00 ✓
                        </span>
                      ) : recibido === 0 ? (
                        <div>
                          <div style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '12px' }}>
                            {formatCurrency(diffVsNeto)}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Sin abonos</div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ color: 'var(--warning)', fontWeight: 700, fontSize: '12px' }}>
                            {formatCurrency(diffVsNeto)}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Resta por cobrar</div>
                        </div>
                      )}
                    </td>
                    <td className="td-custom text-center" style={{ whiteSpace: 'nowrap' }}>
                      {retDet.tipo !== '-' ? (
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500 }}>{retDet.tipo}</div>
                          <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)', margin: '2px 0' }}>
                            {formatCurrency(retDet.monto)}
                          </div>
                          <div>
                            {f.pagoImpuestos ? (
                              <span style={{ fontSize: '10px', background: 'rgba(16, 185, 129, 0.12)', color: 'var(--success)', padding: '2px 6px', borderRadius: '6px', fontWeight: 700 }}>
                                ✓ Pagada
                              </span>
                            ) : (
                              <span style={{ fontSize: '10px', background: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning)', padding: '2px 6px', borderRadius: '6px', fontWeight: 600 }}>
                                ⏳ Pendiente
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No aplica</span>
                      )}
                    </td>
                    <td className="td-custom text-center">
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        {/* Factura PDF */}
                        {f.comprobanteUrl ? (
                          <button
                            className="btn-icon"
                            title="Ver PDF de Factura"
                            onClick={() => handleOpenVoucher(f.comprobanteUrl)}
                            style={{ color: 'var(--info)' }}
                          >
                            <FileText size={16} />
                          </button>
                        ) : (
                          <button
                            className="btn-icon"
                            title="Adjuntar PDF de Factura"
                            onClick={() => setVoucherModalFactura({ id: f.id, tipo: 'factura', numero: f.numeroFactura })}
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Upload size={16} />
                          </button>
                        )}

                        {/* Voucher Cobranza */}
                        {f.comprobantePagoUrl ? (
                          <button
                            className="btn-icon"
                            title="Ver Voucher de Cobranza del Cliente"
                            onClick={() => handleOpenVoucher(f.comprobantePagoUrl)}
                            style={{ color: 'var(--success)' }}
                          >
                            <CheckCircle size={16} />
                          </button>
                        ) : (
                          <button
                            className="btn-icon"
                            title="Adjuntar Voucher de Cobro"
                            onClick={() => setVoucherModalFactura({ id: f.id, tipo: 'pago', numero: f.numeroFactura })}
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Paperclip size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="td-custom text-center" style={{ whiteSpace: 'nowrap' }}>
                      {(() => {
                        if (cobrada) {
                          if (retDet.monto > 0 && !f.pagoImpuestos) {
                            return (
                              <span className="badge" style={{ background: 'rgba(14, 165, 233, 0.15)', color: '#0284c7', border: '1px solid rgba(14, 165, 233, 0.3)' }} title="Neto comercial recibido. Constancia de detracción/retención pendiente.">
                                Neto Cobrado
                              </span>
                            );
                          }
                          return <span className="badge badge-success">Pagado</span>;
                        }
                        if (f.estado === 'Pagado Parcial' || (recibido > 0 && diffVsNeto > 0)) {
                          return <span className="badge badge-warning">Pagado Parcial</span>;
                        }
                        return <span className="badge badge-danger">Pendiente</span>;
                      })()}
                      {statusVenc === 'Vencido' && !cobrada && (
                        <div style={{ fontSize: '10px', color: 'var(--danger)', fontWeight: 'bold', marginTop: '2px' }}>
                          ⚠️ Vencida
                        </div>
                      )}
                    </td>
                    <td className="td-custom text-center sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 10, backgroundColor: 'inherit' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '190px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Neto esperado: <strong style={{ color: 'var(--accent-primary)' }}>{formatCurrency(netoEsperado)}</strong>
                          </div>
                          <div>
                            <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Neto Recibido</label>
                            <input 
                              type="number" 
                              step="0.01"
                              className="form-input" 
                              style={{ padding: '4px 8px', width: '100%', fontSize: '12px' }} 
                              placeholder="Monto Recibido" 
                              value={editImporte || ''} 
                              onChange={e => setEditImporte(Number(e.target.value))} 
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Fecha de Pago</label>
                            <input 
                              type="date" 
                              className="form-input" 
                              style={{ padding: '4px 8px', width: '100%', fontSize: '12px' }} 
                              value={editFechaPago} 
                              onChange={e => setEditFechaPago(e.target.value)} 
                            />
                          </div>
                          {retDet.tipo !== '-' && (
                            <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', background: '#f8fafc', padding: '4px 6px', borderRadius: '4px' }}>
                              <input 
                                type="checkbox" 
                                checked={editImpuestos} 
                                onChange={e => setEditImpuestos(e.target.checked)} 
                              />
                              <span>¿Constancia {retDet.tipo.split(' ')[0]} pagada?</span>
                            </label>
                          )}
                          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                            <button 
                              className="btn-secondary" 
                              style={{ padding: '4px 8px', flex: 1, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} 
                              onClick={() => setEditingId(null)}
                            >
                              <X size={14} /> Cancelar
                            </button>
                            <button 
                              className="btn-primary" 
                              style={{ padding: '4px 8px', flex: 1, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} 
                              onClick={() => handleSave(f)}
                            >
                              <Save size={14} /> Guardar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button 
                            className="btn-secondary" 
                            style={{ fontSize: '11px', padding: '4px 10px', whiteSpace: 'nowrap' }} 
                            onClick={() => startEditing(f)}
                          >
                            {recibido > 0 || cobrada ? 'Editar Cobro' : 'Registrar Cobro'}
                          </button>
                          <button 
                            className="btn-icon" 
                            style={{ color: 'var(--danger)' }} 
                            onClick={() => {
                              if (window.confirm(`¿Está seguro de eliminar la factura ${f.numeroFactura}?`)) {
                                deleteFacturaCliente(f.id);
                                toast.success('Factura eliminada');
                              }
                            }} 
                            title="Eliminar Factura"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredFacturas.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                      <FileText size={36} style={{ opacity: 0.35 }} />
                      <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>
                        {facturasCliente.length === 0 
                          ? 'No se cargaron facturas en esta sesión o la conexión expiró.' 
                          : 'No se encontraron facturas con los filtros seleccionados.'}
                      </p>
                      {facturasCliente.length === 0 && (
                        <button
                          className="btn-secondary"
                          onClick={() => {
                            toast.promise(reloadFacturasCliente(), {
                              loading: 'Cargando facturas...',
                              success: 'Facturas cargadas exitosamente',
                              error: 'Error al cargar facturas'
                            });
                          }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}
                        >
                          <RotateCw size={15} /> Recargar Facturas
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        </div>

        {/* BARRA DE PAGINACIÓN DESKTOP */}
        {filteredFacturas.length > 0 && (
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
                facturas por página • Mostrando {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, filteredFacturas.length)} de {filteredFacturas.length}
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

      {/* Mobile Adaptive Cards View for Facturas */}
      {isMobile && mobileDisplayMode === 'cards' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
          <div className="mobile-view-switcher">
            <button 
              type="button"
              className={`mobile-view-switcher-btn ${mobileDisplayMode === 'cards' ? 'active' : ''}`}
              onClick={() => setMobileDisplayMode('cards')}
              title="Ver facturas como tarjetas"
            >
              📱 Tarjetas
            </button>
            <button 
              type="button"
              className={`mobile-view-switcher-btn ${mobileDisplayMode === 'table' ? 'active' : ''}`}
              onClick={() => setMobileDisplayMode('table')}
              title="Ver facturas como tabla completa"
            >
              📋 Tabla
            </button>
          </div>
        </div>
      )}
      <div className="mobile-cards-container" style={{ display: (isMobile && mobileDisplayMode === 'cards') ? 'flex' : 'none' }}>
        {isLoading ? (
          <SkeletonTable rows={4} columns={1} />
        ) : filteredFacturas.length === 0 ? (
          <div className="glass-panel" style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
            No se encontraron facturas con los filtros seleccionados.
          </div>
        ) : (
          filteredFacturas.map((f) => {
            const clienteName = getCliente(f.proyectoId);
            const proyecto = getProyecto(f.proyectoId);
            const vencimiento = calcularVencimiento(f.fechaEmision, f.diasPago);
            const cobrada = isFacturaCobrada(f);
            const statusVenc = calcularEstadoVencimiento(f.fechaEmision, f.diasPago, f);
            const vencida = statusVenc === 'Vencido' && !cobrada;

            return (
              <div key={f.id} className="mobile-data-card">
                <div className="mobile-data-card-header">
                  <div style={{ minWidth: 0 }}>
                    <div className="mobile-data-card-title font-mono" style={{ color: 'var(--accent-primary)', fontSize: '14px' }}>
                      {f.numeroFactura || 'Sin N° Factura'}
                    </div>
                    <div className="mobile-data-card-subtitle">
                      <span>{f.tipoOrden || 'OC'}: {f.numeroOrden || '-'}</span>
                      {f.fechaEmision && <span>• 📅 {f.fechaEmision}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
                    <span style={{ fontWeight: 800, fontSize: '15px', color: '#059669' }}>
                      {formatCurrency(f.montoConIgv || 0)}
                    </span>
                    <span className={`badge ${cobrada ? 'badge-success' : vencida ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: '10px' }}>
                      {cobrada ? 'Cobrada' : (vencida ? 'Vencida' : (f.estado || 'Pendiente'))}
                    </span>
                  </div>
                </div>

                <div className="mobile-card-grid-meta">
                  <div className="mobile-card-meta-col">
                    <span className="mobile-card-meta-label">Cliente</span>
                    <span className="mobile-card-meta-val" title={clienteName}>{clienteName}</span>
                  </div>
                  <div className="mobile-card-meta-col">
                    <span className="mobile-card-meta-label">Vencimiento</span>
                    <span className="mobile-card-meta-val" style={{ color: vencida ? '#dc2626' : undefined, fontWeight: vencida ? 700 : 500 }}>
                      {vencimiento || '-'}
                    </span>
                  </div>
                  <div className="mobile-card-meta-col" style={{ gridColumn: 'span 2' }}>
                    <span className="mobile-card-meta-label">Proyecto</span>
                    <span className="mobile-card-meta-val" title={proyecto?.nombre || ''}>{proyecto?.nombre || '-'}</span>
                  </div>
                </div>

                <div className="mobile-card-actions-row">
                  <button 
                    type="button" 
                    className="mobile-action-pill" 
                    onClick={() => startEditing(f)}
                    title="Registrar o Editar Cobro"
                  >
                    <span>{cobrada ? 'Editar Cobro' : 'Registrar Cobro'}</span>
                  </button>

                  <button 
                    type="button" 
                    className="mobile-action-pill" 
                    onClick={() => setVoucherModalFactura({ id: f.id, tipo: 'pago', numero: f.numeroFactura })}
                    title="Adjuntar Voucher"
                  >
                    <Paperclip size={13} />
                    <span>Voucher</span>
                  </button>

                  {f.comprobanteUrl && (
                    <a 
                      href={f.comprobanteUrl.startsWith('http') ? f.comprobanteUrl : `${BASE_URL}${f.comprobanteUrl}`}
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="mobile-action-pill"
                      title="Ver PDF Factura"
                      style={{ color: '#0284c7' }}
                    >
                      <FileText size={13} />
                      <span>PDF</span>
                    </a>
                  )}

                  <button 
                    type="button" 
                    className="mobile-action-pill danger" 
                    onClick={() => {
                      if (window.confirm(`¿Está seguro de eliminar la factura ${f.numeroFactura}?`)) {
                        deleteFacturaCliente(f.id);
                        toast.success('Factura eliminada');
                      }
                    }}
                    title="Eliminar Factura"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {editingId === f.id && (
                  <div className="mobile-card-expanded-box" style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase' }}>
                      Registro de Cobranza
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Neto esperado: <strong style={{ color: 'var(--accent-primary)' }}>{formatCurrency(getNetoACobrar(f))}</strong>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Neto Recibido (S/)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        className="form-input" 
                        style={{ padding: '6px 10px', width: '100%', fontSize: '13px' }} 
                        placeholder="Monto Recibido" 
                        value={editImporte || ''} 
                        onChange={e => setEditImporte(Number(e.target.value))} 
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Fecha de Pago</label>
                      <input 
                        type="date" 
                        className="form-input" 
                        style={{ padding: '6px 10px', width: '100%', fontSize: '13px' }} 
                        value={editFechaPago} 
                        onChange={e => setEditFechaPago(e.target.value)} 
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                      <button 
                        type="button" 
                        className="btn-primary" 
                        style={{ flex: 1, padding: '8px 12px', fontSize: '12px', justifyContent: 'center' }}
                        onClick={() => handleSave(f)}
                      >
                        <Save size={14} /> Guardar Cobro
                      </button>
                      <button 
                        type="button" 
                        className="btn-secondary" 
                        style={{ padding: '8px 12px', fontSize: '12px' }}
                        onClick={() => setEditingId(null)}
                      >
                        <X size={14} /> Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* CREATE MODAL */}
      <CreateFacturaModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
      />

      {/* MODAL TO ATTACH VOUCHER / FILE */}
      {voucherModalFactura && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {voucherModalFactura.tipo === 'factura' ? 'Adjuntar PDF de Factura' : 'Adjuntar Voucher de Cobro'}
              </h3>
              <button className="btn-icon" onClick={() => setVoucherModalFactura(null)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleUploadVoucherSubmit} className="modal-body">
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Factura: <strong>{voucherModalFactura.numero}</strong>
              </p>
              <div className="form-group" style={{ marginTop: '16px' }}>
                <label>Seleccionar Archivo (PDF o Imagen) *</label>
                <input
                  type="file"
                  className="form-control"
                  accept=".pdf,image/*"
                  onChange={e => {
                    if (e.target.files && e.target.files.length > 0) setUploadFile(e.target.files[0]);
                  }}
                  required
                />
              </div>
              <div className="modal-footer" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn-secondary" onClick={() => setVoucherModalFactura(null)} disabled={isUploadingVoucher}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={isUploadingVoucher || !uploadFile}>
                  {isUploadingVoucher ? 'Subiendo...' : 'Guardar Archivo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
