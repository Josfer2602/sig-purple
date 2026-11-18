import React from 'react';
import ReactDOM from 'react-dom';
import { X, Printer, Mail, ExternalLink, Paperclip } from 'lucide-react';
import type { Orden } from '../types/models';
import { useGlobalContext } from '../context/GlobalContext';
import { generateItemsTitle, cleanItemDescription } from '../utils/orderTitleHelper';
import { replaceDocumentVariables } from '../utils/documentTemplateHelper';
import { parsePorcentajeAdelanto, resolveEffectiveDetraccion } from '../utils/ordenPaymentHelper';

interface OrdenDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orden: Orden | null;
  onSendEmail?: (orden: Orden) => void;
}

export const OrdenDocumentModal: React.FC<OrdenDocumentModalProps> = ({ isOpen, onClose, orden, onSendEmail }) => {
  const { clientes, proyectos, proveedores, appConfig } = useGlobalContext();

  if (!isOpen || !orden) return null;

  const proveedor = proveedores.find(p => p.id === orden.proveedorId);
  const cliente = clientes.find(c => c.id === orden.clienteId);
  const proyecto = proyectos.find(p => p.id === orden.proyectoId);

  const subTotal = orden.items.reduce((acc, item) => acc + item.total, 0);
  const tieneIgv = proveedor?.tipoDocumento === 'Factura';
  const igv = tieneIgv ? subTotal * 0.18 : 0;

  const porcentajeAdelanto = parsePorcentajeAdelanto(orden.condicionesPago);
  const aplicaDetraccionEfectiva = resolveEffectiveDetraccion({
    aplicaDetraccion: orden.aplicaDetraccion,
    porcentajeDetraccion: orden.porcentajeDetraccion,
    isServicio: orden.tipoOrden === 'Servicio' || orden.id.startsWith('OS-'),
    proveedorTipoDocumento: proveedor?.tipoDocumento
  });
  const adelanto = Number((orden.total * porcentajeAdelanto).toFixed(2));
  const saldo = Number((orden.total - adelanto).toFixed(2));

  const handlePrint = () => {
    window.print();
  };

  const rawHeader = appConfig?.ordenHeaderHtml ?? appConfig?.headerHtml ?? '';
  const displayTitulo = (orden.titulo || (orden as any).concepto || generateItemsTitle(orden.items) || '').trim();

  const templateVars = {
    tituloDocumento: `ORDEN DE ${orden.tipoOrden ? orden.tipoOrden.toUpperCase() : 'COMPRA'}`,
    numeroDocumento: orden.id,
    fechaEmision: orden.fechaEmision || '-',
    fechaDocumento: orden.fechaEmision || '-',
    titulo: displayTitulo,
    proveedorNombre: proveedor?.razonSocial || 'Proveedor',
    proveedorRuc: proveedor?.ruc || '-',
    clienteNombre: cliente?.empresa || '-',
    proyectoNombre: proyecto?.nombre || '-',
    condicionesPago: orden.condicionesPago || '-',
    total: `S/ ${orden.total.toFixed(2)}`,
    moneda: 'PEN'
  };

  const finalHeader = replaceDocumentVariables(rawHeader, templateVars);
  const rawFooter = appConfig?.ordenFooterHtml ?? appConfig?.footerHtml ?? '';
  const finalFooter = replaceDocumentVariables(rawFooter, templateVars);

  return ReactDOM.createPortal(
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
      zIndex: 1100,
      overflowY: 'auto',
      padding: '40px 20px'
    }}>
      <div style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }} className="no-print">
        {orden.cotizacionProveedorUrl && (
          <a 
            href={orden.cotizacionProveedorUrl} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '8px 14px', borderRadius: '8px', textDecoration: 'none', fontWeight: 600, fontSize: '13px' }}
            title={`Abrir cotización de ${proveedor?.razonSocial || 'proveedor'} en Google Drive`}
          >
            <Paperclip size={16} /> Cotización Proveedor
          </a>
        )}
        {orden.pdfUrl && (
          <a 
            href={orden.pdfUrl} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '8px 14px', borderRadius: '8px', textDecoration: 'none', fontWeight: 600, fontSize: '13px' }}
            title="Abrir PDF oficial en Google Drive"
          >
            <ExternalLink size={16} /> Ver en Drive
          </a>
        )}
        {onSendEmail && (
          <button 
            type="button" 
            className="btn-secondary" 
            onClick={() => onSendEmail(orden)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#ffffff', color: '#1e293b' }}
          >
            <Mail size={16} /> Enviar por Correo
          </button>
        )}
        <button className="btn-primary" onClick={handlePrint}>
          <Printer size={18} /> Imprimir / PDF
        </button>
        <button className="btn-icon" onClick={onClose} style={{ background: 'var(--bg-panel)' }}><X size={20} /></button>
      </div>

      <div className="document-page" style={{
        background: 'white',
        color: 'black',
        width: '100%',
        maxWidth: '800px',
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
          {/* Banner de Concepto / Título de la Orden */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: '5px solid #7c3aed', padding: '12px 18px', borderRadius: '6px', marginBottom: '22px' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700, display: 'block', marginBottom: '3px' }}>
              Concepto / Refiere a:
            </span>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>
              {displayTitulo || 'Servicios / Compras generales'}
            </span>
          </div>

          {/* Datos del Proveedor y Referencia */}
          <div style={{ display: 'flex', gap: '40px', marginBottom: '30px' }}>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 'var(--text-sm)', borderBottom: '1px solid #ccc', paddingBottom: '4px', marginBottom: '8px' }}>DATOS DEL PROVEEDOR</h3>
              <p style={{ margin: '4px 0', fontSize: 'var(--text-sm)' }}><strong>Razón Social:</strong> {proveedor?.razonSocial || 'N/A'}</p>
              <p style={{ margin: '4px 0', fontSize: 'var(--text-sm)' }}><strong>RUC:</strong> {proveedor?.ruc || 'N/A'}</p>
              <p style={{ margin: '4px 0', fontSize: 'var(--text-sm)' }}><strong>Atención:</strong> {proveedor?.nombre || 'N/A'}</p>
              <p style={{ margin: '4px 0', fontSize: 'var(--text-sm)' }}><strong>Correo:</strong> {proveedor?.correo || 'N/A'}</p>
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 'var(--text-sm)', borderBottom: '1px solid #ccc', paddingBottom: '4px', marginBottom: '8px' }}>REFERENCIA</h3>
              <p style={{ margin: '4px 0', fontSize: 'var(--text-sm)' }}><strong>Cliente final:</strong> {cliente?.empresa || 'N/A'}</p>
              <p style={{ margin: '4px 0', fontSize: 'var(--text-sm)' }}><strong>Proyecto:</strong> {proyecto?.nombre || 'N/A'}</p>
              <p style={{ margin: '4px 0', fontSize: 'var(--text-sm)', color: '#7c3aed', fontWeight: 600 }}>
                <strong>Refiere a:</strong> {displayTitulo || 'Servicios / Compras generales'}
              </p>
            </div>
          </div>

        {/* Tabla de Conceptos */}
        <div style={{ marginBottom: '30px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #ccc' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', width: '50%' }}>DESCRIPCIÓN</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>CANT.</th>
                <th style={{ padding: '10px 8px', textAlign: 'right' }}>P. UNITARIO</th>
                <th style={{ padding: '10px 8px', textAlign: 'right' }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {orden.items.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px 8px' }}>{cleanItemDescription(item.customDescription || item.name)}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center' }}>{item.quantity}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>S/ {(item.unitCost).toFixed(2)}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 'bold' }}>S/ {(item.total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: 'var(--text-sm)' }}>SUBTOTAL:</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: 'var(--text-sm)' }}>
                  S/ {subTotal.toFixed(2)}
                </td>
              </tr>
              {tieneIgv && (
                <tr>
                  <td colSpan={3} style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: 'var(--text-sm)' }}>IGV (18%):</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: 'var(--text-sm)' }}>
                    S/ {igv.toFixed(2)}
                  </td>
                </tr>
              )}
              <tr>
                <td colSpan={3} style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: 'var(--text-sm)' }}>
                  TOTAL DE LA ORDEN {aplicaDetraccionEfectiva ? '(BRUTO)' : ''}:
                </td>
                <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: 'var(--text-base)', color: '#6366f1' }}>
                  S/ {orden.total.toFixed(2)}
                </td>
              </tr>
              {aplicaDetraccionEfectiva && (() => {
                const pct = orden.porcentajeDetraccion || 12;
                const mtoDetr = orden.montoDetraccion ?? Number((orden.total * (pct / 100)).toFixed(2));
                const mtoNet = Number((orden.total - mtoDetr).toFixed(2));
                return (
                  <>
                    <tr style={{ background: '#f0fdf4' }}>
                      <td colSpan={3} style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, fontSize: 'var(--text-xs)', color: '#166534' }}>
                        🏛️ DETRACCIÓN SPOT ({pct}% BANCO DE LA NACIÓN):
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: 'var(--text-xs)', color: '#dc2626' }}>
                        - S/ {mtoDetr.toFixed(2)}
                      </td>
                    </tr>
                    <tr style={{ background: '#ecfdf5', borderTop: '1px solid #86efac' }}>
                      <td colSpan={3} style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: 'var(--text-sm)', color: '#047857' }}>
                        TOTAL NETO A TRANSFERIR A CUENTA COMERCIAL:
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: 'var(--text-base)', color: '#047857' }}>
                        S/ {mtoNet.toFixed(2)}
                      </td>
                    </tr>
                  </>
                );
              })()}
            </tfoot>
          </table>
        </div>

        {/* Condiciones y Banco */}
        <div style={{ marginBottom: '40px', display: 'flex', gap: '40px' }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 'var(--text-sm)', borderBottom: '1px solid #ccc', paddingBottom: '4px', marginBottom: '8px' }}>CONDICIONES DE PAGO</h3>
            <p style={{ fontSize: 'var(--text-sm)', whiteSpace: 'pre-wrap', margin: 0 }}>
              {orden.condicionesPago || 'No se especificaron condiciones de pago.'}
            </p>
            {porcentajeAdelanto > 0 && porcentajeAdelanto < 1 && (() => {
              const pct = orden.porcentajeDetraccion || 12;
              const mtoDetr = orden.montoDetraccion ?? Number((orden.total * (pct / 100)).toFixed(2));
              const effectiveTotal = aplicaDetraccionEfectiva ? Number((orden.total - mtoDetr).toFixed(2)) : orden.total;
              const adelantoCalc = Number((effectiveTotal * porcentajeAdelanto).toFixed(2));
              const saldoCalc = Number((effectiveTotal - adelantoCalc).toFixed(2));
              return (
                <div style={{ marginTop: '12px', display: 'flex', gap: '24px', fontSize: 'var(--text-sm)' }}>
                  <div>
                    <strong>Adelanto ({porcentajeAdelanto * 100}%{aplicaDetraccionEfectiva ? ' s/Neto' : ''}):</strong> <span style={{ color: '#6366f1', fontWeight: 'bold' }}>S/ {adelantoCalc.toFixed(2)}</span>
                  </div>
                  <div>
                    <strong>Saldo Pendiente:</strong> <span style={{ fontWeight: 'bold' }}>S/ {saldoCalc.toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}
          </div>
          
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 'var(--text-sm)', borderBottom: '1px solid #ccc', paddingBottom: '4px', marginBottom: '8px' }}>INFORMACIÓN BANCARIA</h3>
            {(() => {
              let cuenta = orden.cuentaBancariaId ? proveedor?.cuentas?.find(c => c.id === orden.cuentaBancariaId) : null;
              if (!cuenta && proveedor?.cuentas && proveedor.cuentas.length > 0) {
                cuenta = proveedor.cuentas[0];
              }
              const cuentaBN = proveedor?.cuentas?.find(c =>
                (c.tipoCuenta || '').toLowerCase().includes('detracc') ||
                (c.banco || '').toLowerCase().includes('nacion') ||
                (c.banco || '').toLowerCase().includes('nación')
              );

              if (cuenta) {
                return (
                  <div style={{ fontSize: 'var(--text-sm)' }}>
                    <p style={{ margin: '4px 0' }}><strong>Banco Comercial:</strong> {cuenta.banco} {cuenta.tipoCuenta ? `(${cuenta.tipoCuenta})` : ''}</p>
                    <p style={{ margin: '4px 0' }}><strong>Cuenta:</strong> {cuenta.numeroCuenta}</p>
                    {cuenta.cci && <p style={{ margin: '4px 0' }}><strong>CCI:</strong> {cuenta.cci}</p>}
                    {aplicaDetraccionEfectiva && (
                      <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed #cbd5e1', fontSize: '12px', color: '#166534' }}>
                        <strong>🏦 Cuenta Detracciones BN:</strong>{' '}
                        {cuentaBN ? `${cuentaBN.numeroCuenta} (${cuentaBN.banco})` : '⚠️ No registrada en sistema'}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <p style={{ fontSize: 'var(--text-sm)', margin: 0, color: '#666' }}>El proveedor no tiene cuentas bancarias registradas.</p>
              );
            })()}
          </div>
        </div>

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
