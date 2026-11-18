import React, { useState, useMemo, useRef } from 'react';
import { 
  Plus, Search, ChevronDown, ChevronRight, ChevronLeft, Building, CreditCard, Mail, Phone, 
  Trash2, Edit, X, Globe, MapPin, AlertTriangle, ShieldCheck, FileText, 
  Image as ImageIcon, Download, Upload, ExternalLink, Eye, Loader2,
  Users, FileSpreadsheet, Folder, Tag
} from 'lucide-react';
import { useGlobalContext } from '../context/GlobalContext';
import { CreateProveedorModal } from '../components/CreateProveedorModal';
import { ProveedorGalleryModal } from '../components/ProveedorGalleryModal';
import { ManageProveedorCatalogModal } from '../components/ManageProveedorCatalogModal';
import { API_URL, BASE_URL } from '../utils/apiUrl';
import { exportProveedoresToExcel } from '../utils/excelExport';
import type { Proveedor, ProveedorDocumento } from '../types/models';
import { SkeletonTable } from '../components/SkeletonTable';
import toast from 'react-hot-toast';

export const ProveedoresView: React.FC = () => {
  const { proveedores, deleteProveedor, updateProveedor, reloadProveedores, token, currentUser, isLoading } = useGlobalContext();
  const currentUserRole = currentUser?.role;
  
  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [proveedorToEdit, setProveedorToEdit] = useState<Proveedor | null>(null);
  const [galleryProveedor, setGalleryProveedor] = useState<Proveedor | null>(null);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [catalogInitialTab, setCatalogInitialTab] = useState<'categorias' | 'subcategorias' | 'tags'>('categorias');

  // Table expansion & scroll
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const handleScrollTable = (direction: 'left' | 'right') => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollBy({
        left: direction === 'left' ? -350 : 350,
        behavior: 'smooth'
      });
    }
  };

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('Todas');
  const [selectedTag, setSelectedTag] = useState<string>('Todos');
  const [selectedCity, setSelectedCity] = useState<string>('Todas');
  const [selectedTipo, setSelectedTipo] = useState<string>('Todos');
  const [selectedConfiable, setSelectedConfiable] = useState<string>('Todos');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Import / Export state
  const [isImporting, setIsImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  // Derive unique categories, subcategories, tags & cities
  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    proveedores.forEach(p => {
      (p.categorias || []).forEach(c => { if (c && c.trim()) set.add(c.trim()); });
      if (p.categoria && p.categoria.trim()) set.add(p.categoria.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [proveedores]);

  const subcategoriesList = useMemo(() => {
    const set = new Set<string>();
    proveedores.forEach(p => {
      (p.subcategorias || []).forEach(sc => { if (sc && sc.trim()) set.add(sc.trim()); });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [proveedores]);

  const tagsList = useMemo(() => {
    const set = new Set<string>();
    proveedores.forEach(p => {
      (p.tags || []).forEach(tg => { if (tg && tg.trim()) set.add(tg.trim()); });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [proveedores]);

  const citiesList = useMemo(() => {
    const set = new Set<string>(['Lima']);
    proveedores.forEach(p => {
      if (p.ciudad && p.ciudad.trim()) set.add(p.ciudad.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [proveedores]);

  // Summary counts
  const totalCount = proveedores.length;
  const trabajadosCount = proveedores.filter(p => (p.tipoProveedor || 'Trabajado') === 'Trabajado').length;
  const brochureCount = proveedores.filter(p => p.tipoProveedor === 'Brochure').length;
  const noConfiablesCount = proveedores.filter(p => p.esConfiable === false).length;

  // Filtering logic
  const filteredProveedores = useMemo(() => {
    return proveedores.filter(p => {
      // 1. Text search
      const term = searchTerm.toLowerCase().trim();
      if (term) {
        const matchRazon = (p.razonSocial || '').toLowerCase().includes(term);
        const matchRuc = (p.ruc || '').includes(term);
        const matchNombre = (p.nombre || '').toLowerCase().includes(term);
        const matchCat = (p.categoria || '').toLowerCase().includes(term);
        const matchCats = (p.categorias || []).some(c => c.toLowerCase().includes(term));
        const matchSubcats = (p.subcategorias || []).some(s => s.toLowerCase().includes(term));
        const matchTags = (p.tags || []).some(t => t.toLowerCase().includes(term));
        const matchCiudad = (p.ciudad || '').toLowerCase().includes(term);
        const matchCorreo = (p.correo || '').toLowerCase().includes(term);
        const matchTel = (p.telefono || '').toLowerCase().includes(term);
        if (!matchRazon && !matchRuc && !matchNombre && !matchCat && !matchCats && !matchSubcats && !matchTags && !matchCiudad && !matchCorreo && !matchTel) {
          return false;
        }
      }

      // 2. Category filter
      if (selectedCategory !== 'Todas') {
        const hasCat = (p.categorias && p.categorias.includes(selectedCategory)) || (p.categoria || '').trim() === selectedCategory;
        if (!hasCat) return false;
      }

      // 3. Subcategory filter
      if (selectedSubcategory !== 'Todas') {
        const hasSubcat = (p.subcategorias || []).includes(selectedSubcategory);
        if (!hasSubcat) return false;
      }

      // 4. Tag filter
      if (selectedTag !== 'Todos') {
        const hasTag = (p.tags || []).includes(selectedTag);
        if (!hasTag) return false;
      }

      // 5. City filter
      if (selectedCity !== 'Todas') {
        if ((p.ciudad || 'Lima').trim() !== selectedCity) return false;
      }

      // 6. Tipo filter
      if (selectedTipo !== 'Todos') {
        const actualTipo = p.tipoProveedor || 'Trabajado';
        if (actualTipo !== selectedTipo) return false;
      }

      // 7. Confiabilidad filter
      if (selectedConfiable === 'Confiables') {
        if (p.esConfiable === false) return false;
      } else if (selectedConfiable === 'NoConfiables') {
        if (p.esConfiable !== false) return false;
      }

      return true;
    });
  }, [proveedores, searchTerm, selectedCategory, selectedSubcategory, selectedTag, selectedCity, selectedTipo, selectedConfiable]);

  // Paginated records
  const totalPages = Math.ceil(filteredProveedores.length / pageSize) || 1;
  const paginatedProveedores = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProveedores.slice(start, start + pageSize);
  }, [filteredProveedores, currentPage, pageSize]);

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('Todas');
    setSelectedSubcategory('Todas');
    setSelectedTag('Todos');
    setSelectedCity('Todas');
    setSelectedTipo('Todos');
    setSelectedConfiable('Todos');
    setCurrentPage(1);
  };

  const hasActiveFilters = searchTerm !== '' || selectedCategory !== 'Todas' || selectedSubcategory !== 'Todas' || selectedTag !== 'Todos' || selectedCity !== 'Todas' || selectedTipo !== 'Todos' || selectedConfiable !== 'Todos';

  const parseDocs = (docString?: string): ProveedorDocumento[] => {
    if (!docString) return [];
    try {
      const parsed = typeof docString === 'string' ? JSON.parse(docString) : docString;
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  };

  const handleToggleConfiable = async (p: Proveedor) => {
    if (p.esConfiable !== false) {
      // Mark as NOT reliable
      const reason = window.prompt(
        `¿Por qué '${p.razonSocial}' NO es confiable? Ingresa el motivo o advertencia:`,
        p.motivoNoConfiable || 'Incumplimiento de entregas o calidad observada'
      );
      if (reason === null) return; // User cancelled
      
      const updated: Proveedor = {
        ...p,
        esConfiable: false,
        motivoNoConfiable: reason.trim() || 'Proveedor observado / No confiable'
      };
      await updateProveedor(updated);
      toast.error(`'${p.razonSocial}' marcado como NO CONFIABLE (resaltado en rojo)`);
    } else {
      // Mark as reliable
      if (!window.confirm(`¿Confirmas que '${p.razonSocial}' ahora es CONFIABLE?`)) return;
      const updated: Proveedor = {
        ...p,
        esConfiable: true,
        motivoNoConfiable: ''
      };
      await updateProveedor(updated);
      toast.success(`'${p.razonSocial}' marcado como Confiable`);
    }
  };

  const handleDownloadTemplate = () => {
    window.open(`${API_URL}/proveedores/plantilla-excel`, '_blank');
  };

  const handleExportExcel = () => {
    exportProveedoresToExcel(proveedores);
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const fd = new FormData();
    fd.append('file', file);

    try {
      const res = await fetch(`${API_URL}/proveedores/import-excel`, {
        method: 'POST',
        headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: fd
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(`Excel importado: ${data.imported} creados, ${data.updated} actualizados de ${data.total} filas.`);
        await reloadProveedores();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error('Error importando Excel: ' + (err.error || 'Formato no soportado'));
      }
    } catch (e) {
      toast.error('Error de conexión al importar Excel');
    } finally {
      setIsImporting(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  const getCleanWebUrl = (url?: string) => {
    if (!url || !url.trim()) return null;
    let clean = url.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `https://${clean}`;
    }
    return clean;
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '120px' }}>
      
      {/* UNIFIED MASTER TOOLBAR: METRIC FILTER PILLS ON LEFT, ACTION BUTTONS ON RIGHT */}
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '14px' }}>
        {/* Metric Filter Tabs */}
        <div className="unified-tabs" style={{ marginBottom: 0, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`unified-tab ${(!selectedTipo && !selectedConfiable) ? 'active' : ''}`}
            onClick={() => resetFilters()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <Users size={15} />
            <span>Todos</span>
            <span className="unified-tab-badge">{totalCount}</span>
          </button>

          <button
            type="button"
            className={`unified-tab ${selectedTipo === 'Trabajado' ? 'active' : ''}`}
            onClick={() => { setSelectedTipo('Trabajado'); setCurrentPage(1); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <Building size={15} style={{ color: selectedTipo === 'Trabajado' ? '#ffffff' : '#10b981' }} />
            <span>Ya Trabajamos</span>
            <span className="unified-tab-badge badge-success" style={{ backgroundColor: selectedTipo === 'Trabajado' ? 'rgba(255,255,255,0.25)' : 'rgba(16, 185, 129, 0.15)', color: selectedTipo === 'Trabajado' ? '#ffffff' : '#059669' }}>
              {trabajadosCount}
            </span>
          </button>

          <button
            type="button"
            className={`unified-tab ${selectedTipo === 'Brochure' ? 'active' : ''}`}
            onClick={() => { setSelectedTipo('Brochure'); setCurrentPage(1); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <FileText size={15} style={{ color: selectedTipo === 'Brochure' ? '#ffffff' : '#d97706' }} />
            <span>Enviaron Brochure</span>
            <span className="unified-tab-badge" style={{ backgroundColor: selectedTipo === 'Brochure' ? 'rgba(255,255,255,0.25)' : 'rgba(245, 158, 11, 0.15)', color: selectedTipo === 'Brochure' ? '#ffffff' : '#b45309' }}>
              {brochureCount}
            </span>
          </button>

          <button
            type="button"
            className={`unified-tab ${selectedConfiable === 'NoConfiables' ? 'active' : ''}`}
            onClick={() => { setSelectedConfiable('NoConfiables'); setCurrentPage(1); }}
            style={{
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '8px',
              backgroundColor: selectedConfiable === 'NoConfiables' ? '#dc2626' : noConfiablesCount > 0 ? 'rgba(239, 68, 68, 0.08)' : undefined,
              borderColor: selectedConfiable === 'NoConfiables' ? '#dc2626' : noConfiablesCount > 0 ? 'rgba(239, 68, 68, 0.3)' : undefined,
              color: selectedConfiable === 'NoConfiables' ? '#ffffff' : noConfiablesCount > 0 ? '#dc2626' : undefined
            }}
          >
            <AlertTriangle size={15} style={{ color: selectedConfiable === 'NoConfiables' ? '#ffffff' : '#dc2626' }} />
            <span>No Confiables</span>
            <span className="unified-tab-badge badge-danger" style={{ backgroundColor: selectedConfiable === 'NoConfiables' ? 'rgba(255,255,255,0.25)' : 'rgba(239, 68, 68, 0.15)', color: selectedConfiable === 'NoConfiables' ? '#ffffff' : '#dc2626' }}>
              {noConfiablesCount}
            </span>
          </button>
        </div>

        {/* View Actions */}
        <div className="view-actions">
          {/* Hidden file input for Excel import */}
          <input
            type="file"
            ref={importFileRef}
            onChange={handleImportExcel}
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
          />

          <button
            type="button"
            className="btn-secondary"
            onClick={handleDownloadTemplate}
            style={{ fontSize: '13px' }}
            title="Descargar plantilla de Excel oficial con formato y ejemplos"
          >
            <Download size={16} />
            Plantilla Excel
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => importFileRef.current?.click()}
            disabled={isImporting}
            style={{ fontSize: '13px' }}
            title="Importar o actualizar proveedores desde archivo Excel"
          >
            {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {isImporting ? 'Importando...' : 'Importar Excel'}
          </button>

          <button
            type="button"
            className="btn-excel"
            onClick={handleExportExcel}
            title="Descargar base completa de proveedores en Excel"
          >
            <FileSpreadsheet size={16} />
            Exportar Excel
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => { setCatalogInitialTab('categorias'); setIsCatalogModalOpen(true); }}
            style={{ fontSize: '13px' }}
            title="Administrar categorías, subcategorías y tags por defecto"
          >
            <Tag size={16} />
            Catálogo por Defecto
          </button>

          <button
            className="btn-primary"
            onClick={() => {
              setProveedorToEdit(null);
              setIsModalOpen(true);
            }}
            style={{ fontSize: '13px' }}
          >
            <Plus size={18} />
            Nuevo Proveedor
          </button>
        </div>
      </div>

      {/* Advanced Filter Panel */}
      <div className="unified-filter-panel" style={{ width: '100%', marginBottom: '18px', padding: '16px 20px' }}>
        
        {/* Search Input */}
        <div className="unified-filter-group search-group">
          <label className="unified-filter-label">Búsqueda Rápida</label>
          <div className="unified-search-wrapper">
            <Search size={16} className="unified-search-icon" />
            <input 
              type="text" 
              placeholder="Buscar por proveedor, RUC, categoría, ciudad, contacto o teléfono..." 
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="unified-search-input" 
            />
          </div>
        </div>

        {/* Categoría Filter */}
        <div className="unified-filter-group fixed-width">
          <label className="unified-filter-label">Categoría / Rubro</label>
          <select
            value={selectedCategory}
            onChange={e => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
            className="unified-select"
          >
            <option value="Todas">Todas las Categorías ({categoriesList.length})</option>
            {categoriesList.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Subcategoría Filter */}
        <div className="unified-filter-group fixed-width">
          <label className="unified-filter-label">Subcategoría</label>
          <select
            value={selectedSubcategory}
            onChange={e => { setSelectedSubcategory(e.target.value); setCurrentPage(1); }}
            className="unified-select"
          >
            <option value="Todas">Todas las Subcategorías ({subcategoriesList.length})</option>
            {subcategoriesList.map(sc => (
              <option key={sc} value={sc}>{sc}</option>
            ))}
          </select>
        </div>

        {/* Tag / Especialidad Filter */}
        <div className="unified-filter-group fixed-width">
          <label className="unified-filter-label">Tag / Especialidad</label>
          <select
            value={selectedTag}
            onChange={e => { setSelectedTag(e.target.value); setCurrentPage(1); }}
            className="unified-select"
          >
            <option value="Todos">Todos los Tags ({tagsList.length})</option>
            {tagsList.map(tg => (
              <option key={tg} value={tg}>#{tg}</option>
            ))}
          </select>
        </div>

        {/* Ciudad Filter */}
        <div className="unified-filter-group fixed-width">
          <label className="unified-filter-label">Ciudad</label>
          <select
            value={selectedCity}
            onChange={e => { setSelectedCity(e.target.value); setCurrentPage(1); }}
            className="unified-select"
          >
            <option value="Todas">Todas las Ciudades</option>
            {citiesList.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
        </div>

        {/* Tipo Filter */}
        <div className="unified-filter-group fixed-width">
          <label className="unified-filter-label">Relación</label>
          <select
            value={selectedTipo}
            onChange={e => { setSelectedTipo(e.target.value); setCurrentPage(1); }}
            className="unified-select"
          >
            <option value="Todos">Todos los Tipos</option>
            <option value="Trabajado">🤝 Ya trabajamos</option>
            <option value="Brochure">📄 Prospecto / Brochure</option>
          </select>
        </div>

        {/* Confiabilidad Filter */}
        <div className="unified-filter-group fixed-width">
          <label className="unified-filter-label">Confiabilidad</label>
          <select
            value={selectedConfiable}
            onChange={e => { setSelectedConfiable(e.target.value); setCurrentPage(1); }}
            className="unified-select"
          >
            <option value="Todos">Todos los Estados</option>
            <option value="Confiables">🛡️ Solo Confiables</option>
            <option value="NoConfiables">⚠️ Solo NO Confiables</option>
          </select>
        </div>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <button 
            type="button" 
            className="btn-clear-filters" 
            onClick={resetFilters} 
            title="Limpiar todos los filtros"
          >
            <X size={14} />
            Limpiar
          </button>
        )}

      </div>

      {/* Filter Stats Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 8px 16px 8px', fontSize: '12.5px', color: 'var(--text-muted)' }}>
        <div>
          Mostrando <strong>{filteredProveedores.length}</strong> de <strong>{totalCount}</strong> proveedores encontrados
          {hasActiveFilters && (
            <span style={{ color: 'var(--accent-primary)', fontWeight: 500, marginLeft: '6px' }}>
              (filtros aplicados)
            </span>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="desktop-table-container glass-panel table-container" style={{ marginBottom: '56px', padding: 0, overflow: 'hidden' }}>
        {/* ENCABEZADO CON CONTADOR Y CONTROLES DE DESPLAZAMIENTO */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 20px',
          borderBottom: '1px solid var(--border-color)',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.05rem', fontWeight: 700 }}>
              Directorio de Proveedores
            </h3>
            <span className="badge badge-info" style={{ fontSize: '0.8rem', padding: '3px 10px' }}>
              {filteredProveedores.length} {filteredProveedores.length === 1 ? 'proveedor' : 'proveedores'}
            </span>
            {hasActiveFilters && (
              <span style={{ fontSize: '0.82rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
                (Filtros activos)
              </span>
            )}
          </div>

          {/* Controles de desplazamiento horizontal de columnas */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Desplazar:</span>
            <button
              type="button"
              onClick={() => handleScrollTable('left')}
              className="btn-secondary"
              style={{ padding: '4px 8px', height: '28px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
              title="Desplazar tabla a la izquierda"
            >
              <ChevronLeft size={14} /> Izq
            </button>
            <button
              type="button"
              onClick={() => handleScrollTable('right')}
              className="btn-secondary"
              style={{ padding: '4px 8px', height: '28px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
              title="Desplazar tabla a la derecha"
            >
              Der <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* CONTENEDOR SCROLL CON ESTÁNDAR PROYECTOS */}
        <div 
          ref={tableContainerRef} 
          className="custom-table-scroll" 
          style={{ 
            width: '100%', 
            overflowX: 'auto', 
            overflowY: 'auto', 
            maxHeight: 'calc(100vh - 280px)', 
            minHeight: '400px', 
            position: 'relative'
          }}
        >
          {isLoading ? (
            <SkeletonTable columns={11} rows={6} message="Cargando catálogo de proveedores desde la base de datos..." />
          ) : (
            <table className="data-table" style={{ width: '100%', minWidth: '1500px', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
              <colgroup>
              <col style={{ width: '45px', minWidth: '45px' }} /> {/* Expand */}
              <col style={{ width: '130px', minWidth: '130px' }} /> {/* Estado */}
              <col style={{ width: '240px', minWidth: '240px' }} /> {/* Proveedor / RUC */}
              <col style={{ width: '200px', minWidth: '200px' }} /> {/* Categoría */}
              <col style={{ width: '110px', minWidth: '110px' }} /> {/* Ciudad */}
              <col style={{ width: '110px', minWidth: '110px' }} /> {/* Web */}
              <col style={{ width: '120px', minWidth: '120px' }} /> {/* Tipo */}
              <col style={{ width: '140px', minWidth: '140px' }} /> {/* Referencias */}
              <col style={{ width: '160px', minWidth: '160px' }} /> {/* Contacto */}
              <col style={{ width: '90px', minWidth: '90px' }} /> {/* Cuentas */}
              <col style={{ width: '150px', minWidth: '150px' }} /> {/* Acciones */}
            </colgroup>
            <thead style={{ position: 'sticky', top: 0, zIndex: 12, backgroundColor: '#f8fafc' }}>
              <tr>
                <th className="header-custom text-center sticky-col-left" style={{ position: 'sticky', left: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '45px' }}></th>
                <th className="header-custom sticky-col-left" style={{ position: 'sticky', left: '45px', zIndex: 16, backgroundColor: '#f8fafc', width: '130px' }}>ESTADO</th>
                <th className="header-custom">PROVEEDOR / RUC</th>
                <th className="header-custom">CATEGORÍA</th>
                <th className="header-custom">CIUDAD</th>
                <th className="header-custom">WEB</th>
                <th className="header-custom">TIPO</th>
                <th className="header-custom">REFERENCIAS & DOCS</th>
                <th className="header-custom">CONTACTO</th>
                <th className="header-custom">CUENTAS</th>
                <th className="header-custom sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '150px', textAlign: 'center' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProveedores.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
                    <Building size={36} color="var(--text-muted)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>No se encontraron proveedores que coincidan con los filtros.</p>
                    {hasActiveFilters && (
                      <button type="button" className="btn-secondary" onClick={resetFilters} style={{ margin: '12px auto 0', fontSize: '12px' }}>
                        Restablecer Filtros
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedProveedores.map(proveedor => {
                  const isExpanded = expandedId === proveedor.id;
                  const isReliable = proveedor.esConfiable !== false;
                  const docs = parseDocs(proveedor.documentos);
                  const webUrl = getCleanWebUrl(proveedor.web);

                  // RED STYLING IF NOT RELIABLE
                  const rowStyle: React.CSSProperties = !isReliable ? {
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    borderLeft: '5px solid #ef4444'
                  } : {};

                  return (
                    <React.Fragment key={proveedor.id}>
                      <tr 
                        className="expandable-row" 
                        style={rowStyle}
                        onClick={() => setExpandedId(isExpanded ? null : proveedor.id)}
                      >
                        {/* Expand Arrow */}
                        <td className="td-custom text-center sticky-col-left" style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: 'inherit', cursor: 'pointer' }}>
                          {isExpanded ? <ChevronDown size={16} color="var(--accent-primary)" /> : <ChevronRight size={16} color="var(--text-muted)" />}
                        </td>

                        {/* Reliability Badge (Red if Not Reliable) */}
                        <td className="td-custom sticky-col-left" style={{ position: 'sticky', left: '45px', zIndex: 10, backgroundColor: 'inherit' }}>
                        {isReliable ? (
                          <span 
                            className="badge badge-success" 
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer' }}
                            title="Proveedor Confiable (Clic para cambiar estado)"
                            onClick={(e) => { e.stopPropagation(); handleToggleConfiable(proveedor); }}
                          >
                            <ShieldCheck size={12} /> Confiable
                          </span>
                        ) : (
                          <span 
                            className="badge badge-danger" 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '4px', 
                              fontSize: '11px', 
                              background: '#ef4444', 
                              color: '#ffffff',
                              fontWeight: 700,
                              cursor: 'pointer',
                              boxShadow: '0 2px 6px rgba(239, 68, 68, 0.3)'
                            }}
                            title={`NO CONFIABLE: ${proveedor.motivoNoConfiable || 'Observado'} (Clic para cambiar)`}
                            onClick={(e) => { e.stopPropagation(); handleToggleConfiable(proveedor); }}
                          >
                            <AlertTriangle size={12} /> NO CONFIABLE
                          </span>
                        )}
                      </td>

                      {/* Proveedor / Razón Social & RUC */}
                      <td className="td-custom">
                        <div style={{ fontWeight: 'bold', color: !isReliable ? '#b91c1c' : 'var(--text-primary)', fontSize: '13px' }}>
                          {proveedor.razonSocial}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>
                          {proveedor.ruc ? `RUC: ${proveedor.ruc}` : <span style={{ opacity: 0.6 }}>Sin RUC registrado</span>}
                        </div>

                        {/* If NOT reliable, show red warning motive */}
                        {!isReliable && proveedor.motivoNoConfiable && (
                          <div style={{ 
                            marginTop: '4px', 
                            fontSize: '11px', 
                            color: '#b91c1c', 
                            fontWeight: 600,
                            background: 'rgba(239, 68, 68, 0.12)',
                            padding: '3px 6px',
                            borderRadius: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            ⚠️ {proveedor.motivoNoConfiable}
                          </div>
                        )}
                      </td>

                      {/* Categoría & Rubro */}
                      <td className="td-custom">
                        {(() => {
                          const cats = (proveedor.categorias && proveedor.categorias.length > 0)
                            ? proveedor.categorias
                            : (proveedor.categoria ? [proveedor.categoria] : ['General']);
                          const subcats = proveedor.subcategorias || [];
                          const tags = proveedor.tags || [];

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxWidth: '200px' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                                {cats.slice(0, 2).map((cat, idx) => (
                                  <span key={idx} className="badge" style={{ background: 'rgba(138, 43, 226, 0.1)', color: 'var(--accent-primary)', fontSize: '11px', fontWeight: 600 }}>
                                    {cat}
                                  </span>
                                ))}
                                {cats.length > 2 && (
                                  <span 
                                    className="badge" 
                                    style={{ background: 'rgba(138, 43, 226, 0.2)', color: 'var(--accent-primary)', fontSize: '10px', fontWeight: 700, cursor: 'help' }}
                                    title={cats.join(', ')}
                                  >
                                    +{cats.length - 2}
                                  </span>
                                )}
                              </div>
                              {(subcats.length > 0 || tags.length > 0) && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', alignItems: 'center', marginTop: '1px' }}>
                                  {subcats.slice(0, 1).map((sc, idx) => (
                                    <span key={idx} style={{ fontSize: '10px', color: '#0284c7', background: 'rgba(2, 132, 199, 0.1)', padding: '1px 5px', borderRadius: '4px', fontWeight: 500 }} title={`Subcategoría: ${sc}`}>
                                      {sc}
                                    </span>
                                  ))}
                                  {subcats.length > 1 && (
                                    <span style={{ fontSize: '9px', color: '#0284c7', fontWeight: 600 }} title={subcats.join(', ')}>
                                      +{subcats.length - 1}
                                    </span>
                                  )}
                                  {tags.slice(0, 1).map((tg, idx) => (
                                    <span key={idx} style={{ fontSize: '10px', color: '#059669', background: 'rgba(16, 185, 129, 0.1)', padding: '1px 5px', borderRadius: '4px', fontWeight: 500 }} title={`Tag: #${tg}`}>
                                      #{tg}
                                    </span>
                                  ))}
                                  {tags.length > 1 && (
                                    <span style={{ fontSize: '9px', color: '#059669', fontWeight: 600 }} title={tags.map(t => `#${t}`).join(', ')}>
                                      +{tags.length - 1}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      {/* Ciudad */}
                      <td className="td-custom">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          <MapPin size={13} color="var(--accent-primary)" />
                          <span>{proveedor.ciudad || 'Lima'}</span>
                        </div>
                      </td>

                      {/* Web Link */}
                      <td className="td-custom">
                        {webUrl ? (
                          <a 
                            href={webUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '4px', 
                              color: 'var(--accent-primary)', 
                              fontSize: '12px',
                              textDecoration: 'none',
                              fontWeight: 500,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'rgba(138, 43, 226, 0.06)'
                            }}
                            title={`Visitar: ${webUrl}`}
                          >
                            <Globe size={13} />
                            <span>Visitar</span>
                            <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>-</span>
                        )}
                      </td>

                      {/* Tipo Proveedor */}
                      <td className="td-custom">
                        {proveedor.tipoProveedor === 'Brochure' ? (
                          <span className="badge badge-warning" style={{ fontSize: '11px' }}>
                            📄 Brochure
                          </span>
                        ) : (
                          <span className="badge badge-info" style={{ fontSize: '11px' }}>
                            🤝 Trabajado
                          </span>
                        )}
                      </td>

                      {/* Referencias & Documentos Visual Column */}
                      <td className="td-custom">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setGalleryProveedor(proveedor);
                            setIsGalleryOpen(true);
                          }}
                          style={{
                            border: docs.length > 0 ? '1px solid rgba(138, 43, 226, 0.25)' : '1px dashed var(--border-color)',
                            background: docs.length > 0 ? 'rgba(138, 43, 226, 0.06)' : 'transparent',
                            borderRadius: 'var(--radius-sm)',
                            padding: '4px 10px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: docs.length > 0 ? 'var(--accent-primary)' : 'var(--text-muted)'
                          }}
                          title="Ver o subir referencias de trabajo, brochures y catálogos"
                        >
                          {docs.length > 0 ? (
                            <>
                              <ImageIcon size={14} />
                              <span>{docs.length} {docs.length === 1 ? 'Archivo' : 'Archivos'}</span>
                            </>
                          ) : (
                            <>
                              <Plus size={13} />
                              <span>+ Adjuntar</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Contacto */}
                      <td className="td-custom">
                        <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)' }}>
                          {proveedor.nombre || '-'}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '3px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          {proveedor.telefono && (
                            <a 
                              href={`https://wa.me/51${proveedor.telefono.replace(/[^0-9]/g, '')}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#059669', textDecoration: 'none' }}
                              title="Abrir WhatsApp"
                            >
                              <Phone size={11} /> {proveedor.telefono}
                            </a>
                          )}
                          {proveedor.correo && (
                            <a 
                              href={`mailto:${proveedor.correo}`} 
                              onClick={(e) => e.stopPropagation()}
                              style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', textDecoration: 'none' }}
                              title="Enviar correo"
                            >
                              <Mail size={11} /> {proveedor.correo}
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Cuentas Bancarias */}
                      <td className="td-custom text-center font-bold" style={{ fontSize: '12px' }}>
                        {(proveedor.cuentas || []).length} {(proveedor.cuentas || []).length === 1 ? 'Cta.' : 'Ctas.'}
                      </td>
                      {/* Acciones */}
                      <td className="td-custom text-center sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 10, backgroundColor: 'inherit', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '4px', justifyContent: 'center', alignItems: 'center', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                          
                          {/* Drive Folder */}
                          {proveedor.driveFolderUrl && (
                            <a 
                              href={proveedor.driveFolderUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-icon" 
                              onClick={(e) => e.stopPropagation()} 
                              title="Abrir carpeta en Google Drive" 
                              style={{ color: '#0284c7', padding: '5px' }}
                            >
                              <Folder size={15} />
                            </a>
                          )}

                          {/* Ver Galería / Documentos */}
                          <button 
                            className="btn-icon" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setGalleryProveedor(proveedor);
                              setIsGalleryOpen(true);
                            }} 
                            title="Ver fotos y documentos" 
                            style={{ color: 'var(--accent-primary)', padding: '5px' }}
                          >
                            <Eye size={15} />
                          </button>

                          {/* Alternar Confiabilidad */}
                          <button
                            className="btn-icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleConfiable(proveedor);
                            }}
                            title={isReliable ? 'Marcar como No Confiable' : 'Marcar como Confiable'}
                            style={{ color: isReliable ? '#059669' : '#dc2626', padding: '5px' }}
                          >
                            {isReliable ? <ShieldCheck size={15} /> : <AlertTriangle size={15} />}
                          </button>

                          {/* Editar */}
                          <button 
                            className="btn-icon" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setProveedorToEdit(proveedor);
                              setIsModalOpen(true);
                            }} 
                            title="Editar Proveedor" 
                            style={{ color: 'var(--text-primary)', padding: '5px' }}
                          >
                            <Edit size={15} />
                          </button>

                          {/* Eliminar */}
                          <button 
                            className="btn-icon" 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`¿Borrar a '${proveedor.razonSocial}' permanentemente?`)) {
                                deleteProveedor(proveedor.id);
                              }
                            }} 
                            title="Eliminar Proveedor" 
                            style={{ color: 'var(--danger)', padding: '5px' }}
                          >
                            <Trash2 size={15} />
                          </button>

                        </div>
                      </td>
                    </tr>

                    {/* Expanded Row for Bank Accounts & Extra Details */}
                    {isExpanded && (
                      <tr className="expanded-content-row" style={!isReliable ? { backgroundColor: 'rgba(239, 68, 68, 0.04)', borderLeft: '5px solid #ef4444' } : undefined}>
                        <td colSpan={11} style={{ padding: '14px 20px 24px 20px', backgroundColor: '#f8fafc' }}>
                          <div style={{
                            background: '#ffffff',
                            borderRadius: '14px',
                            border: '1px solid #e2e8f0',
                            padding: '24px 28px',
                            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
                            margin: '4px 6px'
                          }}>
                            {/* Header row inside expanded card */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap', gap: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(138, 43, 226, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)', flexShrink: 0 }}>
                                  <Building size={20} />
                                </div>
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                      {proveedor.razonSocial}
                                    </h3>
                                    {proveedor.ruc && (
                                      <span className="badge" style={{ background: '#f1f5f9', color: '#475569', fontSize: '11px', fontFamily: 'monospace', fontWeight: 600 }}>
                                        RUC: {proveedor.ruc}
                                      </span>
                                    )}
                                    <span className="badge" style={{ background: 'rgba(138, 43, 226, 0.08)', color: 'var(--accent-primary)', fontSize: '11px' }}>
                                      {proveedor.ciudad || 'Lima'}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
                                    {proveedor.tipoProveedor === 'Brochure' ? '📄 Proveedor Prospecto / Enviaron Brochure' : '🤝 Proveedor Habitual (Ya trabajamos)'}
                                    {proveedor.web && (
                                      <> · <a href={getCleanWebUrl(proveedor.web) || '#'} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>{proveedor.web}</a></>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                {proveedor.driveFolderUrl ? (
                                  <a 
                                    href={proveedor.driveFolderUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="btn-secondary" 
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', padding: '7px 14px', borderRadius: '8px', color: '#0284c7', borderColor: '#bae6fd', background: '#f0f9ff' }}
                                  >
                                    <Folder size={15} /> Abrir en Google Drive
                                  </a>
                                ) : (
                                  <button
                                    className="btn-secondary"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', padding: '7px 14px', borderRadius: '8px' }}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        const res = await fetch(`${API_URL}/proveedores/${proveedor.id}/ensure-folder`, {
                                          method: 'POST',
                                          headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
                                        });
                                        if (res.ok) {
                                          toast.success('Carpeta creada en Google Drive');
                                          reloadProveedores();
                                        } else {
                                          toast.error('Error al crear carpeta');
                                        }
                                      } catch (err) {
                                        toast.error('Error de conexión');
                                      }
                                    }}
                                  >
                                    <Folder size={15} /> Crear Carpeta Drive
                                  </button>
                                )}

                                <button
                                  type="button"
                                  className="btn-secondary"
                                  onClick={() => {
                                    setProveedorToEdit(proveedor);
                                    setIsModalOpen(true);
                                  }}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 14px', borderRadius: '8px' }}
                                >
                                  <Edit size={14} /> Editar Proveedor
                                </button>
                              </div>
                            </div>

                            {/* 3 Cuadros Internos Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '22px' }}>
                              
                              {/* CUADRO INTERNO 1: Cuentas Bancarias */}
                              <div style={{
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '12px',
                                padding: '20px 22px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '14px'
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <CreditCard size={16} color="var(--accent-primary)" /> Cuentas Bancarias ({(proveedor.cuentas || []).length})
                                  </h4>
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => {
                                      setProveedorToEdit(proveedor);
                                      setIsModalOpen(true);
                                    }}
                                    style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '6px' }}
                                  >
                                    <Edit size={12} /> Gestionar
                                  </button>
                                </div>

                                {(proveedor.cuentas || []).length > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {(proveedor.cuentas || []).map(cta => (
                                      <div key={cta.id} style={{
                                        background: '#ffffff',
                                        padding: '14px 18px',
                                        borderRadius: '10px',
                                        border: '1px solid #e2e8f0',
                                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '6px'
                                      }}>
                                        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12.5px' }}>
                                          <span style={{ color: 'var(--accent-primary)' }}>🏦 {cta.banco || 'Banco'}</span>
                                          <span className="badge" style={{ fontSize: '10px', background: 'rgba(124, 58, 237, 0.08)', color: 'var(--accent-primary)' }}>{cta.tipoCuenta || 'Ahorros'}</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '4px', fontSize: '12px', marginTop: '2px' }}>
                                          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>N° Cuenta:</span>
                                          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)' }}>{cta.numeroCuenta || '-'}</span>
                                          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>CCI:</span>
                                          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)' }}>{cta.cci || '-'}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0, padding: '20px', textAlign: 'center', background: '#ffffff', borderRadius: '10px', border: '1px dashed #cbd5e1' }}>
                                    No hay cuentas bancarias registradas para este proveedor.
                                  </p>
                                )}
                              </div>

                              {/* CUADRO INTERNO 2: Muestras y Documentos */}
                              <div style={{
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '12px',
                                padding: '20px 22px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '14px'
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <ImageIcon size={16} color="var(--accent-primary)" /> Muestras y Documentos ({docs.length})
                                  </h4>
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => {
                                      setGalleryProveedor(proveedor);
                                      setIsGalleryOpen(true);
                                    }}
                                    style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '6px' }}
                                  >
                                    Ver Galería Completa
                                  </button>
                                </div>

                                {docs.length > 0 ? (
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
                                    {docs.slice(0, 4).map(d => {
                                      const fullUrl = d.url?.startsWith('http') ? d.url : `${BASE_URL}${d.url?.startsWith('/') ? '' : '/'}${d.url}`;
                                      const isImg = ['jpg', 'jpeg', 'png', 'webp'].includes(d.name?.toLowerCase().split('.').pop() || '') || d.tipo === 'Referencia';
                                      return (
                                        <a
                                          key={d.id}
                                          href={fullUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          style={{
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '10px',
                                            overflow: 'hidden',
                                            background: '#ffffff',
                                            textDecoration: 'none',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            fontSize: '11px',
                                            color: 'var(--text-primary)',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                                            transition: 'transform 0.15s ease'
                                          }}
                                        >
                                          <div style={{ height: '70px', background: 'rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                            {isImg ? (
                                              <img src={fullUrl} alt={d.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                                            ) : (
                                              <FileText size={24} color="var(--accent-primary)" />
                                            )}
                                          </div>
                                          <div style={{ padding: '6px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                                            {d.name}
                                          </div>
                                        </a>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0, padding: '20px', textAlign: 'center', background: '#ffffff', borderRadius: '10px', border: '1px dashed #cbd5e1' }}>
                                    No se han subido fotos de trabajos ni brochures todavía.
                                  </p>
                                )}
                              </div>

                              {/* CUADRO INTERNO 3: Clasificación y Especialidad */}
                              <div style={{
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '12px',
                                padding: '20px 22px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '14px'
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Tag size={16} color="var(--accent-primary)" /> Clasificación y Especialidad
                                  </h4>
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      type="button"
                                      className="btn-secondary"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setCatalogInitialTab('categorias');
                                        setIsCatalogModalOpen(true);
                                      }}
                                      style={{ padding: '3px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', borderRadius: '6px' }}
                                      title="Administrar catálogo de opciones por defecto"
                                    >
                                      <Tag size={12} /> Catálogo
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-secondary"
                                      onClick={() => {
                                        setProveedorToEdit(proveedor);
                                        setIsModalOpen(true);
                                      }}
                                      style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '6px' }}
                                    >
                                      <Edit size={12} /> Modificar
                                    </button>
                                  </div>
                                </div>

                                <div style={{ background: '#ffffff', padding: '16px 18px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                  {/* Categorías */}
                                  <div>
                                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                      Categorías ({((proveedor.categorias && proveedor.categorias.length > 0) ? proveedor.categorias : (proveedor.categoria ? [proveedor.categoria] : [])).length})
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                      {((proveedor.categorias && proveedor.categorias.length > 0) ? proveedor.categorias : (proveedor.categoria ? [proveedor.categoria] : [])).map((cat, idx) => (
                                        <span key={idx} className="badge" style={{ background: 'rgba(138, 43, 226, 0.12)', color: 'var(--accent-primary)', fontSize: '11px', fontWeight: 600, padding: '4px 10px' }}>
                                          📁 {cat}
                                        </span>
                                      ))}
                                      {(!proveedor.categorias || proveedor.categorias.length === 0) && !proveedor.categoria && (
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sin categorías asignadas</span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Subcategorías */}
                                  <div>
                                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                      Subcategorías ({(proveedor.subcategorias || []).length})
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                      {(proveedor.subcategorias || []).map((sc, idx) => (
                                        <span key={idx} style={{ background: 'rgba(2, 132, 199, 0.1)', color: '#0284c7', border: '1px solid rgba(2, 132, 199, 0.25)', fontSize: '11px', fontWeight: 500, padding: '3px 8px', borderRadius: '6px' }}>
                                          🔹 {sc}
                                        </span>
                                      ))}
                                      {(!proveedor.subcategorias || proveedor.subcategorias.length === 0) && (
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sin subcategorías registradas</span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Tags */}
                                  <div>
                                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                      Tags / Etiquetas ({(proveedor.tags || []).length})
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                      {(proveedor.tags || []).map((tg, idx) => (
                                        <span key={idx} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.25)', fontSize: '11px', fontWeight: 500, padding: '3px 8px', borderRadius: '6px' }}>
                                          #{tg}
                                        </span>
                                      ))}
                                      {(!proveedor.tags || proveedor.tags.length === 0) && (
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sin tags asignados</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>

                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
          </table>
          )}
        </div>

        {/* BARRA DE PAGINACIÓN DESKTOP */}
        {!isLoading && filteredProveedores.length > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 20px',
            borderTop: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-card)',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Mostrar</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  fontSize: '13px',
                  backgroundColor: 'var(--bg-main)',
                  color: 'var(--text-primary)'
                }}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={500}>Todos (500)</option>
              </select>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                proveedores por página • Mostrando {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, filteredProveedores.length)} de {filteredProveedores.length}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <span style={{ fontSize: '13px', fontWeight: 600, padding: '0 8px' }}>
                Página {currentPage} de {totalPages}
              </span>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
 
      
      {/* Mobile Adaptive Cards View for Proveedores */}
      <div className="mobile-cards-container">
        {paginatedProveedores.length === 0 ? (
          <div className="glass-panel" style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
            <Building size={32} color="var(--text-muted)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
            <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>No se encontraron proveedores que coincidan con los filtros.</p>
            {hasActiveFilters && (
              <button type="button" className="btn-secondary" onClick={resetFilters} style={{ margin: '12px auto 0', fontSize: '12px' }}>
                Restablecer Filtros
              </button>
            )}
          </div>
        ) : (
          paginatedProveedores.map(proveedor => {
            const isExpanded = expandedId === proveedor.id;
            const isReliable = proveedor.esConfiable !== false;
            const webUrl = getCleanWebUrl(proveedor.web);

            return (
              <div 
                key={proveedor.id} 
                className={`mobile-data-card ${!isReliable ? 'highlight-danger' : ''}`}
              >
                <div className="mobile-data-card-header">
                  <div style={{ minWidth: 0 }}>
                    <div className="mobile-data-card-title" style={{ color: !isReliable ? '#b91c1c' : undefined }}>
                      {proveedor.razonSocial}
                    </div>
                    <div className="mobile-data-card-subtitle">
                      <span>{proveedor.ruc ? `RUC: ${proveedor.ruc}` : 'Sin RUC'}</span>
                      {proveedor.ciudad && <span>• 📍 {proveedor.ciudad}</span>}
                    </div>
                  </div>
                  <span 
                    className={`badge ${isReliable ? 'badge-success' : 'badge-danger'}`}
                    style={{ flexShrink: 0, cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); handleToggleConfiable(proveedor); }}
                  >
                    {isReliable ? '🛡️ Confiable' : '⚠️ NO CONFIABLE'}
                  </span>
                </div>

                {!isReliable && proveedor.motivoNoConfiable && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '6px 10px', fontSize: '11px', color: '#991b1b', fontWeight: 500 }}>
                    ⚠️ Motivo: {proveedor.motivoNoConfiable}
                  </div>
                )}

                <div className="mobile-card-grid-meta">
                  <div className="mobile-card-meta-col">
                    <span className="mobile-card-meta-label">Categoría</span>
                    <span className="mobile-card-meta-val">{proveedor.categoria || (proveedor.categorias && proveedor.categorias[0]) || 'General'}</span>
                  </div>
                  <div className="mobile-card-meta-col">
                    <span className="mobile-card-meta-label">Contacto</span>
                    <span className="mobile-card-meta-val">{proveedor.nombre || '-'}</span>
                  </div>
                  <div className="mobile-card-meta-col">
                    <span className="mobile-card-meta-label">Teléfono</span>
                    <span className="mobile-card-meta-val">{proveedor.telefono || '-'}</span>
                  </div>
                  <div className="mobile-card-meta-col">
                    <span className="mobile-card-meta-label">Tipo</span>
                    <span className="mobile-card-meta-val">{proveedor.tipoProveedor || 'Habitual'}</span>
                  </div>
                </div>

                <div className="mobile-card-actions-row">
                  {proveedor.telefono && (
                    <a href={`tel:${proveedor.telefono}`} className="mobile-action-pill" title="Llamar">
                      <Phone size={13} />
                      <span>Llamar</span>
                    </a>
                  )}
                  {proveedor.correo && (
                    <a href={`mailto:${proveedor.correo}`} className="mobile-action-pill" title="Enviar correo">
                      <Mail size={13} />
                      <span>Correo</span>
                    </a>
                  )}
                  {webUrl && (
                    <a href={webUrl} target="_blank" rel="noopener noreferrer" className="mobile-action-pill" title="Visitar web">
                      <ExternalLink size={13} />
                      <span>Web</span>
                    </a>
                  )}
                  <button 
                    type="button" 
                    className="mobile-action-pill" 
                    onClick={() => {
                      setProveedorToEdit(proveedor);
                      setIsModalOpen(true);
                    }}
                    title="Editar Proveedor"
                  >
                    <Edit size={13} />
                    <span>Editar</span>
                  </button>
                  <button 
                    type="button" 
                    className="mobile-action-pill"
                    onClick={() => setExpandedId(isExpanded ? null : proveedor.id)}
                    style={{ background: isExpanded ? 'rgba(124, 58, 237, 0.12)' : undefined, color: isExpanded ? 'var(--accent-primary)' : undefined }}
                  >
                    <CreditCard size={13} />
                    <span>{proveedor.cuentas?.length || 0} Cuentas</span>
                    {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>
                  {(currentUserRole === 'Admin' || currentUserRole === 'Directorio') && (
                    <button 
                      type="button"
                      className="mobile-action-pill danger" 
                      onClick={() => {
                        if (window.confirm(`¿Borrar a '${proveedor.razonSocial}' permanentemente?`)) {
                          deleteProveedor(proveedor.id);
                        }
                      }}
                      title="Eliminar Proveedor"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                {/* Expanded Details: Bank Accounts and Drive Folder */}
                {isExpanded && (
                  <div className="mobile-card-expanded-box">
                    <div style={{ marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        Cuentas Bancarias Registradas:
                      </span>
                      {proveedor.cuentas && proveedor.cuentas.length > 0 ? (
                        proveedor.cuentas.map((c, idx) => (
                          <div key={c.id || idx} style={{ marginTop: '4px', fontSize: '12px', background: '#ffffff', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.banco} {c.tipoCuenta ? `(${c.tipoCuenta})` : ''}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>N°: {c.numeroCuenta} {c.cci && `• CCI: ${c.cci}`}</div>
                          </div>
                        ))
                      ) : (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
                          Sin cuentas bancarias registradas.
                        </div>
                      )}
                    </div>

                    {(proveedor.driveFolderUrl || proveedor.driveFolderId) && (
                      <div style={{ marginTop: '8px' }}>
                        <a 
                          href={proveedor.driveFolderUrl || `https://drive.google.com/drive/folders/${proveedor.driveFolderId}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500 }}
                        >
                          <Folder size={14} />
                          <span>Abrir Carpeta en Google Drive</span>
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Resumen inferior cuando hay 1 sola página o resultados filtrados */}
      {totalPages <= 1 && filteredProveedores.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '10px 4px', borderTop: '1px solid var(--border-color)', marginTop: '-8px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Mostrando {filteredProveedores.length} de {proveedores.length} proveedores {hasActiveFilters && '(filtros aplicados)'}
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="btn-secondary"
              style={{ padding: '4px 12px', fontSize: '11px', borderRadius: '14px' }}
            >
              ✕ Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '8px 0' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Página {currentPage} de {totalPages} ({filteredProveedores.length} proveedores en total)
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-secondary"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              style={{ padding: '5px 12px', fontSize: '12px' }}
            >
              Anterior
            </button>

            {/* Quick page numbers */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum = i + 1;
              if (totalPages > 5 && currentPage > 3) {
                pageNum = Math.min(currentPage - 2 + i, totalPages - 4 + i);
              }
              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setCurrentPage(pageNum)}
                  style={{
                    padding: '5px 10px',
                    fontSize: '12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    background: currentPage === pageNum ? 'var(--accent-primary)' : 'var(--bg-panel)',
                    color: currentPage === pageNum ? '#fff' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontWeight: currentPage === pageNum ? 700 : 400
                  }}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              type="button"
              className="btn-secondary"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              style={{ padding: '5px 12px', fontSize: '12px' }}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <CreateProveedorModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setProveedorToEdit(null);
        }}
        proveedorToEdit={proveedorToEdit}
      />

      <ProveedorGalleryModal
        isOpen={isGalleryOpen}
        onClose={() => {
          setIsGalleryOpen(false);
          setGalleryProveedor(null);
        }}
        proveedor={galleryProveedor}
        onUpdateProveedor={(updated) => {
          setGalleryProveedor(updated);
        }}
      />

      <ManageProveedorCatalogModal
        isOpen={isCatalogModalOpen}
        onClose={() => setIsCatalogModalOpen(false)}
        initialTab={catalogInitialTab}
      />

    </div>
  );
};
