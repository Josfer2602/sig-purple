import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, Save, Plus, AlertTriangle, AlertCircle, Check, ArrowLeft, Folder, Loader2, User } from 'lucide-react';
import { useGlobalContext } from '../context/GlobalContext';
import type { Proyecto } from '../types/models';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  proyecto?: Proyecto | null;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({ isOpen, onClose, proyecto }) => {
  const { clientes, addProyecto, updateProyecto, proyectos, listas } = useGlobalContext();
  const [formData, setFormData] = useState<Partial<Proyecto>>({
    nombre: '',
    clienteId: '',
    tipoServicio: '',
    tipoProyecto: '',
    presupuestoEstimado: '',
    projectManager: 'Eric Higa',
    statusActividad: '',
    comentarios: '',
    gastosAdicionales: 0,
    gastosAdicionalesNota: '',
    estado: 'Registrado',
    contactoId: '',
    contactoNombre: '',
    contactoCargo: '',
    contactoEmail: '',
    contactoTelefono: '',
  });
  
  const parseList = (jsonStr?: string) => {
    if (!jsonStr) return [];
    try { return JSON.parse(jsonStr) as string[]; } catch { return []; }
  };
  
  const [ocs, setOcs] = useState<string[]>([]);
  const [oss, setOss] = useState<string[]>([]);
  const [newOc, setNewOc] = useState('');
  const [newOs, setNewOs] = useState('');

  // Estados para el Pop-up de confirmación obligatoria
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const selectedCliente = clientes.find(c => c.id === formData.clienteId);

  const handleClienteChange = (newClienteId: string) => {
    const targetCli = clientes.find(c => c.id === newClienteId);
    let principalContact: any = null;
    if (targetCli) {
      if (Array.isArray(targetCli.contactos) && targetCli.contactos.length > 0) {
        principalContact = targetCli.contactos.find(c => c.esPrincipal) || targetCli.contactos[0];
      } else if (targetCli.contacto) {
        principalContact = {
          id: `legacy-${targetCli.id}`,
          nombre: targetCli.contacto,
          cargo: targetCli.cargo || '',
          email: targetCli.email || '',
          telefono: targetCli.telefono || ''
        };
      }
    }

    setFormData(prev => ({
      ...prev,
      clienteId: newClienteId,
      contactoId: principalContact?.id || principalContact?.nombre || '',
      contactoNombre: principalContact?.nombre || '',
      contactoCargo: principalContact?.cargo || '',
      contactoEmail: principalContact?.email || '',
      contactoTelefono: principalContact?.telefono || ''
    }));
  };

  useEffect(() => {
    if (proyecto) {
      setFormData(proyecto);
      setOcs(parseList(proyecto.ordenesCompra));
      setOss(parseList(proyecto.ordenesServicio));
    } else {
      setFormData({
        nombre: '',
        clienteId: '',
        tipoServicio: '',
        tipoProyecto: '',
        presupuestoEstimado: '',
        projectManager: 'Eric Higa',
        statusActividad: '',
        comentarios: '',
        gastosAdicionales: 0,
        gastosAdicionalesNota: '',
        moneda: 'PEN',
        estado: 'PENDIENTE CP',
        contactoId: '',
        contactoNombre: '',
        contactoCargo: '',
        contactoEmail: '',
        contactoTelefono: '',
      });
      setOcs([]);
      setOss([]);
    }
    setNewOc('');
    setNewOs('');
  }, [proyecto, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre?.trim() || !formData.clienteId) return;

    if (proyecto) {
      // Editar
      const dataToSave = {
        ...formData,
        tipoServicio: (formData.tipoServicio || '-').trim().toUpperCase(),
        ordenesCompra: JSON.stringify(ocs),
        ordenesServicio: JSON.stringify(oss),
      };
      await updateProyecto(proyecto.id, dataToSave);
      onClose();
    } else {
      // Crear: Abrir pop-up de confirmación obligatoria
      setShowConfirmModal(true);
    }
  };

  const handleConfirmCreate = async () => {
    if (!formData.nombre?.trim() || !formData.clienteId) return;
    setIsCreating(true);

    const dataToSave = {
      ...formData,
      tipoServicio: (formData.tipoServicio || '-').trim().toUpperCase(),
      nombre: formData.nombre.trim(),
      ordenesCompra: JSON.stringify(ocs),
      ordenesServicio: JSON.stringify(oss),
    };

    try {
      const currentYear = new Date().getFullYear();
      const existingNums = proyectos
        .map(p => {
          const match = p.id?.match(/PRJ-\d{4}-(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => !isNaN(n));
      const nextNum = (existingNums.length > 0 ? Math.max(...existingNums) : 0) + 1;
      const nextId = `PRJ-${currentYear}-${String(nextNum).padStart(3, '0')}`;

      await addProyecto({
        id: nextId,
        fechaRegistro: new Date().toLocaleDateString('es-PE'),
        fechaAprobacion: '-',
        nombre: dataToSave.nombre || '',
        clienteId: dataToSave.clienteId || '',
        tipoServicio: dataToSave.tipoServicio || '-',
        tipoProyecto: dataToSave.tipoProyecto || '-',
        presupuestoEstimado: dataToSave.presupuestoEstimado || '',
        subtotal: 0,
        estado: dataToSave.estado || 'Registrado',
        ordenesCompra: dataToSave.ordenesCompra,
        ordenesServicio: dataToSave.ordenesServicio,
        projectManager: dataToSave.projectManager || 'Eric Higa',
        statusActividad: dataToSave.statusActividad || undefined,
        comentarios: dataToSave.comentarios || undefined,
        gastosAdicionales: dataToSave.gastosAdicionales ? Number(dataToSave.gastosAdicionales) : 0,
        gastosAdicionalesNota: dataToSave.gastosAdicionalesNota || undefined,
        contactoId: dataToSave.contactoId || undefined,
        contactoNombre: dataToSave.contactoNombre || undefined,
        contactoCargo: dataToSave.contactoCargo || undefined,
        contactoEmail: dataToSave.contactoEmail || undefined,
        contactoTelefono: dataToSave.contactoTelefono || undefined
      });
      setShowConfirmModal(false);
      onClose();
    } catch (error) {
      console.error('Error al registrar proyecto:', error);
    } finally {
      setIsCreating(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '640px', width: '100%', boxSizing: 'border-box' }}>
        <div className="modal-header">
          <h3 className="modal-title">{proyecto ? 'Editar Proyecto' : 'Registrar Proyecto'}</h3>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '75vh', overflowY: 'auto' }}>
            <div className="form-group">
              <label>Nombre del Proyecto *</label>
              <input 
                required
                type="text" 
                className="form-control"
                placeholder="Ej: Activación Campaña Verano"
                value={formData.nombre} 
                onChange={e => setFormData({...formData, nombre: e.target.value})}
              />
            </div>

            <div className="form-group">
              <label>Asignar Cliente *</label>
              <select 
                required
                name="clienteId"
                className="form-control"
                value={formData.clienteId} 
                onChange={e => handleClienteChange(e.target.value)}
              >
                <option value="">-- Seleccionar Cliente --</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>{c.empresa}</option>
                ))}
              </select>
            </div>

            {formData.clienteId && (
              <div className="form-group" style={{ 
                background: 'rgba(102, 45, 145, 0.04)', 
                padding: '14px 16px', 
                borderRadius: '10px', 
                border: '1px solid rgba(102, 45, 145, 0.2)' 
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontSize: '0.88rem' }}>
                    <User size={15} style={{ color: 'var(--accent-primary)' }} />
                    <span>Contacto Solicitante</span>
                  </label>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Contacto de la empresa que realizó la solicitud
                  </span>
                </div>

                <select
                  className="form-control"
                  value={formData.contactoId || formData.contactoNombre || ''}
                  onChange={e => {
                    const val = e.target.value;
                    if (!val) {
                      setFormData(prev => ({
                        ...prev,
                        contactoId: '',
                        contactoNombre: '',
                        contactoCargo: '',
                        contactoEmail: '',
                        contactoTelefono: ''
                      }));
                      return;
                    }
                    const cList = (selectedCliente?.contactos && selectedCliente.contactos.length > 0)
                      ? selectedCliente.contactos
                      : (selectedCliente?.contacto ? [{
                          id: `legacy-${selectedCliente.id}`,
                          nombre: selectedCliente.contacto,
                          cargo: selectedCliente.cargo || '',
                          email: selectedCliente.email || '',
                          telefono: selectedCliente.telefono || '',
                          esPrincipal: true
                        }] : []);
                    
                    const found = cList.find(c => (c.id && c.id === val) || c.nombre === val);
                    if (found) {
                      setFormData(prev => ({
                        ...prev,
                        contactoId: found.id || '',
                        contactoNombre: found.nombre,
                        contactoCargo: found.cargo || '',
                        contactoEmail: found.email || '',
                        contactoTelefono: found.telefono || ''
                      }));
                    } else {
                      setFormData(prev => ({
                        ...prev,
                        contactoId: '',
                        contactoNombre: val,
                        contactoCargo: '',
                        contactoEmail: '',
                        contactoTelefono: ''
                      }));
                    }
                  }}
                  style={{ background: 'var(--bg-input, #ffffff)' }}
                >
                  <option value="">-- Sin contacto específico / General --</option>
                  {(selectedCliente?.contactos && selectedCliente.contactos.length > 0 ? selectedCliente.contactos : (selectedCliente?.contacto ? [{ id: `legacy-${selectedCliente.id}`, nombre: selectedCliente.contacto, cargo: selectedCliente.cargo, email: selectedCliente.email, telefono: selectedCliente.telefono, esPrincipal: true }] : [])).map((c, ci) => (
                    <option key={c.id || ci} value={c.id || c.nombre}>
                      {c.nombre} {c.cargo ? `— ${c.cargo}` : ''} {c.esPrincipal ? '★ (Principal)' : ''}
                    </option>
                  ))}
                </select>

                {formData.contactoNombre && (
                  <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formData.contactoNombre}</span>
                    {formData.contactoCargo && (
                      <span className="badge badge-info" style={{ fontSize: '0.72rem', padding: '1px 6px' }}>
                        {formData.contactoCargo}
                      </span>
                    )}
                    {formData.contactoEmail && <span>✉️ {formData.contactoEmail}</span>}
                    {formData.contactoTelefono && <span>📞 {formData.contactoTelefono}</span>}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <div className="form-group">
                <label>Tipo de Servicio</label>
                <select 
                  name="tipoServicio" 
                  className="form-control"
                  value={formData.tipoServicio}
                  onChange={e => setFormData({...formData, tipoServicio: e.target.value})}
                >
                  <option value="">-- Seleccionar --</option>
                  {(listas?.tipoServicio || ['PURPLE VISIBILITY', 'PURPLE IMPULSE & PROMOTION', 'PURPLE LOYALTY', 'PURPLE STRATEGY & CREATIVITY']).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>Tipo de Proyecto</label>
                <select 
                  name="tipoProyecto" 
                  className="form-control"
                  value={formData.tipoProyecto}
                  onChange={e => setFormData({...formData, tipoProyecto: e.target.value})}
                >
                  <option value="">-- Seleccionar --</option>
                  {(listas?.tipoProyecto || ['INDIVIDUAL', 'FEE MENSUAL', 'Campaña Integral', 'Activación', 'Evento Corporativo', 'Implementación']).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
              <div className="form-group">
                <label>Moneda del Proyecto</label>
                <select 
                  className="form-control" 
                  value={formData.moneda || 'PEN'} 
                  onChange={e => setFormData({...formData, moneda: e.target.value as 'PEN' | 'USD'})}
                >
                  <option value="PEN">Soles (PEN - S/)</option>
                  <option value="USD">Dólares (USD - $)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Rango Presupuestal Estimado</label>
                <select 
                  className="form-control" 
                  value={formData.presupuestoEstimado || ''} 
                  onChange={e => setFormData({...formData, presupuestoEstimado: e.target.value})}
                >
                  <option value="">-- Seleccionar Rango de Presupuesto --</option>
                  <option value="0 - 5000">0 - 5,000 (Hasta 5,000)</option>
                  <option value="5001 - 15000">5,001 - 15,000 (5,001 a 15,000)</option>
                  <option value="15001 - 50000">15,001 - 50,000 (15,001 a 50,000)</option>
                  <option value="50000 a más">50,000 a más (Más de 50,000)</option>
                  {formData.presupuestoEstimado && !['0 - 5000', '5001 - 15000', '15001 - 50000', '50000 a más'].includes(formData.presupuestoEstimado) && (
                    <option value={formData.presupuestoEstimado}>{formData.presupuestoEstimado}</option>
                  )}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <div className="form-group">
                <label>Project Manager (PM)</label>
                <select 
                  className="form-control"
                  value={formData.projectManager || 'Eric Higa'} 
                  onChange={e => setFormData({...formData, projectManager: e.target.value})}
                >
                  <option value="Eric Higa">Eric Higa</option>
                  <option value="Maria Paula de la Puente">Maria Paula de la Puente</option>
                  {formData.projectManager && !['Eric Higa', 'Maria Paula de la Puente'].includes(formData.projectManager) && (
                    <option value={formData.projectManager}>{formData.projectManager}</option>
                  )}
                </select>
              </div>

              <div className="form-group">
                <label>Status de Actividad</label>
                <select 
                  className="form-control"
                  value={formData.statusActividad || ''} 
                  onChange={e => setFormData({...formData, statusActividad: e.target.value})}
                >
                  <option value="">-- Seleccionar --</option>
                  <option value="EN PROCESO">EN PROCESO</option>
                  <option value="FINALIZADO">FINALIZADO</option>
                  <option value="LIQUIDADO">LIQUIDADO</option>
                  <option value="CANCELADO">CANCELADO</option>
                  <option value="PENDIENTE">PENDIENTE</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Comentarios / Observaciones</label>
              <textarea 
                rows={2}
                className="form-control"
                placeholder="Comentarios o notas adicionales del proyecto..."
                value={formData.comentarios || ''} 
                onChange={e => setFormData({...formData, comentarios: e.target.value})}
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* GASTOS ADICIONALES DEL PROYECTO */}
            <div style={{
              padding: '12px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'rgba(245, 158, 11, 0.04)',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontWeight: 600, color: '#b45309' }}>Gastos Adicionales (S/)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    min="0"
                    className="form-control"
                    placeholder="0.00"
                    value={formData.gastosAdicionales ?? ''} 
                    onChange={e => setFormData({...formData, gastosAdicionales: e.target.value === '' ? 0 : parseFloat(e.target.value)})}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontWeight: 600 }}>Motivo / Observación del Gasto Adicional</label>
                  <input 
                    type="text" 
                    className="form-control"
                    placeholder="Motivo de gastos adicionales (ej. penalidades, fletes extra)..."
                    value={formData.gastosAdicionalesNota || ''} 
                    onChange={e => setFormData({...formData, gastosAdicionalesNota: e.target.value})}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <div className="form-group">
                <label>Órdenes de Compra (OC)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="text" 
                    className="form-control"
                    placeholder="Ej: OC-12345"
                    value={newOc}
                    onChange={e => setNewOc(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newOc.trim()) {
                        e.preventDefault();
                        setOcs([...ocs, newOc.trim()]);
                        setNewOc('');
                      }
                    }}
                  />
                  <button type="button" className="btn-secondary" onClick={() => {
                    if (newOc.trim()) {
                      setOcs([...ocs, newOc.trim()]);
                      setNewOc('');
                    }
                  }} style={{ padding: '0 12px' }}><Plus size={16} /></button>
                </div>
                {ocs.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                    {ocs.map((oc, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--accent-primary)', color: 'white', padding: '4px 8px', borderRadius: '6px', fontSize: '0.8rem' }}>
                        {oc}
                        <X size={14} style={{ cursor: 'pointer' }} onClick={() => setOcs(ocs.filter((_, idx) => idx !== i))} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Órdenes de Servicio (OS)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="text" 
                    className="form-control"
                    placeholder="Ej: OS-98765"
                    value={newOs}
                    onChange={e => setNewOs(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newOs.trim()) {
                        e.preventDefault();
                        setOss([...oss, newOs.trim()]);
                        setNewOs('');
                      }
                    }}
                  />
                  <button type="button" className="btn-secondary" onClick={() => {
                    if (newOs.trim()) {
                      setOss([...oss, newOs.trim()]);
                      setNewOs('');
                    }
                  }} style={{ padding: '0 12px' }}><Plus size={16} /></button>
                </div>
                {oss.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                    {oss.map((os, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#3b82f6', color: 'white', padding: '4px 8px', borderRadius: '6px', fontSize: '0.8rem' }}>
                        {os}
                        <X size={14} style={{ cursor: 'pointer' }} onClick={() => setOss(oss.filter((_, idx) => idx !== i))} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <div className="form-group">
                <label>Estado del Proyecto</label>
                <select 
                  name="estado" 
                  className="form-control"
                  value={formData.estado || 'PENDIENTE CP'}
                  onChange={e => {
                    const newEstado = e.target.value;
                    setFormData(prev => ({ 
                      ...prev, 
                      estado: newEstado,
                      fechaAprobacion: (!prev.fechaAprobacion || prev.fechaAprobacion === '-')
                        ? new Date().toLocaleDateString('es-PE') 
                        : prev.fechaAprobacion
                    }));
                  }}
                >
                  <option value="">-- Seleccionar Estado --</option>
                  {(listas?.estadoProyecto || ['PENDIENTE CP', 'PENDIENTE MP', 'PENDIENTE LP', 'APROBADO', 'RECHAZADO', 'EN EJECUCIÓN', 'FINALIZADO']).map(t => <option key={t} value={t}>{t}</option>)}
                  {formData.estado && !(listas?.estadoProyecto || ['PENDIENTE CP', 'PENDIENTE MP', 'PENDIENTE LP', 'APROBADO', 'RECHAZADO', 'EN EJECUCIÓN', 'FINALIZADO']).includes(formData.estado) && (
                    <option value={formData.estado}>{formData.estado}</option>
                  )}
                </select>
              </div>
              <div className="form-group">
                <label>Fecha de Estado</label>
                <input 
                  type="date"
                  className="form-control"
                  value={
                    formData.fechaAprobacion && formData.fechaAprobacion !== '-'
                      ? (formData.fechaAprobacion.includes('/') ? formData.fechaAprobacion.split('/').reverse().join('-') : formData.fechaAprobacion)
                      : ''
                  }
                  onChange={e => {
                    const val = e.target.value;
                    if (val) {
                       const [year, month, day] = val.split('-');
                       setFormData({...formData, fechaAprobacion: `${day}/${month}/${year}`});
                    } else {
                       setFormData({...formData, fechaAprobacion: '-'});
                    }
                  }}
                />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary">
              <Save size={18} /> {proyecto ? 'Actualizar Proyecto' : 'Crear Proyecto'}
            </button>
          </div>
        </form>
      </div>

      {/* POP-UP DE CONFIRMACIÓN OBLIGATORIA DE NOMENCLATURA Y DRIVE */}
      {showConfirmModal && (
        <div 
          className="modal-overlay" 
          style={{ 
            zIndex: 1200, 
            backgroundColor: 'rgba(15, 23, 42, 0.78)',
            backdropFilter: 'blur(5px)' 
          }}
        >
          <div 
            className="modal-content animate-fade-in" 
            style={{ 
              maxWidth: '560px', 
              width: '100%', 
              borderRadius: '16px', 
              overflow: 'hidden', 
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(124, 58, 237, 0.2)'
            }}
          >
            {/* Header */}
            <div style={{ 
              background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)', 
              color: 'white', 
              padding: '20px 24px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '14px' 
            }}>
              <div style={{ 
                background: 'rgba(255, 255, 255, 0.2)', 
                padding: '10px', 
                borderRadius: '12px', 
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <AlertTriangle size={24} color="#fef08a" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'white' }}>
                  Confirmar Creación de Proyecto
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: 'rgba(255, 255, 255, 0.85)' }}>
                  Google Drive • Repositorio SIG PurpleBTL
                </p>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Alerta de verificación */}
              <div style={{ 
                background: '#fffbeb', 
                border: '1px solid #fde68a', 
                borderRadius: '10px', 
                padding: '12px 16px', 
                display: 'flex', 
                gap: '12px', 
                alignItems: 'flex-start' 
              }}>
                <AlertCircle size={20} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '0.86rem', color: '#92400e', lineHeight: 1.5 }}>
                  <strong>¿Estás seguro de que el nombre del proyecto es correcto?</strong>
                  <p style={{ margin: '4px 0 0' }}>
                    Al confirmar, se creará automáticamente en Google Drive la carpeta del cliente (si aún no existe), la carpeta del proyecto y todas sus subcarpetas departamentales por defecto.
                  </p>
                </div>
              </div>

              {/* Resumen de datos */}
              <div style={{ 
                background: '#f8fafc', 
                border: '1px solid #e2e8f0', 
                borderRadius: '12px', 
                padding: '16px', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '12px' 
              }}>
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.5px' }}>
                    Nombre del Proyecto:
                  </span>
                  <div style={{ 
                    marginTop: '4px', 
                    fontSize: '1.05rem', 
                    fontWeight: 700, 
                    color: '#4c1d95', 
                    background: '#ede9fe', 
                    padding: '10px 14px', 
                    borderRadius: '8px', 
                    border: '1px solid #ddd6fe',
                    wordBreak: 'break-word'
                  }}>
                    {formData.nombre}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: '#64748b' }}>
                      Cliente Asignado:
                    </span>
                    <div style={{ fontWeight: 600, color: '#0f172a', marginTop: '2px', fontSize: '0.92rem' }}>
                      {selectedCliente?.empresa || 'Cliente'}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: '#64748b' }}>
                      Tipo de Servicio:
                    </span>
                    <div style={{ fontWeight: 500, color: '#334155', marginTop: '2px', fontSize: '0.92rem' }}>
                      {formData.tipoServicio || 'General'}
                    </div>
                  </div>
                </div>

                {formData.contactoNombre && (
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: '#64748b' }}>
                      Contacto Solicitante:
                    </span>
                    <div style={{ fontWeight: 600, color: '#0f172a', marginTop: '2px', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{formData.contactoNombre}</span>
                      {formData.contactoCargo && (
                        <span style={{ color: '#7c3aed', fontWeight: 500, fontSize: '0.82rem' }}>
                          ({formData.contactoCargo})
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Previsualización del árbol de carpetas */}
              <div style={{ 
                background: '#ffffff', 
                border: '1px dashed #cbd5e1', 
                borderRadius: '10px', 
                padding: '12px 16px', 
                fontSize: '0.8rem', 
                color: '#475569' 
              }}>
                <div style={{ fontWeight: 600, color: '#334155', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Folder size={15} color="#7c3aed" /> Estructura que se generará en Google Drive:
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.6, paddingLeft: '8px' }}>
                  <div>📁 <strong>Repositorio SIG PurpleBTL</strong></div>
                  <div>&nbsp;&nbsp;└── 📁 <strong>{selectedCliente?.empresa || 'Cliente'}</strong></div>
                  <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── 📁 <strong>{formData.nombre}</strong></div>
                  <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── 📁 Administrativo</div>
                  <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── 📁 Creatividad</div>
                  <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── 📁 Cuentas <span style={{ color: '#94a3b8' }}>(Cotización, Entregable, Gantt, Info, Presentaciones)</span></div>
                  <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── 📁 Diseño <span style={{ color: '#94a3b8' }}>(Archivo Ai)</span></div>
                  <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── 📁 Producción <span style={{ color: '#94a3b8' }}>(Cotizaciones, Desglose, Facturas, Fotos, OC, Pagos)</span></div>
                </div>
              </div>

              {isCreating && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '10px', 
                  padding: '12px', 
                  background: '#f5f3ff', 
                  borderRadius: '8px', 
                  color: '#7c3aed', 
                  fontWeight: 600, 
                  fontSize: '0.9rem' 
                }}>
                  <Loader2 size={18} className="animate-spin" />
                  Creando proyecto y estructura en Google Drive...
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ 
              padding: '16px 24px', 
              background: '#f8fafc', 
              borderTop: '1px solid #e2e8f0', 
              display: 'flex', 
              justifyContent: 'flex-end', 
              gap: '10px' 
            }}>
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={() => setShowConfirmModal(false)}
                disabled={isCreating}
                style={{ opacity: isCreating ? 0.6 : 1 }}
              >
                <ArrowLeft size={16} /> Corregir Nombre
              </button>
              <button 
                type="button" 
                className="btn-primary" 
                onClick={handleConfirmCreate}
                disabled={isCreating}
                style={{ 
                  background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  opacity: isCreating ? 0.7 : 1,
                  cursor: isCreating ? 'not-allowed' : 'pointer'
                }}
              >
                {isCreating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Creando Carpetas...
                  </>
                ) : (
                  <>
                    <Check size={16} /> Confirmar y Proceder
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};
