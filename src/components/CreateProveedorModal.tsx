import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { X, Save, Plus, Trash2, Upload, FileText, Image as ImageIcon, ExternalLink, Globe, MapPin, AlertTriangle, ShieldCheck, Link as LinkIcon, Loader2, Tag, Layers, FolderTree } from 'lucide-react';
import { useGlobalContext } from '../context/GlobalContext';
import { ManageProveedorCatalogModal } from './ManageProveedorCatalogModal';
import { API_URL, BASE_URL } from '../utils/apiUrl';
import type { Proveedor, CuentaBancaria, ProveedorDocumento } from '../types/models';
import toast from 'react-hot-toast';

interface CreateProveedorModalProps {
  isOpen: boolean;
  onClose: () => void;
  proveedorToEdit?: Proveedor | null;
}

export const CreateProveedorModal: React.FC<CreateProveedorModalProps> = ({ isOpen, onClose, proveedorToEdit }) => {
  const { addProveedor, updateProveedor, proveedores, listas, token } = useGlobalContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [catalogInitialTab, setCatalogInitialTab] = useState<'categorias' | 'subcategorias' | 'tags'>('categorias');
  
  const [formData, setFormData] = useState<Partial<Proveedor>>({
    razonSocial: '',
    nombre: '',
    ruc: '',
    correo: '',
    telefono: '',
    tipoDocumento: 'Factura',
    categoria: '',
    ciudad: 'Lima',
    web: '',
    tipoProveedor: 'Trabajado',
    esConfiable: true,
    motivoNoConfiable: '',
    documentos: '[]',
    cuentas: []
  });

  const [selectedCategorias, setSelectedCategorias] = useState<string[]>([]);
  const [selectedSubcategorias, setSelectedSubcategorias] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [categoriaInput, setCategoriaInput] = useState('');
  const [subcategoriaInput, setSubcategoriaInput] = useState('');
  const [tagInput, setTagInput] = useState('');

  const [docList, setDocList] = useState<ProveedorDocumento[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadDocType, setUploadDocType] = useState<'Brochure' | 'Catálogo' | 'Referencia' | 'Otro'>('Brochure');
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkType, setLinkType] = useState<'Brochure' | 'Catálogo' | 'Referencia' | 'Otro'>('Brochure');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Derive unique categories, subcategories, tags and cities
  const allExistingCategories = useMemo(() => {
    const set = new Set<string>(listas?.categoriasProveedor || []);
    proveedores.forEach(p => {
      if (p.categoria) set.add(p.categoria.trim());
      (p.categorias || []).forEach(c => { if (c && c.trim()) set.add(c.trim()); });
    });
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [proveedores, listas?.categoriasProveedor]);

  const allExistingSubcategories = useMemo(() => {
    const set = new Set<string>(listas?.subcategoriasProveedor || []);
    proveedores.forEach(p => {
      (p.subcategorias || []).forEach(sc => { if (sc && sc.trim()) set.add(sc.trim()); });
    });
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [proveedores, listas?.subcategoriasProveedor]);

  const allExistingTags = useMemo(() => {
    const set = new Set<string>(listas?.tagsProveedor || [
      'Acreditado', '24/7', 'Urgente', 'Stands', 'BTL', 'Feria', 'Eventos', 'Con movilidad', 'Económico', 'Premium'
    ]);
    proveedores.forEach(p => {
      (p.tags || []).forEach(t => { if (t && t.trim()) set.add(t.trim()); });
    });
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [proveedores, listas?.tagsProveedor]);

  const existingCities = Array.from(new Set(['Lima', 'Arequipa', 'Trujillo', 'Cusco', 'Chiclayo', 'Piura', ...proveedores.map(p => p.ciudad).filter(Boolean)])) as string[];

  useEffect(() => {
    if (proveedorToEdit) {
      setFormData({
        ...proveedorToEdit,
        ciudad: proveedorToEdit.ciudad || 'Lima',
        tipoProveedor: proveedorToEdit.tipoProveedor || 'Trabajado',
        esConfiable: proveedorToEdit.esConfiable !== undefined ? proveedorToEdit.esConfiable : true,
        motivoNoConfiable: proveedorToEdit.motivoNoConfiable || '',
        categoria: proveedorToEdit.categoria || '',
        web: proveedorToEdit.web || ''
      });

      let initialCats: string[] = [];
      if (Array.isArray(proveedorToEdit.categorias) && proveedorToEdit.categorias.length > 0) {
        initialCats = [...proveedorToEdit.categorias];
      } else if (proveedorToEdit.categoria) {
        initialCats = [proveedorToEdit.categoria.trim()];
      }
      setSelectedCategorias(initialCats);
      setSelectedSubcategorias(Array.isArray(proveedorToEdit.subcategorias) ? [...proveedorToEdit.subcategorias] : []);
      setSelectedTags(Array.isArray(proveedorToEdit.tags) ? [...proveedorToEdit.tags] : []);

      try {
        if (proveedorToEdit.documentos) {
          const parsed = typeof proveedorToEdit.documentos === 'string' ? JSON.parse(proveedorToEdit.documentos) : proveedorToEdit.documentos;
          setDocList(Array.isArray(parsed) ? parsed : []);
        } else {
          setDocList([]);
        }
      } catch (e) {
        setDocList([]);
      }
    } else {
      setFormData({
        razonSocial: '',
        nombre: '',
        ruc: '',
        correo: '',
        telefono: '',
        tipoDocumento: 'Factura',
        categoria: '',
        ciudad: 'Lima',
        web: '',
        tipoProveedor: 'Trabajado',
        esConfiable: true,
        motivoNoConfiable: '',
        documentos: '[]',
        cuentas: []
      });
      setSelectedCategorias([]);
      setSelectedSubcategorias([]);
      setSelectedTags([]);
      setCategoriaInput('');
      setSubcategoriaInput('');
      setTagInput('');
      setDocList([]);
    }
  }, [proveedorToEdit, isOpen]);

  if (!isOpen) return null;

  const handleAddCuenta = () => {
    setFormData(prev => ({
      ...prev,
      cuentas: [...(prev.cuentas || []), { id: `acc-${Date.now()}`, banco: '', numeroCuenta: '', cci: '', tipoCuenta: 'Ahorros' }]
    }));
  };

  const handleRemoveCuenta = (id: string) => {
    setFormData(prev => ({
      ...prev,
      cuentas: (prev.cuentas || []).filter(c => c.id !== id)
    }));
  };

  const handleCuentaChange = (id: string, field: keyof CuentaBancaria, value: string) => {
    setFormData(prev => ({
      ...prev,
      cuentas: (prev.cuentas || []).map(c => c.id === id ? { ...c, [field]: value } : c)
    }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const newDocs = [...docList];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fd = new FormData();
        fd.append('file', file);
        if (formData.id) {
          fd.append('proveedorId', formData.id);
        }
        if (formData.razonSocial || formData.nombre) {
          fd.append('proveedorNombre', formData.razonSocial || formData.nombre || '');
        }

        const res = await fetch(`${API_URL}/drive/upload`, {
          method: 'POST',
          headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
          body: fd
        });

        if (res.ok) {
          const data = await res.json();
          const fileUrl = data.webViewLink || data.webContentLink || data.url || '';
          newDocs.push({
            id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name: file.name,
            url: fileUrl,
            tipo: uploadDocType,
            fecha: new Date().toISOString().split('T')[0],
            size: file.size
          });
        } else {
          toast.error(`Error subiendo ${file.name}`);
        }
      }

      setDocList(newDocs);
      toast.success('Archivo(s) cargado(s) correctamente');
    } catch (err: any) {
      toast.error('Error al subir archivos');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddLinkDoc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkTitle || !linkUrl) return;

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

    setDocList([...docList, newDoc]);
    setLinkTitle('');
    setLinkUrl('');
    setShowAddLink(false);
    toast.success('Enlace adjuntado');
  };

  const handleRemoveDoc = (id: string) => {
    setDocList(docList.filter(d => d.id !== id));
  };

  const getFullUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const handleAddCategoria = (catName: string) => {
    const trimmed = catName.trim();
    if (!trimmed) return;
    if (!selectedCategorias.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      setSelectedCategorias(prev => [...prev, trimmed]);
    }
    setCategoriaInput('');
  };

  const handleRemoveCategoria = (catName: string) => {
    setSelectedCategorias(prev => prev.filter(c => c !== catName));
  };

  const handleAddSubcategoria = (subName: string) => {
    const trimmed = subName.trim();
    if (!trimmed) return;
    if (!selectedSubcategorias.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      setSelectedSubcategorias(prev => [...prev, trimmed]);
    }
    setSubcategoriaInput('');
  };

  const handleRemoveSubcategoria = (subName: string) => {
    setSelectedSubcategorias(prev => prev.filter(s => s !== subName));
  };

  const handleAddTag = (tagName: string) => {
    const trimmed = tagName.trim();
    if (!trimmed) return;
    if (!selectedTags.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      setSelectedTags(prev => [...prev, trimmed]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagName: string) => {
    setSelectedTags(prev => prev.filter(t => t !== tagName));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.razonSocial || !formData.razonSocial.trim()) {
      toast.error('La Razón Social o Nombre de Proveedor es obligatoria.');
      return;
    }

    if (formData.esConfiable === false && (!formData.motivoNoConfiable || !formData.motivoNoConfiable.trim())) {
      toast.error('Por favor especifica el motivo por el cual este proveedor NO es confiable.');
      return;
    }

    let finalCategorias = [...selectedCategorias];
    if (categoriaInput.trim() && !finalCategorias.some(c => c.toLowerCase() === categoriaInput.trim().toLowerCase())) {
      finalCategorias.push(categoriaInput.trim());
    }

    let finalSubcategorias = [...selectedSubcategorias];
    if (subcategoriaInput.trim() && !finalSubcategorias.some(s => s.toLowerCase() === subcategoriaInput.trim().toLowerCase())) {
      finalSubcategorias.push(subcategoriaInput.trim());
    }

    let finalTags = [...selectedTags];
    if (tagInput.trim() && !finalTags.some(t => t.toLowerCase() === tagInput.trim().toLowerCase())) {
      finalTags.push(tagInput.trim());
    }

    const effectiveCategorias = finalCategorias.length > 0
      ? finalCategorias
      : (formData.categoria?.trim() ? [formData.categoria.trim()] : ['General']);

    const payload: Proveedor = {
      id: proveedorToEdit ? proveedorToEdit.id : `PRV-${Date.now()}`,
      razonSocial: formData.razonSocial.trim(),
      nombre: (formData.nombre || '').trim() || formData.razonSocial.trim(),
      ruc: (formData.ruc || '').trim(),
      correo: (formData.correo || '').trim(),
      telefono: (formData.telefono || '').trim(),
      tipoDocumento: (formData.tipoDocumento as any) || 'Factura',
      categoria: effectiveCategorias[0] || 'General',
      categorias: effectiveCategorias,
      subcategorias: finalSubcategorias,
      tags: finalTags,
      ciudad: (formData.ciudad || 'Lima').trim(),
      web: (formData.web || '').trim(),
      tipoProveedor: (formData.tipoProveedor as any) || 'Trabajado',
      esConfiable: formData.esConfiable !== undefined ? Boolean(formData.esConfiable) : true,
      motivoNoConfiable: formData.esConfiable === false ? (formData.motivoNoConfiable || '').trim() : '',
      documentos: JSON.stringify(docList),
      cuentas: formData.cuentas || []
    };

    setIsSubmitting(true);
    try {
      if (proveedorToEdit) {
        await updateProveedor(payload);
        toast.success('Proveedor actualizado con éxito');
      } else {
        await addProveedor(payload);
        toast.success('Proveedor registrado con éxito');
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Error al guardar el proveedor');
    } finally {
      setIsSubmitting(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-content" style={{ maxWidth: '800px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        
        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 className="modal-title">{proveedorToEdit ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h2>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Registra información comercial, datos de contacto, referencias de trabajos y catálogos.
            </p>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', flex: 1, padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
          
          {/* Tipo de Proveedor & Confiabilidad Switch */}
          <div className="grid-responsive-2" style={{ display: 'grid', gap: '16px', background: '#f8fafc', padding: '18px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', margin: '4px 0 6px 0' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontWeight: 600, fontSize: '12px' }}>Tipo de Proveedor</label>
              <select
                value={formData.tipoProveedor || 'Trabajado'}
                onChange={e => setFormData({ ...formData, tipoProveedor: e.target.value as any })}
                className="form-control"
              >
                <option value="Trabajado">🤝 Proveedor con el que ya trabajamos</option>
                <option value="Brochure">📄 Prospecto / Envió su Brochure</option>
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontWeight: 600, fontSize: '12px' }}>¿Es Confiable?</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, esConfiable: true, motivoNoConfiable: '' })}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: formData.esConfiable ? '2px solid #10b981' : '1px solid var(--border-color)',
                    background: formData.esConfiable ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                    color: formData.esConfiable ? '#047857' : 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    cursor: 'pointer'
                  }}
                >
                  <ShieldCheck size={16} /> Sí, es Confiable
                </button>

                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, esConfiable: false })}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: formData.esConfiable === false ? '2px solid #ef4444' : '1px solid var(--border-color)',
                    background: formData.esConfiable === false ? 'rgba(239, 68, 68, 0.12)' : 'transparent',
                    color: formData.esConfiable === false ? '#b91c1c' : 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    cursor: 'pointer'
                  }}
                >
                  <AlertTriangle size={16} /> ⚠️ No Confiable
                </button>
              </div>
            </div>
          </div>

          {/* Alert Box if Not Reliable */}
          {formData.esConfiable === false && (
            <div style={{ background: '#fef2f2', border: '1px solid #f87171', borderRadius: 'var(--radius-sm)', padding: '14px', borderLeft: '4px solid #ef4444' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b91c1c', fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>
                <AlertTriangle size={16} /> Proveedor marcado como NO CONFIABLE (se resaltará en rojo)
              </div>
              <label style={{ fontSize: '11px', color: '#7f1d1d', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
                Motivo / Advertencia (¿Por qué no es confiable? Ej: incumplió plazos, mala calidad, sobrecostos) *
              </label>
              <textarea
                value={formData.motivoNoConfiable || ''}
                onChange={e => setFormData({ ...formData, motivoNoConfiable: e.target.value })}
                className="form-control"
                placeholder="Describe brevemente la mala experiencia o motivo de la alerta..."
                rows={2}
                style={{ fontSize: '12px', borderColor: '#fca5a5' }}
                required
              />
            </div>
          )}

          {/* Basic Info */}
          <div className="grid-responsive-2" style={{ display: 'grid', gap: '16px' }}>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label>Razón Social o Nombre Comercial *</label>
              <input 
                type="text" 
                value={formData.razonSocial || ''} 
                onChange={e => setFormData({...formData, razonSocial: e.target.value})}
                className="form-control"
                placeholder="Ej. Producciones BTL SAC"
                required
              />
            </div>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label>RUC (Opcional para prospectos)</label>
              <input 
                type="text" 
                value={formData.ruc || ''} 
                onChange={e => setFormData({...formData, ruc: e.target.value})}
                className="form-control"
                placeholder="Ej. 20123456789"
              />
            </div>
          </div>

          {/* Clasificación Comercial: Categorías Múltiples, Subcategorías, Tags y Ciudad */}
          <div style={{ background: 'rgba(102, 45, 145, 0.03)', border: '1px solid rgba(102, 45, 145, 0.18)', borderRadius: '14px', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '18px', margin: '6px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(102, 45, 145, 0.12)', paddingBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={18} color="var(--accent-primary)" />
                <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Clasificación Comercial y Especialidad (Múltiples Categorías, Subcategorías y Tags)
                </h4>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setCatalogInitialTab('categorias'); setIsCatalogModalOpen(true); }}
                style={{ padding: '4px 12px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px', borderRadius: '6px' }}
                title="Configurar opciones por defecto de categorías, subcategorías y tags"
              >
                <Tag size={12} /> Catálogo por Defecto
              </button>
            </div>

            {/* Categorías Múltiples */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FolderTree size={14} color="var(--accent-primary)" /> Categorías / Rubros (Un proveedor puede tener varias)
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
                  <button 
                    type="button" 
                    onClick={() => { setCatalogInitialTab('categorias'); setIsCatalogModalOpen(true); }} 
                    style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '11px', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                    title="Administrar categorías por defecto"
                  >
                    + Gestionar catálogo
                  </button>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {selectedCategorias.length} seleccionada(s)
                  </span>
                </div>
              </label>
              
              {/* Chips seleccionados */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '34px', padding: '6px 10px', background: 'var(--bg-input, #fff)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', marginBottom: '8px', alignItems: 'center' }}>
                {selectedCategorias.map((cat, idx) => {
                  const isPrimary = idx === 0;
                  return (
                    <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', background: isPrimary ? 'rgba(124, 58, 237, 0.18)' : 'rgba(124, 58, 237, 0.08)', color: '#7c3aed', border: isPrimary ? '1.5px solid #7c3aed' : '1px solid rgba(124, 58, 237, 0.3)', borderRadius: '16px', fontSize: '12px', fontWeight: 600 }}>
                      <span>{cat}</span>
                      {isPrimary && (
                        <span style={{ fontSize: '9px', background: '#7c3aed', color: '#fff', padding: '1px 5px', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: 700 }}>
                          Principal
                        </span>
                      )}
                      {!isPrimary && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCategorias(prev => [cat, ...prev.filter(c => c !== cat)]);
                          }}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#7c3aed', fontSize: '10px', textDecoration: 'underline', padding: 0 }}
                          title="Establecer como categoría principal"
                        >
                          Hacer principal
                        </button>
                      )}
                      <button 
                        type="button" 
                        onClick={() => handleRemoveCategoria(cat)} 
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#7c3aed', padding: 0, fontSize: '14px', lineHeight: 1, display: 'flex', alignItems: 'center' }}
                        title="Quitar categoría"
                      >
                        ✕
                      </button>
                    </span>
                  );
                })}
                {selectedCategorias.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategorias([])}
                    style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '11px', cursor: 'pointer', marginLeft: 'auto', textDecoration: 'underline' }}
                    title="Quitar todas para seleccionar una nueva categoría limpia"
                  >
                    Limpiar todas
                  </button>
                )}
                {selectedCategorias.length === 0 && (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Ninguna categoría seleccionada aún. Escribe o selecciona una sugerencia abajo:
                  </span>
                )}
              </div>

              {/* Input para agregar categoría */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  list="category-suggestions"
                  value={categoriaInput}
                  onChange={e => setCategoriaInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCategoria(categoriaInput);
                    }
                  }}
                  className="form-control"
                  style={{ flex: 1 }}
                  placeholder="Escribe una categoría o selecciona sugerencia y presiona Enter..."
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleAddCategoria(categoriaInput)}
                  style={{ padding: '0 14px', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                >
                  <Plus size={14} /> Añadir
                </button>
                <datalist id="category-suggestions">
                  {allExistingCategories.filter(c => !selectedCategorias.includes(c)).map((cat, idx) => (
                    <option key={idx} value={cat} />
                  ))}
                </datalist>
              </div>

              {/* Sugerencias rápidas clickeables */}
              {allExistingCategories.filter(c => !selectedCategorias.includes(c)).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sugerencias:</span>
                  {allExistingCategories.filter(c => !selectedCategorias.includes(c)).slice(0, 8).map((cat, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleAddCategoria(cat)}
                      style={{ border: '1px dashed var(--border-color)', background: 'transparent', borderRadius: '12px', padding: '2px 8px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                      + {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Subcategorías y Tags en Grid */}
            <div className="grid-responsive-2" style={{ display: 'grid', gap: '16px' }}>
              {/* Subcategorías */}
              <div className="form-group" style={{ margin: 0, minWidth: 0 }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                    <FolderTree size={14} color="#0891b2" /> Subcategorías / Especialidades
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
                    <button 
                      type="button" 
                      onClick={() => { setCatalogInitialTab('subcategorias'); setIsCatalogModalOpen(true); }} 
                      style={{ background: 'none', border: 'none', color: '#0891b2', fontSize: '11px', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                      title="Administrar subcategorías por defecto"
                    >
                      + Catálogo
                    </button>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {selectedSubcategorias.length}
                    </span>
                  </div>
                </label>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '34px', padding: '6px 10px', background: 'var(--bg-input, #fff)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', marginBottom: '8px', alignItems: 'center' }}>
                  {selectedSubcategorias.map((sub, idx) => (
                    <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 8px', background: 'rgba(8, 145, 178, 0.12)', color: '#0891b2', border: '1px solid rgba(8, 145, 178, 0.3)', borderRadius: '14px', fontSize: '11px', fontWeight: 600 }}>
                      {sub}
                      <button 
                        type="button" 
                        onClick={() => handleRemoveSubcategoria(sub)} 
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#0891b2', padding: 0, fontSize: '12px', lineHeight: 1 }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  {selectedSubcategorias.length === 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ej. Pantallas LED, Toldos, Iluminación...</span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    list="subcat-suggestions"
                    value={subcategoriaInput}
                    onChange={e => setSubcategoriaInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSubcategoria(subcategoriaInput);
                      }
                    }}
                    className="form-control"
                    style={{ flex: 1, fontSize: '12px' }}
                    placeholder="Escribe subcategoría y Enter..."
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleAddSubcategoria(subcategoriaInput)}
                    style={{ padding: '0 10px', fontSize: '12px' }}
                  >
                    +
                  </button>
                  <datalist id="subcat-suggestions">
                    {allExistingSubcategories.filter(s => !selectedSubcategorias.includes(s)).map((sub, idx) => (
                      <option key={idx} value={sub} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Tags / Etiquetas */}
              <div className="form-group" style={{ margin: 0, minWidth: 0 }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                    <Tag size={14} color="#059669" /> Tags / Etiquetas Clave
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
                    <button 
                      type="button" 
                      onClick={() => { setCatalogInitialTab('tags'); setIsCatalogModalOpen(true); }} 
                      style={{ background: 'none', border: 'none', color: '#059669', fontSize: '11px', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                      title="Administrar tags por defecto"
                    >
                      + Catálogo
                    </button>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {selectedTags.length}
                    </span>
                  </div>
                </label>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '34px', padding: '6px 10px', background: 'var(--bg-input, #fff)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', marginBottom: '8px', alignItems: 'center' }}>
                  {selectedTags.map((tag, idx) => (
                    <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 8px', background: 'rgba(5, 150, 105, 0.12)', color: '#059669', border: '1px solid rgba(5, 150, 105, 0.3)', borderRadius: '14px', fontSize: '11px', fontWeight: 600 }}>
                      #{tag}
                      <button 
                        type="button" 
                        onClick={() => handleRemoveTag(tag)} 
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#059669', padding: 0, fontSize: '12px', lineHeight: 1 }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  {selectedTags.length === 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ej. #Acreditado, #24/7, #Urgente...</span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    list="tag-suggestions"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag(tagInput);
                      }
                    }}
                    className="form-control"
                    style={{ flex: 1, fontSize: '12px' }}
                    placeholder="Escribe tag y Enter..."
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleAddTag(tagInput)}
                    style={{ padding: '0 10px', fontSize: '12px' }}
                  >
                    +
                  </button>
                  <datalist id="tag-suggestions">
                    {allExistingTags.filter(t => !selectedTags.includes(t)).map((tg, idx) => (
                      <option key={idx} value={tg} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>

            {/* Ciudad */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600 }}>
                <MapPin size={14} color="var(--accent-primary)" /> Ciudad Principal de Operación
              </label>
              <input
                list="city-suggestions"
                type="text"
                value={formData.ciudad || ''}
                onChange={e => setFormData({ ...formData, ciudad: e.target.value })}
                className="form-control"
                placeholder="Ej. Lima, Arequipa, Trujillo..."
              />
              <datalist id="city-suggestions">
                {existingCities.map((c, idx) => (
                  <option key={idx} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Web & Contacto */}
          <div className="grid-responsive-2" style={{ display: 'grid', gap: '16px' }}>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Globe size={14} color="var(--accent-primary)" /> Sitio Web / Portafolio / Red Social
              </label>
              <input 
                type="text" 
                value={formData.web || ''} 
                onChange={e => setFormData({...formData, web: e.target.value})}
                className="form-control"
                placeholder="https://www.proveedor.com"
              />
            </div>

            <div className="form-group" style={{ minWidth: 0 }}>
              <label>Nombre del Contacto</label>
              <input 
                type="text" 
                value={formData.nombre || ''} 
                onChange={e => setFormData({...formData, nombre: e.target.value})}
                className="form-control"
                placeholder="Ej. Juan Pérez (Ventas)"
              />
            </div>
          </div>

          {/* Correo, Teléfono & Tipo Doc */}
          <div className="grid-responsive-3" style={{ display: 'grid', gap: '16px' }}>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label>Correo Electrónico</label>
              <input 
                type="email" 
                value={formData.correo || ''} 
                onChange={e => setFormData({...formData, correo: e.target.value})}
                className="form-control"
                placeholder="contacto@empresa.com"
              />
            </div>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label>Teléfono / Celular</label>
              <input 
                type="text" 
                value={formData.telefono || ''} 
                onChange={e => setFormData({...formData, telefono: e.target.value})}
                className="form-control"
                placeholder="999 888 777"
              />
            </div>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label>Tipo Comprobante</label>
              <select 
                value={formData.tipoDocumento || 'Factura'} 
                onChange={e => setFormData({...formData, tipoDocumento: e.target.value as any})}
                className="form-control"
              >
                <option value="Factura">Factura</option>
                <option value="Recibo por Honorarios">Recibo por Honorarios</option>
              </select>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECCIÓN VISUAL DE REFERENCIAS, BROCHURES Y CATÁLOGOS */}
          {/* ========================================================================= */}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '20px', marginTop: '6px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                  <ImageIcon size={16} color="var(--accent-primary)" /> Referencias de Trabajos, Brochures y Catálogos
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                  Sube fotos de muestras de sus trabajos, presentaciones comerciales o catálogos en PDF.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={uploadDocType}
                  onChange={e => setUploadDocType(e.target.value as any)}
                  className="form-control"
                  style={{ width: 'auto', padding: '4px 8px', fontSize: '11px' }}
                >
                  <option value="Brochure">Brochure</option>
                  <option value="Catálogo">Catálogo</option>
                  <option value="Referencia">Referencia Visual</option>
                  <option value="Otro">Otro</option>
                </select>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  multiple
                  accept="image/*,.pdf,.doc,.docx"
                  style={{ display: 'none' }}
                />

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  style={{ padding: '5px 10px', fontSize: '12px' }}
                >
                  {isUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  Subir Archivos
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAddLink(!showAddLink)}
                  style={{ padding: '5px 8px', fontSize: '12px' }}
                  title="Agregar enlace URL"
                >
                  <LinkIcon size={13} />
                </button>
              </div>
            </div>

            {/* Formulario para agregar enlace externo */}
            {showAddLink && (
              <div style={{ background: 'rgba(138, 43, 226, 0.05)', border: '1px dashed var(--accent-primary)', padding: '12px', borderRadius: 'var(--radius-sm)', marginBottom: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Título del enlace"
                  value={linkTitle}
                  onChange={e => setLinkTitle(e.target.value)}
                  className="form-control"
                  style={{ flex: '1 1 140px', minWidth: '120px', fontSize: '12px' }}
                />
                <input
                  type="text"
                  placeholder="https://enlace-al-brochure.com..."
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  className="form-control"
                  style={{ flex: '2 1 200px', minWidth: '160px', fontSize: '12px' }}
                />
                <select
                  value={linkType}
                  onChange={e => setLinkType(e.target.value as any)}
                  className="form-control"
                  style={{ flex: '1 1 110px', minWidth: '100px', fontSize: '12px' }}
                >
                  <option value="Brochure">Brochure</option>
                  <option value="Catálogo">Catálogo</option>
                  <option value="Referencia">Referencia</option>
                  <option value="Otro">Otro</option>
                </select>
                <button type="button" onClick={handleAddLinkDoc} className="btn-primary" style={{ padding: '6px 14px', fontSize: '12px', flex: '0 0 auto' }}>
                  <Plus size={13} /> Adjuntar
                </button>
              </div>
            )}

            {/* Visual list of attachments */}
            {docList.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '1px dashed var(--border-color)',
                  borderRadius: '10px',
                  padding: '24px',
                  margin: '6px 0',
                  textAlign: 'center',
                  background: 'rgba(0,0,0,0.01)',
                  cursor: 'pointer'
                }}
              >
                <Upload size={24} color="var(--text-muted)" style={{ margin: '0 auto 6px' }} />
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                  Haz clic para seleccionar o arrastra fotos de trabajos, brochures comerciales o catálogos
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '10px' }}>
                {docList.map(doc => {
                  const fullUrl = getFullUrl(doc.url);
                  const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(doc.name.toLowerCase().split('.').pop() || '') || doc.tipo === 'Referencia';

                  return (
                    <div
                      key={doc.id}
                      style={{
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '8px',
                        background: 'var(--bg-panel)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        position: 'relative'
                      }}
                    >
                      <div style={{ height: '80px', borderRadius: '4px', background: 'rgba(0,0,0,0.03)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isImage ? (
                          <img src={fullUrl} alt={doc.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                        ) : (
                          <FileText size={28} color="var(--accent-primary)" style={{ opacity: 0.8 }} />
                        )}
                      </div>

                      <div style={{ fontSize: '11px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.name}>
                        {doc.name}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px' }}>
                        <span className={`badge ${doc.tipo === 'Brochure' ? 'badge-info' : doc.tipo === 'Catálogo' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '9px', padding: '2px 6px' }}>
                          {doc.tipo}
                        </span>

                        <div style={{ display: 'flex', gap: '4px' }}>
                          <a href={fullUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', padding: '2px' }} title="Abrir">
                            <ExternalLink size={12} />
                          </a>
                          <button type="button" onClick={() => handleRemoveDoc(doc.id)} style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }} title="Quitar">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cuentas Bancarias */}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '20px', marginTop: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Cuentas Bancarias</h3>
              <button type="button" className="btn-secondary" onClick={handleAddCuenta} style={{ padding: '4px 10px', fontSize: '12px' }}>
                <Plus size={14} /> Añadir Cuenta
              </button>
            </div>

            {(formData.cuentas || []).length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', margin: '4px 0', padding: '16px', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1' }}>
                No hay cuentas bancarias registradas. (Opcional)
              </p>
            ) : (
              (formData.cuentas || []).map((cuenta, index) => (
                <div key={cuenta.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 18px', position: 'relative', marginBottom: '12px' }}>
                  <button 
                    type="button"
                    onClick={() => handleRemoveCuenta(cuenta.id)}
                    style={{ position: 'absolute', top: '10px', right: '10px', color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    title="Eliminar Cuenta"
                  >
                    <Trash2 size={16} />
                  </button>
                  <h4 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-primary)', marginTop: 0, marginBottom: '10px' }}>Cuenta #{index + 1}</h4>
                  
                  <div className="grid-responsive-2" style={{ display: 'grid', gap: '10px', marginBottom: '10px' }}>
                    <input 
                      type="text" 
                      value={cuenta.banco} 
                      onChange={e => handleCuentaChange(cuenta.id, 'banco', e.target.value)}
                      className="form-control"
                      placeholder="Banco (Ej. BCP, BBVA, Interbank)"
                      style={{ fontSize: '12px' }}
                    />
                    <select 
                      value={cuenta.tipoCuenta || 'Ahorros'} 
                      onChange={e => handleCuentaChange(cuenta.id, 'tipoCuenta', e.target.value)}
                      className="form-control"
                      style={{ fontSize: '12px' }}
                    >
                      <option value="Ahorros">Ahorros</option>
                      <option value="Corriente">Corriente</option>
                      <option value="Sueldo">Sueldo</option>
                    </select>
                  </div>
                  <div className="grid-responsive-2" style={{ display: 'grid', gap: '10px' }}>
                    <input 
                      type="text" 
                      value={cuenta.numeroCuenta} 
                      onChange={e => handleCuentaChange(cuenta.id, 'numeroCuenta', e.target.value)}
                      className="form-control"
                      placeholder="N° de Cuenta"
                      style={{ fontSize: '12px' }}
                    />
                    <input 
                      type="text" 
                      value={cuenta.cci} 
                      onChange={e => handleCuentaChange(cuenta.id, 'cci', e.target.value)}
                      className="form-control"
                      placeholder="CCI Interbancario"
                      style={{ fontSize: '12px' }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="modal-footer" style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmitting}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              <Save size={16} /> {isSubmitting ? 'Guardando...' : (proveedorToEdit ? 'Guardar Cambios' : 'Registrar Proveedor')}
            </button>
          </div>
        </form>
      </div>

      <ManageProveedorCatalogModal
        isOpen={isCatalogModalOpen}
        onClose={() => setIsCatalogModalOpen(false)}
        initialTab={catalogInitialTab}
      />
    </div>,
    document.body
  );
};
