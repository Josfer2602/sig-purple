import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { X, Save, Check, AlertTriangle, Edit, CheckCircle2, Paperclip, Upload, FileText } from 'lucide-react';
import { useGlobalContext } from '../context/GlobalContext';
import { CreateProveedorModal } from './CreateProveedorModal';
import { SearchableProveedorSelect } from './SearchableProveedorSelect';
import { generateItemsTitle, cleanItemDescription } from '../utils/orderTitleHelper';
import { DEFAULT_CONDICIONES_PAGO_ORDEN, parsePorcentajeAdelanto, isProveedorReciboPorHonorarios, resolveEffectiveDetraccion } from '../utils/ordenPaymentHelper';
import type { Orden, OrdenSubItem } from '../types/models';
import toast from 'react-hot-toast';

interface CreateOrdenModalProps {
  isOpen: boolean;
  onClose: () => void;
  ordenToEdit?: Orden | null;
}

interface SelectedSubItemState {
  id: string;
  customDescription: string;
  quantity: number;
  unitCost: number;
  monto: number;
}

export const CreateOrdenModal: React.FC<CreateOrdenModalProps> = ({ isOpen, onClose, ordenToEdit }) => {
  const { clientes, proyectos, quotes, proveedores, addOrden, updateOrden, listas } = useGlobalContext();

  const [selectedClienteId, setSelectedClienteId] = useState('');
  const [selectedProyectoId, setSelectedProyectoId] = useState('');
  const [selectedQuoteId, setSelectedQuoteId] = useState('');
  const [selectedProveedorId, setSelectedProveedorId] = useState('');
  const [selectedCuentaId, setSelectedCuentaId] = useState('');
  const [tipoOrden, setTipoOrden] = useState<'Compra' | 'Servicio'>('Compra');
  const [aplicaDetraccion, setAplicaDetraccion] = useState<boolean>(false);
  const [porcentajeDetraccion, setPorcentajeDetraccion] = useState<number>(12);
  const [detraccionManualOverride, setDetraccionManualOverride] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [selectedSubItemsMap, setSelectedSubItemsMap] = useState<Record<string, SelectedSubItemState>>({});
  const [isConsolidated, setIsConsolidated] = useState(false);
  const [consolidatedName, setConsolidatedName] = useState('');

  const defaultCondicion = (listas?.condicionesPagoOrden && listas.condicionesPagoOrden.length > 0)
    ? listas.condicionesPagoOrden[0]
    : '50% Adelanto / 50% Contra Entrega';

  const [condicionesPago, setCondicionesPago] = useState(defaultCondicion);
  const [isEditProveedorOpen, setIsEditProveedorOpen] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [isTituloManual, setIsTituloManual] = useState(false);
  const [cotizacionFile, setCotizacionFile] = useState<File | null>(null);

  // Dynamic payment conditions list
  const condicionesOptions = useMemo(() => {
    const list = (listas?.condicionesPagoOrden && listas.condicionesPagoOrden.length > 0)
      ? listas.condicionesPagoOrden
      : DEFAULT_CONDICIONES_PAGO_ORDEN;
    if (condicionesPago && !list.includes(condicionesPago)) {
      return [condicionesPago, ...list];
    }
    return list;
  }, [listas?.condicionesPagoOrden, condicionesPago]);

  // Reset form when opened/closed or when parents change
  useEffect(() => {
    if (!isOpen) {
      setSelectedClienteId('');
      setSelectedProyectoId('');
      setSelectedQuoteId('');
      setSelectedProveedorId('');
      setSelectedSubItemsMap({});
      setIsConsolidated(false);
      setConsolidatedName('');
      setCondicionesPago(defaultCondicion);
      setTipoOrden('Compra');
      setAplicaDetraccion(false);
      setPorcentajeDetraccion(12);
      setDetraccionManualOverride(false);
      setIsSubmitting(false);
      setTitulo('');
      setIsTituloManual(false);
      setCotizacionFile(null);
    } else if (ordenToEdit) {
      setCotizacionFile(null);
      setSelectedClienteId(ordenToEdit.clienteId);
      setSelectedProyectoId(ordenToEdit.proyectoId);
      setSelectedQuoteId(ordenToEdit.quoteId);
      setSelectedProveedorId(ordenToEdit.proveedorId);
      setSelectedCuentaId(ordenToEdit.cuentaBancariaId || '');
      setCondicionesPago(ordenToEdit.condicionesPago || defaultCondicion);
      const ordTipo = (ordenToEdit.tipoOrden as 'Compra' | 'Servicio') || 'Compra';
      setTipoOrden(ordTipo);
      const provEdit = proveedores.find(p => p.id === ordenToEdit.proveedorId);
      const validDetr = resolveEffectiveDetraccion({
        aplicaDetraccion: ordenToEdit.aplicaDetraccion,
        porcentajeDetraccion: ordenToEdit.porcentajeDetraccion,
        isServicio: ordTipo === 'Servicio',
        proveedorTipoDocumento: provEdit?.tipoDocumento
      });
      setAplicaDetraccion(validDetr);
      setPorcentajeDetraccion(
        ordenToEdit.porcentajeDetraccion && ordenToEdit.porcentajeDetraccion > 0
          ? ordenToEdit.porcentajeDetraccion
          : 12
      );
      setDetraccionManualOverride(true);

      const map: Record<string, SelectedSubItemState> = {};
      ordenToEdit.items.forEach(item => {
        const q = item.quantity || 1;
        const total = item.total || 0;
        const unit = item.unitCost !== undefined && item.unitCost > 0 ? item.unitCost : (q > 0 ? total / q : total);
        map[item.quoteSubItemId] = {
          id: item.quoteSubItemId,
          customDescription: item.customDescription || item.name,
          quantity: q,
          unitCost: Number(unit.toFixed(2)),
          monto: total
        };
      });
      setSelectedSubItemsMap(map);
      setTitulo(ordenToEdit.titulo || '');
      setIsTituloManual(Boolean(ordenToEdit.titulo));
    }
  }, [isOpen, ordenToEdit, defaultCondicion]);

  // Filtro inicial: Solo clientes con proyectos aprobados o cotizaciones aprobadas
  const eligibleClientes = useMemo(() => {
    return clientes.filter(c => {
      const clientProys = proyectos.filter(p => p.clienteId === c.id);
      return clientProys.some(p => {
        const hasApprovedQuote = quotes.some(q => {
          const s = (q.status || '').toLowerCase();
          return q.projectId === p.id && (s.includes('aprob') || s.includes('liquid'));
        });
        return p.estado === 'Aprobado' || hasApprovedQuote;
      });
    });
  }, [clientes, proyectos, quotes]);

  const filteredProyectos = useMemo(() => {
    if (!selectedClienteId) return [];
    return proyectos.filter(p => {
      if (p.clienteId !== selectedClienteId || p.estado === 'Rechazado') return false;
      const hasApprovedQuote = quotes.some(q => {
        const s = (q.status || '').toLowerCase();
        return q.projectId === p.id && (s.includes('aprob') || s.includes('liquid'));
      });
      return p.estado === 'Aprobado' || hasApprovedQuote;
    });
  }, [proyectos, selectedClienteId, quotes]);

  const filteredQuotes = useMemo(() => {
    if (!selectedProyectoId) return [];
    return quotes.filter(q => {
      const s = (q.status || '').toLowerCase();
      return q.projectId === selectedProyectoId && (s.includes('aprob') || s.includes('liquid'));
    });
  }, [quotes, selectedProyectoId]);

  const selectedQuote = quotes.find(q => q.id === selectedQuoteId);

  // Auto-sugerir título breve según los subítems seleccionados
  useEffect(() => {
    if (!isTituloManual && selectedQuote) {
      const itemsList: { name: string }[] = [];
      Object.keys(selectedSubItemsMap).forEach(subItemId => {
        const state = selectedSubItemsMap[subItemId];
        itemsList.push({ name: state?.customDescription || subItemId });
      });
      if (itemsList.length > 0) {
        setTitulo(generateItemsTitle(itemsList));
      }
    }
  }, [selectedSubItemsMap, isTituloManual, selectedQuote]);

  // Auto-seleccionar si solo hay 1 cotización aprobada para el proyecto
  useEffect(() => {
    if (selectedProyectoId && !selectedQuoteId) {
      if (filteredQuotes.length === 1) {
        setSelectedQuoteId(filteredQuotes[0].id);
      }
    }
  }, [selectedProyectoId, selectedQuoteId, filteredQuotes]);

  const selectedProveedor = useMemo(() => {
    return proveedores.find(p => p.id === selectedProveedorId);
  }, [proveedores, selectedProveedorId]);

  const isReciboPorHonorarios = useMemo(() => {
    return isProveedorReciboPorHonorarios(selectedProveedor);
  }, [selectedProveedor]);

  const providerValidation = useMemo(() => {
    if (!selectedProveedor) return { isValid: true, missing: [] as string[] };
    const missing: string[] = [];
    const ruc = (selectedProveedor.ruc || '').trim();
    if (!ruc || ruc === '-' || ruc.length < 8) {
      missing.push('RUC no registrado o incompleto (se requiere RUC de 11 dígitos o DNI para emisión fiscal)');
    }
    const cuentasValidas = (selectedProveedor.cuentas || []).filter(c => c.numeroCuenta && c.numeroCuenta.trim() !== '-');
    if (cuentasValidas.length === 0) {
      missing.push('Sin cuenta bancaria registrada (se requiere al menos un Banco y N° de Cuenta/CCI para programar pagos)');
    }
    return {
      isValid: missing.length === 0,
      missing
    };
  }, [selectedProveedor]);

  // Flatten subitems for display
  const availableSubItems = React.useMemo(() => {
    if (!selectedQuote) return [];
    const items: Array<{ id: string, label: string, description?: string, quantity: number, unitCost: number, dates: number, total: number }> = [];

    selectedQuote.categories.forEach(cat => {
      cat.items.forEach(item => {
        item.subItems.forEach(sub => {
          items.push({
            id: sub.id,
            label: `${cat.name} > ${item.name} > ${sub.name}`,
            description: sub.name,
            quantity: sub.quantity,
            unitCost: sub.unitCost,
            dates: sub.dates,
            total: sub.quantity * sub.dates * sub.unitCost
          });
        });
      });
    });
    return items;
  }, [selectedQuote]);

  const toggleSubItem = (sub: any) => {
    const newMap = { ...selectedSubItemsMap };
    if (newMap[sub.id]) {
      delete newMap[sub.id];
    } else {
      const q = sub.quantity || 1;
      const total = sub.total || 0;
      const unit = sub.unitCost !== undefined && sub.unitCost > 0 ? sub.unitCost : (q > 0 ? total / q : total);
      newMap[sub.id] = {
        id: sub.id,
        customDescription: sub.description || cleanItemDescription(sub.label),
        quantity: q,
        unitCost: Number(unit.toFixed(2)),
        monto: total
      };
    }
    setSelectedSubItemsMap(newMap);
  };

  const updateSubItemState = (id: string, field: 'customDescription' | 'quantity' | 'unitCost' | 'monto', value: any) => {
    setSelectedSubItemsMap(prev => {
      const curr = prev[id];
      if (!curr) return prev;

      let newQuantity = curr.quantity;
      let newUnitCost = curr.unitCost;
      let newMonto = curr.monto;

      if (field === 'customDescription') {
        return { ...prev, [id]: { ...curr, customDescription: value } };
      } else if (field === 'quantity') {
        newQuantity = Math.max(1, parseInt(value, 10) || 1);
        newMonto = Number((newQuantity * newUnitCost).toFixed(2));
      } else if (field === 'unitCost') {
        newUnitCost = Math.max(0, parseFloat(value) || 0);
        newMonto = Number((newQuantity * newUnitCost).toFixed(2));
      } else if (field === 'monto') {
        newMonto = Math.max(0, parseFloat(value) || 0);
        newUnitCost = newQuantity > 0 ? Number((newMonto / newQuantity).toFixed(2)) : newMonto;
      }

      return {
        ...prev,
        [id]: {
          ...curr,
          quantity: newQuantity,
          unitCost: newUnitCost,
          monto: newMonto
        }
      };
    });
  };

  const handleSelectAll = () => {
    const currentSelectedCount = Object.keys(selectedSubItemsMap).length;
    if (currentSelectedCount === availableSubItems.length) {
      setSelectedSubItemsMap({});
    } else {
      const newMap: Record<string, SelectedSubItemState> = {};
      availableSubItems.forEach(s => {
        const q = s.quantity || 1;
        const total = s.total || 0;
        const unit = s.unitCost !== undefined && s.unitCost > 0 ? s.unitCost : (q > 0 ? total / q : total);
        newMap[s.id] = {
          id: s.id,
          customDescription: (s as any).description || cleanItemDescription(s.label),
          quantity: q,
          unitCost: Number(unit.toFixed(2)),
          monto: total
        };
      });
      setSelectedSubItemsMap(newMap);
    }
  };

  const currentSubTotal = useMemo(() => {
    return availableSubItems
      .filter(s => selectedSubItemsMap[s.id])
      .reduce((acc, curr) => acc + (selectedSubItemsMap[curr.id].monto || 0), 0);
  }, [availableSubItems, selectedSubItemsMap]);

  const currentEstimatedTotal = useMemo(() => {
    const tieneIgv = selectedProveedor?.tipoDocumento === 'Factura';
    return tieneIgv ? currentSubTotal * 1.18 : currentSubTotal;
  }, [currentSubTotal, selectedProveedor]);

  // Validación normativa SUNAT: Recibo por Honorarios NUNCA lleva detracción SPOT;
  // en Órdenes de Servicio con Factura se sugiere automáticamente solo si supera S/ 700.
  useEffect(() => {
    if (!isOpen) return;
    if (isReciboPorHonorarios || tipoOrden !== 'Servicio') {
      if (aplicaDetraccion) setAplicaDetraccion(false);
      return;
    }
    if (!detraccionManualOverride && !ordenToEdit) {
      const shouldAutoApply = Boolean(selectedProveedorId) && currentEstimatedTotal > 700;
      if (aplicaDetraccion !== shouldAutoApply) {
        setAplicaDetraccion(shouldAutoApply);
      }
      if (shouldAutoApply && porcentajeDetraccion <= 0) {
        setPorcentajeDetraccion(12);
      }
    }
  }, [isOpen, isReciboPorHonorarios, tipoOrden, selectedProveedorId, currentEstimatedTotal, detraccionManualOverride, ordenToEdit, aplicaDetraccion, porcentajeDetraccion]);

  const calculateTotals = () => {
    const subTotal = currentSubTotal;
    const tieneIgv = selectedProveedor?.tipoDocumento === 'Factura';
    const igv = tieneIgv ? subTotal * 0.18 : 0;
    const total = subTotal + igv;

    const porcentajeAdelanto = parsePorcentajeAdelanto(condicionesPago);
    const adelanto = Number((total * porcentajeAdelanto).toFixed(2));
    const saldo = Number((total - adelanto).toFixed(2));

    const hasDetraccion = resolveEffectiveDetraccion({
      aplicaDetraccion,
      porcentajeDetraccion,
      isServicio: tipoOrden === 'Servicio',
      proveedorTipoDocumento: selectedProveedor?.tipoDocumento
    });
    const montoDetraccion = hasDetraccion ? Number((total * (porcentajeDetraccion / 100)).toFixed(2)) : 0;
    const montoNeto = hasDetraccion ? Number((total - montoDetraccion).toFixed(2)) : total;
    const adelantoNeto = Number((montoNeto * porcentajeAdelanto).toFixed(2));
    const saldoNeto = Number((montoNeto - adelantoNeto).toFixed(2));

    return {
      subTotal,
      igv,
      total,
      tieneIgv,
      porcentajeAdelanto,
      adelanto,
      saldo,
      hasDetraccion,
      montoDetraccion,
      montoNeto,
      adelantoNeto,
      saldoNeto
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!selectedClienteId || !selectedProyectoId || !selectedQuoteId || !selectedProveedorId) {
      toast.error('Por favor complete todos los campos requeridos.');
      return;
    }

    if (selectedProveedor && !providerValidation.isValid) {
      toast.error(`Emisión bloqueada: ${providerValidation.missing[0]}`);
      return;
    }

    if (isReciboPorHonorarios && aplicaDetraccion) {
      setAplicaDetraccion(false);
      toast.error('Los proveedores con Recibo por Honorarios no están sujetos a detracción SPOT.');
      return;
    }

    if (!isReciboPorHonorarios && tipoOrden === 'Servicio' && aplicaDetraccion && porcentajeDetraccion <= 0) {
      toast.error('Ingresa un porcentaje de detracción válido mayor a 0% o desmarca "Aplica Detracción".');
      return;
    }

    const selectedIds = Object.keys(selectedSubItemsMap);
    if (selectedIds.length === 0) {
      toast.error('Debe seleccionar al menos un subítem para la orden.');
      return;
    }

    const selectedSubItems = availableSubItems.filter(s => selectedSubItemsMap[s.id]);
    let orderItems: OrdenSubItem[] = [];

    if (isConsolidated && selectedSubItems.length > 1) {
      const totalAmount = selectedSubItems.reduce((acc, s) => acc + (selectedSubItemsMap[s.id]?.monto || 0), 0);
      const subItemsBreakdown = selectedSubItems.map((s, idx) => {
        const amt = selectedSubItemsMap[s.id]?.monto || 0;
        const desc = selectedSubItemsMap[s.id]?.customDescription || s.description || s.label;
        return `${idx + 1}) ${cleanItemDescription(desc)}: S/ ${amt.toFixed(2)}`;
      }).join(' | ');

      orderItems = [{
        id: crypto.randomUUID(),
        ordenId: '',
        quoteSubItemId: selectedSubItems.map(s => s.id).join(','),
        name: cleanItemDescription(consolidatedName.trim() || titulo.trim() || 'Servicio/Compra Consolidada'),
        quantity: 1,
        unitCost: totalAmount,
        total: totalAmount,
        customDescription: `[Consolidado de ${selectedSubItems.length} sub-ítems: ${subItemsBreakdown}]`,
        costPercentage: 100
      }];
    } else {
      orderItems = selectedSubItems.map(s => {
        const state = selectedSubItemsMap[s.id];
        const monto = state.monto || 0;
        const qty = state.quantity || s.quantity || 1;
        const percentage = s.total > 0 ? (monto / s.total) * 100 : 0;
        const adjustedUnitCost = state.unitCost !== undefined && state.unitCost > 0 ? state.unitCost : (qty > 0 ? monto / qty : monto);
        const adjustedTotal = monto;

        return {
          id: crypto.randomUUID(),
          ordenId: '',
          quoteSubItemId: s.id,
          name: cleanItemDescription(state.customDescription || (s as any).description || s.label || 'Ítem'),
          quantity: qty,
          unitCost: adjustedUnitCost,
          total: adjustedTotal,
          customDescription: cleanItemDescription(state.customDescription || (s as any).description),
          costPercentage: percentage
        };
      });
    }

    const totals = calculateTotals();
    const hasDetraccion = totals.hasDetraccion;

    setIsSubmitting(true);
    try {
      let targetOrdenId = '';
      if (ordenToEdit) {
        targetOrdenId = ordenToEdit.id;
        const updatedOrden: Orden = {
          ...ordenToEdit,
          proveedorId: selectedProveedorId,
          clienteId: selectedClienteId,
          proyectoId: selectedProyectoId,
          quoteId: selectedQuoteId,
          items: orderItems,
          total: totals.total,
          condicionesPago: condicionesPago,
          tipoOrden: tipoOrden,
          aplicaDetraccion: hasDetraccion,
          porcentajeDetraccion: hasDetraccion ? porcentajeDetraccion : 0,
          montoDetraccion: hasDetraccion ? totals.montoDetraccion : 0,
          montoNeto: hasDetraccion ? totals.montoNeto : totals.total,
          cuentaBancariaId: selectedCuentaId,
          titulo: titulo.trim() || generateItemsTitle(orderItems)
        };
        await Promise.resolve(updateOrden(updatedOrden));
      } else {
        targetOrdenId = `${tipoOrden === 'Servicio' ? 'OS' : 'OC'}-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
        const newOrden: Orden = {
          id: targetOrdenId,
          proveedorId: selectedProveedorId,
          clienteId: selectedClienteId,
          proyectoId: selectedProyectoId,
          quoteId: selectedQuoteId,
          items: orderItems,
          fechaEmision: new Date().toISOString().split('T')[0],
          total: totals.total,
          estadoEntrega: ((listas?.estadoOrdenEntrega || ['Pendiente'])[0]) as any,
          condicionesPago: condicionesPago,
          tipoOrden: tipoOrden,
          aplicaDetraccion: hasDetraccion,
          porcentajeDetraccion: hasDetraccion ? porcentajeDetraccion : 0,
          montoDetraccion: hasDetraccion ? totals.montoDetraccion : 0,
          montoNeto: hasDetraccion ? totals.montoNeto : totals.total,
          cuentaBancariaId: selectedCuentaId,
          titulo: titulo.trim() || generateItemsTitle(orderItems)
        };
        await Promise.resolve(addOrden(newOrden));
      }

      if (cotizacionFile && targetOrdenId) {
        const formData = new FormData();
        formData.append('cotizacionFile', cotizacionFile);
        const token = localStorage.getItem('token') || '';
        fetch(`/api/ordenes/${targetOrdenId}/upload-cotizacion`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        })
          .then(res => res.json())
          .then(resData => {
            if (resData.success && resData.orden) {
              updateOrden(resData.orden);
              toast.success('Cotización del proveedor subida a Google Drive.');
            }
          })
          .catch(err => {
            console.error('Error subiendo cotización del proveedor:', err);
          });
      }

      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo guardar la orden.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '850px', width: '100%', maxHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h2 className="modal-title">{ordenToEdit ? 'Editar Orden' : 'Nueva Orden de Compra/Servicio'}</h2>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Jerarquía */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <div className="form-group" style={{ minWidth: 0 }}>
                <label>Cliente *</label>
                <select
                  className="form-control"
                  value={selectedClienteId}
                  onChange={e => {
                    setSelectedClienteId(e.target.value);
                    setSelectedProyectoId('');
                    setSelectedQuoteId('');
                    setSelectedSubItemsMap({});
                  }}
                  required
                >
                  <option value="">-- Seleccionar Cliente (Con Proyectos Aprobados) --</option>
                  {eligibleClientes.map(c => <option key={c.id} value={c.id}>{c.empresa}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ minWidth: 0 }}>
                <label>Proyecto *</label>
                <select
                  className="form-control"
                  value={selectedProyectoId}
                  onChange={e => {
                    setSelectedProyectoId(e.target.value);
                    setSelectedQuoteId('');
                    setSelectedSubItemsMap({});
                  }}
                  required
                  disabled={!selectedClienteId}
                >
                  <option value="">-- Seleccionar Proyecto --</option>
                  {filteredProyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <div className="form-group" style={{ minWidth: 0 }}>
                <label>Tipo de Orden *</label>
                <select
                  className="form-control"
                  value={tipoOrden}
                  onChange={e => {
                    const val = e.target.value as 'Compra' | 'Servicio';
                    setTipoOrden(val);
                    setDetraccionManualOverride(false);
                    if (val === 'Servicio' && !isReciboPorHonorarios && currentEstimatedTotal > 700) {
                      setAplicaDetraccion(true);
                      if (porcentajeDetraccion <= 0) setPorcentajeDetraccion(12);
                    } else {
                      setAplicaDetraccion(false);
                    }
                  }}
                  required
                >
                  <option value="Compra">Orden de Compra (Productos/Bienes)</option>
                  <option value="Servicio">Orden de Servicio (Trabajos/Eventos)</option>
                </select>
              </div>
              <div className="form-group" style={{ minWidth: 0 }}>
                <label>Cotización Aprobada *</label>
                <select
                  className="form-control"
                  value={selectedQuoteId}
                  onChange={e => {
                    setSelectedQuoteId(e.target.value);
                    setSelectedSubItemsMap({});
                  }}
                  required
                  disabled={!selectedProyectoId}
                >
                  <option value="">-- Seleccionar Cotización Aprobada --</option>
                  {filteredQuotes.length === 0 && selectedProyectoId ? (
                    <option value="" disabled>No hay cotizaciones aprobadas</option>
                  ) : (
                    filteredQuotes.map(q => {
                      const req = q.requirement ? ` - ${q.requirement}` : '';
                      const dt = q.date ? ` (${q.date})` : '';
                      return (
                        <option key={q.id} value={q.id}>
                          Cotización V{q.version}{req}{dt}
                        </option>
                      );
                    })
                  )}
                </select>
              </div>
            </div>

            {/* Configuración de Detracción SPOT para Órdenes de Servicio */}
            {tipoOrden === 'Servicio' && (
              isReciboPorHonorarios ? (
                <div style={{
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  color: '#92400e'
                }}>
                  <AlertTriangle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '12.5px', lineHeight: '1.4' }}>
                    <strong style={{ display: 'block', color: '#78350f' }}>
                      🚫 Recibo por Honorarios ({selectedProveedor?.razonSocial}): No corresponde Detracción SPOT
                    </strong>
                    <span style={{ fontSize: '11.5px', color: '#b45309' }}>
                      Según normativa SUNAT, los comprobantes de 4ta Categoría (Recibo por Honorarios) no están afectos a detracción SPOT; esta solo aplica a Facturas gravadas con IGV.
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, fontWeight: 700, color: '#166534', fontSize: '13px' }}>
                      <input
                        type="checkbox"
                        checked={aplicaDetraccion}
                        onChange={e => {
                          const checked = e.target.checked;
                          setDetraccionManualOverride(true);
                          setAplicaDetraccion(checked);
                          if (checked && porcentajeDetraccion <= 0) {
                            setPorcentajeDetraccion(12);
                          }
                        }}
                        style={{ width: '16px', height: '16px', accentColor: '#16a34a', cursor: 'pointer' }}
                      />
                      <span>🏛️ Aplica Detracción SUNAT (SPOT para Servicios con Factura)</span>
                    </label>
                    {aplicaDetraccion && (
                      <span style={{ fontSize: '11px', background: '#dcfce7', color: '#15803d', padding: '3px 10px', borderRadius: '12px', fontWeight: 700, border: '1px solid #86efac' }}>
                        Tasa: {porcentajeDetraccion}%
                      </span>
                    )}
                  </div>

                  {aplicaDetraccion && currentEstimatedTotal > 0 && currentEstimatedTotal <= 700 && (
                    <div style={{ fontSize: '11px', color: '#92400e', background: '#fffbeb', padding: '6px 10px', borderRadius: '6px', border: '1px solid #fde68a' }}>
                      ⚠️ El monto estimado (S/ {currentEstimatedTotal.toFixed(2)}) no supera S/ 700. En servicios generales SUNAT, la detracción SPOT usualmente aplica solo a operaciones mayores a S/ 700.
                    </div>
                  )}

                  {aplicaDetraccion && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '4px' }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', color: '#15803d', fontWeight: 600 }}>Seleccionar porcentaje:</span>
                        <button
                          type="button"
                          onClick={() => {
                            setDetraccionManualOverride(true);
                            setPorcentajeDetraccion(10);
                          }}
                          style={{
                            padding: '4px 12px',
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: 600,
                            border: '1px solid #16a34a',
                            background: porcentajeDetraccion === 10 ? '#16a34a' : '#ffffff',
                            color: porcentajeDetraccion === 10 ? '#ffffff' : '#166534',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          10% (Publicidad / Serv. Empresariales)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDetraccionManualOverride(true);
                            setPorcentajeDetraccion(12);
                          }}
                          style={{
                            padding: '4px 12px',
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: 600,
                            border: '1px solid #16a34a',
                            background: porcentajeDetraccion === 12 ? '#16a34a' : '#ffffff',
                            color: porcentajeDetraccion === 12 ? '#ffffff' : '#166534',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          12% (Mantenimiento / Tercerización)
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '12px', color: '#15803d' }}>Otro %:</span>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            step="0.5"
                            value={porcentajeDetraccion}
                            onChange={e => {
                              setDetraccionManualOverride(true);
                              setPorcentajeDetraccion(parseFloat(e.target.value) || 0);
                            }}
                            style={{ width: '60px', padding: '3px 6px', fontSize: '12px', borderRadius: '6px', border: '1px solid #86efac', textAlign: 'center' }}
                          />
                          <span style={{ fontSize: '12px', color: '#15803d' }}>%</span>
                        </div>
                      </div>

                      {(() => {
                        const prov = proveedores.find(p => p.id === selectedProveedorId);
                        const cuentaBN = prov?.cuentas?.find(c =>
                          (c.tipoCuenta || '').toLowerCase().includes('detracc') ||
                          (c.banco || '').toLowerCase().includes('nacion') ||
                          (c.banco || '').toLowerCase().includes('nación')
                        );
                        return cuentaBN ? (
                          <div style={{ fontSize: '11px', color: '#15803d', fontWeight: 600, background: '#ffffff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                            🏦 Cuenta Detracciones BN del Proveedor: <strong>{cuentaBN.numeroCuenta}</strong> ({cuentaBN.banco})
                          </div>
                        ) : (
                          <div style={{ fontSize: '11px', color: '#d97706', background: '#fffbeb', padding: '6px 10px', borderRadius: '6px', border: '1px solid #fde68a' }}>
                            ⚠️ {selectedProveedorId ? 'Este proveedor no tiene registrada cuenta de Detracciones del Banco de la Nación en el sistema.' : 'Seleccione un proveedor para verificar su cuenta del Banco de la Nación.'}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <div className="form-group" style={{ minWidth: 0 }}>
                <label>Proveedor Destino *</label>
                <SearchableProveedorSelect
                  proveedores={proveedores}
                  value={selectedProveedorId}
                  onChange={pId => {
                    setSelectedProveedorId(pId);
                    const prov = proveedores.find(p => p.id === pId);
                    if (isProveedorReciboPorHonorarios(prov)) {
                      setAplicaDetraccion(false);
                    }
                    if (prov && prov.cuentas && prov.cuentas.length > 0) {
                      setSelectedCuentaId(prov.cuentas[0].id);
                    } else {
                      setSelectedCuentaId('');
                    }
                  }}
                  required
                  placeholder="-- Buscar o escribir proveedor --"
                />
                {selectedProveedor && (
                  <div style={{ marginTop: '6px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontWeight: 600,
                      background: isReciboPorHonorarios ? '#fef3c7' : '#eef2ff',
                      color: isReciboPorHonorarios ? '#92400e' : '#3730a3',
                      border: isReciboPorHonorarios ? '1px solid #fde68a' : '1px solid #c7d2fe'
                    }}>
                      {isReciboPorHonorarios
                        ? '📄 Recibo por Honorarios (Sin IGV • Sin Detracción)'
                        : `🧾 ${selectedProveedor.tipoDocumento || 'Factura'} (+18% IGV)`}
                    </span>
                  </div>
                )}
              </div>

              <div className="form-group" style={{ minWidth: 0 }}>
                <label>Cuenta de Depósito</label>
                <select
                  className="form-control"
                  value={selectedCuentaId}
                  onChange={e => setSelectedCuentaId(e.target.value)}
                  disabled={!selectedProveedorId}
                >
                  <option value="">-- Seleccionar Cuenta (Opcional) --</option>
                  {proveedores.find(p => p.id === selectedProveedorId)?.cuentas?.map(c => (
                    <option key={c.id} value={c.id}>{c.banco} ({c.tipoCuenta || 'Cuenta'}) - {c.numeroCuenta}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Banner de Validación de Proveedor para OC/OS */}
            {selectedProveedor && !providerValidation.isValid && (
              <div style={{
                margin: '8px 0 16px 0',
                background: 'rgba(239, 68, 68, 0.07)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: '12px',
                padding: '18px 22px',
                display: 'flex',
                gap: '14px',
                alignItems: 'flex-start'
              }}>
                <AlertTriangle size={24} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ flex: 1, fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <strong style={{ display: 'block', fontSize: '14px', color: '#b91c1c', marginBottom: '4px' }}>
                        ⚠️ Emisión de Orden Bloqueada — Datos Incompletos del Proveedor
                      </strong>
                      <span style={{ color: '#7f1d1d', lineHeight: '1.4' }}>
                        Para emitir una orden formal para <strong>{selectedProveedor.razonSocial}</strong>, SUNAT y Finanzas requieren sus datos fiscales y bancarios:
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setIsEditProveedorOpen(true)}
                      style={{
                        background: '#dc2626',
                        borderColor: '#b91c1c',
                        color: 'white',
                        fontSize: '12px',
                        padding: '6px 14px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        borderRadius: '8px'
                      }}
                    >
                      <Edit size={14} /> Completar Datos Ahora
                    </button>
                  </div>
                  <ul style={{ margin: '10px 0 0 18px', padding: 0 }}>
                    {providerValidation.missing.map((m, i) => (
                      <li key={i} style={{ fontWeight: 600, color: '#b91c1c', marginTop: '3px' }}>
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {selectedProveedor && providerValidation.isValid && (
              <div style={{
                margin: '6px 0 14px 0',
                background: 'rgba(16, 185, 129, 0.07)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '10px',
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontSize: '13px',
                color: '#065f46'
              }}>
                <CheckCircle2 size={18} color="#059669" />
                <span>
                  <strong>Proveedor Apto:</strong> RUC {selectedProveedor.ruc} ({selectedProveedor.tipoDocumento || 'Factura'}) | {selectedProveedor.cuentas?.length || 0} cuenta(s) bancaria(s) registrada(s).
                </span>
              </div>
            )}

            {/* Título / Concepto de la Orden */}
            <div className="form-group" style={{ marginTop: '4px' }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Concepto / Refiere a (Título Breve) *</span>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>
                  Aparecerá en el PDF de la orden y se heredará en el pago a proveedor
                </span>
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="ej. Fabricación de Mueble Exhibidor y Letrero Acrílico"
                value={titulo}
                onChange={e => {
                  setTitulo(e.target.value);
                  setIsTituloManual(true);
                }}
                required
              />
            </div>

            {/* Adjuntar Cotización del Proveedor (PDF o Imagen) */}
            <div style={{
              background: '#f8fafc',
              border: '1px dashed #cbd5e1',
              borderRadius: '10px',
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                <label style={{ margin: 0, fontWeight: 600, fontSize: '13px', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Paperclip size={15} color="var(--accent-primary)" />
                  Cotización del Proveedor (PDF o Imagen)
                </label>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Se archivará en Drive dentro de <strong>Cotizaciones de proveedores</strong>
                </span>
              </div>

              {ordenToEdit?.cotizacionProveedorUrl && !cotizacionFile && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', background: '#ecfdf5', padding: '6px 12px', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                  <CheckCircle2 size={15} color="#059669" />
                  <span style={{ color: '#065f46', fontWeight: 500 }}>
                    Cotización registrada: <strong>{ordenToEdit.cotizacionProveedorName || 'Archivo en Drive'}</strong>
                  </span>
                  <a
                    href={ordenToEdit.cotizacionProveedorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ marginLeft: 'auto', color: '#059669', fontWeight: 600, textDecoration: 'underline' }}
                  >
                    Abrir en Drive
                  </a>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <input
                  type="file"
                  id="modal-cotizacion-prov-input"
                  accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      setCotizacionFile(e.target.files[0]);
                    }
                  }}
                  style={{ display: 'none' }}
                />
                <label
                  htmlFor="modal-cotizacion-prov-input"
                  className="btn-secondary"
                  style={{ cursor: 'pointer', padding: '6px 14px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Upload size={14} />
                  {cotizacionFile ? 'Cambiar archivo' : (ordenToEdit?.cotizacionProveedorUrl ? 'Reemplazar cotización' : 'Adjuntar cotización del proveedor')}
                </label>

                {cotizacionFile && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-primary)', background: '#ffffff', padding: '4px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <FileText size={14} color="var(--accent-primary)" />
                    <span style={{ fontWeight: 600 }}>{cotizacionFile.name}</span>
                    <span style={{ color: '#64748b' }}>({(cotizacionFile.size / 1024).toFixed(1)} KB)</span>
                    <button
                      type="button"
                      onClick={() => setCotizacionFile(null)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                      title="Quitar archivo"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Subítems */}
            {selectedQuoteId && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Ítems a incluir en la Orden</h3>
                  <button type="button" className="btn-secondary" onClick={handleSelectAll} style={{ padding: '4px 10px', fontSize: 'var(--text-sm)' }}>
                    {Object.keys(selectedSubItemsMap).length === availableSubItems.length && availableSubItems.length > 0 ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
                  </button>
                </div>

                {/* OPCIÓN DE CONSOLIDACIÓN DE SUB-ÍTEMS (FACTURA POR ÍTEM ÚNICO) */}
                {Object.keys(selectedSubItemsMap).length > 1 && (
                  <div style={{
                    background: isConsolidated ? 'rgba(124, 58, 237, 0.07)' : '#f8fafc',
                    border: isConsolidated ? '1.5px solid #7c3aed' : '1px dashed #cbd5e1',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    marginBottom: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => {
                      const nextVal = !isConsolidated;
                      setIsConsolidated(nextVal);
                      if (nextVal && !consolidatedName) {
                        setConsolidatedName(titulo || 'Servicio Integral Contratado');
                      }
                    }}>
                      <input
                        type="checkbox"
                        id="chkConsolidate"
                        checked={isConsolidated}
                        onChange={e => {
                          setIsConsolidated(e.target.checked);
                          if (e.target.checked && !consolidatedName) {
                            setConsolidatedName(titulo || 'Servicio Integral Contratado');
                          }
                        }}
                        style={{ width: '17px', height: '17px', accentColor: '#7c3aed', cursor: 'pointer' }}
                      />
                      <label htmlFor="chkConsolidate" style={{ margin: 0, fontWeight: 700, fontSize: '12.5px', color: '#1e293b', cursor: 'pointer' }}>
                        📄 Factura por ítem único (Consolidar los {Object.keys(selectedSubItemsMap).length} sub-ítems en 1 sola línea para el proveedor)
                      </label>
                    </div>

                    {isConsolidated && (
                      <div style={{ paddingLeft: '27px', marginTop: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '3px' }}>
                          Concepto comercial único para la orden/factura:
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          value={consolidatedName}
                          onChange={e => setConsolidatedName(e.target.value)}
                          placeholder="Ej: Servicio de Fabricación y Acabado Integral..."
                          style={{ fontSize: '12px', padding: '6px 10px', background: '#ffffff', borderRadius: '6px' }}
                        />
                        <span style={{ fontSize: '11px', color: '#6d28d9', marginTop: '3px', display: 'block' }}>
                          ✓ La orden se emitirá con 1 solo ítem comercial por el total, pero registrará el detalle de cada sub-ítem para liquidar costos con exactitud.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {availableSubItems.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: '20px', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #e2e8f0', margin: '8px 0' }}>No hay subítems en esta cotización.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '340px', overflowY: 'auto', padding: '4px', margin: '8px 0 16px 0' }}>
                    {availableSubItems.map(sub => {
                      const isSelected = !!selectedSubItemsMap[sub.id];
                      const state = selectedSubItemsMap[sub.id];
                      const adjustedTotal = isSelected && state ? state.monto : 0;

                      return (
                        <div
                          key={sub.id}
                          style={{
                            display: 'flex', flexDirection: 'column', gap: '10px',
                            padding: '14px 16px', background: isSelected ? '#f5f3ff' : '#ffffff',
                            border: `1.5px solid ${isSelected ? 'var(--accent-primary)' : '#e2e8f0'}`,
                            borderRadius: '10px', boxShadow: isSelected ? '0 2px 8px rgba(124, 58, 237, 0.08)' : '0 1px 3px rgba(0,0,0,0.02)',
                            transition: 'all 0.2s'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flex: 1, minWidth: 0 }} onClick={() => toggleSubItem(sub)}>
                              <div style={{
                                width: '20px', height: '20px', borderRadius: '4px', border: `1px solid ${isSelected ? 'var(--accent-primary)' : '#cbd5e1'}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', background: isSelected ? 'var(--accent-primary)' : 'white',
                                flexShrink: 0
                              }}>
                                {isSelected && <Check size={14} color="white" />}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {sub.label}
                                </div>
                                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', flexWrap: 'wrap' }}>
                                  <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '1px 7px', borderRadius: '4px', fontWeight: 700 }}>
                                    Cotización: {sub.quantity} {sub.quantity === 1 ? 'unidad' : 'unidades'}
                                  </span>
                                  {sub.dates > 1 && (
                                    <span style={{ color: '#64748b' }}>• {sub.dates} días</span>
                                  )}
                                  <span style={{ color: '#64748b' }}>• P. Unit: S/ {sub.unitCost.toFixed(2)}</span>
                                  <span style={{ color: '#059669', fontWeight: 600 }}>• Total Cotizado: S/ {sub.total.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>

                            {isSelected && (
                              <div style={{ fontWeight: 'bold', color: 'var(--accent-primary)', flexShrink: 0, textAlign: 'right' }}>
                                <div style={{ fontSize: '14px' }}>S/ {adjustedTotal.toFixed(2)}</div>
                                <div style={{ fontSize: '11px', color: '#6d28d9', fontWeight: 600 }}>
                                  {state.quantity} un. × S/ {state.unitCost.toFixed(2)}
                                </div>
                              </div>
                            )}
                          </div>

                          {isSelected && (
                            <div style={{
                              display: 'grid',
                              gridTemplateColumns: 'minmax(0, 2fr) 110px 120px 130px',
                              gap: '10px',
                              marginTop: '8px',
                              paddingTop: '10px',
                              borderTop: '1px dashed #ddd6fe',
                              alignItems: 'flex-start'
                            }}>
                              <div className="form-group" style={{ marginBottom: 0, minWidth: 0 }}>
                                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                  Descripción para Proveedor
                                </label>
                                <input
                                  type="text"
                                  className="form-control"
                                  style={{ padding: '6px 10px', fontSize: 'var(--text-sm)' }}
                                  value={state.customDescription}
                                  onChange={(e) => updateSubItemState(sub.id, 'customDescription', e.target.value)}
                                  placeholder="Ej: Impresión de banners..."
                                />
                              </div>

                              <div className="form-group" style={{ marginBottom: 0, minWidth: 0 }}>
                                <label style={{ fontSize: '11px', fontWeight: 700, color: '#6d28d9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <span>Cantidad *</span>
                                  <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 500 }} title="Cantidad presupuestada en la cotización">
                                    (Cot: {sub.quantity})
                                  </span>
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  className="form-control"
                                  style={{ padding: '6px 8px', fontSize: 'var(--text-sm)', textAlign: 'center', fontWeight: 700, borderColor: '#c4b5fd' }}
                                  value={state.quantity}
                                  onChange={(e) => updateSubItemState(sub.id, 'quantity', e.target.value)}
                                  title="Cantidad a ordenar al proveedor"
                                />
                              </div>

                              <div className="form-group" style={{ marginBottom: 0, minWidth: 0 }}>
                                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                  P. Unitario (S/)
                                </label>
                                <div style={{ position: 'relative' }}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    className="form-control"
                                    style={{ padding: '6px 8px', fontSize: 'var(--text-sm)', paddingLeft: '24px', textAlign: 'right' }}
                                    value={state.unitCost}
                                    onChange={(e) => updateSubItemState(sub.id, 'unitCost', e.target.value)}
                                  />
                                  <span style={{ position: 'absolute', left: '7px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '11px' }}>S/</span>
                                </div>
                              </div>

                              <div className="form-group" style={{ marginBottom: 0, minWidth: 0 }}>
                                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                  Total Ítem (S/)
                                </label>
                                <div style={{ position: 'relative' }}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    className="form-control"
                                    style={{ padding: '6px 8px', fontSize: 'var(--text-sm)', paddingLeft: '24px', textAlign: 'right', fontWeight: 700, color: '#059669' }}
                                    value={state.monto}
                                    onChange={(e) => updateSubItemState(sub.id, 'monto', e.target.value)}
                                  />
                                  <span style={{ position: 'absolute', left: '7px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '11px' }}>S/</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={{ marginTop: '16px' }} className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ margin: 0, fontWeight: 600 }}>Condiciones de Pago</label>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Configurable en Administración &gt; Configuración
                    </span>
                  </div>
                  <select
                    className="form-control"
                    value={condicionesPago}
                    onChange={e => setCondicionesPago(e.target.value)}
                  >
                    {condicionesOptions.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                {(() => {
                  const totals = calculateTotals();
                  const pctAdelanto = totals.porcentajeAdelanto;
                  const pctSaldo = Math.max(0, 1 - pctAdelanto);

                  return (
                    <div style={{ marginTop: '20px', marginBottom: '6px', padding: '20px 22px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Subtotal:</span>
                        <span style={{ fontWeight: 500 }}>S/ {totals.subTotal.toFixed(2)}</span>
                      </div>
                      {totals.tieneIgv && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>IGV (18%):</span>
                          <span style={{ fontWeight: 500 }}>S/ {totals.igv.toFixed(2)}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '10px', marginTop: '4px' }}>
                        <span style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)' }}>
                          Total de la Orden {totals.hasDetraccion ? '(Bruto)' : ''}:
                        </span>
                        <span style={{ fontSize: '1.35rem', fontWeight: 'bold', color: 'var(--accent-primary)' }}>S/ {totals.total.toFixed(2)}</span>
                      </div>

                      {totals.hasDetraccion && (
                        <div style={{ padding: '12px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#166534' }}>
                            <span>🏛️ Detracción SPOT ({porcentajeDetraccion}% Banco de la Nación):</span>
                            <span style={{ fontWeight: 700 }}>- S/ {totals.montoDetraccion.toFixed(2)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#047857', fontWeight: 700, borderTop: '1px dashed #86efac', paddingTop: '6px' }}>
                            <span>Neto a Transferir al Proveedor:</span>
                            <span style={{ fontSize: '1.2rem' }}>S/ {totals.montoNeto.toFixed(2)}</span>
                          </div>
                        </div>
                      )}

                      {pctAdelanto > 0 && pctAdelanto < 1 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px', marginTop: '12px', padding: '14px 18px', background: 'rgba(102, 45, 145, 0.06)', border: '1px solid rgba(102, 45, 145, 0.15)', borderRadius: '10px' }}>
                          <div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Adelanto ({(pctAdelanto * 100).toFixed(0)}%)</div>
                            <div style={{ fontWeight: 'bold', color: 'var(--accent-primary)', fontSize: '14px', marginTop: '2px' }}>
                              S/ {totals.adelanto.toFixed(2)}
                              {totals.hasDetraccion && (
                                <span style={{ display: 'block', fontSize: '11px', color: '#059669', fontWeight: 600 }}>
                                  (Neto comercial: S/ {totals.adelantoNeto.toFixed(2)})
                                </span>
                              )}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Saldo Contra Entrega ({(pctSaldo * 100).toFixed(0)}%)</div>
                            <div style={{ fontWeight: 'bold', color: 'var(--info)', fontSize: '14px', marginTop: '2px' }}>
                              S/ {totals.saldo.toFixed(2)}
                              {totals.hasDetraccion && (
                                <span style={{ display: 'block', fontSize: '11px', color: '#059669', fontWeight: 600 }}>
                                  (Neto comercial: S/ {totals.saldoNeto.toFixed(2)})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {pctAdelanto === 1 && (
                        <div style={{ marginTop: '10px', padding: '10px 14px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: '#047857', fontWeight: 600 }}>Modalidad: 100% Contado / Adelanto</span>
                          <span style={{ fontWeight: 700, color: '#047857', fontSize: '14px' }}>S/ {totals.total.toFixed(2)}</span>
                        </div>
                      )}

                      {pctAdelanto === 0 && (
                        <div style={{ marginTop: '10px', padding: '10px 14px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: '#1d4ed8', fontWeight: 600 }}>Modalidad: 100% Contra Entrega / Crédito</span>
                          <span style={{ fontWeight: 700, color: '#1d4ed8', fontSize: '14px' }}>S/ {totals.total.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          <div className="modal-footer" style={{ flexShrink: 0, padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#fafafa', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmitting}>Cancelar</button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!providerValidation.isValid || isSubmitting}
              title={!providerValidation.isValid ? 'Complete el RUC y cuenta bancaria del proveedor para emitir la orden' : ''}
              style={{
                opacity: (!providerValidation.isValid || isSubmitting) ? 0.5 : 1,
                cursor: (!providerValidation.isValid || isSubmitting) ? 'not-allowed' : 'pointer'
              }}
            >
              <Save size={18} /> {isSubmitting ? 'Guardando...' : (ordenToEdit ? 'Guardar Cambios' : 'Generar Orden')}
            </button>
          </div>
        </form>
      </div>

      {/* Modal para completar datos del proveedor en caliente */}
      {isEditProveedorOpen && selectedProveedor && (
        <CreateProveedorModal
          isOpen={isEditProveedorOpen}
          onClose={() => setIsEditProveedorOpen(false)}
          proveedorToEdit={selectedProveedor}
        />
      )}
    </div>,
    document.body
  );
};
