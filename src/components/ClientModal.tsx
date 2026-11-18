import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, Save, Plus, Trash2, Star, User, Briefcase, Mail, Phone } from 'lucide-react';
import { useGlobalContext } from '../context/GlobalContext';
import type { Cliente, ContactoCliente } from '../types/models';
import toast from 'react-hot-toast';

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  client?: Cliente | null;
}

export const ClientModal: React.FC<ClientModalProps> = ({ isOpen, onClose, client }) => {
  const { addCliente, updateCliente } = useGlobalContext();
  const [empresa, setEmpresa] = useState('');
  const [estado, setEstado] = useState('Activo');
  const [contactos, setContactos] = useState<ContactoCliente[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (client) {
      setEmpresa(client.empresa || '');
      setEstado(client.estado || 'Activo');
      if (Array.isArray(client.contactos) && client.contactos.length > 0) {
        setContactos(client.contactos.map(c => ({ ...c })));
      } else if (client.contacto) {
        setContactos([{
          nombre: client.contacto,
          cargo: client.cargo || '',
          email: client.email || '',
          telefono: client.telefono || '',
          esPrincipal: true
        }]);
      } else {
        setContactos([{
          nombre: '',
          cargo: '',
          email: '',
          telefono: '',
          esPrincipal: true
        }]);
      }
    } else {
      setEmpresa('');
      setEstado('Activo');
      setContactos([{
        nombre: '',
        cargo: '',
        email: '',
        telefono: '',
        esPrincipal: true
      }]);
    }
  }, [client, isOpen]);

  if (!isOpen) return null;

  const handleAddContact = () => {
    setContactos(prev => [
      ...prev,
      {
        nombre: '',
        cargo: '',
        email: '',
        telefono: '',
        esPrincipal: prev.length === 0
      }
    ]);
  };

  const handleRemoveContact = (index: number) => {
    if (contactos.length <= 1) {
      toast.error('Debe haber al menos un contacto para la empresa.');
      return;
    }
    setContactos(prev => {
      const next = prev.filter((_, i) => i !== index);
      // Si eliminamos el principal, asignar el primero como principal
      if (!next.some(c => c.esPrincipal) && next.length > 0) {
        next[0].esPrincipal = true;
      }
      return next;
    });
  };

  const handleUpdateContact = (index: number, field: keyof ContactoCliente, value: any) => {
    setContactos(prev => prev.map((c, i) => {
      if (i === index) {
        return { ...c, [field]: value };
      }
      if (field === 'esPrincipal' && value === true) {
        return { ...c, esPrincipal: false };
      }
      return c;
    }));
  };

  const handleSetPrincipal = (index: number) => {
    setContactos(prev => prev.map((c, i) => ({
      ...c,
      esPrincipal: i === index
    })));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedEmpresa = empresa.trim();
    if (!trimmedEmpresa) {
      toast.error('Por favor ingresa la Empresa / Razón Social');
      return;
    }

    const cleanContactos = contactos
      .map(c => ({
        ...c,
        nombre: c.nombre?.trim() || '',
        cargo: c.cargo?.trim() || '',
        email: c.email?.trim() || '',
        telefono: c.telefono?.trim() || ''
      }))
      .filter(c => Boolean(c.nombre));

    if (cleanContactos.length === 0) {
      toast.error('Por favor ingresa el nombre de al menos un contacto.');
      return;
    }

    // Asegurar que haya un contacto principal
    if (!cleanContactos.some(c => c.esPrincipal)) {
      cleanContactos[0].esPrincipal = true;
    }

    const principal = cleanContactos.find(c => c.esPrincipal) || cleanContactos[0];

    const payload: Partial<Cliente> = {
      empresa: trimmedEmpresa,
      contacto: principal.nombre,
      cargo: principal.cargo || '',
      email: principal.email || '',
      telefono: principal.telefono || '',
      estado,
      contactos: cleanContactos
    };

    setIsSubmitting(true);
    try {
      if (client) {
        await updateCliente(client.id, payload);
        toast.success('Cliente y contactos actualizados exitosamente');
      } else {
        await addCliente({
          id: `CLI-${Date.now()}`,
          ...payload
        } as Cliente);
        toast.success('Cliente registrado exitosamente con sus contactos');
      }
      onClose();
    } catch (err: any) {
      console.error('Error al guardar cliente:', err);
      toast.error(err.message || 'Error al guardar cliente');
    } finally {
      setIsSubmitting(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="modal-overlay" style={{ zIndex: 1000 }}>
      <div 
        className="modal-content glass-panel" 
        style={{ 
          maxWidth: '680px', 
          width: '95%', 
          maxHeight: '90vh', 
          display: 'flex', 
          flexDirection: 'column', 
          boxSizing: 'border-box',
          overflow: 'hidden' 
        }}
      >
        <div className="modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 className="modal-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
              {client ? 'Editar Cliente' : 'Registrar Cliente'}
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Gestiona la empresa y los múltiples contactos asociados con sus cargos.
            </p>
          </div>
          <button className="btn-icon" onClick={onClose} disabled={isSubmitting}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div className="modal-body" style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* DATOS DE LA EMPRESA */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '16px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.88rem' }}>
                  Empresa / Razón Social *
                </label>
                <input 
                  required
                  type="text" 
                  className="form-control"
                  placeholder="Ej. Alicorp S.A.A."
                  value={empresa} 
                  onChange={e => setEmpresa(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.88rem' }}>
                  Estado
                </label>
                <select 
                  value={estado} 
                  onChange={e => setEstado(e.target.value)}
                  className="form-control"
                >
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
              </div>
            </div>

            {/* SECCIÓN DE MÚLTIPLES CONTACTOS */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                    Contactos de la Empresa ({contactos.length})
                  </label>
                  <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Registra los ejecutivos, coordinadores o responsables de la cuenta.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAddContact}
                  className="btn-secondary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.82rem',
                    padding: '6px 12px',
                    borderColor: 'rgba(102, 45, 145, 0.4)',
                    color: 'var(--accent-primary)'
                  }}
                >
                  <Plus size={15} />
                  <span>Añadir Contacto</span>
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {contactos.map((contacto, idx) => (
                  <div 
                    key={contacto.id || idx}
                    style={{
                      border: contacto.esPrincipal ? '1.5px solid rgba(102, 45, 145, 0.45)' : '1px solid var(--border-color)',
                      borderRadius: '12px',
                      padding: '16px',
                      background: contacto.esPrincipal ? 'rgba(102, 45, 145, 0.03)' : 'rgba(255, 255, 255, 0.02)',
                      transition: 'all 0.2s ease',
                      position: 'relative'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ 
                          width: '24px', 
                          height: '24px', 
                          borderRadius: '50%', 
                          background: contacto.esPrincipal ? 'var(--accent-primary)' : 'rgba(0,0,0,0.08)',
                          color: contacto.esPrincipal ? '#fff' : 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 700
                        }}>
                          {idx + 1}
                        </span>

                        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                          {contacto.nombre || `Contacto #${idx + 1}`}
                        </span>

                        {contacto.esPrincipal && (
                          <span className="badge badge-primary" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                            ★ Contacto Principal
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {!contacto.esPrincipal && (
                          <button
                            type="button"
                            onClick={() => handleSetPrincipal(idx)}
                            className="btn-icon"
                            style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '6px' }}
                            title="Marcar como contacto principal de la empresa"
                          >
                            <Star size={14} />
                            <span>Hacer Principal</span>
                          </button>
                        )}
                        {contactos.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveContact(idx)}
                            className="btn-icon"
                            style={{ color: 'var(--danger-color, #ef4444)' }}
                            title="Eliminar este contacto"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          <User size={13} />
                          <span>Nombre Completo *</span>
                        </label>
                        <input
                          required
                          type="text"
                          className="form-control"
                          placeholder="Ej. María Gonzales"
                          value={contacto.nombre}
                          onChange={e => handleUpdateContact(idx, 'nombre', e.target.value)}
                          style={{ fontSize: '0.88rem', padding: '8px 10px' }}
                        />
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          <Briefcase size={13} />
                          <span>Cargo / Puesto</span>
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Ej. Brand Manager / Jefe de Compras"
                          value={contacto.cargo || ''}
                          onChange={e => handleUpdateContact(idx, 'cargo', e.target.value)}
                          style={{ fontSize: '0.88rem', padding: '8px 10px' }}
                        />
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          <Mail size={13} />
                          <span>Email</span>
                        </label>
                        <input
                          type="email"
                          className="form-control"
                          placeholder="ejemplo@empresa.com"
                          value={contacto.email || ''}
                          onChange={e => handleUpdateContact(idx, 'email', e.target.value)}
                          style={{ fontSize: '0.88rem', padding: '8px 10px' }}
                        />
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          <Phone size={13} />
                          <span>Teléfono / Celular</span>
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="+51 999 888 777"
                          value={contacto.telefono || ''}
                          onChange={e => handleUpdateContact(idx, 'telefono', e.target.value)}
                          style={{ fontSize: '0.88rem', padding: '8px 10px' }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </button>
            <button 
              type="submit" 
              className="btn-primary" 
              disabled={isSubmitting}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <Save size={18} />
              <span>{client ? 'Actualizar Cliente' : 'Guardar Cliente'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
