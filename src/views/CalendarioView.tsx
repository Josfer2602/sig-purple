import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import {
  Calendar, Video, Clock, Users, ExternalLink, RefreshCw,
  Plus, X, MapPin, LogOut, Search, CheckCircle2,
  CalendarDays, Sparkles, Trash2, Copy, FileText,
  Upload, MessageSquare
} from 'lucide-react';
import { API_URL } from '../utils/apiUrl';
import { useGlobalContext } from '../context/GlobalContext';
import { useSmartMeeting } from '../context/SmartMeetingContext';
import { SmartBriefDrawer } from '../components/SmartBriefDrawer';
import toast from 'react-hot-toast';

export interface CalendarEventItem {
  id: string;
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
  meetLink: string;
  htmlLink: string;
  status: string;
  attendees: { email: string; name?: string; responseStatus?: string }[];
  creator?: { email?: string; displayName?: string };
}

interface CalendarStatus {
  connected: boolean;
  email?: string;
  name?: string;
  connectedAt?: string;
}

export const CalendarioView: React.FC = () => {
  const { token, currentUser } = useGlobalContext();
  const { startMeeting, loadExistingMeeting, createBriefFromSource, isImportingSource } = useSmartMeeting();
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'today' | 'tomorrow' | 'week' | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'meet' | 'inPerson'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal: Crear Brief 2.0 desde Correo / WhatsApp / Archivo
  const [showFromSourceModal, setShowFromSourceModal] = useState(false);
  const [sourceMode, setSourceMode] = useState<'text' | 'file'>('text');
  const [sourceTitulo, setSourceTitulo] = useState('');
  const [sourceLabel, setSourceLabel] = useState('Correo / WhatsApp de Cliente');
  const [sourceText, setSourceText] = useState('');
  const [sourceFile, setSourceFile] = useState<File | null>(null);

  // Tab & Historial de Briefs IA
  const [mainTab, setMainTab] = useState<'briefs' | 'calendar'>('calendar');
  const [savedMeetings, setSavedMeetings] = useState<any[]>([]);
  const [loadingBriefs, setLoadingBriefs] = useState<boolean>(false);
  const [briefSearchTerm, setBriefSearchTerm] = useState<string>('');
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerMeetingId, setDrawerMeetingId] = useState<string>('');

  const handleOpenSmartMeeting = (event?: CalendarEventItem) => {
    if (event) {
      startMeeting({
        title: event.title,
        meetLink: event.meetLink,
        attendees: event.attendees?.map(a => a.name || a.email)
      });
    } else {
      startMeeting({
        title: 'Reunión de Briefing & Estrategia'
      });
    }
  };

  const handleCreateBriefFromSourceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sourceMode === 'text' && !sourceText.trim()) {
      toast.error('Pega el correo, WhatsApp o notas del proyecto antes de generar.');
      return;
    }
    if (sourceMode === 'file' && !sourceFile) {
      toast.error('Selecciona un archivo PDF, imagen, Word (.docx), PPTX o audio.');
      return;
    }
    const ok = await createBriefFromSource({
      titulo: sourceTitulo.trim() || undefined,
      text: sourceMode === 'text' ? sourceText.trim() : undefined,
      file: sourceMode === 'file' && sourceFile ? sourceFile : undefined,
      sourceLabel: sourceLabel.trim() || (sourceFile ? sourceFile.name : 'Texto / Correo')
    });
    if (ok) {
      setShowFromSourceModal(false);
      setSourceTitulo('');
      setSourceText('');
      setSourceFile(null);
      loadSavedBriefs();
    }
  };

  // New Event Form State
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    startTime: '10:00',
    endTime: '11:00',
    attendees: '',
    location: '',
    addMeet: true
  });

  const getAuthHeaders = () => ({
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  });

  // Load status and events
  const loadCalendarData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const emailQuery = currentUser?.email ? `?userEmail=${encodeURIComponent(currentUser.email)}` : '';
      const statusRes = await fetch(`${API_URL}/calendar/status${emailQuery}`, {
        headers: getAuthHeaders()
      });
      if (!statusRes.ok) throw new Error('Error al consultar estado de Google Calendar');
      const statusData: CalendarStatus = await statusRes.json();
      setStatus(statusData);

      if (statusData.connected) {
        const eventsRes = await fetch(`${API_URL}/calendar/events${emailQuery}`, {
          headers: getAuthHeaders()
        });
        if (eventsRes.ok) {
          const eventsData = await eventsRes.json();
          setEvents(eventsData.events || []);
        }
      } else {
        setEvents([]);
      }
    } catch (err: any) {
      console.error('Error fetching calendar:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadSavedBriefs = async () => {
    setLoadingBriefs(true);
    try {
      const res = await fetch(`${API_URL}/reuniones-ai`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setSavedMeetings(data || []);
      }
    } catch (err) {
      console.error('Error al cargar historial de reuniones:', err);
    } finally {
      setLoadingBriefs(false);
    }
  };

  const handleDeleteMeeting = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('¿Estás seguro de eliminar este registro de reunión y brief?')) return;
    try {
      const res = await fetch(`${API_URL}/reuniones-ai/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        toast.success('Sesión eliminada');
        setSavedMeetings(prev => prev.filter(m => m.id !== id));
      } else {
        toast.error('No se pudo eliminar la sesión');
      }
    } catch (err) {
      toast.error('Error al comunicarse con el servidor');
    }
  };

  useEffect(() => {
    loadCalendarData();
    loadSavedBriefs();
  }, [currentUser?.email, token]);

  // Connect via Google OAuth
  const handleConnect = async () => {
    try {
      const origin = window.location.origin;
      const emailParam = currentUser?.email ? `&userEmail=${encodeURIComponent(currentUser.email)}` : '';
      const res = await fetch(`${API_URL}/calendar/auth-url?frontendUrl=${encodeURIComponent(origin)}${emailParam}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error('No se pudo generar el enlace de autorización');
      }
    } catch (err) {
      toast.error('Error conectando con el servidor');
    }
  };

  // Disconnect Google Calendar
  const handleDisconnect = async () => {
    if (!window.confirm('¿Estás seguro de desvincular Google Calendar de SIG Purple?')) return;
    try {
      const res = await fetch(`${API_URL}/calendar/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ userEmail: currentUser?.email })
      });
      if (res.ok) {
        toast.success('Google Calendar desvinculado.');
        setStatus({ connected: false });
        setEvents([]);
      }
    } catch (e) {
      toast.error('Error al desvincular');
    }
  };

  // Create Meeting
  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvent.title || !newEvent.date || !newEvent.startTime || !newEvent.endTime) {
      toast.error('Completa los campos obligatorios');
      return;
    }

    setIsSubmitting(true);
    try {
      const startIso = new Date(`${newEvent.date}T${newEvent.startTime}:00`).toISOString();
      const endIso = new Date(`${newEvent.date}T${newEvent.endTime}:00`).toISOString();
      const attendeesList = newEvent.attendees
        ? newEvent.attendees.split(',').map(s => s.trim()).filter(s => s.includes('@'))
        : [];

      const res = await fetch(`${API_URL}/calendar/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          title: newEvent.title,
          description: newEvent.description,
          start: startIso,
          end: endIso,
          attendees: attendeesList,
          addMeet: newEvent.addMeet,
          userEmail: currentUser?.email
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al agendar reunión');
      }

      toast.success('¡Reunión agendada exitosamente!');
      setShowCreateModal(false);
      setNewEvent({
        title: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        startTime: '10:00',
        endTime: '11:00',
        attendees: '',
        location: '',
        addMeet: true
      });
      loadCalendarData(true);
    } catch (err: any) {
      toast.error(err.message || 'Error al crear la reunión');
    } finally {
      setIsSubmitting(false);
    }
  };

  // KPI Metrics
  const metrics = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const next7Days = new Date(Date.now() + 7 * 24 * 3600 * 1000);

    const todayCount = events.filter(e => e.start && e.start.startsWith(todayStr)).length;
    const tomorrowCount = events.filter(e => e.start && e.start.startsWith(tomorrowStr)).length;
    const weekCount = events.filter(e => {
      if (!e.start) return false;
      const d = new Date(e.start);
      return d >= new Date(todayStr) && d <= next7Days;
    }).length;
    const meetCount = events.filter(e => Boolean(e.meetLink)).length;

    return { todayCount, tomorrowCount, weekCount, meetCount, total: events.length };
  }, [events]);

  // Filtered Events
  const filteredEvents = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const tomorrow = new Date();
    tomorrow.setDate(now.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const next7Days = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

    return events.filter(e => {
      if (!e.start) return false;
      const eventDate = new Date(e.start);
      const eventDateStr = eventDate.toISOString().split('T')[0];

      // Date filter
      if (dateFilter === 'today' && eventDateStr !== todayStr) return false;
      if (dateFilter === 'tomorrow' && eventDateStr !== tomorrowStr) return false;
      if (dateFilter === 'week' && (eventDate < new Date(todayStr) || eventDate > next7Days)) return false;

      // Type filter
      if (typeFilter === 'meet' && !e.meetLink) return false;
      if (typeFilter === 'inPerson' && e.meetLink) return false;

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchTitle = (e.title || '').toLowerCase().includes(term);
        const matchDesc = (e.description || '').toLowerCase().includes(term);
        const matchLoc = (e.location || '').toLowerCase().includes(term);
        const matchAtt = (e.attendees || []).some(a => (a.email || '').toLowerCase().includes(term) || (a.name || '').toLowerCase().includes(term));
        if (!matchTitle && !matchDesc && !matchLoc && !matchAtt) return false;
      }

      return true;
    });
  }, [events, dateFilter, typeFilter, searchTerm]);

  // Group events by date for chronological layout
  const groupedEvents = useMemo(() => {
    const groups: { [dateKey: string]: CalendarEventItem[] } = {};

    filteredEvents.forEach(event => {
      const dateKey = event.start ? event.start.split('T')[0] : 'Sin fecha';
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(event);
    });

    return groups;
  }, [filteredEvents]);

  // Helpers
  const formatGroupHeader = (dateStr: string) => {
    if (!dateStr || dateStr === 'Sin fecha') return 'Sin fecha programada';
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();

    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const isTomorrow = date.toDateString() === tomorrow.toDateString();

    const formatted = date.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const capitalized = formatted.charAt(0).toUpperCase() + formatted.slice(1);

    if (isToday) return `Hoy — ${capitalized}`;
    if (isTomorrow) return `Mañana — ${capitalized}`;
    return capitalized;
  };

  const formatEventTime = (event: CalendarEventItem) => {
    if (event.allDay) return 'Todo el día';
    if (!event.start) return '';
    const start = new Date(event.start);
    const end = event.end ? new Date(event.end) : null;

    const startFormatted = start.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
    if (!end) return startFormatted;
    const endFormatted = end.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${startFormatted} - ${endFormatted}`;
  };

  const isEventNow = (event: CalendarEventItem) => {
    if (event.allDay || !event.start || !event.end) return false;
    const now = new Date();
    const start = new Date(event.start);
    const end = new Date(event.end);
    return now >= start && now <= end;
  };

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '60px' }}>
      {/* 1. Header de Vista Purple BTL */}
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
        <div>
          {status?.connected ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                fontSize: '12px',
                fontWeight: 600,
                color: '#059669'
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
              <span>Google Calendar: {status.email || 'Conectado'}</span>
            </div>
          ) : (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Reuniones & Enlaces Meet
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            className="btn-primary"
            onClick={() => handleOpenSmartMeeting()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
              border: 'none',
              boxShadow: '0 2px 10px rgba(139, 92, 246, 0.3)',
              color: '#ffffff',
              fontWeight: 700
            }}
          >
            <Sparkles size={16} />
            <span>Smart Brief IA (En Vivo)</span>
          </button>

          {status?.connected && (
            <button
              className="btn-secondary"
              onClick={() => loadCalendarData(true)}
              disabled={refreshing}
              title="Sincronizar reuniones"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
              <span>Sincronizar</span>
            </button>
          )}

          {status?.connected && (
            <button
              className="btn-primary"
              onClick={() => setShowCreateModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={16} />
              <span>Agendar Reunión</span>
            </button>
          )}

          {status?.connected && (
            <button
              className="btn-clear-filters"
              onClick={handleDisconnect}
              title="Desvincular cuenta de Google"
              style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
            >
              <LogOut size={14} />
              <span>Desvincular</span>
            </button>
          )}
        </div>
      </div>

      {/* SELECTOR DE MÓDULO: SMART BRIEFS IA vs GOOGLE CALENDAR */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px', borderBottom: '1px solid var(--border-color, #e2e8f0)', paddingBottom: '10px' }}>
        <button
          type="button"
          onClick={() => setMainTab('briefs')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 18px',
            borderRadius: '10px',
            border: 'none',
            background: mainTab === 'briefs' ? 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)' : 'rgba(139, 92, 246, 0.08)',
            color: mainTab === 'briefs' ? '#ffffff' : '#6d28d9',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
            boxShadow: mainTab === 'briefs' ? '0 4px 12px rgba(139, 92, 246, 0.3)' : 'none',
            transition: 'all 0.2s'
          }}
        >
          <Sparkles size={16} />
          <span>Historial de Briefs & Sesiones IA</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '10px',
              background: mainTab === 'briefs' ? 'rgba(255,255,255,0.25)' : 'rgba(139, 92, 246, 0.15)',
              color: mainTab === 'briefs' ? '#ffffff' : '#7c3aed',
              fontWeight: 800
            }}
          >
            {savedMeetings.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('calendar')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 18px',
            borderRadius: '10px',
            border: 'none',
            background: mainTab === 'calendar' ? 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)' : 'rgba(100, 116, 139, 0.08)',
            color: mainTab === 'calendar' ? '#ffffff' : 'var(--text-secondary, #475569)',
            fontWeight: mainTab === 'calendar' ? 700 : 500,
            fontSize: '13px',
            cursor: 'pointer',
            boxShadow: mainTab === 'calendar' ? '0 4px 12px rgba(139, 92, 246, 0.3)' : 'none',
            transition: 'all 0.2s'
          }}
        >
          <CalendarDays size={16} />
          <span>Google Calendar</span>
        </button>
      </div>

      {/* SECCIÓN DE HISTORIAL DE BRIEFS IA */}
      {mainTab === 'briefs' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* BARRA DE HERRAMIENTAS Y BÚSQUEDA */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '280px', maxWidth: '480px' }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '11px', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Buscar por título, cliente o notas de la reunión..."
                value={briefSearchTerm}
                onChange={(e) => setBriefSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 36px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  background: 'var(--card-bg, #ffffff)',
                  fontSize: '13px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className="btn-secondary"
                onClick={loadSavedBriefs}
                disabled={loadingBriefs}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '8px 14px' }}
              >
                <RefreshCw size={14} className={loadingBriefs ? 'animate-spin' : ''} />
                <span>Actualizar</span>
              </button>
              <button
                className="btn-secondary"
                onClick={() => setShowFromSourceModal(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: 700,
                  padding: '8px 14px',
                  borderColor: 'rgba(139, 92, 246, 0.45)',
                  color: '#7c3aed',
                  background: 'rgba(139, 92, 246, 0.06)'
                }}
              >
                <Upload size={14} />
                <span>Crear desde Correo / Archivo</span>
              </button>
              <button
                className="btn-primary"
                onClick={() => handleOpenSmartMeeting()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                  boxShadow: '0 2px 10px rgba(139, 92, 246, 0.3)',
                  fontSize: '13px',
                  fontWeight: 700,
                  padding: '8px 16px'
                }}
              >
                <Plus size={15} />
                <span>Nueva Sesión Smart Brief</span>
              </button>
            </div>
          </div>

          {/* LISTA DE TARJETAS DE BRIEFS */}
          {loadingBriefs && savedMeetings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
              <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px auto' }} />
              <p style={{ margin: 0, fontWeight: 600 }}>Cargando sesiones registradas...</p>
            </div>
          ) : savedMeetings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--card-bg, #ffffff)', borderRadius: '16px', border: '1px solid var(--border-color, #e2e8f0)' }}>
              <Sparkles size={36} color="#8b5cf6" style={{ opacity: 0.5, margin: '0 auto 12px auto' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
                No hay sesiones de Smart Brief registradas aún
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 18px auto' }}>
                Inicia una sesión en vivo durante una videollamada para que el agente tome notas, detecte vacíos de información y redacte el brief automáticamente.
              </p>
              <button
                className="btn-primary"
                onClick={() => handleOpenSmartMeeting()}
                style={{ padding: '9px 18px', background: '#8b5cf6', color: '#fff', fontWeight: 700, borderRadius: '10px' }}
              >
                Iniciar Primera Sesión
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
              {savedMeetings
                .filter((m) => {
                  if (!briefSearchTerm.trim()) return true;
                  const term = briefSearchTerm.toLowerCase();
                  return (
                    (m.titulo || '').toLowerCase().includes(term) ||
                    (m.transcripcion || '').toLowerCase().includes(term) ||
                    (m.tipoServicio || '').toLowerCase().includes(term) ||
                    (m.tipoProyecto || '').toLowerCase().includes(term) ||
                    (m.briefJson || '').toLowerCase().includes(term)
                  );
                })
                .map((m) => {
                  let briefData: any = {};
                  let deliverableData: any = null;
                  try { if (m.briefJson) briefData = JSON.parse(m.briefJson); } catch (e) {}
                  try { if (m.entregableJson) deliverableData = JSON.parse(m.entregableJson); } catch (e) {}

                  const pct = briefData.completitudPorcentaje || 0;
                  const dateStr = new Date(m.createdAt).toLocaleDateString('es-PE', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });

                  return (
                    <div
                      key={m.id}
                      style={{
                        background: 'var(--card-bg, #ffffff)',
                        border: '1.5px solid rgba(139, 92, 246, 0.25)',
                        borderRadius: '16px',
                        padding: '18px',
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '14px',
                        transition: 'transform 0.15s, box-shadow 0.15s'
                      }}
                    >
                      <div>
                        {/* HEADER DE LA CARD */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                            {dateStr}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 800,
                                padding: '2px 7px',
                                borderRadius: '6px',
                                background: m.estado === 'FINALIZADO' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(139, 92, 246, 0.12)',
                                color: m.estado === 'FINALIZADO' ? '#059669' : '#7c3aed'
                              }}
                            >
                              {m.estado === 'FINALIZADO' ? 'FINALIZADO' : 'EN PROCESO'}
                            </span>
                            <button
                              onClick={(e) => handleDeleteMeeting(m.id, e)}
                              title="Eliminar sesión"
                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', padding: '2px' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* TÍTULO */}
                        <h4 style={{ fontSize: '15px', fontWeight: 800, margin: '0 0 6px 0', color: 'var(--text-primary)', lineHeight: '1.3' }}>
                          {m.titulo}
                        </h4>

                        {/* BADGES */}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: '#f1f5f9', color: '#475569' }}>
                            {m.tipoServicio || 'PURPLE STRATEGY & CREATIVITY'}
                          </span>
                          {m.tipoProyecto && (
                            <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: '#faf5ff', color: '#7c3aed' }}>
                              {m.tipoProyecto}
                            </span>
                          )}
                          {briefData?.locaciones?.ciudad && (
                            <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: '#ecfeff', color: '#0e7490', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <MapPin size={10} />
                              {briefData.locaciones.ciudad}
                            </span>
                          )}
                          {Array.isArray(briefData?.requerimientosCuantificados) && briefData.requerimientosCuantificados.length > 0 && (
                            <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: '#ecfdf5', color: '#047857' }}>
                              {briefData.requerimientosCuantificados.length} ítems cotizables
                            </span>
                          )}
                        </div>

                        {/* COMPLETITUD PROGRESS BAR */}
                        <div style={{ marginBottom: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                            <span>Completitud Brief</span>
                            <strong style={{ color: pct >= 80 ? '#059669' : '#7c3aed' }}>{pct}%</strong>
                          </div>
                          <div style={{ height: '6px', borderRadius: '4px', background: '#e2e8f0', overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                width: `${pct}%`,
                                background: pct >= 80 ? 'linear-gradient(90deg, #8b5cf6, #10b981)' : '#8b5cf6'
                              }}
                            />
                          </div>
                        </div>

                        {/* BIG IDEA / ENTREGABLES PREVIEW */}
                        {deliverableData?.propuestaCreativa?.bigIdea && (
                          <div style={{ padding: '8px 10px', background: 'rgba(139, 92, 246, 0.06)', borderRadius: '8px', borderLeft: '3px solid #8b5cf6', marginBottom: '10px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>Big Idea</span>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e1b4b', marginTop: '2px' }}>
                              "{deliverableData.propuestaCreativa.bigIdea}"
                            </div>
                          </div>
                        )}

                        {/* EXTRACTO TRANSCRIPCIÓN */}
                        {m.transcripcion && (
                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary, #64748b)', fontStyle: 'italic', lineHeight: '1.4', maxHeight: '42px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            "{m.transcripcion.substring(0, 140)}..."
                          </div>
                        )}
                      </div>

                      {/* BOTONES DE ACCIÓN */}
                      <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                        <button
                          onClick={() => loadExistingMeeting(m.id)}
                          style={{
                            flex: 1,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: 'none',
                            background: '#8b5cf6',
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(139, 92, 246, 0.25)'
                          }}
                        >
                          <Sparkles size={14} />
                          <span>Abrir Asistente</span>
                        </button>

                        <button
                          onClick={() => {
                            setDrawerMeetingId(m.id);
                            setIsDrawerOpen(true);
                          }}
                          title="Ver Ficha y Desglose Rápido"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            background: '#f8fafc',
                            color: '#475569',
                            fontWeight: 600,
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          <FileText size={14} />
                          <span>Ficha</span>
                        </button>

                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(m.transcripcion || '');
                            toast.success('Transcripción copiada');
                          }}
                          title="Copiar transcripción de audio"
                          style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            color: '#475569',
                            cursor: 'pointer'
                          }}
                        >
                          <Copy size={14} />
                        </button>
                      </div>

                    </div>
                  );
                })}
            </div>
          )}

        </div>
      )}

      {/* SECCIÓN GOOGLE CALENDAR */}
      {mainTab === 'calendar' && (
        <div className="animate-fade-in">

      {/* 2. SI NO ESTÁ CONECTADO: Pantalla de Bienvenida y Conexión en formato Purple BTL */}
      {!status?.connected && !loading && (
        <div
          className="glass-panel"
          style={{
            background: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            boxShadow: '0 10px 30px rgba(124, 58, 237, 0.06)',
            padding: '48px 32px',
            textAlign: 'center',
            maxWidth: '720px',
            margin: '30px auto'
          }}
        >
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '24px',
              background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
              margin: '0 auto 24px auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 12px 24px rgba(124, 58, 237, 0.25)'
            }}
          >
            <Calendar size={40} color="#ffffff" />
          </div>

          <h3 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
            Conecta tu Google Calendar
          </h3>

          <p style={{ fontSize: '15px', color: 'var(--text-muted)', lineHeight: '1.6', maxWidth: '560px', margin: '0 auto 32px auto' }}>
            Vincula tu cuenta corporativa de Google Workspace (<strong style={{ color: 'var(--accent-primary)' }}>@purplebtl.com</strong>) o Gmail para visualizar tu agenda de reuniones, participantes y acceder a videollamadas con Google Meet en 1 clic.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '36px', textAlign: 'left' }}>
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-primary)', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>
                <CheckCircle2 size={16} /> Sincronización Real
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                Visualiza cambios y citas agendadas al instante.
              </p>
            </div>

            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#059669', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>
                <Video size={16} /> Google Meet Directo
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                Únete a videollamadas con un botón verde visible.
              </p>
            </div>

            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#3b82f6', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>
                <Users size={16} /> Asistentes & Sala
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                Consulta participantes y salas confirmadas.
              </p>
            </div>
          </div>

          <button
            className="btn-primary"
            onClick={handleConnect}
            style={{
              padding: '14px 32px',
              fontSize: '15px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '12px',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 8px 20px rgba(124, 58, 237, 0.35)'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
            </svg>
            <span>Conectar con Google Calendar</span>
          </button>
        </div>
      )}

      {/* 3. SI ESTÁ CONECTADO: Panel Completo de Calendario Purple BTL */}
      {status?.connected && (
        <>
          {/* KPI Cards Superiores */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>

            {/* Card 1: Hoy */}
            <div
              className="glass-panel"
              style={{
                background: '#ffffff',
                padding: '20px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Reuniones Hoy</span>
                <div style={{ background: 'rgba(124, 58, 237, 0.1)', padding: '8px', borderRadius: '10px' }}>
                  <Calendar size={18} style={{ color: 'var(--accent-primary)' }} />
                </div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)' }}>
                {metrics.todayCount}
              </div>
              <span style={{ fontSize: '12px', color: metrics.todayCount > 0 ? '#059669' : 'var(--text-muted)', fontWeight: 500 }}>
                {metrics.todayCount > 0 ? 'Reuniones programadas para hoy' : 'Sin reuniones agendadas hoy'}
              </span>
            </div>

            {/* Card 2: Próximos 7 días */}
            <div
              className="glass-panel"
              style={{
                background: '#ffffff',
                padding: '20px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Esta Semana</span>
                <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '8px', borderRadius: '10px' }}>
                  <CalendarDays size={18} style={{ color: '#3b82f6' }} />
                </div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)' }}>
                {metrics.weekCount}
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
                Próximos 7 días
              </span>
            </div>

            {/* Card 3: Google Meet */}
            <div
              className="glass-panel"
              style={{
                background: '#ffffff',
                padding: '20px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Con Google Meet</span>
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '8px', borderRadius: '10px' }}>
                  <Video size={18} style={{ color: '#059669' }} />
                </div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#059669' }}>
                {metrics.meetCount}
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
                Videollamadas con sala activa
              </span>
            </div>

            {/* Card 4: Total & Cuenta */}
            <div
              className="glass-panel"
              style={{
                background: '#ffffff',
                padding: '20px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Total Sincronizadas</span>
                <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '8px', borderRadius: '10px' }}>
                  <Clock size={18} style={{ color: '#d97706' }} />
                </div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)' }}>
                {metrics.total}
              </div>
              <span style={{ fontSize: '12px', color: '#059669', fontWeight: 600 }}>
                ● Sincronizado con Google
              </span>
            </div>

          </div>

          {/* Unified Filters Panel (Mismo formato de Purple BTL) */}
          <div className="unified-filter-panel" style={{ marginBottom: '24px' }}>

            {/* Búsqueda Rápida */}
            <div className="unified-filter-group search-group" style={{ flex: '2 1 300px' }}>
              <label className="unified-filter-label">Buscar Reunión</label>
              <div className="unified-search-wrapper">
                <Search size={16} className="unified-search-icon" />
                <input
                  type="text"
                  placeholder="Buscar por título, participante o notas..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="unified-search-input"
                />
              </div>
            </div>

            {/* Filtro Período */}
            <div className="unified-filter-group" style={{ minWidth: '160px', flex: '1 1 160px' }}>
              <label className="unified-filter-label">Período</label>
              <select
                className="unified-select"
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value as any)}
              >
                <option value="all">Todas ({metrics.total})</option>
                <option value="today">Solo Hoy ({metrics.todayCount})</option>
                <option value="tomorrow">Mañana ({metrics.tomorrowCount})</option>
                <option value="week">Próximos 7 días ({metrics.weekCount})</option>
              </select>
            </div>

            {/* Filtro Tipo */}
            <div className="unified-filter-group" style={{ minWidth: '180px', flex: '1 1 180px' }}>
              <label className="unified-filter-label">Tipo de Reunión</label>
              <select
                className="unified-select"
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value as any)}
              >
                <option value="all">Todas las reuniones</option>
                <option value="meet">📹 Con Google Meet ({metrics.meetCount})</option>
                <option value="inPerson">🏢 Presencial / Sin enlace</option>
              </select>
            </div>

            {/* Botón Limpiar */}
            {(searchTerm || dateFilter !== 'all' || typeFilter !== 'all') && (
              <button
                type="button"
                className="btn-clear-filters"
                onClick={() => {
                  setSearchTerm('');
                  setDateFilter('all');
                  setTypeFilter('all');
                }}
                title="Limpiar filtros"
                style={{ marginBottom: 0 }}
              >
                <X size={14} />
                <span>Limpiar</span>
              </button>
            )}
          </div>

          {/* Listado Cronológico de Reuniones */}
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <RefreshCw className="animate-spin" size={24} style={{ color: 'var(--accent-primary)', marginBottom: '8px' }} />
              <p>Cargando reuniones de Google Calendar...</p>
            </div>
          ) : Object.keys(groupedEvents).length === 0 ? (
            <div
              className="glass-panel"
              style={{
                padding: '48px 24px',
                textAlign: 'center',
                background: '#ffffff',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-color)'
              }}
            >
              <Calendar size={48} style={{ color: '#94a3b8', margin: '0 auto 12px auto' }} />
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                No se encontraron reuniones
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                {searchTerm || dateFilter !== 'all' || typeFilter !== 'all'
                  ? 'No hay reuniones que coincidan con los filtros seleccionados.'
                  : 'No tienes reuniones programadas en Google Calendar.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
              {Object.entries(groupedEvents).map(([dateKey, dayEvents]) => (
                <div key={dateKey}>
                  {/* Encabezado del Día */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                    <span
                      style={{
                        background: dateKey === new Date().toISOString().split('T')[0] ? 'var(--accent-primary)' : '#e2e8f0',
                        color: dateKey === new Date().toISOString().split('T')[0] ? '#ffffff' : '#334155',
                        fontSize: '13px',
                        fontWeight: 700,
                        padding: '4px 14px',
                        borderRadius: '20px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Calendar size={14} />
                      {formatGroupHeader(dateKey)}
                    </span>
                    <div style={{ height: '1px', flex: 1, background: '#e2e8f0' }} />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
                      {dayEvents.length} {dayEvents.length === 1 ? 'reunión' : 'reuniones'}
                    </span>
                  </div>

                  {/* Grid de Tarjetas del Día */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
                    {dayEvents.map(event => {
                      const isNow = isEventNow(event);
                      return (
                        <div
                          key={event.id}
                          className="glass-panel"
                          style={{
                            background: '#ffffff',
                            borderRadius: 'var(--radius-md)',
                            border: isNow ? '2px solid #10b981' : '1px solid #e2e8f0',
                            padding: '20px',
                            boxShadow: isNow ? '0 8px 24px rgba(16, 185, 129, 0.15)' : '0 2px 8px rgba(0, 0, 0, 0.03)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            transition: 'all 0.2s ease',
                            position: 'relative'
                          }}
                        >
                          {/* Barra superior de horario y estado */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: isNow ? 'rgba(16, 185, 129, 0.1)' : 'rgba(124, 58, 237, 0.08)',
                                color: isNow ? '#059669' : 'var(--accent-primary)',
                                fontSize: '12px',
                                fontWeight: 700,
                                padding: '4px 10px',
                                borderRadius: '8px'
                              }}
                            >
                              <Clock size={13} />
                              {formatEventTime(event)}
                            </span>

                            {isNow && (
                              <span
                                style={{
                                  background: '#10b981',
                                  color: '#ffffff',
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  boxShadow: '0 0 10px rgba(16, 185, 129, 0.4)'
                                }}
                              >
                                ● EN CURSO
                              </span>
                            )}
                          </div>

                          {/* Título de la reunión */}
                          <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: '1.35' }}>
                            {event.title}
                          </h4>

                          {/* Descripción / Notas si hay */}
                          {event.description && (
                            <p style={{
                              margin: 0,
                              fontSize: '13px',
                              color: 'var(--text-muted)',
                              lineHeight: '1.4',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden'
                            }}>
                              {event.description}
                            </p>
                          )}

                          {/* Ubicación si hay */}
                          {event.location && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                              <MapPin size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.location}</span>
                            </div>
                          )}

                          {/* Participantes */}
                          {event.attendees && event.attendees.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                              <Users size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                {event.attendees.slice(0, 3).map(a => a.name || a.email.split('@')[0]).join(', ')}
                                {event.attendees.length > 3 ? ` +${event.attendees.length - 3} más` : ''}
                              </span>
                            </div>
                          )}

                          {/* Botones de acción inferiores */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              {event.meetLink ? (
                                <a
                                  href={event.meetLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                                    color: '#ffffff',
                                    padding: '7px 12px',
                                    borderRadius: '8px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    textDecoration: 'none',
                                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)'
                                  }}
                                >
                                  <Video size={14} />
                                  <span>Meet</span>
                                </a>
                              ) : null}

                              <button
                                type="button"
                                onClick={() => handleOpenSmartMeeting(event)}
                                title="Iniciar toma de notas y smart brief con IA para esta reunión"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(99, 102, 241, 0.12) 100%)',
                                  border: '1px solid rgba(139, 92, 246, 0.3)',
                                  color: '#7c3aed',
                                  padding: '7px 12px',
                                  borderRadius: '8px',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                <Sparkles size={14} color="#8b5cf6" />
                                <span>Smart Brief IA</span>
                              </button>
                            </div>

                            {event.htmlLink && (
                              <a
                                href={event.htmlLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Ver en Google Calendar"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  color: 'var(--text-muted)',
                                  fontSize: '12px',
                                  textDecoration: 'none',
                                  padding: '6px 10px',
                                  borderRadius: '6px',
                                  border: '1px solid #e2e8f0',
                                  background: '#f8fafc'
                                }}
                              >
                                <span>Calendar</span>
                                <ExternalLink size={13} />
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
        </div>
      )}

      {/* DRAWER CONSULTA DE BRIEF */}
      <SmartBriefDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        projectId={drawerMeetingId}
      />

      {/* 4. MODAL: AGENDAR NUEVA REUNIÓN (ESTILO PUERPLE BTL CON FONDO BLANCO) */}
      {showCreateModal && ReactDOM.createPortal(
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '560px', width: '100%', boxSizing: 'border-box' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: 'rgba(124, 58, 237, 0.1)', padding: '8px', borderRadius: '10px' }}>
                  <Calendar size={20} style={{ color: 'var(--accent-primary)' }} />
                </div>
                <h3 className="modal-title">Agendar Nueva Reunión</h3>
              </div>
              <button className="btn-icon" onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateMeeting}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                <div className="form-group">
                  <label>Título de la reunión *</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="Ej. Status Semanal de Proyectos / Presentación"
                    value={newEvent.title}
                    onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>Fecha *</label>
                    <input
                      type="date"
                      required
                      className="form-control"
                      value={newEvent.date}
                      onChange={e => setNewEvent({ ...newEvent, date: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Hora Inicio *</label>
                    <input
                      type="time"
                      required
                      className="form-control"
                      value={newEvent.startTime}
                      onChange={e => setNewEvent({ ...newEvent, startTime: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Hora Fin *</label>
                    <input
                      type="time"
                      required
                      className="form-control"
                      value={newEvent.endTime}
                      onChange={e => setNewEvent({ ...newEvent, endTime: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Participantes (correos separados por coma)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="ejemplo@cliente.com, directorio@purplebtl.com"
                    value={newEvent.attendees}
                    onChange={e => setNewEvent({ ...newEvent, attendees: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Ubicación / Sala (Opcional)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. Sala de Directorio / Remoto"
                    value={newEvent.location}
                    onChange={e => setNewEvent({ ...newEvent, location: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Descripción / Temas a Tratar</label>
                  <textarea
                    rows={3}
                    className="form-control"
                    placeholder="Escribe los puntos clave de la reunión..."
                    value={newEvent.description}
                    onChange={e => setNewEvent({ ...newEvent, description: e.target.value })}
                    style={{ resize: 'none' }}
                  />
                </div>

                {/* Checkbox Google Meet */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    padding: '12px 14px',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    borderRadius: 'var(--radius-sm)'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={newEvent.addMeet}
                    onChange={e => setNewEvent({ ...newEvent, addMeet: e.target.checked })}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
                  />
                  <span style={{ fontSize: '13px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Video size={16} color="#059669" />
                    Generar automáticamente enlace de <strong>Google Meet</strong>
                  </span>
                </label>

              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Guardando en Calendar...' : 'Agendar Reunión'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* 5. MODAL RÁPIDO: CREAR BRIEF 2.0 DESDE CORREO / WHATSAPP / ARCHIVO */}
      {showFromSourceModal && ReactDOM.createPortal(
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '620px', width: '100%', boxSizing: 'border-box' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: 'rgba(139, 92, 246, 0.12)', padding: '8px', borderRadius: '10px' }}>
                  <Sparkles size={20} style={{ color: '#7c3aed' }} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0 }}>Crear Brief desde Correo, WhatsApp o Archivo</h3>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
                    La IA extrae inventario cotizable, sede real, plantilla exacta y vacíos críticos al instante.
                  </div>
                </div>
              </div>
              <button className="btn-icon" onClick={() => setShowFromSourceModal(false)} disabled={isImportingSource}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateBriefFromSourceSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setSourceMode('text')}
                    style={{
                      flex: 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: sourceMode === 'text' ? '1.5px solid #8b5cf6' : '1px solid #cbd5e1',
                      background: sourceMode === 'text' ? 'rgba(139, 92, 246, 0.1)' : '#fff',
                      color: sourceMode === 'text' ? '#6d28d9' : '#475569',
                      fontWeight: 700,
                      fontSize: '12.5px',
                      cursor: 'pointer'
                    }}
                  >
                    <MessageSquare size={14} />
                    <span>Pegar Correo / WhatsApp / Notas</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceMode('file')}
                    style={{
                      flex: 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: sourceMode === 'file' ? '1.5px solid #8b5cf6' : '1px solid #cbd5e1',
                      background: sourceMode === 'file' ? 'rgba(139, 92, 246, 0.1)' : '#fff',
                      color: sourceMode === 'file' ? '#6d28d9' : '#475569',
                      fontWeight: 700,
                      fontSize: '12.5px',
                      cursor: 'pointer'
                    }}
                  >
                    <Upload size={14} />
                    <span>Subir PDF / Imagen / Word / Audio</span>
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label>Título Referencial (Opcional)</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="La IA lo sugiere si lo dejas vacío"
                      value={sourceTitulo}
                      onChange={e => setSourceTitulo(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Origen del Brief</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Ej. Correo Cliente / WhatsApp"
                      value={sourceLabel}
                      onChange={e => setSourceLabel(e.target.value)}
                    />
                  </div>
                </div>

                {sourceMode === 'text' ? (
                  <div className="form-group">
                    <label>Contenido del Correo, WhatsApp o Requerimiento *</label>
                    <textarea
                      rows={7}
                      className="form-control"
                      placeholder="Pega aquí el requerimiento completo del cliente, medidas, cantidades, ciudades, fechas o mensajes de WhatsApp..."
                      value={sourceText}
                      onChange={e => setSourceText(e.target.value)}
                      style={{ resize: 'vertical', lineHeight: '1.45' }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      border: '2px dashed rgba(139, 92, 246, 0.45)',
                      borderRadius: '12px',
                      padding: '22px',
                      textAlign: 'center',
                      background: 'rgba(139, 92, 246, 0.04)'
                    }}
                  >
                    <Upload size={26} color="#7c3aed" style={{ margin: '0 auto 8px auto' }} />
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e1b4b', marginBottom: '4px' }}>
                      {sourceFile ? `Archivo seleccionado: ${sourceFile.name}` : 'Selecciona o suelta un archivo (máx. 25 MB)'}
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748b', marginBottom: '12px' }}>
                      Soporta PDF, Word (.docx), PowerPoint (.pptx), Capturas (PNG/JPG/WEBP), TXT o Audio (MP3/M4A/WAV/OGG)
                    </div>
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        background: '#8b5cf6',
                        color: '#ffffff',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      <span>Elegir Archivo</span>
                      <input
                        type="file"
                        accept=".pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp,.mp3,.m4a,.wav,.ogg,.webm"
                        onChange={(e) => {
                          const f = e.target.files?.[0] || null;
                          setSourceFile(f);
                          if (f && (!sourceLabel || sourceLabel === 'Correo / WhatsApp de Cliente')) {
                            setSourceLabel(`Archivo: ${f.name}`);
                          }
                        }}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowFromSourceModal(false)}
                  disabled={isImportingSource}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isImportingSource}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  {isImportingSource ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Analizando y creando Brief...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      <span>Generar Smart Brief 2.0</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
