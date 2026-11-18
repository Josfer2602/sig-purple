import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { X, Upload, CheckCircle, Loader2, DollarSign } from 'lucide-react';
import type { GastoProduccion } from '../types/models';
import { useGlobalContext } from '../context/GlobalContext';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedGastos: GastoProduccion[];
  onSuccess: () => void;
}

export const ReembolsoGastosModal: React.FC<Props> = ({ isOpen, onClose, selectedGastos, onSuccess }) => {
  const { reembolsarGastosLote } = useGlobalContext();
  const [fechaDevolucion, setFechaDevolucion] = useState(new Date().toISOString().split('T')[0]);
  const [codigoDevolucion, setCodigoDevolucion] = useState('');
  const [voucherFile, setVoucherFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || selectedGastos.length === 0) return null;

  const totalSum = selectedGastos.reduce((acc, g) => acc + (g.total || 0), 0);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setVoucherFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigoDevolucion.trim()) {
      toast.error('Por favor ingrese el número de operación o código bancario.');
      return;
    }

    setIsSubmitting(true);
    try {
      const gastoIds = selectedGastos.map(g => g.id);
      await reembolsarGastosLote(gastoIds, fechaDevolucion, codigoDevolucion.trim(), voucherFile);
      toast.success(`Devolución registrada exitosamente para ${selectedGastos.length} gastos (Total: S/ ${totalSum.toFixed(2)}).`);
      onSuccess();
      handleClose();
    } catch (err: any) {
      console.error(err);
      toast.error('Error al registrar la devolución: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setVoucherFile(null);
    setCodigoDevolucion('');
    onClose();
  };

  return ReactDOM.createPortal(
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '650px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <DollarSign size={22} color="var(--accent-primary)" />
            <h2 className="modal-title">Devolución / Reembolso en Lote</h2>
          </div>
          <button className="btn-icon" onClick={handleClose} disabled={isSubmitting}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {/* Summary Box */}
          <div style={{ background: 'rgba(102, 45, 145, 0.08)', border: '1px solid rgba(102, 45, 145, 0.2)', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Gastos Seleccionados:</span>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                  {selectedGastos.length} gasto(s)
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Monto Total a Depositar:</span>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--success)' }}>
                  S/ {totalSum.toFixed(2)}
                </div>
              </div>
            </div>

            {/* List of items */}
            <div style={{ marginTop: '12px', maxHeight: '140px', overflowY: 'auto', borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: '8px' }}>
              <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '4px' }}>Comprobante</th>
                    <th style={{ padding: '4px' }}>A quién se devuelve</th>
                    <th style={{ padding: '4px', textAlign: 'right' }}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedGastos.map(g => (
                    <tr key={g.id} style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                      <td style={{ padding: '4px', fontWeight: '500' }}>{g.tipoComprobante}: {g.numeroComprobante || g.id}</td>
                      <td style={{ padding: '4px', color: 'var(--text-secondary)' }}>{g.areaResponsable}</td>
                      <td style={{ padding: '4px', textAlign: 'right', fontWeight: 'bold' }}>S/ {g.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label>Fecha de Devolución *</label>
              <input
                type="date"
                className="form-control"
                value={fechaDevolucion}
                onChange={e => setFechaDevolucion(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label>N° de Operación / Código Bancario *</label>
              <input
                type="text"
                className="form-control"
                placeholder="Ej: OP-84920482 o BCP-552"
                value={codigoDevolucion}
                onChange={e => setCodigoDevolucion(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: '16px', minWidth: 0 }}>
            <label>Comprobante de Depósito (Voucher - Opcional)</label>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 8px 0' }}>
              Adjunta la constancia o captura de la transferencia bancaria si la tienes disponible.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label
                htmlFor="voucher-devolucion-file"
                style={{
                  flex: 1,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '16px',
                  background: voucherFile ? '#f5f3ff' : '#ffffff',
                  border: voucherFile ? '1.5px dashed var(--accent-primary)' : '1.5px dashed #cbd5e1',
                  borderRadius: '10px',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  color: voucherFile ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  fontWeight: voucherFile ? 600 : 400,
                  transition: 'all 0.2s ease'
                }}
              >
                <input
                  id="voucher-devolucion-file"
                  type="file"
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                  accept=".pdf,image/*"
                  disabled={isSubmitting}
                />
                <Upload size={20} color={voucherFile ? 'var(--accent-primary)' : 'currentColor'} />
                <span style={{ fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {voucherFile ? voucherFile.name : 'Subir Voucher de Transferencia Bancaria (Opcional)'}
                </span>
              </label>
              {voucherFile && !isSubmitting && (
                <>
                  <CheckCircle size={24} color="var(--success)" style={{ flexShrink: 0 }} />
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => setVoucherFile(null)}
                    title="Quitar archivo"
                    style={{ color: 'var(--danger)', flexShrink: 0 }}
                  >
                    <X size={18} />
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="modal-footer" style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn-secondary" onClick={handleClose} disabled={isSubmitting}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting || !codigoDevolucion.trim()}>
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Procesando Devolución...
                </>
              ) : (
                `Confirmar Devolución (S/ ${totalSum.toFixed(2)})`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
