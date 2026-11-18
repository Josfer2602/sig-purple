import React, { useState, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { 
  X, Upload, FileSpreadsheet, Download, CheckCircle2, AlertTriangle, 
  Trash2, Building2, Briefcase, Sparkles, ArrowRight, Loader2, Info
} from 'lucide-react';
import { useGlobalContext } from '../context/GlobalContext';
import { downloadGastosTemplate, parseGastosExcel, type ParsedGastoItem, type ParseGastosResult } from '../utils/gastosExcelHelper';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialProyectoId?: string;
}

export const ImportGastosProduccionModal: React.FC<Props> = ({ isOpen, onClose, initialProyectoId }) => {
  const { proyectos, clientes, quotes, addBatchGastosProduccion } = useGlobalContext();

  const [selectedProyectoId, setSelectedProyectoId] = useState<string>(initialProyectoId || '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [parseResult, setParseResult] = useState<ParseGastosResult | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedGastoItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Proyecto y Cliente seleccionados
  const selectedProyecto = useMemo(() => {
    return proyectos.find(p => p.id === selectedProyectoId);
  }, [proyectos, selectedProyectoId]);

  const selectedCliente = useMemo(() => {
    if (!selectedProyecto) return null;
    return clientes.find(c => c.id === selectedProyecto.clienteId);
  }, [clientes, selectedProyecto]);

  const activeQuote = useMemo(() => {
    if (!selectedProyectoId) return null;
    const projectQuotes = quotes.filter(q => q.projectId === selectedProyectoId);
    return projectQuotes.find(q => (q.status || '').toLowerCase().includes('aprob')) || projectQuotes[0] || null;
  }, [quotes, selectedProyectoId]);

  // Manejo de reseteo al cerrar
  const handleClose = () => {
    setSelectedFile(null);
    setParseResult(null);
    setParsedItems([]);
    setIsParsing(false);
    setIsSubmitting(false);
    onClose();
  };

  // Descargar plantilla para el proyecto elegido
  const handleDownloadTemplate = () => {
    downloadGastosTemplate(
      selectedProyecto?.nombre,
      selectedCliente?.empresa
    );
    toast.success('Plantilla Excel descargada. Llénala y súbela aquí.');
  };

  // Procesar archivo seleccionado
  const handleFileProcess = async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error('Por favor sube un archivo Excel válido (.xlsx o .xls)');
      return;
    }

    setSelectedFile(file);
    setIsParsing(true);
    try {
      const result = await parseGastosExcel(file);
      setParseResult(result);
      setParsedItems(result.items);
      toast.success(`Se leyeron ${result.items.length} gastos del Excel exitosamente.`);
    } catch (err: any) {
      console.error('Error al procesar Excel:', err);
      toast.error(err.message || 'Error al leer el archivo Excel.');
      setParseResult(null);
      setParsedItems([]);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileProcess(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  // Eliminar una fila leída de la vista previa si no se desea importar
  const handleRemoveItem = (id: string) => {
    setParsedItems(prev => prev.filter(it => it.id !== id));
  };

  // Totales recalculados en vivo según las filas visibles
  const summaryTotals = useMemo(() => {
    const validItems = parsedItems.filter(it => it.isValid);
    const facturas = validItems.filter(it => it.esFactura);
    const noFacturas = validItems.filter(it => !it.esFactura);

    const totalBase = validItems.reduce((acc, it) => acc + it.costoBase, 0);
    const totalIgv = validItems.reduce((acc, it) => acc + it.montoIgv, 0);
    const totalGeneral = validItems.reduce((acc, it) => acc + it.total, 0);

    const totalFacturas = facturas.reduce((acc, it) => acc + it.total, 0);
    const totalNoFacturas = noFacturas.reduce((acc, it) => acc + it.total, 0);

    return {
      totalCount: validItems.length,
      invalidCount: parsedItems.length - validItems.length,
      facturasCount: facturas.length,
      noFacturasCount: noFacturas.length,
      totalBase: Number(totalBase.toFixed(2)),
      totalIgv: Number(totalIgv.toFixed(2)),
      totalGeneral: Number(totalGeneral.toFixed(2)),
      totalFacturas: Number(totalFacturas.toFixed(2)),
      totalNoFacturas: Number(totalNoFacturas.toFixed(2))
    };
  }, [parsedItems]);

  // Importación final a la base de datos
  const handleConfirmImport = async () => {
    if (!selectedProyectoId) {
      toast.error('Debes seleccionar el proyecto al cual se asociarán estos gastos.');
      return;
    }

    const validItems = parsedItems.filter(it => it.isValid);
    if (validItems.length === 0) {
      toast.error('No hay gastos válidos para importar.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = validItems.map(it => ({
        clienteId: selectedProyecto?.clienteId,
        proyectoId: selectedProyectoId,
        quoteId: activeQuote?.id || '',
        tipoComprobante: it.tipoComprobante,
        numeroComprobante: it.numeroComprobante,
        fechaEmision: it.fechaEmision,
        montoBase: it.costoBase,
        montoIgv: it.montoIgv,
        total: it.total,
        areaResponsable: it.areaResponsable,
        concepto: it.concepto,
        esGastoAdicional: it.esGastoAdicional,
        motivoAdicional: it.motivoAdicional,
        estadoGasto: 'Pendiente',
        items: [{
          quoteSubItemId: 'gasto-excel-import',
          name: it.concepto,
          costPercentage: 100,
          monto: it.total
        }]
      }));

      await addBatchGastosProduccion(payload);
      toast.success(`🎉 ¡Se importaron exitosamente ${payload.length} gastos de producción por S/ ${summaryTotals.totalGeneral.toFixed(2)}!`);
      handleClose();
    } catch (err: any) {
      console.error('Error al importar gastos:', err);
      toast.error('Error al importar gastos: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatMoney = (val: number) =>
    'S/ ' + (val || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div 
      className="modal-overlay" 
      style={{ 
        zIndex: 1300, 
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div 
        className="modal-content" 
        style={{ 
          maxWidth: '1200px', 
          width: '96vw', 
          maxHeight: '92vh', 
          display: 'flex', 
          flexDirection: 'column', 
          overflow: 'hidden',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          background: '#ffffff',
          border: '1px solid #cbd5e1'
        }}
      >
        {/* HEADER */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafafa', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff' }}>
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h2 className="modal-title" style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Importación de Gastos de Producción desde Excel
                <span style={{ fontSize: '11px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                  Regla Automática de IGV (18%)
                </span>
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                Llena tus gastos en Excel con el costo base. Si es <strong>Factura</strong> se suma el IGV (18%), si no, se mantiene sin IGV.
              </p>
            </div>
          </div>
          <button className="btn-icon" onClick={handleClose}><X size={20} /></button>
        </div>

        {/* BODY */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* PASO 1: SELECCIÓN DEL PROYECTO & DESCARGA DE PLANTILLA */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', alignItems: 'center' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                <Briefcase size={15} color="#7c3aed" /> Proyecto Destino al que se asociarán los gastos *
              </label>
              <select
                className="form-control"
                value={selectedProyectoId}
                onChange={e => setSelectedProyectoId(e.target.value)}
                style={{ fontSize: '13px', padding: '9px 12px', fontWeight: 500 }}
                required
              >
                <option value="">-- Seleccionar Proyecto --</option>
                {proyectos.map(p => {
                  const cli = clientes.find(c => c.id === p.clienteId);
                  return (
                    <option key={p.id} value={p.id}>
                      {cli?.empresa ? `${cli.empresa} → ` : ''}{p.nombre} ({p.id})
                    </option>
                  );
                })}
              </select>

              {selectedProyecto && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#059669', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={14} />
                  <span>
                    Cliente: <strong>{selectedCliente?.empresa || 'Cliente'}</strong> | Cotización: <strong>{activeQuote ? `V${activeQuote.version}` : 'General'}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* BOTÓN DESCARGA PLANTILLA */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderLeft: '1px solid #e2e8f0', paddingLeft: '20px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                ¿No tienes la plantilla oficial?
              </span>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleDownloadTemplate}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '9px 14px',
                  background: '#ffffff',
                  border: '1.5px solid #10b981',
                  color: '#065f46',
                  fontWeight: 600,
                  fontSize: '12.5px',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                <Download size={16} /> Descargar Plantilla Excel (.xlsx)
              </button>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                Incluye fórmulas automáticas de IGV y ejemplos con Factura, Boleta y Vale.
              </span>
            </div>
          </div>

          {/* BANNER EXPLICATIVO DE LA REGLA DE IGV */}
          <div style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '10px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Info size={18} color="#16a34a" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: '12.5px', color: '#166534', lineHeight: 1.4 }}>
                <strong>Regla de cálculo automático de comprobantes:</strong>
                <br />
                • <strong>Factura:</strong> El sistema añade el <strong>+18% de IGV</strong> sobre el costo base (Total = Costo × 1.18).
                <br />
                • <strong>Boleta, Ticket, Vale / Movilidad o Recibo:</strong> <strong>NO agrega IGV</strong> (Total = Costo).
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ fontSize: '11px', background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '6px', fontWeight: 700, border: '1px solid #86efac' }}>
                Factura: +18%
              </span>
              <span style={{ fontSize: '11px', background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: '6px', fontWeight: 600, border: '1px solid #cbd5e1' }}>
                Boleta/Vale: +0%
              </span>
            </div>
          </div>

          {/* PASO 2: ZONA DE CARGA DEL ARCHIVO EXCEL */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: isDragging ? '2px dashed #10b981' : '2px dashed #cbd5e1',
              borderRadius: '12px',
              padding: '24px',
              textAlign: 'center',
              backgroundColor: isDragging ? '#f0fdf4' : '#fafafa',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
            />
            {isParsing ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <Loader2 size={32} className="animate-spin" color="#10b981" />
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#047857' }}>Leyendo y analizando archivo Excel...</span>
              </div>
            ) : selectedFile ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
                  <FileSpreadsheet size={24} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#1e293b' }}>{selectedFile.name}</div>
                  <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                    {(selectedFile.size / 1024).toFixed(1)} KB • Clic o arrastra para cambiar archivo
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
                  <Upload size={24} />
                </div>
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#334155' }}>
                  Haz clic para seleccionar o arrastra tu archivo Excel (.xlsx / .xls) aquí
                </div>
                <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                  Acepta la plantilla oficial con columnas de Comprobante, Fecha, Concepto y Costo
                </div>
              </>
            )}
          </div>

          {/* PASO 3: RESUMEN DE CÁLCULO KPI */}
          {parsedItems.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '14px' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px' }}>
                <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                  Total Comprobantes
                </span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b', marginTop: '2px' }}>
                  {summaryTotals.totalCount}
                </div>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Costo Base: {formatMoney(summaryTotals.totalBase)}
                </span>
              </div>

              <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '10px', padding: '12px 16px' }}>
                <span style={{ fontSize: '11px', color: '#7c3aed', textTransform: 'uppercase', fontWeight: 700 }}>
                  Facturas (+18% IGV)
                </span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#7c3aed', marginTop: '2px' }}>
                  {summaryTotals.facturasCount}
                </div>
                <span style={{ fontSize: '11px', color: '#6b21a8' }}>
                  IGV Agregado: +{formatMoney(summaryTotals.totalIgv)}
                </span>
              </div>

              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px 16px' }}>
                <span style={{ fontSize: '11px', color: '#1d4ed8', textTransform: 'uppercase', fontWeight: 700 }}>
                  Boletas / Vales (Sin IGV)
                </span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1d4ed8', marginTop: '2px' }}>
                  {summaryTotals.noFacturasCount}
                </div>
                <span style={{ fontSize: '11px', color: '#1e40af' }}>
                  Total: {formatMoney(summaryTotals.totalNoFacturas)}
                </span>
              </div>

              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '12px 16px' }}>
                <span style={{ fontSize: '11px', color: '#065f46', textTransform: 'uppercase', fontWeight: 700 }}>
                  Monto Total a Rendir
                </span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#047857', marginTop: '2px' }}>
                  {formatMoney(summaryTotals.totalGeneral)}
                </div>
                <span style={{ fontSize: '11px', color: '#047857', fontWeight: 600 }}>
                  Base + IGV de Facturas
                </span>
              </div>
            </div>
          )}

          {/* PASO 4: VISTA PREVIA DETALLADA DE FILAS */}
          {parsedItems.length > 0 && (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                  Vista previa de {parsedItems.length} gastos leídos del Excel (Verifica antes de guardar):
                </span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Puedes descartar filas individuales con el botón 🗑️
                </span>
              </div>

              <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', textAlign: 'left', color: '#475569' }}>
                      <th style={{ padding: '8px 10px', width: '40px', textAlign: 'center' }}>#</th>
                      <th style={{ padding: '8px 10px', width: '90px' }}>Fecha</th>
                      <th style={{ padding: '8px 10px', width: '140px' }}>Tipo Comprobante</th>
                      <th style={{ padding: '8px 10px', width: '110px' }}>N° Doc</th>
                      <th style={{ padding: '8px 10px' }}>Concepto / Detalle</th>
                      <th style={{ padding: '8px 10px', width: '110px' }}>Responsable</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', width: '100px' }}>Costo Base</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', width: '90px' }}>IGV (18%)</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', width: '110px' }}>Total Final</th>
                      <th style={{ padding: '8px 10px', width: '40px', textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedItems.map((item, idx) => (
                      <tr 
                        key={item.id} 
                        style={{ 
                          borderBottom: '1px solid #f1f5f9',
                          background: !item.isValid ? '#fef2f2' : (idx % 2 === 0 ? '#ffffff' : '#fafafa')
                        }}
                      >
                        <td style={{ padding: '6px 10px', textAlign: 'center', color: '#94a3b8', fontSize: '11px' }}>
                          {item.filaExcel}
                        </td>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                          {item.fechaEmision}
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          {item.esFactura ? (
                            <span style={{ fontSize: '10.5px', background: '#f3e8ff', color: '#6b21a8', border: '1px solid #d8b4fe', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }} title="Comprobante con +18% IGV añadido">
                              Factura (+18% IGV)
                            </span>
                          ) : (
                            <span style={{ fontSize: '10.5px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }} title="Comprobante sin IGV">
                              {item.tipoComprobante}
                            </span>
                          )}
                          {item.esGastoAdicional && (
                            <span style={{ marginLeft: '4px', fontSize: '9.5px', background: '#fef3c7', color: '#b45309', padding: '1px 4px', borderRadius: '3px', fontWeight: 700 }}>
                              Extra
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '6px 10px', fontWeight: 600, color: '#1e293b' }}>
                          {item.numeroComprobante}
                        </td>
                        <td style={{ padding: '6px 10px', color: '#334155' }}>
                          {item.concepto}
                          {item.motivoAdicional && (
                            <span style={{ display: 'block', fontSize: '10.5px', color: '#b45309', fontStyle: 'italic' }}>
                              Motivo: {item.motivoAdicional}
                            </span>
                          )}
                          {!item.isValid && (
                            <span style={{ display: 'block', fontSize: '10.5px', color: '#dc2626', fontWeight: 600 }}>
                              ⚠️ {item.validationError}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '6px 10px', color: '#64748b' }}>
                          {item.areaResponsable}
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          S/ {item.costoBase.toFixed(2)}
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: item.esFactura ? '#7c3aed' : '#94a3b8', fontWeight: item.esFactura ? 700 : 400 }}>
                          {item.esFactura ? `+S/ ${item.montoIgv.toFixed(2)}` : 'S/ 0.00'}
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>
                          S/ {item.total.toFixed(2)}
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Quitar esta fila"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', background: '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <button type="button" className="btn-secondary" onClick={handleClose}>
            Cancelar
          </button>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {parsedItems.length > 0 && (
              <span style={{ fontSize: '13px', color: '#475569' }}>
                Listo para guardar <strong>{summaryTotals.totalCount} gastos</strong> por <strong style={{ color: '#047857' }}>{formatMoney(summaryTotals.totalGeneral)}</strong>
              </span>
            )}
            <button
              type="button"
              className="btn-primary"
              disabled={isSubmitting || parsedItems.length === 0 || !selectedProyectoId}
              onClick={handleConfirmImport}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 20px',
                background: !selectedProyectoId || parsedItems.length === 0 ? '#94a3b8' : 'linear-gradient(135deg, #10b981, #059669)',
                borderColor: '#10b981',
                cursor: !selectedProyectoId || parsedItems.length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Guardando gastos...
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} /> Importar {summaryTotals.totalCount > 0 ? `${summaryTotals.totalCount} Gastos` : 'Gastos'} a Producción
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

