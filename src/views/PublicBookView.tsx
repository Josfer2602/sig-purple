import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  LayoutGrid,
  MonitorPlay,
  Printer,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { API_URL } from '../utils/apiUrl';
import type { BookMediaItem, ProjectBook } from '../types/models';
import {
  BookPrintStyles,
  BookSlideCanvas,
  buildRenderedDeck,
  resolveMediaUrl,
} from '../components/BookSlideCanvas';
import { buildBookClientUrl } from '../utils/clientLinks';

interface PublicBookViewProps {
  token: string;
}

export const PublicBookView: React.FC<PublicBookViewProps> = ({ token }) => {
  const [book, setBook] = useState<ProjectBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'single' | 'deck'>('single');
  const [lightboxItem, setLightboxItem] = useState<BookMediaItem | null>(null);

  useEffect(() => {
    let active = true;
    const loadBook = async () => {
      try {
        const res = await fetch(`${API_URL}/books/shared/${encodeURIComponent(token)}`);
        if (!res.ok) throw new Error('Presentación no encontrada o enlace inválido.');
        const data = await res.json();
        if (active) setBook(data);
      } catch (err: any) {
        if (active) setError(err.message || 'Error al cargar la presentación');
      } finally {
        if (active) setLoading(false);
      }
    };
    loadBook();
    return () => {
      active = false;
    };
  }, [token]);

  const deck = useMemo(() => (book ? buildRenderedDeck(book) : []), [book]);

  useEffect(() => {
    if (!book) return;
    const client =
      (book.clienteNombre || book.proyecto?.cliente?.empresa || '').trim();
    const proj = (book.proyecto?.nombre || book.requerimiento || 'Presentación').trim();
    document.title = `Presentación | ${client ? `${client} - ` : ''}${proj}`;
  }, [book]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (lightboxItem) {
        if (e.key === 'Escape') setLightboxItem(null);
        return;
      }
      if (viewMode !== 'single' || deck.length === 0) return;
      if (e.key === 'ArrowRight') {
        setActiveIndex((prev) => Math.min(deck.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft') {
        setActiveIndex((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewMode, deck.length, lightboxItem]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f8fafc',
          color: '#7030A0',
          fontWeight: 600,
          fontFamily: "'Ubuntu', 'Inter', sans-serif",
        }}
      >
        Cargando presentación Purple BTL...
      </div>
    );
  }

  if (error || !book) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f8fafc',
          padding: '24px',
        }}
      >
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: '16px',
            padding: '32px',
            border: '1px solid #e2e8f0',
            textAlign: 'center',
            maxWidth: '420px',
          }}
        >
          <h2 style={{ margin: '0 0 8px 0', color: '#5B108B' }}>Enlace no disponible</h2>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
            {error || 'La presentación solicitada ya no está disponible.'}
          </p>
        </div>
      </div>
    );
  }

  const clientDisplay =
    (book.clienteNombre || book.proyecto?.cliente?.empresa || '').trim() || 'Cliente';
  const projectDisplay =
    (book.proyecto?.nombre || book.requerimiento || book.nombre || 'Presentación').trim();

  const handleCopyLink = async () => {
    const shareUrl = buildBookClientUrl(token, clientDisplay, projectDisplay, book.nombre);
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Enlace copiado al portapapeles');
    } catch {
      toast.success(shareUrl);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      <BookPrintStyles />

      {/* CLIENT TOP BAR */}
      <header
        className="no-print"
        style={{
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
          flexWrap: 'wrap',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img
            src="/book-assets/cat-icon.png"
            alt="Purple BTL"
            style={{ width: '38px', height: '38px', objectFit: 'contain' }}
          />
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#7030A0', textTransform: 'uppercase' }}>
              {clientDisplay} · PRESENTACIÓN PURPLE BTL
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
              {projectDisplay} <span style={{ color: '#64748b', fontWeight: 500 }}>({book.nombre})</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setViewMode('single')}
            style={{
              padding: '7px 12px',
              fontSize: '0.8rem',
              backgroundColor: viewMode === 'single' ? '#7030A0' : '#fff',
              color: viewMode === 'single' ? '#fff' : '#0f172a',
              borderColor: viewMode === 'single' ? '#7030A0' : '#cbd5e1',
            }}
          >
            <MonitorPlay size={14} /> Diapositiva
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => setViewMode('deck')}
            style={{
              padding: '7px 12px',
              fontSize: '0.8rem',
              backgroundColor: viewMode === 'deck' ? '#7030A0' : '#fff',
              color: viewMode === 'deck' ? '#fff' : '#0f172a',
              borderColor: viewMode === 'deck' ? '#7030A0' : '#cbd5e1',
            }}
          >
            <LayoutGrid size={14} /> Ver Todo ({deck.length})
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={handleCopyLink}
            style={{ padding: '7px 12px', fontSize: '0.8rem' }}
          >
            <Copy size={14} /> Copiar Link
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={() => window.print()}
            style={{ padding: '7px 14px', fontSize: '0.82rem' }}
          >
            <Printer size={14} /> Exportar PDF
          </button>
        </div>
      </header>

      {/* INTERACTIVE SLIDES CONTENT */}
      <main
        className="no-print"
        style={{
          maxWidth: '1120px',
          margin: '0 auto',
          padding: '24px 16px 40px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {viewMode === 'single' && deck[activeIndex] ? (
          <>
            <div
              style={{
                borderRadius: '14px',
                overflow: 'hidden',
                boxShadow: '0 14px 40px rgba(91, 16, 139, 0.16)',
                border: '1px solid #cbd5e1',
              }}
            >
              <BookSlideCanvas
                book={book}
                renderedSlide={deck[activeIndex]}
                onMediaClick={(item) => setLightboxItem(item)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={activeIndex === 0}
                onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                style={{ padding: '8px 14px' }}
              >
                <ChevronLeft size={16} /> Anterior
              </button>

              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#5B108B' }}>
                Diapositiva {activeIndex + 1} de {deck.length} — {deck[activeIndex].label}
              </span>

              <button
                type="button"
                className="btn-secondary"
                disabled={activeIndex >= deck.length - 1}
                onClick={() => setActiveIndex((i) => Math.min(deck.length - 1, i + 1))}
                style={{ padding: '8px 14px' }}
              >
                Siguiente <ChevronRight size={16} />
              </button>
            </div>

            {/* MINIATURE STRIP */}
            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '6px' }}>
              {deck.map((slideItem, idx) => (
                <div
                  key={slideItem.key}
                  onClick={() => setActiveIndex(idx)}
                  style={{
                    width: '148px',
                    flexShrink: 0,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div
                    style={{
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: idx === activeIndex ? '2.5px solid #7030A0' : '1px solid #cbd5e1',
                    }}
                  >
                    <BookSlideCanvas
                      book={book}
                      renderedSlide={slideItem}
                      interactiveMedia={false}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: idx === activeIndex ? 700 : 500,
                      color: idx === activeIndex ? '#7030A0' : '#475569',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {idx + 1}. {slideItem.label}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {deck.map((slideItem) => (
              <div
                key={slideItem.key}
                style={{
                  borderRadius: '14px',
                  overflow: 'hidden',
                  boxShadow: '0 8px 28px rgba(0,0,0,0.08)',
                  border: '1px solid #cbd5e1',
                }}
              >
                <BookSlideCanvas
                  book={book}
                  renderedSlide={slideItem}
                  onMediaClick={(item) => setLightboxItem(item)}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* PRINT-ONLY 16:9 FULL DECK */}
      <div className="book-print-only">
        {deck.map((slideItem) => (
          <BookSlideCanvas
            key={slideItem.key}
            book={book}
            renderedSlide={slideItem}
            interactiveMedia={false}
            className="book-print-page"
          />
        ))}
      </div>

      {/* LIGHTBOX */}
      {lightboxItem && (
        <div
          className="modal-overlay no-print"
          onClick={() => setLightboxItem(null)}
          style={{ zIndex: 2000 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '92vw',
              maxHeight: '90vh',
              position: 'relative',
              backgroundColor: '#0f172a',
              borderRadius: '14px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <button
              type="button"
              onClick={() => setLightboxItem(null)}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                backgroundColor: 'rgba(255,255,255,0.9)',
                border: 'none',
                borderRadius: '99px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
            <img
              src={resolveMediaUrl(lightboxItem.url)}
              alt={lightboxItem.caption || lightboxItem.filename}
              style={{ maxWidth: '88vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: '8px' }}
            />
            {(lightboxItem.caption || lightboxItem.filename) && (
              <span style={{ color: '#e2e8f0', fontSize: '0.86rem' }}>
                {lightboxItem.caption || lightboxItem.filename}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

