import React, { useState, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, Upload, CheckCircle, FileText, Loader2, Percent } from 'lucide-react';
import { useGlobalContext, API_URL } from '../context/GlobalContext';
import type { FacturaCliente } from '../types/models';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface OrderItem {
  id: string;
  tipo: 'OC' | 'OS';
  numero: string;
  fecha?: string;
  condicion?: string;
}

export const CreateFacturaModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { clientes, proyectos, facturasCliente, addFacturaCliente, token } = useGlobalContext();

  const [selectedClienteId, setSelectedClienteId] = useState('');
  const [selectedProyectoId, setSelectedProyectoId] = useState('');
  
  // Order selection mode: 'none' (Sin Orden), 'existing-[id]', or 'custom'
  const [orderSelectionMode, setOrderSelectionMode] = useState<string>('none');
  const [tipoOrden, setTipoOrden] = useState<'OC' | 'OS' | 'Sin Orden'>('Sin Orden');
  const [numeroOrden, setNumeroOrden] = useState('-');
  const [condicionPago, setCondicionPago] = useState('30 días');

  const [numeroFactura, setNumeroFactura] = useState('');
  const [fechaEmision, setFechaEmision] = useState(new Date().toISOString().split('T')[0]);
  const [diasPago, setDiasPago] = useState(30);

  // Billing percentage & amounts
  const [porcentajeFacturacion, setPorcentajeFacturacion] = useState<number>(100);
  const [montoSinIgv, setMontoSinIgv] = useState<number>(0);
  const [aplicaDetraccion, setAplicaDetraccion] = useState(false);
  const [aplicaRetencion, setAplicaRetencion] = useState(false);

  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedProyecto = useMemo(() => {
    return proyectos.find(p => p.id === selectedProyectoId);
  }, [selectedProyectoId, proyectos]);

  const subtotalProyecto = Number(selectedProyecto?.subtotal || 0);

  // Parse existing orders (OC / OS) from the project
  const projectOrders = useMemo<OrderItem[]>(() => {
    if (!selectedProyecto) return [];
    
    const parseOrders = (jsonStr?: string, defaultTipo: 'OC' | 'OS' = 'OC'): OrderItem[] => {
      if (!jsonStr) return [];
      try {
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) {
          return parsed.map((item: any, idx: number) => ({
            id: item.id || `ord-${defaultTipo}-${idx}-${Math.random()}`,
            tipo: item.tipo || defaultTipo,
            numero: typeof item === 'string' ? item : (item.numero || ''),
            fecha: item.fecha || '',
            condicion: item.condicion || ''
          })).filter(o => o.numero && o.numero !== '-');
        }
        if (typeof parsed === 'string' && parsed !== '-') {
          return [{ id: `ord-${defaultTipo}-${Math.random()}`, tipo: defaultTipo, numero: parsed, fecha: '', condicion: '' }];
        }
      } catch {
        const str = String(jsonStr).trim();
        if (str && str !== '-') {
          return str.split('/').map((s, idx) => ({
            id: `ord-${defaultTipo}-${idx}-${Math.random()}`,
            tipo: defaultTipo,
            numero: s.trim(),
            fecha: '',
            condicion: ''
          })).filter(o => o.numero);
        }
      }
      return [];
    };

    const ocs = parseOrders(selectedProyecto.ordenesCompra, 'OC');
    const oss = parseOrders(selectedProyecto.ordenesServicio, 'OS');
    return [...ocs, ...oss];
  }, [selectedProyecto]);

  // Existing invoices for the selected project
  const projectInvoices = useMemo(() => {
    if (!selectedProyectoId) return [];
    return (facturasCliente || []).filter(f => f && f.proyectoId === selectedProyectoId);
  }, [selectedProyectoId, facturasCliente]);

  const totalFacturadoSinIgv = useMemo(() => {
    return projectInvoices.reduce((acc, f) => acc + (Number(f.montoSinIgv) || 0), 0);
  }, [projectInvoices]);

  const saldoPendienteSinIgv = Math.max(0, subtotalProyecto - totalFacturadoSinIgv);
  const totalFacturadoPct = subtotalProyecto > 0 ? Number(((totalFacturadoSinIgv / subtotalProyecto) * 100).toFixed(1)) : 0;
  const saldoPendientePct = subtotalProyecto > 0 ? Math.max(0, Number((100 - totalFacturadoPct).toFixed(1))) : 0;

  // Sync project selection
  useEffect(() => {
    if (!selectedProyectoId) {
      setOrderSelectionMode('none');
      setTipoOrden('Sin Orden');
      setNumeroOrden('-');
      setMontoSinIgv(0);
      setPorcentajeFacturacion(100);
      return;
    }

    if (selectedProyecto) {
      const sub = Number(selectedProyecto.subtotal || 0);
      const invoices = (facturasCliente || []).filter(f => f && f.proyectoId === selectedProyecto.id);
      const billed = invoices.reduce((acc, f) => acc + (Number(f.montoSinIgv) || 0), 0);
      const remainingPct = sub > 0 ? Math.max(0, Number((100 - ((billed / sub) * 100)).toFixed(1))) : 100;
      
      const defaultPct = (remainingPct > 0 && remainingPct < 100) ? remainingPct : 100;
      setPorcentajeFacturacion(defaultPct);
      setMontoSinIgv(Number(((sub * defaultPct) / 100).toFixed(2)));

      // Auto-select order if project has exactly 1 order, else 'none'
      if (projectOrders.length === 1) {
        setOrderSelectionMode(`existing-${projectOrders[0].id}`);
        setTipoOrden(projectOrders[0].tipo);
        setNumeroOrden(projectOrders[0].numero);
        if (projectOrders[0].condicion) setCondicionPago(projectOrders[0].condicion);
      } else {
        setOrderSelectionMode('none');
        setTipoOrden('Sin Orden');
        setNumeroOrden('-');
      }
    }
  }, [selectedProyectoId, selectedProyecto, projectOrders]);

  if (!isOpen) return null;

  const filteredProyectos = proyectos.filter(p => p.clienteId === selectedClienteId);

  const igv = montoSinIgv * 0.18;
  const montoConIgv = montoSinIgv + igv;

  const handlePorcentajeChange = (pct: number) => {
    setPorcentajeFacturacion(pct);
    if (subtotalProyecto > 0) {
      const calculatedMonto = Number(((subtotalProyecto * pct) / 100).toFixed(2));
      setMontoSinIgv(calculatedMonto);
    }
  };

  const handleMontoSinIgvChange = (val: number) => {
    setMontoSinIgv(val);
    if (subtotalProyecto > 0) {
      const calculatedPct = Number(((val / subtotalProyecto) * 100).toFixed(1));
      setPorcentajeFacturacion(calculatedPct);
    }
  };

  const handleOrderSelectionModeChange = (mode: string) => {
    setOrderSelectionMode(mode);
    if (mode === 'none') {
      setTipoOrden('Sin Orden');
      setNumeroOrden('-');
    } else if (mode.startsWith('existing-')) {
      const ordId = mode.replace('existing-', '');
      const found = projectOrders.find(o => o.id === ordId);
      if (found) {
        setTipoOrden(found.tipo);
        setNumeroOrden(found.numero);
        if (found.condicion) setCondicionPago(found.condicion);
      }
    } else if (mode === 'custom') {
      setTipoOrden('OC');
      setNumeroOrden('');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setInvoiceFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProyectoId || !numeroFactura.trim() || montoSinIgv <= 0) {
      toast.error('Por favor complete los campos requeridos (Proyecto, N° Factura y Monto).');
      return;
    }

    setIsSubmitting(true);
    try {
      let comprobanteUrl = '';
      if (invoiceFile) {
        const formData = new FormData();
        formData.append('file', invoiceFile);
        if (selectedProyectoId) formData.append('projectId', selectedProyectoId);
        formData.append('area', 'Cuentas');
        formData.append('subfolder', 'Cotización Cliente');

        const uploadRes = await fetch(`${API_URL}/drive/upload`, {
          method: 'POST',
          headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
          body: formData
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          comprobanteUrl = uploadData.webViewLink || uploadData.webContentLink || uploadData.url || '';
        }
      }

      const finalNumeroOrden = (numeroOrden && numeroOrden.trim()) ? numeroOrden.trim() : '-';

      const newFactura: Partial<FacturaCliente> = {
        proyectoId: selectedProyectoId,
        tipoOrden: tipoOrden || 'Sin Orden',
        numeroOrden: finalNumeroOrden,
        fechaGeneracionOrden: new Date().toISOString().split('T')[0],
        condicionPago: condicionPago || '30 días',
        numeroFactura: numeroFactura.trim(),
        fechaEmision,
        diasPago: Number(diasPago) || 30,
        porcentajeFacturacion: Number(porcentajeFacturacion) || 100,
        montoSinIgv: Number(montoSinIgv),
        igv: Number(igv.toFixed(2)),
        montoConIgv: Number(montoConIgv.toFixed(2)),
        aplicaDetraccion,
        aplicaRetencion,
        importeRecibido: 0,
        fechaPago: null,
        pagoImpuestos: false,
        estado: 'Pendiente',
        comprobanteUrl: comprobanteUrl || undefined
      };

      await addFacturaCliente(newFactura);
      toast.success(`Factura ${numeroFactura} registrada exitosamente (${porcentajeFacturacion}%).`);
      handleClose();
    } catch (err: any) {
      console.error(err);
      toast.error('Error al registrar factura: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setSelectedClienteId('');
    setSelectedProyectoId('');
    setOrderSelectionMode('none');
    setTipoOrden('Sin Orden');
    setNumeroOrden('-');
    setNumeroFactura('');
    setPorcentajeFacturacion(100);
    setMontoSinIgv(0);
    setAplicaDetraccion(false);
    setAplicaRetencion(false);
    setInvoiceFile(null);
    onClose();
  };

  const formatCurrency = (val: number) => 'S/ ' + Number(val || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return ReactDOM.createPortal(
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '760px', width: '100%', boxSizing: 'border-box' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={22} color="var(--accent-primary)" />
            <h2 className="modal-title">Emitir / Registrar Factura a Cliente</h2>
          </div>
          <button className="btn-icon" onClick={handleClose} disabled={isSubmitting}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {/* Cliente y Proyecto */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
            <div className="form-group">
              <label>Cliente *</label>
              <select
                className="form-control"
                value={selectedClienteId}
                onChange={e => {
                  setSelectedClienteId(e.target.value);
                  setSelectedProyectoId('');
                }}
                required
              >
                <option value="">-- Seleccionar Cliente --</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.empresa}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Proyecto *</label>
              <select
                className="form-control"
                value={selectedProyectoId}
                onChange={e => setSelectedProyectoId(e.target.value)}
                required
                disabled={!selectedClienteId}
              >
                <option value="">-- Seleccionar Proyecto --</option>
                {filteredProyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
          </div>

          {/* Estado Financiero del Proyecto Seleccionado */}
          {selectedProyecto && (
            <div style={{
              background: 'rgba(124, 58, 237, 0.04)',
              border: '1px solid rgba(124, 58, 237, 0.18)',
              borderRadius: '10px',
              padding: '12px 16px',
              marginTop: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Proyecto: {selectedProyecto.nombre}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {projectOrders.length} orden(es) registrada(s) | {projectInvoices.length} factura(s) previa(s)
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px', paddingTop: '6px', borderTop: '1px dashed rgba(124, 58, 237, 0.15)' }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Subtotal Presupuestado</span>
                  <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{formatCurrency(subtotalProyecto)}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Facturado a la fecha ({totalFacturadoPct}%)</span>
                  <strong style={{ fontSize: '13px', color: '#16a34a' }}>{formatCurrency(totalFacturadoSinIgv)}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Saldo Pendiente ({saldoPendientePct}%)</span>
                  <strong style={{ fontSize: '13px', color: saldoPendienteSinIgv > 0 ? '#ea580c' : '#64748b' }}>
                    {formatCurrency(saldoPendienteSinIgv)}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Vínculo con Orden (OC / OS) */}
          <div style={{ marginTop: '16px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
              Vínculo con Orden del Cliente (OC / OS)
            </label>
            <select
              className="form-control"
              value={orderSelectionMode}
              onChange={e => handleOrderSelectionModeChange(e.target.value)}
              disabled={!selectedProyectoId}
            >
              <option value="none">Sin Orden (Facturación directa / Sin OC ni OS)</option>
              {projectOrders.length > 0 && (
                <optgroup label="Órdenes registradas en este proyecto">
                  {projectOrders.map(ord => (
                    <option key={ord.id} value={`existing-${ord.id}`}>
                      [{ord.tipo}] {ord.numero} {ord.condicion ? `(${ord.condicion})` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value="custom">+ Registrar / Ingresar otra orden distinta...</option>
            </select>

            {orderSelectionMode === 'none' && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                background: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                fontSize: '12px',
                color: '#64748b',
                marginTop: '8px'
              }}>
                <FileText size={14} color="#7c3aed" />
                <span>Esta factura no estará atada a ninguna OC/OS específica (Facturación directa o proyecto sin orden).</span>
              </div>
            )}

            {orderSelectionMode === 'custom' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px', marginTop: '10px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '12px' }}>Tipo de Orden</label>
                  <select className="form-control" value={tipoOrden} onChange={e => setTipoOrden(e.target.value as any)}>
                    <option value="OC">Orden de Compra (OC)</option>
                    <option value="OS">Orden de Servicio (OS)</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '12px' }}>N° de Orden del Cliente *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej: OC-2024-001"
                    value={numeroOrden === '-' ? '' : numeroOrden}
                    onChange={e => setNumeroOrden(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '12px' }}>Condición de Pago</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej: 30 días, 50/50"
                    value={condicionPago}
                    onChange={e => setCondicionPago(e.target.value)}
                  />
                </div>
              </div>
            )}

            {orderSelectionMode.startsWith('existing-') && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px', marginTop: '10px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '12px' }}>Orden Seleccionada</label>
                  <input
                    type="text"
                    className="form-control"
                    value={`${tipoOrden}: ${numeroOrden}`}
                    readOnly
                    style={{ background: '#f8fafc', fontWeight: 600, color: 'var(--accent-primary)' }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '12px' }}>Condición de Pago</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej: 30 días, 50/50"
                    value={condicionPago}
                    onChange={e => setCondicionPago(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Datos de Factura: Número, Fecha, Días */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px', marginTop: '16px' }}>
            <div className="form-group">
              <label>Número de Factura *</label>
              <input
                type="text"
                className="form-control"
                placeholder="Ej: F001-000123"
                value={numeroFactura}
                onChange={e => setNumeroFactura(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Fecha de Emisión *</label>
              <input
                type="date"
                className="form-control"
                value={fechaEmision}
                onChange={e => setFechaEmision(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Días de Crédito *</label>
              <input
                type="number"
                className="form-control"
                value={diasPago}
                onChange={e => setDiasPago(Number(e.target.value))}
                min="0"
                required
              />
            </div>
          </div>

          {/* Porcentaje e Importes */}
          <div style={{ background: 'rgba(124, 58, 237, 0.03)', border: '1px solid rgba(124, 58, 237, 0.18)', borderRadius: '12px', padding: '16px', marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Percent size={16} color="var(--accent-primary)" />
                <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                  Porcentaje de Facturación e Importes
                </span>
              </div>
              {/* Presets */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Frecuentes:</span>
                <button
                  type="button"
                  onClick={() => handlePorcentajeChange(50)}
                  style={{
                    padding: '3px 10px',
                    fontSize: '11px',
                    borderRadius: '12px',
                    border: '1px solid var(--accent-primary)',
                    background: porcentajeFacturacion === 50 ? 'var(--accent-primary)' : 'transparent',
                    color: porcentajeFacturacion === 50 ? '#fff' : 'var(--accent-primary)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    transition: 'all 0.15s ease'
                  }}
                >
                  50% (50/50)
                </button>
                <button
                  type="button"
                  onClick={() => handlePorcentajeChange(100)}
                  style={{
                    padding: '3px 10px',
                    fontSize: '11px',
                    borderRadius: '12px',
                    border: '1px solid var(--accent-primary)',
                    background: porcentajeFacturacion === 100 ? 'var(--accent-primary)' : 'transparent',
                    color: porcentajeFacturacion === 100 ? '#fff' : 'var(--accent-primary)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    transition: 'all 0.15s ease'
                  }}
                >
                  100% (Total)
                </button>
                <button
                  type="button"
                  onClick={() => handlePorcentajeChange(30)}
                  style={{
                    padding: '3px 8px',
                    fontSize: '11px',
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1',
                    background: porcentajeFacturacion === 30 ? 'var(--accent-primary)' : '#fff',
                    color: porcentajeFacturacion === 30 ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontWeight: 500
                  }}
                >
                  30%
                </button>
                <button
                  type="button"
                  onClick={() => handlePorcentajeChange(40)}
                  style={{
                    padding: '3px 8px',
                    fontSize: '11px',
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1',
                    background: porcentajeFacturacion === 40 ? 'var(--accent-primary)' : '#fff',
                    color: porcentajeFacturacion === 40 ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontWeight: 500
                  }}
                >
                  40%
                </button>
                {saldoPendientePct > 0 && saldoPendientePct < 100 && (
                  <button
                    type="button"
                    onClick={() => handlePorcentajeChange(saldoPendientePct)}
                    style={{
                      padding: '3px 10px',
                      fontSize: '11px',
                      borderRadius: '12px',
                      border: '1px solid #ea580c',
                      background: porcentajeFacturacion === saldoPendientePct ? '#ea580c' : 'rgba(234, 88, 12, 0.08)',
                      color: porcentajeFacturacion === saldoPendientePct ? '#fff' : '#ea580c',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    Saldo Restante ({saldoPendientePct}%)
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '120px repeat(3, minmax(0, 1fr))', gap: '14px' }}>
              <div className="form-group">
                <label style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '12px' }}>% Facturación *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="100"
                    className="form-control"
                    value={porcentajeFacturacion || ''}
                    onChange={e => handlePorcentajeChange(parseFloat(e.target.value) || 0)}
                    required
                    style={{ fontWeight: 700, color: 'var(--accent-primary)', paddingRight: '26px' }}
                  />
                  <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600 }}>
                    %
                  </span>
                </div>
              </div>

              <div className="form-group">
                <label style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '12px' }}>Monto sin IGV (S/) *</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  placeholder="0.00"
                  value={montoSinIgv || ''}
                  onChange={e => handleMontoSinIgvChange(parseFloat(e.target.value) || 0)}
                  required
                />
              </div>

              <div className="form-group">
                <label style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '12px' }}>IGV 18% (S/)</label>
                <input
                  type="text"
                  className="form-control"
                  value={igv.toFixed(2)}
                  readOnly
                  style={{ fontWeight: 600, background: '#f8fafc' }}
                />
              </div>

              <div className="form-group">
                <label style={{ fontWeight: 600, color: 'var(--accent-primary)', fontSize: '12px' }}>Total con IGV (S/)</label>
                <input
                  type="text"
                  className="form-control"
                  value={montoConIgv.toFixed(2)}
                  readOnly
                  style={{ fontWeight: 700, color: 'var(--accent-primary)', fontSize: '1.05rem', background: '#f8fafc' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '24px', marginTop: '14px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', userSelect: 'none', color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                  checked={aplicaDetraccion}
                  onChange={e => {
                    setAplicaDetraccion(e.target.checked);
                    if (e.target.checked) setAplicaRetencion(false);
                  }}
                />
                <span>Aplica Detracción (12%) = <strong>S/ {(montoConIgv * 0.12).toFixed(2)}</strong></span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', userSelect: 'none', color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                  checked={aplicaRetencion}
                  onChange={e => {
                    setAplicaRetencion(e.target.checked);
                    if (e.target.checked) setAplicaDetraccion(false);
                  }}
                />
                <span>Aplica Retención (3%) = <strong>S/ {(montoConIgv * 0.03).toFixed(2)}</strong></span>
              </label>
            </div>
          </div>

          {/* Adjuntar PDF */}
          <div className="form-group" style={{ marginTop: '16px' }}>
            <label>Adjuntar Factura PDF / Comprobante Electrónico</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{
                flex: 1,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '10px',
                padding: '14px',
                background: '#f8fafc',
                border: '1.5px dashed #cbd5e1',
                borderRadius: '8px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease'
              }}>
                <input
                  type="file"
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                  accept=".pdf,image/*,.xml"
                  disabled={isSubmitting}
                />
                <Upload size={18} color="var(--accent-primary)" />
                <span style={{ fontSize: '13px', color: invoiceFile ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: invoiceFile ? 600 : 400 }}>
                  {invoiceFile ? invoiceFile.name : 'Subir Archivo de Factura (PDF / Imagen / XML)'}
                </span>
              </label>
              {invoiceFile && !isSubmitting && <CheckCircle size={22} color="var(--success)" />}
            </div>
          </div>

          <div className="modal-footer" style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn-secondary" onClick={handleClose} disabled={isSubmitting}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting || !selectedProyectoId || !numeroFactura}>
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Registrando Factura...
                </>
              ) : (
                `Registrar Factura (${porcentajeFacturacion || 100}%)`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
