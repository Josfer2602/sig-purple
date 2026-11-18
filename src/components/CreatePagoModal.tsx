import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { X, Upload, FileText, CheckCircle, AlertTriangle, Loader2, Sparkles, Info } from 'lucide-react';
import { useGlobalContext, API_URL } from '../context/GlobalContext';
import { generateItemsTitle } from '../utils/orderTitleHelper';
import {
  parsePorcentajeAdelanto,
  isProveedorReciboPorHonorarios,
  isComprobanteSinDetraccion,
  resolveEffectiveDetraccion
} from '../utils/ordenPaymentHelper';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface AnalysisResult {
  rucEmisor?: string | null;
  razonSocialEmisor?: string | null;
  tipoComprobante?: string | null;
  numeroComprobante?: string | null;
  fechaEmision?: string | null;
  moneda?: string | null;
  montoTotal?: number;
  montoSubtotal?: number;
  igv?: number;
  retencion?: number;
  montoNeto?: number;
  montoSugerido?: number;
  descripcion?: string | null;
  rucMatch?: boolean | null;
  proveedorDetectado?: { id: string; razonSocial: string; ruc: string } | null;
}

export const CreatePagoModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { clientes, proyectos, quotes, ordenes, proveedores, pagos, addPago } = useGlobalContext();

  const [selectedClienteId, setSelectedClienteId] = useState('');
  const [selectedProyectoId, setSelectedProyectoId] = useState('');
  const [selectedQuoteId, setSelectedQuoteId] = useState('');
  const [selectedOrdenId, setSelectedOrdenId] = useState('');

  const [concepto, setConcepto] = useState('');
  const [comentarios, setComentarios] = useState('');
  const [tipoPago, setTipoPago] = useState<'Adelanto' | 'Restante' | 'Total' | ''>('');
  const [numeroComprobante, setNumeroComprobante] = useState('');
  const [comprobantePendiente, setComprobantePendiente] = useState(false);
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null);
  const [monto, setMonto] = useState(0);
  const [calculatedOrderMonto, setCalculatedOrderMonto] = useState(0);
  const [aplicaDetraccion, setAplicaDetraccion] = useState<boolean>(false);
  const [porcentajeDetraccion, setPorcentajeDetraccion] = useState<number>(12);
  const [isAnalyzingComprobante, setIsAnalyzingComprobante] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState('');

  // Filtros en cascada: solo clientes y proyectos con órdenes
  const eligibleClientes = useMemo(() => {
    return clientes.filter(c => {
      const clientProys = proyectos.filter(p => p.clienteId === c.id);
      return clientProys.some(p => ordenes.some(o => o.proyectoId === p.id));
    });
  }, [clientes, proyectos, ordenes]);

  const filteredProyectos = useMemo(() => {
    if (!selectedClienteId) return [];
    return proyectos.filter(p => p.clienteId === selectedClienteId && ordenes.some(o => o.proyectoId === p.id));
  }, [proyectos, selectedClienteId, ordenes]);

  const filteredQuotes = useMemo(() => {
    if (!selectedProyectoId) return [];
    return quotes.filter(q => {
      const s = (q.status || '').toLowerCase();
      return q.projectId === selectedProyectoId && (s.includes('aprob') || s.includes('liquid')) && ordenes.some(o => o.quoteId === q.id);
    });
  }, [quotes, selectedProyectoId, ordenes]);

  const filteredOrdenes = useMemo(() => {
    return ordenes.filter(o =>
      o.clienteId === selectedClienteId &&
      o.proyectoId === selectedProyectoId &&
      o.quoteId === selectedQuoteId
    );
  }, [ordenes, selectedClienteId, selectedProyectoId, selectedQuoteId]);

  // Auto-seleccionar cotización aprobada si solo hay 1
  useEffect(() => {
    if (selectedProyectoId && !selectedQuoteId) {
      if (filteredQuotes.length === 1) {
        setSelectedQuoteId(filteredQuotes[0].id);
      }
    }
  }, [selectedProyectoId, selectedQuoteId, filteredQuotes]);

  // Auto-seleccionar orden si solo hay 1
  useEffect(() => {
    if (selectedQuoteId && !selectedOrdenId) {
      if (filteredOrdenes.length === 1) {
        setSelectedOrdenId(filteredOrdenes[0].id);
      }
    }
  }, [selectedQuoteId, selectedOrdenId, filteredOrdenes]);

  const selectedOrden = ordenes.find(o => o.id === selectedOrdenId);
  const selectedProveedor = selectedOrden ? proveedores.find(p => p.id === selectedOrden.proveedorId) : undefined;

  const calculatePaymentDate = () => {
    let date = new Date();
    let addedDays = 0;
    while (addedDays < 2) {
      date.setDate(date.getDate() + 1);
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        addedDays++;
      }
    }
    return date.toISOString().split('T')[0];
  };

  const cleanDocRuc = (analysisResult?.rucEmisor || '').replace(/\D/g, '');
  const cleanProvRuc = (selectedProveedor?.ruc || '').replace(/\D/g, '');

  const rucVerification = useMemo(() => {
    if (!analysisResult || !cleanDocRuc) return null;
    if (!selectedProveedor) {
      return {
        status: 'no_order' as const,
        message: `RUC del comprobante: ${analysisResult.rucEmisor} (${analysisResult.razonSocialEmisor || 'Emisor detectado'}).`
      };
    }
    if (!cleanProvRuc) {
      return {
        status: 'no_prov_ruc' as const,
        message: `RUC en comprobante: ${analysisResult.rucEmisor} (${analysisResult.razonSocialEmisor || 'Emisor'}). El proveedor registrado (${selectedProveedor.razonSocial}) no tiene RUC en su ficha.`
      };
    }
    if (cleanDocRuc === cleanProvRuc) {
      return {
        status: 'match' as const,
        message: `El RUC del comprobante (${analysisResult.rucEmisor}) coincide con el proveedor de la orden (${selectedProveedor.razonSocial}).`
      };
    }
    return {
      status: 'mismatch' as const,
      message: `El RUC del comprobante (${analysisResult.rucEmisor} - ${analysisResult.razonSocialEmisor || 'Emisor'}) NO coincide con el proveedor de la orden (${selectedProveedor.ruc} - ${selectedProveedor.razonSocial}).`
    };
  }, [analysisResult, cleanDocRuc, selectedProveedor, cleanProvRuc]);

  const isOrdenServicio = Boolean(
    selectedOrden && (selectedOrden.tipoOrden === 'Servicio' || selectedOrden.id.startsWith('OS-'))
  );

  const isComprobanteSinSpot = useMemo(() => {
    return (
      isProveedorReciboPorHonorarios(selectedProveedor) ||
      isComprobanteSinDetraccion(analysisResult?.tipoComprobante)
    );
  }, [selectedProveedor, analysisResult?.tipoComprobante]);

  const cuentaDetraccionBN = useMemo(() => {
    return selectedProveedor?.cuentas?.find(c => 
      c.banco.toLowerCase().includes('nación') || 
      c.banco.toLowerCase().includes('nacion') || 
      (c.tipoCuenta || '').toLowerCase().includes('detracc')
    );
  }, [selectedProveedor]);

  const detraccionCalculada = useMemo(() => {
    if (!isOrdenServicio || !aplicaDetraccion || !selectedOrden || isComprobanteSinSpot) return 0;
    return Math.round((Number(selectedOrden.total) * (porcentajeDetraccion / 100)) * 100) / 100;
  }, [isOrdenServicio, aplicaDetraccion, selectedOrden, porcentajeDetraccion, isComprobanteSinSpot]);

  const netoCalculado = useMemo(() => {
    if (!selectedOrden) return 0;
    return Math.max(0, Math.round((Number(selectedOrden.total) - detraccionCalculada) * 100) / 100);
  }, [selectedOrden, detraccionCalculada]);

  useEffect(() => {
    if (!selectedOrden) {
      setMonto(0);
      setCalculatedOrderMonto(0);
      setTipoPago('');
      setConcepto('');
      setIsLocked(false);
      setLockMessage('');
      setAplicaDetraccion(false);
      return;
    }

    setConcepto(selectedOrden.titulo || generateItemsTitle(selectedOrden.items) || '');
    
    const total = selectedOrden.total;
    const cond = selectedOrden.condicionesPago || '';
    const pagosValidos = pagos.filter(p => p.ordenId === selectedOrdenId && p.estado !== 'Anulado');
    const sumaPagos = pagosValidos.reduce((sum, p) => sum + p.monto, 0);
    
    if (sumaPagos >= total) {
      setIsLocked(true);
      setLockMessage('Esta orden ya ha sido pagada en su totalidad.');
      setMonto(0);
      setCalculatedOrderMonto(0);
      setTipoPago('');
      return;
    }
    
    setIsLocked(false);
    setLockMessage('');

    // Detección automática de detracción para Órdenes de Servicio (OS)
    const isOS = selectedOrden.tipoOrden === 'Servicio' || selectedOrden.id.startsWith('OS-');
    const provSelected = proveedores.find(p => p.id === selectedOrden.proveedorId);
    const sinDetrPorDoc =
      isProveedorReciboPorHonorarios(provSelected) ||
      isComprobanteSinDetraccion(analysisResult?.tipoComprobante);
    let hasDetr = false;
    let pctDetr = 12;
    if (isOS && !sinDetrPorDoc) {
      if (selectedOrden.aplicaDetraccion !== undefined && selectedOrden.aplicaDetraccion !== null) {
        hasDetr = resolveEffectiveDetraccion({
          aplicaDetraccion: selectedOrden.aplicaDetraccion,
          porcentajeDetraccion: selectedOrden.porcentajeDetraccion,
          isServicio: true,
          proveedorTipoDocumento: provSelected?.tipoDocumento,
          comprobanteTipo: analysisResult?.tipoComprobante
        });
        pctDetr = hasDetr ? (selectedOrden.porcentajeDetraccion || 12) : 12;
      } else {
        // En SUNAT Anexo 3, servicios con Factura > S/ 700 suelen aplicar detracción
        hasDetr = total > 700;
        pctDetr = 12;
      }
    }
    setAplicaDetraccion(hasDetr);
    setPorcentajeDetraccion(pctDetr);

    const detrAmt = hasDetr ? Math.round((total * (pctDetr / 100)) * 100) / 100 : 0;
    const netoAmt = Math.max(0, Math.round((total - detrAmt) * 100) / 100);
    
    let suggested = 0;
    if (sumaPagos === 0) {
      const pctRatio = parsePorcentajeAdelanto(cond);
      if (pctRatio >= 1 || pctRatio <= 0) {
        setTipoPago('Total');
        suggested = hasDetr ? netoAmt : total;
      } else {
        setTipoPago('Adelanto');
        suggested = hasDetr 
          ? Number((netoAmt * pctRatio).toFixed(2)) 
          : Number((total * pctRatio).toFixed(2));
      }
    } else {
      setTipoPago('Restante');
      suggested = Number((total - sumaPagos).toFixed(2));
    }
    setCalculatedOrderMonto(suggested);

    // Si no hay comprobante escaneado con monto sugerido, usamos el sugerido de la orden
    if (!analysisResult?.montoSugerido) {
      setMonto(suggested);
    }
  }, [selectedOrden, selectedOrdenId, pagos, proveedores, analysisResult?.tipoComprobante, analysisResult?.montoSugerido]);

  useEffect(() => {
    if (isComprobanteSinSpot && aplicaDetraccion) {
      setAplicaDetraccion(false);
    }
  }, [isComprobanteSinSpot, aplicaDetraccion]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalNumeroComprobante = comprobantePendiente 
      ? (numeroComprobante.trim() || 'POR REGULARIZAR') 
      : numeroComprobante.trim();

    if (!selectedOrden || !tipoPago || !finalNumeroComprobante || monto <= 0) {
      toast.error("Por favor completa todos los campos requeridos correctamente.");
      return;
    }

    if (aplicaDetraccion && isComprobanteSinSpot) {
      toast.error('No corresponde aplicar detracción SPOT a un Recibo por Honorarios o Boleta.');
      setAplicaDetraccion(false);
      return;
    }

    const effectiveDetraccion = resolveEffectiveDetraccion({
      aplicaDetraccion,
      porcentajeDetraccion,
      isServicio: isOrdenServicio,
      proveedorTipoDocumento: selectedProveedor?.tipoDocumento,
      comprobanteTipo: analysisResult?.tipoComprobante
    });

    const clienteObj = clientes.find(c => c.id === selectedClienteId);
    const proyectoObj = proyectos.find(p => p.id === selectedProyectoId);

    const pagoData = {
      id: `PAG-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      clienteId: selectedClienteId,
      clienteNombre: clienteObj?.empresa || 'Cliente_Desconocido',
      proyectoId: selectedProyectoId,
      proyectoNombre: proyectoObj?.nombre || 'Proyecto_Desconocido',
      quoteId: selectedQuoteId,
      ordenId: selectedOrdenId,
      proveedorId: selectedOrden.proveedorId,
      proveedorNombre: selectedProveedor?.razonSocial || 'Proveedor_Desconocido',
      concepto: concepto.trim(),
      comentarios: comentarios.trim(),
      notas: comentarios.trim(),
      tipoPago,
      monto,
      aplicaDetraccion: effectiveDetraccion,
      porcentajeDetraccion: effectiveDetraccion ? porcentajeDetraccion : 0,
      montoDetraccion: effectiveDetraccion ? detraccionCalculada : 0,
      montoNeto: effectiveDetraccion ? netoCalculado : monto,
      numeroComprobante: finalNumeroComprobante,
      fechaRegistro: new Date().toISOString().split('T')[0],
      fechaPago: calculatePaymentDate(),
      estado: 'Pendiente'
    };

    const formData = new FormData();
    formData.append('data', JSON.stringify(pagoData));

    if (comprobanteFile) {
      formData.append('comprobanteFile', comprobanteFile);
    }

    setIsSubmitting(true);
    try {
      await addPago(formData);
      toast.success("Pago registrado y enviado a la Bandeja de Autorización del Directorio.");
      handleClose();
    } catch (err: any) {
      toast.error("Error al registrar el pago: " + (err.message || 'Error desconocido'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setComprobanteFile(file);
      setAnalysisResult(null);
      setIsAnalyzingComprobante(true);

      try {
        const token = localStorage.getItem('token');
        const formData = new FormData();
        formData.append('file', file);
        if (selectedProveedor?.ruc) {
          formData.append('proveedorRuc', selectedProveedor.ruc);
        }
        if (selectedProveedor?.razonSocial) {
          formData.append('proveedorNombre', selectedProveedor.razonSocial);
        }
        if (selectedOrden?.total) {
          formData.append('ordenTotal', String(selectedOrden.total));
        }

        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_URL}/pagos/analyze-comprobante`, {
          method: 'POST',
          headers,
          body: formData
        });

        const resData = await res.json();
        if (!res.ok) {
          throw new Error(resData.error || 'No se pudo analizar el comprobante.');
        }

        if (resData.success && resData.data) {
          const d: AnalysisResult = resData.data;
          setAnalysisResult(d);

          // 0. Validar si el comprobante escaneado es Recibo por Honorarios / Boleta (nunca lleva SPOT)
          const docSinDetraccion = isComprobanteSinDetraccion(d.tipoComprobante);
          if (docSinDetraccion && isOrdenServicio) {
            setAplicaDetraccion(false);
            toast(`📄 ${d.tipoComprobante} detectado: no corresponde detracción SPOT SUNAT.`, { icon: 'ℹ️' });
          }

          // 1. Auto-completar Número de Comprobante
          if (d.numeroComprobante) {
            setNumeroComprobante(d.numeroComprobante);
          }

          // 2. Auto-completar Monto a Pagar
          // Si el pago es un Adelanto y la orden ya calculó una cuota de adelanto (ej. 50%),
          // NO sobreescribimos la cuota con el total de la factura automáticamente.
          const suggestedAmount = d.montoSugerido || d.montoNeto || d.montoTotal;
          if (suggestedAmount && suggestedAmount > 0) {
            if (tipoPago === 'Adelanto' && calculatedOrderMonto > 0 && suggestedAmount > calculatedOrderMonto) {
              setMonto(calculatedOrderMonto);
              toast('💡 Factura emitida por el total. Se mantiene la cuota de adelanto según la orden.', { icon: 'ℹ️' });
            } else {
              setMonto(suggestedAmount);
            }
          } else if (docSinDetraccion && selectedOrden && aplicaDetraccion) {
            if (tipoPago === 'Total') setMonto(selectedOrden.total);
            else if (tipoPago === 'Adelanto') {
              const ratio = parsePorcentajeAdelanto(selectedOrden.condicionesPago);
              setMonto(Number((selectedOrden.total * ratio).toFixed(2)));
            }
          }

          // 3. Notificación de validación de RUC
          const docRucClean = (d.rucEmisor || '').replace(/\D/g, '');
          const provRucClean = (selectedProveedor?.ruc || '').replace(/\D/g, '');

          if (provRucClean && docRucClean) {
            if (provRucClean === docRucClean) {
              toast.success(`✅ RUC verificado: ${d.rucEmisor} coincide con ${selectedProveedor?.razonSocial}`);
            } else {
              toast.error(
                `⚠️ ALERTA: El RUC (${d.rucEmisor} - ${d.razonSocialEmisor || 'Emisor'}) NO coincide con el proveedor seleccionado (${selectedProveedor?.ruc} - ${selectedProveedor?.razonSocial})`,
                { duration: 7000 }
              );
            }
          } else {
            toast.success('Datos extraídos del comprobante con éxito');
          }
        }
      } catch (err: any) {
        console.error('Error al analizar comprobante:', err);
        toast.error('No se pudo extraer información automáticamente: ' + (err.message || 'Error'));
      } finally {
        setIsAnalyzingComprobante(false);
      }
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setSelectedClienteId('');
    setSelectedProyectoId('');
    setSelectedQuoteId('');
    setSelectedOrdenId('');
    setConcepto('');
    setComentarios('');
    setNumeroComprobante('');
    setComprobantePendiente(false);
    setComprobanteFile(null);
    setAnalysisResult(null);
    setIsAnalyzingComprobante(false);
    setMonto(0);
    setCalculatedOrderMonto(0);
    setTipoPago('');
    setIsLocked(false);
    setLockMessage('');
    onClose();
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="modal-overlay">
      {isSubmitting && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ border: '4px solid rgba(255,255,255,0.1)', borderTop: '4px solid var(--accent-primary)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', marginBottom: '16px' }} />
          <h3 style={{ color: 'white', margin: 0 }}>Registrando Solicitud...</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '8px' }}>Guardando pago en el sistema.</p>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      <div className="modal-content" style={{ maxWidth: '800px', width: '100%', maxHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', opacity: isSubmitting ? 0.5 : 1, pointerEvents: isSubmitting ? 'none' : 'auto' }}>
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h2 className="modal-title">Registrar Pago a Proveedor</h2>
          <button className="btn-icon" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          <div className="form-section">
            <h3 className="section-title">Datos de Referencia</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <div className="form-group">
                <label>Cliente *</label>
                <select className="form-control" value={selectedClienteId} onChange={e => {
                  setSelectedClienteId(e.target.value);
                  setSelectedProyectoId('');
                  setSelectedQuoteId('');
                  setSelectedOrdenId('');
                }} required>
                  <option value="">-- Seleccionar --</option>
                  {eligibleClientes.map(c => <option key={c.id} value={c.id}>{c.empresa}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Proyecto *</label>
                <select className="form-control" value={selectedProyectoId} onChange={e => {
                  setSelectedProyectoId(e.target.value);
                  setSelectedQuoteId('');
                  setSelectedOrdenId('');
                }} required disabled={!selectedClienteId}>
                  <option value="">-- Seleccionar --</option>
                  {filteredProyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <div className="form-group">
                <label>Cotización Aprobada *</label>
                <select className="form-control" value={selectedQuoteId} onChange={e => {
                  setSelectedQuoteId(e.target.value);
                  setSelectedOrdenId('');
                }} required disabled={!selectedProyectoId}>
                  <option value="">-- Seleccionar Cotización Aprobada --</option>
                  {filteredQuotes.map(q => {
                    const req = q.requirement ? ` - ${q.requirement}` : '';
                    const dt = q.date ? ` (${q.date})` : '';
                    return (
                      <option key={q.id} value={q.id}>
                        Cotización V{q.version}{req}{dt}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="form-group">
                <label>Orden de Compra/Serv. *</label>
                <select className="form-control" value={selectedOrdenId} onChange={e => setSelectedOrdenId(e.target.value)} required disabled={!selectedQuoteId}>
                  <option value="">-- Seleccionar Orden --</option>
                  {filteredOrdenes.map(o => {
                    const prov = proveedores.find(p => p.id === o.proveedorId);
                    const provName = prov?.razonSocial || 'Sin Proveedor';
                    const itemsSummary = (o.items || []).map(it => it.customDescription || it.name).filter(Boolean).slice(0, 2).join(', ');
                    const itemsText = itemsSummary ? ` (${itemsSummary})` : '';
                    const totalText = `S/ ${(Number(o.total) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
                    return (
                      <option key={o.id} value={o.id}>
                        {o.id} ({o.tipoOrden || 'Servicio'}) - {provName} - {totalText}{itemsText}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          {selectedOrden && (
            <div className="form-section" style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <h3 className="section-title">Detalles de Pago</h3>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.6' }}>
                Proveedor: <strong style={{ color: 'var(--text-primary)' }}>{selectedProveedor?.razonSocial || 'Desconocido'}</strong> <br />
                Total de Orden: <strong style={{ color: 'var(--text-primary)' }}>S/ {(Number(selectedOrden.total) || 0).toFixed(2)}</strong> <br />
                Condiciones Pactadas: <strong style={{ color: 'var(--warning)' }}>{selectedOrden.condicionesPago || 'No especificadas'}</strong>
              </p>
              
              {isLocked && (
                <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', borderRadius: '8px', color: 'var(--danger)', marginBottom: '16px', fontWeight: 'bold' }}>
                  {lockMessage}
                </div>
              )}

              {/* SECCIÓN DETRACCIÓN SPOT PARA ÓRDENES DE SERVICIO (OS) */}
              {isOrdenServicio && isComprobanteSinSpot && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Info size={18} style={{ color: '#2563eb', flexShrink: 0 }} />
                  <div style={{ fontSize: '12px', color: '#1e40af', lineHeight: 1.4 }}>
                    <strong>{analysisResult?.tipoComprobante && isComprobanteSinDetraccion(analysisResult.tipoComprobante) ? analysisResult.tipoComprobante : 'Recibo por Honorarios (4ta Categoría)'}:</strong>{' '}
                    No corresponde aplicar Detracción SUNAT (SPOT). El pago no tiene descuento de detracción.
                  </div>
                </div>
              )}

              {isOrdenServicio && !isComprobanteSinSpot && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#166534' }}>
                        🛠️ Orden de Servicio (OS) — Detracción SUNAT (SPOT)
                      </span>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#15803d', cursor: 'pointer', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        checked={aplicaDetraccion}
                        onChange={e => {
                          const checked = e.target.checked;
                          setAplicaDetraccion(checked);
                          if (checked) {
                            const newPct = porcentajeDetraccion > 0 ? porcentajeDetraccion : 12;
                            setPorcentajeDetraccion(newPct);
                            const detr = Math.round((selectedOrden.total * (newPct / 100)) * 100) / 100;
                            const neto = Math.max(0, Math.round((selectedOrden.total - detr) * 100) / 100);
                            if (tipoPago === 'Total') setMonto(neto);
                            else if (tipoPago === 'Adelanto') {
                              const ratio = parsePorcentajeAdelanto(selectedOrden.condicionesPago);
                              setMonto(Number((neto * ratio).toFixed(2)));
                            }
                          } else {
                            if (tipoPago === 'Total') setMonto(selectedOrden.total);
                            else if (tipoPago === 'Adelanto') {
                              const ratio = parsePorcentajeAdelanto(selectedOrden.condicionesPago);
                              setMonto(Number((selectedOrden.total * ratio).toFixed(2)));
                            }
                          }
                        }}
                        style={{ width: '16px', height: '16px', accentColor: '#16a34a' }}
                      />
                      <span>Aplica Detracción</span>
                    </label>
                  </div>

                  {aplicaDetraccion && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', color: '#14532d', fontWeight: 600 }}>Porcentaje de Detracción:</span>
                        {[
                          { val: 10, label: '10% (Publicidad / Servicios)' },
                          { val: 12, label: '12% (Mantenimiento / Tercerización)' }
                        ].map(opt => (
                          <button
                            key={opt.val}
                            type="button"
                            onClick={() => {
                              setPorcentajeDetraccion(opt.val);
                              const detr = Math.round((selectedOrden.total * (opt.val / 100)) * 100) / 100;
                              const neto = Math.max(0, Math.round((selectedOrden.total - detr) * 100) / 100);
                              if (tipoPago === 'Total') setMonto(neto);
                              else if (tipoPago === 'Adelanto') {
                                const ratio = parsePorcentajeAdelanto(selectedOrden.condicionesPago);
                                setMonto(Number((neto * ratio).toFixed(2)));
                              }
                            }}
                            style={{
                              fontSize: '11px',
                              padding: '4px 10px',
                              borderRadius: '8px',
                              border: porcentajeDetraccion === opt.val ? '2px solid #16a34a' : '1px solid #86efac',
                              background: porcentajeDetraccion === opt.val ? '#dcfce7' : '#ffffff',
                              color: porcentajeDetraccion === opt.val ? '#14532d' : '#15803d',
                              cursor: 'pointer',
                              fontWeight: porcentajeDetraccion === opt.val ? 700 : 500
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="number"
                            step="1"
                            min="1"
                            max="100"
                            value={porcentajeDetraccion || ''}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              setPorcentajeDetraccion(val);
                              const detr = Math.round((selectedOrden.total * (val / 100)) * 100) / 100;
                              const neto = Math.max(0, Math.round((selectedOrden.total - detr) * 100) / 100);
                              if (tipoPago === 'Total') setMonto(neto);
                            }}
                            style={{ width: '55px', padding: '3px 6px', fontSize: '12px', borderRadius: '6px', border: '1px solid #86efac', textAlign: 'center' }}
                          />
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#166534' }}>%</span>
                        </div>
                      </div>

                      {/* Resumen de Cálculo */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px', background: '#ffffff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #dcfce7', fontSize: '12px' }}>
                        <div>
                          <span style={{ color: '#64748b', fontSize: '11px' }}>Total Bruto OS:</span>
                          <div style={{ fontWeight: 700, color: '#1e293b' }}>S/ {selectedOrden.total.toFixed(2)}</div>
                        </div>
                        <div>
                          <span style={{ color: '#b45309', fontSize: '11px' }}>Detracción ({porcentajeDetraccion}%):</span>
                          <div style={{ fontWeight: 800, color: '#b45309' }}>- S/ {detraccionCalculada.toFixed(2)}</div>
                        </div>
                        <div>
                          <span style={{ color: '#15803d', fontSize: '11px' }}>Neto Comercial a Pagar:</span>
                          <div style={{ fontWeight: 800, color: '#15803d', fontSize: '13px' }}>S/ {netoCalculado.toFixed(2)}</div>
                        </div>
                      </div>

                      {/* Botón rápido para ajustar monto */}
                      <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', color: '#166534', fontWeight: 600 }}>Fijar pago:</span>
                        <button
                          type="button"
                          onClick={() => setMonto(netoCalculado)}
                          style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: '#dcfce7', color: '#14532d', border: '1px solid #86efac', cursor: 'pointer', fontWeight: 600 }}
                        >
                          Pagar Neto Comercial (S/ {netoCalculado.toFixed(2)})
                        </button>
                        {tipoPago === 'Adelanto' && (
                          <button
                            type="button"
                            onClick={() => setMonto(Number((netoCalculado * (parsePorcentajeAdelanto(selectedOrden.condicionesPago) || 0.5)).toFixed(2)))}
                            style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', cursor: 'pointer', fontWeight: 600 }}
                          >
                            Adelanto sobre Neto (S/ {(netoCalculado * (parsePorcentajeAdelanto(selectedOrden.condicionesPago) || 0.5)).toFixed(2)})
                          </button>
                        )}
                      </div>

                      {/* Cuenta Banco de la Nación */}
                      <div style={{ marginTop: '8px', fontSize: '11px' }}>
                        {cuentaDetraccionBN ? (
                          <span style={{ color: '#15803d', fontWeight: 600 }}>
                            🏦 Cuenta Detracciones BN del Proveedor: <strong>{cuentaDetraccionBN.numeroCuenta}</strong> ({cuentaDetraccionBN.banco})
                          </span>
                        ) : (
                          <span style={{ color: '#d97706' }}>
                            ⚠️ Este proveedor no tiene registrada cuenta de Detracciones del Banco de la Nación en el sistema.
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!isLocked && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
                    <div className="form-group">
                      <label>¿Qué pago se realiza? *</label>
                      <select className="form-control" value={tipoPago} disabled>
                        <option value="">-- Seleccionar --</option>
                        <option value="Adelanto">Adelanto (Inicial)</option>
                        <option value="Restante">Saldo Restante (Final)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label style={{ margin: 0 }}>Importe a Pagar (S/) *</label>
                        {analysisResult && (analysisResult.montoSugerido || 0) > 0 && (
                          <span style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Sparkles size={12} /> Auto-completado por IA
                          </span>
                        )}
                      </div>
                      <input 
                        type="number" 
                        step="0.01" 
                        className="form-control" 
                        value={monto || ''} 
                        onChange={e => setMonto(parseFloat(e.target.value) || 0)} 
                        required 
                        style={{ color: 'var(--success)', fontWeight: 'bold', fontSize: '1.05rem' }} 
                      />
                      {analysisResult && (analysisResult.montoSugerido || 0) > 0 && Math.abs((monto || 0) - (calculatedOrderMonto || 0)) > 0.05 && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => setMonto(analysisResult.montoSugerido || 0)}
                            style={{
                              fontSize: '11px',
                              padding: '3px 8px',
                              borderRadius: '12px',
                              border: monto === analysisResult.montoSugerido ? '1px solid #10b981' : '1px solid #cbd5e1',
                              background: monto === analysisResult.montoSugerido ? '#ecfdf5' : '#ffffff',
                              color: monto === analysisResult.montoSugerido ? '#065f46' : '#64748b',
                              cursor: 'pointer',
                              fontWeight: monto === analysisResult.montoSugerido ? 600 : 400
                            }}
                          >
                            📄 Factura: S/ {(analysisResult.montoSugerido || 0).toFixed(2)}
                          </button>
                          <button
                            type="button"
                            onClick={() => setMonto(calculatedOrderMonto)}
                            style={{
                              fontSize: '11px',
                              padding: '3px 8px',
                              borderRadius: '12px',
                              border: monto === calculatedOrderMonto ? '1px solid #6366f1' : '1px solid #cbd5e1',
                              background: monto === calculatedOrderMonto ? '#eef2ff' : '#ffffff',
                              color: monto === calculatedOrderMonto ? '#3730a3' : '#64748b',
                              cursor: 'pointer',
                              fontWeight: monto === calculatedOrderMonto ? 600 : 400
                            }}
                          >
                            📋 Orden ({tipoPago}): S/ {calculatedOrderMonto.toFixed(2)}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="form-group" style={{ marginTop: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label style={{ margin: 0, fontWeight: 600 }}>Concepto / Refiere a (Título Breve) *</label>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>Heredado de la orden de compra</span>
                    </div>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="ej. Fabricación de Mueble Exhibidor para Tiendas" 
                      value={concepto} 
                      onChange={e => setConcepto(e.target.value)} 
                      required 
                    />
                  </div>

                  <div style={{ marginTop: '16px', marginBottom: '8px' }}>
                    <label style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '10px', 
                      padding: '10px 14px', 
                      borderRadius: '8px', 
                      border: comprobantePendiente ? '1.5px solid #f59e0b' : '1px solid #e2e8f0', 
                      backgroundColor: comprobantePendiente ? '#fffbeb' : '#f8fafc',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}>
                      <input 
                        type="checkbox" 
                        checked={comprobantePendiente} 
                        onChange={e => {
                          const checked = e.target.checked;
                          setComprobantePendiente(checked);
                          if (checked) {
                            if (!numeroComprobante || numeroComprobante === '') {
                              setNumeroComprobante('POR REGULARIZAR');
                            }
                          } else {
                            if (numeroComprobante === 'POR REGULARIZAR') {
                              setNumeroComprobante('');
                            }
                          }
                        }}
                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d97706' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: comprobantePendiente ? '#b45309' : '#334155' }}>
                          ⚠️ Factura o Recibo pendiente de entrega por el proveedor (Por regularizar)
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                          Marcar esta opción permite avanzar con la autorización y programación del pago sin trabas. Se regularizará cuando el proveedor emita el documento.
                        </div>
                      </div>
                    </label>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px', marginTop: '12px' }}>
                    <div className="form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label style={{ margin: 0 }}>
                          Número de Comprobante / Factura {comprobantePendiente ? <span style={{ color: '#d97706', fontSize: '11px' }}>(Provisorio)</span> : '*'}
                        </label>
                        {analysisResult?.numeroComprobante && (
                          <span style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Sparkles size={12} /> Detectado
                          </span>
                        )}
                      </div>
                      <input 
                        type="text" 
                        className="form-control" 
                        placeholder={comprobantePendiente ? 'POR REGULARIZAR' : 'Ej: F001-000456'} 
                        value={numeroComprobante} 
                        onChange={e => setNumeroComprobante(e.target.value)} 
                        required={!comprobantePendiente} 
                      />
                    </div>
                    <div className="form-group">
                      <label>Adjuntar Comprobante (Factura / RHE) {comprobantePendiente && <span style={{ color: '#64748b', fontSize: '11px' }}>(Opcional)</span>}</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '10px', background: '#ffffff', border: isAnalyzingComprobante ? '1.5px dashed #7c3aed' : '1.5px dashed #cbd5e1', borderRadius: '8px', cursor: isAnalyzingComprobante ? 'wait' : 'pointer' }}>
                          <input type="file" style={{ display: 'none' }} onChange={handleFileUpload} accept=".pdf,image/*" disabled={isAnalyzingComprobante} />
                          {isAnalyzingComprobante ? (
                            <Loader2 size={18} color="var(--accent-primary)" style={{ animation: 'spin 1s linear infinite' }} />
                          ) : (
                            <Upload size={18} color="var(--accent-primary)" />
                          )}
                          <span style={{ fontSize: 'var(--text-sm)', color: comprobanteFile ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                            {isAnalyzingComprobante ? 'Analizando archivo con IA...' : (comprobanteFile ? comprobanteFile.name : 'Subir Factura o Recibo')}
                          </span>
                        </label>
                        {comprobanteFile && !isAnalyzingComprobante && <CheckCircle size={20} color="var(--success)" />}
                      </div>
                    </div>
                  </div>

                  {/* BANNER DE ANÁLISIS EN PROGRESO */}
                  {isAnalyzingComprobante && (
                    <div style={{ marginTop: '16px', padding: '14px 18px', background: 'linear-gradient(90deg, #f5f3ff, #ede9fe)', border: '1.5px solid #c4b5fd', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px', color: '#5b21b6' }}>
                      <Loader2 size={24} style={{ flexShrink: 0, animation: 'spin 1s linear infinite' }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13.5px' }}>
                          Analizando comprobante con Inteligencia Artificial...
                        </div>
                        <div style={{ fontSize: '12px', color: '#6d28d9', marginTop: '2px' }}>
                          Validando RUC del emisor con el proveedor, extrayendo número de comprobante y monto a pagar.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* VALIDACIÓN DE RUC Y DATOS DETECTADOS */}
                  {analysisResult && !isAnalyzingComprobante && (
                    <>
                      {/* CASO 1: RUC COINCIDE */}
                      {rucVerification?.status === 'match' && (
                        <div style={{ marginTop: '16px', padding: '14px 18px', background: '#ecfdf5', border: '1.5px solid #10b981', borderRadius: '10px', boxShadow: '0 2px 6px rgba(16, 185, 129, 0.08)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#065f46' }}>
                            <CheckCircle size={22} color="#10b981" style={{ flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: '14px' }}>
                                ✅ RUC Verificado y Conforme
                              </div>
                              <div style={{ fontSize: '13px', marginTop: '2px', lineHeight: '1.4' }}>
                                El RUC del comprobante <strong>{analysisResult.rucEmisor}</strong> ({analysisResult.razonSocialEmisor || selectedProveedor?.razonSocial}) <strong>coincide</strong> con el proveedor seleccionado.
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #d1fae5', fontSize: '12px', color: '#047857' }}>
                            {analysisResult.tipoComprobante && (
                              <span style={{ background: '#d1fae5', padding: '3px 8px', borderRadius: '6px', fontWeight: 600 }}>
                                📄 {analysisResult.tipoComprobante}
                              </span>
                            )}
                            {analysisResult.numeroComprobante && (
                              <span style={{ background: '#d1fae5', padding: '3px 8px', borderRadius: '6px' }}>
                                N°: <strong>{analysisResult.numeroComprobante}</strong> (Auto-completado)
                              </span>
                            )}
                            {analysisResult.fechaEmision && (
                              <span style={{ background: '#d1fae5', padding: '3px 8px', borderRadius: '6px' }}>
                                📅 {analysisResult.fechaEmision}
                              </span>
                            )}
                            {(analysisResult.retencion || 0) > 0 && (
                              <span style={{ background: '#fef3c7', color: '#92400e', padding: '3px 8px', borderRadius: '6px', fontWeight: 600 }}>
                                ⚠️ Retención IR (8%): S/ {analysisResult.retencion?.toFixed(2)} | Monto Neto Líquido: S/ {analysisResult.montoNeto?.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* CASO 2: RUC NO COINCIDE (ALERTA CRÍTICA) */}
                      {rucVerification?.status === 'mismatch' && (
                        <div style={{ marginTop: '16px', padding: '14px 18px', background: '#fef2f2', border: '2px solid #ef4444', borderRadius: '10px', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.12)' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', color: '#991b1b' }}>
                            <AlertTriangle size={24} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 800, fontSize: '14.5px', color: '#b91c1c' }}>
                                ⚠️ ALERTA DE SEGURIDAD: Discrepancia en RUC del Emisor
                              </div>
                              <div style={{ fontSize: '13px', marginTop: '4px', lineHeight: '1.5' }}>
                                • RUC en comprobante adjunto: <strong style={{ color: '#b91c1c', fontSize: '13.5px' }}>{analysisResult.rucEmisor}</strong> ({analysisResult.razonSocialEmisor || 'Emisor detectado'})<br />
                                • RUC de la orden seleccionada: <strong style={{ color: '#1e293b', fontSize: '13.5px' }}>{selectedProveedor?.ruc || 'No registrado'}</strong> ({selectedProveedor?.razonSocial})
                              </div>
                              <div style={{ marginTop: '8px', padding: '6px 10px', background: '#fee2e2', borderRadius: '6px', fontSize: '12px', color: '#7f1d1d', fontWeight: 500 }}>
                                El comprobante subido no coincide con el proveedor de la orden de compra/servicio. Por favor verifique el archivo antes de continuar.
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #fecaca', fontSize: '12px', color: '#991b1b' }}>
                            {analysisResult.numeroComprobante && (
                              <span style={{ background: '#fee2e2', padding: '3px 8px', borderRadius: '6px' }}>
                                N° detectado: <strong>{analysisResult.numeroComprobante}</strong>
                              </span>
                            )}
                            {analysisResult.montoTotal && (
                              <span style={{ background: '#fee2e2', padding: '3px 8px', borderRadius: '6px' }}>
                                Total en doc: <strong>S/ {analysisResult.montoTotal.toFixed(2)}</strong>
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* CASO 3: PROVEEDOR NO TIENE RUC REGISTRADO EN EL SISTEMA */}
                      {rucVerification?.status === 'no_prov_ruc' && (
                        <div style={{ marginTop: '16px', padding: '14px 18px', background: '#fffbeb', border: '1.5px solid #f59e0b', borderRadius: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#92400e' }}>
                            <Info size={22} color="#f59e0b" style={{ flexShrink: 0 }} />
                            <div style={{ flex: 1, fontSize: '13px' }}>
                              <div style={{ fontWeight: 700, fontSize: '14px' }}>
                                RUC en Comprobante: {analysisResult.rucEmisor} ({analysisResult.razonSocialEmisor || 'Emisor'})
                              </div>
                              <div style={{ marginTop: '2px' }}>
                                El proveedor registrado (<strong>{selectedProveedor?.razonSocial}</strong>) no tiene un número de RUC en su ficha para contrastar.
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Comentarios / Notas para el Formato PDF */}
                  <div className="form-group" style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label style={{ margin: 0, fontWeight: 600 }}>Comentarios / Notas del Pago (Opcional)</label>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>Se reflejará en el formato PDF de pago</span>
                    </div>
                    <textarea
                      className="form-control"
                      rows={3}
                      placeholder="ej. Pago condicionado a entrega final, coordinado con tesorería, detallar retención o deducción..."
                      value={comentarios}
                      onChange={e => setComentarios(e.target.value)}
                      style={{ resize: 'vertical' }}
                    />
                  </div>

                  <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'rgba(124, 58, 237, 0.08)', border: '1px solid rgba(124, 58, 237, 0.2)', borderRadius: '8px' }}>
                    <FileText size={20} color="var(--accent-primary)" />
                    <div style={{ fontSize: 'var(--text-sm)' }}>
                      <strong style={{ color: 'var(--accent-primary)', display: 'block' }}>Bandeja de Autorización</strong>
                      <span style={{ color: 'var(--text-secondary)' }}>Al registrar la solicitud de pago, pasará a la <b>Bandeja de Autorización del Directorio</b> para su revisión y posterior envío a Contabilidad.</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          </div>

          <div className="modal-footer" style={{ flexShrink: 0, padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#fafafa', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn-secondary" onClick={handleClose} disabled={isSubmitting}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting || isLocked || !selectedOrden}>
              {isSubmitting ? 'Registrando...' : 'Registrar y Enviar a Directorio'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
