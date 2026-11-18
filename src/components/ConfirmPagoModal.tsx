import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { X, Upload, CheckCircle, Loader2 } from 'lucide-react';
import type { Pago } from '../types/models';
import { useGlobalContext, API_URL } from '../context/GlobalContext';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  pago: Pago | null;
}

export const ConfirmPagoModal: React.FC<Props> = ({ isOpen, onClose, pago }) => {
  const { updatePago, token } = useGlobalContext();
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  if (!isOpen || !pago) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setComprobanteFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comprobanteFile) {
      toast.error("Por favor adjunta el comprobante de depósito.");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', comprobanteFile);
      if (pago.proyectoId) formData.append('projectId', pago.proyectoId);
      if (pago.clienteId) formData.append('clienteId', pago.clienteId);
      formData.append('area', 'Producción');
      formData.append('subfolder', 'Pago a proveedor');

      const res = await fetch(`${API_URL}/drive/upload`, {
        method: 'POST',
        headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Error al subir el comprobante a Drive');
      }

      const data = await res.json();
      const fileUrl = data.webViewLink || data.webContentLink || data.url;

      // Update the payment status to 'Pagado' and save the deposit voucher URL
      await updatePago({
        ...pago,
        estado: 'Pagado',
        comprobanteDeposito: fileUrl || comprobanteFile.name
      });
      
      toast.success("Pago liquidado y voucher adjuntado correctamente.");
      setComprobanteFile(null);
      setIsUploading(false);
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('Hubo un error al guardar el comprobante. Verifica que tu servidor esté corriendo.');
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (isUploading) return;
    setComprobanteFile(null);
    onClose();
  };

  return ReactDOM.createPortal(
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Confirmar Pago</h2>
          <button className="btn-icon" onClick={handleClose} disabled={isUploading}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div style={{ background: 'rgba(124, 58, 237, 0.05)', border: '1px solid rgba(124, 58, 237, 0.15)', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', margin: 0, lineHeight: 1.5 }}>
              Estás a punto de marcar el pago <strong style={{ color: 'var(--accent-primary)' }}>{pago.id}</strong> como <strong>Pagado</strong> (Monto: <strong style={{ color: 'var(--success)' }}>S/ {(Number(pago.monto) || 0).toFixed(2)}</strong>).
              <br />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Adjunta el comprobante o captura de transferencia bancaria para dejar constancia.</span>
            </p>
          </div>

          <div className="form-group" style={{ marginTop: '16px' }}>
            <label>Comprobante de Depósito / Voucher *</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ 
                flex: 1, 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                gap: '10px', 
                padding: '16px', 
                background: '#f8fafc', 
                border: '1.5px dashed #cbd5e1', 
                borderRadius: '8px', 
                cursor: isUploading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease'
              }}>
                <input type="file" style={{ display: 'none' }} onChange={handleFileUpload} accept=".pdf,image/*" required disabled={isUploading} />
                <Upload size={20} color="var(--accent-primary)" />
                <span style={{ fontSize: 'var(--text-sm)', color: comprobanteFile ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: comprobanteFile ? 600 : 400 }}>
                  {comprobanteFile ? comprobanteFile.name : 'Subir Archivo de Depósito (PDF o Imagen)'}
                </span>
              </label>
              {comprobanteFile && !isUploading && <CheckCircle size={22} color="var(--success)" />}
            </div>
          </div>

          <div className="modal-footer" style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn-secondary" onClick={handleClose} disabled={isUploading}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={isUploading || !comprobanteFile}>
              {isUploading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Subiendo y Confirmando...
                </>
              ) : (
                'Confirmar y Marcar Pagado'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
