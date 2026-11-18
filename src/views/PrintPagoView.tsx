import React, { useEffect, useState } from 'react';
import { API_URL } from '../utils/apiUrl';
import { generateItemsTitle, cleanItemDescription } from '../utils/orderTitleHelper';
import { replaceDocumentVariables } from '../utils/documentTemplateHelper';
import { parsePorcentajeAdelanto, resolveEffectiveDetraccion } from '../utils/ordenPaymentHelper';

export const PrintPagoView: React.FC<{ pagoId: string }> = ({ pagoId }) => {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token') || localStorage.getItem('token') || '';
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(`${API_URL}/print/pago/${pagoId}${token ? `?token=${encodeURIComponent(token)}` : ''}`, { headers })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setData(d);
        setTimeout(() => {
          const div = document.createElement('div');
          div.id = 'render-complete';
          document.body.appendChild(div);
        }, 800);
      })
      .catch(e => setError(e.message));
  }, [pagoId]);

  if (error) return <div style={{ padding: '40px', color: 'red' }}>Error: {error}</div>;
  if (!data) return <div style={{ padding: '40px' }}>Cargando pago...</div>;

  const { pago, orden, proveedor, cliente, proyecto, config } = data;

  const formatMoney = (val: number | undefined | null) =>
    'S/ ' + (Number(val) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const ordenItems = orden?.items || [];
  const tieneIgv = proveedor?.tipoDocumento === 'Factura' || (!proveedor?.tipoDocumento && Number(orden?.total) > 0);

  let subTotalOrden = 0;
  if (ordenItems.length > 0) {
    subTotalOrden = ordenItems.reduce((acc: number, item: any) => acc + (Number(item.total) || 0), 0);
  } else if (orden?.total) {
    subTotalOrden = tieneIgv ? (Number(orden.total) / 1.18) : Number(orden.total);
  }

  const igvOrden = tieneIgv ? subTotalOrden * 0.18 : 0;
  const totalOrden = Number(orden?.total) || (subTotalOrden + igvOrden);

  const porcentajeAdelanto = parsePorcentajeAdelanto(orden?.condicionesPago);
  const aplicaDetraccionEfectiva = resolveEffectiveDetraccion({
    aplicaDetraccion: Boolean(pago.aplicaDetraccion || orden?.aplicaDetraccion),
    porcentajeDetraccion: pago.aplicaDetraccion ? pago.porcentajeDetraccion : orden?.porcentajeDetraccion,
    isServicio: orden ? (orden.tipoOrden === 'Servicio' || String(orden.id || '').startsWith('OS-')) : true,
    proveedorTipoDocumento: proveedor?.tipoDocumento
  });
  const effectivePct = (pago.porcentajeDetraccion && pago.porcentajeDetraccion > 0)
    ? pago.porcentajeDetraccion
    : (orden?.porcentajeDetraccion || 12);
  const adelantoOrden = Number((totalOrden * porcentajeAdelanto).toFixed(2));
  const saldoOrden = Number((totalOrden - adelantoOrden).toFixed(2));

  // Banco
  let cuenta = orden?.cuentaBancariaId 
    ? proveedor?.cuentas?.find((c: any) => c.id === orden.cuentaBancariaId) 
    : null;
  if (!cuenta && proveedor?.cuentas && proveedor.cuentas.length > 0) {
    cuenta = proveedor.cuentas[0];
  }

  const rawHeader = config?.pagoHeaderHtml ?? config?.headerHtml ?? '';
  const displayTitulo = (pago.concepto || orden?.titulo || (orden?.items ? generateItemsTitle(orden.items) : '') || '').trim();

  const templateVars = {
    tituloDocumento: 'PAGO A PROVEEDOR',
    numeroDocumento: pago.id,
    fechaDocumento: pago.fechaRegistro || '-',
    titulo: displayTitulo,
    proveedorNombre: proveedor?.razonSocial || 'Proveedor',
    proveedorRuc: proveedor?.ruc || '-',
    clienteNombre: cliente?.empresa || '-',
    proyectoNombre: proyecto?.nombre || '-',
    condicionesPago: orden?.condicionesPago || '-',
    total: formatMoney(pago.monto),
    moneda: 'PEN',
    comentarios: (pago.comentarios || pago.notas || '').trim() || '-',
    notas: (pago.notas || pago.comentarios || '').trim() || '-'
  };

  const finalHeader = replaceDocumentVariables(rawHeader, templateVars);
  const rawFooter = config?.pagoFooterHtml ?? config?.footerHtml ?? '';
  const finalFooter = replaceDocumentVariables(rawFooter, templateVars);

  return (
    <div style={{ background: 'white', minHeight: '100vh', padding: '40px', fontFamily: 'Arial, sans-serif', color: '#333' }}>
      {/* Header */}
      {finalHeader && <div dangerouslySetInnerHTML={{ __html: finalHeader }} />}

      {/* Banner de Concepto / Título del Pago */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: '5px solid #7c3aed', padding: '12px 18px', borderRadius: '6px', marginBottom: '22px' }}>
        <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700, display: 'block', marginBottom: '3px' }}>
          Concepto / Refiere a:
        </span>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>
          {displayTitulo || 'Pago a proveedor'}
        </span>
      </div>

      {/* Info Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Proveedor</h4>
          <p style={{ margin: '4px 0', fontWeight: 'bold' }}>{proveedor?.razonSocial || '-'}</p>
          <p style={{ margin: '4px 0', fontSize: '13px', color: '#4b5563' }}>RUC: {proveedor?.ruc || '-'}</p>
          <p style={{ margin: '4px 0', fontSize: '13px', color: '#4b5563' }}>{proveedor?.correo || proveedor?.email || ''}</p>
          {proveedor?.telefono && <p style={{ margin: '4px 0', fontSize: '13px', color: '#4b5563' }}>Teléfono: {proveedor.telefono}</p>}
          <p style={{ margin: '4px 0', fontSize: '13px', color: '#4b5563' }}>Comprobante: {proveedor?.tipoDocumento || (tieneIgv ? 'Factura' : 'Recibo por Honorarios')}</p>
        </div>
        <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Cliente / Proyecto</h4>
          <p style={{ margin: '4px 0', fontWeight: 'bold' }}>{cliente?.empresa || '-'}</p>
          <p style={{ margin: '4px 0', fontSize: '13px', color: '#4b5563' }}>Proyecto: {proyecto?.nombre || '-'}</p>
          <p style={{ margin: '4px 0', fontSize: '13px', color: '#7c3aed', fontWeight: 600 }}>
            Refiere a: {displayTitulo || 'Servicios / Compras generales'}
          </p>
          <p style={{ margin: '4px 0', fontSize: '13px', color: '#4b5563' }}>
            Orden Ref.: <strong>{orden?.id || pago.ordenId || '-'}</strong> ({orden?.tipoOrden === 'Servicio' ? 'Orden de Servicio' : 'Orden de Compra'})
          </p>
          {pago.numeroComprobante && (
            <p style={{ margin: '4px 0', fontSize: '13px', color: '#4b5563' }}>
              N° Comprobante: <strong>{pago.numeroComprobante}</strong>
            </p>
          )}
        </div>
      </div>

      {/* Información Bancaria */}
      <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 10px', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Información Bancaria para Depósito</h4>
        {(() => {
          const cuentaBN = proveedor?.cuentas?.find((c: any) =>
            (c.tipoCuenta || '').toLowerCase().includes('detracc') ||
            (c.banco || '').toLowerCase().includes('nacion') ||
            (c.banco || '').toLowerCase().includes('nación')
          );
          return (
            <div>
              {cuenta ? (
                <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', fontSize: '13px' }}>
                  <p style={{ margin: '2px 0' }}><strong>Banco Comercial:</strong> {cuenta.banco} {cuenta.tipoCuenta ? `(${cuenta.tipoCuenta})` : ''}</p>
                  <p style={{ margin: '2px 0' }}><strong>Número de Cuenta:</strong> {cuenta.numeroCuenta}</p>
                  {cuenta.cci && <p style={{ margin: '2px 0' }}><strong>CCI:</strong> {cuenta.cci}</p>}
                </div>
              ) : pago.cuentaBancaria ? (
                <p style={{ margin: '2px 0', fontSize: '13px' }}><strong>Cuenta Comercial:</strong> {pago.cuentaBancaria}</p>
              ) : (
                <p style={{ margin: '2px 0', fontSize: '13px', color: '#6b7280' }}>Sin cuenta bancaria registrada</p>
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
      {orden && (
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #7c3aed', paddingBottom: '6px', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, color: '#7c3aed', textTransform: 'uppercase', fontSize: '13px', fontWeight: 'bold' }}>
              DETALLE DE LA {orden.tipoOrden === 'Servicio' ? 'ORDEN DE SERVICIO (OS)' : 'ORDEN DE COMPRA (OC)'} N° {orden.id}
            </h4>
            <span style={{ fontSize: '12px', color: '#666' }}>
              Fecha Emisión: {orden.fechaEmision || '-'}
            </span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #ccc' }}>
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
                    Orden por concepto global ({orden.tipoOrden || 'Compra'} N° {orden.id})
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
                  TOTAL DE LA {orden.tipoOrden === 'Servicio' ? 'OS' : 'OC'} (CON IGV):
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px', color: '#7c3aed' }}>
                  {formatMoney(totalOrden)}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Condiciones de Pago de la Orden */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '8px 14px', borderRadius: '6px', fontSize: '12px', border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '8px' }}>
            <div><strong>Condiciones de Pago:</strong> {orden.condicionesPago || 'No especificadas'}</div>
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
        {(pago.concepto || orden?.titulo) && (
          <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>
              Concepto del Pago:
            </span>
            <span style={{ fontWeight: 700, color: '#7c3aed', fontSize: '13.5px' }}>
              {pago.concepto || orden?.titulo}
            </span>
          </div>
        )}
      </div>

      {/* Sección de Comentarios / Notas del Pago */}
      {(pago.comentarios || pago.notas) && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: '5px solid #7c3aed', borderRadius: '8px', padding: '16px 20px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>
              Notas / Observaciones del Pago:
            </span>
          </div>
          <div style={{ fontSize: '13px', color: '#1e293b', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
            {pago.comentarios || pago.notas}
          </div>
        </div>
      )}

      {/* Footer */}
      {finalFooter && <div dangerouslySetInnerHTML={{ __html: finalFooter }} />}
    </div>
  );
};

