import React, { useState, useEffect, useMemo } from 'react';
import { 
  Folder, FolderPlus, FileText, FileSpreadsheet, Image, Video, 
  Archive, ExternalLink, Download, Search, RefreshCw, Upload, 
  ChevronRight, ArrowLeft, Grid, List, Copy, HardDrive, 
  X, File
} from 'lucide-react';
import { useGlobalContext, API_URL } from '../context/GlobalContext';
import toast from 'react-hot-toast';

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  sizeBytes?: number;
  modifiedTime?: string;
  createdTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  isFolder: boolean;
  fileExtension?: string;
  iconType: 'folder' | 'pdf' | 'sheet' | 'doc' | 'slide' | 'image' | 'video' | 'zip' | 'audio' | 'other';
  owners?: { displayName?: string; emailAddress?: string; photoLink?: string }[];
}

interface SharedDrive {
  id: string;
  name: string;
  colorRgb?: string;
  canAddChildren?: boolean;
}

interface BreadcrumbItem {
  id?: string;
  name: string;
}

export const DriveView: React.FC = () => {
  const { token, currentUser } = useGlobalContext();
  const [sharedDrives, setSharedDrives] = useState<SharedDrive[]>([]);
  const [selectedDriveId, setSelectedDriveId] = useState<string>(''); // '' = Mi Unidad personal o default
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { id: undefined, name: 'Google Drive' }
  ]);
  const [files, setFiles] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Modales
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const currentFolderId = breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 1].id : undefined;

  const authHeaders = useMemo(() => ({
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  }), [token]);

  const userEmailQuery = currentUser?.email ? `userEmail=${encodeURIComponent(currentUser.email)}` : '';

  // 1. Cargar Unidades Compartidas
  const fetchSharedDrives = async () => {
    try {
      const q = userEmailQuery ? `?${userEmailQuery}` : '';
      const res = await fetch(`${API_URL}/drive/shared-drives${q}`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        const drives: SharedDrive[] = data.drives || [];
        setSharedDrives(drives);
        
        // Si hay una unidad compartida y no se ha seleccionado ninguna, seleccionar la primera (o la que contenga Purple)
        if (drives.length > 0 && !selectedDriveId) {
          const purpleDrive = drives.find(d => d.name.toLowerCase().includes('purple')) || drives[0];
          setSelectedDriveId(purpleDrive.id);
          setBreadcrumbs([{ id: purpleDrive.id, name: purpleDrive.name }]);
        }
      }
    } catch (e) {
      console.error('Error al cargar unidades compartidas:', e);
    }
  };

  // 2. Cargar Archivos de la carpeta o unidad compartida actual
  const fetchFiles = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams();
      if (userEmailQuery) params.set('userEmail', currentUser?.email || '');
      if (selectedDriveId) params.set('driveId', selectedDriveId);
      if (currentFolderId && currentFolderId !== selectedDriveId) {
        params.set('folderId', currentFolderId);
      }
      if (searchTerm.trim()) {
        params.set('searchTerm', searchTerm.trim());
      }

      const res = await fetch(`${API_URL}/drive/files?${params.toString()}`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      } else {
        const err = await res.json().catch(() => ({}));
        if (res.status === 401 || (err.error && err.error.includes('credenciales'))) {
          toast.error('Inicia sesión con Google Workspace para acceder a Google Drive');
        } else {
          toast.error(err.error || 'Error cargando archivos de Google Drive');
        }
        setFiles([]);
      }
    } catch (e: any) {
      toast.error('Error de conexión con Google Drive');
      setFiles([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSharedDrives();
  }, [currentUser?.email]);

  useEffect(() => {
    fetchFiles();
  }, [selectedDriveId, currentFolderId, currentUser?.email]);

  // Manejo de cambio de unidad compartida
  const handleDriveChange = (driveId: string) => {
    setSelectedDriveId(driveId);
    setSearchTerm('');
    if (driveId) {
      const targetDrive = sharedDrives.find(d => d.id === driveId);
      setBreadcrumbs([{ id: driveId, name: targetDrive?.name || 'Unidad Compartida' }]);
    } else {
      setBreadcrumbs([{ id: undefined, name: 'Mi Unidad' }]);
    }
  };

  // Entrar a una carpeta
  const handleOpenFolder = (folder: DriveItem) => {
    setSearchTerm('');
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]);
  };

  // Navegar mediante breadcrumbs
  const handleBreadcrumbClick = (index: number) => {
    setSearchTerm('');
    setBreadcrumbs(prev => prev.slice(0, index + 1));
  };

  // Subir un nivel
  const handleGoBack = () => {
    if (breadcrumbs.length > 1) {
      setSearchTerm('');
      setBreadcrumbs(prev => prev.slice(0, prev.length - 1));
    }
  };

  // Búsqueda
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchFiles();
  };

  // Crear Carpeta
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    setIsCreatingFolder(true);
    try {
      const res = await fetch(`${API_URL}/drive/folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          name: newFolderName.trim(),
          parentFolderId: currentFolderId !== selectedDriveId ? currentFolderId : undefined,
          driveId: selectedDriveId || undefined,
          userEmail: currentUser?.email
        })
      });

      if (res.ok) {
        toast.success(`Carpeta "${newFolderName}" creada`);
        setNewFolderName('');
        setShowFolderModal(false);
        fetchFiles(true);
      } else {
        const err = await res.json();
        toast.error(err.error || 'Error al crear carpeta');
      }
    } catch (e) {
      toast.error('Error de conexión al crear carpeta');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  // Subir Archivo
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUploadFile) {
      toast.error('Selecciona un archivo');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedUploadFile);
      if (currentFolderId && currentFolderId !== selectedDriveId) {
        formData.append('parentFolderId', currentFolderId);
      }
      if (selectedDriveId) {
        formData.append('driveId', selectedDriveId);
      }
      if (currentUser?.email) {
        formData.append('userEmail', currentUser.email);
      }

      const res = await fetch(`${API_URL}/drive/upload`, {
        method: 'POST',
        headers: authHeaders,
        body: formData
      });

      if (res.ok) {
        toast.success(`Archivo "${selectedUploadFile.name}" subido con éxito`);
        setSelectedUploadFile(null);
        setShowUploadModal(false);
        fetchFiles(true);
      } else {
        const err = await res.json();
        toast.error(err.error || 'Error al subir archivo');
      }
    } catch (e) {
      toast.error('Error de conexión al subir archivo');
    } finally {
      setIsUploading(false);
    }
  };

  // Copiar Enlace
  const handleCopyLink = (link?: string) => {
    if (!link) return;
    navigator.clipboard.writeText(link);
    toast.success('Enlace de Google Drive copiado');
  };

  // Renderizador de Ícono según tipo
  const renderItemIcon = (item: DriveItem) => {
    if (item.isFolder) {
      return <Folder size={24} color="#7c3aed" fill="rgba(124, 58, 237, 0.15)" />;
    }

    switch (item.iconType) {
      case 'sheet':
        return <FileSpreadsheet size={22} color="#10b981" />;
      case 'doc':
        return <FileText size={22} color="#2563eb" />;
      case 'pdf':
        return <FileText size={22} color="#ef4444" />;
      case 'slide':
        return <FileText size={22} color="#f59e0b" />;
      case 'image':
        return <Image size={22} color="#8b5cf6" />;
      case 'video':
        return <Video size={22} color="#ec4899" />;
      case 'zip':
        return <Archive size={22} color="#64748b" />;
      default:
        return <File size={22} color="#94a3b8" />;
    }
  };

  const getBadgeTypeColor = (type: DriveItem['iconType']) => {
    switch (type) {
      case 'folder': return { bg: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed' };
      case 'sheet': return { bg: 'rgba(16, 185, 129, 0.1)', color: '#059669' };
      case 'doc': return { bg: 'rgba(37, 99, 235, 0.1)', color: '#2563eb' };
      case 'pdf': return { bg: 'rgba(239, 68, 68, 0.1)', color: '#dc2626' };
      case 'slide': return { bg: 'rgba(245, 158, 11, 0.1)', color: '#d97706' };
      case 'image': return { bg: 'rgba(139, 92, 246, 0.1)', color: '#7c3aed' };
      case 'video': return { bg: 'rgba(236, 72, 153, 0.1)', color: '#db2777' };
      default: return { bg: 'rgba(100, 116, 139, 0.1)', color: '#475569' };
    }
  };

  return (
    <div className="view-container">
      {/* HEADER */}
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          backgroundColor: 'rgba(38, 132, 252, 0.08)',
          border: '1px solid rgba(38, 132, 252, 0.2)',
          borderRadius: '20px',
          fontSize: '0.82rem',
          fontWeight: 600,
          color: '#0066DA'
        }}>
          <Folder size={15} />
          <span>Unidad Compartida Purple BTL</span>
        </div>

        {/* Acciones principales */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button 
            className="btn-secondary" 
            onClick={() => fetchFiles(true)} 
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            <span>Actualizar</span>
          </button>

          <button 
            className="btn-secondary" 
            onClick={() => setShowFolderModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
          >
            <FolderPlus size={15} color="#7c3aed" />
            <span>Nueva Carpeta</span>
          </button>

          <button 
            className="btn-primary" 
            onClick={() => setShowUploadModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
          >
            <Upload size={15} />
            <span>Subir Archivo</span>
          </button>
        </div>
      </div>

      {/* SELECTOR DE UNIDAD & BUSCADOR */}
      <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          {/* Selector de Unidades Compartidas */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 320px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Unidad:
            </span>
            <select
              className="form-control"
              value={selectedDriveId}
              onChange={(e) => handleDriveChange(e.target.value)}
              style={{
                fontSize: '13px',
                fontWeight: '600',
                padding: '6px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(124, 58, 237, 0.3)',
                background: 'rgba(124, 58, 237, 0.04)',
                color: 'var(--text-primary)',
                minWidth: '240px',
                cursor: 'pointer'
              }}
            >
              {sharedDrives.map(d => (
                <option key={d.id} value={d.id}>
                  📁 {d.name} (Compartida)
                </option>
              ))}
              <option value="">👤 Mi Unidad (Personal)</option>
            </select>
          </div>

          {/* Buscador Rápido */}
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px', flex: '1 1 280px', maxWidth: '400px' }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <Search size={16} color="var(--text-secondary)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                className="form-control"
                placeholder="Buscar archivos en Drive..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ paddingLeft: '36px', fontSize: '13px' }}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => { setSearchTerm(''); fetchFiles(); }}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button type="submit" className="btn-secondary" style={{ padding: '8px 14px' }}>
              Buscar
            </button>
          </form>

          {/* Toggle Modo de Vista */}
          <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-secondary, #f1f5f9)', padding: '3px', borderRadius: '8px' }}>
            <button
              className={`btn-icon ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Vista en Cuadrícula"
              style={{ padding: '6px', borderRadius: '6px', background: viewMode === 'grid' ? '#fff' : 'transparent', boxShadow: viewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
            >
              <Grid size={16} color={viewMode === 'grid' ? '#7c3aed' : 'var(--text-secondary)'} />
            </button>
            <button
              className={`btn-icon ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Vista en Lista"
              style={{ padding: '6px', borderRadius: '6px', background: viewMode === 'table' ? '#fff' : 'transparent', boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
            >
              <List size={16} color={viewMode === 'table' ? '#7c3aed' : 'var(--text-secondary)'} />
            </button>
          </div>
        </div>
      </div>

      {/* BREADCRUMBS / RUTA ACTUAL */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginBottom: '16px',
        padding: '8px 12px',
        background: 'rgba(255,255,255,0.6)',
        borderRadius: '10px',
        border: '1px solid var(--border-color)',
        overflowX: 'auto',
        fontSize: '13px'
      }}>
        {breadcrumbs.length > 1 && (
          <button 
            onClick={handleGoBack}
            className="btn-icon" 
            title="Subir un nivel" 
            style={{ marginRight: '6px', padding: '4px' }}
          >
            <ArrowLeft size={16} />
          </button>
        )}

        {breadcrumbs.map((crumb, idx) => {
          const isLast = idx === breadcrumbs.length - 1;
          return (
            <React.Fragment key={crumb.id || `crumb-${idx}`}>
              {idx > 0 && <ChevronRight size={14} color="var(--text-secondary)" />}
              <button
                onClick={() => !isLast && handleBreadcrumbClick(idx)}
                disabled={isLast}
                style={{
                  background: isLast ? 'rgba(124, 58, 237, 0.08)' : 'transparent',
                  border: isLast ? '1px solid rgba(124, 58, 237, 0.2)' : 'none',
                  color: isLast ? '#7c3aed' : 'var(--text-secondary)',
                  fontWeight: isLast ? '600' : '500',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  cursor: isLast ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {idx === 0 && <HardDrive size={14} />}
                <span>{crumb.name}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* CONTENIDO PRINCIPAL: ARCHIVOS Y CARPETAS */}
      {loading ? (
        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center' }}>
          <RefreshCw size={32} className="animate-spin" color="#7c3aed" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Cargando archivos de Google Drive...</p>
        </div>
      ) : files.length === 0 ? (
        <div className="glass-panel" style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(124, 58, 237, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px'
          }}>
            <Folder size={32} color="#7c3aed" />
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
            {searchTerm ? 'No se encontraron archivos' : 'Esta carpeta está vacía'}
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', maxWidth: '420px', margin: '0 auto 20px' }}>
            {searchTerm 
              ? `No hay archivos que coincidan con la búsqueda "${searchTerm}".` 
              : 'Puedes subir archivos o crear una nueva carpeta para organizar tus documentos.'}
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button className="btn-secondary" onClick={() => setShowFolderModal(true)}>
              <FolderPlus size={15} /> Nueva Carpeta
            </button>
            <button className="btn-primary" onClick={() => setShowUploadModal(true)}>
              <Upload size={15} /> Subir Archivo
            </button>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        /* VISTA EN CUADRÍCULA (GRID) */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '16px'
        }}>
          {files.map(item => {
            const badgeStyle = getBadgeTypeColor(item.iconType);
            return (
              <div
                key={item.id}
                className="glass-panel"
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'all 0.2s ease',
                  cursor: item.isFolder ? 'pointer' : 'default',
                  border: item.isFolder ? '1px solid rgba(124, 58, 237, 0.2)' : '1px solid var(--border-color)',
                  background: item.isFolder ? 'rgba(124, 58, 237, 0.02)' : 'var(--bg-panel)'
                }}
                onDoubleClick={() => item.isFolder ? handleOpenFolder(item) : (item.webViewLink && window.open(item.webViewLink, '_blank'))}
              >
                {/* Cabecera de la tarjeta */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: item.isFolder ? 'rgba(124, 58, 237, 0.08)' : 'rgba(0,0,0,0.03)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {renderItemIcon(item)}
                  </div>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: '600',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: badgeStyle.bg,
                    color: badgeStyle.color,
                    textTransform: 'uppercase'
                  }}>
                    {item.isFolder ? 'Carpeta' : (item.fileExtension || item.iconType)}
                  </span>
                </div>

                {/* Nombre y datos */}
                <div style={{ marginBottom: '12px', flex: 1 }}>
                  <div
                    title={item.name}
                    onClick={() => item.isFolder && handleOpenFolder(item)}
                    style={{
                      fontWeight: '600',
                      fontSize: '13px',
                      lineHeight: '1.4',
                      color: item.isFolder ? '#7c3aed' : 'var(--text-primary)',
                      cursor: item.isFolder ? 'pointer' : 'default',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      wordBreak: 'break-word',
                      marginBottom: '6px'
                    }}
                  >
                    {item.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', gap: '8px' }}>
                    {item.size && <span>{item.size}</span>}
                    {item.modifiedTime && (
                      <span>• {new Date(item.modifiedTime).toLocaleDateString('es-PE')}</span>
                    )}
                  </div>
                </div>

                {/* Acciones */}
                <div style={{
                  display: 'flex',
                  justifyContent: item.isFolder ? 'space-between' : 'flex-end',
                  alignItems: 'center',
                  paddingTop: '10px',
                  borderTop: '1px solid var(--border-color)',
                  gap: '6px'
                }}>
                  {item.isFolder ? (
                    <button
                      className="btn-secondary"
                      onClick={() => handleOpenFolder(item)}
                      style={{ fontSize: '11px', padding: '4px 10px', width: '100%', justifyContent: 'center' }}
                    >
                      Abrir Carpeta
                    </button>
                  ) : (
                    <>
                      {item.webViewLink && (
                        <button
                          className="btn-icon"
                          title="Copiar enlace"
                          onClick={() => handleCopyLink(item.webViewLink)}
                        >
                          <Copy size={14} />
                        </button>
                      )}
                      {item.webContentLink && (
                        <a
                          href={item.webContentLink}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-icon"
                          title="Descargar archivo"
                          download
                        >
                          <Download size={14} />
                        </a>
                      )}
                      {item.webViewLink && (
                        <a
                          href={item.webViewLink}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-secondary"
                          style={{ fontSize: '11px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <ExternalLink size={12} />
                          <span>Ver</span>
                        </a>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* VISTA EN LISTA (TABLE) */
        <div className="desktop-table-container glass-panel table-container">
          <div 
            className="custom-table-scroll" 
            style={{ 
              maxHeight: 'calc(100vh - 320px)', 
              minHeight: '350px', 
              overflowX: 'auto', 
              overflowY: 'auto', 
              position: 'relative' 
            }}
          >
            <table className="data-table" style={{ width: '100%', minWidth: '850px', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
              <colgroup>
                <col style={{ width: '50px' }} />
                <col style={{ width: '300px' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '130px' }} />
                <col style={{ width: '140px' }} />
              </colgroup>
              <thead style={{ position: 'sticky', top: 0, zIndex: 12, backgroundColor: '#f8fafc' }}>
                <tr>
                  <th className="header-custom" style={{ width: '50px', textAlign: 'center' }}></th>
                  <th className="header-custom">NOMBRE</th>
                  <th className="header-custom" style={{ width: '120px' }}>TIPO</th>
                  <th className="header-custom" style={{ width: '110px' }}>TAMAÑO</th>
                  <th className="header-custom" style={{ width: '130px' }}>MODIFICADO</th>
                  <th className="header-custom sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 16, backgroundColor: '#f8fafc', width: '140px', textAlign: 'right' }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {files.map(item => {
                  const badgeStyle = getBadgeTypeColor(item.iconType);
                  return (
                    <tr 
                      key={item.id}
                      onDoubleClick={() => item.isFolder ? handleOpenFolder(item) : (item.webViewLink && window.open(item.webViewLink, '_blank'))}
                      style={{ cursor: item.isFolder ? 'pointer' : 'default' }}
                    >
                      <td className="td-custom" style={{ textAlign: 'center' }}>
                        {renderItemIcon(item)}
                      </td>
                      <td className="td-custom">
                        <div
                          onClick={() => item.isFolder && handleOpenFolder(item)}
                          style={{
                            fontWeight: item.isFolder ? '600' : '500',
                            color: item.isFolder ? '#7c3aed' : 'var(--text-primary)',
                            cursor: item.isFolder ? 'pointer' : 'default',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <span>{item.name}</span>
                        </div>
                      </td>
                      <td className="td-custom">
                        <span style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: badgeStyle.bg,
                          color: badgeStyle.color,
                          fontWeight: '600',
                          textTransform: 'uppercase'
                        }}>
                          {item.isFolder ? 'Carpeta' : (item.fileExtension || item.iconType)}
                        </span>
                      </td>
                      <td className="td-custom" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {item.size || '—'}
                      </td>
                      <td className="td-custom" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {item.modifiedTime ? new Date(item.modifiedTime).toLocaleDateString('es-PE') : '—'}
                      </td>
                      <td className="td-custom sticky-col-right" style={{ position: 'sticky', right: 0, zIndex: 10, backgroundColor: 'inherit', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end' }}>
                          {item.isFolder ? (
                            <button
                              className="btn-secondary"
                              onClick={() => handleOpenFolder(item)}
                              style={{ fontSize: '11px', padding: '4px 8px' }}
                            >
                              Abrir
                            </button>
                          ) : (
                            <>
                              {item.webViewLink && (
                                <button
                                  className="btn-icon"
                                  title="Copiar enlace"
                                  onClick={() => handleCopyLink(item.webViewLink)}
                                >
                                  <Copy size={14} />
                                </button>
                              )}
                              {item.webContentLink && (
                                <a
                                  href={item.webContentLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn-icon"
                                  title="Descargar"
                                  download
                                >
                                  <Download size={14} />
                                </a>
                              )}
                              {item.webViewLink && (
                                <a
                                  href={item.webViewLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn-icon"
                                  title="Abrir en Google Drive"
                                >
                                  <ExternalLink size={14} color="#7c3aed" />
                                </a>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: NUEVA CARPETA */}
      {showFolderModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(4px)'
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '24px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FolderPlus size={20} color="#7c3aed" /> Nueva Carpeta
              </h3>
              <button className="btn-icon" onClick={() => setShowFolderModal(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateFolder}>
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)' }}>Nombre de la Carpeta</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Ej. Proyectos 2026, Campaña Navidad..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowFolderModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={isCreatingFolder}>
                  {isCreatingFolder ? 'Creando...' : 'Crear Carpeta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SUBIR ARCHIVO */}
      {showUploadModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(4px)'
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '480px', padding: '24px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Upload size={20} color="#7c3aed" /> Subir Archivo a Drive
              </h3>
              <button className="btn-icon" onClick={() => setShowUploadModal(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleUploadSubmit}>
              <div style={{
                border: '2px dashed rgba(124, 58, 237, 0.3)',
                borderRadius: '12px',
                padding: '30px 20px',
                textAlign: 'center',
                marginBottom: '20px',
                background: 'rgba(124, 58, 237, 0.02)'
              }}>
                <Upload size={32} color="#7c3aed" style={{ margin: '0 auto 10px' }} />
                <p style={{ fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                  {selectedUploadFile ? selectedUploadFile.name : 'Selecciona un archivo para subir'}
                </p>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '14px' }}>
                  {selectedUploadFile ? `${(selectedUploadFile.size / (1024 * 1024)).toFixed(2)} MB` : 'PDF, Excel, Word, Imágenes, Videos'}
                </span>
                <label className="btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                  <span>Examinar archivos</span>
                  <input
                    type="file"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedUploadFile(e.target.files[0]);
                      }
                    }}
                  />
                </label>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowUploadModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={isUploading || !selectedUploadFile}>
                  {isUploading ? 'Subiendo archivo...' : 'Subir a Drive'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
