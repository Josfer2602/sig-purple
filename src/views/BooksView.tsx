import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Copy,
  Download,
  FolderPlus,
  Image as ImageIcon,
  Layers,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { API_URL, useGlobalContext } from '../context/GlobalContext';
import type { ProjectBook, Proyecto } from '../types/models';
import { BookBuilderView } from './BookBuilderView';
import { parseSlideItems, resolveMediaUrl } from '../components/BookSlideCanvas';
import { buildBookClientUrl } from '../utils/clientLinks';

export const BooksView: React.FC = () => {
  const { proyectos, clientes, books, deleteBook, token, isLoading } = useGlobalContext();

  const [selectedProject, setSelectedProject] = useState<Proyecto | null>(null);
  const [selectedInitialBookId, setSelectedInitialBookId] = useState<string | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [downloadingBookId, setDownloadingBookId] = useState<string | null>(null);

  const clientMap = useMemo(() => {
    const map = new Map<string, string>();
    clientes.forEach((c) => map.set(c.id, c.empresa));
    return map;
  }, [clientes]);

  const projectMap = useMemo(() => {
    const map = new Map<string, Proyecto>();
    proyectos.forEach((p) => map.set(p.id, p));
    return map;
  }, [proyectos]);

  const enrichedBooks = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return books
      .map((b) => {
        const proj = b.proyecto || projectMap.get(b.proyectoId);
        const clientName =
          b.clienteNombre ||
          b.proyecto?.cliente?.empresa ||
          (proj ? clientMap.get(proj.clienteId) : '') ||
          'Sin cliente';
        const projectName = proj?.nombre || b.requerimiento || 'Proyecto';
        return { book: b, project: proj, clientName, projectName };
      })
      .filter(({ book, clientName, projectName }) => {
        if (!query) return true;
        return (
          clientName.toLowerCase().includes(query) ||
          projectName.toLowerCase().includes(query) ||
          (book.nombre || '').toLowerCase().includes(query) ||
          (book.requerimiento || '').toLowerCase().includes(query)
        );
      });
  }, [books, projectMap, clientMap, searchTerm]);

  const sortedProjects = useMemo(() => {
    return [...proyectos].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [proyectos]);

  const handleOpenProjectBook = (project: Proyecto, bookId?: string) => {
    setSelectedInitialBookId(bookId);
    setSelectedProject(project);
  };

  const handleLaunchFromSelector = () => {
    if (!newProjectId) {
      toast.error('Selecciona un proyecto para crear o abrir su Book');
      return;
    }
    const proj = projectMap.get(newProjectId);
    if (!proj) return;
    handleOpenProjectBook(proj, undefined);
  };

  const handleCopyClientLink = async (book: ProjectBook, clientName: string, projectName: string) => {
    if (!book.shareToken) return;
    const url = buildBookClientUrl(book.shareToken, clientName, projectName, book.nombre);
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Enlace cliente copiado');
    } catch {
      toast.success(url);
    }
  };

  const handleDownloadPptx = async (book: ProjectBook, projectName: string) => {
    setDownloadingBookId(book.id);
    try {
      const res = await fetch(`${API_URL}/books/${book.id}/export-pptx`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al generar PPTX');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName}_${book.nombre}`.replace(/[^a-zA-Z0-9_-]+/g, '_') + '.pptx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('PowerPoint (.pptx) descargado');
    } catch (err: any) {
      toast.error(err.message || 'No se pudo descargar el PPTX');
    } finally {
      setDownloadingBookId(null);
    }
  };

  const handleDeleteBook = async (book: ProjectBook) => {
    if (!window.confirm(`¿Eliminar la presentación "${book.nombre}"?`)) return;
    try {
      await deleteBook(book.id);
      toast.success('Presentación eliminada');
    } catch (err: any) {
      toast.error(err.message || 'No se pudo eliminar');
    }
  };

  if (selectedProject) {
    return (
      <BookBuilderView
        project={selectedProject}
        initialBookId={selectedInitialBookId}
        onBack={() => {
          setSelectedProject(null);
          setSelectedInitialBookId(undefined);
        }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* HEADER + NEW PROJECT LAUNCHER */}
      <div
        style={{
          backgroundColor: 'var(--bg-panel)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          padding: '20px 24px',
          boxShadow: 'var(--panel-shadow)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #5B108B 0%, #7030A0 100%)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BookOpen size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Presentaciones y Books Visuales
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                Sube imágenes/videos, asigna un nombre y ordénalos en diapositivas Purple BTL asociadas a cada proyecto.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <select
            className="form-control"
            value={newProjectId}
            onChange={(e) => setNewProjectId(e.target.value)}
            style={{ minWidth: '260px', maxWidth: '340px', fontSize: '0.86rem' }}
          >
            <option value="">-- Seleccionar Proyecto --</option>
            {sortedProjects.map((p) => {
              const cName = clientMap.get(p.clienteId) || '';
              return (
                <option key={p.id} value={p.id}>
                  {cName ? `${cName} — ` : ''}
                  {p.nombre}
                </option>
              );
            })}
          </select>

          <button className="btn-primary" onClick={handleLaunchFromSelector}>
            <Plus size={16} /> Crear / Abrir Book
          </button>
        </div>
      </div>

      {/* SEARCH BAR + STATS */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: '420px' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="text"
            className="form-control"
            placeholder="Buscar por cliente, proyecto o presentación..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '36px' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
          <span
            style={{
              backgroundColor: '#f3e8ff',
              color: '#5B108B',
              fontWeight: 700,
              padding: '4px 12px',
              borderRadius: '99px',
            }}
          >
            {enrichedBooks.length} {enrichedBooks.length === 1 ? 'presentación' : 'presentaciones'}
          </span>
        </div>
      </div>

      {/* BOOKS CARDS GRID */}
      {isLoading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Cargando presentaciones...
        </div>
      ) : enrichedBooks.length === 0 ? (
        <div
          style={{
            backgroundColor: 'var(--bg-panel)',
            border: '2px dashed #d8b4fe',
            borderRadius: 'var(--radius-lg)',
            padding: '48px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              backgroundColor: '#faf5ff',
              color: '#7030A0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={28} />
          </div>
          <h3 style={{ margin: 0, fontSize: '1.08rem', color: 'var(--text-primary)' }}>
            {books.length === 0
              ? 'Todavía no hay Books o Presentaciones creadas'
              : 'No se encontraron presentaciones con ese filtro'}
          </h3>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)', maxWidth: '460px' }}>
            Selecciona un proyecto arriba (o haz clic en el botón "Book" desde Proyectos) para armar tu book de promotoras, perfiles o reporte visual y exportarlo a PowerPoint o PDF.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))',
            gap: '18px',
          }}
        >
          {enrichedBooks.map(({ book, project, clientName, projectName }) => {
            const slides = [...(book.slides || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            const previewImages: string[] = [];
            let mediaCount = 0;
            slides.forEach((s) => {
              const items = parseSlideItems(s);
              mediaCount += items.length;
              items.forEach((it) => {
                if (it.mediaType === 'image' && previewImages.length < 3) {
                  previewImages.push(resolveMediaUrl(it.url));
                }
              });
            });
            const fixedCount =
              (book.includeCover ? 1 : 0) +
              (book.includeGeneralData ? 1 : 0) +
              (book.includeClosing ? 1 : 0);
            const totalSlides = fixedCount + slides.length;

            return (
              <div
                key={book.id}
                style={{
                  backgroundColor: 'var(--bg-panel)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  boxShadow: 'var(--panel-shadow)',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* THUMBNAIL STRIP */}
                <div
                  onClick={() => project && handleOpenProjectBook(project, book.id)}
                  style={{
                    height: '132px',
                    background: 'linear-gradient(135deg, #5B108B 0%, #7030A0 65%, #2AD2C5 100%)',
                    position: 'relative',
                    cursor: project ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '10px',
                    gap: '6px',
                  }}
                >
                  {previewImages.length > 0 ? (
                    previewImages.map((src, i) => (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          height: '100%',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          backgroundColor: '#fff',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                        }}
                      >
                        <img
                          src={src}
                          alt="Preview"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      </div>
                    ))
                  ) : (
                    <div
                      style={{
                        color: 'rgba(255,255,255,0.85)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.8rem',
                      }}
                    >
                      <ImageIcon size={26} />
                      <span>Plantilla Purple 16:9</span>
                    </div>
                  )}

                  <span
                    style={{
                      position: 'absolute',
                      top: '10px',
                      left: '10px',
                      backgroundColor:
                        book.tipoPresentacion === 'reporte' ? '#2AD2C5' : 'rgba(15, 23, 42, 0.72)',
                      color: '#fff',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '3px 9px',
                      borderRadius: '99px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {book.tipoPresentacion === 'reporte' ? 'Reporte' : 'Book Perfiles'}
                  </span>

                  <span
                    style={{
                      position: 'absolute',
                      top: '10px',
                      right: '10px',
                      backgroundColor: 'rgba(255,255,255,0.92)',
                      color: '#5B108B',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '3px 9px',
                      borderRadius: '99px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Layers size={12} /> {totalSlides} diapos
                  </span>
                </div>

                {/* CARD BODY */}
                <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#7030A0', textTransform: 'uppercase' }}>
                      {clientName}
                    </span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {book.nombre}
                    </span>
                  </div>

                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                    {projectName}
                  </h3>

                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {slides.length} diapositivas dinámicas · {mediaCount} archivo(s) multimedia
                  </div>

                  {/* ACTIONS */}
                  <div
                    style={{
                      marginTop: 'auto',
                      paddingTop: '10px',
                      borderTop: '1px solid var(--border-color)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!project}
                      onClick={() => project && handleOpenProjectBook(project, book.id)}
                      style={{ flex: 1, justifyContent: 'center', padding: '7px 12px', fontSize: '0.8rem' }}
                    >
                      <FolderPlus size={14} /> Abrir Editor
                    </button>

                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={downloadingBookId === book.id}
                      onClick={() => handleDownloadPptx(book, projectName)}
                      style={{ padding: '7px 10px', fontSize: '0.78rem', color: '#7030A0' }}
                      title="Descargar PowerPoint editable (.pptx)"
                    >
                      <Download size={14} /> PPTX
                    </button>

                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleCopyClientLink(book, clientName, projectName)}
                      style={{ padding: '7px 10px' }}
                      title="Copiar link compartible para cliente"
                    >
                      <Copy size={14} />
                    </button>

                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleDeleteBook(book)}
                      style={{ padding: '7px 10px', color: 'var(--danger)' }}
                      title="Eliminar presentación"
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
  );
};

