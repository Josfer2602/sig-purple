import React, { useMemo, useState } from 'react';
import { useGlobalContext } from '../context/GlobalContext';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { Briefcase, Clock, DollarSign, Filter, RotateCcw } from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { quotes, proyectos, clientes, listas, isLoading } = useGlobalContext();

  const [filtroAno, setFiltroAno] = useState<string>('');
  const [filtroTrimestre, setFiltroTrimestre] = useState<string>('');
  const [filtroMes, setFiltroMes] = useState<string>('');
  const [filtroServicio, setFiltroServicio] = useState<string>('');
  const [filtroCliente, setFiltroCliente] = useState<string>('');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 }).format(amount);
  };

  const formatPercent = (amount: number) => {
    return `${amount.toFixed(0)}%`;
  };

  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  
  const getTrimestre = (monthIndex: number) => {
    if (monthIndex < 3) return '1';
    if (monthIndex < 6) return '2';
    if (monthIndex < 9) return '3';
    return '4';
  };

  // Filter projects based on selected filters
  const filteredProyectos = useMemo(() => {
    return proyectos.filter(p => {
      if (!p || p.estado === 'Archivado') return false;
      let match = true;
      const dateStr = p.fechaAprobacion || p.fechaRegistro;
      if (dateStr) {
        const parts = dateStr.split(/[-/]/);
        const year = parts[0].length === 4 ? parts[0] : parts[2];
        const month = parts[0].length === 4 ? parts[1] : parts[0];
        const monthIndex = parseInt(month, 10) - 1;
        
        if (filtroAno && year !== filtroAno) match = false;
        if (filtroMes && monthIndex.toString() !== filtroMes) match = false;
        if (filtroTrimestre && getTrimestre(monthIndex) !== filtroTrimestre) match = false;
      }
      
      if (filtroServicio && (p.tipoServicio || '').trim().toUpperCase() !== filtroServicio.trim().toUpperCase()) match = false;
      if (filtroCliente && p.clienteId !== filtroCliente) match = false;

      return match;
    });
  }, [proyectos, filtroAno, filtroMes, filtroTrimestre, filtroServicio, filtroCliente]);

  // Also include formal quotes if any
  const totalLicitaciones = filteredProyectos.length || quotes.length;
  const approvedProyectos = filteredProyectos.filter(p => ['Aprobado', 'Ganado', 'En Ejecución', 'Finalizado'].includes(p.estado));
  const rejectedProyectos = filteredProyectos.filter(p => ['Rechazado', 'Perdido'].includes(p.estado));
  const waitingProyectos = filteredProyectos.filter(p => ['Registrado', 'Cotización Enviada', 'Pendiente', 'En Proceso', 'CP', 'MP', 'LP'].includes(p.estado));

  const totalMontoLicitado = filteredProyectos.reduce((acc, p) => acc + (Number(p.subtotal) || Number(p.presupuestoEstimado) || 0), 0);
  const totalMontoAprobado = approvedProyectos.reduce((acc, p) => acc + (Number(p.subtotal) || Number(p.presupuestoEstimado) || 0), 0);
  const totalMontoRechazado = rejectedProyectos.reduce((acc, p) => acc + (Number(p.subtotal) || Number(p.presupuestoEstimado) || 0), 0);
  const totalMontoEspera = waitingProyectos.reduce((acc, p) => acc + (Number(p.subtotal) || Number(p.presupuestoEstimado) || 0), 0);

  // Ventas Data by Year & Month from Proyectos
  const { salesData, years } = useMemo(() => {
    const data: any[] = months.map(m => ({ name: m }));
    const yrs = new Set<string>();
    
    // Add default recent years
    yrs.add('2023'); yrs.add('2024'); yrs.add('2025'); yrs.add('2026');

    proyectos.forEach(p => {
      if (!p || p.estado === 'Archivado') return;
      const dateStr = p.fechaAprobacion || p.fechaRegistro;
      if (dateStr) {
        const parts = dateStr.split(/[-/]/);
        const year = parts[0].length === 4 ? parts[0] : parts[2];
        if (year && year.length === 4) yrs.add(year);
      }
    });
    const sortedYears = Array.from(yrs).sort();

    approvedProyectos.forEach(p => {
      const dateStr = p.fechaAprobacion || p.fechaRegistro;
      if (dateStr) {
        const parts = dateStr.split(/[-/]/);
        const year = parts[0].length === 4 ? parts[0] : parts[2];
        const month = parts[0].length === 4 ? parts[1] : parts[1];
        
        const monthIndex = parseInt(month, 10) - 1;
        if (monthIndex >= 0 && monthIndex < 12) {
          const row = data[monthIndex];
          row[year] = (row[year] || 0) + (Number(p.subtotal) || 0);
        }
      }
    });
    
    data.forEach(row => {
      sortedYears.forEach(y => { if (row[y] === undefined) row[y] = 0; });
    });

    return { salesData: data, years: sortedYears };
  }, [approvedProyectos, proyectos]);

  // Margen Data
  const margenData = useMemo(() => {
    const data: any[] = months.map(m => ({ name: m }));
    approvedProyectos.forEach(p => {
      const dateStr = p.fechaAprobacion || p.fechaRegistro;
      if (dateStr) {
        const parts = dateStr.split(/[-/]/);
        const year = parts[0].length === 4 ? parts[0] : parts[2];
        const month = parts[0].length === 4 ? parts[1] : parts[1];
        const monthIndex = parseInt(month, 10) - 1;
        if (monthIndex >= 0 && monthIndex < 12) {
          const row = data[monthIndex];
          const venta = Number(p.subtotal) || 0;
          const costoFinal = venta * 0.70; // 30% estimacion de margen si no hay gastos
          row[year] = (row[year] || 0) + (venta - costoFinal);
        }
      }
    });
    data.forEach(row => {
      years.forEach(y => { if (row[y] === undefined) row[y] = 0; });
    });
    return data;
  }, [approvedProyectos, years]);

  // Pie Charts
  const estadoPie = [
    { name: 'GANADO', value: approvedProyectos.length },
    { name: 'PERDIDO', value: rejectedProyectos.length },
    { name: 'PENDIENTE', value: waitingProyectos.length },
  ].filter(d => d.value > 0);
  const ESTADO_COLORS = ['#8b5cf6', '#ef4444', '#f59e0b']; // Purple BTL style colors

  const servicePie = useMemo(() => {
    const map: Record<string, number> = {};
    approvedProyectos.forEach(p => {
      const rawService = (p.tipoServicio || 'OTROS').trim().toUpperCase();
      map[rawService] = (map[rawService] || 0) + (Number(p.subtotal) || 0);
    });
    return Object.keys(map).map(k => ({ name: k, value: map[k] })).filter(d => d.value > 0);
  }, [approvedProyectos]);
  
  const SERVICE_COLORS = ['#7e22ce', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#3b82f6'];


  const YEAR_COLORS = ['#94a3b8', '#64748b', '#3b82f6', '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e'];

  // Resumen Card Component (Estilos Purple BTL)
  const SummaryCard = ({ title, icon: Icon, mainValue, subItems, colorHint }: { title: string, icon: any, mainValue: string, subItems: any[], colorHint: string }) => (
    <div style={{ 
      padding: '24px', 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '16px', 
      background: '#ffffff', 
      border: '1px solid var(--border-color)', 
      borderRadius: '16px',
      position: 'relative', 
      overflow: 'hidden',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)'
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: '5px', height: '100%', background: colorHint }}></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</h3>
        <div style={{ background: `${colorHint}15`, padding: '10px', borderRadius: '12px' }}>
          <Icon size={22} color={colorHint} />
        </div>
      </div>
      <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)' }}>
        {mainValue}
      </div>
      {subItems.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
          {subItems.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{item.label}</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '13px' }}>{item.value}</span>
                {item.percent && <span style={{ color: '#fff', background: item.color, padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}>{item.percent}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderYearlyTable = (title: string, data: any[]) => (
    <div className="table-responsive-container glass-panel" style={{ padding: '16px 20px', marginBottom: '24px', background: '#fff', borderRadius: 'var(--radius-md)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <h3 style={{ fontSize: '15px', color: 'var(--text-primary)', margin: 0, fontWeight: 'bold' }}>{title}</h3>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>👉 Desliza horizontalmente para ver todos los meses</span>
      </div>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
        <table style={{ minWidth: '920px', width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center' }}>
          <thead>
            <tr style={{ background: 'linear-gradient(90deg, #4c1d95 0%, #7e22ce 100%)', color: '#fff' }}>
              <th className="sticky-col-left" style={{ padding: '12px', border: '1px solid rgba(0,0,0,0.1)', minWidth: '150px' }}>Año</th>
              {months.map(m => <th key={m} style={{ padding: '12px', border: '1px solid rgba(0,0,0,0.1)' }}>{m}</th>)}
              <th style={{ padding: '12px', border: '1px solid rgba(0,0,0,0.1)', minWidth: '90px' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y, i) => {
              const rowTotals = data.reduce((acc, row) => acc + (row[y] || 0), 0);
              
              let yoyRow = null;
              if (i > 0) {
                const prevY = years[i - 1];
                yoyRow = (
                  <tr key={`yoy-${y}`} style={{ background: 'rgba(0,0,0,0.03)', fontWeight: 'bold' }}>
                    <td style={{ padding: '8px', border: '1px solid rgba(0,0,0,0.05)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Crecimiento {y} vs {prevY}</td>
                    {months.map(m => {
                      const curr = data.find(d => d.name === m)?.[y] || 0;
                      const prev = data.find(d => d.name === m)?.[prevY] || 0;
                      let pct = 0;
                      if (prev > 0) pct = ((curr - prev) / prev) * 100;
                      return (
                        <td key={m} style={{ padding: '8px', border: '1px solid rgba(0,0,0,0.05)', color: pct >= 0 ? '#10b981' : '#ef4444' }}>
                          {pct === 0 ? '-' : `${pct.toFixed(0)}%`}
                        </td>
                      );
                    })}
                    <td style={{ padding: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>-</td>
                  </tr>
                );
              }

              return (
                <React.Fragment key={y}>
                  <tr style={{ background: y === '2026' ? 'rgba(139,92,246,0.1)' : 'transparent' }}>
                    <td className="sticky-col-left" style={{ padding: '8px', border: '1px solid rgba(0,0,0,0.05)', fontWeight: 'bold', color: 'var(--text-primary)' }}>{y}</td>
                    {months.map(m => (
                      <td key={m} className="font-tabular" style={{ padding: '8px', border: '1px solid rgba(0,0,0,0.05)', color: 'var(--text-secondary)' }}>
                        {formatCurrency(data.find(d => d.name === m)?.[y] || 0)}
                      </td>
                    ))}
                    <td className="font-tabular" style={{ padding: '8px', border: '1px solid rgba(0,0,0,0.05)', fontWeight: 'bold', color: '#7e22ce' }}>
                      {formatCurrency(rowTotals)}
                    </td>
                  </tr>
                  {yoyRow}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderMarkDownTable = () => (
    <div className="table-responsive-container glass-panel" style={{ padding: '16px 20px', marginBottom: '24px', background: '#fff', borderRadius: 'var(--radius-md)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <h3 style={{ fontSize: '15px', color: 'var(--text-primary)', margin: 0, fontWeight: 'bold' }}>RESUMEN DE MARK DOWN POR AÑO (%)</h3>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>👉 Desliza horizontalmente para ver todos los meses</span>
      </div>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
        <table style={{ minWidth: '920px', width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center' }}>
          <thead>
            <tr style={{ background: 'linear-gradient(90deg, #4c1d95 0%, #7e22ce 100%)', color: '#fff' }}>
              <th className="sticky-col-left" style={{ padding: '12px', border: '1px solid rgba(0,0,0,0.1)', minWidth: '150px' }}>Año</th>
              {months.map(m => <th key={m} style={{ padding: '12px', border: '1px solid rgba(0,0,0,0.1)' }}>{m}</th>)}
              <th style={{ padding: '12px', border: '1px solid rgba(0,0,0,0.1)', minWidth: '90px' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => {
              const rowSalesTotals = salesData.reduce((acc, row) => acc + (row[y] || 0), 0);
              const rowMargenTotals = margenData.reduce((acc, row) => acc + (row[y] || 0), 0);
              const rowPct = rowSalesTotals > 0 ? (rowMargenTotals / rowSalesTotals) * 100 : 0;
              return (
                <tr key={y} style={{ background: y === '2026' ? 'rgba(139,92,246,0.1)' : 'transparent' }}>
                  <td className="sticky-col-left" style={{ padding: '8px', border: '1px solid rgba(0,0,0,0.05)', fontWeight: 'bold', color: 'var(--text-primary)' }}>{y}</td>
                  {months.map(m => {
                    const sale = salesData.find(d => d.name === m)?.[y] || 0;
                    const margen = margenData.find(d => d.name === m)?.[y] || 0;
                    const pct = sale > 0 ? (margen / sale) * 100 : 0;
                    return (
                      <td key={m} className="font-tabular" style={{ padding: '8px', border: '1px solid rgba(0,0,0,0.05)', color: 'var(--text-secondary)' }}>
                        {pct === 0 ? '-' : `${pct.toFixed(0)}%`}
                      </td>
                    );
                  })}
                  <td className="font-tabular" style={{ padding: '8px', border: '1px solid rgba(0,0,0,0.05)', fontWeight: 'bold', color: '#7e22ce' }}>
                    {rowPct === 0 ? '-' : `${rowPct.toFixed(0)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="animate-fade-in dashboard-container" style={{ padding: '16px', maxWidth: '1600px', margin: '0 auto', paddingBottom: '90px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', marginBottom: '24px' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-panel" style={{ padding: '20px', borderRadius: '14px', background: '#ffffff', minHeight: '130px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="skeleton-pulse" style={{ width: '120px', height: '14px', borderRadius: '6px' }} />
                <div className="skeleton-pulse" style={{ width: '28px', height: '28px', borderRadius: '50%' }} />
              </div>
              <div className="skeleton-pulse" style={{ width: '160px', height: '26px', borderRadius: '8px' }} />
              <div className="skeleton-pulse" style={{ width: '85%', height: '12px', borderRadius: '4px' }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px', marginBottom: '24px' }}>
          <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px', background: '#ffffff', height: '340px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="skeleton-pulse" style={{ width: '220px', height: '18px', borderRadius: '6px' }} />
            <div className="skeleton-pulse" style={{ flex: 1, borderRadius: '10px' }} />
          </div>
          <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px', background: '#ffffff', height: '340px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="skeleton-pulse" style={{ width: '180px', height: '18px', borderRadius: '6px' }} />
            <div className="skeleton-pulse" style={{ flex: 1, borderRadius: '10px' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in dashboard-container" style={{ padding: '16px', maxWidth: '1600px', margin: '0 auto', paddingBottom: '90px' }}>
      
      {/* Unified Horizontal Filters Panel */}
      <div className="unified-filter-panel" style={{ alignItems: 'flex-end', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontWeight: 600, paddingBottom: '10px', marginRight: '4px' }}>
          <Filter size={18} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontSize: '13px' }}>Filtros:</span>
        </div>
        
        {/* Año */}
        <div className="unified-filter-group" style={{ minWidth: '120px', flex: '1 1 120px' }}>
          <label className="unified-filter-label">Año</label>
          <select className="unified-select" value={filtroAno} onChange={e => setFiltroAno(e.target.value)}>
            <option value="">Todos los Años</option>
            {years.slice().reverse().map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        
        {/* Trimestre */}
        <div className="unified-filter-group" style={{ minWidth: '140px', flex: '1.1 1 140px' }}>
          <label className="unified-filter-label">Trimestre</label>
          <select className="unified-select" value={filtroTrimestre} onChange={e => setFiltroTrimestre(e.target.value)}>
            <option value="">Todo el Año (Trimestres)</option>
            <option value="1">Trimestre 1 (Ene-Mar)</option>
            <option value="2">Trimestre 2 (Abr-Jun)</option>
            <option value="3">Trimestre 3 (Jul-Set)</option>
            <option value="4">Trimestre 4 (Oct-Dic)</option>
          </select>
        </div>
        
        {/* Mes */}
        <div className="unified-filter-group" style={{ minWidth: '130px', flex: '1 1 130px' }}>
          <label className="unified-filter-label">Mes</label>
          <select className="unified-select" value={filtroMes} onChange={e => setFiltroMes(e.target.value)}>
            <option value="">Todos los Meses</option>
            {months.map((m, i) => <option key={i} value={i.toString()}>{m}</option>)}
          </select>
        </div>
        
        {/* Servicio */}
        <div className="unified-filter-group" style={{ minWidth: '160px', flex: '1.2 1 160px' }}>
          <label className="unified-filter-label">Servicio</label>
          <select className="unified-select" value={filtroServicio} onChange={e => setFiltroServicio(e.target.value)}>
            <option value="">Todos los Servicios</option>
            {listas?.tipoServicio?.map((s: string) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Cliente */}
        <div className="unified-filter-group" style={{ minWidth: '180px', flex: '1.4 1 180px' }}>
          <label className="unified-filter-label">Cliente</label>
          <select className="unified-select" value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)}>
            <option value="">Todos los Clientes</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.empresa}</option>)}
          </select>
        </div>

        {/* Botón Limpiar Filtros */}
        {(filtroAno || filtroTrimestre || filtroMes || filtroServicio || filtroCliente) && (
          <button 
            type="button" 
            className="btn-clear-filters"
            onClick={() => {
              setFiltroAno('');
              setFiltroTrimestre('');
              setFiltroMes('');
              setFiltroServicio('');
              setFiltroCliente('');
            }}
            title="Restablecer todos los filtros"
            style={{ marginBottom: '0' }}
          >
            <RotateCcw size={14} />
            <span>Limpiar</span>
          </button>
        )}
      </div>

      {/* Summary Cards at the TOP */}
      <div className="dashboard-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <SummaryCard 
          title="Licitaciones / Proyectos"
          icon={Briefcase}
          mainValue={totalLicitaciones.toString()}
          colorHint="#a855f7"
          subItems={[
            { label: 'Ganadas / Aprobadas', value: approvedProyectos.length, percent: totalLicitaciones ? formatPercent((approvedProyectos.length/totalLicitaciones)*100) : '0%', color: '#a855f7' },
            { label: 'Rechazadas / Perdidas', value: rejectedProyectos.length, percent: totalLicitaciones ? formatPercent((rejectedProyectos.length/totalLicitaciones)*100) : '0%', color: '#ef4444' }
          ]}
        />

        <SummaryCard 
          title="Montos Licitados"
          icon={DollarSign}
          mainValue={formatCurrency(totalMontoLicitado)}
          colorHint="#38bdf8"
          subItems={[
            { label: 'Montos Ganados', value: formatCurrency(totalMontoAprobado), percent: totalMontoLicitado ? formatPercent((totalMontoAprobado/totalMontoLicitado)*100) : '0%', color: '#38bdf8' },
            { label: 'Montos Perdidos', value: formatCurrency(totalMontoRechazado), percent: totalMontoLicitado ? formatPercent((totalMontoRechazado/totalMontoLicitado)*100) : '0%', color: '#ef4444' }
          ]}
        />

        <SummaryCard 
          title={`Proyectos en Espera / Pendientes (${waitingProyectos.length})`}
          icon={Clock}
          mainValue={formatCurrency(totalMontoEspera)}
          colorHint="#f59e0b"
          subItems={[
            { label: `En Evaluación / CP (${waitingProyectos.length})`, value: formatCurrency(totalMontoEspera), color: '#f59e0b' }
          ]}
        />
      </div>

      {/* Main Graph (Full Width) */}
      <div className="glass-panel dashboard-chart-card" style={{ padding: '20px', height: '400px', marginBottom: '32px' }}>
        <h3 style={{ fontSize: '15px', marginBottom: '16px', color: 'var(--text-primary)', textAlign: 'center', fontWeight: 'bold' }}>GRÁFICO COMPARATIVO DE VENTAS POR AÑO (APROBADOS) / (SIN IGV.)</h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={salesData} margin={{ top: 5, right: 15, left: 0, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} tickMargin={8} />
            <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={(val) => `S/${(val/1000).toFixed(0)}k`} />
            <RechartsTooltip 
              contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '8px', color: '#fff' }}
              formatter={(val: any) => formatCurrency(Number(val) || 0)}
            />
            <Legend wrapperStyle={{ fontSize: '11px', bottom: 0 }} />
            {years.map((y, i) => (
              <Line key={y} type="monotone" dataKey={y} stroke={YEAR_COLORS[i % YEAR_COLORS.length]} strokeWidth={3} dot={{ r: 4, fill: '#1e293b', strokeWidth: 2 }} activeDot={{ r: 7, strokeWidth: 0 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Pie Charts Grid */}
      <div className="dashboard-pie-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        
        <div className="glass-panel" style={{ padding: '24px 16px', height: '380px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h3 style={{ fontSize: '15px', marginBottom: '16px', textAlign: 'center', color: 'var(--text-primary)', fontWeight: 'bold' }}>ESTADOS DE LICITACIÓN (%)</h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={estadoPie} cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={5} dataKey="value" stroke="none" label={({ percent }: any) => `${((percent || 0) * 100).toFixed(0)}%`}>
                {estadoPie.map((_, index) => <Cell key={`cell-${index}`} fill={ESTADO_COLORS[index % ESTADO_COLORS.length]} />)}
              </Pie>
              <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: 'none', borderRadius: '8px' }} formatter={(val: any) => val} />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '16px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel" style={{ padding: '24px 16px', height: '380px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h3 style={{ fontSize: '15px', marginBottom: '16px', textAlign: 'center', color: 'var(--text-primary)', fontWeight: 'bold' }}>PARTICIPACIÓN POR SERVICIO (%)</h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={servicePie} cx="50%" cy="50%" innerRadius={0} outerRadius={95} paddingAngle={2} dataKey="value" stroke="none" label={({ percent }: any) => `${((percent || 0) * 100).toFixed(0)}%`}>
                {servicePie.map((_, index) => <Cell key={`cell-${index}`} fill={SERVICE_COLORS[index % SERVICE_COLORS.length]} />)}
              </Pie>
              <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: 'none', borderRadius: '8px' }} formatter={(val: any) => formatCurrency(Number(val) || 0)} />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '16px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* Margen Variable Line Chart */}
      <div className="glass-panel dashboard-chart-card" style={{ padding: '20px', height: '400px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '15px', marginBottom: '16px', color: 'var(--text-primary)', textAlign: 'center', fontWeight: 'bold' }}>EVOLUCIÓN DE MARGEN VARIABLE</h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={margenData} margin={{ top: 5, right: 15, left: 0, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} tickMargin={8} />
            <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={(val) => `S/${(val/1000).toFixed(0)}k`} />
            <RechartsTooltip 
              contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '8px', color: '#fff' }}
              formatter={(val: any) => formatCurrency(Number(val) || 0)}
            />
            <Legend wrapperStyle={{ fontSize: '11px', bottom: 0 }} />
            {years.map((y, i) => (
              <Line key={y} type="monotone" dataKey={y} stroke={YEAR_COLORS[i % YEAR_COLORS.length]} strokeWidth={3} dot={{ r: 4, fill: '#1e293b', strokeWidth: 2 }} activeDot={{ r: 7, strokeWidth: 0 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Data Tables */}
      {renderYearlyTable('RESUMEN DE VENTAS POR AÑO (S/)', salesData)}
      {renderYearlyTable('RESUMEN DE MARGEN VARIABLE POR AÑO (S/)', margenData)}
      {renderMarkDownTable()}

    </div>
  );
};
