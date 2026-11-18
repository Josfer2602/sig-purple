import React, { useState, useEffect } from 'react';
import { Save, UserCog, Calendar } from 'lucide-react';
import { useGlobalContext, API_URL } from '../context/GlobalContext';
import toast from 'react-hot-toast';

export const PerfilView: React.FC = () => {
  const { currentUser, token } = useGlobalContext();
  const [calendarStatus, setCalendarStatus] = useState<{ connected: boolean; email?: string } | null>(null);
  const [formData, setFormData] = useState({ 
    smtpHost: '', 
    smtpPort: 587, 
    smtpUser: '', 
    smtpPass: '' 
  });
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (currentUser) {
      setFormData({
        smtpHost: currentUser.smtpHost || '',
        smtpPort: currentUser.smtpPort || 587,
        smtpUser: currentUser.smtpUser || '',
        smtpPass: currentUser.smtpPass || '' // Usually we shouldn't send passwords back, but assuming it comes empty or masked.
      });
    }
  }, [currentUser]);

  const loadCalendarStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/calendar/status`);
      if (res.ok) {
        const data = await res.json();
        setCalendarStatus(data);
      }
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    loadCalendarStatus();
  }, []);

  const handleConnectCalendar = async () => {
    try {
      const res = await fetch(`${API_URL}/calendar/auth-url?frontendUrl=${encodeURIComponent(window.location.origin)}`);
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e) {
      toast.error('Error al conectar con Google Calendar');
    }
  };

  const handleDisconnectCalendar = async () => {
    if (!window.confirm('¿Desvincular Google Calendar de tu cuenta?')) return;
    try {
      const res = await fetch(`${API_URL}/calendar/disconnect`, { method: 'POST' });
      if (res.ok) {
        toast.success('Google Calendar desvinculado');
        setCalendarStatus({ connected: false });
      }
    } catch (e) {
      toast.error('Error al desvincular');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setIsSaving(true);
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_URL}/users/${currentUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(formData)
      });
      if (!res.ok) throw new Error('Error al guardar configuración');
      setSuccessMsg('Configuración SMTP guardada correctamente. Se usará para enviar notificaciones de pagos.');
    } catch (e) {
      toast.error('Error guardando configuración');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="view-container">

      <div className="glass-panel" style={{ padding: '32px', maxWidth: '600px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <UserCog size={24} color="var(--accent-primary)" />
          <h3 style={{ margin: 0 }}>Configuración SMTP (Envío de Correos)</h3>
        </div>

        {successMsg && (
          <div style={{ padding: '12px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', borderLeft: '4px solid var(--success)', marginBottom: '20px' }}>
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label>Servidor SMTP (Host)</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Ej: smtp.gmail.com" 
              value={formData.smtpHost} 
              onChange={e => setFormData({...formData, smtpHost: e.target.value})} 
            />
          </div>
          <div className="form-group">
            <label>Puerto SMTP</label>
            <input 
              type="number" 
              className="form-control" 
              placeholder="Ej: 587" 
              value={formData.smtpPort} 
              onChange={e => setFormData({...formData, smtpPort: Number(e.target.value)})} 
            />
          </div>
          <div className="form-group">
            <label>Usuario (Correo Electrónico)</label>
            <input 
              type="email" 
              className="form-control" 
              placeholder="Ej: mi.correo@empresa.com" 
              value={formData.smtpUser} 
              onChange={e => setFormData({...formData, smtpUser: e.target.value})} 
            />
          </div>
          <div className="form-group">
            <label>Contraseña SMTP o App Password</label>
            <input 
              type="password" 
              className="form-control" 
              placeholder="Contraseña o Contraseña de Aplicación" 
              value={formData.smtpPass} 
              onChange={e => setFormData({...formData, smtpPass: e.target.value.replace(/\s+/g, '')})} 
            />
            <small style={{ color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              Nota: Si usas Gmail (Google Workspace), ingresa una <strong>Contraseña de Aplicación</strong> de 16 letras (los espacios se eliminan automáticamente).
            </small>
          </div>

          <button type="submit" className="btn-primary" disabled={isSaving} style={{ width: 'fit-content', marginTop: '8px' }}>
            <Save size={18} /> {isSaving ? 'Guardando...' : 'Guardar Configuración'}
          </button>
        </form>
      </div>

      <div className="glass-panel" style={{ marginTop: '24px', padding: '24px', maxWidth: '600px', background: '#ffffff', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ background: 'rgba(124, 58, 237, 0.1)', padding: '12px', borderRadius: '12px' }}>
              <Calendar size={24} style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Google Calendar & Meet</h4>
                {calendarStatus?.connected ? (
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#059669', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '10px' }}>
                    ● Conectado
                  </span>
                ) : (
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', background: '#f1f5f9', padding: '2px 8px', borderRadius: '10px' }}>
                    No conectado
                  </span>
                )}
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                {calendarStatus?.connected 
                  ? `Sincronizado con ${calendarStatus.email || 'tu cuenta de Google'}.` 
                  : 'Vincula tu cuenta para ver reuniones en la sección "Reuniones".'}
              </p>
            </div>
          </div>

          <div>
            {calendarStatus?.connected ? (
              <button 
                type="button" 
                className="btn-clear-filters" 
                onClick={handleDisconnectCalendar}
                style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', margin: 0 }}
              >
                Desvincular
              </button>
            ) : (
              <button 
                type="button" 
                className="btn-primary" 
                onClick={handleConnectCalendar}
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                Conectar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
