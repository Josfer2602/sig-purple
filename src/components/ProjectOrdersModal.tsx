import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { X, Plus, Trash2, Percent, FileText } from 'lucide-react';
import { useGlobalContext } from '../context/GlobalContext';
import type { Proyecto, FacturaCliente } from '../types/models';
import { toast } from 'react-hot-toast';

interface ProjectOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  proyecto: Proyecto;
}

interface OrderItem {
  id: string;
  numero: string;
  fecha: string;
  condicion: string;
}

export const ProjectOrdersModal: React.FC<ProjectOrdersModalProps> = ({ isOpen, onClose, proyecto }) => {
  const { facturasCliente, addFacturaCliente, deleteFacturaCliente, updateProyecto } = useGlobalContext();
  const [activeTab, setActiveTab] = useState<'OC' | 'OS' | 'SIN_ORDEN'>('OC');

  const parseOrders = (jsonStr?: string): OrderItem[] => {
    if (!jsonStr) return [];
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        return parsed.map((p, idx) => {
          if (typeof p === 'string' || typeof p === 'number') {
            return { id: `ord-${idx}-${Math.random()}`, numero: String(p), fecha: '', condicion: '' };
          }
          return p as OrderItem;
        });
      }
      if (typeof parsed === 'string' || typeof parsed === 'number') {
        return [{ id: `ord-single-${Math.random()}`, numero: String(parsed), fecha: '', condicion: '' }];
      }
      return [];
    } catch {
      const str = String(jsonStr).trim();
      if (!str) return [];
      if (str.includes('/')) {
        return str.split('/').map((s, idx) => ({ id: `ord-${idx}-${Math.random()}`, numero: s.trim(), fecha: '', condicion: '' }));
      }
      return [{ id: `ord-plain-${Math.random()}`, numero: str, fecha: '', condicion: '' }];
    }
  };

  const [ocs, setOcs] = useState<OrderItem[]>(parseOrders(proyecto?.ordenesCompra));
  const [oss, setOss] = useState<OrderItem[]>(parseOrders(proyecto?.ordenesServicio));

  const rawOrders = activeTab === 'OC' ? ocs : (activeTab === 'OS' ? oss : []);
  const currentOrders = Array.isArray(rawOrders) ? rawOrders : [];
  const setOrders = activeTab === 'OC' ? setOcs : setOss;

  const [newOrder, setNewOrder] = useState<Partial<OrderItem>>({ numero: '', fecha: '', condicion: '' });

  // Invoice creation form state
  const [porcentajeFacturacion, setPorcentajeFacturacion] = useState<number>(100);
  const [newInvoice, setNewInvoice] = useState<Partial<FacturaCliente>>({
    numeroFactura: '',
    fechaEmision: new Date().toISOString().split('T')[0],
    diasPago: 30,
    montoSinIgv: 0,
    aplicaDetraccion: false,
    aplicaRetencion: false,
  });

  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [isAddingDirectInvoice, setIsAddingDirectInvoice] = useState(false);

  // Financial calculations
  const subtotalProyecto = Number(proyecto?.subtotal || 0);
  const facturasDelProyecto = (facturasCliente || []).filter(f => f && f.proyectoId === proyecto?.id);
  const totalFacturadoSinIgv = facturasDelProyecto.reduce((acc, f) => acc + (Number(f.montoSinIgv) || 0), 0);
  const saldoPendienteSinIgv = Math.max(0, subtotalProyecto - totalFacturadoSinIgv);
  const totalFacturadoPct = subtotalProyecto > 0 ? Number(((totalFacturadoSinIgv / subtotalProyecto) * 100).toFixed(1)) : 0;
  const saldoPendientePct = subtotalProyecto > 0 ? Math.max(0, Number((100 - totalFacturadoPct).toFixed(1))) : 0;

  const sinOrdenFacturas = facturasDelProyecto.filter(
    f => !f.tipoOrden || f.tipoOrden === 'Sin Orden' || !f.numeroOrden || f.numeroOrden === '-'
  );

  if (!isOpen) return null;

  const formatCurrency = (val: number) =>
    'S/ ' + Number(val || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleInvoicePorcentajeChange = (pct: number) => {
    setPorcentajeFacturacion(pct);
    if (subtotalProyecto > 0) {
      const calcMonto = Number(((subtotalProyecto * pct) / 100).toFixed(2));
      setNewInvoice(prev => ({ ...prev, montoSinIgv: calcMonto }));
    }
  };

  const handleInvoiceMontoChange = (monto: number) => {
    setNewInvoice(prev => ({ ...prev, montoSinIgv: monto }));
    if (subtotalProyecto > 0) {
      const calcPct = Number(((monto / subtotalProyecto) * 100).toFixed(1));
      setPorcentajeFacturacion(calcPct);
    }
  };

  const openInvoiceForm = (orderId: string | null) => {
    setActiveOrderId(orderId);
    setIsAddingDirectInvoice(orderId === null);
    const defaultPct = saldoPendientePct > 0 && saldoPendientePct <= 100 ? saldoPendientePct : 100;
    setPorcentajeFacturacion(defaultPct);
    const defaultMonto = subtotalProyecto > 0 ? Number(((subtotalProyecto * defaultPct) / 100).toFixed(2)) : 0;
    setNewInvoice({
      numeroFactura: '',
      fechaEmision: new Date().toISOString().split('T')[0],
      diasPago: 30,
      montoSinIgv: defaultMonto,
      aplicaDetraccion: false,
      aplicaRetencion: false,
    });
  };

  const handleAddOrder = async () => {
    if (!newOrder.numero) return;
    const order: OrderItem = {
      id: Date.now().toString(),
      numero: newOrder.numero,
      fecha: newOrder.fecha || new Date().toLocaleDateString('es-PE'),
      condicion: newOrder.condicion || ''
    };
    
    const updated = [...currentOrders, order];
    setOrders(updated);
    setNewOrder({ numero: '', fecha: '', condicion: '' });

    await updateProyecto(proyecto.id, activeTab === 'OC' ? 'ordenesCompra' : 'ordenesServicio', JSON.stringify(updated));
    toast.success(`${activeTab} agregada`);
  };

  const handleDeleteOrder = async (id: string) => {
    if (!window.confirm('¿Seguro que deseas eliminar esta orden? Se mantendrán las facturas pero sin vínculo.')) return;
    const updated = currentOrders.filter(o => o.id !== id);
    setOrders(updated);
    await updateProyecto(proyecto.id, activeTab === 'OC' ? 'ordenesCompra' : 'ordenesServicio', JSON.stringify(updated));
  };

  const handleAddInvoice = async (order?: OrderItem | null) => {
    if (!newInvoice.numeroFactura?.trim() || !newInvoice.montoSinIgv || newInvoice.montoSinIgv <= 0) {
      toast.error('Número de factura y monto válido son requeridos');
      return;
    }

    const monto = Number(newInvoice.montoSinIgv);
    const igv = monto * 0.18;

    const f: Partial<FacturaCliente> = {
      proyectoId: proyecto.id,
      tipoOrden: order ? (activeTab as 'OC' | 'OS') : 'Sin Orden',
      numeroOrden: order ? order.numero : '-',
      fechaGeneracionOrden: order ? order.fecha : new Date().toISOString().split('T')[0],
      condicionPago: order ? order.condicion : '30 días',
      numeroFactura: newInvoice.numeroFactura.trim(),
      fechaEmision: newInvoice.fechaEmision || new Date().toISOString().split('T')[0],
      diasPago: Number(newInvoice.diasPago) || 30,
      porcentajeFacturacion: Number(porcentajeFacturacion) || 100,
      montoSinIgv: monto,
      igv: Number(igv.toFixed(2)),
      montoConIgv: Number((monto + igv).toFixed(2)),
      aplicaDetraccion: Boolean(newInvoice.aplicaDetraccion),
      aplicaRetencion: Boolean(newInvoice.aplicaRetencion),
      importeRecibido: 0,
      pagoImpuestos: false,
      estado: 'Pendiente'
    };

    await addFacturaCliente(f);
    toast.success(`Factura ${newInvoice.numeroFactura} registrada (${porcentajeFacturacion}%)`);
    setNewInvoice({ numeroFactura: '', fechaEmision: '', diasPago: 30, montoSinIgv: 0, aplicaDetraccion: false, aplicaRetencion: false });
    setActiveOrderId(null);
    setIsAddingDirectInvoice(false);
  };

  // Reusable inline invoice form
  const renderInvoiceForm = (order?: OrderItem | null) => (
    <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px dashed #cbd5e1', marginTop: '12px' }}>
      {/* Presets row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Percent size={15} color="var(--accent-primary)" />
          <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)' }}>
            Porcentaje de Facturación
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => handleInvoicePorcentajeChange(50)}
            style={{
              padding: '2px 8px',
              fontSize: '11px',
              borderRadius: '12px',
              border: '1px solid var(--accent-primary)',
              background: porcentajeFacturacion === 50 ? 'var(--accent-primary)' : 'transparent',
              color: porcentajeFacturacion === 50 ? '#fff' : 'var(--accent-primary)',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            50% (50/50)
          </button>
          <button
            type="button"
            onClick={() => handleInvoicePorcentajeChange(100)}
            style={{
              padding: '2px 8px',
              fontSize: '11px',
              borderRadius: '12px',
              border: '1px solid var(--accent-primary)',
              background: porcentajeFacturacion === 100 ? 'var(--accent-primary)' : 'transparent',
              color: porcentajeFacturacion === 100 ? '#fff' : 'var(--accent-primary)',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            100% (Total)
          </button>
          {saldoPendientePct > 0 && saldoPendientePct < 100 && (
            <button
              type="button"
              onClick={() => handleInvoicePorcentajeChange(saldoPendientePct)}
              style={{
                padding: '2px 8px',
                fontSize: '11px',
                borderRadius: '12px',
                border: '1px solid #ea580c',
                background: porcentajeFacturacion === saldoPendientePct ? '#ea580c' : 'rgba(234, 88, 12, 0.08)',
                color: porcentajeFacturacion === saldoPendientePct ? '#fff' : '#ea580c',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Saldo ({saldoPendientePct}%)
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '100px repeat(3, minmax(0, 1fr))', gap: '12px' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: '11px', fontWeight: 600 }}>% Factura</label>
          <input
            type="number"
            step="0.1"
            min="1"
            max="100"
            className="form-control"
            value={porcentajeFacturacion || ''}
            onChange={e => handleInvoicePorcentajeChange(parseFloat(e.target.value) || 0)}
            style={{ fontWeight: 700, color: 'var(--accent-primary)' }}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: '11px', fontWeight: 600 }}>N° Factura *</label>
          <input
            type="text"
            className="form-control"
            value={newInvoice.numeroFactura}
            onChange={e => setNewInvoice({ ...newInvoice, numeroFactura: e.target.value })}
            placeholder="F001-..."
            required
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: '11px', fontWeight: 600 }}>Fecha Emisión</label>
          <input
            type="date"
            className="form-control"
            value={newInvoice.fechaEmision}
            onChange={e => setNewInvoice({ ...newInvoice, fechaEmision: e.target.value })}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: '11px', fontWeight: 600 }}>Días Crédito</label>
          <input
            type="number"
            className="form-control"
            value={newInvoice.diasPago}
            onChange={e => setNewInvoice({ ...newInvoice, diasPago: Number(e.target.value) })}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px', marginTop: '10px' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: '11px', fontWeight: 600 }}>Monto sin IGV (S/) *</label>
          <input
            type="number"
            step="0.01"
            className="form-control"
            value={newInvoice.montoSinIgv || ''}
            onChange={e => handleInvoiceMontoChange(parseFloat(e.target.value) || 0)}
            placeholder="0.00"
            required
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-primary)' }}>Total con IGV 18% (S/)</label>
          <input
            type="text"
            className="form-control"
            value={formatCurrency((Number(newInvoice.montoSinIgv) || 0) * 1.18)}
            readOnly
            style={{ fontWeight: 700, color: 'var(--accent-primary)', background: '#ffffff' }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              style={{ accentColor: 'var(--accent-primary)' }}
              checked={newInvoice.aplicaDetraccion}
              onChange={e => setNewInvoice({ ...newInvoice, aplicaDetraccion: e.target.checked, aplicaRetencion: false })}
            />
            Detracción (12%)
          </label>
          <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              style={{ accentColor: 'var(--accent-primary)' }}
              checked={newInvoice.aplicaRetencion}
              onChange={e => setNewInvoice({ ...newInvoice, aplicaRetencion: e.target.checked, aplicaDetraccion: false })}
            />
            Retención (3%)
          </label>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '6px 12px', fontSize: '12px' }}
            onClick={() => { setActiveOrderId(null); setIsAddingDirectInvoice(false); }}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            style={{ padding: '6px 14px', fontSize: '12px' }}
            onClick={() => handleAddInvoice(order)}
          >
            Guardar Factura ({porcentajeFacturacion}%)
          </button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '880px', width: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <h3 className="modal-title">Gestionar Órdenes y Facturación del Proyecto</h3>
            <p style={{ margin: '2px 0 0 0', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{proyecto.nombre}</p>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Project Financial Summary Banner */}
        <div style={{
          padding: '10px 20px',
          background: 'rgba(124, 58, 237, 0.04)',
          borderBottom: '1px solid rgba(124, 58, 237, 0.15)',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: '12px'
        }}>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Subtotal Presupuestado</span>
            <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{formatCurrency(subtotalProyecto)}</strong>
          </div>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Total Facturado ({totalFacturadoPct}%)</span>
            <strong style={{ fontSize: '13px', color: '#16a34a' }}>{formatCurrency(totalFacturadoSinIgv)}</strong>
          </div>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Saldo Pendiente ({saldoPendientePct}%)</span>
            <strong style={{ fontSize: '13px', color: saldoPendienteSinIgv > 0 ? '#ea580c' : '#64748b' }}>
              {formatCurrency(saldoPendienteSinIgv)}
            </strong>
          </div>
        </div>

        {/* Unified Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', background: '#fafafa' }}>
          <button 
            style={{ 
              flex: 1, 
              padding: '12px', 
              background: activeTab === 'OC' ? '#ffffff' : 'transparent', 
              borderBottom: activeTab === 'OC' ? '2px solid var(--accent-primary)' : '2px solid transparent', 
              fontWeight: activeTab === 'OC' ? 'bold' : 'normal',
              color: activeTab === 'OC' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              borderRight: '1px solid var(--border-color)',
              cursor: 'pointer'
            }} 
            onClick={() => { setActiveTab('OC'); setActiveOrderId(null); setIsAddingDirectInvoice(false); }}
          >
            Órdenes de Compra (OC) ({ocs.length})
          </button>
          <button 
            style={{ 
              flex: 1, 
              padding: '12px', 
              background: activeTab === 'OS' ? '#ffffff' : 'transparent', 
              borderBottom: activeTab === 'OS' ? '2px solid var(--accent-primary)' : '2px solid transparent', 
              fontWeight: activeTab === 'OS' ? 'bold' : 'normal',
              color: activeTab === 'OS' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              borderRight: '1px solid var(--border-color)',
              cursor: 'pointer'
            }} 
            onClick={() => { setActiveTab('OS'); setActiveOrderId(null); setIsAddingDirectInvoice(false); }}
          >
            Órdenes de Servicio (OS) ({oss.length})
          </button>
          <button 
            style={{ 
              flex: 1, 
              padding: '12px', 
              background: activeTab === 'SIN_ORDEN' ? '#ffffff' : 'transparent', 
              borderBottom: activeTab === 'SIN_ORDEN' ? '2px solid var(--accent-primary)' : '2px solid transparent', 
              fontWeight: activeTab === 'SIN_ORDEN' ? 'bold' : 'normal',
              color: activeTab === 'SIN_ORDEN' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              cursor: 'pointer'
            }} 
            onClick={() => { setActiveTab('SIN_ORDEN'); setActiveOrderId(null); setIsAddingDirectInvoice(false); }}
          >
            Facturación Directa (Sin Orden) ({sinOrdenFacturas.length})
          </button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {/* TAB: OC or OS */}
          {activeTab !== 'SIN_ORDEN' && (
            <>
              {/* Form to add a new order */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr)) auto', gap: '12px', marginBottom: '20px', background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '12px' }}>Número {activeTab}</label>
                  <input
                    type="text"
                    placeholder={`Ej: ${activeTab}-123`}
                    value={newOrder.numero}
                    onChange={e => setNewOrder({ ...newOrder, numero: e.target.value })}
                    className="form-control"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '12px' }}>Fecha</label>
                  <input
                    type="date"
                    value={newOrder.fecha}
                    onChange={e => setNewOrder({ ...newOrder, fecha: e.target.value })}
                    className="form-control"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '12px' }}>Condición Pago</label>
                  <input
                    type="text"
                    placeholder="Ej: 50-50, 30 días"
                    value={newOrder.condicion}
                    onChange={e => setNewOrder({ ...newOrder, condicion: e.target.value })}
                    className="form-control"
                  />
                </div>
                <div>
                  <button className="btn-primary" style={{ padding: '9px 16px', height: '40px', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={handleAddOrder}>
                    <Plus size={16} /> Agregar {activeTab}
                  </button>
                </div>
              </div>

              {/* List of orders */}
              {currentOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', background: '#fafafa', borderRadius: '10px', border: '1px dashed #cbd5e1' }}>
                  No hay {activeTab === 'OC' ? 'Órdenes de Compra' : 'Órdenes de Servicio'} registradas en este proyecto.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {currentOrders.map(order => {
                    const facturas = facturasCliente.filter(
                      f => f.proyectoId === proyecto.id && f.tipoOrden === activeTab && f.numeroOrden === order.numero
                    );

                    return (
                      <div key={order.id} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                          <div>
                            <h4 style={{ margin: 0, color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {order.numero}
                              <span style={{ fontSize: '11px', background: 'rgba(124, 58, 237, 0.08)', color: 'var(--accent-primary)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                                {order.condicion || 'Sin condición'}
                              </span>
                            </h4>
                            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>Generada: {order.fecha || 'Sin fecha'}</p>
                          </div>
                          <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteOrder(order.id)} title="Eliminar orden">
                            <Trash2 size={16} />
                          </button>
                        </div>

                        {facturas.length > 0 && (
                          <div style={{ overflowX: 'auto', marginBottom: '14px' }}>
                            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', background: '#f8fafc' }}>
                                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Factura</th>
                                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Fecha</th>
                                  <th style={{ textAlign: 'center', padding: '6px 8px' }}>% Fact.</th>
                                  <th style={{ textAlign: 'center', padding: '6px 8px' }}>Días Pago</th>
                                  <th style={{ textAlign: 'right', padding: '6px 8px' }}>Monto (s/IGV)</th>
                                  <th style={{ textAlign: 'right', padding: '6px 8px' }}>Total (c/IGV)</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody>
                                {facturas.map(f => (
                                  <tr key={f.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                                    <td style={{ padding: '8px', fontWeight: '600' }}>{f.numeroFactura}</td>
                                    <td style={{ padding: '8px' }}>{f.fechaEmision}</td>
                                    <td style={{ padding: '8px', textAlign: 'center' }}>
                                      <span style={{ fontSize: '10px', background: 'rgba(124, 58, 237, 0.1)', color: 'var(--accent-primary)', padding: '2px 6px', borderRadius: '8px', fontWeight: 700 }}>
                                        {f.porcentajeFacturacion || 100}%
                                      </span>
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'center' }}>{f.diasPago}</td>
                                    <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(f.montoSinIgv)}</td>
                                    <td style={{ padding: '8px', textAlign: 'right', color: 'var(--success)', fontWeight: 'bold' }}>{formatCurrency(f.montoConIgv)}</td>
                                    <td style={{ padding: '8px', textAlign: 'right' }}>
                                      <button className="btn-icon" onClick={() => deleteFacturaCliente(f.id)} title="Eliminar Factura">
                                        <Trash2 size={14} color="var(--danger)" />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {activeOrderId === order.id ? (
                          renderInvoiceForm(order)
                        ) : (
                          <button
                            className="btn-secondary"
                            style={{ fontSize: '12px', padding: '6px 12px' }}
                            onClick={() => openInvoiceForm(order.id)}
                          >
                            <Plus size={14} /> Registrar Factura bajo esta orden
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* TAB: FACTURACIÓN DIRECTA (SIN ORDEN) */}
          {activeTab === 'SIN_ORDEN' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#f8fafc',
                padding: '14px 18px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div>
                  <h4 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={18} color="var(--accent-primary)" />
                    Facturación Directa sin OC / OS
                  </h4>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                    Para proyectos que no requieren OC/OS previa o emiten facturas directamente según porcentaje (50/50, 100%, etc.)
                  </p>
                </div>
                {!isAddingDirectInvoice && (
                  <button
                    className="btn-primary"
                    style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => openInvoiceForm(null)}
                  >
                    <Plus size={16} /> Emitir Factura Directa
                  </button>
                )}
              </div>

              {isAddingDirectInvoice && renderInvoiceForm(null)}

              {/* Invoices list */}
              {sinOrdenFacturas.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', background: '#fafafa', borderRadius: '10px', border: '1px dashed #cbd5e1' }}>
                  No hay facturas directas (sin orden) registradas para este proyecto.
                </div>
              ) : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px', background: '#fff' }}>
                  <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', background: '#f8fafc' }}>
                        <th style={{ textAlign: 'left', padding: '10px 12px' }}>N° Factura</th>
                        <th style={{ textAlign: 'left', padding: '10px 12px' }}>Fecha Emisión</th>
                        <th style={{ textAlign: 'center', padding: '10px 12px' }}>% Facturación</th>
                        <th style={{ textAlign: 'center', padding: '10px 12px' }}>Días Crédito</th>
                        <th style={{ textAlign: 'right', padding: '10px 12px' }}>Monto (s/IGV)</th>
                        <th style={{ textAlign: 'right', padding: '10px 12px' }}>Total (c/IGV)</th>
                        <th style={{ textAlign: 'center', padding: '10px 12px' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sinOrdenFacturas.map(f => (
                        <tr key={f.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                          <td style={{ padding: '10px 12px', fontWeight: '600', color: 'var(--accent-primary)' }}>{f.numeroFactura}</td>
                          <td style={{ padding: '10px 12px' }}>{f.fechaEmision}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <span style={{ fontSize: '11px', background: 'rgba(124, 58, 237, 0.1)', color: 'var(--accent-primary)', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                              {f.porcentajeFacturacion || 100}%
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>{f.diasPago} días</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatCurrency(f.montoSinIgv)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--success)', fontWeight: 'bold' }}>{formatCurrency(f.montoConIgv)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <button className="btn-icon" onClick={() => deleteFacturaCliente(f.id)} title="Eliminar Factura">
                              <Trash2 size={15} color="var(--danger)" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>, document.body
  );
};
