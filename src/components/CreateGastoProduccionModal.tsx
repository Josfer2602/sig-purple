import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { X, Save, Upload } from 'lucide-react'; // 'Save' ahora se usará
import { useGlobalContext } from '../context/GlobalContext';
import type { GastoProduccion } from '../types/models';
import toast from 'react-hot-toast';

interface CreateGastoProduccionModalProps {
  isOpen: boolean;
  onClose: () => void;
  gastoToEdit?: GastoProduccion | null;
}

interface SelectedSubItemState {
  id: string;
  customDescription: string;
  costPercentage: number;
}

export const CreateGastoProduccionModal: React.FC<CreateGastoProduccionModalProps> = ({ isOpen, onClose, gastoToEdit }) => {
  const { clientes, proyectos, quotes, addGastoProduccion, updateGastoProduccion, usuarios, currentUser } = useGlobalContext();

  // --- ESTADOS ---
  const [selectedClienteId, setSelectedClienteId] = useState('');
  const [selectedProyectoId, setSelectedProyectoId] = useState('');
  const [selectedQuoteId, setSelectedQuoteId] = useState('');
  const [tipoComprobante, setTipoComprobante] = useState('Boleta');
  const [numeroComprobante, setNumeroComprobante] = useState('');
  const [fechaEmision, setFechaEmision] = useState(new Date().toISOString().split('T')[0]);
  const [areaResponsable, setAreaResponsable] = useState('');
  const [estadoGasto, setEstadoGasto] = useState<'Pendiente' | 'Devuelto'>('Pendiente');
  const [esGastoAdicional, setEsGastoAdicional] = useState(false);
  const [motivoAdicional, setMotivoAdicional] = useState('');
  const [selectedSubItemsMap, setSelectedSubItemsMap] = useState<Record<string, SelectedSubItemState>>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- EFECTO PARA CARGAR DATOS AL EDITAR ---
  useEffect(() => {
    if (!isOpen) {
      setSelectedClienteId('');
      setSelectedProyectoId('');
      setSelectedQuoteId('');
      setTipoComprobante('Boleta');
      setNumeroComprobante('');
      setFechaEmision(new Date().toISOString().split('T')[0]);
      setAreaResponsable(currentUser?.email || (usuarios[0]?.email || ''));
      setEstadoGasto('Pendiente');
      setEsGastoAdicional(false);
      setMotivoAdicional('');
      setSelectedSubItemsMap({});
      setSelectedFile(null);
    } else if (gastoToEdit) {
      setSelectedClienteId(gastoToEdit.clienteId);
      setSelectedProyectoId(gastoToEdit.proyectoId);
      setSelectedQuoteId(gastoToEdit.quoteId);
      setTipoComprobante(gastoToEdit.tipoComprobante || 'Boleta');
      setNumeroComprobante(gastoToEdit.numeroComprobante || '');
      setFechaEmision(gastoToEdit.fechaEmision || new Date().toISOString().split('T')[0]);
      setAreaResponsable(gastoToEdit.areaResponsable || currentUser?.email || (usuarios[0]?.email || ''));
      setEsGastoAdicional(Boolean(gastoToEdit.esGastoAdicional));
      setMotivoAdicional(gastoToEdit.motivoAdicional || '');
      setEstadoGasto(
        (gastoToEdit.estadoGasto === 'Devuelto' || gastoToEdit.estadoGasto === 'Reembolsado' || gastoToEdit.estadoGasto === 'Pagado')
          ? 'Devuelto'
          : 'Pendiente'
      );

      const map: Record<string, SelectedSubItemState> = {};
      gastoToEdit.items.forEach(item => {
        const parts = String(item.name || '').split(' — ');
        const detalle = parts.length > 1 ? parts.slice(1).join(' — ') : '';
        map[item.quoteSubItemId] = {
          id: item.quoteSubItemId,
          customDescription: detalle,
          costPercentage: item.costPercentage
        };
      });
      setSelectedSubItemsMap(map);
    } else {
      // Modal recién abierto para nuevo gasto
      if (!areaResponsable) {
        setAreaResponsable(currentUser?.email || (usuarios[0]?.email || ''));
      }
      setEstadoGasto('Pendiente');
    }
  }, [isOpen, gastoToEdit, currentUser, usuarios]);

  // --- FILTROS Y AYUDANTES ---
  const filteredProyectos = proyectos.filter(p => p.clienteId === selectedClienteId);
  const filteredQuotes = quotes.filter(q => {
    const s = (q.status || '').toLowerCase();
    return q.projectId === selectedProyectoId && (s.includes('aprob') || s.includes('liquid'));
  });
  const selectedQuote = quotes.find(q => q.id === selectedQuoteId);

  const availableSubItems = useMemo(() => {
    if (!selectedQuote) return [];
    const items: Array<{ id: string, label: string, quantity: number, unitCost: number, dates: number, total: number }> = [];

    selectedQuote.categories.forEach(cat => {
      cat.items.forEach(item => {
        item.subItems.forEach(sub => {
          items.push({
            id: sub.id,
            label: `${cat.name} > ${item.name} > ${sub.name}`,
            quantity: sub.quantity,
            unitCost: sub.unitCost,
            dates: Number(sub.dates) || 1,
            total: sub.quantity * (Number(sub.dates) || 1) * sub.unitCost
          });
        });
      });
    });
    return items;
  }, [selectedQuote]);

  const toggleSubItem = (sub: any) => {
    const newMap = { ...selectedSubItemsMap };
    if (newMap[sub.id]) delete newMap[sub.id];
    else {
      newMap[sub.id] = { id: sub.id, customDescription: '', costPercentage: 100 };
    }
    setSelectedSubItemsMap(newMap);
  };

  // --- FUNCIÓN QUE QUITA EL AVISO AMARILLO DE handleSelectAll ---
  const handleSelectAll = () => {
    if (Object.keys(selectedSubItemsMap).length === availableSubItems.length) {
      setSelectedSubItemsMap({});
    } else {
      const newMap: Record<string, SelectedSubItemState> = {};
      availableSubItems.forEach(s => {
        newMap[s.id] = {
          id: s.id,
          customDescription: selectedSubItemsMap[s.id]?.customDescription || '',
          costPercentage: selectedSubItemsMap[s.id]?.costPercentage || 100
        };
      });
      setSelectedSubItemsMap(newMap);
    }
  };

  const totalGasto = availableSubItems
    .filter(s => selectedSubItemsMap[s.id])
    .reduce((acc, curr) => {
      const percentage = selectedSubItemsMap[curr.id].costPercentage || 0;
      return acc + (curr.total * (percentage / 100));
    }, 0);

  // --- ENVÍO DE DATOS ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(selectedSubItemsMap).length === 0) {
      toast.error("Debes seleccionar al menos un ítem");
      return;
    }

    const proyObj = proyectos.find(p => p.id === selectedProyectoId);

    const itemsParaGuardar = availableSubItems
      .filter(s => selectedSubItemsMap[s.id])
      .map(s => {
        const itemState = selectedSubItemsMap[s.id];
        const detalle = (itemState?.customDescription || '').trim();
        const finalName = detalle ? `${s.label} — ${detalle}` : s.label;
        const pct = Number(itemState?.costPercentage) || 100;
        return {
          id: `item-${Date.now()}-${s.id}`,
          quoteSubItemId: s.id,
          name: finalName,
          costPercentage: pct,
          monto: s.total * (pct / 100)
        };
      });

    const gastoData = {
      clienteId: selectedClienteId,
      proyectoId: selectedProyectoId,
      proyectoNombre: proyObj?.nombre || 'General',
      proveedorNombre: areaResponsable,
      quoteId: selectedQuoteId,
      tipoComprobante,
      numeroComprobante,
      fechaEmision: fechaEmision || new Date().toISOString().split('T')[0],
      areaResponsable,
      estadoGasto,
      esGastoAdicional,
      motivoAdicional: esGastoAdicional ? motivoAdicional : '',
      items: itemsParaGuardar,
      total: totalGasto
    };

    const formData = new FormData();
    formData.append('data', JSON.stringify(gastoData));
    if (selectedFile) formData.append('comprobanteUrl', selectedFile);

    try {
      if (gastoToEdit) {
        await updateGastoProduccion(gastoToEdit.id, formData);
      } else {
        await addGastoProduccion(formData);
      }
      onClose();
    } catch (error) {
      toast.error("Error al guardar el gasto");
    }
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '850px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
        <div className="modal-header">
          <h2 className="modal-title">{gastoToEdit ? 'Editar Gasto' : 'Nuevo Gasto de Producción'}</h2>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <div className="form-group" style={{ minWidth: 0 }}>
                <label>Cliente *</label>
                <select className="form-control" value={selectedClienteId} onChange={e => setSelectedClienteId(e.target.value)} required>
                  <option value="">-- Seleccionar Cliente --</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.empresa}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ minWidth: 0 }}>
                <label>Proyecto *</label>
                <select className="form-control" value={selectedProyectoId} onChange={e => setSelectedProyectoId(e.target.value)} required disabled={!selectedClienteId}>
                  <option value="">-- Seleccionar Proyecto --</option>
                  {filteredProyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px' }}>
              <div className="form-group" style={{ minWidth: 0 }}>
                <label>Cotización Aprobada *</label>
                <select className="form-control" value={selectedQuoteId} onChange={e => setSelectedQuoteId(e.target.value)} required disabled={!selectedProyectoId}>
                  <option value="">-- Seleccionar Cotización --</option>
                  {filteredQuotes.map(q => <option key={q.id} value={q.id}>V{q.version} - {q.requirement}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ minWidth: 0 }}>
                <label>Tipo Comprobante *</label>
                <select className="form-control" value={tipoComprobante} onChange={e => setTipoComprobante(e.target.value)} required>
                  <option value="Boleta">Boleta</option>
                  <option value="Factura">Factura</option>
                  <option value="Recibo por Honorarios">Recibo por Honorarios</option>
                  <option value="Ticket">Ticket / Vale</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              <div className="form-group" style={{ minWidth: 0 }}>
                <label>N° Comprobante *</label>
                <input type="text" className="form-control" placeholder="Ej: B001-00123" value={numeroComprobante} onChange={e => setNumeroComprobante(e.target.value)} required />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <div className="form-group" style={{ minWidth: 0 }}>
                <label>Fecha de Emisión *</label>
                <input 
                  type="date" 
                  className="form-control" 
                  value={fechaEmision} 
                  onChange={e => setFechaEmision(e.target.value)} 
                  required 
                />
              </div>
              <div className="form-group" style={{ minWidth: 0 }}>
                <label>A quién se devuelve (Usuario) *</label>
                <select
                  className="form-control"
                  value={areaResponsable}
                  onChange={e => setAreaResponsable(e.target.value)}
                  required
                >
                  <option value="">-- Seleccionar Usuario --</option>
                  {usuarios.map(u => (
                    <option key={u.id} value={u.email}>{u.email}</option>
                  ))}
                  {/* Si el valor actual no está en la lista de usuarios (ej. legacy), mostrarlo para no perderlo */}
                  {areaResponsable && !usuarios.some(u => u.email === areaResponsable) && (
                    <option value={areaResponsable}>{areaResponsable}</option>
                  )}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <div className="form-group" style={{ minWidth: 0 }}>
                <label>Estado *</label>
                <select
                  className="form-control"
                  value={estadoGasto}
                  onChange={e => setEstadoGasto(e.target.value as 'Pendiente' | 'Devuelto')}
                  required
                >
                  <option value="Pendiente">⏳ Pendiente</option>
                  <option value="Devuelto">✓ Devuelto</option>
                </select>
              </div>
              <div className="form-group" style={{ minWidth: 0 }}>
                <label>Adjuntar Archivo</label>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={e => e.target.files && setSelectedFile(e.target.files[0])} accept=".pdf,image/*" />
                <button type="button" className="btn-secondary" style={{ width: '100%', height: '39px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onClick={() => fileInputRef.current?.click()}>
                  <Upload size={16} color="var(--accent-primary)" />
                  <span style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedFile ? selectedFile.name : 'Subir Archivo'}
                  </span>
                </button>
              </div>
            </div>

            {/* SECCIÓN DE GASTO ADICIONAL / FUERA DE PRESUPUESTO */}
            <div style={{ 
              marginTop: '16px',
              marginBottom: '16px',
              padding: '12px 16px', 
              borderRadius: '10px', 
              backgroundColor: esGastoAdicional ? 'rgba(245, 158, 11, 0.08)' : 'rgba(0, 0, 0, 0.02)', 
              border: esGastoAdicional ? '1px solid #f59e0b' : '1px solid var(--border-color)',
              transition: 'all 0.2s'
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '13px', color: esGastoAdicional ? '#b45309' : 'var(--text-primary)', margin: 0 }}>
                <input 
                  type="checkbox"
                  checked={esGastoAdicional}
                  onChange={e => setEsGastoAdicional(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#f59e0b' }}
                />
                ⚡ ¿Es un Gasto Adicional / Fuera de Presupuesto?
              </label>
              <p style={{ margin: '4px 0 0 28px', fontSize: '12px', color: 'var(--text-muted)' }}>
                Si se activa, este gasto se contabilizará en la columna <strong>GASTOS ADICIONALES</strong> de Rentabilidad por Proyecto en lugar del costo base presupuestado.
              </p>

              {esGastoAdicional && (
                <div style={{ marginTop: '10px', marginLeft: '28px' }}>
                  <input 
                    type="text"
                    className="form-control"
                    placeholder="Motivo / Justificación del Gasto Adicional (ej. Imprevisto en locación, flete extra, merma)..."
                    value={motivoAdicional}
                    onChange={e => setMotivoAdicional(e.target.value)}
                    style={{ fontSize: '13px' }}
                  />
                </div>
              )}
            </div>

            {selectedQuote && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Ítems a Gastar</h3>
                  <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={handleSelectAll}>
                    {Object.keys(selectedSubItemsMap).length === availableSubItems.length ? 'Desmarcar Todo' : 'Seleccionar Todo'}
                  </button>
                </div>
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', overflowX: 'auto', background: '#ffffff' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}></th>
                        <th>Ítem Cotizado</th>
                        <th style={{ textAlign: 'right' }}>Presupuesto</th>
                        <th style={{ textAlign: 'center', width: '80px' }}>%</th>
                        <th style={{ textAlign: 'right' }}>Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {availableSubItems.map((sub) => (
                        <tr key={sub.id}>
                          <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: '12px' }}>
                            <input type="checkbox" style={{ accentColor: 'var(--accent-primary)', cursor: 'pointer' }} checked={!!selectedSubItemsMap[sub.id]} onChange={() => toggleSubItem(sub)} />
                          </td>
                          <td style={{ verticalAlign: 'top', paddingTop: '10px' }}>
                            <div style={{ fontWeight: 500, fontSize: '13px' }}>{sub.label}</div>
                            {selectedSubItemsMap[sub.id] && (
                              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '11px', color: 'var(--accent-primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  Detalle:
                                </span>
                                <input
                                  type="text"
                                  className="form-control"
                                  placeholder="Especificar detalle del gasto (opcional)..."
                                  value={selectedSubItemsMap[sub.id].customDescription || ''}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setSelectedSubItemsMap(prev => ({
                                      ...prev,
                                      [sub.id]: { ...prev[sub.id], customDescription: val }
                                    }));
                                  }}
                                  style={{ fontSize: '12px', padding: '4px 8px', height: '30px', backgroundColor: '#f8fafc', borderColor: '#cbd5e1', width: '100%' }}
                                />
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top', paddingTop: '12px' }}>S/ {sub.total.toFixed(2)}</td>
                          <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: '8px' }}>
                            {selectedSubItemsMap[sub.id] && (
                              <input type="number" className="form-control" style={{ width: '65px', padding: '4px 6px', textAlign: 'center' }} value={selectedSubItemsMap[sub.id].costPercentage}
                                onChange={e => setSelectedSubItemsMap(prev => ({ ...prev, [sub.id]: { ...prev[sub.id], costPercentage: Number(e.target.value) } }))} />
                            )}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: '600', color: 'var(--accent-primary)', whiteSpace: 'nowrap', verticalAlign: 'top', paddingTop: '12px' }}>
                            S/ {(sub.total * ((selectedSubItemsMap[sub.id]?.costPercentage || 0) / 100)).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ textAlign: 'right', fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--accent-primary)', marginTop: '8px' }}>
              TOTAL: S/ {totalGasto.toFixed(2)}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary">
              <Save size={18} />
              Guardar Gasto
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};