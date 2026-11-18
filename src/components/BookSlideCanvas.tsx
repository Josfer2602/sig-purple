import React from 'react';
import { Film, Image as ImageIcon } from 'lucide-react';
import type { BookMediaItem, BookSlide, ProjectBook } from '../types/models';
import { BASE_URL } from '../utils/apiUrl';

export function resolveMediaUrl(url?: string | null): string {
  if (!url) return '';
  if (/^(https?:\/\/|data:|blob:)/i.test(url)) return url;
  if (url.startsWith('/')) return `${BASE_URL}${url}`;
  return `${BASE_URL}/${url}`;
}

export function parseSlideItems(slide?: Partial<BookSlide> | null): BookMediaItem[] {
  if (!slide) return [];
  if (Array.isArray(slide.items)) return slide.items;
  if (typeof slide.itemsJson === 'string' && slide.itemsJson.trim()) {
    try {
      const parsed = JSON.parse(slide.itemsJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export type RenderedBookSlide =
  | { key: string; kind: 'cover'; label: string }
  | { key: string; kind: 'general'; label: string }
  | { key: string; kind: 'section'; label: string; slideIndex: number; slide: BookSlide }
  | { key: string; kind: 'item'; label: string; slideIndex: number; slide: BookSlide; items: BookMediaItem[] }
  | { key: string; kind: 'closing'; label: string };

export function buildRenderedDeck(book: Partial<ProjectBook>): RenderedBookSlide[] {
  const deck: RenderedBookSlide[] = [];
  if (book.includeCover !== false) {
    deck.push({ key: 'fixed-cover', kind: 'cover', label: 'Portada Purple' });
  }
  if (book.includeGeneralData !== false) {
    deck.push({ key: 'fixed-general', kind: 'general', label: 'Datos Generales' });
  }
  const orderedSlides = [...(book.slides || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  orderedSlides.forEach((slide, idx) => {
    if (slide.tipo === 'section') {
      deck.push({
        key: slide.id || `section-${idx}`,
        kind: 'section',
        label: slide.titulo || 'Sección',
        slideIndex: idx,
        slide,
      });
    } else {
      deck.push({
        key: slide.id || `item-${idx}`,
        kind: 'item',
        label: slide.titulo || `Diapositiva ${idx + 1}`,
        slideIndex: idx,
        slide,
        items: parseSlideItems(slide),
      });
    }
  });
  if (book.includeClosing !== false) {
    deck.push({ key: 'fixed-closing', kind: 'closing', label: 'Cierre Gracias' });
  }
  return deck;
}

interface BookSlideCanvasProps {
  book: Partial<ProjectBook>;
  renderedSlide: RenderedBookSlide;
  interactiveMedia?: boolean;
  onMediaClick?: (item: BookMediaItem) => void;
  className?: string;
  style?: React.CSSProperties;
}

function CorporateFooter() {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '10.8%',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <img
        src="/book-assets/footer-bar.png"
        alt="Purple BTL Footer"
        style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
      />
      <div
        style={{
          position: 'absolute',
          right: '2.9%',
          bottom: '12%',
          width: '7.65%',
          aspectRatio: '1 / 1',
          backgroundColor: '#FFFFFF',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0.55%',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}
      >
        <img
          src="/book-assets/cat-icon.png"
          alt="Purple"
          style={{ width: '82%', height: '82%', objectFit: 'contain', display: 'block' }}
        />
      </div>
    </div>
  );
}

function getGridLayoutStyle(items: BookMediaItem[]): { cols: number; rows: number } {
  const count = items.length;
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count === 3) return { cols: 3, rows: 1 };
  if (count === 4) {
    const landscapeCount = items.filter(
      (it) => it.mediaType === 'video' || (it.width && it.height && it.width > it.height * 1.05)
    ).length;
    return landscapeCount >= 2 ? { cols: 2, rows: 2 } : { cols: 4, rows: 1 };
  }
  const cols = Math.min(4, Math.ceil(count / 2));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}

export const BookSlideCanvas: React.FC<BookSlideCanvasProps> = ({
  book,
  renderedSlide,
  interactiveMedia = true,
  onMediaClick,
  className = '',
  style,
}) => {
  const clienteDisplay =
    (book.clienteNombre || book.proyecto?.cliente?.empresa || '').trim() || 'Cliente por definir';
  const reqDisplay =
    (book.requerimiento || book.proyecto?.nombre || '').trim() || 'Presentación de proyecto';
  const isReporte = book.tipoPresentacion === 'reporte';

  return (
    <div
      className={`book-slide-frame ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        overflow: 'hidden',
        userSelect: 'none',
        backgroundColor: '#FFFFFF',
        containerType: 'inline-size',
        fontFamily: "'Ubuntu', 'Inter', system-ui, sans-serif",
        ...style,
      }}
    >
      {/* 1. PORTADA */}
      {renderedSlide.kind === 'cover' && (
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            backgroundColor: '#5B108B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src="/book-assets/cover-bg.png"
            alt="Fondo Purple"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
          <img
            src="/book-assets/cover-logo.png"
            alt="Purple BTL"
            style={{
              position: 'relative',
              zIndex: 2,
              width: '19.8%',
              height: '42.4%',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        </div>
      )}

      {/* 2. DATOS GENERALES */}
      {renderedSlide.kind === 'general' && (
        <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: '#FFFFFF' }}>
          <div
            style={{
              position: 'absolute',
              left: '6%',
              right: '6%',
              top: '3.6%',
              height: '10.3%',
              backgroundColor: '#2AD2C5',
              borderRadius: '1.6cqw',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <h2
              style={{
                margin: 0,
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '3.2cqw',
                lineHeight: 1,
                letterSpacing: '-0.01em',
              }}
            >
              Datos Generales
            </h2>
          </div>

          <div
            style={{
              position: 'absolute',
              left: '6%',
              right: '6%',
              top: '21.5%',
              bottom: '16%',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '3cqw',
            }}
          >
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '1.8cqw',
                fontSize: '2.05cqw',
                lineHeight: 1.45,
              }}
            >
              <div>
                <span style={{ fontWeight: 700, color: '#7030A0' }}>Cliente: </span>
                <span style={{ color: '#111827', fontWeight: 400 }}>{clienteDisplay}</span>
              </div>
              <div>
                <span style={{ fontWeight: 700, color: '#7030A0' }}>
                  {isReporte ? 'Actividad: ' : 'Requerimiento: '}
                </span>
                <span style={{ color: '#111827', fontWeight: 400 }}>{reqDisplay}</span>
              </div>
              {book.fechaActivacion?.trim() && (
                <div>
                  <span style={{ fontWeight: 700, color: '#7030A0' }}>Fecha de activación: </span>
                  <span style={{ color: '#111827', fontWeight: 400 }}>
                    {book.fechaActivacion.trim()}
                  </span>
                </div>
              )}
            </div>

            {book.clientLogoUrl && (
              <div
                style={{
                  flexShrink: 0,
                  width: '26%',
                  height: '58%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '1cqw',
                  border: '1px solid #f1f5f9',
                  backgroundColor: '#fafafa',
                  padding: '1.2cqw',
                }}
              >
                <img
                  src={resolveMediaUrl(book.clientLogoUrl)}
                  alt="Logo cliente"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              </div>
            )}
          </div>

          <CorporateFooter />
        </div>
      )}

      {/* 3. SEPARADOR DE SECCIÓN */}
      {renderedSlide.kind === 'section' && (
        <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: '#FFFFFF' }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: '32%',
              height: '20%',
              backgroundColor: '#7030A0',
              borderRadius: '1.6cqw',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4cqw',
              textAlign: 'center',
            }}
          >
            <h2
              style={{
                margin: 0,
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '4.4cqw',
                lineHeight: 1.1,
                letterSpacing: '0.02em',
              }}
            >
              {renderedSlide.slide.titulo || 'SECCIÓN'}
            </h2>
            {renderedSlide.slide.subtitulo?.trim() && (
              <p
                style={{
                  margin: '0.5cqw 0 0 0',
                  color: '#F3E8FF',
                  fontWeight: 500,
                  fontSize: '1.75cqw',
                }}
              >
                {renderedSlide.slide.subtitulo.trim()}
              </p>
            )}
          </div>
          <CorporateFooter />
        </div>
      )}

      {/* 4. DIAPOSITIVA DE CONTENIDO / PERFIL */}
      {renderedSlide.kind === 'item' && (
        <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: '#FFFFFF' }}>
          {/* Header Pill + Mascot */}
          <div
            style={{
              position: 'absolute',
              left: '2.7%',
              right: '2.2%',
              top: '3.1%',
              height: '10.3%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '2cqw',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1.8cqw',
                minWidth: 0,
                maxWidth: '88%',
                height: '100%',
              }}
            >
              <div
                style={{
                  height: '100%',
                  backgroundColor: '#7030A0',
                  borderRadius: '1.6cqw',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 3cqw',
                  minWidth: '34cqw',
                  maxWidth: '60cqw',
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    color: '#FFFFFF',
                    fontWeight: 700,
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontSize:
                      (renderedSlide.slide.titulo || '').length > 22 ? '2.4cqw' : '3.2cqw',
                  }}
                >
                  {renderedSlide.slide.titulo || 'Sin nombre'}
                </h2>
              </div>
              {renderedSlide.slide.subtitulo?.trim() && (
                <span
                  style={{
                    color: '#6b7280',
                    fontWeight: 500,
                    fontSize: '1.5cqw',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {renderedSlide.slide.subtitulo.trim()}
                </span>
              )}
            </div>

            <img
              src="/book-assets/cat-icon.png"
              alt="Purple"
              style={{
                height: '92%',
                aspectRatio: '1 / 1',
                objectFit: 'contain',
                flexShrink: 0,
                display: 'block',
              }}
            />
          </div>

          {/* Media Area */}
          <div
            style={{
              position: 'absolute',
              left: '4.8%',
              right: '4.8%',
              top: '16.3%',
              bottom: '5.8%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {renderedSlide.items.length === 0 ? (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  border: '2px dashed #e9d5ff',
                  borderRadius: '1.5cqw',
                  backgroundColor: 'rgba(250, 245, 255, 0.5)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#9333ea',
                  gap: '0.8cqw',
                }}
              >
                <ImageIcon style={{ width: '4.5cqw', height: '4.5cqw', opacity: 0.65 }} />
                <p style={{ margin: 0, fontWeight: 500, fontSize: '1.6cqw' }}>
                  Sin imágenes o videos asignados a esta diapositiva
                </p>
              </div>
            ) : (
              (() => {
                const { cols, rows } = getGridLayoutStyle(renderedSlide.items);
                return (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'grid',
                      gap: '1.8cqw',
                      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                      gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                    }}
                  >
                    {renderedSlide.items.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          minWidth: 0,
                          minHeight: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <div
                          style={{
                            flex: 1,
                            minHeight: 0,
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                            borderRadius: '0.8cqw',
                          }}
                        >
                          {item.mediaType === 'video' ? (
                            interactiveMedia ? (
                              <video
                                src={resolveMediaUrl(item.url)}
                                controls
                                playsInline
                                preload="metadata"
                                style={{
                                  maxWidth: '100%',
                                  maxHeight: '100%',
                                  width: 'auto',
                                  height: 'auto',
                                  objectFit: 'contain',
                                  borderRadius: '0.8cqw',
                                  backgroundColor: '#000000',
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  backgroundColor: '#111827',
                                  color: '#ffffff',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '0.6cqw',
                                  borderRadius: '0.8cqw',
                                  padding: '1cqw',
                                }}
                              >
                                <Film style={{ width: '4cqw', height: '4cqw', color: '#d8b4fe' }} />
                                <span
                                  style={{
                                    fontSize: '1.2cqw',
                                    maxWidth: '100%',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {item.filename}
                                </span>
                              </div>
                            )
                          ) : (
                            <img
                              src={resolveMediaUrl(item.url)}
                              alt={item.caption || item.filename || renderedSlide.slide.titulo}
                              onClick={
                                interactiveMedia && onMediaClick ? () => onMediaClick(item) : undefined
                              }
                              style={{
                                maxWidth: '100%',
                                maxHeight: '100%',
                                width: 'auto',
                                height: 'auto',
                                objectFit: 'contain',
                                borderRadius: '0.6cqw',
                                cursor: interactiveMedia && onMediaClick ? 'zoom-in' : 'default',
                                display: 'block',
                              }}
                            />
                          )}
                        </div>
                        {item.caption?.trim() && (
                          <p
                            style={{
                              flexShrink: 0,
                              margin: '0.5cqw 0 0 0',
                              color: '#374151',
                              fontWeight: 500,
                              textAlign: 'center',
                              fontSize: '1.25cqw',
                              width: '100%',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.caption.trim()}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* 5. CIERRE / GRACIAS */}
      {renderedSlide.kind === 'closing' && (
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            backgroundColor: '#5B108B',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '5% 5%',
          }}
        >
          <img
            src="/book-assets/cover-bg.png"
            alt="Fondo Purple"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
          <div
            style={{
              position: 'relative',
              zIndex: 2,
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2cqw',
            }}
          >
            <img
              src="/book-assets/cover-logo.png"
              alt="Purple BTL"
              style={{ width: '19.8cqw', height: '23.8cqw', objectFit: 'contain', display: 'block' }}
            />
            <h2
              style={{
                margin: 0,
                color: '#FFFFFF',
                fontWeight: 700,
                letterSpacing: '0.04em',
                lineHeight: 1,
                fontSize: '4.4cqw',
              }}
            >
              GRACIAS
            </h2>
          </div>

          <p
            style={{
              position: 'relative',
              zIndex: 2,
              margin: 0,
              color: 'rgba(255,255,255,0.95)',
              textAlign: 'center',
              lineHeight: 1.35,
              maxWidth: '90%',
              fontSize: '1.35cqw',
            }}
          >
            Este documento es propiedad intelectual de PURPLE BTL. Cualquier implementación total o
            parcial sin nuestro consentimiento, generará las acciones respectivas de acuerdo a la
            legislación que protege los Derechos de Autor.
          </p>
        </div>
      )}
    </div>
  );
};

export const BookPrintStyles: React.FC = () => (
  <style>{`
    .book-print-only {
      display: none;
    }
    @media print {
      @page {
        size: 338.67mm 190.5mm;
        margin: 0;
      }
      .no-print,
      .app-sidebar,
      .sidebar,
      nav,
      aside,
      header,
      .unified-navbar,
      button {
        display: none !important;
      }
      html, body, #root, .app-layout, .main-content, .content-container {
        overflow: visible !important;
        height: auto !important;
        min-height: auto !important;
        width: 100% !important;
        background: #ffffff !important;
        margin: 0 !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .book-print-only {
        display: block !important;
        width: 100% !important;
      }
      .book-print-page {
        width: 338.67mm !important;
        height: 190.5mm !important;
        page-break-after: always !important;
        break-after: page !important;
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
      }
      .book-print-page:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }
    }
  `}</style>
);
