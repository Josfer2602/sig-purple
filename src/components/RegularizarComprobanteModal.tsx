import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { 
  X, 
  Upload, 
  FileText, 
  CheckCircle, 
  AlertTriangle, 
  Loader2, 
  Sparkles, 
  Receipt,
  ExternalLink,
  ShieldCheck,
  CreditCard
} from 'lucide-react';
import { useGlobalContext, API_URL, BASE_URL } from '../context/GlobalContext';
import {
  isProveedorReciboPorHonorarios,
  isComprobanteSinDetraccion,
  resolveEffectiveDetraccion
} from '../utils/ordenPaymentHelper';
import type { Pago } from '../types/models';
import toast from 'react-hot-toast';

interface RegularizarComprobanteModalProps {
  isOpen: boolean;
  onClose: () => void;
  pago: Pago | null;
  onSuccess?: () => void;
}

interface AnalysisResult {
  rucEmisor?: string | null;
  razonSocialEmisor?: string | null;
  tipoComprobante?: string | null;
  numeroComprobante?: string | null;
  fechaEmision?: string | null;
  moneda?: string | null;
  montoTotal?: number;
  montoSubtotal?: number;
  igv?: number;
  retencion?: number;
  montoNeto?: number;
  montoSugerido?: number;
  descripcion?: string | null;
  rucMatch?: boolean | null;
  comprobanteUrl?: string;
  fileName?: string;
}

export const RegularizarComprobanteModal: React.FC<RegularizarComprobanteModalProps> = ({
  isOpen,
  onClose,
  pago,
  onSuccess
}) => {
  const { proveedores, proyectos, ordenes, updatePago } = useGlobalContext();

  const [file, setFile] = useState<File | null>(null);
  const [numeroComprobante, setNumeroComprobante] = useState('');
  const [comprobanteUrl, setComprobanteUrl] = useState('');
  const [montoPago, setMontoPago] = useState<number>(pago ? pago.monto : 0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  const proveedor = pago ? proveedores.find(p => p.id === pago.proveedorId) : null;
  const proyecto = pago ? proyectos.find(p => p.id === pago.proyectoId) : null;
  const orden = pago ? ordenes.find(o => o.id === pago.ordenId) : null;

  useEffect(() => {
    if (isOpen && pago) {
      const currentNum = (pago.numeroComprobante || '').trim();
      setNumeroComprobante(currentNum === 'POR REGULARIZAR' || currentNum === 'PENDIENTE' ? '' : currentNum);
      setComprobanteUrl(pago.comprobanteUrl || '');
      setMontoPago(pago.monto);
      setFile(null);
      setAnalysisResult(null);
    }
  }, [isOpen, pago]);

  if (!isOpen || !pago) return null;

  const cleanDocRuc = (analysisResult?.rucEmisor || '').replace(/\D/g, '');
  const cleanProvRuc = (proveedor?.ruc || '').replace(/\D/g, '');
  const isRucMismatch = cleanDocRuc && cleanProvRuc && cleanDocRuc !== cleanProvRuc;
  const isRucMatch = cleanDocRuc && cleanProvRuc && cleanDocRuc === cleanProvRuc;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (proveedor?.ruc) formData.append('proveedorRuc', proveedor.ruc);
      if (proveedor?.razonSocial) formData.append('proveedorNombre', proveedor.razonSocial);
      if (pago.monto) formData.append('ordenTotal', String(pago.monto));
      if (pago.proyectoId) formData.append('projectId', pago.proyectoId);
      if (pago.clienteId) formData.append('clienteId', pago.clienteId);

      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/pagos/analyze-comprobante`, {
        method: 'POST',
        headers,
        body: formData
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'No se pudo analizar el comprobante.');

      if (resData.success && resData.data) {
        const d: AnalysisResult = resData.data;
        setAnalysisResult(d);

        if (isComprobanteSinDetraccion(d.tipoComprobante) && (pago.aplicaDetraccion || orden?.aplicaDetraccion)) {
          toast(`📄 ${d.tipoComprobante} detectado: no corresponde detracción SPOT y se ajustará al guardar.`, { icon: 'ℹ️' });
        }

        if (d.numeroComprobante) {
          setNumeroComprobante(d.numeroComprobante);
        }
        if (d.comprobanteUrl) {
          setComprobanteUrl(d.comprobanteUrl);
        }

        const docRuc = (d.rucEmisor || '').replace(/\D/g, '');
        const provRuc = (proveedor?.ruc || '').replace(/\D/g, '');

        if (provRuc && docRuc) {
          if (provRuc === docRuc) {
            toast.success(`✅ RUC verificado: ${d.rucEmisor} coincide con ${proveedor?.razonSocial}`);
          } else {
            toast.error(
              `⚠️ ALERTA: El RUC en factura (${d.rucEmisor}) NO coincide con el proveedor (${proveedor?.ruc} - ${proveedor?.razonSocial})`,
              { duration: 7000 }
            );
          }
        } else {
          toast.success('Datos extraídos del comprobante con éxito.');
        }
      }
    } catch (err: any) {
      console.error('Error al analizar comprobante:', err);
      toast.error('No se pudo extraer información automáticamente: ' + (err.message || 'Error'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalNumero = numeroComprobante.trim();
    if (!finalNumero) {
      return toast.error('Ingresa el número oficial de comprobante o factura emitido por el proveedor.');
    }
    if (finalNumero.toUpperCase() === 'POR REGULARIZAR' || finalNumero.toUpperCase() === 'PENDIENTE') {
      return toast.error('Por favor especifica el número real de factura (ej. F001-000452 o E001-45).');
    }

    if (!comprobanteUrl && !file) {
      const confirmWithoutFile = window.confirm(
        'No has adjuntado el archivo digital (PDF o Imagen) de la factura. ¿Deseas guardar solo el número de comprobante?'
      );
      if (!confirmWithoutFile) return;
    }

    setIsSaving(true);
    try {
      const newMonto = Number(montoPago) > 0 ? Number(montoPago) : pago.monto;
      const sinDetraccion =
        isProveedorReciboPorHonorarios(proveedor) ||
        isComprobanteSinDetraccion(analysisResult?.tipoComprobante);
      const effectiveDetr = resolveEffectiveDetraccion({
        aplicaDetraccion: pago.aplicaDetraccion,
        porcentajeDetraccion: pago.porcentajeDetraccion,
        isServicio: orden ? (orden.tipoOrden === 'Servicio' || orden.id.startsWith('OS-')) : true,
        proveedorTipoDocumento: proveedor?.tipoDocumento,
        comprobanteTipo: analysisResult?.tipoComprobante
      });

      const updatedPago: Pago = {
        ...pago,
        monto: newMonto,
        numeroComprobante: finalNumero,
        comprobanteUrl: comprobanteUrl || pago.comprobanteUrl,
        ...(sinDetraccion || !effectiveDetr
          ? {
              aplicaDetraccion: false,
              porcentajeDetraccion: 0,
              montoDetraccion: 0,
              montoNeto: newMonto
            }
          : {})
      };

      await updatePago(updatedPago);
      toast.success(`¡Comprobante regularizado exitosamente para el pago ${pago.id}!`);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Error al regularizar comprobante:', err);
      toast.error('Error al guardar regularización: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 }).format(amount);
  };

  return ReactDOM.createPortal(
    <div className="modal-overlay" style={{ zIndex: 1300, backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)' }}>
      <div 
        className="modal-content" 
        style={{ 
          maxWidth: '680px', 
          width: '100%', 
          maxHeight: 'calc(100vh - 64px)', 
          display: 'flex', 
          flexDirection: 'column', 
          overflow: 'hidden',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)'
        }}
      >
        {/* HEADER */}
        <div className="modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '10px', borderRadius: '12px', background: '#fef3c7', color: '#b45309' }}>
              <Receipt size={24} />
            </div>
            <div>
              <h2 className="modal-title" style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b' }}>
                Regularizar Factura / Recibo
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                Adjunta y valida el comprobante emitido por el proveedor para liquidar contablemente.
              </p>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} disabled={isSaving}>
            <X size={20} />
          </button>
        </div>

        {/* BODY */}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* CARD RESUMEN DEL PAGO */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Pago ID</span>
                  <div style={{ fontWeight: 700, color: 'var(--accent-primary)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CreditCard size={15} />
                    {pago.id}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                    Monto de este Pago ({pago.tipoPago})
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '2px 8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b', marginRight: '4px' }}>S/</span>
                      <input
                        type="number"
                        step="0.01"
                        value={montoPago || ''}
                        onChange={e => setMontoPago(parseFloat(e.target.value) || 0)}
                        style={{
                          fontWeight: 800,
                          color: '#059669',
                          fontSize: '15px',
                          width: '100px',
                          border: 'none',
                          outline: 'none',
                          background: 'transparent'
                        }}
                      />
                    </div>
                    {orden && orden.total > 0 && pago.tipoPago === 'Adelanto' && Math.abs(montoPago - (orden.total * 0.5)) > 0.05 && (
                      <button
                        type="button"
                        onClick={() => setMontoPago(Number((orden.total * 0.5).toFixed(2)))}
                        style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          background: '#eff6ff',
                          color: '#2563eb',
                          border: '1px solid #bfdbfe',
                          cursor: 'pointer',
                          fontWeight: 600
                        }}
                        title="Corregir monto a la cuota del 50% de la orden"
                      >
                        ⚡ 50% (S/ {(orden.total * 0.5).toFixed(2)})
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Proveedor</span>
                  <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '13px' }}>
                    {proveedor?.razonSocial || 'Proveedor'}
                  </div>
                  {proveedor?.ruc && (
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      RUC: <strong>{proveedor.ruc}</strong> ({proveedor.tipoDocumento || 'Factura'})
                    </div>
                  )}
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Proyecto / Orden</span>
                  <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '13px' }}>
                    {proyecto?.nombre || 'Proyecto'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    Orden: <strong>{pago.ordenId || '-'}</strong> {orden ? `(Total Orden: S/ ${orden.total.toFixed(2)})` : ''}
                  </div>
                  {orden?.condicionesPago && (
                    <div style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 600 }}>
                      Condición: {orden.condicionesPago}
                    </div>
                  )}
                </div>
              </div>

              {(isProveedorReciboPorHonorarios(proveedor) || isComprobanteSinDetraccion(analysisResult?.tipoComprobante)) && (pago.aplicaDetraccion || orden?.aplicaDetraccion) && (
                <div style={{ marginTop: '10px', padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', fontSize: '12px', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📄</span>
                  <span>
                    <strong>{analysisResult?.tipoComprobante && isComprobanteSinDetraccion(analysisResult.tipoComprobante) ? analysisResult.tipoComprobante : 'Recibo por Honorarios'}:</strong>{' '}
                    No corresponde detracción SPOT SUNAT. Al guardar se limpiará el indicador de detracción del pago.
                  </span>
                </div>
              )}

              {analysisResult?.montoTotal && analysisResult.montoTotal > montoPago && (
                <div style={{ marginTop: '12px', padding: '8px 12px', borderRadius: '8px', background: '#eef2ff', border: '1px solid #c7d2fe', fontSize: '12px', color: '#3730a3', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>
                    📄 Factura emitida por el total: <strong>S/ {analysisResult.montoTotal.toFixed(2)}</strong>. Este pago regulariza la cuota de <strong>{pago.tipoPago} (S/ {montoPago.toFixed(2)})</strong>.
                  </span>
                  <button
                    type="button"
                    onClick={() => setMontoPago(analysisResult.montoTotal!)}
                    style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#ffffff', border: '1px solid #a5b4fc', color: '#4338ca', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Asignar 100% de factura a este pago
                  </button>
                </div>
              )}
            </div>

            {/* SECCIÓN CARGA DE ARCHIVO Y ANÁLISIS IA */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                Subir Factura o Recibo por Honorarios (PDF o Imagen)
              </label>

              <label 
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  padding: '24px 16px', 
                  borderRadius: '12px', 
                  border: isAnalyzing ? '2px dashed #7c3aed' : '2px dashed #cbd5e1', 
                  backgroundColor: isAnalyzing ? '#f5f3ff' : '#fafafa',
                  cursor: isAnalyzing ? 'wait' : 'pointer',
                  transition: 'all 0.2s ease',
                  textAlign: 'center'
                }}
              >
                <input 
                  type="file" 
                  style={{ display: 'none' }} 
                  onChange={handleFileChange} 
                  accept=".pdf,image/*" 
                  disabled={isAnalyzing || isSaving} 
                />

                {isAnalyzing ? (
                  <>
                    <Loader2 size={32} color="#7c3aed" style={{ animation: 'spin 1s linear infinite', marginBottom: '10px' }} />
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#7c3aed' }}>
                      Analizando comprobante con IA...
                    </span>
                    <span style={{ fontSize: '12px', color: '#6d28d9', marginTop: '4px' }}>
                      Extrayendo número oficial, verificando RUC y confirmando importes
                    </span>
                  </>
                ) : file || comprobanteUrl ? (
                  <>
                    <div style={{ display: 'inline-flex', padding: '8px', borderRadius: '50%', background: '#ecfdf5', color: '#059669', marginBottom: '8px' }}>
                      <CheckCircle size={24} />
                    </div>
                    <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#1e293b' }}>
                      {file ? file.name : 'Archivo digital vinculado'}
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                      Haz clic para cambiar el archivo si deseas reemplazarlo
                    </span>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'inline-flex', padding: '8px', borderRadius: '50%', background: '#e0e7ff', color: '#4f46e5', marginBottom: '8px' }}>
                      <Upload size={24} />
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                      Haz clic para seleccionar o arrastra el archivo aquí
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                      Soporta Facturas y RHE en PDF, JPG, PNG o WebP
                    </span>
                  </>
                )}
              </label>
            </div>

            {/* FEEDBACK DE VERIFICACIÓN DE RUC */}
            {analysisResult && !isAnalyzing && (
              <div>
                {isRucMatch && (
                  <div style={{ padding: '12px 16px', background: '#ecfdf5', border: '1.5px solid #10b981', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px', color: '#065f46' }}>
                    <ShieldCheck size={22} color="#10b981" style={{ flexShrink: 0 }} />
                    <div style={{ fontSize: '13px' }}>
                      <strong style={{ display: 'block' }}>RUC Verificado y Conforme</strong>
                      El RUC <strong>{analysisResult.rucEmisor}</strong> en la factura coincide con la ficha de <strong>{proveedor?.razonSocial}</strong>.
                    </div>
                  </div>
                )}

                {isRucMismatch && (
                  <div style={{ padding: '12px 16px', background: '#fef2f2', border: '2px solid #ef4444', borderRadius: '10px', display: 'flex', alignItems: 'flex-start', gap: '10px', color: '#991b1b' }}>
                    <AlertTriangle size={22} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '13px' }}>
                      <strong style={{ display: 'block', fontSize: '13.5px' }}>⚠️ Alerta: Discrepancia en RUC del Emisor</strong>
                      <span>• RUC en comprobante: <strong>{analysisResult.rucEmisor}</strong> ({analysisResult.razonSocialEmisor || 'Emisor detectado'})</span><br />
                      <span>• RUC del proveedor registrado: <strong>{proveedor?.ruc}</strong> ({proveedor?.razonSocial})</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* INPUTS DE REGULARIZACIÓN */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, minmax(0, 1fr))', gap: '16px' }}>
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ margin: 0, fontWeight: 600, fontSize: '13px' }}>
                    Número Oficial de Factura / Recibo *
                  </label>
                  {analysisResult?.numeroComprobante && (
                    <span style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Sparkles size={12} /> Extraído con IA
                    </span>
                  )}
                </div>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="ej. F001-000452 o E001-48" 
                  value={numeroComprobante} 
                  onChange={e => setNumeroComprobante(e.target.value)} 
                  required 
                  style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '0.5px' }}
                />
              </div>

              {comprobanteUrl && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <FileText size={16} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', color: '#334155', fontWeight: 500, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      Documento digital listo para archivar
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const fullUrl = comprobanteUrl.startsWith('http') ? comprobanteUrl : `${BASE_URL}${comprobanteUrl}`;
                      window.open(fullUrl, '_blank');
                    }}
                    style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <ExternalLink size={13} />
                    Ver Archivo
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* FOOTER */}
          <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#fafafa', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isSaving}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={isSaving || isAnalyzing || !numeroComprobante.trim()}>
              {isSaving ? 'Guardando regularización...' : 'Guardar y Regularizar Comprobante'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
