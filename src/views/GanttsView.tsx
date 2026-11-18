import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useGlobalContext } from '../context/GlobalContext';
import { Folder, ArrowRight, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { GanttBuilderView } from './GanttBuilderView';
import { SkeletonTable } from '../components/SkeletonTable';
import type { ProjectGantt, Proyecto } from '../types/models';

type ViewMode = 'day' | 'week' | 'month';

const toDate = (s: string) => {
  if (!s) return new Date();
  const dateStr = s.includes('T') ? s.split('T')[0] : s;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return new Date(y, m, d);
    }
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
};
const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const diffDays = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);

function buildColumns(start: Date, end: Date, mode: ViewMode): Date[] {
  const cols: Date[] = [];
  const cur = new Date(start);
  cur.setHours(0,0,0,0);
  const endCopy = new Date(end);
  endCopy.setHours(0,0,0,0);
  if (mode === 'day') {
    while (cur <= endCopy) { cols.push(new Date(cur)); cur.setDate(cur.getDate()+1); }
  } else if (mode === 'week') {
    // step to Monday
    while (cur.getDay() !== 1) cur.setDate(cur.getDate()-1);
    while (cur <= endCopy) { cols.push(new Date(cur)); cur.setDate(cur.getDate()+7); }
  } else {
    while (cur <= endCopy) {
      cols.push(new Date(cur.getFullYear(), cur.getMonth(), 1));
      cur.setMonth(cur.getMonth()+1);
    }
  }
  return cols;
}

function colWidth(mode: ViewMode) {
  return mode === 'day' ? 40 : mode === 'week' ? 90 : 120;
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
  if (mode === 'week') return `Sem ${d.toLocaleDateString('es-PE',{day:'2-digit',month:'short'})}`;
  return d.toLocaleDateString('es-PE',{month:'short',year:'numeric'});
}

function daysToCols(days: number, mode: ViewMode) {
  return mode === 'day' ? days : mode === 'week' ? days / 7 : days / 30;
}

export const GanttsView: React.FC = () => {
  const { proyectos, gantts, isLoading } = useGlobalContext();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'lista' | 'global'>('lista');

  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [panOffset, setPanOffset] = useState(0); // in days
  const chartRef = useRef<HTMLDivElement>(null);

  const projectsWithGantts = useMemo(() => {
    return proyectos.filter(p => gantts.some(g => g.projectId === p.id));
  }, [proyectos, gantts]);
  
  // Calculate a summary for each gantt for the global view
  const ganttsSummary = useMemo(() => {
    const list: Array<{ gantt: ProjectGantt, project: Proyecto, startDate: string, endDate: string, progress: number, color: string }> = [];
    
    const colors = ['#662D91','#0EA5E9','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6'];

    gantts.forEach((g, idx) => {
      const project = proyectos.find(p => p.id === g.projectId);
      if (project) {
        let minStart = '';
        let maxEnd = '';
        let totalProgress = 0;
        
        if (g.tasks && g.tasks.length > 0) {
          g.tasks.forEach(t => {
            const s = t.startDate ? (t.startDate.includes('T') ? t.startDate.split('T')[0] : t.startDate) : '';
            const e = t.endDate ? (t.endDate.includes('T') ? t.endDate.split('T')[0] : t.endDate) : '';
            if (s && (!minStart || s < minStart)) minStart = s;
            if (e && (!maxEnd || e > maxEnd)) maxEnd = e;
            totalProgress += (t.progress || 0);
          });
          
          totalProgress = Math.round(totalProgress / g.tasks.length);
        }

        const startDate = minStart;
        const endDate = maxEnd;

        if (startDate && endDate) {
          list.push({
            gantt: g,
            project: project,
            startDate,
            endDate,
            progress: totalProgress,
            color: colors[idx % colors.length]
          });
        }
      }
    });
    
    // Sort by project name
    return list.sort((a, b) => a.project.nombre.localeCompare(b.project.nombre));
  }, [gantts, proyectos]);

  const leftTableRef = useRef<HTMLDivElement>(null);
  const isSyncingLeft = useRef(false);
  const isSyncingRight = useRef(false);

  const handleLeftScroll = () => {
    if (!isSyncingLeft.current && chartRef.current && leftTableRef.current) {
      isSyncingRight.current = true;
      chartRef.current.scrollTop = leftTableRef.current.scrollTop;
    }
    isSyncingLeft.current = false;
  };

  const handleRightScroll = () => {
    if (!isSyncingRight.current && leftTableRef.current && chartRef.current) {
      isSyncingLeft.current = true;
      leftTableRef.current.scrollTop = chartRef.current.scrollTop;
    }
    isSyncingRight.current = false;
  };

  // Build timeline range with ample buffer for natural scrolling
  const today = new Date(); today.setHours(0,0,0,0);
  const allDates = ganttsSummary.flatMap(t => [toDate(t.startDate), toDate(t.endDate)]);
  const minDate = allDates.length ? new Date(Math.min(...allDates.map(d=>d.getTime()))) : today;
  const maxDate = allDates.length ? new Date(Math.max(...allDates.map(d=>d.getTime()))) : addDays(today, 30);
  
  const bufferBefore = viewMode === 'day' ? 14 : viewMode === 'week' ? 28 : 60;
  const bufferAfter = viewMode === 'day' ? 30 : viewMode === 'week' ? 70 : 120;
  const viewStart = addDays(minDate, panOffset - bufferBefore);
  const viewEnd = addDays(maxDate, panOffset + bufferAfter);
  const cols = buildColumns(viewStart, viewEnd, viewMode);
  
  const CW = colWidth(viewMode);
  const ROW_H = 46;

  const dateToPx = (dStr: string) => {
    if (!dStr) return 0;
    const d = toDate(dStr);
    const diff = diffDays(viewStart, d);
    return daysToCols(diff, viewMode) * CW;
  };

  // Auto-scroll timeline to focus on active period on initial render
  useEffect(() => {
    if (chartRef.current && activeTab === 'global' && ganttsSummary.length > 0) {
      const firstStart = ganttsSummary[0]?.startDate || new Date().toISOString().split('T')[0];
      const startPx = dateToPx(firstStart);
      chartRef.current.scrollLeft = Math.max(0, startPx - 100);
    }
  }, [activeTab, viewMode]);

  // Early return must happen AFTER all hooks are called
  if (selectedProjectId) {
    return <GanttBuilderView projectId={selectedProjectId} onBack={() => setSelectedProjectId(null)} />;
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* UNIFIED TOOLBAR: TABS ON LEFT, SELECTOR & MODES ON RIGHT */}
      <div className="view-header" style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button 
            className={activeTab === 'lista' ? 'btn-primary' : 'btn-secondary'} 
            onClick={() => setActiveTab('lista')}
            style={activeTab === 'lista' ? {} : { backgroundColor: 'white', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
          >
            <Folder size={18} />
            <span>Por Proyecto</span>
          </button>
          <button 
            className={activeTab === 'global' ? 'btn-primary' : 'btn-secondary'} 
            onClick={() => setActiveTab('global')}
            style={activeTab === 'global' ? {} : { backgroundColor: 'white', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
          >
            <Calendar size={18} />
            <span>Resumen Global</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {activeTab === 'global' && (
            <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)', marginRight: '6px' }}>
              {(['day','week','month'] as ViewMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  style={{
                    padding: '6px 12px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                    background: viewMode === m ? 'var(--accent-primary)' : '#fff',
                    color: viewMode === m ? '#fff' : 'var(--text-muted)'
                  }}
                >
                  {m === 'day' ? 'Día' : m === 'week' ? 'Semana' : 'Mes'}
                </button>
              ))}
            </div>
          )}

          <select 
            className="form-control" 
            style={{ width: 'auto', minWidth: '240px', fontSize: '0.85rem' }}
            value=""
            onChange={(e) => {
              if (e.target.value) setSelectedProjectId(e.target.value);
            }}
          >
            <option value="">+ Abrir / Crear Gantt por Proyecto...</option>
            {proyectos.map(p => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>
      </div>


      {activeTab === 'lista' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          {isLoading ? (
            <SkeletonTable columns={4} rows={5} message="Cargando cronogramas y líneas de tiempo..." />
          ) : projectsWithGantts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(102, 45, 145, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', color: 'var(--accent-primary)' }}>
                <Folder size={28} />
              </div>
              <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)', fontSize: '1.1rem' }}>No hay Gantts creados en ningún proyecto</h3>
              <p style={{ fontSize: '0.88rem', maxWidth: '420px', margin: '0 auto 20px auto' }}>
                Selecciona un proyecto a continuación para diseñar su cronograma de tareas y fechas en el constructor interactivo.
              </p>
              <div style={{ maxWidth: '320px', margin: '0 auto' }}>
                <select 
                  className="form-control" 
                  style={{ width: '100%', fontSize: '0.9rem' }}
                  value=""
                  onChange={(e) => {
                    if (e.target.value) setSelectedProjectId(e.target.value);
                  }}
                >
                  <option value="">-- Seleccionar Proyecto --</option>
                  {proyectos.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
              {projectsWithGantts.map(p => {
                const projectGantts = gantts.filter(g => g.projectId === p.id);
                return (
                  <div key={p.id} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: 'rgba(102, 45, 145, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
                        <Folder size={20} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{p.nombre}</div>
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{projectGantts.length} cronogramas activos</div>
                      </div>
                    </div>
                    <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setSelectedProjectId(p.id)}>
                      Ver Cronogramas <ArrowRight size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'global' && (
        <div className="glass-panel" style={{ display: 'flex', height: 'calc(100vh - 240px)', minHeight: '450px', overflow: 'hidden', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
          
          {/* LEFT TABLE */}
          <div style={{ width: '300px', flexShrink: 0, borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'white' }}>
            <div style={{ display: 'flex', height: `${ROW_H}px`, backgroundColor: 'var(--bg-secondary)', borderBottom: '2px solid var(--border-color)', flexShrink: 0 }}>
              <div style={{ flex: 1, padding: '0 14px', display: 'flex', alignItems: 'center', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>PROYECTO</div>
            </div>

            <div 
              ref={leftTableRef} 
              onScroll={handleLeftScroll}
              style={{ overflowY: 'auto', flex: 1, scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {ganttsSummary.length === 0 && (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  No hay Gantts registrados.
                </div>
              )}
              {ganttsSummary.map(summary => (
                <div key={summary.gantt.id} style={{ display: 'flex', height: `${ROW_H}px`, borderBottom: '1px solid var(--border-color)', alignItems: 'center', cursor: 'pointer', transition: 'background 0.2s' }} onClick={() => setSelectedProjectId(summary.project.id)} className="hover-bg-light">
                  <div style={{ flex: 1, padding: '0 14px', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: summary.color, flexShrink: 0 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary.project.nombre}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary.gantt.name}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: GANTT CHART */}
          <div 
            ref={chartRef} 
            onScroll={handleRightScroll}
            style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', position: 'relative', userSelect: 'none', backgroundColor: '#fdfdfd' }}
          >
            <div style={{ minWidth: `${cols.length * CW + 60}px` }}>
              
              {/* Timeline header */}
              <div style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-secondary)', borderBottom: '2px solid var(--border-color)', height: `${ROW_H}px`, display: 'flex', alignItems: 'center' }}>
                <button
                  onClick={() => setPanOffset(v => v - (viewMode === 'day' ? 7 : viewMode === 'week' ? 28 : 60))}
                  style={{ position: 'sticky', left: 0, zIndex: 11, background: 'var(--bg-secondary)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 6px', height: '100%', boxShadow: '2px 0 4px rgba(0,0,0,0.05)' }}
                ><ChevronLeft size={18}/></button>
                
                <div style={{ flex: 1, display: 'flex' }}>
                  {cols.map((d, i) => {
                    const isToday = d.getTime() === today.getTime() && viewMode === 'day';
                    return (
                      <div
                        key={i}
                        style={{
                          width: `${CW}px`, flexShrink: 0, textAlign: 'center',
                          fontSize: '0.7rem', fontWeight: isToday ? 700 : 500,
                          color: isToday ? 'var(--accent-primary)' : 'var(--text-muted)',
                          borderLeft: i > 0 ? '1px solid var(--border-color)' : 'none',
                          padding: '4px 2px', lineHeight: 1.3
                        }}
                      >
                        {colLabel(d, viewMode)}
                        {isToday && <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'var(--accent-primary)', margin: '2px auto 0' }}/>}
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => setPanOffset(v => v + (viewMode === 'day' ? 7 : viewMode === 'week' ? 28 : 60))}
                  style={{ position: 'sticky', right: 0, zIndex: 11, background: 'var(--bg-secondary)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 6px', height: '100%', boxShadow: '-2px 0 4px rgba(0,0,0,0.05)' }}
                ><ChevronRight size={18}/></button>
              </div>

              {/* Chart body */}
              <div style={{ position: 'relative' }}>
                {ganttsSummary.map((summary) => {
                  const startPx = dateToPx(summary.startDate);
                  const endPx = dateToPx(summary.endDate) + (viewMode === 'month' ? CW : CW);
                  const barW = Math.max(endPx - startPx, CW);

                  return (
                    <div key={summary.gantt.id} style={{ position: 'relative', height: `${ROW_H}px`, borderBottom: '1px solid var(--border-color)', backgroundColor: 'transparent' }}>
                      {/* Grid lines */}
                      {cols.map((d, i) => {
                        const isBlocked = d.getDay() === 0 || d.getDay() === 6;
                        return (
                          <div key={i} style={{
                            position: 'absolute', left: `${i*CW}px`, top: 0, bottom: 0, width: `${CW}px`,
                            borderLeft: i>0 ? '1px solid var(--border-color)' : 'none',
                            backgroundColor: (isBlocked && viewMode === 'day') ? '#fafafa' : 'transparent',
                            pointerEvents: 'none'
                          }}/>
                        );
                      })}

                      {/* Bar rendering */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '8px',
                          left: `${startPx}px`,
                          width: `${barW}px`,
                          height: '30px',
                          backgroundColor: summary.color,
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 8px',
                          color: 'white',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                          cursor: 'pointer',
                          overflow: 'hidden'
                        }}
                        title={`${summary.project.nombre}: ${summary.progress}%`}
                        onClick={() => setSelectedProjectId(summary.project.id)}
                      >
                        {/* Progress overlay */}
                        <div style={{
                          position: 'absolute', left: 0, top: 0, bottom: 0,
                          width: `${summary.progress}%`,
                          backgroundColor: 'rgba(255,255,255,0.2)',
                          zIndex: 1
                        }} />
                        
                        <span style={{ position: 'relative', zIndex: 2, textShadow: '0 1px 2px rgba(0,0,0,0.3)', whiteSpace: 'nowrap' }}>
                          {summary.project.nombre}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
