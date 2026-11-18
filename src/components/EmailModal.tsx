import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, Send, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { API_URL } from '../utils/apiUrl';
import { buildQuoteClientUrl } from '../utils/clientLinks';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  quoteId: string;
  clientName: string;
  clientEmail: string;
  projectName?: string;
  version?: number | string;
}

export const EmailModal: React.FC<Props> = ({ 
  isOpen, 
  onClose, 
  quoteId, 
  clientName, 
  clientEmail,
  projectName,
  version
}) => {
  const [to, setTo] = useState(clientEmail || '');
  const cleanVersion = version || 1;
  const fullUrl = buildQuoteClientUrl(quoteId, clientName, projectName, cleanVersion);

  const [subject, setSubject] = useState(
    projectName
      ? `Cotización: ${clientName || 'Cliente'} - ${projectName} (V${cleanVersion}) - Purple`
      : `Cotización: ${clientName || 'Cliente'} (V${cleanVersion}) - Purple`
  );
  const [body, setBody] = useState(
    `Hola ${clientName || 'estimado cliente'},\n\nAdjuntamos el enlace a su cotización (${projectName ? projectName + ' - ' : ''}Versión ${cleanVersion}):\n${fullUrl}\n\nQuedamos atentos a sus comentarios.\n\nSaludos,\nEl equipo de Purple`
  );
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    setTo(clientEmail || '');
    const url = buildQuoteClientUrl(quoteId, clientName, projectName, version || 1);
    const sub = projectName
      ? `Cotización: ${clientName || 'Cliente'} - ${projectName} (V${version || 1}) - Purple`
      : `Cotización: ${clientName || 'Cliente'} (V${version || 1}) - Purple`;
    const b = `Hola ${clientName || 'estimado cliente'},\n\nAdjuntamos el enlace a su cotización (${projectName ? projectName + ' - ' : ''}Versión ${version || 1}):\n${url}\n\nQuedamos atentos a sus comentarios.\n\nSaludos,\nEl equipo de Purple`;
    setSubject(sub);
    setBody(b);
  }, [clientEmail, quoteId, clientName, projectName, version]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to) return;

    setIsSending(true);
    try {
      const htmlBody = body.replace(/\n/g, '<br/>');
      
      const res = await fetch(`${API_URL}/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject,
          html: htmlBody
        })
      });

      if (!res.ok) throw new Error('Error al enviar el correo');

      toast.success('¡Correo enviado con éxito!');
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('Error al enviar el correo. Verifica tu configuración SMTP en el servidor.');
    } finally {
      setIsSending(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="modal-overlay">
      <div className="modal-content animate-fade-in" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Enviar Cotización por Correo</h2>
          <button className="btn-icon" onClick={onClose} disabled={isSending}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Destinatario</label>
            <input 
              required
              type="email" 
              value={to} 
              onChange={e => setTo(e.target.value)} 
              className="form-control"
              placeholder="cliente@empresa.com"
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Asunto</label>
            <input 
              required
              type="text" 
              value={subject} 
              onChange={e => setSubject(e.target.value)} 
              className="form-control"
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Mensaje</label>
            <textarea 
              rows={6}
              value={body} 
              onChange={e => setBody(e.target.value)} 
              className="form-control"
              style={{ resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isSending}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={isSending} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              <span>{isSending ? 'Enviando...' : 'Enviar Correo'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
