import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, Printer, FileText, ExternalLink, Upload, Edit3 } from 'lucide-react';
import type { Pago, Orden, Proveedor, Cliente, Proyecto } from '../types/models';
import { useGlobalContext, BASE_URL, API_URL } from '../context/GlobalContext';
import { generateItemsTitle, cleanItemDescription } from '../utils/orderTitleHelper';
import { replaceDocumentVariables } from '../utils/documentTemplateHelper';
import { parsePorcentajeAdelanto, resolveEffectiveDetraccion } from '../utils/ordenPaymentHelper';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  pago: Pago | null;
  orden: Orden | undefined;
  proveedor: Proveedor | undefined;
  cliente: Cliente | undefined;
  proyecto: Proyecto | undefined;
  onViewOrden?: (orden: Orden) => void;
  onRegularize?: (pago: Pago) => void;
}

export const PagoDocumentModal: React.FC<Props> = ({ isOpen, onClose, pago, orden, proveedor, cliente, proyecto, onViewOrden, onRegularize }) => {
  const { appConfig, updatePago } = useGlobalContext();
  const [extraData, setExtraData] = useState<any>(null);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  useEffect(() => {
    if (pago) {
      setNoteText(pago.comentarios || pago.notas || '');
      setIsEditingNote(false);
    }
  }, [pago]);

  useEffect(() => {
    if (isOpen && pago?.id && (!orden || !orden.items || orden.items.length === 0)) {
      const token = localStorage.getItem('token') || '';
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      fetch(`${API_URL}/print/pago/${pago.id}${token ? `?token=${encodeURIComponent(token)}` : ''}`, { headers })
        .then(r => r.json())
        .then(d => {
          if (!d.error) setExtraData(d);
        })
        .catch(() => {});
    }
  }, [isOpen, pago?.id, orden]);

  if (!isOpen || !pago) return null;

  const currentOrden = (orden && orden.items && orden.items.length > 0) ? orden : (extraData?.orden || orden);
  const currentProveedor = proveedor || extraData?.proveedor;
  const currentCliente = cliente || extraData?.cliente;
  const currentProyecto = proyecto || extraData?.proyecto;

  const formatMoney = (val: number | undefined | null) =>
    'S/ ' + (Number(val) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const ordenItems = currentOrden?.items || [];
  const tieneIgv = currentProveedor?.tipoDocumento === 'Factura' || (!currentProveedor?.tipoDocumento && Number(currentOrden?.total) > 0);

  let subTotalOrden = 0;
  if (ordenItems.length > 0) {
    subTotalOrden = ordenItems.reduce((acc: number, item: any) => acc + (Number(item.total) || 0), 0);
  } else if (currentOrden?.total) {
    subTotalOrden = tieneIgv ? (Number(currentOrden.total) / 1.18) : Number(currentOrden.total);
  }

  const igvOrden = tieneIgv ? subTotalOrden * 0.18 : 0;
  const totalOrden = Number(currentOrden?.total) || (subTotalOrden + igvOrden);

  const porcentajeAdelanto = parsePorcentajeAdelanto(currentOrden?.condicionesPago);
  const aplicaDetraccionEfectiva = resolveEffectiveDetraccion({
    aplicaDetraccion: Boolean(pago.aplicaDetraccion || currentOrden?.aplicaDetraccion),
    porcentajeDetraccion: pago.aplicaDetraccion ? pago.porcentajeDetraccion : currentOrden?.porcentajeDetraccion,
    isServicio: currentOrden ? (currentOrden.tipoOrden === 'Servicio' || currentOrden.id.startsWith('OS-')) : true,
    proveedorTipoDocumento: currentProveedor?.tipoDocumento
  });
  const effectivePct = (pago.porcentajeDetraccion && pago.porcentajeDetraccion > 0)
    ? pago.porcentajeDetraccion
    : (currentOrden?.porcentajeDetraccion || 12);
  const adelantoOrden = Number((totalOrden * porcentajeAdelanto).toFixed(2));
  const saldoOrden = Number((totalOrden - adelantoOrden).toFixed(2));

  const handlePrint = () => {
    window.print();
  };

  const handleSaveNote = async () => {
    if (!pago) return;
    setIsSavingNote(true);
    try {
      await updatePago({
        ...pago,
        comentarios: noteText.trim(),
        notas: noteText.trim()
      });
      pago.comentarios = noteText.trim();
      pago.notas = noteText.trim();
      setIsEditingNote(false);
      toast.success("Nota / comentario del pago guardado exitosamente");
    } catch (err: any) {
      toast.error("Error al guardar la nota: " + (err.message || 'Error'));
    } finally {
      setIsSavingNote(false);
    }
  };

  const rawHeader = appConfig?.pagoHeaderHtml ?? appConfig?.headerHtml ?? '';
  const displayTitulo = (pago.concepto || currentOrden?.titulo || (currentOrden?.items ? generateItemsTitle(currentOrden.items) : '') || '').trim();

  const templateVars = {
    tituloDocumento: 'PAGO A PROVEEDOR',
    numeroDocumento: pago.id,
    fechaRegistro: pago.fechaRegistro || '-',
    fechaDocumento: pago.fechaRegistro || '-',
    titulo: displayTitulo,
    proveedorNombre: currentProveedor?.razonSocial || 'Proveedor',
    proveedorRuc: currentProveedor?.ruc || '-',
    clienteNombre: currentCliente?.empresa || '-',
    proyectoNombre: currentProyecto?.nombre || '-',
    condicionesPago: currentOrden?.condicionesPago || '-',
    total: formatMoney(pago.monto),
    moneda: 'PEN',
    comentarios: (pago.comentarios || pago.notas || noteText || '').trim() || '-',
    notas: (pago.notas || pago.comentarios || noteText || '').trim() || '-'
  };

  const finalHeader = replaceDocumentVariables(rawHeader, templateVars);
  const rawFooter = appConfig?.pagoFooterHtml ?? appConfig?.footerHtml ?? '';
  const finalFooter = replaceDocumentVariables(rawFooter, templateVars);

  const comprobanteFullUrl = pago.comprobanteUrl 
    ? (pago.comprobanteUrl.startsWith('http') ? pago.comprobanteUrl : `${BASE_URL}${pago.comprobanteUrl}`)
    : null;

  return ReactDOM.createPortal(
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
      zIndex: 1100,
      overflowY: 'auto',
      padding: '40px 20px'
    }}>
      <div style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', gap: '12px', zIndex: 10 }} className="no-print">
        {currentOrden && onViewOrden && (
          <button 
            type="button" 
            className="btn-secondary" 
            onClick={() => onViewOrden(currentOrden)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#8b5cf6', color: 'white', borderColor: '#8b5cf6', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer' }}
          >
            <FileText size={18} /> Ver {currentOrden.tipoOrden === 'Servicio' ? 'Orden de Servicio' : 'Orden de Compra'} ({currentOrden.id})
          </button>
        )}
        {comprobanteFullUrl ? (
          <button 
            type="button" 
            className="btn-secondary" 
            onClick={() => window.open(comprobanteFullUrl, '_blank')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#06b6d4', color: 'white', borderColor: '#06b6d4', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer' }}
          >
            <ExternalLink size={18} /> Ver Factura / RHE ({pago.numeroComprobante || 'Adjunto'})
          </button>
        ) : onRegularize && (
          <button 
            type="button" 
            className="btn-secondary" 
            onClick={() => onRegularize(pago)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#fef3c7', color: '#b45309', borderColor: '#fde68a', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
          >
            <Upload size={18} /> Regularizar Factura / Recibo
          </button>
        )}
        <button className="btn-primary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Printer size={18} /> Imprimir / PDF
        </button>
        <button className="btn-icon" onClick={onClose} style={{ background: 'var(--bg-panel)' }}><X size={20} /></button>
      </div>

      <div className="document-page" style={{
        background: 'white',
        color: 'black',
        width: '100%',
        maxWidth: '820px',
        padding: '40px',
        borderRadius: '8px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        fontSize: 'var(--text-sm)',
        fontFamily: 'Arial, sans-serif'
      }}>
          {/* Custom Header */}
          {finalHeader && (
            <div 
              dangerouslySetInnerHTML={{ __html: finalHeader }} 
              style={{ width: '100%', marginBottom: '30px' }}
            />
          )}

          <div>
            {/* Banner de Concepto / Título del Pago */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: '5px solid #7c3aed', padding: '12px 18px', borderRadius: '6px', marginBottom: '22px' }}>
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700, display: 'block', marginBottom: '3px' }}>
                Concepto / Refiere a:
              </span>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>
                {displayTitulo || 'Pago a proveedor'}
              </span>
            </div>

            {/* Info Section */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px', fontSize: 'var(--text-sm)' }}>
              <div style={{ background: '#f9fafb', padding: '14px', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #ccc', paddingBottom: '4px', color: '#444' }}>DATOS DEL PROVEEDOR</h4>
                <p style={{ margin: '4px 0' }}><strong>Razón Social:</strong> {currentProveedor?.razonSocial || 'N/A'}</p>
                <p style={{ margin: '4px 0' }}><strong>RUC:</strong> {currentProveedor?.ruc || 'N/A'}</p>
                <p style={{ margin: '4px 0' }}><strong>Contacto:</strong> {currentProveedor?.nombre || 'N/A'}</p>
                <p style={{ margin: '4px 0' }}><strong>Teléfono:</strong> {currentProveedor?.telefono || 'N/A'}</p>
                <p style={{ margin: '4px 0' }}><strong>Tipo Comprobante:</strong> {currentProveedor?.tipoDocumento || (tieneIgv ? 'Factura' : 'Recibo por Honorarios')}</p>
              </div>
              <div style={{ background: '#f9fafb', padding: '14px', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #ccc', paddingBottom: '4px', color: '#444' }}>REFERENCIA DE ORDEN Y PROYECTO</h4>
                <p style={{ margin: '4px 0' }}>
                  <strong>Orden N°:</strong>{' '}
                  {currentOrden && onViewOrden ? (
                    <button 
                      type="button" 
                      onClick={() => onViewOrden(currentOrden)}
                      style={{ background: 'none', border: 'none', color: '#6366f1', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontWeight: 'bold' }}
                    >
                      {currentOrden.id} ({currentOrden.tipoOrden === 'Servicio' ? 'Orden de Servicio' : 'Orden de Compra'})
                    </button>
                  ) : (
                    currentOrden?.id || pago.ordenId || 'N/A'
                  )}
                </p>
                <p style={{ margin: '4px 0' }}><strong>Tipo de Orden:</strong> {currentOrden?.tipoOrden === 'Servicio' ? 'Servicio (OS)' : 'Compra (OC)'}</p>
                <p style={{ margin: '4px 0' }}><strong>Cliente Final:</strong> {currentCliente?.empresa || 'N/A'}</p>
                <p style={{ margin: '4px 0' }}><strong>Proyecto:</strong> {currentProyecto?.nombre || 'N/A'}</p>
                <p style={{ margin: '4px 0', color: '#7c3aed', fontWeight: 600 }}>
                  <strong>Refiere a:</strong> {displayTitulo || 'Servicios / Compras generales'}
                </p>
                {comprobanteFullUrl && (
                  <p style={{ margin: '4px 0' }}>
                    <strong>Comprobante Tributario:</strong>{' '}
                    <a 
                      href={comprobanteFullUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      style={{ color: '#06b6d4', textDecoration: 'underline', fontWeight: 'bold' }}
                    >
                      {currentProveedor?.tipoDocumento || 'Factura / Recibo'} N° {pago.numeroComprobante || ''} ↗
                    </a>
                  </p>
                )}
              </div>
            </div>

            {/* Bank Info */}
            <div style={{ marginBottom: '24px', fontSize: 'var(--text-sm)', background: '#f9fafb', padding: '14px', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
              <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #ccc', paddingBottom: '4px', color: '#444' }}>INFORMACIÓN BANCARIA PARA DEPÓSITO</h4>
              {(() => {
                let cuenta = currentOrden?.cuentaBancariaId ? currentProveedor?.cuentas?.find((c: any) => c.id === currentOrden.cuentaBancariaId) : null;
                if (!cuenta && currentProveedor?.cuentas && currentProveedor.cuentas.length > 0) {
                  cuenta = currentProveedor.cuentas[0];
                }
                const cuentaBN = currentProveedor?.cuentas?.find((c: any) =>
                  (c.tipoCuenta || '').toLowerCase().includes('detracc') ||
                  (c.banco || '').toLowerCase().includes('nacion') ||
                  (c.banco || '').toLowerCase().includes('nación')
                );

                return (
                  <div>
                    {cuenta ? (
                      <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                        <p style={{ margin: '2px 0' }}><strong>Banco Comercial:</strong> {cuenta.banco} {cuenta.tipoCuenta ? `(${cuenta.tipoCuenta})` : ''}</p>
                        <p style={{ margin: '2px 0' }}><strong>Número de Cuenta:</strong> {cuenta.numeroCuenta}</p>
                        {cuenta.cci && <p style={{ margin: '2px 0' }}><strong>CCI:</strong> {cuenta.cci}</p>}
                      </div>
                    ) : pago.cuentaBancaria ? (
                      <p style={{ margin: '2px 0' }}><strong>Cuenta Comercial:</strong> {pago.cuentaBancaria}</p>
                    ) : (
                      <p style={{ margin: '2px 0', color: '#666' }}>El proveedor no tiene cuenta bancaria registrada.</p>
                    )}
                    {aplicaDetraccionEfectiva && (
                      <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed #cbd5e1', fontSize: '12px', color: '#166534' }}>
                        <strong>🏦 Cuenta Detracciones Banco de la Nación:</strong>{' '}
                        {cuentaBN ? `${cuentaBN.numeroCuenta} (${cuentaBN.banco})` : '⚠️ No registrada en sistema'}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Detalle de la Orden Asociada (OC / OS) - Con y Sin IGV */}
            {currentOrden && (
              <div style={{ marginBottom: '28px', fontSize: 'var(--text-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #7c3aed', paddingBottom: '6px', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0, color: '#7c3aed', textTransform: 'uppercase', fontSize: '13px', fontWeight: 'bold' }}>
                    DETALLE DE LA {currentOrden.tipoOrden === 'Servicio' ? 'ORDEN DE SERVICIO (OS)' : 'ORDEN DE COMPRA (OC)'} N° {currentOrden.id}
                  </h4>
                  <span style={{ fontSize: '12px', color: '#666' }}>
                    Fecha Emisión: {currentOrden.fechaEmision || '-'}
                  </span>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px', fontSize: 'var(--text-sm)' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #ccc' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', width: '50%' }}>DESCRIPCIÓN / CONCEPTO</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', width: '12%' }}>CANT.</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', width: '18%' }}>P. UNITARIO</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', width: '20%' }}>TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenItems.length > 0 ? (
                      ordenItems.map((item: any, idx: number) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '8px 10px' }}>{cleanItemDescription(item.customDescription || item.name)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>{item.quantity}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>{formatMoney(item.unitCost)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold' }}>{formatMoney(item.total)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} style={{ padding: '12px 10px', textAlign: 'center', color: '#666' }}>
                          Orden por concepto global ({currentOrden.tipoOrden || 'Compra'} N° {currentOrden.id})
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'bold' }}>
                        SUBTOTAL OC (SIN IGV):
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'bold' }}>
                        {formatMoney(subTotalOrden)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={3} style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'bold' }}>
                        {tieneIgv ? 'IGV (18%):' : 'IGV (Exonerado / RHE):'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'bold' }}>
                        {formatMoney(igvOrden)}
                      </td>
                    </tr>
                    <tr style={{ background: '#f8fafc', borderTop: '2px solid #7c3aed' }}>
                      <td colSpan={3} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', color: '#1e293b' }}>
                        TOTAL DE LA {currentOrden.tipoOrden === 'Servicio' ? 'OS' : 'OC'} (CON IGV):
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px', color: '#7c3aed' }}>
                        {formatMoney(totalOrden)}
                      </td>
                    </tr>
                  </tfoot>
                </table>

                {/* Condiciones de Pago de la Orden */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '8px 14px', borderRadius: '6px', fontSize: '12px', border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '8px' }}>
                  <div><strong>Condiciones de Pago:</strong> {currentOrden.condicionesPago || 'No especificadas'}</div>
                  {porcentajeAdelanto > 0 && porcentajeAdelanto < 1 && (
                    <div style={{ display: 'flex', gap: '20px' }}>
                      <span><strong>Adelanto ({porcentajeAdelanto * 100}%):</strong> <span style={{ color: '#7c3aed', fontWeight: 'bold' }}>{formatMoney(adelantoOrden)}</span></span>
                      <span><strong>Saldo Pendiente:</strong> <span style={{ fontWeight: 'bold' }}>{formatMoney(saldoOrden)}</span></span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Detalle del Pago a Realizar (Cuadrante Limpio Corporativo) */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '18px 20px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                <h4 style={{ margin: 0, color: '#334155', fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                  INFORMACIÓN DEL PAGO A PROVEEDOR
                </h4>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  Estado: <strong style={{ color: pago.estado === 'Pagado' ? '#16a34a' : '#d97706' }}>{pago.estado}</strong>
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', fontSize: '13px', alignItems: 'center' }}>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Fase de Pago</span>
                  <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{pago.tipoPago}</span>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Fecha Programada</span>
                  <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{pago.fechaPago || '-'}</span>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Comprobante Ref.</span>
                  <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{pago.numeroComprobante || 'Pendiente'}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>
                    {aplicaDetraccionEfectiva ? 'Neto Comercial a Transferir' : 'Monto a Pagar'}
                  </span>
                  <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#7c3aed' }}>{formatMoney(pago.monto)}</span>
                </div>
              </div>
              {aplicaDetraccionEfectiva && (() => {
                const pct = effectivePct;
                const detrAmt = pago.montoDetraccion || Number(((Number(pago.monto) / (1 - pct / 100)) * (pct / 100)).toFixed(2));
                return (
                  <div style={{ marginTop: '10px', padding: '8px 12px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                    <span style={{ color: '#166534', fontWeight: 600 }}>
                      🏛️ Pago sujeto a Detracción SPOT SUNAT ({pct}%):
                    </span>
                    <span style={{ color: '#15803d' }}>
                      Monto Detracción a depositar al BN: <strong>{formatMoney(detrAmt)}</strong>
                    </span>
                  </div>
                );
              })()}
              {(pago.concepto || currentOrden?.titulo) && (
                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>
                    Concepto del Pago:
                  </span>
                  <span style={{ fontWeight: 700, color: '#7c3aed', fontSize: '13.5px' }}>
                    {pago.concepto || currentOrden?.titulo}
                  </span>
                </div>
              )}
            </div>

            {/* Sección de Comentarios / Notas del Pago */}
            {(Boolean(pago.comentarios || pago.notas || noteText) || isEditingNote) ? (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: '5px solid #7c3aed', borderRadius: '8px', padding: '16px 20px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>
                    Notas / Observaciones del Pago:
                  </span>
                  <div className="no-print" style={{ display: 'flex', gap: '8px' }}>
                    {!isEditingNote ? (
                      <button
                        type="button"
                        onClick={() => setIsEditingNote(true)}
                        style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Edit3 size={13} /> Editar
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setNoteText(pago.comentarios || pago.notas || '');
                            setIsEditingNote(false);
                          }}
                          disabled={isSavingNote}
                          style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveNote}
                          disabled={isSavingNote}
                          style={{ background: '#7c3aed', color: 'white', border: 'none', padding: '2px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                        >
                          {isSavingNote ? 'Guardando...' : 'Guardar'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {isEditingNote ? (
                  <div className="no-print" style={{ marginTop: '8px' }}>
                    <textarea
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      placeholder="Escribe comentarios, observaciones o notas sobre este pago..."
                      rows={3}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                    />
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', color: '#1e293b', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                    {noteText || pago.comentarios || pago.notas}
                  </div>
                )}
              </div>
            ) : (
              <div className="no-print" style={{ marginBottom: '24px' }}>
                <button
                  type="button"
                  onClick={() => setIsEditingNote(true)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: '#f8fafc',
                    border: '1.5px dashed #cbd5e1',
                    borderRadius: '8px',
                    color: '#64748b',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Edit3 size={15} color="#7c3aed" />
                  <span>Agregar comentarios / notas a este pago (saldrá en el formato PDF)</span>
                </button>
              </div>
            )}
          </div>

          {/* Custom Footer */}
          {finalFooter && (
            <div 
              dangerouslySetInnerHTML={{ __html: finalFooter }} 
              style={{ width: '100%', marginTop: '40px' }}
            />
          )}
        </div>
        
        {/* Styles for print media */}
        <style>{`
          @media print {
            body * { visibility: hidden; }
            .document-page, .document-page * { visibility: visible; }
            .document-page {
              position: absolute;
              left: 0;
              top: 0;
              box-shadow: none !important;
              width: 100% !important;
              max-width: 100% !important;
            }
            .no-print { display: none !important; }
          }
        `}</style>
      </div>,
    document.body
  );
};
