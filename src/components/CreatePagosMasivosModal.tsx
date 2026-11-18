import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { 
  X, Layers, CheckSquare, Square, Building2, AlertTriangle, 
  CheckCircle2, Search, FileText, CreditCard, Loader2
} from 'lucide-react';
import { useGlobalContext, API_URL, BASE_URL } from '../context/GlobalContext';
import { Upload } from 'lucide-react';
import { generateItemsTitle } from '../utils/orderTitleHelper';
import {
  parsePorcentajeAdelanto,
  isComprobanteSinDetraccion,
  resolveEffectiveDetraccion
} from '../utils/ordenPaymentHelper';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialProyectoId?: string;
}

export interface PagoRowState {
  ordenId: string;
  quoteId: string;
  tipoOrden: 'Compra' | 'Servicio';
  ordenTotal: number;
  condicionesPago: string;
  proveedorId: string;
  proveedorRazonSocial: string;
  proveedorRuc: string;
  proveedorBanco: string;
  proveedorCuenta: string;
  proveedorCci: string;
  proveedorTipoDocumento?: string;
  detectedTipoComprobante?: string | null;
  hasValidBank: boolean;

  // Multi-proyecto trazabilidad
  proyectoId: string;
  proyectoNombre: string;
  clienteId: string;
  clienteNombre: string;

  // Historial de pagos existentes
  totalPagado: number;
  saldoPendiente: number;
  pagosCount: number;

  // Selección para lote
  selected: boolean;

  // Campos de pago editables
  concepto: string;
  comentarios?: string;
  tipoPago: 'Adelanto' | 'Restante' | 'Total';
  monto: number;
  numeroComprobante: string;
  fechaPago: string;

  // Factura y Validación con IA
  comprobanteUrl?: string;
  comprobanteFileName?: string;
  isAnalyzingComprobante?: boolean;
  rucValidation?: {
    status: 'match' | 'mismatch' | 'none';
    message: string;
    rucEmisor?: string;
    razonSocialEmisor?: string;
  };
}

export const CreatePagosMasivosModal: React.FC<Props> = ({ 
  isOpen, 
  onClose, 
  initialProyectoId 
}) => {
  const { 
    clientes, 
    proyectos, 
    ordenes, 
    proveedores, 
    pagos, 
    addBatchPagos 
  } = useGlobalContext();

  const [selectedClienteId, setSelectedClienteId] = useState('');
  const [selectedProyectoId, setSelectedProyectoId] = useState('');

  const [rows, setRows] = useState<PagoRowState[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_balance' | 'paid'>('pending_balance');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Acciones en lote
  const [bulkFechaPago, setBulkFechaPago] = useState('');
  const [bulkTipoPago, setBulkTipoPago] = useState<'Adelanto' | 'Restante' | 'Total' | ''>('');

  // Función para calcular 48h hábiles (2 días útiles)
  const calculateDefaultPaymentDate = () => {
    const date = new Date();
    let addedDays = 0;
    while (addedDays < 2) {
      date.setDate(date.getDate() + 1);
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        addedDays++;
      }
    }
    return date.toISOString().split('T')[0];
  };

  // Inicialización y reseteo
  useEffect(() => {
    if (!isOpen) {
      setSelectedClienteId('');
      setSelectedProyectoId('');
      setRows([]);
      setSearchTerm('');
      setStatusFilter('pending_balance');
      setBulkFechaPago('');
      setBulkTipoPago('');
      setIsSubmitting(false);
      return;
    }

    if (initialProyectoId) {
      setSelectedProyectoId(initialProyectoId);
      const proy = proyectos.find(p => p.id === initialProyectoId);
      if (proy) setSelectedClienteId(proy.clienteId);
    }
  }, [isOpen, initialProyectoId, proyectos]);

  // Si cambia el cliente, auto-seleccionar primer proyecto o limpiar
  useEffect(() => {
    if (!isOpen) return;
    if (selectedClienteId) {
      const proysOfClient = proyectos.filter(p => p.clienteId === selectedClienteId);
      if (proysOfClient.length === 1 && !selectedProyectoId) {
        setSelectedProyectoId(proysOfClient[0].id);
      }
    }
  }, [selectedClienteId, isOpen, proyectos, selectedProyectoId]);

  // Clientes y proyectos filtrados (solo clientes con órdenes registradas o aprobadas)
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

  const selectedCliente = useMemo(() => {
    return clientes.find(c => c.id === selectedClienteId);
  }, [clientes, selectedClienteId]);

  const selectedProyecto = useMemo(() => {
    if (selectedProyectoId === 'ALL') {
      return { id: 'ALL', nombre: `Todos los proyectos con órdenes (${filteredProyectos.length})` } as any;
    }
    return proyectos.find(p => p.id === selectedProyectoId);
  }, [proyectos, selectedProyectoId, filteredProyectos]);

  // Cargar órdenes del proyecto o de todos los proyectos seleccionados y construir filas
  useEffect(() => {
    if (!selectedProyectoId) {
      setRows([]);
      return;
    }

    const defaultDate = calculateDefaultPaymentDate();
    const targetProjectIds = selectedProyectoId === 'ALL'
      ? filteredProyectos.map(p => p.id)
      : [selectedProyectoId];

    const projectOrdenes = ordenes.filter(o => targetProjectIds.includes(o.proyectoId));

    const newRows: PagoRowState[] = projectOrdenes.map(orden => {
      const prov = proveedores.find(p => p.id === orden.proveedorId);
      const cuentas = prov?.cuentas || [];
      const cuentaPrincipal = cuentas[0];
      const hasValidBank = Boolean(cuentaPrincipal?.numeroCuenta && cuentaPrincipal.numeroCuenta !== '-');

      const proy = proyectos.find(p => p.id === orden.proyectoId);
      const cli = clientes.find(c => c.id === (orden.clienteId || proy?.clienteId));

      // Calcular historial de pagos
      const ordenPagos = pagos.filter(p => p.ordenId === orden.id && p.estado !== 'Anulado');
      const totalPagado = ordenPagos.reduce((sum, p) => sum + Number(p.monto || 0), 0);
      const ordenTotal = Number(orden.total || 0);
      const saldoPendiente = Math.max(0, Number((ordenTotal - totalPagado).toFixed(2)));

      // Sugerir tipo de pago y monto
      let suggestedTipoPago: 'Adelanto' | 'Restante' | 'Total' = 'Total';
      let suggestedMonto = saldoPendiente;

      const cond = orden.condicionesPago || '';
      if (ordenPagos.length === 0) {
        const pctRatio = parsePorcentajeAdelanto(cond);
        if (pctRatio >= 1 || pctRatio <= 0) {
          suggestedTipoPago = 'Total';
          suggestedMonto = ordenTotal;
        } else {
          suggestedTipoPago = 'Adelanto';
          suggestedMonto = Number((ordenTotal * pctRatio).toFixed(2));
        }
      } else {
        suggestedTipoPago = 'Restante';
        suggestedMonto = saldoPendiente;
      }

      // Por defecto seleccionar solo aquellas que tengan saldo pendiente
      const hasPending = saldoPendiente > 0.05;

      return {
        ordenId: orden.id,
        quoteId: orden.quoteId || "",
        tipoOrden: (orden.tipoOrden as 'Compra' | 'Servicio') || 'Compra',
        ordenTotal,
        condicionesPago: orden.condicionesPago || 'No especificada',
        proveedorId: orden.proveedorId || '',
        proveedorRazonSocial: prov?.razonSocial || prov?.nombre || 'Proveedor Desconocido',
        proveedorRuc: prov?.ruc || '-',
        proveedorBanco: cuentaPrincipal?.banco || '-',
        proveedorCuenta: cuentaPrincipal?.numeroCuenta || '-',
        proveedorCci: cuentaPrincipal?.cci || '-',
        proveedorTipoDocumento: prov?.tipoDocumento || '',
        hasValidBank,
        proyectoId: orden.proyectoId || '',
        proyectoNombre: proy?.nombre || 'Proyecto',
        clienteId: orden.clienteId || proy?.clienteId || selectedClienteId,
        clienteNombre: cli?.empresa || selectedCliente?.empresa || 'Cliente',
        totalPagado,
        saldoPendiente,
        pagosCount: ordenPagos.length,
        selected: hasPending,
        concepto: orden.titulo || generateItemsTitle(orden.items) || 'Servicios / Compras',
        tipoPago: suggestedTipoPago,
        monto: Math.min(suggestedMonto, saldoPendiente),
        numeroComprobante: '',
        fechaPago: defaultDate,
        comprobanteUrl: '',
        comprobanteFileName: '',
        isAnalyzingComprobante: false,
        rucValidation: undefined
      };
    });

    setRows(newRows);
  }, [selectedProyectoId, filteredProyectos, ordenes, proveedores, pagos, proyectos, clientes, selectedClienteId, selectedCliente]);

  // Filas filtradas por buscador y estado de saldo
  const visibleRows = useMemo(() => {
    return rows.filter(r => {
      // Filtro de saldo
      if (statusFilter === 'pending_balance' && r.saldoPendiente <= 0.05) return false;
      if (statusFilter === 'paid' && r.saldoPendiente > 0.05) return false;

      // Buscador
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const match = 
          r.ordenId.toLowerCase().includes(q) ||
          r.proveedorRazonSocial.toLowerCase().includes(q) ||
          r.proveedorRuc.toLowerCase().includes(q) ||
          r.proveedorBanco.toLowerCase().includes(q) ||
          r.numeroComprobante.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [rows, statusFilter, searchTerm]);

  // Totales
  const selectedRows = useMemo(() => rows.filter(r => r.selected), [rows]);
  const totalMontoAPagar = useMemo(() => {
    return selectedRows.reduce((acc, r) => acc + (Number(r.monto) || 0), 0);
  }, [selectedRows]);

  // Handlers para actualizar filas
  const updateRow = (ordenId: string, updates: Partial<PagoRowState>) => {
    setRows(prev => prev.map(r => {
      if (r.ordenId !== ordenId) return r;
      const updated = { ...r, ...updates };

      // Si cambió el tipo de pago, recalcular monto sugerido
      if (updates.tipoPago && updates.tipoPago !== r.tipoPago) {
        if (updates.tipoPago === 'Adelanto') {
          const pct = parsePorcentajeAdelanto(r.condicionesPago);
          updated.monto = Number((r.ordenTotal * pct).toFixed(2));
        } else {
          updated.monto = r.saldoPendiente;
        }
      }
      return updated;
    }));
  };

  const toggleSelectRow = (ordenId: string) => {
    setRows(prev => prev.map(r => r.ordenId === ordenId ? { ...r, selected: !r.selected } : r));
  };

  const handleSelectAllVisible = (select: boolean) => {
    const visibleIds = new Set(visibleRows.map(r => r.ordenId));
    setRows(prev => prev.map(r => visibleIds.has(r.ordenId) ? { ...r, selected: select } : r));
  };

  const handleSelectAllWithBalance = () => {
    setRows(prev => prev.map(r => ({ ...r, selected: r.saldoPendiente > 0.05 })));
  };

  // Acciones en lote
  const handleApplyBulkFecha = () => {
    if (!bulkFechaPago) return toast.error('Ingresa una fecha para aplicar.');
    setRows(prev => prev.map(r => r.selected ? { ...r, fechaPago: bulkFechaPago } : r));
    toast.success(`Fecha aplicada a ${selectedRows.length} pago(s).`);
  };

  const handleApplyBulkTipo = () => {
    if (!bulkTipoPago) return toast.error('Selecciona un tipo de pago para aplicar.');
    setRows(prev => prev.map(r => {
      if (!r.selected) return r;
      let newMonto = r.monto;
      if (bulkTipoPago === 'Adelanto') {
        const pct = parsePorcentajeAdelanto(r.condicionesPago);
        newMonto = Number((r.ordenTotal * pct).toFixed(2));
      } else {
        newMonto = r.saldoPendiente;
      }
      return { ...r, tipoPago: bulkTipoPago, monto: newMonto };
    }));
    toast.success(`Tipo de pago '${bulkTipoPago}' aplicado a ${selectedRows.length} pago(s).`);
  };

  // Manejo de subida de factura individual por fila con análisis y validación IA
  const handleRowFileUpload = async (ordenId: string, file: File) => {
    updateRow(ordenId, { isAnalyzingComprobante: true });
    
    const row = rows.find(r => r.ordenId === ordenId);
    if (!row) return;

    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);
      if (row.proveedorRuc && row.proveedorRuc !== '-') formData.append('proveedorRuc', row.proveedorRuc);
      if (row.proveedorRazonSocial) formData.append('proveedorNombre', row.proveedorRazonSocial);
      if (row.ordenTotal) formData.append('ordenTotal', String(row.ordenTotal));
      if (selectedProyectoId) formData.append('projectId', selectedProyectoId);
      if (selectedClienteId) formData.append('clienteId', selectedClienteId);

      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/pagos/analyze-comprobante`, {
        method: 'POST',
        headers,
        body: formData
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'No se pudo analizar el comprobante');

      if (resData.success && resData.data) {
        const d = resData.data;
        const updates: Partial<PagoRowState> = {
          isAnalyzingComprobante: false,
          comprobanteUrl: d.comprobanteUrl || '',
          comprobanteFileName: file.name,
          detectedTipoComprobante: d.tipoComprobante || undefined,
          selected: true
        };

        if (isComprobanteSinDetraccion(d.tipoComprobante)) {
          toast(`📄 ${d.tipoComprobante} detectado en ${row.ordenId}: no aplica detracción SPOT.`, { icon: 'ℹ️' });
        }

        if (d.numeroComprobante) {
          updates.numeroComprobante = d.numeroComprobante;
        }

        const suggested = d.montoSugerido || d.montoNeto || d.montoTotal;
        if (suggested && suggested > 0) {
          if (row.tipoPago === 'Adelanto' && row.monto > 0 && suggested > row.monto) {
            // Mantener el adelanto parcial calculado para no inflar al 100% de la factura
          } else {
            updates.monto = Math.min(suggested, row.saldoPendiente > 0 ? row.saldoPendiente : suggested);
          }
        }

        const docRuc = (d.rucEmisor || '').replace(/\D/g, '');
        const provRuc = (row.proveedorRuc || '').replace(/\D/g, '');

        if (provRuc && docRuc) {
          if (provRuc === docRuc) {
            updates.rucValidation = {
              status: 'match',
              message: `RUC ${d.rucEmisor} coincide con ${row.proveedorRazonSocial}`,
              rucEmisor: d.rucEmisor,
              razonSocialEmisor: d.razonSocialEmisor
            };
            toast.success(`✅ Factura analizada: RUC conforme para ${row.proveedorRazonSocial}`);
          } else {
            updates.rucValidation = {
              status: 'mismatch',
              message: `El RUC ${d.rucEmisor} (${d.razonSocialEmisor || 'Emisor'}) NO coincide con el proveedor (${row.proveedorRuc})`,
              rucEmisor: d.rucEmisor,
              razonSocialEmisor: d.razonSocialEmisor
            };
            toast.error(`⚠️ ALERTA: RUC en factura (${d.rucEmisor}) no coincide con el proveedor (${row.proveedorRuc})`, { duration: 6000 });
          }
        } else {
          updates.rucValidation = {
            status: 'none',
            message: `RUC detectado: ${d.rucEmisor || 'N/A'}`
          };
          toast.success('Factura analizada con éxito');
        }

        updateRow(ordenId, updates);
      }
    } catch (err: any) {
      console.error('Error al analizar comprobante:', err);
      toast.error('Error al analizar archivo: ' + (err.message || 'Error'));
      updateRow(ordenId, { isAnalyzingComprobante: false });
    }
  };

  // Manejo de carga masiva de múltiples facturas
  const handleBatchFilesUpload = async (fileList: FileList) => {
    const files = Array.from(fileList);
    toast.loading(`Analizando ${files.length} factura(s) con IA...`, { id: 'batch-upload' });

    let matchedCount = 0;
    for (const file of files) {
      try {
        const token = localStorage.getItem('token');
        const formData = new FormData();
        formData.append('file', file);
        if (selectedProyectoId) formData.append('projectId', selectedProyectoId);
        if (selectedClienteId) formData.append('clienteId', selectedClienteId);

        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_URL}/pagos/analyze-comprobante`, {
          method: 'POST',
          headers,
          body: formData
        });

        const resData = await res.json();
        if (res.ok && resData.success && resData.data) {
          const d = resData.data;
          const docRuc = (d.rucEmisor || '').replace(/\D/g, '');

          // Buscar la fila correspondiente por RUC
          const matchingRow = rows.find(r => {
            const rowRuc = (r.proveedorRuc || '').replace(/\D/g, '');
            return rowRuc && docRuc && rowRuc === docRuc;
          });

          if (matchingRow) {
            matchedCount++;
            const updates: Partial<PagoRowState> = {
              isAnalyzingComprobante: false,
              comprobanteUrl: d.comprobanteUrl || '',
              comprobanteFileName: file.name,
              detectedTipoComprobante: d.tipoComprobante || undefined,
              selected: true
            };
            if (d.numeroComprobante) updates.numeroComprobante = d.numeroComprobante;
            const suggested = d.montoSugerido || d.montoNeto || d.montoTotal;
            if (suggested && suggested > 0) {
              if (matchingRow.tipoPago === 'Adelanto' && matchingRow.monto > 0 && suggested > matchingRow.monto) {
                // Mantener el adelanto parcial calculado para no inflar al 100% de la factura
              } else {
                updates.monto = Math.min(suggested, matchingRow.saldoPendiente > 0 ? matchingRow.saldoPendiente : suggested);
              }
            }
            updates.rucValidation = {
              status: 'match',
              message: `RUC ${d.rucEmisor} coincide con ${matchingRow.proveedorRazonSocial}`,
              rucEmisor: d.rucEmisor,
              razonSocialEmisor: d.razonSocialEmisor
            };
            updateRow(matchingRow.ordenId, updates);
          }
        }
      } catch (err) {
        console.error('Error procesando archivo:', file.name, err);
      }
    }

    toast.dismiss('batch-upload');
    if (matchedCount > 0) {
      toast.success(`¡${matchedCount} factura(s) asociadas y validadas correctamente!`);
    } else {
      toast.error('No se encontraron órdenes cuyo proveedor coincida con los RUC de las facturas.');
    }
  };

  // Envío final
  const handleSubmitBatch = async () => {
    if (selectedRows.length === 0) {
      return toast.error('Selecciona al menos una orden para registrar su pago.');
    }

    // Validar montos
    for (const row of selectedRows) {
      if (!row.monto || row.monto <= 0) {
        return toast.error(`El pago para la orden ${row.ordenId} (${row.proveedorRazonSocial}) debe tener un monto mayor a 0.`);
      }
      if (row.monto > row.saldoPendiente + 0.01) {
        const confirmExceed = window.confirm(
          `Atención: Para la orden ${row.ordenId}, el monto a pagar (S/ ${row.monto.toFixed(2)}) supera el saldo pendiente (S/ ${row.saldoPendiente.toFixed(2)}). ¿Deseas continuar de todas formas?`
        );
        if (!confirmExceed) return;
      }
    }

    const confirmSubmit = window.confirm(
      `¿Confirmas el registro masivo de ${selectedRows.length} pago(s) por un monto total de ${new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(totalMontoAPagar)}?\n\nLos pagos se enviarán a la bandeja de Autorización del Directorio y los correos se notificarán individualmente.`
    );
    if (!confirmSubmit) return;

    setIsSubmitting(true);
    try {
      const year = new Date().getFullYear();
      const payload = selectedRows.map((row, idx) => {
        const correspondingOrden = ordenes.find(o => o.id === row.ordenId);
        const correspondingProv = proveedores.find(p => p.id === (row.proveedorId || correspondingOrden?.proveedorId));
        const isOS = row.tipoOrden === 'Servicio' || (correspondingOrden?.tipoOrden === 'Servicio');
        const provTipoDoc = row.proveedorTipoDocumento || correspondingProv?.tipoDocumento;
        const sinDetrPorDoc = isComprobanteSinDetraccion(row.detectedTipoComprobante);
        const rawAplicaDetr = !sinDetrPorDoc && Boolean(isOS) && (correspondingOrden?.aplicaDetraccion ?? (row.monto > 700 || row.ordenTotal > 700));
        const pctDetr = correspondingOrden?.porcentajeDetraccion || 12;
        const hasDetr = resolveEffectiveDetraccion({
          aplicaDetraccion: rawAplicaDetr,
          porcentajeDetraccion: pctDetr,
          isServicio: Boolean(isOS),
          proveedorTipoDocumento: provTipoDoc,
          comprobanteTipo: row.detectedTipoComprobante
        });
        const detrAmt = hasDetr ? Math.round((Number(row.monto) * (pctDetr / 100)) * 100) / 100 : 0;
        const netoAmt = hasDetr ? Math.max(0, Math.round((Number(row.monto) - detrAmt) * 100) / 100) : Number(row.monto);

        return {
          id: `PAG-${year}-${Math.floor(1000 + Math.random() * 9000) + idx}`,
          clienteId: row.clienteId || selectedClienteId,
          clienteNombre: row.clienteNombre || selectedCliente?.empresa || 'Cliente',
          proyectoId: row.proyectoId || selectedProyectoId,
          proyectoNombre: row.proyectoNombre || selectedProyecto?.nombre || 'Proyecto',
          ordenId: row.ordenId,
          quoteId: row.quoteId,
          proveedorId: row.proveedorId,
          proveedorNombre: row.proveedorRazonSocial,
          concepto: row.concepto.trim() || 'Servicios / Compras',
          comentarios: (row.comentarios || '').trim() || undefined,
          notas: (row.comentarios || '').trim() || undefined,
          tipoPago: row.tipoPago,
          monto: Number(row.monto),
          aplicaDetraccion: hasDetr,
          porcentajeDetraccion: hasDetr ? pctDetr : 0,
          montoDetraccion: detrAmt,
          montoNeto: netoAmt,
          numeroComprobante: row.numeroComprobante.trim() || 'POR REGULARIZAR',
          comprobanteUrl: row.comprobanteUrl || undefined,
          fechaRegistro: new Date().toISOString().split('T')[0],
          fechaPago: row.fechaPago || calculateDefaultPaymentDate(),
          estado: 'Pendiente'
        };
      });

      await addBatchPagos(payload);
      toast.success(`¡${payload.length} pagos registrados exitosamente! Enviados a Autorización.`);
      onClose();
    } catch (err: any) {
      console.error('Error al registrar pagos masivos:', err);
      toast.error('Error al registrar pagos: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 }).format(amount);
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div 
      className="modal-overlay" 
      style={{ 
        zIndex: 1200, 
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px'
      }}
    >
      <div 
        className="modal-content" 
        style={{ 
          maxWidth: '1540px', 
          width: '98vw', 
          height: '96vh', 
          maxHeight: '98vh', 
          display: 'flex', 
          flexDirection: 'column', 
          overflow: 'hidden',
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          border: '1px solid #cbd5e1'
        }}
      >
        {/* MODAL HEADER */}
        <div style={{ padding: '12px 20px', flexShrink: 0, borderBottom: '1px solid #e2e8f0', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff' }}>
              <CreditCard size={20} />
            </div>
            <div>
              <h2 className="modal-title" style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Registro Masivo de Pagos a Proveedores
                <span style={{ fontSize: '11px', background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                  OC & OS del Proyecto
                </span>
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                Programa y genera múltiples pagos a proveedores en un solo paso. Las notificaciones se enviarán 1 a 1 de forma asíncrona.
              </p>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} disabled={isSubmitting}>
            <X size={20} />
          </button>
        </div>

        {/* MODAL BODY */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8fafc' }}>
          
          {/* BARRA DE SELECCIÓN DE CLIENTE Y PROYECTO */}
          <div style={{ 
            background: '#ffffff', 
            padding: '12px 16px', 
            borderRadius: '10px', 
            border: '1px solid #e2e8f0', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Building2 size={16} color="#7c3aed" />
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Cliente:</span>
                <select 
                  className="form-control"
                  style={{ width: '220px', height: '34px', fontSize: '13px', padding: '2px 8px' }}
                  value={selectedClienteId}
                  onChange={e => {
                    setSelectedClienteId(e.target.value);
                    setSelectedProyectoId('');
                  }}
                >
                  <option value="">-- Seleccionar Cliente --</option>
                  {eligibleClientes.map(c => (
                    <option key={c.id} value={c.id}>{c.empresa}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={16} color="#4f46e5" />
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Proyecto:</span>
                <select 
                  className="form-control"
                  style={{ minWidth: '320px', maxWidth: '440px', height: '34px', fontSize: '13px', padding: '2px 8px', fontWeight: selectedProyectoId ? 600 : 400 }}
                  value={selectedProyectoId}
                  onChange={e => setSelectedProyectoId(e.target.value)}
                  disabled={!selectedClienteId}
                >
                  <option value="">-- Selecciona un Proyecto para cargar sus Órdenes --</option>
                  {filteredProyectos.length > 1 && (
                    <option value="ALL">📁 TODOS LOS PROYECTOS CON ÓRDENES PENDIENTES ({filteredProyectos.length})</option>
                  )}
                  {filteredProyectos.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedProyectoId && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#64748b' }}>
                <span className="badge" style={{ background: '#ede9fe', color: '#6d28d9', padding: '4px 10px', borderRadius: '12px', fontWeight: 600 }}>
                  {rows.length} órdenes en el proyecto
                </span>
                <span className="badge" style={{ background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '12px', fontWeight: 600 }}>
                  {rows.filter(r => r.saldoPendiente > 0.05).length} con saldo pendiente
                </span>
              </div>
            )}
          </div>

          {!selectedProyectoId ? (
            <div style={{ 
              flex: 1, 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center', 
              padding: '60px 20px',
              background: '#ffffff',
              borderRadius: '12px',
              border: '2px dashed #cbd5e1'
            }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed', marginBottom: '16px' }}>
                <Layers size={32} />
              </div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '17px', color: '#1e293b' }}>Selecciona un Proyecto</h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b', maxWidth: '460px', textAlign: 'center' }}>
                Elige el cliente y proyecto para cargar automáticamente todas sus Órdenes de Compra (OC) y Servicio (OS), saldos y cuentas bancarias.
              </p>
            </div>
          ) : (
            <>
              {/* BARRA DE HERRAMIENTAS Y ACCIONES EN LOTE */}
              <div style={{ 
                background: '#ffffff', 
                padding: '10px 16px', 
                borderRadius: '8px', 
                border: '1px solid #e2e8f0', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap'
              }}>
                {/* Lado izquierdo: Búsqueda y Filtros de Estado */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', width: '240px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input 
                      type="text"
                      className="form-control"
                      placeholder="Buscar orden, proveedor, RUC..."
                      style={{ height: '32px', fontSize: '12px', paddingLeft: '32px' }}
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '6px' }}>
                    <button 
                      type="button"
                      style={{ 
                        border: 'none', 
                        padding: '4px 10px', 
                        borderRadius: '4px', 
                        fontSize: '11px', 
                        fontWeight: 600,
                        cursor: 'pointer',
                        background: statusFilter === 'pending_balance' ? '#ffffff' : 'transparent',
                        color: statusFilter === 'pending_balance' ? '#7c3aed' : '#64748b',
                        boxShadow: statusFilter === 'pending_balance' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                      }}
                      onClick={() => setStatusFilter('pending_balance')}
                    >
                      Con Saldo Pendiente
                    </button>
                    <button 
                      type="button"
                      style={{ 
                        border: 'none', 
                        padding: '4px 10px', 
                        borderRadius: '4px', 
                        fontSize: '11px', 
                        fontWeight: 600,
                        cursor: 'pointer',
                        background: statusFilter === 'all' ? '#ffffff' : 'transparent',
                        color: statusFilter === 'all' ? '#7c3aed' : '#64748b',
                        boxShadow: statusFilter === 'all' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                      }}
                      onClick={() => setStatusFilter('all')}
                    >
                      Todas ({rows.length})
                    </button>
                    <button 
                      type="button"
                      style={{ 
                        border: 'none', 
                        padding: '4px 10px', 
                        borderRadius: '4px', 
                        fontSize: '11px', 
                        fontWeight: 600,
                        cursor: 'pointer',
                        background: statusFilter === 'paid' ? '#ffffff' : 'transparent',
                        color: statusFilter === 'paid' ? '#7c3aed' : '#64748b',
                        boxShadow: statusFilter === 'paid' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                      }}
                      onClick={() => setStatusFilter('paid')}
                    >
                      Pagadas al 100%
                    </button>
                  </div>
                </div>

                {/* Lado derecho: Modificadores en Lote para Seleccionadas */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button 
                      type="button"
                      className="btn-secondary" 
                      style={{ height: '32px', fontSize: '12px', padding: '0 10px' }}
                      onClick={handleSelectAllWithBalance}
                      title="Seleccionar todas las que tienen saldo pendiente"
                    >
                      <CheckSquare size={14} style={{ marginRight: '4px' }} />
                      Seleccionar con Saldo
                    </button>
                    <button 
                      type="button"
                      className="btn-secondary" 
                      style={{ height: '32px', fontSize: '12px', padding: '0 10px' }}
                      onClick={() => handleSelectAllVisible(false)}
                      title="Deseleccionar todas"
                    >
                      <Square size={14} style={{ marginRight: '4px' }} />
                      Deseleccionar
                    </button>
                  </div>

                  <div style={{ width: '1px', height: '22px', background: '#cbd5e1' }} />

                  {/* Fecha masiva */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input 
                      type="date"
                      className="form-control"
                      style={{ height: '32px', fontSize: '12px', width: '130px', padding: '2px 6px' }}
                      value={bulkFechaPago}
                      onChange={e => setBulkFechaPago(e.target.value)}
                      title="Fecha de pago masiva"
                    />
                    <button 
                      type="button"
                      className="btn-secondary"
                      style={{ height: '32px', fontSize: '11px', padding: '0 8px' }}
                      onClick={handleApplyBulkFecha}
                      disabled={selectedRows.length === 0}
                    >
                      Aplicar Fecha
                    </button>
                  </div>

                  {/* Tipo de pago masivo */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <select
                      className="form-control"
                      style={{ height: '32px', fontSize: '12px', width: '105px', padding: '2px 6px' }}
                      value={bulkTipoPago}
                      onChange={e => setBulkTipoPago(e.target.value as any)}
                    >
                      <option value="">Tipo...</option>
                      <option value="Adelanto">Adelanto</option>
                      <option value="Restante">Restante</option>
                      <option value="Total">Total</option>
                    </select>
                    <button 
                      type="button"
                      className="btn-secondary"
                      style={{ height: '32px', fontSize: '11px', padding: '0 8px' }}
                      onClick={handleApplyBulkTipo}
                      disabled={selectedRows.length === 0}
                    >
                      Aplicar Tipo
                    </button>
                  </div>

                  <div style={{ width: '1px', height: '22px', background: '#cbd5e1' }} />

                  {/* Carga masiva de facturas con IA */}
                  <label 
                    className="btn-secondary"
                    style={{ 
                      height: '32px', 
                      fontSize: '11px', 
                      padding: '0 10px', 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '5px', 
                      cursor: 'pointer',
                      backgroundColor: '#f5f3ff',
                      borderColor: '#c4b5fd',
                      color: '#6d28d9',
                      fontWeight: 600
                    }}
                    title="Sube múltiples facturas (PDF); la IA las asociará automáticamente a cada orden según el RUC del proveedor"
                  >
                    <Upload size={13} color="#7c3aed" />
                    <span>Cargar Facturas Masivas (IA)</span>
                    <input 
                      type="file" 
                      multiple 
                      accept=".pdf,image/*" 
                      style={{ display: 'none' }} 
                      onChange={e => {
                        if (e.target.files && e.target.files.length > 0) {
                          handleBatchFilesUpload(e.target.files);
                          e.target.value = '';
                        }
                      }} 
                    />
                  </label>
                </div>
              </div>

              {/* TABLA DE ÓRDENES Y PAGOS */}
              <div style={{ 
                flex: 1, 
                minHeight: '260px', 
                overflowY: 'auto', 
                background: '#ffffff', 
                borderRadius: '10px', 
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 10, borderBottom: '2px solid #cbd5e1' }}>
                    <tr>
                      <th style={{ width: '42px', padding: '10px 12px', textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={visibleRows.length > 0 && visibleRows.every(r => r.selected)}
                          onChange={e => handleSelectAllVisible(e.target.checked)}
                          style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                        />
                      </th>
                      <th style={{ padding: '10px 12px', width: '140px', color: '#475569', fontWeight: 600 }}>Orden</th>
                      <th style={{ padding: '10px 12px', minWidth: '200px', color: '#475569', fontWeight: 600 }}>Proveedor & Datos Bancarios</th>
                      <th style={{ padding: '10px 12px', minWidth: '180px', color: '#475569', fontWeight: 600 }}>Concepto / Refiere a</th>
                      <th style={{ padding: '10px 12px', width: '110px', textAlign: 'right', color: '#475569', fontWeight: 600 }}>Total Orden</th>
                      <th style={{ padding: '10px 12px', width: '100px', textAlign: 'right', color: '#475569', fontWeight: 600 }}>Ya Pagado</th>
                      <th style={{ padding: '10px 12px', width: '110px', textAlign: 'right', color: '#475569', fontWeight: 600 }}>Saldo Pend.</th>
                      <th style={{ padding: '10px 12px', width: '115px', color: '#475569', fontWeight: 600 }}>Tipo Pago</th>
                      <th style={{ padding: '10px 12px', width: '130px', textAlign: 'right', color: '#475569', fontWeight: 600 }}>Monto a Pagar</th>
                      <th style={{ padding: '10px 12px', width: '135px', color: '#475569', fontWeight: 600 }} title="Si el proveedor aún no emitió factura, puedes dejarlo vacío y se registrará 'POR REGULARIZAR' automáticamente">
                        N° Comprobante
                        <span style={{ display: 'block', fontSize: '10px', color: '#64748b', fontWeight: 400 }}>o vacío si es pendiente</span>
                      </th>
                      <th style={{ padding: '10px 12px', minWidth: '160px', color: '#475569', fontWeight: 600 }}>Factura & Validación</th>
                      <th style={{ padding: '10px 12px', width: '125px', color: '#475569', fontWeight: 600 }}>Fecha Programada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.length === 0 ? (
                      <tr>
                        <td colSpan={12} style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
                          No se encontraron órdenes que coincidan con los filtros seleccionados.
                        </td>
                      </tr>
                    ) : (
                      visibleRows.map((row) => {
                        const isExceeding = row.monto > row.saldoPendiente + 0.05;
                        const isFullyPaid = row.saldoPendiente <= 0.05;

                        return (
                          <tr 
                            key={row.ordenId}
                            style={{ 
                              borderBottom: '1px solid #f1f5f9',
                              background: row.selected ? '#faf5ff' : isFullyPaid ? '#f8fafc' : '#ffffff',
                              transition: 'background 0.15s ease'
                            }}
                          >
                            {/* Checkbox */}
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              <input 
                                type="checkbox"
                                checked={row.selected}
                                onChange={() => toggleSelectRow(row.ordenId)}
                                style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                              />
                            </td>

                            {/* Orden */}
                            <td style={{ padding: '8px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span 
                                  style={{ 
                                    fontSize: '10px', 
                                    padding: '2px 5px', 
                                    borderRadius: '4px', 
                                    fontWeight: 700,
                                    background: row.tipoOrden === 'Servicio' ? '#dbeafe' : '#f3e8ff',
                                    color: row.tipoOrden === 'Servicio' ? '#1d4ed8' : '#6d28d9'
                                  }}
                                >
                                  {row.tipoOrden === 'Servicio' ? 'OS' : 'OC'}
                                </span>
                                <strong style={{ color: '#1e293b', fontSize: '12px' }}>{row.ordenId}</strong>
                                {row.tipoOrden === 'Servicio' && (() => {
                                  const ord = ordenes.find(o => o.id === row.ordenId);
                                  const prov = proveedores.find(p => p.id === (row.proveedorId || ord?.proveedorId));
                                  const provTipoDoc = row.proveedorTipoDocumento || prov?.tipoDocumento;
                                  const rawAplica = ord?.aplicaDetraccion ?? (row.monto > 700 || row.ordenTotal > 700);
                                  const pct = ord?.porcentajeDetraccion || 12;
                                  const hasDet = resolveEffectiveDetraccion({
                                    aplicaDetraccion: rawAplica,
                                    porcentajeDetraccion: pct,
                                    isServicio: true,
                                    proveedorTipoDocumento: provTipoDoc,
                                    comprobanteTipo: row.detectedTipoComprobante
                                  });
                                  return hasDet ? (
                                    <span style={{ fontSize: '9.5px', background: '#dcfce7', color: '#166534', padding: '1px 5px', borderRadius: '4px', fontWeight: 700, border: '1px solid #86efac' }} title={`Aplica Detracción SPOT ${pct}%`}>
                                      SPOT {pct}%
                                    </span>
                                  ) : null;
                                })()}
                              </div>
                              {selectedProyectoId === 'ALL' && (
                                <div style={{ fontSize: '10px', color: '#6366f1', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                                  <Layers size={11} /> {row.proyectoNombre}
                                </div>
                              )}
                              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                {row.condicionesPago}
                              </div>
                            </td>

                            {/* Proveedor y Datos Bancarios */}
                            <td style={{ padding: '8px 12px' }}>
                              <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                {row.proveedorRazonSocial}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#64748b', marginTop: '2px', flexWrap: 'wrap' }}>
                                <span>RUC: <strong>{row.proveedorRuc}</strong></span>
                                <span>•</span>
                                <span>{row.proveedorBanco}</span>
                                {row.proveedorCuenta !== '-' && (
                                  <>
                                    <span>•</span>
                                    <span>Cta: <code>{row.proveedorCuenta}</code></span>
                                  </>
                                )}
                              </div>
                              {!row.hasValidBank && (
                                <div style={{ fontSize: '10px', color: '#b45309', display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                                  <AlertTriangle size={11} /> Sin cuenta bancaria registrada
                                </div>
                              )}
                            </td>

                            {/* Concepto / Refiere a */}
                            <td style={{ padding: '8px 12px' }}>
                              <input 
                                type="text"
                                className="form-control"
                                placeholder="Refiere a..."
                                style={{ height: '30px', fontSize: '12px', padding: '2px 8px' }}
                                value={row.concepto}
                                disabled={!row.selected}
                                onChange={e => updateRow(row.ordenId, { concepto: e.target.value })}
                              />
                              <input 
                                type="text"
                                className="form-control"
                                placeholder="Nota / comentario (PDF)..."
                                title="Nota o comentario que saldrá en el formato PDF de pago"
                                style={{ height: '24px', fontSize: '11px', padding: '1px 6px', marginTop: '4px', borderStyle: 'dashed' }}
                                value={row.comentarios || ''}
                                disabled={!row.selected}
                                onChange={e => updateRow(row.ordenId, { comentarios: e.target.value })}
                              />
                            </td>

                            {/* Total Orden */}
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#334155' }}>
                              {formatCurrency(row.ordenTotal)}
                            </td>

                            {/* Ya Pagado */}
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748b' }}>
                              {row.totalPagado > 0 ? (
                                <span style={{ color: '#059669', fontWeight: 500 }}>
                                  {formatCurrency(row.totalPagado)}
                                </span>
                              ) : (
                                <span style={{ color: '#94a3b8' }}>-</span>
                              )}
                              {row.pagosCount > 0 && (
                                <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                  ({row.pagosCount} pago{row.pagosCount > 1 ? 's' : ''})
                                </div>
                              )}
                            </td>

                            {/* Saldo Pendiente */}
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                              {isFullyPaid ? (
                                <span className="badge badge-success" style={{ fontSize: '10px', padding: '2px 6px' }}>
                                  Completada
                                </span>
                              ) : (
                                <strong style={{ color: '#b45309', fontSize: '12px' }}>
                                  {formatCurrency(row.saldoPendiente)}
                                </strong>
                              )}
                            </td>

                            {/* Tipo Pago */}
                            <td style={{ padding: '8px 12px' }}>
                              <select 
                                className="form-control"
                                style={{ height: '30px', fontSize: '12px', padding: '2px 6px', fontWeight: 500 }}
                                value={row.tipoPago}
                                disabled={!row.selected}
                                onChange={e => updateRow(row.ordenId, { tipoPago: e.target.value as any })}
                              >
                                <option value="Adelanto">Adelanto</option>
                                <option value="Restante">Restante</option>
                                <option value="Total">Total</option>
                              </select>
                            </td>

                            {/* Monto a Pagar */}
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                              <div style={{ position: 'relative' }}>
                                <input 
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="form-control"
                                  style={{ 
                                    height: '30px', 
                                    fontSize: '12px', 
                                    fontWeight: 700, 
                                    textAlign: 'right',
                                    paddingRight: '8px',
                                    borderColor: isExceeding ? '#f59e0b' : undefined,
                                    background: isExceeding ? '#fffbeb' : undefined
                                  }}
                                  value={row.monto || ''}
                                  disabled={!row.selected}
                                  onChange={e => updateRow(row.ordenId, { monto: parseFloat(e.target.value) || 0 })}
                                />
                                {isExceeding && (
                                  <span 
                                    title="El monto supera el saldo pendiente"
                                    style={{ position: 'absolute', left: '-18px', top: '50%', transform: 'translateY(-50%)', color: '#d97706' }}
                                  >
                                    <AlertTriangle size={14} />
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* N° Comprobante */}
                            <td style={{ padding: '8px 12px' }}>
                              <input 
                                type="text"
                                className="form-control"
                                placeholder="F001-... (o vacío si es pendiente)"
                                style={{ height: '30px', fontSize: '12px', padding: '2px 8px' }}
                                value={row.numeroComprobante}
                                disabled={!row.selected}
                                onChange={e => updateRow(row.ordenId, { numeroComprobante: e.target.value })}
                              />
                            </td>

                            {/* Factura & Validación */}
                            <td style={{ padding: '8px 12px' }}>
                              {row.isAnalyzingComprobante ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#7c3aed', fontSize: '11px', fontWeight: 600 }}>
                                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                  <span>Analizando IA...</span>
                                </div>
                              ) : row.comprobanteUrl || row.comprobanteFileName ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', background: '#f8fafc', padding: '3px 6px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                    <a 
                                      href={row.comprobanteUrl ? (row.comprobanteUrl.startsWith('http') ? row.comprobanteUrl : `${BASE_URL}${row.comprobanteUrl}`) : '#'} 
                                      target="_blank" 
                                      rel="noreferrer"
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#0284c7', textDecoration: 'none', maxWidth: '115px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px', fontWeight: 600 }}
                                      title={row.comprobanteFileName || 'Ver Factura'}
                                    >
                                      <FileText size={12} />
                                      {row.comprobanteFileName || 'Ver Factura'}
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => updateRow(row.ordenId, { comprobanteUrl: '', comprobanteFileName: '', rucValidation: undefined })}
                                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}
                                      title="Quitar archivo"
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>

                                  {/* Badge de Validación de RUC */}
                                  {row.rucValidation && (
                                    <div>
                                      {row.rucValidation.status === 'match' ? (
                                        <span 
                                          style={{ 
                                            display: 'inline-flex', 
                                            alignItems: 'center', 
                                            gap: '3px', 
                                            fontSize: '10px', 
                                            padding: '1px 6px', 
                                            borderRadius: '4px', 
                                            fontWeight: 700, 
                                            background: '#dcfce7', 
                                            color: '#15803d' 
                                          }}
                                          title={row.rucValidation.message}
                                        >
                                          <CheckCircle2 size={11} /> RUC Conforme
                                        </span>
                                      ) : row.rucValidation.status === 'mismatch' ? (
                                        <span 
                                          style={{ 
                                            display: 'inline-flex', 
                                            alignItems: 'center', 
                                            gap: '3px', 
                                            fontSize: '10px', 
                                            padding: '1px 6px', 
                                            borderRadius: '4px', 
                                            fontWeight: 700, 
                                            background: '#fee2e2', 
                                            color: '#b91c1c' 
                                          }}
                                          title={row.rucValidation.message}
                                        >
                                          <AlertTriangle size={11} /> RUC No Coincide
                                        </span>
                                      ) : (
                                        <span 
                                          style={{ 
                                            display: 'inline-flex', 
                                            alignItems: 'center', 
                                            gap: '3px', 
                                            fontSize: '10px', 
                                            padding: '1px 6px', 
                                            borderRadius: '4px', 
                                            background: '#f1f5f9', 
                                            color: '#64748b' 
                                          }}
                                          title={row.rucValidation.message}
                                        >
                                          Leído
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <label style={{ 
                                  display: 'inline-flex', 
                                  alignItems: 'center', 
                                  gap: '4px', 
                                  padding: '4px 8px', 
                                  borderRadius: '6px', 
                                  border: '1px dashed #cbd5e1', 
                                  background: '#ffffff', 
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                  color: '#64748b',
                                  transition: 'all 0.15s ease'
                                }}>
                                  <Upload size={12} color="#7c3aed" />
                                  <span>Adjuntar</span>
                                  <input 
                                    type="file" 
                                    accept=".pdf,image/*" 
                                    style={{ display: 'none' }} 
                                    disabled={!row.selected}
                                    onChange={e => {
                                      if (e.target.files && e.target.files[0]) {
                                        handleRowFileUpload(row.ordenId, e.target.files[0]);
                                      }
                                    }} 
                                  />
                                </label>
                              )}
                            </td>

                            {/* Fecha Programada */}
                            <td style={{ padding: '8px 12px' }}>
                              <input 
                                type="date"
                                className="form-control"
                                style={{ height: '30px', fontSize: '12px', padding: '2px 6px' }}
                                value={row.fechaPago}
                                disabled={!row.selected}
                                onChange={e => updateRow(row.ordenId, { fechaPago: e.target.value })}
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

        </div>

        {/* MODAL FOOTER RESUMEN */}
        <div style={{ 
          padding: '12px 20px', 
          flexShrink: 0, 
          borderTop: '1px solid #e2e8f0', 
          background: '#ffffff', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          boxShadow: '0 -2px 10px rgba(0,0,0,0.02)'
        }}>
          {/* Lado izquierdo: Totales */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#64748b' }}>Pagos a generar:</span>
              <span className="badge" style={{ background: '#ede9fe', color: '#7c3aed', padding: '3px 10px', borderRadius: '12px', fontWeight: 700, fontSize: '13px' }}>
                {selectedRows.length} seleccionados
              </span>
            </div>

            <div style={{ width: '1px', height: '20px', background: '#e2e8f0' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#64748b' }}>Importe Total a Pagar:</span>
              <span style={{ fontSize: '18px', fontWeight: 800, color: '#7c3aed' }}>
                {formatCurrency(totalMontoAPagar)}
              </span>
            </div>
          </div>

          {/* Lado derecho: Botones de Acción */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button 
              type="button" 
              className="btn-secondary" 
              onClick={onClose} 
              disabled={isSubmitting}
              style={{ padding: '8px 16px', fontSize: '13px' }}
            >
              Cancelar
            </button>

            <button 
              type="button" 
              className="btn-primary" 
              onClick={handleSubmitBatch}
              disabled={isSubmitting || selectedRows.length === 0}
              style={{ 
                padding: '8px 20px', 
                fontSize: '13px', 
                fontWeight: 600,
                background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Registrando Pagos...
                </>
              ) : (
                <>
                  <CreditCard size={16} />
                  Registrar {selectedRows.length} Pagos Masivos
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
