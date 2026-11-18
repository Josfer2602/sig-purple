import React, { useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { X, Upload, FileText, Image as ImageIcon, ExternalLink, Trash2, Eye, Plus, Link as LinkIcon, Loader2, Building } from 'lucide-react';
import { useGlobalContext } from '../context/GlobalContext';
import { API_URL, BASE_URL } from '../utils/apiUrl';
import type { Proveedor, ProveedorDocumento } from '../types/models';
import toast from 'react-hot-toast';

interface ProveedorGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  proveedor: Proveedor | null;
  onUpdateProveedor?: (updated: Proveedor) => void;
}

export const ProveedorGalleryModal: React.FC<ProveedorGalleryModalProps> = ({
  isOpen,
  onClose,
  proveedor,
  onUpdateProveedor
}) => {
  const { updateProveedor, token } = useGlobalContext();
  const [activeTab, setActiveTab] = useState<'Todos' | 'Brochure' | 'Catálogo' | 'Referencia' | 'Otro'>('Todos');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedType, setSelectedType] = useState<'Brochure' | 'Catálogo' | 'Referencia' | 'Otro'>('Brochure');
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<string | null>(null);
  
  // External link mode
  const [showAddLinkForm, setShowAddLinkForm] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkType, setLinkType] = useState<'Brochure' | 'Catálogo' | 'Referencia' | 'Otro'>('Brochure');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen || !proveedor) return null;

  // Parse existing documents
  let docs: ProveedorDocumento[] = [];
  try {
    if (proveedor.documentos) {
      docs = typeof proveedor.documentos === 'string' ? JSON.parse(proveedor.documentos) : proveedor.documentos;
    }
  } catch (e) {
    docs = [];
  }

  const filteredDocs = activeTab === 'Todos' ? docs : docs.filter(d => d.tipo === activeTab);

  const getFullUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const isImageFile = (doc: ProveedorDocumento) => {
    const ext = doc.name.toLowerCase().split('.').pop() || '';
    const isExtImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
    return isExtImage || doc.tipo === 'Referencia';
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const newDocs: ProveedorDocumento[] = [...docs];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('proveedorId', proveedor.id);
        formData.append('proveedorNombre', proveedor.razonSocial || proveedor.nombre || 'Proveedor');

        const res = await fetch(`${API_URL}/drive/upload`, {
          method: 'POST',
          headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
          body: formData
        });

        if (res.ok) {
          const data = await res.json();
          const fileUrl = data.webViewLink || data.webContentLink || data.url || '';
          
          newDocs.push({
            id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name: file.name,
            url: fileUrl,
            tipo: selectedType,
            fecha: new Date().toISOString().split('T')[0],
            size: file.size
          });
        } else {
          toast.error(`Error al subir ${file.name}`);
        }
      }

      const updatedProveedor = {
        ...proveedor,
        documentos: JSON.stringify(newDocs)
      };

      await updateProveedor(updatedProveedor);
      if (onUpdateProveedor) onUpdateProveedor(updatedProveedor);
      toast.success('Documentos subidos con éxito');
    } catch (err: any) {
      toast.error('Error al subir archivos: ' + (err.message || ''));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddExternalLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkUrl || !linkTitle) {
      toast.error('Ingresa título y URL del enlace');
      return;
    }

    let validUrl = linkUrl.trim();
    if (!validUrl.startsWith('http://') && !validUrl.startsWith('https://')) {
      validUrl = `https://${validUrl}`;
    }

    const newDoc: ProveedorDocumento = {
      id: `doc-link-${Date.now()}`,
      name: linkTitle.trim(),
      url: validUrl,
      tipo: linkType,
      fecha: new Date().toISOString().split('T')[0]
    };

    const newDocs = [...docs, newDoc];
    const updatedProveedor = {
      ...proveedor,
      documentos: JSON.stringify(newDocs)
    };

    try {
      await updateProveedor(updatedProveedor);
      if (onUpdateProveedor) onUpdateProveedor(updatedProveedor);
      setLinkTitle('');
      setLinkUrl('');
      setShowAddLinkForm(false);
      toast.success('Enlace agregado exitosamente');
    } catch (err: any) {
      toast.error('Error al guardar el enlace');
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!window.confirm('¿Deseas eliminar este documento o referencia?')) return;

    const newDocs = docs.filter(d => d.id !== docId);
    const updatedProveedor = {
      ...proveedor,
      documentos: JSON.stringify(newDocs)
    };

    try {
      await updateProveedor(updatedProveedor);
      if (onUpdateProveedor) onUpdateProveedor(updatedProveedor);
      toast.success('Documento eliminado');
    } catch (err: any) {
      toast.error('Error al eliminar');
    }
  };

  return ReactDOM.createPortal(
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-content" style={{ maxWidth: '900px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        
        {/* Header */}
        <div className="modal-header" style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
            <div style={{ 
              width: '42px', height: '42px', borderRadius: '10px', 
              background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.15), rgba(75, 0, 130, 0.15))', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)',
              flexShrink: 0
            }}>
              <Building size={22} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 className="modal-title" style={{ margin: 0, fontSize: '1.25rem', wordBreak: 'break-word' }}>{proveedor.razonSocial}</h2>
                {proveedor.esConfiable === false && (
                  <span className="badge badge-danger" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>⚠️ No Confiable</span>
                )}
                {proveedor.tipoProveedor === 'Brochure' && (
                  <span className="badge badge-warning" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>Prospecto / Brochure</span>
                )}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                Referencias visuales de trabajos, brochures comerciales y catálogos
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {proveedor.driveFolderUrl && (
              <a 
                href={proveedor.driveFolderUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="btn-secondary" 
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '6px 12px', borderRadius: '8px', color: '#0284c7', borderColor: '#bae6fd', background: '#f0f9ff' }}
                title="Abrir Carpeta Oficial en Google Drive"
              >
                <LinkIcon size={14} /> Drive
              </a>
            )}
            <button className="btn-icon" onClick={onClose}><X size={20} /></button>
          </div>
        </div>

        {/* Action & Filter Bar */}
        <div style={{ padding: '14px 18px', background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--border-color)', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
          
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', overflowX: 'auto', maxWidth: '100%' }}>
            {(['Todos', 'Brochure', 'Catálogo', 'Referencia', 'Otro'] as const).map(tab => {
              const count = tab === 'Todos' ? docs.length : docs.filter(d => d.tipo === tab).length;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '12px',
                    fontWeight: activeTab === tab ? 600 : 500,
                    border: 'none',
                    cursor: 'pointer',
                    background: activeTab === tab ? 'var(--accent-primary)' : 'rgba(0,0,0,0.05)',
                    color: activeTab === tab ? '#fff' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {tab} ({count})
                </button>
              );
            })}
          </div>

          {/* Quick upload triggers */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <select
              value={selectedType}
              onChange={e => setSelectedType(e.target.value as any)}
              className="form-control"
              style={{ width: 'auto', padding: '6px 10px', fontSize: '12px' }}
              title="Tipo de documento a subir"
            >
              <option value="Brochure">Tipo: Brochure</option>
              <option value="Catálogo">Tipo: Catálogo</option>
              <option value="Referencia">Tipo: Referencia Visual</option>
              <option value="Otro">Tipo: Otro</option>
            </select>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              multiple
              accept="image/*,.pdf,.doc,.docx,.zip"
              style={{ display: 'none' }}
            />

            <button
              type="button"
              className="btn-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              style={{ padding: '6px 14px', fontSize: '12px' }}
            >
              {isUploading ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Subiendo...
                </>
              ) : (
                <>
                  <Upload size={14} /> Subir Archivos
                </>
              )}
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowAddLinkForm(!showAddLinkForm)}
              style={{ padding: '6px 12px', fontSize: '12px' }}
              title="Agregar enlace externo (Drive, Web, etc.)"
            >
              <LinkIcon size={14} /> Enlace
            </button>
          </div>
        </div>

        {/* Optional Add Link Form */}
        {showAddLinkForm && (
          <form onSubmit={handleAddExternalLink} style={{ padding: '14px 18px', background: 'rgba(138, 43, 226, 0.05)', borderBottom: '1px solid var(--border-color)', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Título / Descripción"
              value={linkTitle}
              onChange={e => setLinkTitle(e.target.value)}
              className="form-control"
              style={{ flex: '1 1 180px', minWidth: '150px', fontSize: '12px' }}
              required
            />
            <input
              type="text"
              placeholder="https://drive.google.com/... o enlace web"
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              className="form-control"
              style={{ flex: '2 1 240px', minWidth: '180px', fontSize: '12px' }}
              required
            />
            <select
              value={linkType}
              onChange={e => setLinkType(e.target.value as any)}
              className="form-control"
              style={{ flex: '1 1 120px', minWidth: '100px', fontSize: '12px' }}
            >
              <option value="Brochure">Brochure</option>
              <option value="Catálogo">Catálogo</option>
              <option value="Referencia">Referencia</option>
              <option value="Otro">Otro</option>
            </select>
            <button type="submit" className="btn-primary" style={{ padding: '6px 14px', fontSize: '12px', flex: '0 0 auto' }}>
              <Plus size={14} /> Guardar
            </button>
          </form>
        )}

        {/* Content Area / Documents Grid */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, minHeight: '300px' }}>
          {filteredDocs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <ImageIcon size={28} color="var(--text-muted)" />
              </div>
              <h4 style={{ margin: '0 0 6px', color: 'var(--text-primary)', fontSize: '15px' }}>
                No hay {activeTab === 'Todos' ? 'documentos o referencias' : activeTab.toLowerCase() + 's'} registrados
              </h4>
              <p style={{ margin: '0 0 16px', fontSize: '13px' }}>
                Sube fotos de trabajos anteriores, brochures de presentación o catálogos de este proveedor.
              </p>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => fileInputRef.current?.click()}
                style={{ margin: '0 auto', fontSize: '13px' }}
              >
                <Upload size={14} /> Seleccionar Archivos
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
              {filteredDocs.map(doc => {
                const fullUrl = getFullUrl(doc.url);
                const isImage = isImageFile(doc);

                return (
                  <div
                    key={doc.id}
                    style={{
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                      background: 'var(--bg-panel)',
                      display: 'flex',
                      flexDirection: 'column',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                      position: 'relative'
                    }}
                  >
                    {/* Visual Preview Header */}
                    <div style={{
                      height: '140px',
                      background: 'rgba(0,0,0,0.04)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      position: 'relative',
                      cursor: isImage ? 'pointer' : 'default'
                    }}
                    onClick={() => isImage && setSelectedPreviewImage(fullUrl)}
                    >
                      {isImage ? (
                        <img
                          src={fullUrl}
                          alt={doc.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => {
                            // Fallback if image fails to load
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div style={{ textAlign: 'center', padding: '16px' }}>
                          <FileText size={40} color="var(--accent-primary)" style={{ opacity: 0.85 }} />
                          <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', textTransform: 'uppercase', fontWeight: 600 }}>
                            {doc.name.split('.').pop() || 'DOC'}
                          </span>
                        </div>
                      )}

                      {/* Type Badge */}
                      <span
                        className={`badge ${doc.tipo === 'Brochure' ? 'badge-info' : doc.tipo === 'Catálogo' ? 'badge-success' : 'badge-warning'}`}
                        style={{ position: 'absolute', top: '8px', left: '8px', fontSize: '10px' }}
                      >
                        {doc.tipo}
                      </span>
                    </div>

                    {/* Meta info & actions */}
                    <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.name}>
                        {doc.name}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                        <span>{doc.fecha || 'Reciente'}</span>
                        {doc.size ? <span>{Math.round(doc.size / 1024)} KB</span> : null}
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '6px', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                        <a
                          href={fullUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary"
                          style={{ flex: 1, padding: '4px 8px', fontSize: '11px', justifyContent: 'center', textDecoration: 'none' }}
                          title="Abrir en pestaña nueva"
                        >
                          <ExternalLink size={12} /> Abrir
                        </a>

                        {isImage && (
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => setSelectedPreviewImage(fullUrl)}
                            title="Ver imagen grande"
                            style={{ padding: '4px 6px' }}
                          >
                            <Eye size={14} />
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => handleDeleteDoc(doc.id)}
                          title="Eliminar"
                          style={{ color: 'var(--danger)', padding: '4px 6px' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Total: {docs.length} {docs.length === 1 ? 'documento o referencia' : 'documentos y referencias'}
          </span>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>

      {/* Lightbox / Image Zoom Modal */}
      {selectedPreviewImage && (
        <div
          className="modal-overlay"
          style={{ zIndex: 1200, background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setSelectedPreviewImage(null)}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <button
              className="btn-icon"
              onClick={() => setSelectedPreviewImage(null)}
              style={{ position: 'absolute', top: '-40px', right: '0', color: '#fff', background: 'rgba(255,255,255,0.2)', borderRadius: '50%' }}
            >
              <X size={20} />
            </button>
            <img
              src={selectedPreviewImage}
              alt="Vista previa ampliada"
              style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
            />
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};
