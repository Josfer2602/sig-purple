import { Printer } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../context/GlobalContext';
import { buildGanttClientUrl } from '../utils/clientLinks';

interface PublicGanttViewProps {
  token: string;
}

type ViewMode = 'day' | 'week' | 'month';

const toDate = (s: string) => { try { return new Date(s + 'T00:00:00'); } catch { return new Date(); } };
const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const diffDays = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);

function buildColumns(start: Date, end: Date, mode: ViewMode): Date[] {
  const cols: Date[] = [];
  const cur = new Date(start); cur.setHours(0,0,0,0);
  const endC = new Date(end); endC.setHours(0,0,0,0);
  if (mode === 'day') {
    while (cur <= endC) { cols.push(new Date(cur)); cur.setDate(cur.getDate()+1); }
  } else if (mode === 'week') {
    while (cur.getDay() !== 1) cur.setDate(cur.getDate()-1);
    while (cur <= endC) { cols.push(new Date(cur)); cur.setDate(cur.getDate()+7); }
  } else {
    while (cur <= endC) {
      cols.push(new Date(cur.getFullYear(), cur.getMonth(), 1));
      cur.setMonth(cur.getMonth()+1);
    }
  }
  return cols;
}

function colLabel(d: Date, mode: ViewMode) {
  if (mode === 'day') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: '1.2' }}>
        <span style={{ fontSize: '0.85rem' }}>{d.getDate().toString().padStart(2, '0')}</span>
        <span style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>{d.toLocaleDateString('es-PE', { month: 'short' })}</span>
      </div>
    );
  }
  if (mode === 'week') return `Sem. ${d.toLocaleDateString('es-PE', { day:'2-digit', month:'short' })}`;
  return d.toLocaleDateString('es-PE', { month:'short', year:'numeric' });
}

function daysToCols(days: number, mode: ViewMode) {
  return mode === 'day' ? days : mode === 'week' ? days / 7 : days / 30;
}

function colWidth(mode: ViewMode) {
  return mode === 'day' ? 44 : mode === 'week' ? 90 : 120;
}

export const PublicGanttView: React.FC<PublicGanttViewProps> = ({ token }) => {
  const [gantt, setGantt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/gantts/shared/${token}`)
      .then(r => {
        if (!r.ok) throw new Error('Enlace inválido o cronograma no encontrado');
        return r.json();
      })
      .then(data => { setGantt(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [token]);

  // Sincronizar título de página y URL con cliente, proyecto y versión
  useEffect(() => {
    if (gantt) {
      const clientName = gantt.proyecto?.cliente?.empresa || gantt.proyecto?.cliente?.contacto || '';
      const projectName = gantt.proyecto?.nombre || 'Proyecto';
      const versionStr = gantt.version ? ` (V${gantt.version})` : '';
      document.title = `Cronograma | ${clientName ? clientName + ' - ' : ''}${projectName}${versionStr} - PURPLE`;

      try {
        const fullUrl = buildGanttClientUrl(token, clientName, projectName, gantt.version);
        window.history.replaceState(null, '', fullUrl);
      } catch (e) {}
    }
  }, [gantt, token]);

  // Auto-fit para exportación a PDF (todos los hooks arriba del componente)
  const applyPrintAutoFit = () => {
    const chartInner = document.querySelector('.public-gantt-chart-inner') as HTMLElement;
    if (chartInner) {
      const leftW = 240;
      const chartW = chartInner.scrollWidth || chartInner.offsetWidth;
      const totalW = leftW + chartW;
      const printableW = 1050; // Ancho útil en hoja A4 horizontal con márgenes de 6-8mm
      if (totalW > printableW) {
        const rawScale = printableW / totalW;
        const scale = Math.max(0.35, Math.min(1, Math.floor(rawScale * 1000) / 1000));
        document.documentElement.style.setProperty('--gantt-print-scale', scale.toString());
      } else {
        document.documentElement.style.setProperty('--gantt-print-scale', '1');
      }
    }
  };

  const handleExportPDF = () => {
    applyPrintAutoFit();
    setTimeout(() => {
      window.print();
    }, 150);
  };

  useEffect(() => {
    const onBeforePrint = () => {
      applyPrintAutoFit();
    };
    const onAfterPrint = () => {
      document.documentElement.style.removeProperty('--gantt-print-scale');
    };
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
    };
  }, []);

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', backgroundColor:'#f8fafc', flexDirection:'column', gap:'16px' }}>
      <div style={{ width:'40px', height:'40px', borderRadius:'50%', border:'3px solid #662D91', borderTopColor:'transparent', animation:'spin 0.8s linear infinite' }}/>
      <p style={{ color:'#662D91', fontWeight:600 }}>Cargando cronograma...</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error || !gantt) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', backgroundColor:'#f8fafc' }}>
      <div style={{ padding:'40px', backgroundColor:'white', borderRadius:'16px', boxShadow:'0 8px 32px rgba(0,0,0,0.1)', textAlign:'center', maxWidth:'420px' }}>
        <div style={{ fontSize:'3rem', marginBottom:'16px' }}>⚠️</div>
        <h2 style={{ color:'#662D91', margin:'0 0 12px 0' }}>Enlace Inválido</h2>
        <p style={{ color:'#64748b', margin:0 }}>{error}</p>
      </div>
    </div>
  );

  const settings = gantt.settings ? JSON.parse(gantt.settings) : {};
  const blockedDays = settings.blockedDays || [];
  let tasks = [...(gantt.tasks || [])];
  let taskOrder: string[] = [];
  if (Array.isArray(settings.taskOrder)) taskOrder = settings.taskOrder;
  tasks.sort((a: any, b: any) => {
    if (taskOrder.length > 0) {
      const iA = taskOrder.indexOf(a.id);
      const iB = taskOrder.indexOf(b.id);
      if (iA !== -1 && iB !== -1) return iA - iB;
      if (iA !== -1) return -1;
      if (iB !== -1) return 1;
    }
    const depA = parseInt(a.dependencies, 10);
    const depB = parseInt(b.dependencies, 10);
    if (!isNaN(depA) && !isNaN(depB)) return depA - depB;
    if (!isNaN(depA)) return -1;
    if (!isNaN(depB)) return 1;
    return 0;
  });
  const today = new Date(); today.setHours(0,0,0,0);
  const allDates = tasks.flatMap((t: any) => [toDate(t.startDate), toDate(t.endDate)]);
  const minDate = allDates.length ? new Date(Math.min(...allDates.map((d: any) => d.getTime()))) : today;
  const maxDate = allDates.length ? new Date(Math.max(...allDates.map((d: any) => d.getTime()))) : addDays(today, 30);
  const viewStart = addDays(minDate, -3);
  const viewEnd = addDays(maxDate, 5);
  const cols = buildColumns(viewStart, viewEnd, viewMode);
  const CW = colWidth(viewMode);
  const ROW_H = 52;
  const LABEL_W = 360;

  const dateToPx = (dateStr: string) => {
    const d = toDate(dateStr);
    const dayDiff = diffDays(viewStart, d);
    return Math.max(0, daysToCols(dayDiff, viewMode) * CW);
  };



  const formatDate = (s: string) => {
    try { return toDate(s).toLocaleDateString('es-PE', { day:'2-digit', month:'short' }); }
    catch { return s; }
  };

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#f8fafc', fontFamily:"'Inter', 'Segoe UI', sans-serif" }}>

      {/* Estilos de impresión y exportación a PDF */}
      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 6mm 8mm 6mm 8mm;
          }
          .no-print,
          button {
            display: none !important;
          }
          html, body, #root {
            background: white !important;
            color: #0f172a !important;
            overflow: visible !important;
            height: auto !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .public-gantt-header {
            padding: 0 0 10px 0 !important;
            margin-bottom: 12px !important;
            border-bottom: 2px solid #662D91 !important;
            background: transparent !important;
          }
          .public-gantt-header-inner {
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .public-gantt-print-meta {
            display: flex !important;
            flex-direction: column !important;
            align-items: flex-end !important;
            gap: 2px !important;
          }

          .public-gantt-outer {
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }

          /* El card escala con zoom proporcional para que quepa 100% en la hoja sin cortarse */
          .public-gantt-card {
            border-radius: 8px !important;
            box-shadow: none !important;
            border: 1px solid #cbd5e1 !important;
            overflow: visible !important;
            width: max-content !important;
            max-width: none !important;
            zoom: var(--gantt-print-scale, 0.7) !important;
          }

          .public-gantt-left-pane {
            width: 240px !important;
            flex-shrink: 0 !important;
            border-right: 1.5px solid #cbd5e1 !important;
            overflow: visible !important;
          }

          .public-gantt-chart-pane {
            overflow: visible !important;
            flex: 1 !important;
          }

          .public-gantt-chart-inner {
            overflow: visible !important;
          }

          .public-gantt-bar {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            box-shadow: none !important;
            border: 1px solid rgba(0,0,0,0.12) !important;
          }

          .public-gantt-footer {
            margin-top: 10px !important;
            padding-top: 6px !important;
            border-top: 1px solid #e2e8f0 !important;
            font-size: 9px !important;
            color: #64748b !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
          }
        }

        @media screen {
          .public-gantt-print-meta {
            display: none !important;
          }
        }
      `}</style>

      {/* Header */}
      <div className="public-gantt-header" style={{ backgroundColor:'white', borderBottom:'1px solid #e2e8f0', padding:'20px 32px' }}>
        <div className="public-gantt-header-inner" style={{ maxWidth:'1400px', margin:'0 auto', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          {/* Logo */}
          <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
            <img
              src="https://brandgeeks.pe/wp-content/uploads/2026/06/PurpleNEW-01-1-1.png"
              alt="Purple"
              style={{ height:'52px', objectFit:'contain' }}
            />
            <div style={{ borderLeft:'2px solid #e2e8f0', paddingLeft:'16px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'0.72rem', fontWeight:700, letterSpacing:'0.08em', color:'#662D91', textTransform:'uppercase', marginBottom:'4px' }}>
                {gantt.proyecto?.cliente?.empresa ? (
                  <>
                    <span>CLIENTE: {gantt.proyecto.cliente.empresa}</span>
                    <span>•</span>
                  </>
                ) : null}
                <span>CRONOGRAMA DE PROYECTO</span>
              </div>
              <h1 style={{ margin:0, fontSize:'1.4rem', fontWeight:800, color:'#1e293b' }}>
                {gantt.proyecto?.nombre || 'Proyecto'}
              </h1>
              <div style={{ fontSize:'0.78rem', color:'#64748b', marginTop:'4px', display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
                <span style={{ fontWeight: 700, color: '#334155' }}>Versión {gantt.version}</span>
                {gantt.name ? <span>· {gantt.name}</span> : null}
                <span>·</span>
                <span style={{
                  backgroundColor: gantt.status === 'Aprobado' ? '#dcfce7' : '#f1f5f9',
                  color: gantt.status === 'Aprobado' ? '#166534' : '#64748b',
                  padding:'2px 8px', borderRadius:'99px', fontWeight:600, fontSize:'0.72rem'
                }}>
                  {gantt.status}
                </span>
              </div>
            </div>
          </div>

          {/* Right action bar: Copy Link & View mode toggle */}
          <div style={{ display:'flex', alignItems:'flex-end', gap:'16px' }}>
            <div className="public-gantt-print-meta">
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#662D91' }}>
                ESCALA: {viewMode === 'day' ? 'DÍA' : viewMode === 'week' ? 'SEMANA' : 'MES'}
              </span>
              <span style={{ fontSize: '10px', color: '#64748b' }}>
                {tasks.length} tareas · {new Date().toLocaleDateString('es-PE')}
              </span>
            </div>
            <button
              onClick={() => {
                const cName = gantt.proyecto?.cliente?.empresa || gantt.proyecto?.cliente?.contacto || '';
                const pName = gantt.proyecto?.nombre || 'Proyecto';
                const fullUrl = buildGanttClientUrl(token, cName, pName, gantt.version);
                navigator.clipboard.writeText(fullUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
              }}
              className="no-print"
              style={{
                display:'flex', alignItems:'center', gap:'6px',
                padding:'8px 14px', borderRadius:'8px', cursor:'pointer',
                border: copied ? '1px solid #10b981' : '1px solid #cbd5e1',
                backgroundColor: copied ? '#ecfdf5' : 'white',
                color: copied ? '#059669' : '#334155', fontWeight:600, fontSize:'0.82rem',
                transition:'all 0.2s', boxShadow:'0 1px 2px rgba(0,0,0,0.05)'
              }}
              title="Copiar enlace con Cliente, Proyecto y Versión"
            >
              {copied ? '✅ ¡Copiado!' : '🔗 Copiar Link'}
            </button>

            <button
              onClick={handleExportPDF}
              className="no-print"
              style={{
                display:'flex', alignItems:'center', gap:'6px',
                padding:'8px 14px', borderRadius:'8px', cursor:'pointer',
                border: '1px solid #662D91',
                backgroundColor: '#F3E8FF',
                color: '#662D91',
                fontWeight:600, fontSize:'0.82rem',
                transition:'all 0.2s', boxShadow:'0 1px 2px rgba(102, 45, 145, 0.1)'
              }}
              title="Exportar cronograma a PDF (Formato apaisado)"
            >
              <Printer size={15}/> Exportar PDF
            </button>

            <div>
              <div style={{ fontSize:'0.72rem', color:'#94a3b8', fontWeight:600, marginBottom:'6px', textAlign:'right' }}>ESCALA DE TIEMPO</div>
              <div style={{ display:'flex', borderRadius:'8px', overflow:'hidden', border:'1px solid #e2e8f0' }}>
                {(['day','week','month'] as ViewMode[]).map(m => (
                  <button key={m} onClick={() => setViewMode(m)} style={{
                    padding:'6px 16px', border:'none', cursor:'pointer', fontSize:'0.82rem', fontWeight:600,
                    backgroundColor: viewMode === m ? '#662D91' : 'white',
                    color: viewMode === m ? 'white' : '#64748b',
                    transition:'all 0.15s'
                  }}>
                    {m === 'day' ? 'Día' : m === 'week' ? 'Semana' : 'Mes'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Gantt content */}
      <div className="public-gantt-outer" style={{ maxWidth:'1400px', margin:'24px auto', padding:'0 32px' }}>
        {tasks.length === 0 ? (
          <div style={{ textAlign:'center', padding:'80px', backgroundColor:'white', borderRadius:'16px', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize:'3rem', marginBottom:'16px' }}>📅</div>
            <p style={{ color:'#94a3b8', fontSize:'1rem' }}>Este cronograma aún no tiene tareas definidas.</p>
          </div>
        ) : (
          <div className="public-gantt-card" style={{ backgroundColor:'white', borderRadius:'16px', boxShadow:'0 2px 12px rgba(0,0,0,0.06)', overflow:'hidden' }}>
            <div style={{ display:'flex' }}>
              {/* Left: task labels */}
              <div className="public-gantt-left-pane" style={{ width:`${LABEL_W}px`, flexShrink:0, borderRight:'1px solid #f1f5f9' }}>
                {/* Header */}
                <div style={{ height:`${ROW_H}px`, display:'flex', alignItems:'center', padding:'0 20px', backgroundColor:'#f8fafc', borderBottom:'2px solid #e2e8f0' }}>
                  <span style={{ fontSize:'0.72rem', fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em' }}>Tarea / Responsable</span>
                </div>
                {tasks.map((task: any, i: number) => (
                  <div key={task.id} style={{ height:`${ROW_H}px`, display:'flex', alignItems:'center', padding:'0 16px', gap:'10px', borderBottom:'1px solid #f1f5f9', backgroundColor: i%2===0 ? 'white' : '#fafafa' }}>
                    <div style={{ width:12, height:12, borderRadius:'50%', backgroundColor: task.color || '#662D91', flexShrink:0 }}/>
                    <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column' }}>
                      <div style={{ fontSize:'0.85rem', fontWeight:600, color:'#1e293b', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{task.name}</div>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'2px' }}>
                        {task.assignee ? (
                          <div style={{ fontSize:'0.72rem', color:'#94a3b8' }}>👤 {task.assignee}</div>
                        ) : <div/>}
                        <div style={{ fontSize:'0.72rem', color:'#64748b', fontWeight:600 }}>
                          {formatDate(task.startDate)} - {formatDate(task.endDate)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Right: chart */}
              <div className="public-gantt-chart-pane" style={{ flex:1, overflowX:'auto' }}>
                <div className="public-gantt-chart-inner" style={{ minWidth:`${cols.length * CW + 20}px`, position: 'relative' }}>
                  {/* Timeline header */}
                  <div style={{ height:`${ROW_H}px`, display:'flex', alignItems:'center', backgroundColor:'#f8fafc', borderBottom:'2px solid #e2e8f0', boxSizing:'border-box' }}>
                    {cols.map((d, i) => {
                      const isBlocked = (viewMode === 'day') && blockedDays.includes(d.getDay());
                      const isWeekend = (viewMode === 'day') && (d.getDay() === 0 || d.getDay() === 6);
                      return (
                        <div key={i} style={{
                          width:`${CW}px`, minWidth:`${CW}px`, maxWidth:`${CW}px`, flexShrink:0, textAlign:'center',
                          fontSize:'0.68rem', fontWeight: isBlocked ? 700 : 600,
                          color: d.getTime()===today.getTime() && viewMode==='day' ? '#662D91' : isBlocked ? '#475569' : '#94a3b8',
                          backgroundColor: isBlocked ? '#e2e8f0' : isWeekend ? '#f1f5f9' : 'transparent',
                          borderLeft: i>0 ? '1px solid #cbd5e1' : 'none',
                          padding:'4px 2px', boxSizing:'border-box', overflow:'hidden'
                        }}
                        title={isBlocked ? 'Día no laborable (no considerado)' : undefined}
                        >
                          {colLabel(d, viewMode)}
                        </div>
                      );
                    })}
                  </div>

                  {/* Rows */}
                  {tasks.map((task: any, rowIdx: number) => {
                    const startPx = dateToPx(task.startDate);
                    const endPx = dateToPx(task.endDate) + CW;
                    const barW = Math.max(endPx - startPx, CW);
                    const barColor = task.color || '#662D91';

                    return (
                      <div key={task.id} style={{ position:'relative', height:`${ROW_H}px`, borderBottom:'1px solid #f1f5f9', backgroundColor: rowIdx%2===0 ? 'white' : '#fafafa', boxSizing:'border-box' }}>
                        {/* Grid lines */}
                        {cols.map((d, i) => {
                          const isBlocked = (viewMode === 'day') && blockedDays.includes(d.getDay());
                          const isWeekend = (viewMode === 'day') && (d.getDay() === 0 || d.getDay() === 6);
                          return (
                            <div key={i} style={{
                              position:'absolute', left:`${i*CW}px`, top:0, bottom:0, width:`${CW}px`,
                              borderLeft: i>0 ? '1px solid #cbd5e1' : 'none',
                              backgroundColor: isBlocked ? '#e2e8f0' : isWeekend ? '#f8fafc' : 'transparent',
                              boxSizing: 'border-box'
                            }}/>
                          );
                        })}

                        {/* Today marker */}
                        {viewMode==='day' && (() => {
                          const px = dateToPx(today.toISOString().split('T')[0]);
                          return <div style={{ position:'absolute', left:`${px + CW/2}px`, top:0, bottom:0, width:'2px', backgroundColor:'rgba(102,45,145,0.2)', zIndex:2 }}/>;
                        })()}

                        {/* Bar */}
                        <div
                          className="public-gantt-bar"
                          title={task.name}
                          style={{
                            position:'absolute', left:`${startPx}px`, width:`${barW}px`,
                            top:'10px', height:`${ROW_H-20}px`, borderRadius:'6px',
                            backgroundColor: barColor,
                            boxShadow:`0 2px 6px ${barColor}44`,
                            overflow:'hidden', zIndex:3, display:'flex', alignItems:'center'
                          }}
                        />


                      </div>
                    );
                  })}

                  {/* Franjas grises no laborables PINTADAS SOBRE TODO EL GRÁFICO (barras incluidas) */}
                  {viewMode === 'day' && blockedDays.length > 0 && cols.map((d, i) => {
                    const isBlocked = blockedDays.includes(d.getDay());
                    if (!isBlocked) return null;
                    return (
                      <div
                        key={`pub-full-blocked-${i}`}
                        className="public-gantt-blocked-overlay"
                        style={{
                          position: 'absolute',
                          left: `${i * CW}px`,
                          top: `${ROW_H}px`,
                          bottom: 0,
                          width: `${CW}px`,
                          backgroundColor: 'rgba(148, 163, 184, 0.82)',
                          backgroundImage: 'repeating-linear-gradient(45deg, rgba(71, 85, 105, 0.35), rgba(71, 85, 105, 0.35) 5px, transparent 5px, transparent 10px)',
                          pointerEvents: 'none',
                          zIndex: 10,
                          borderLeft: '1.5px solid #94a3b8',
                          borderRight: '1.5px solid #94a3b8',
                          boxSizing: 'border-box'
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="public-gantt-footer" style={{ textAlign:'center', marginTop:'24px', color:'#94a3b8', fontSize:'0.75rem' }}>
          Documento generado por <strong style={{ color:'#662D91' }}>Purple BTL S.A.C.</strong> · Solo lectura · purplebtl.com
        </div>
      </div>
    </div>
  );
};
