import React, { useEffect, useState, useCallback } from 'react';
import type { Quote } from '../types/quote';
import { API_URL } from '../utils/apiUrl';
import { buildQuoteClientUrl } from '../utils/clientLinks';

interface PrintCotizacionViewProps {
  quoteId: string;
}

export const PrintCotizacionView: React.FC<PrintCotizacionViewProps> = ({ quoteId }) => {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [availableVersions, setAvailableVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientes, setClientes] = useState<any[]>([]);
  const [proyectos, setProyectos] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);

  const fetchQuote = useCallback(async (targetId = quoteId, silent = false) => {
    if (!silent) setLoading(true);
    try {
      // 1. Cargar diccionarios si aún no están cargados
      try {
        const [cRes, pRes] = await Promise.all([
          fetch(`${API_URL}/clientes`),
          fetch(`${API_URL}/proyectos`)
        ]);
        if (cRes.ok) setClientes(await cRes.json());
        if (pRes.ok) setProyectos(await pRes.json());
      } catch (err) {
        console.error("Failed to load dictionaries", err);
      }

      // 2. Usar localStorage para renderizado inicial rápido solo como previsualización inmediata
      if (!silent) {
        const localData = localStorage.getItem('printQuoteData');
        if (localData) {
          try {
            const parsed = JSON.parse(localData);
            if (parsed.id === targetId) {
              setQuote(parsed);
              setLoading(false);
            }
          } catch (e) { }
        }
      }

      // 3. Obtener cotización individual y resolver versión más reciente desde el backend
      const urlParams = new URLSearchParams(window.location.search);
      const forcedVersion = urlParams.get('v') || urlParams.get('version');
      const versionQuery = forcedVersion ? `&version=${forcedVersion}` : '';

      let foundQuote: any = null;
      let versionsList: any[] = [];

      try {
        const singleRes = await fetch(`${API_URL}/quotes/${targetId}?latest=true${versionQuery}&_t=${Date.now()}`, {
          cache: 'no-store'
        });
        if (singleRes.ok) {
          const singleData = await singleRes.json();
          if (singleData && singleData.id) {
            foundQuote = singleData;
            if (Array.isArray(singleData.availableVersions)) {
              versionsList = singleData.availableVersions;
            }
          }
        }
      } catch (e) {
        console.warn('Error fetching single quote, falling back to full list', e);
      }

      // Fallback a lista completa de cotizaciones si el endpoint individual no respondió
      if (!foundQuote) {
        const res = await fetch(`${API_URL}/quotes?_t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Error al cargar cotizaciones');
        const data = await res.json();

        if (Array.isArray(data)) {
          const initialTarget = data.find((q: any) => q.id === targetId || q.projectId === targetId);
          if (initialTarget) {
            const siblingQuotes = data.filter((q: any) => {
              if (q.isTemplate) return false;
              if (initialTarget.projectId && q.projectId) {
                return q.projectId === initialTarget.projectId;
              }
              return q.client === initialTarget.client && q.requirement === initialTarget.requirement;
            });

            siblingQuotes.sort((a: any, b: any) => (Number(b.version) || 1) - (Number(a.version) || 1));
            versionsList = siblingQuotes.map((q: any) => ({
              id: q.id,
              version: q.version,
              date: q.date,
              status: q.status,
              requirement: q.requirement
            }));

            if (forcedVersion) {
              const exact = siblingQuotes.find((q: any) => String(q.version) === forcedVersion);
              foundQuote = exact || initialTarget;
            } else {
              foundQuote = siblingQuotes.length > 0 ? siblingQuotes[0] : initialTarget;
            }
          }
        }
      }

      if (foundQuote) {
        // Formatear categorías e ítems (detalles JSON)
        const parsedQuote = {
          ...foundQuote,
          categories: foundQuote.categories?.map((c: any) => ({
            ...c,
            items: c.items?.map((i: any) => {
              let parsedDetails = i.details;
              try {
                if (typeof i.details === 'string') parsedDetails = JSON.parse(i.details);
              } catch (e) { }
              return { ...i, details: parsedDetails || [] };
            }) || []
          })) || []
        };

        setQuote(parsedQuote);
        setAvailableVersions(versionsList);
        setError(null);
      } else {
        setError('Cotización no encontrada');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    fetchQuote();

    // Auto-actualizar silenciosamente al volver a enfocar la ventana para ver cambios al instante
    const handleFocus = () => fetchQuote(quoteId, true);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchQuote, quoteId]);

  const getClientName = useCallback((id: string) => {
    if (!id) return '';
    const c = clientes.find((c: any) => c.id === id);
    return c ? c.empresa : id;
  }, [clientes]);

  const getProjectName = useCallback((id: string) => {
    if (!id) return '';
    const p = proyectos.find((p: any) => p.id === id);
    return p ? p.nombre : id;
  }, [proyectos]);

  // Sincronizar título de página y URL amigable con cliente, proyecto y versión
  useEffect(() => {
    if (quote) {
      const cName = getClientName(quote.client) || quote.client || 'Cliente';
      const pName = getProjectName(quote.projectId || '') || quote.requirement || 'Proyecto';
      const v = quote.version || 1;
      document.title = `Cotización | ${cName} - ${pName} (V${v}) - PURPLE`;

      try {
        const fullUrl = buildQuoteClientUrl(quote.id, cName, pName, v);
        window.history.replaceState(null, '', fullUrl);
      } catch (e) {}
    }
  }, [quote, getClientName, getProjectName]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando cotización para cliente...</div>;
  if (error) return <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>Error: {error}</div>;
  if (!quote) return null;

  const calculateTotals = () => {
    let subTotalClient = 0;
    const categories = quote.categories || [];
    categories.forEach(cat => {
      const items = cat.items || [];
      items.forEach(item => {
        const totalProvider = item.subItems?.reduce((acc, sub) => acc + ((sub.unitCost || 0) * (sub.quantity || 0) * (sub.dates || 0)), 0) || 0;
        const internalMultiplierAmount = totalProvider * ((item.internalMultiplierPercent || 0) / 100);
        const financialExpense = totalProvider * ((item.financialExpensePercent || 0) / 100);

        const rawCalculatedClientCost = totalProvider + internalMultiplierAmount + financialExpense;
        const totalClient = Math.round(rawCalculatedClientCost);

        subTotalClient += totalClient;
      });
    });

    const feeAgencia = subTotalClient * 0.12; // 12% fee
    const finalTotalClient = subTotalClient + feeAgencia;

    return { subTotalClient, feeAgencia, finalTotalClient };
  };

  const totals = calculateTotals();
  const cur = quote.currency === 'USD' ? '$' : 'S/';
  const igvAmount = totals.finalTotalClient * 0.18;
  const totalWithIgv = totals.finalTotalClient * 1.18;

  // Calcular Validez (15 días desde la fecha)
  const validezDate = new Date();
  validezDate.setDate(validezDate.getDate() + 15);
  const validezString = validezDate.toLocaleDateString('es-PE');

  return (
    <div className="print-container" style={{ backgroundColor: '#555', minHeight: '100vh', padding: '40px 20px', display: 'flex', justifyContent: 'center' }}>
      <style>{`
        @media print {
          thead {
            display: table-row-group;
          }
          .print-page {
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
            zoom: 0.65; /* Chrome/Safari/Edge shortcut for scaling */
          }
          /* For Firefox which doesn't support zoom, scale it */
          @-moz-document url-prefix() {
            .print-page {
               transform: scale(0.65);
               transform-origin: top left;
            }
          }
        }
      `}</style>
      <div className="print-page document-page" style={{ maxWidth: '1200px', width: '100%', backgroundColor: 'white', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', overflow: 'hidden' }}>

        <div style={{ backgroundColor: '#662D91', padding: '20px 40px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Logo de PURPLE */}
            <div style={{ width: '160px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="https://brandgeeks.pe/wp-content/uploads/2026/06/PurpleNEW-02.png" alt="Purple Logo" style={{ maxWidth: '100%', maxHeight: '150%', objectFit: 'contain' }} />
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 'var(--text-sm)', lineHeight: '1.4' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>PURPLE BTL S.A.C.</div>
            <div>RUC: 20603757417</div>
            <div>www.purplebtl.com</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '4px 12px', marginTop: '12px', textAlign: 'left', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '8px' }}>
              <div style={{ fontWeight: 'bold' }}>FECHA:</div>
              <div>{quote.date}</div>
              <div style={{ fontWeight: 'bold' }}>VALIDEZ HASTA:</div>
              <div>{validezString}</div>
              <div style={{ fontWeight: 'bold' }}>VERSIÓN:</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 'bold' }}>V{quote.version}</span>
                {availableVersions.length > 1 && (
                  <select
                    className="no-print"
                    value={quote.id}
                    onChange={(e) => fetchQuote(e.target.value)}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      color: 'white',
                      border: '1px solid rgba(255, 255, 255, 0.4)',
                      borderRadius: '4px',
                      padding: '1px 6px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      outline: 'none'
                    }}
                    title="Ver otra versión de esta cotización"
                  >
                    {availableVersions.map((v: any) => (
                      <option key={v.id} value={v.id} style={{ color: '#333' }}>
                        V{v.version} {v.version === Math.max(...availableVersions.map((x: any) => x.version)) ? '(Más reciente)' : ''} - {v.date}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bloque de Cliente */}
        <div style={{ padding: '24px 40px', display: 'grid', gridTemplateColumns: '150px 1fr', gap: '12px', fontSize: 'var(--text-sm)', fontWeight: 'bold' }}>
          <div style={{ color: '#662D91' }}>* CLIENTE:</div>
          <div>{getClientName(quote.client) || '-'}</div>
          <div style={{ color: '#662D91' }}>* MARCA:</div>
          <div>{quote.brand || getClientName(quote.client) || '-'}</div>
          <div style={{ color: '#662D91' }}>* REQUERIMIENTO:</div>
          <div>{getProjectName(quote.projectId || '') || quote.requirement || '-'}</div>
        </div>

        {/* Tabla de Ítems */}
        <div style={{ padding: '0 40px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: '#662D91', color: 'white' }}>
                <th style={{ padding: '16px 12px', textAlign: 'left', border: '1px solid #4c1d6b' }}>CATEGORÍA</th>
                <th style={{ padding: '16px 12px', textAlign: 'center', border: '1px solid #4c1d6b', width: '80px' }}>CANTIDAD</th>
                <th style={{ padding: '16px 12px', textAlign: 'center', border: '1px solid #4c1d6b', width: '80px' }}>FECHAS</th>
                <th style={{ padding: '16px 12px', textAlign: 'left', border: '1px solid #4c1d6b' }}>DETALLE DE LA COTIZACIÓN</th>
                <th style={{ padding: '16px 12px', textAlign: 'right', border: '1px solid #4c1d6b', width: '120px', whiteSpace: 'nowrap' }}>COSTO X ITEM<br />CLIENTE</th>
                <th style={{ padding: '16px 12px', textAlign: 'right', border: '1px solid #4c1d6b', width: '120px', whiteSpace: 'nowrap' }}>COSTO TOTAL<br />CLIENTE</th>
              </tr>
            </thead>
            <tbody>
              {(quote.categories || []).map((cat) => (
                <React.Fragment key={cat.id}>
                  <tr style={{ backgroundColor: 'rgba(102, 45, 145, 0.1)' }}>
                    <td colSpan={6} style={{ padding: '8px 12px', fontWeight: 'bold', color: '#662D91', border: '1px solid #ddd', fontSize: '14px' }}>
                      {cat.name}
                    </td>
                  </tr>
                  {(cat.items || []).map((item) => {
                    const totalProvider = item.subItems?.reduce((acc, sub) => acc + ((sub.unitCost || 0) * (sub.quantity || 0) * (sub.dates || 0)), 0) || 0;
                    const internalMultiplierAmount = totalProvider * ((item.internalMultiplierPercent || 0) / 100);
                    const financialExpense = totalProvider * ((item.financialExpensePercent || 0) / 100);
                    const rawCalculatedClientCost = totalProvider + internalMultiplierAmount + financialExpense;
                    const itemTotalClient = Math.round(rawCalculatedClientCost);
                    const qtyDates = ((item.quantity || 1) * (item.dates || 1)) || 1;
                    const clientUnitCost = itemTotalClient / qtyDates;

                    return (
                      <tr key={item.id}>
                        <td style={{ padding: '8px 12px', border: '1px solid #ddd', fontWeight: 'bold', fontSize: '14px' }}>{item.name}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', border: '1px solid #ddd', fontSize: '14px' }}>{item.quantity}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', border: '1px solid #ddd', fontSize: '14px' }}>{item.dates}</td>
                        <td style={{ padding: '12px', border: '1px solid #ddd' }}>
                          <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                            {(item.details || []).join('\n')}
                          </div>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', border: '1px solid #ddd', fontSize: '14px' }}>
                          {cur} {clientUnitCost.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', border: '1px solid #ddd', fontWeight: 'bold', fontSize: '14px' }}>
                          {cur} {itemTotalClient.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}

              {/* Totales */}
              <tr style={{ backgroundColor: '#662D91', color: 'white', fontWeight: 'bold' }}>
                <td colSpan={5} style={{ padding: '12px 24px', textAlign: 'right', border: '1px solid #4c1d6b', fontSize: '14px' }}>Sub Total (Sin IGV)</td>
                <td style={{ padding: '12px', textAlign: 'right', border: '1px solid #4c1d6b', fontSize: '14px' }}>
                  {cur} {totals.subTotalClient.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
              <tr style={{ backgroundColor: '#662D91', color: 'white', fontWeight: 'bold' }}>
                <td colSpan={5} style={{ padding: '12px 24px', textAlign: 'right', border: '1px solid #4c1d6b', borderTop: '1px solid rgba(255,255,255,0.2)', fontSize: '14px' }}>Fee de Agencia (12%) - Monto Tarifado</td>
                <td style={{ padding: '12px', textAlign: 'right', border: '1px solid #4c1d6b', borderTop: '1px solid rgba(255,255,255,0.2)', fontSize: '14px' }}>
                  {cur} {totals.feeAgencia.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
              <tr style={{ backgroundColor: 'black', color: 'white', fontWeight: 'bold' }}>
                <td colSpan={5} style={{ padding: '12px 24px', textAlign: 'right', border: '1px solid black', fontSize: '14px' }}>Total (Sin IGV)</td>
                <td style={{ padding: '12px', textAlign: 'right', border: '1px solid black', fontSize: '14px' }}>
                  {cur} {totals.finalTotalClient.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
              {quote.includeIgv && (
                <>
                  <tr style={{ backgroundColor: '#4a154b', color: 'white', fontWeight: 'bold' }}>
                    <td colSpan={5} style={{ padding: '12px 24px', textAlign: 'right', border: '1px solid #4c1d6b', fontSize: '14px' }}>IGV (18%)</td>
                    <td style={{ padding: '12px', textAlign: 'right', border: '1px solid #4c1d6b', fontSize: '14px' }}>
                      {cur} {igvAmount.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                  <tr style={{ backgroundColor: '#662D91', color: 'white', fontWeight: 'bold' }}>
                    <td colSpan={5} style={{ padding: '12px 24px', textAlign: 'right', border: '1px solid #4c1d6b', fontSize: '15px' }}>TOTAL CON IGV</td>
                    <td style={{ padding: '12px', textAlign: 'right', border: '1px solid #4c1d6b', fontSize: '15px' }}>
                      {cur} {totalWithIgv.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </>
              )}
              {quote.currency === 'USD' && (
                <tr style={{ backgroundColor: '#f5f3ff', color: '#662D91', fontWeight: 'bold' }}>
                  <td colSpan={5} style={{ padding: '10px 24px', textAlign: 'right', border: '1px solid #ddd', fontSize: '13px' }}>
                    Equivalente Subtotal Proyecto al cambio (T.C. {Number(quote.exchangeRate || 3.75).toFixed(3)}):
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', border: '1px solid #ddd', fontSize: '13px', color: '#662D91' }}>
                    S/ {(totals.finalTotalClient * Number(quote.exchangeRate || 3.75)).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Condiciones de Venta */}
        <div style={{ padding: '40px', fontSize: 'var(--text-xs)', lineHeight: '1.6', marginTop: '20px' }}>
          <div style={{ fontWeight: 'bold', textDecoration: 'underline', marginBottom: '8px' }}>CONDICIONES DE VENTA:</div>
          <ol style={{ margin: 0, paddingLeft: '16px' }}>
            <li>{quote.includeIgv ? 'Los Precios incluyen IGV (18%).' : 'Los Precios no incluyen IGV.'}</li>
            <li>Tipo de Moneda: {quote.currency === 'USD' ? `Dólares Americanos (USD)${quote.exchangeRate ? ` - T.C. Referencial: S/ ${Number(quote.exchangeRate).toFixed(3)}` : ''}` : 'Soles (PEN)'}.</li>
            <li>Condiciones de pago: {quote.paymentConditions || '30 días de crédito.'}</li>
            <li>Comprobante de pago: Factura.</li>
            <li>Cualquier variación en las cantidades y/o características de esta proforma, alterará el costo total de una nueva proforma.</li>
          </ol>
        </div>
      </div>

      {/* Floating Action Buttons that will be hidden during print */}
      <div className="no-print" style={{ position: 'fixed', bottom: '24px', right: '24px', display: 'flex', alignItems: 'center', gap: '10px', zIndex: 9999 }}>
        <div style={{ backgroundColor: 'rgba(30, 41, 59, 0.92)', backdropFilter: 'blur(8px)', color: '#10b981', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid rgba(16, 185, 129, 0.3)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }}></span>
          {getClientName(quote.client) || quote.client ? `${getClientName(quote.client) || quote.client} · ` : ''}
          {getProjectName(quote.projectId || '') || quote.requirement || 'Cotización'} (V{quote.version})
        </div>
        <button
          onClick={() => {
            const cName = getClientName(quote.client) || quote.client || '';
            const pName = getProjectName(quote.projectId || '') || quote.requirement || '';
            const fullUrl = buildQuoteClientUrl(quote.id, cName, pName, quote.version);
            navigator.clipboard.writeText(fullUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          style={{ backgroundColor: '#4b5563', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
          title="Copiar enlace permanente (con Cliente, Proyecto y Versión)"
        >
          {copied ? '✅ ¡Copiado!' : '🔗 Copiar Link'}
        </button>
        <button
          onClick={() => fetchQuote(quote.id)}
          style={{ backgroundColor: '#374151', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
          title="Recargar última información desde el servidor"
        >
          🔄 Actualizar
        </button>
        <button
          onClick={() => window.print()}
          style={{ backgroundColor: '#662D91', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
        >
          🖨️ Imprimir / PDF
        </button>
      </div>
    </div>
  );
};
