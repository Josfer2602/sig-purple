import React, { useEffect, useState } from 'react';
import { API_URL } from '../utils/apiUrl';
import { generateItemsTitle, cleanItemDescription } from '../utils/orderTitleHelper';
import { replaceDocumentVariables } from '../utils/documentTemplateHelper';
import { parsePorcentajeAdelanto, resolveEffectiveDetraccion } from '../utils/ordenPaymentHelper';

export const PrintOrdenView: React.FC<{ ordenId: string }> = ({ ordenId }) => {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token') || localStorage.getItem('token') || '';
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(`${API_URL}/print/orden/${ordenId}${token ? `?token=${encodeURIComponent(token)}` : ''}`, { headers })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setData(d);
        // Signal Puppeteer the page is ready
        setTimeout(() => {
          const div = document.createElement('div');
          div.id = 'render-complete';
          document.body.appendChild(div);
        }, 800);
      })
      .catch(e => setError(e.message));
  }, [ordenId]);

  if (error) return <div style={{ padding: '40px', color: 'red' }}>Error: {error}</div>;
  if (!data) return <div style={{ padding: '40px' }}>Cargando orden...</div>;

  const { orden, proveedor, cliente, proyecto, config } = data;

  const subTotal = orden.items.reduce((acc: number, item: any) => acc + item.total, 0);
  const tieneIgv = proveedor?.tipoDocumento === 'Factura';
  const igv = tieneIgv ? subTotal * 0.18 : 0;
  const total = subTotal + igv;

  const porcentajeAdelanto = parsePorcentajeAdelanto(orden.condicionesPago);
  const aplicaDetraccionEfectiva = resolveEffectiveDetraccion({
    aplicaDetraccion: orden.aplicaDetraccion,
    porcentajeDetraccion: orden.porcentajeDetraccion,
    isServicio: orden.tipoOrden === 'Servicio' || String(orden.id || '').startsWith('OS-'),
    proveedorTipoDocumento: proveedor?.tipoDocumento
  });
  const adelanto = Number((total * porcentajeAdelanto).toFixed(2));
  const saldo = Number((total - adelanto).toFixed(2));

  const rawHeader = config?.ordenHeaderHtml ?? config?.headerHtml ?? '';
  const displayTitulo = (orden.titulo || orden.concepto || generateItemsTitle(orden.items) || '').trim();

  const templateVars = {
    tituloDocumento: `ORDEN DE ${orden.tipoOrden ? orden.tipoOrden.toUpperCase() : 'COMPRA'}`,
    numeroDocumento: orden.id,
    fechaDocumento: orden.fechaEmision || '-',
    titulo: displayTitulo,
    proveedorNombre: proveedor?.razonSocial || 'Proveedor',
    proveedorRuc: proveedor?.ruc || '-',
    clienteNombre: cliente?.empresa || '-',
    proyectoNombre: proyecto?.nombre || '-',
    condicionesPago: orden.condicionesPago || '-',
    total: `S/ ${total.toFixed(2)}`,
    moneda: 'PEN'
  };

  const finalHeader = replaceDocumentVariables(rawHeader, templateVars);
  const rawFooter = config?.ordenFooterHtml ?? config?.footerHtml ?? '';
  const finalFooter = replaceDocumentVariables(rawFooter, templateVars);

  return (
    <div style={{ background: 'white', minHeight: '100vh', padding: '40px', fontFamily: 'Arial, sans-serif', color: '#333' }}>
      {/* Header */}
      {finalHeader && <div dangerouslySetInnerHTML={{ __html: finalHeader }} />}

      {/* Banner de Concepto / Título de la Orden */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: '5px solid #7c3aed', padding: '12px 18px', borderRadius: '6px', marginBottom: '22px' }}>
        <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700, display: 'block', marginBottom: '3px' }}>
          Concepto / Refiere a:
        </span>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>
          {displayTitulo || 'Servicios / Compras generales'}
        </span>
      </div>

      {/* Proveedor / Cliente Info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Proveedor</h4>
          <p style={{ margin: '4px 0', fontWeight: 'bold' }}>{proveedor?.razonSocial || '-'}</p>
          <p style={{ margin: '4px 0', fontSize: '13px', color: '#4b5563' }}>RUC: {proveedor?.ruc || '-'}</p>
          <p style={{ margin: '4px 0', fontSize: '13px', color: '#4b5563' }}>{proveedor?.direccion || ''}</p>
          <p style={{ margin: '4px 0', fontSize: '13px', color: '#4b5563' }}>{proveedor?.email || ''}</p>
        </div>
        <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Cliente / Proyecto</h4>
          <p style={{ margin: '4px 0', fontWeight: 'bold' }}>{cliente?.empresa || '-'}</p>
          <p style={{ margin: '4px 0', fontSize: '13px', color: '#4b5563' }}>Proyecto: {proyecto?.nombre || '-'}</p>
          <p style={{ margin: '4px 0', fontSize: '13px', color: '#7c3aed', fontWeight: 600 }}>
            Refiere a: {displayTitulo || 'Servicios / Compras generales'}
          </p>
          <p style={{ margin: '4px 0', fontSize: '13px', color: '#4b5563' }}>Condiciones: {orden.condicionesPago || '-'}</p>
        </div>
      </div>

      {/* Información Bancaria & Condiciones */}
      <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px', marginBottom: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div>
          <h4 style={{ margin: '0 0 8px', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Condiciones de Pago</h4>
          <p style={{ margin: '4px 0', fontSize: '13px', color: '#374151' }}>{orden.condicionesPago || 'No especificadas'}</p>
        </div>
        <div>
          <h4 style={{ margin: '0 0 8px', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Información Bancaria</h4>
          {(() => {
            let cuenta = orden.cuentaBancariaId ? proveedor?.cuentas?.find((c: any) => c.id === orden.cuentaBancariaId) : null;
            if (!cuenta && proveedor?.cuentas && proveedor.cuentas.length > 0) {
              cuenta = proveedor.cuentas[0];
            }
            const cuentaBN = proveedor?.cuentas?.find((c: any) =>
              (c.tipoCuenta || '').toLowerCase().includes('detracc') ||
              (c.banco || '').toLowerCase().includes('nacion') ||
              (c.banco || '').toLowerCase().includes('nación')
            );

            return (
              <div style={{ fontSize: '13px', color: '#374151' }}>
                {cuenta ? (
                  <>
                    <p style={{ margin: '2px 0' }}><strong>Banco Comercial:</strong> {cuenta.banco} {cuenta.tipoCuenta ? `(${cuenta.tipoCuenta})` : ''}</p>
                    <p style={{ margin: '2px 0' }}><strong>Cuenta:</strong> {cuenta.numeroCuenta}</p>
                    {cuenta.cci && <p style={{ margin: '2px 0' }}><strong>CCI:</strong> {cuenta.cci}</p>}
                  </>
                ) : (
                  <p style={{ margin: '2px 0', fontSize: '13px', color: '#6b7280' }}>Sin cuenta bancaria registrada</p>
                )}
                {aplicaDetraccionEfectiva && (
                  <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #cbd5e1', fontSize: '12px', color: '#166534' }}>
                    <strong>🏦 Cuenta Detracciones BN:</strong>{' '}
                    {cuentaBN ? `${cuentaBN.numeroCuenta} (${cuentaBN.banco})` : '⚠️ No registrada en sistema'}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px', fontSize: '13px' }}>
        <thead>
          <tr style={{ background: '#7c3aed', color: 'white' }}>
            <th style={{ padding: '10px 12px', textAlign: 'left' }}>Descripción</th>
            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Cant.</th>
            <th style={{ padding: '10px 12px', textAlign: 'right' }}>P. Unit.</th>
            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {orden.items.map((item: any, i: number) => (
            <tr key={item.id} style={{ background: i % 2 === 0 ? '#f9fafb' : 'white' }}>
              <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>{cleanItemDescription(item.name || item.customDescription)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>{item.quantity}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>S/ {item.unitCost?.toFixed(2)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>S/ {item.total?.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '32px' }}>
        <div style={{ width: '320px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: '#6b7280' }}>Subtotal:</span><span>S/ {subTotal.toFixed(2)}</span>
          </div>
          {tieneIgv && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: '#6b7280' }}>IGV (18%):</span><span>S/ {igv.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '15px', borderTop: '2px solid #7c3aed', paddingTop: '8px', marginTop: '4px' }}>
            <span>TOTAL {aplicaDetraccionEfectiva ? 'BRUTO' : ''}:</span><span style={{ color: '#7c3aed' }}>S/ {total.toFixed(2)}</span>
          </div>

          {aplicaDetraccionEfectiva && (() => {
            const pct = orden.porcentajeDetraccion || 12;
            const mtoDetr = orden.montoDetraccion ?? Number((total * (pct / 100)).toFixed(2));
            const mtoNet = Number((total - mtoDetr).toFixed(2));
            return (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '8px 10px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#166534' }}>
                  <span>🏛️ Detracción SPOT ({pct}% BN):</span>
                  <strong style={{ color: '#dc2626' }}>- S/ {mtoDetr.toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', color: '#047857', fontWeight: 'bold', borderTop: '1px dashed #86efac', paddingTop: '4px' }}>
                  <span>NETO A TRANSFERIR:</span>
                  <span>S/ {mtoNet.toFixed(2)}</span>
                </div>
              </div>
            );
          })()}

          {porcentajeAdelanto > 0 && porcentajeAdelanto < 1 && (() => {
            const pct = orden.porcentajeDetraccion || 12;
            const mtoDetr = orden.montoDetraccion ?? Number((total * (pct / 100)).toFixed(2));
            const effectiveTotal = aplicaDetraccionEfectiva ? Number((total - mtoDetr).toFixed(2)) : total;
            const adelantoCalc = Number((effectiveTotal * porcentajeAdelanto).toFixed(2));
            const saldoCalc = Number((effectiveTotal - adelantoCalc).toFixed(2));
            return (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '6px' }}>
                  <span style={{ color: '#6b7280' }}>Adelanto ({porcentajeAdelanto * 100}%{aplicaDetraccionEfectiva ? ' s/Neto' : ''}):</span>
                  <span style={{ fontWeight: 600 }}>S/ {adelantoCalc.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: '#6b7280' }}>Saldo pendiente ({aplicaDetraccionEfectiva ? 's/Neto' : ''}):</span>
                  <span style={{ fontWeight: 600 }}>S/ {saldoCalc.toFixed(2)}</span>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Footer */}
      {finalFooter && <div dangerouslySetInnerHTML={{ __html: finalFooter }} />}
    </div>
  );
};

