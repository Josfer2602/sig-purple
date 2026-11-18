import React, { useState, useEffect } from 'react';
import { UserPlus, Save, Trash2, Edit, Mail, RefreshCw } from 'lucide-react';
import { useGlobalContext, API_URL } from '../context/GlobalContext';
import { SkeletonTable } from '../components/SkeletonTable';
import toast from 'react-hot-toast';

const ROLES = ['Admin', 'Directorio', 'Cuentas', 'Producción', 'Contabilidad'];

export const UsuariosView: React.FC = () => {
  const { token, currentUserRole, currentUser } = useGlobalContext();
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [formData, setFormData] = useState({ email: '', password: '', role: 'Cuentas' });
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchUsuarios = async () => {
    setIsLoadingUsers(true);
    try {
      const res = await fetch(`${API_URL}/users`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (Array.isArray(data)) {
        setUsuarios(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (currentUserRole === 'Admin') fetchUsuarios();
  }, [currentUserRole]);

  const handleQuickRoleChange = async (userId: string, userEmail: string, newRole: string) => {
    setUpdatingId(userId);
    try {
      const res = await fetch(`${API_URL}/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ role: newRole })
      });
      if (res.ok) {
        setUsuarios(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
        toast.success(`Rol de ${userEmail} cambiado a "${newRole}"`);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Error al cambiar rol');
      }
    } catch (err) {
      toast.error('Error de conexión al actualizar rol');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const method = isEditing ? 'PUT' : 'POST';
      const url = isEditing ? `${API_URL}/users/${isEditing}` : `${API_URL}/users`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(formData)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error guardando usuario');
      }
      toast.success(isEditing ? 'Usuario actualizado con éxito' : 'Usuario creado con éxito');
      setIsEditing(null);
      setFormData({ email: '', password: '', role: 'Cuentas' });
      fetchUsuarios();
    } catch (e: any) {
      toast.error(e.message || 'Error guardando usuario');
    }
  };

  const deleteUsuario = async (id: string, email: string) => {
    if (email === currentUser?.email) {
      toast.error('No puedes eliminar tu propia cuenta de usuario en sesión.');
      return;
    }
    if (!window.confirm(`¿Estás seguro de eliminar el acceso para ${email}?`)) return;
    try {
      const res = await fetch(`${API_URL}/users/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        toast.success('Usuario eliminado');
        fetchUsuarios();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Error al eliminar usuario');
      }
    } catch (e) {
      toast.error('Error de conexión al eliminar');
    }
  };

  if (currentUserRole !== 'Admin') {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h3>Acceso Restringido</h3>
        <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
          Solo los administradores del sistema pueden gestionar usuarios y asignar roles.
        </p>
      </div>
    );
  }

  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case 'Admin':
        return { background: 'rgba(124, 58, 237, 0.12)', color: '#7c3aed', border: '1px solid rgba(124, 58, 237, 0.25)' };
      case 'Directorio':
        return { background: 'rgba(37, 99, 235, 0.12)', color: '#2563eb', border: '1px solid rgba(37, 99, 235, 0.25)' };
      case 'Cuentas':
        return { background: 'rgba(16, 185, 129, 0.12)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.25)' };
      case 'Producción':
        return { background: 'rgba(245, 158, 11, 0.12)', color: '#d97706', border: '1px solid rgba(245, 158, 11, 0.25)' };
      case 'Contabilidad':
        return { background: 'rgba(236, 72, 153, 0.12)', color: '#db2777', border: '1px solid rgba(236, 72, 153, 0.25)' };
      default:
        return { background: 'rgba(100, 116, 139, 0.12)', color: '#475569', border: '1px solid rgba(100, 116, 139, 0.25)' };
    }
  };

  return (
    <div className="view-container">
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          backgroundColor: 'rgba(124, 58, 237, 0.08)',
          border: '1px solid rgba(124, 58, 237, 0.2)',
          borderRadius: '20px',
          fontSize: '0.82rem',
          fontWeight: 600,
          color: '#7c3aed'
        }}>
          <UserPlus size={15} />
          <span>{usuarios.length} Usuarios Registrados</span>
        </div>
        <button 
          className="btn-secondary" 
          onClick={fetchUsuarios} 
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
        >
          <RefreshCw size={14} /> Actualizar lista
        </button>
      </div>

      {/* Banner Informativo SSO Google Workspace */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.05) 0%, rgba(59, 130, 246, 0.05) 100%)',
        border: '1px solid rgba(124, 58, 237, 0.2)',
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          background: 'white',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
        </div>
        <div style={{ fontSize: '13px', lineHeight: '1.5', color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)', display: 'block', fontSize: '14px', marginBottom: '2px' }}>
            Autenticación Simplificada con Google Workspace (@purplebtl.com)
          </strong>
          Cada integrante del equipo puede presionar <span style={{ color: '#7c3aed', fontWeight: '600' }}>"Continuar con Google Workspace"</span> en la pantalla de ingreso. Al hacerlo por primera vez, el sistema creará su perfil automáticamente y tú como Administrador solo debes seleccionar su rol correspondiente en el menú desplegable a continuación.
        </div>
      </div>

      {/* Formulario para Crear / Editar Manual */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: '600' }}>
          {isEditing ? 'Editar Credenciales de Usuario' : 'Crear Usuario Manualmente (Opcional)'}
        </h3>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '16px', alignItems: 'end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)' }}>Correo Electrónico *</label>
            <input 
              type="email" 
              className="form-control" 
              placeholder="nombre@purplebtl.com" 
              value={formData.email} 
              onChange={e => setFormData({...formData, email: e.target.value})} 
              required 
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)' }}>
              Contraseña {isEditing ? '(Dejar vacía para mantener)' : '*'}
            </label>
            <input 
              type="password" 
              className="form-control" 
              placeholder="••••••••" 
              value={formData.password} 
              onChange={e => setFormData({...formData, password: e.target.value})} 
              required={!isEditing} 
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)' }}>Rol Asignado *</label>
            <select 
              className="form-control" 
              value={formData.role} 
              onChange={e => setFormData({...formData, role: e.target.value})} 
              required
            >
              {ROLES.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {isEditing && (
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={() => { setIsEditing(null); setFormData({ email: '', password: '', role: 'Cuentas' }); }}
              >
                Cancelar
              </button>
            )}
            <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Save size={16} /> {isEditing ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>

      {/* Tabla de Usuarios con Cambio Directo de Roles */}
      <div className="desktop-table-container glass-panel table-container">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '600' }}>Usuarios Registrados ({usuarios.length})</h4>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Puedes cambiar el rol de cualquier usuario inmediatamente usando el selector de cada fila.
            </span>
          </div>
        </div>
        <div 
          className="custom-table-scroll" 
          style={{ 
            maxHeight: 'calc(100vh - 350px)', 
            minHeight: '300px', 
            overflowX: 'auto', 
            overflowY: 'auto', 
            position: 'relative' 
          }}
        >
          {isLoadingUsers ? (
            <SkeletonTable columns={4} rows={5} message="Cargando usuarios y roles..." />
          ) : (
            <table className="data-table" style={{ width: '100%', minWidth: '820px', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
              <colgroup>
              <col style={{ width: '320px' }} />
              <col style={{ width: '160px' }} />
              <col style={{ width: '220px' }} />
              <col style={{ width: '120px' }} />
            </colgroup>
            <thead style={{ position: 'sticky', top: 0, zIndex: 12, backgroundColor: '#f8fafc' }}>
              <tr>
                <th className="header-custom">USUARIO</th>
                <th className="header-custom">ORIGEN</th>
                <th className="header-custom" style={{ width: '220px' }}>ROL ASIGNADO (1-CLIC)</th>
                <th className="header-custom sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 16, backgroundColor: '#f8fafc', textAlign: 'right', width: '120px' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
            {usuarios.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                  No hay usuarios registrados aún.
                </td>
              </tr>
            ) : (
              usuarios.map(u => {
                const isGoogleWorkspace = u.email?.toLowerCase().endsWith('@purplebtl.com');
                const isSelf = u.email === currentUser?.email;
                return (
                  <tr key={u.id}>
                    <td className="td-custom">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          background: isGoogleWorkspace ? '#7c3aed' : 'var(--bg-secondary, #e2e8f0)',
                          color: isGoogleWorkspace ? '#ffffff' : 'var(--text-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: '600',
                          fontSize: '14px'
                        }}>
                          {u.email ? u.email[0].toUpperCase() : 'U'}
                        </div>
                        <div>
                          <div style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {u.email}
                            {isSelf && (
                              <span style={{ fontSize: '10px', background: '#e0e7ff', color: '#4338ca', padding: '1px 6px', borderRadius: '4px' }}>
                                Tú
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {u.createdAt ? `Creado: ${new Date(u.createdAt).toLocaleDateString('es-PE')}` : ''}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="td-custom">
                      {isGoogleWorkspace ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: 'rgba(66, 133, 244, 0.08)',
                          border: '1px solid rgba(66, 133, 244, 0.25)',
                          color: '#2563eb',
                          fontSize: '11px',
                          fontWeight: '500'
                        }}>
                          <svg width="12" height="12" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                          </svg>
                          Google Workspace
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: 'rgba(100, 116, 139, 0.08)',
                          border: '1px solid rgba(100, 116, 139, 0.2)',
                          color: '#64748b',
                          fontSize: '11px'
                        }}>
                          <Mail size={12} /> Local
                        </span>
                      )}
                    </td>

                    <td className="td-custom">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <select
                          className="form-control"
                          value={u.role}
                          disabled={updatingId === u.id}
                          onChange={(e) => handleQuickRoleChange(u.id, u.email, e.target.value)}
                          style={{
                            fontSize: '12px',
                            padding: '4px 10px',
                            fontWeight: '600',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            ...getRoleBadgeStyle(u.role)
                          }}
                        >
                          {ROLES.map(r => (
                            <option key={r} value={r} style={{ background: '#fff', color: '#1e293b' }}>
                              {r}
                            </option>
                          ))}
                        </select>
                        {updatingId === u.id && (
                          <RefreshCw size={14} className="animate-spin" color="#7c3aed" />
                        )}
                      </div>
                    </td>

                    <td className="td-custom sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 10, backgroundColor: 'inherit', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button 
                          className="btn-icon" 
                          title="Editar usuario"
                          onClick={() => { 
                            setIsEditing(u.id); 
                            setFormData({ email: u.email, password: '', role: u.role }); 
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        >
                          <Edit size={16} />
                        </button>
                        <button 
                          className="btn-icon" 
                          title="Eliminar acceso"
                          onClick={() => deleteUsuario(u.id, u.email)} 
                          style={{ color: 'var(--danger)' }}
                          disabled={isSelf}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
          )}
        </div>
      </div>
    </div>
  );
};
