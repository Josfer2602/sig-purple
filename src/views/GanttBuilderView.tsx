import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useGlobalContext } from '../context/GlobalContext';
import { Plus, Save, ArrowLeft, Copy, Trash2, Edit2, Check, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, BarChart2, Printer } from 'lucide-react';
import type { ProjectGantt } from '../types/models';
import { buildGanttClientUrl } from '../utils/clientLinks';
import toast from 'react-hot-toast';

interface GanttBuilderViewProps {
  projectId: string;
  onBack: () => void;
}

type ViewMode = 'day' | 'week' | 'month';

interface LocalTask {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  progress: number;
  assignee: string;
  color: string;
}

const TASK_COLORS = ['#662D91','#0EA5E9','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6'];

const formatDateToDisplay = (s: string) => {
  if (!s) return '—';
  const clean = s.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return s;
};

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
const fmt = (d: Date) => isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0];
const addDays = (d: Date, n: number) => { 
  const r = new Date(isNaN(d.getTime()) ? Date.now() : d.getTime()); 
  r.setDate(r.getDate() + n); 
  return r; 
};
const diffDays = (a: Date, b: Date) => {
  const tA = isNaN(a.getTime()) ? Date.now() : a.getTime();
  const tB = isNaN(b.getTime()) ? Date.now() : b.getTime();
  return Math.round((tB - tA) / 86400000);
};

function buildColumns(start: Date, end: Date, mode: ViewMode): Date[] {
  const cols: Date[] = [];
  const cur = new Date(start);
  if (isNaN(cur.getTime())) cur.setTime(Date.now());
  cur.setHours(0,0,0,0);
  const endCopy = new Date(end);
  if (isNaN(endCopy.getTime())) endCopy.setTime(cur.getTime() + 30 * 86400000);
  endCopy.setHours(0,0,0,0);

  if (endCopy < cur) {
    endCopy.setTime(cur.getTime() + 30 * 86400000);
  }

  let guard = 0;
  if (mode === 'day') {
    while (cur <= endCopy && guard++ < 500) { cols.push(new Date(cur)); cur.setDate(cur.getDate()+1); }
  } else if (mode === 'week') {
    // step to Monday
    let mondayGuard = 0;
    while (cur.getDay() !== 1 && mondayGuard++ < 14) cur.setDate(cur.getDate()-1);
    while (cur <= endCopy && guard++ < 200) { cols.push(new Date(cur)); cur.setDate(cur.getDate()+7); }
  } else {
    while (cur <= endCopy && guard++ < 60) {
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

export const GanttBuilderView: React.FC<GanttBuilderViewProps> = ({ projectId, onBack }) => {
  const { proyectos, clientes, gantts, addGantt, updateGantt } = useGlobalContext();
  const proyecto = proyectos.find((p: any) => p.id === projectId);
  const cliente = clientes.find((c: any) => c.id === proyecto?.clienteId);
  const projectGantts = (gantts as any[]).filter(g => g.projectId === projectId);

  const [currentGanttId, setCurrentGanttId] = useState<string | null>(
    projectGantts.length > 0 ? projectGantts[0].id : null
  );
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [tasks, setTasks] = useState<LocalTask[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingState, setSavingState] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [copiedState, setCopiedState] = useState(false);
  const [panOffset, setPanOffset] = useState(0); // in days
  const [localShareToken, setLocalShareToken] = useState<string | null>(() => {
    // initialize from context if a gantt already exists
    const existing = projectGantts[0];
    return existing?.shareToken ?? null;
  });
  const [blockedDays, setBlockedDays] = useState<number[]>([]);

  const chartRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{taskId: string; edge: 'start'|'end'|'move'; startX: number; origStart: string; origEnd: string} | null>(null);

  const currentGantt = (gantts as any[]).find(g => g.id === currentGanttId);

  // Always keep localShareToken in sync with currentGantt
  useEffect(() => {
    if (currentGantt?.shareToken) {
      setLocalShareToken(currentGantt.shareToken);
    }
    if (currentGantt?.settings) {
      try {
        const s = JSON.parse(currentGantt.settings);
        if (s.blockedDays) setBlockedDays(s.blockedDays);
      } catch {}
    } else {
      setBlockedDays([]);
    }
  }, [currentGantt]);

  // Load tasks when gantt changes
  useEffect(() => {
    if (currentGantt && currentGantt.tasks && currentGantt.tasks.length > 0) {
      let sorted = [...currentGantt.tasks];
      let taskOrder: string[] = [];
      try {
        if (currentGantt.settings) {
          const s = typeof currentGantt.settings === 'string' ? JSON.parse(currentGantt.settings) : currentGantt.settings;
          if (Array.isArray(s.taskOrder)) taskOrder = s.taskOrder;
        }
      } catch {}

      sorted.sort((a: any, b: any) => {
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

      setTasks(sorted.map((t: any, i: number) => ({
        id: t.id,
        name: t.name,
        startDate: t.startDate ? t.startDate.split('T')[0] : fmt(new Date()),
        endDate: t.endDate ? t.endDate.split('T')[0] : fmt(addDays(new Date(), 5)),
        progress: t.progress ?? 0,
        assignee: t.assignee ?? '',
        color: t.color || TASK_COLORS[i % TASK_COLORS.length]
      })));
      setLocalShareToken(currentGantt.shareToken);
    } else {
      setTasks([{
        id: `task-${Date.now()}`,
        name: 'Nueva Tarea',
        startDate: fmt(new Date()),
        endDate: fmt(addDays(new Date(), 7)),
        progress: 0,
        assignee: '',
        color: TASK_COLORS[0]
      }]);
    }
    setPanOffset(0);
  }, [currentGanttId]);

  // Refs for synchronized scrolling
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

  // Build timeline range
  const today = new Date(); today.setHours(0,0,0,0);
  const validTimes = tasks.flatMap(t => [toDate(t.startDate).getTime(), toDate(t.endDate).getTime()]).filter(t => !isNaN(t));
  const minDate = validTimes.length ? new Date(Math.min(...validTimes)) : today;
  const maxDate = validTimes.length ? new Date(Math.max(...validTimes)) : addDays(today, 30);
  
  const bufferBefore = viewMode === 'day' ? 14 : viewMode === 'week' ? 28 : 60;
  const bufferAfter = viewMode === 'day' ? 30 : viewMode === 'week' ? 70 : 120;
  const viewStart = addDays(minDate, panOffset - bufferBefore);
  const viewEnd = addDays(maxDate, panOffset + bufferAfter);
  const cols = buildColumns(viewStart, viewEnd, viewMode);
  const CW = colWidth(viewMode);

  // Pixel position of a date
  const dateToPx = useCallback((dateStr: string) => {
    const d = toDate(dateStr);
    const dayDiff = diffDays(viewStart, d);
    return Math.max(0, daysToCols(dayDiff, viewMode) * CW);
  }, [viewStart, viewMode, CW]);


  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent, taskId: string, edge: 'start'|'end'|'move') => {
    e.preventDefault();
    const task = tasks.find(t => t.id === taskId)!;
    dragging.current = { taskId, edge, startX: e.clientX, origStart: task.startDate, origEnd: task.endDate };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    const { taskId, edge, startX, origStart, origEnd } = dragging.current;
    const dx = e.clientX - startX;
    const dayDelta = viewMode === 'day' ? Math.round(dx / CW) : viewMode === 'week' ? Math.round(dx / CW * 7) : Math.round(dx / CW * 30);
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      if (edge === 'move') {
        const ns = fmt(addDays(toDate(origStart), dayDelta));
        const ne = fmt(addDays(toDate(origEnd), dayDelta));
        return { ...t, startDate: ns, endDate: ne };
      } else if (edge === 'start') {
        const ns = fmt(addDays(toDate(origStart), dayDelta));
        if (ns >= origEnd) return t;
        return { ...t, startDate: ns };
      } else {
        const ne = fmt(addDays(toDate(origEnd), dayDelta));
        if (ne <= origStart) return t;
        return { ...t, endDate: ne };
      }
    }));
  }, [viewMode, CW]);

  const handleMouseUp = useCallback(() => {
    dragging.current = null;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  // Task CRUD
  const handleAddTask = () => {
    const newTask: LocalTask = {
      id: `task-${Date.now()}`,
      name: 'Nueva Tarea',
      startDate: fmt(new Date()),
      endDate: fmt(addDays(new Date(), 7)),
      progress: 0,
      assignee: '',
      color: TASK_COLORS[tasks.length % TASK_COLORS.length]
    };
    setTasks(prev => [...prev, newTask]);
    setEditingId(newTask.id);
    setEditingName(newTask.name);
  };

  const handleDeleteTask = (id: string) => setTasks(prev => prev.filter(t => t.id !== id));

  const handleMoveTaskUp = (index: number) => {
    if (index <= 0) return;
    setTasks(prev => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const handleMoveTaskDown = (index: number) => {
    setTasks(prev => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const handleStartEdit = (t: LocalTask) => { setEditingId(t.id); setEditingName(t.name); };
  const handleConfirmEdit = () => {
    if (editingId && editingName.trim()) {
      setTasks(prev => prev.map(t => t.id === editingId ? { ...t, name: editingName } : t));
    }
    setEditingId(null);
  };

  const handleUpdateField = (id: string, field: keyof LocalTask, value: any) =>
    setTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));

  // Build payload for SAVE (preserve existing DB IDs, only generate new ones for brand-new local tasks)
  const buildTaskPayloadForSave = (ganttId: string) => tasks.map((t, idx) => ({
    id: t.id.startsWith('task-') ? crypto.randomUUID() : t.id,
    ganttId,
    name: t.name,
    startDate: t.startDate,
    endDate: t.endDate,
    progress: t.progress,
    dependencies: String(idx).padStart(5, '0'),
    type: 'task',
    assignee: t.assignee,
    color: t.color
  }));

  // Build payload for NEW VERSION (always fresh IDs to avoid unique constraint violations)
  const buildTaskPayloadForNewVersion = (ganttId: string) => tasks.map((t, idx) => ({
    id: crypto.randomUUID(), // always fresh!
    ganttId,
    name: t.name,
    startDate: t.startDate,
    endDate: t.endDate,
    progress: t.progress,
    dependencies: String(idx).padStart(5, '0'),
    type: 'task',
    assignee: t.assignee,
    color: t.color
  }));

  const handleSave = async () => {
    setSavingState('saving');
    try {
      const currentSettings = JSON.stringify({ blockedDays, taskOrder: tasks.map(t => t.id) });
      if (!currentGantt) {
        // No existing gantt — create V1
        await handleCreateVersion();
      } else {
        await updateGantt({ ...currentGantt, settings: currentSettings, tasks: buildTaskPayloadForSave(currentGantt.id) } as ProjectGantt);
        // Ensure token is stored locally after update
        if (currentGantt.shareToken) setLocalShareToken(currentGantt.shareToken);
        setSavingState('saved');
        setTimeout(() => setSavingState('idle'), 2500);
      }
    } catch {
      setSavingState('error');
      setTimeout(() => setSavingState('idle'), 3000);
    }
  };

  const handleCreateVersion = async () => {
    const existingVersions = (gantts as any[]).filter(g => g.projectId === projectId);
    const maxVersion = existingVersions.length > 0
      ? Math.max(...existingVersions.map((g: any) => g.version || 1))
      : 0;
    const newVersionNum = maxVersion + 1;

    const versionName = prompt(
      `Nombre para la Versión ${newVersionNum} (o deja en blanco para usar "Versión ${newVersionNum}"):`,
      `Versión ${newVersionNum}`
    );
    if (versionName === null) return; // user cancelled

    setSavingState('saving');
    try {
      const shareToken = crypto.randomUUID().replace(/-/g, '');
      const tempId = crypto.randomUUID();
      const currentSettings = JSON.stringify({ blockedDays });
      const newGantt = await addGantt({
        id: tempId,
        projectId,
        version: newVersionNum,
        status: 'Borrador',
        name: versionName.trim() || `Versión ${newVersionNum}`,
        shareToken,
        settings: currentSettings,
        tasks: buildTaskPayloadForNewVersion(tempId) // always fresh IDs
      } as ProjectGantt);
      setCurrentGanttId(newGantt.id);
      setLocalShareToken(newGantt.shareToken ?? shareToken);
      setSavingState('saved');
      setTimeout(() => setSavingState('idle'), 2500);
    } catch (err) {
      console.error('Error creating version:', err);
      setSavingState('error');
      setTimeout(() => setSavingState('idle'), 3000);
    }
  };

  const handleCopyLink = async () => {
    const token = localShareToken ?? currentGantt?.shareToken;
    if (!token) {
      toast.error('Primero guarda el cronograma (botón Guardar) para obtener el enlace público.');
      return;
    }
    const clientName = cliente?.empresa || '';
    const projectName = proyecto?.nombre || '';
    const version = currentGantt?.version || 1;
    const url = buildGanttClientUrl(token, clientName, projectName, version);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedState(true);
      toast.success(`¡Enlace copiado!\n${clientName ? clientName + ' - ' : ''}${projectName} (V${version})`);
      setTimeout(() => setCopiedState(false), 2500);
    } catch {
      prompt('Copia este enlace para compartir con el cliente:', url);
    }
  };

  // Cálculo dinámico de escala para que NINGÚN gráfico salga cortado en PDF
  const calculatePrintScale = useCallback(() => {
    const leftW = 440; // Ancho compacto de la tabla izquierda en impresión
    const chartW = cols.length * CW + 60;
    const totalW = leftW + chartW;
    const printableW = 1050; // Ancho útil en hoja A4 horizontal con márgenes de 6-8mm

    if (totalW > printableW) {
      const rawScale = printableW / totalW;
      return Math.max(0.35, Math.min(1, Math.floor(rawScale * 1000) / 1000));
    }
    return 1;
  }, [cols.length, CW]);

  const handleExportPDF = () => {
    const prevPan = panOffset;
    if (panOffset !== 0) {
      setPanOffset(0);
    }
    const scale = calculatePrintScale();
    document.documentElement.style.setProperty('--gantt-print-scale', scale.toString());

    toast.success('Preparando vista de impresión / PDF...', { duration: 1500 });
    setTimeout(() => {
      window.print();
      if (prevPan !== 0) {
        setPanOffset(prevPan);
      }
    }, 250);
  };

  useEffect(() => {
    const onBeforePrint = () => {
      const scale = calculatePrintScale();
      document.documentElement.style.setProperty('--gantt-print-scale', scale.toString());
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
  }, [calculatePrintScale]);

  const ROW_H = 52;
  const LABEL_W = 280;
  const COL_2 = 105; // date cols
  const COL_COLOR = 48; // color picker
  const COL_ASSIGN = 130; // assignee

  return (
    <div className="gantt-builder-container" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', overflow: 'hidden', backgroundColor: 'var(--bg-primary)' }}>

      {/* ── ESTILOS DE IMPRESIÓN Y EXPORTACIÓN A PDF ── */}
      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 6mm 8mm 6mm 8mm;
          }

          /* Ocultar elementos de navegación del sistema y botones */
          .no-print,
          .app-sidebar,
          .sidebar,
          nav,
          aside,
          header,
          .unified-navbar,
          .gantt-screen-toolbar,
          .gantt-pan-btn,
          .gantt-row-action-btn,
          .gantt-resize-handle,
          button {
            display: none !important;
          }

          /* Forzar visibilidad completa sin barras de desplazamiento */
          html, body, #root, .app-layout, .main-content, .content-container {
            overflow: visible !important;
            height: auto !important;
            min-height: auto !important;
            width: 100% !important;
            background: #ffffff !important;
            color: #0f172a !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .gantt-builder-container {
            height: auto !important;
            overflow: visible !important;
            background: #ffffff !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          /* Escala con zoom proporcional para que quepa 100% en la hoja sin recortarse */
          .gantt-main-area {
            overflow: visible !important;
            height: auto !important;
            display: flex !important;
            border: 1px solid #cbd5e1 !important;
            border-radius: 8px !important;
            width: max-content !important;
            max-width: none !important;
            zoom: var(--gantt-print-scale, 0.72) !important;
          }

          .gantt-left-pane {
            width: 440px !important;
            overflow: visible !important;
            height: auto !important;
            border-right: 1.5px solid #cbd5e1 !important;
          }

          .gantt-left-rows {
            overflow: visible !important;
            height: auto !important;
          }

          .gantt-chart-pane {
            overflow: visible !important;
            height: auto !important;
            flex: 1 !important;
          }

          .gantt-chart-body {
            margin-left: 0 !important;
            overflow: visible !important;
          }

          .gantt-print-header {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            margin-bottom: 12px !important;
            padding-bottom: 10px !important;
            border-bottom: 2px solid #662D91 !important;
          }

          .gantt-print-footer {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            margin-top: 14px !important;
            padding-top: 8px !important;
            border-top: 1px solid #e2e8f0 !important;
            font-size: 10px !important;
            color: #64748b !important;
          }

          .gantt-screen-only {
            display: none !important;
          }

          .gantt-print-only {
            display: block !important;
          }

          .gantt-task-bar {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            box-shadow: none !important;
            border: 1px solid rgba(0,0,0,0.15) !important;
          }
        }

        @media screen {
          .gantt-print-header,
          .gantt-print-footer,
          .gantt-print-only {
            display: none !important;
          }
        }
      `}</style>

      {/* ── PRINT-ONLY EXECUTIVE HEADER ── */}
      <div className="gantt-print-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <img
            src="https://brandgeeks.pe/wp-content/uploads/2026/06/PurpleNEW-01-1-1.png"
            alt="Purple BTL"
            style={{ height: '46px', objectFit: 'contain' }}
            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
          />
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#662D91', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>
              CRONOGRAMA DE PROYECTO · {cliente?.empresa ? `${cliente.empresa}` : 'CLIENTE'}
            </div>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b', lineHeight: 1.2 }}>
              {proyecto?.nombre || 'Cronograma de Proyecto'}
            </h1>
          </div>
        </div>

        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', backgroundColor: '#F3E8FF', color: '#662D91', border: '1px solid #D8B4FE' }}>
              Versión {currentGantt?.version || 1}
            </span>
            <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', backgroundColor: '#F1F5F9', color: '#475569' }}>
              Escala: {viewMode === 'day' ? 'Día' : viewMode === 'week' ? 'Semana' : 'Mes'}
            </span>
          </div>
          <div style={{ fontSize: '10px', color: '#64748b' }}>
            {tasks.length} tarea{tasks.length !== 1 ? 's' : ''} · Rango: {minDate.toLocaleDateString('es-PE')} al {maxDate.toLocaleDateString('es-PE')}
          </div>
          <div style={{ fontSize: '9px', color: '#94a3b8' }}>
            PM: {proyecto?.projectManager || 'Eric Higa'} · Fecha de emisión: {new Date().toLocaleDateString('es-PE')}
          </div>
        </div>
      </div>

      {/* ── TOOLBAR ── */}
      <div className="gantt-screen-toolbar no-print" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', flexShrink: 0, flexWrap: 'wrap' }}>
        <button className="btn-icon" onClick={onBack} title="Volver"><ArrowLeft size={20}/></button>

        <div style={{ flex: 1, minWidth: '200px' }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <BarChart2 size={18} color="var(--accent-primary)" style={{ flexShrink: 0 }}/>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {cliente?.empresa ? `${cliente.empresa} · ` : ''}{proyecto?.nombre ?? '—'}
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Cronograma de proyecto · Versión {currentGantt?.version || 1} · {tasks.length} tarea{tasks.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Version selector - always visible once one exists */}
        {(() => {
          const versions = (gantts as any[])
            .filter(g => g.projectId === projectId)
            .sort((a: any, b: any) => a.version - b.version);
          if (versions.length === 0) return null;
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>VERSIÓN:</span>
              <select
                value={currentGanttId || ''}
                onChange={e => setCurrentGanttId(e.target.value)}
                style={{
                  padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-color)',
                  fontSize: '0.85rem', color: 'var(--text-primary)', outline: 'none', background: 'white',
                  maxWidth: '250px', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden'
                }}
              >
                {versions.map((g: any) => (
                  <option key={g.id} value={g.id}>V{g.version} — {g.name || 'Borrador'}</option>
                ))}
              </select>

              {/* Blocked Days */}
              <select
                value={blockedDays.join(',')}
                onChange={e => setBlockedDays(e.target.value ? e.target.value.split(',').map(Number) : [])}
                style={{
                  padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-color)',
                  fontSize: '0.85rem', color: 'var(--text-primary)', outline: 'none', background: 'white',
                  marginLeft: '8px'
                }}
              >
                <option value="">Días: Todos laborables</option>
                <option value="6">Días: Bloquear Sábado</option>
                <option value="0,6">Días: Bloquear Sáb + Dom</option>
              </select>
            </div>
          );
        })()}

        {/* View mode */}
        <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
          {(['day','week','month'] as ViewMode[]).map(m => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              style={{
                padding: '6px 12px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                backgroundColor: viewMode === m ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                color: viewMode === m ? 'white' : 'var(--text-muted)',
                transition: 'all 0.15s'
              }}
            >
              {m === 'day' ? 'Día' : m === 'week' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>

        {/* Add task */}
        <button className="btn-secondary" onClick={handleAddTask} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
          <Plus size={16}/> Añadir Tarea
        </button>

        {/* New version */}
        <button className="btn-secondary" onClick={handleCreateVersion} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          + Nueva Versión
        </button>

        {/* Copy link */}
        <button
          onClick={handleCopyLink}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
            border: `1px solid ${copiedState ? '#10B981' : '#0EA5E9'}`,
            backgroundColor: copiedState ? '#D1FAE5' : '#E0F2FE',
            color: copiedState ? '#065F46' : '#0369A1',
            fontWeight: 600, fontSize: '0.82rem', transition: 'all 0.2s'
          }}
        >
          <Copy size={15}/> {copiedState ? '¡Copiado!' : 'Link Cliente'}
        </button>

        {/* Exportar PDF */}
        <button
          onClick={handleExportPDF}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
            border: '1px solid #662D91',
            backgroundColor: '#F3E8FF',
            color: '#662D91',
            fontWeight: 600, fontSize: '0.82rem', transition: 'all 0.2s',
            boxShadow: '0 1px 2px rgba(102, 45, 145, 0.1)'
          }}
          title="Exportar cronograma a PDF (Formato apaisado)"
        >
          <Printer size={15}/> Exportar PDF
        </button>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={savingState === 'saving'}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', border: 'none',
            backgroundColor: savingState === 'saved' ? '#10B981' : savingState === 'error' ? '#EF4444' : 'var(--accent-primary)',
            color: 'white', fontWeight: 600, fontSize: '0.85rem', transition: 'background 0.3s'
          }}
        >
          {savingState === 'saving' ? '...' : savingState === 'saved' ? <><Check size={15}/> Guardado</> : savingState === 'error' ? 'Error' : <><Save size={15}/> Guardar</>}
        </button>
      </div>

      {/* ── MAIN AREA ── */}
      <div className="gantt-main-area" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* LEFT TABLE */}
        <div className="gantt-left-pane" style={{ width: `${LABEL_W + COL_2*2 + COL_COLOR + COL_ASSIGN}px`, flexShrink: 0, borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'flex', height: `${ROW_H}px`, backgroundColor: 'var(--bg-secondary)', borderBottom: '2px solid var(--border-color)', flexShrink: 0 }}>
            <div style={{ width: COL_COLOR, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderRight: '1px solid var(--border-color)' }}>Color</div>
            <div style={{ width: LABEL_W, padding: '0 12px', display: 'flex', alignItems: 'center', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderRight: '1px solid var(--border-color)' }}>TAREA</div>
            <div style={{ width: COL_ASSIGN, padding: '0 8px', display: 'flex', alignItems: 'center', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderRight: '1px solid var(--border-color)' }}>Responsable</div>
            <div style={{ width: COL_2, padding: '0 8px', display: 'flex', alignItems: 'center', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderRight: '1px solid var(--border-color)' }}>INICIO</div>
            <div style={{ width: COL_2, padding: '0 8px', display: 'flex', alignItems: 'center', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderRight: '1px solid var(--border-color)' }}>FIN</div>
          </div>

          {/* Rows */}
          <div 
            ref={leftTableRef}
            onScroll={handleLeftScroll}
            className="gantt-left-rows"
            style={{ overflowY: 'auto', flex: 1, scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {tasks.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Presiona <strong>"Añadir Tarea"</strong> para comenzar
              </div>
            )}
            {tasks.map((task, index) => (
              <div key={task.id} style={{ display: 'flex', height: `${ROW_H}px`, borderBottom: '1px solid var(--border-color)', alignItems: 'center' }}>
                {/* Color picker */}
                <div style={{ width: COL_COLOR, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid var(--border-color)', flexShrink: 0 }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="gantt-screen-only">
                      <input
                        type="color"
                        value={task.color}
                        onChange={e => handleUpdateField(task.id, 'color', e.target.value)}
                        title="Cambiar color"
                        style={{ width: '26px', height: '26px', borderRadius: '50%', border: '2px solid var(--border-color)', padding: 0, cursor: 'pointer', backgroundColor: task.color }}
                      />
                    </div>
                    <div
                      className="gantt-print-only"
                      style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: task.color, border: '1px solid rgba(0,0,0,0.2)' }}
                    />
                  </div>
                </div>
                {/* Name */}
                <div style={{ width: LABEL_W, padding: '0 8px', display: 'flex', alignItems: 'center', gap: '4px', borderRight: '1px solid var(--border-color)', overflow: 'hidden' }}>
                  {editingId === task.id ? (
                    <div style={{ display: 'flex', flex: 1, gap: '4px', alignItems: 'center' }}>
                      <input
                        autoFocus
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleConfirmEdit(); if (e.key === 'Escape') setEditingId(null); }}
                        onBlur={handleConfirmEdit}
                        style={{ flex: 1, minWidth: 0, padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--accent-primary)', fontSize: '0.82rem', outline: 'none' }}
                      />
                    </div>
                  ) : (
                    <>
                      <span
                        style={{ flex: 1, fontSize: '0.83rem', fontWeight: 500, color: 'var(--text-primary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', lineHeight: '1.2' }}
                        onDoubleClick={() => handleStartEdit(task)}
                        title="Doble clic para editar"
                      >{task.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                        <button
                          className="gantt-row-action-btn no-print"
                          disabled={index === 0}
                          onClick={() => handleMoveTaskUp(index)}
                          title="Subir tarea en la lista"
                          style={{ background: 'none', border: 'none', cursor: index === 0 ? 'default' : 'pointer', color: index === 0 ? '#cbd5e1' : 'var(--text-muted)', padding: '2px', opacity: index === 0 ? 0.2 : 0.7 }}
                        >
                          <ChevronUp size={13}/>
                        </button>
                        <button
                          className="gantt-row-action-btn no-print"
                          disabled={index === tasks.length - 1}
                          onClick={() => handleMoveTaskDown(index)}
                          title="Bajar tarea en la lista"
                          style={{ background: 'none', border: 'none', cursor: index === tasks.length - 1 ? 'default' : 'pointer', color: index === tasks.length - 1 ? '#cbd5e1' : 'var(--text-muted)', padding: '2px', opacity: index === tasks.length - 1 ? 0.2 : 0.7 }}
                        >
                          <ChevronDown size={13}/>
                        </button>
                        <button className="gantt-row-action-btn no-print" onClick={() => handleStartEdit(task)} title="Editar nombre" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', opacity: 0.6 }}><Edit2 size={12}/></button>
                        <button className="gantt-row-action-btn no-print" onClick={() => handleDeleteTask(task.id)} title="Eliminar tarea" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px', opacity: 0.6 }}><Trash2 size={12}/></button>
                      </div>
                    </>
                  )}
                </div>
                {/* Assignee */}
                <div style={{ width: COL_ASSIGN, padding: '0 6px', borderRight: '1px solid var(--border-color)' }}>
                  <div className="gantt-screen-only">
                    <input
                      type="text"
                      value={task.assignee}
                      onChange={e => handleUpdateField(task.id, 'assignee', e.target.value)}
                      placeholder="Responsable..."
                      style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '0.78rem', color: 'var(--text-primary)', outline: 'none' }}
                    />
                  </div>
                  <div className="gantt-print-only" style={{ fontSize: '0.78rem', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task.assignee || '—'}
                  </div>
                </div>
                {/* Start date */}
                <div style={{ width: COL_2, padding: '0 6px', borderRight: '1px solid var(--border-color)' }}>
                  <div className="gantt-screen-only">
                    <input
                      type="date"
                      value={task.startDate}
                      onChange={e => handleUpdateField(task.id, 'startDate', e.target.value)}
                      style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '0.78rem', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}
                    />
                  </div>
                  <div className="gantt-print-only" style={{ fontSize: '0.78rem', color: '#1e293b', textAlign: 'center' }}>
                    {formatDateToDisplay(task.startDate)}
                  </div>
                </div>
                {/* End date */}
                <div style={{ width: COL_2, padding: '0 6px' }}>
                  <div className="gantt-screen-only">
                    <input
                      type="date"
                      value={task.endDate}
                      onChange={e => handleUpdateField(task.id, 'endDate', e.target.value)}
                      style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '0.78rem', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}
                    />
                  </div>
                  <div className="gantt-print-only" style={{ fontSize: '0.78rem', color: '#1e293b', textAlign: 'center' }}>
                    {formatDateToDisplay(task.endDate)}
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
          className="gantt-chart-pane"
          style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', position: 'relative', userSelect: 'none' }}
        >
          <div style={{ minWidth: `${cols.length * CW + 60}px` }}>
            {/* Timeline header */}
            <div style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-secondary)', borderBottom: '2px solid var(--border-color)', height: `${ROW_H}px`, display: 'flex', alignItems: 'center' }}>
              <button
                className="gantt-pan-btn no-print"
                onClick={() => setPanOffset(v => v - (viewMode === 'day' ? 7 : viewMode === 'week' ? 28 : 60))}
                style={{ position: 'sticky', left: 0, zIndex: 11, background: 'var(--bg-secondary)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 6px', height: '100%', boxShadow: '2px 0 4px rgba(0,0,0,0.05)' }}
              ><ChevronLeft size={18}/></button>
              
              <div style={{ flex: 1, display: 'flex' }}>
                {cols.map((d, i) => {
                  const isToday = d.getTime() === today.getTime() && viewMode === 'day';
                  const isBlocked = viewMode === 'day' && blockedDays.includes(d.getDay());
                  const isWeekend = viewMode === 'day' && (d.getDay() === 0 || d.getDay() === 6);
                  return (
                    <div
                      key={i}
                      style={{
                        width: `${CW}px`, flexShrink: 0, textAlign: 'center',
                        fontSize: '0.7rem', fontWeight: isToday ? 700 : isBlocked ? 600 : 500,
                        color: isToday ? 'var(--accent-primary)' : isBlocked ? '#475569' : 'var(--text-muted)',
                        backgroundColor: isBlocked ? '#e2e8f0' : isWeekend ? '#f1f5f9' : 'transparent',
                        borderLeft: i > 0 ? '1px solid var(--border-color)' : 'none',
                        padding: '4px 2px', lineHeight: 1.3
                      }}
                      title={isBlocked ? 'Día no laborable (no considerado)' : undefined}
                    >
                      {colLabel(d, viewMode)}
                      {isToday && <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'var(--accent-primary)', margin: '2px auto 0' }}/>}
                    </div>
                  );
                })}
              </div>

              <button
                className="gantt-pan-btn no-print"
                onClick={() => setPanOffset(v => v + (viewMode === 'day' ? 7 : viewMode === 'week' ? 28 : 60))}
                style={{ position: 'sticky', right: 0, zIndex: 11, background: 'var(--bg-secondary)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 6px', height: '100%', boxShadow: '-2px 0 4px rgba(0,0,0,0.05)' }}
              ><ChevronRight size={18}/></button>
            </div>

            {/* Chart body */}
            <div className="gantt-chart-body" style={{ position: 'relative', marginLeft: '30px' }}>
            {tasks.map((task) => {
              const startPx = dateToPx(task.startDate);
              const endPx = dateToPx(task.endDate) + CW;
              const barW = Math.max(endPx - startPx, CW);

              return (
                <div key={task.id} style={{ position: 'relative', height: `${ROW_H}px`, borderBottom: '1px solid var(--border-color)', backgroundColor: 'transparent' }}>
                  {/* Grid lines */}
                  {cols.map((d, i) => {
                    const isBlocked = viewMode === 'day' && blockedDays.includes(d.getDay());
                    const isWeekend = viewMode === 'day' && (d.getDay() === 0 || d.getDay() === 6);
                    return (
                      <div key={i} style={{
                        position: 'absolute', left: `${i*CW}px`, top: 0, bottom: 0, width: `${CW}px`,
                        borderLeft: i>0 ? '1px solid var(--border-color)' : 'none',
                        backgroundColor: isBlocked ? '#e2e8f0' : isWeekend ? '#f8fafc' : 'transparent',
                        pointerEvents: 'none'
                      }}/>
                    );
                  })}

                  {/* Today marker */}
                  {viewMode === 'day' && (() => {
                    const todayPx = dateToPx(fmt(today));
                    return <div style={{ position: 'absolute', left: `${todayPx}px`, top: 0, bottom: 0, width: '2px', backgroundColor: 'rgba(102,45,145,0.3)', zIndex: 2 }}/>;
                  })()}

                  {/* Bar */}
                  <div
                    className="gantt-task-bar"
                    title={task.name}
                    style={{
                      position: 'absolute',
                      left: `${startPx}px`,
                      width: `${barW}px`,
                      top: '8px', height: `${ROW_H - 16}px`,
                      borderRadius: '6px',
                      backgroundColor: task.color,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                      cursor: 'grab',
                      display: 'flex', alignItems: 'center',
                      overflow: 'hidden', zIndex: 3
                    }}
                    onMouseDown={e => handleMouseDown(e, task.id, 'move')}
                  >
                    {/* Left resize handle */}
                    <div
                      className="gantt-resize-handle no-print"
                      style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '8px', cursor: 'ew-resize', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '6px 0 0 6px' }}
                      onMouseDown={e => { e.stopPropagation(); handleMouseDown(e, task.id, 'start'); }}
                    />
                    {/* Label removed as requested by user - solid clean bar */}
                    {/* Right resize handle */}
                    <div
                      className="gantt-resize-handle no-print"
                      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '8px', cursor: 'ew-resize', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '0 6px 6px 0' }}
                      onMouseDown={e => { e.stopPropagation(); handleMouseDown(e, task.id, 'end'); }}
                    />
                  </div>


                </div>
              );
            })}

            {/* Franjas grises no laborables PINTADAS SOBRE TODO EL GRÁFICO (barras incluidas) */}
            {viewMode === 'day' && blockedDays.length > 0 && cols.map((d, i) => {
              const isBlocked = blockedDays.includes(d.getDay());
              if (!isBlocked) return null;
              return (
                <div
                  key={`builder-full-blocked-${i}`}
                  className="gantt-blocked-overlay"
                  style={{
                    position: 'absolute',
                    left: `${i * CW}px`,
                    top: 0,
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

      {/* ── PRINT FOOTER ── */}
      <div className="gantt-print-footer">
        <div>
          <strong>Purple BTL S.A.C.</strong> · Sistema Integrado de Gestión · Documento Confidencial
        </div>
        <div>
          Generado el {new Date().toLocaleDateString('es-PE')} · Versión {currentGantt?.version || 1}
        </div>
      </div>
    </div>
  );
};
