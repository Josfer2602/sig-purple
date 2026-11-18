import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
  Film,
  GripVertical,
  ImagePlus,
  Layers,
  LayoutGrid,
  MonitorPlay,
  Plus,
  Printer,
  Save,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useGlobalContext, API_URL } from '../context/GlobalContext';
import type { BookMediaItem, BookSlide, ProjectBook, Proyecto } from '../types/models';
import {
  BookPrintStyles,
  BookSlideCanvas,
  buildRenderedDeck,
  parseSlideItems,
  resolveMediaUrl,
  type RenderedBookSlide,
} from '../components/BookSlideCanvas';
import { buildBookClientUrl } from '../utils/clientLinks';

interface BookBuilderViewProps {
  project: Proyecto;
  initialBookId?: string;
  onBack: () => void;
}

const createTempId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function normalizeSlideForDraft(s: BookSlide, idx: number): BookSlide {
  const items = parseSlideItems(s);
  return {
    ...s,
    id: s.id || createTempId(),
    tipo: s.tipo === 'section' ? 'section' : 'item',
    titulo: s.titulo || (s.tipo === 'section' ? 'SECCIÓN' : `Diapositiva ${idx + 1}`),
    subtitulo: s.subtitulo || '',
    items,
    itemsJson: JSON.stringify(items),
    order: idx,
  };
}

function buildInitialDraft(project: Proyecto, existing?: ProjectBook | null): ProjectBook {
  if (existing) {
    const ordered = [...(existing.slides || [])]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(normalizeSlideForDraft);
    return {
      ...existing,
      slides: ordered,
    };
  }
  return {
    id: '',
    proyectoId: project.id,
    proyecto: { ...project, cliente: (project as any).cliente },
    nombre: 'Versión 1',
    tipoPresentacion: 'book',
    clienteNombre: (project as any).cliente?.empresa || '',
    requerimiento: project.nombre || '',
    fechaActivacion: '',
    clientLogoUrl: null,
    includeCover: true,
    includeGeneralData: true,
    includeClosing: true,
    slides: [],
  };
}

function extractGroupNameFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^/.]+$/, '').trim();
  const cleaned = withoutExt
    .replace(/[-_\s]*(?:\(\d+\)|#\d+|foto\s*\d+|img\s*\d+|v\d+|\d+)$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'General';
  return cleaned
    .split(' ')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

export const BookBuilderView: React.FC<BookBuilderViewProps> = ({
  project,
  initialBookId,
  onBack,
}) => {
  const { books, clientes, token, addBook, updateBook, deleteBook } = useGlobalContext();

  const clientObj = useMemo(
    () => clientes.find((c) => c.id === project.clienteId),
    [clientes, project.clienteId]
  );

  const projectBooks = useMemo(
    () => books.filter((b) => b.proyectoId === project.id),
    [books, project.id]
  );

  const [selectedBookId, setSelectedBookId] = useState<string>(() => {
    if (initialBookId) return initialBookId;
    return projectBooks[0]?.id || 'new';
  });

  const [draft, setDraft] = useState<ProjectBook>(() => {
    const found =
      projectBooks.find((b) => b.id === (initialBookId || projectBooks[0]?.id)) || null;
    const base = buildInitialDraft(project, found);
    if (!base.clienteNombre && clientObj?.empresa) {
      base.clienteNombre = clientObj.empresa;
    }
    return base;
  });

  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingPptx, setIsExportingPptx] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Studio UI states
  const [quickSlideName, setQuickSlideName] = useState('');
  const [quickSlideSubtitle, setQuickSlideSubtitle] = useState('');
  const [showBatchTray, setShowBatchTray] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [stagedMedia, setStagedMedia] = useState<BookMediaItem[]>([]);
  const [selectedStagedIds, setSelectedStagedIds] = useState<string[]>([]);
  const [batchTargetName, setBatchTargetName] = useState('');

  const [activeSlideId, setActiveSlideId] = useState<string | null>(
    () => draft.slides[0]?.id || null
  );
  const [activeDeckIndex, setActiveDeckIndex] = useState<number>(0);
  const [previewMode, setPreviewMode] = useState<'single' | 'deck'>('single');
  const [lightboxItem, setLightboxItem] = useState<BookMediaItem | null>(null);
  const [dragSlideIdx, setDragSlideIdx] = useState<number | null>(null);
  const [isQuickDropOver, setIsQuickDropOver] = useState(false);

  const quickFileInputRef = useRef<HTMLInputElement>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);
  const appendSlideFileInputRef = useRef<HTMLInputElement>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const quickNameInputRef = useRef<HTMLInputElement>(null);

  // Sync when switching selectedBookId or when backend creates first book
  useEffect(() => {
    if (selectedBookId === 'new') return;
    const found = projectBooks.find((b) => b.id === selectedBookId);
    if (found && !isDirty) {
      const next = buildInitialDraft(project, found);
      if (!next.clienteNombre && clientObj?.empresa) {
        next.clienteNombre = clientObj.empresa;
      }
      setDraft(next);
    }
  }, [selectedBookId, projectBooks, project, clientObj, isDirty]);

  const deck = useMemo<RenderedBookSlide[]>(
    () =>
      buildRenderedDeck({
        ...draft,
        proyecto: {
          ...project,
          cliente: clientObj || draft.proyecto?.cliente || null,
        },
      }),
    [draft, project, clientObj]
  );

  // Keep activeDeckIndex in bounds
  useEffect(() => {
    if (activeDeckIndex >= deck.length) {
      setActiveDeckIndex(Math.max(0, deck.length - 1));
    }
  }, [deck.length, activeDeckIndex]);

  const focusRenderedSlideByDynamicId = (slideId: string) => {
    setActiveSlideId(slideId);
    const idxInDeck = deck.findIndex(
      (d) => (d.kind === 'item' || d.kind === 'section') && d.slide.id === slideId
    );
    if (idxInDeck !== -1) {
      setActiveDeckIndex(idxInDeck);
    }
  };

  const applySlidesUpdate = (updater: (prev: BookSlide[]) => BookSlide[]) => {
    setDraft((prev) => {
      const nextSlides = updater(prev.slides).map((s, idx) => ({
        ...s,
        itemsJson: JSON.stringify(s.items || parseSlideItems(s)),
        order: idx,
      }));
      return { ...prev, slides: nextSlides };
    });
    setIsDirty(true);
  };

  const uploadFilesToServer = async (files: FileList | File[]): Promise<BookMediaItem[]> => {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return [];
    const formData = new FormData();
    formData.append('proyectoId', project.id);
    fileArr.forEach((f) => formData.append('files', f));

    setIsUploading(true);
    try {
      const res = await fetch(
        `${API_URL}/books/upload?proyectoId=${encodeURIComponent(project.id)}`,
        {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al subir archivos');
      }
      return Array.isArray(data.files) ? data.files : [];
    } finally {
      setIsUploading(false);
    }
  };

  const handleQuickCreateSlideUpload = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const rawArr = Array.from(files);
    const fallbackTitle = extractGroupNameFromFilename(rawArr[0].name);
    const titleToUse = quickSlideName.trim() || fallbackTitle;
    const subtitleToUse = quickSlideSubtitle.trim();

    try {
      const uploaded = await uploadFilesToServer(rawArr);
      if (uploaded.length === 0) return;

      const newSlideId = createTempId();
      const newSlide: BookSlide = {
        id: newSlideId,
        tipo: 'item',
        titulo: titleToUse,
        subtitulo: subtitleToUse,
        items: uploaded,
        itemsJson: JSON.stringify(uploaded),
        order: draft.slides.length,
      };

      const offsetBeforeDynamic =
        (draft.includeCover ? 1 : 0) + (draft.includeGeneralData ? 1 : 0);
      const nextDynamicIndex = draft.slides.length;

      applySlidesUpdate((prev) => [...prev, newSlide]);
      setActiveSlideId(newSlideId);
      setActiveDeckIndex(offsetBeforeDynamic + nextDynamicIndex);
      setQuickSlideName('');
      setQuickSlideSubtitle('');
      toast.success(`Diapositiva "${titleToUse}" creada (${uploaded.length} archivo(s))`);
      setTimeout(() => quickNameInputRef.current?.focus(), 40);
    } catch (err: any) {
      toast.error(err.message || 'No se pudieron subir las imágenes');
    }
  };

  const handleBatchTrayUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const uploaded = await uploadFilesToServer(files);
      setStagedMedia((prev) => [...prev, ...uploaded]);
      toast.success(`${uploaded.length} archivo(s) listos en bandeja`);
    } catch (err: any) {
      toast.error(err.message || 'Error al subir lote');
    }
  };

  const handleAutoGroupStaged = () => {
    if (stagedMedia.length === 0) return;
    const groups = new Map<string, BookMediaItem[]>();
    stagedMedia.forEach((item) => {
      const groupName = extractGroupNameFromFilename(item.filename || 'Grupo');
      const existing = groups.get(groupName) || [];
      existing.push(item);
      groups.set(groupName, existing);
    });

    const newSlides: BookSlide[] = Array.from(groups.entries()).map(([name, items], idx) => ({
      id: createTempId(),
      tipo: 'item',
      titulo: name,
      subtitulo: '',
      items,
      itemsJson: JSON.stringify(items),
      order: draft.slides.length + idx,
    }));

    applySlidesUpdate((prev) => [...prev, ...newSlides]);
    if (newSlides[0]?.id) {
      setActiveSlideId(newSlides[0].id);
      const offsetBeforeDynamic =
        (draft.includeCover ? 1 : 0) + (draft.includeGeneralData ? 1 : 0);
      setActiveDeckIndex(offsetBeforeDynamic + draft.slides.length);
    }
    setStagedMedia([]);
    setSelectedStagedIds([]);
    toast.success(`Se generaron ${newSlides.length} diapositivas automáticamente`);
  };

  const handleCreateSlideFromStagedSelection = () => {
    const selected = stagedMedia.filter((m) => selectedStagedIds.includes(m.id));
    if (selected.length === 0) {
      toast.error('Selecciona al menos un archivo de la bandeja');
      return;
    }
    const title = batchTargetName.trim() || extractGroupNameFromFilename(selected[0].filename);
    const newId = createTempId();
    const newSlide: BookSlide = {
      id: newId,
      tipo: 'item',
      titulo: title,
      subtitulo: '',
      items: selected,
      itemsJson: JSON.stringify(selected),
      order: draft.slides.length,
    };
    const offsetBeforeDynamic =
      (draft.includeCover ? 1 : 0) + (draft.includeGeneralData ? 1 : 0);
    const nextIdx = draft.slides.length;
    applySlidesUpdate((prev) => [...prev, newSlide]);
    setStagedMedia((prev) => prev.filter((m) => !selectedStagedIds.includes(m.id)));
    setSelectedStagedIds([]);
    setBatchTargetName('');
    setActiveSlideId(newId);
    setActiveDeckIndex(offsetBeforeDynamic + nextIdx);
    toast.success(`Diapositiva "${title}" añadida`);
  };

  const handleAssignStagedToActiveSlide = () => {
    if (!activeSlideId) {
      toast.error('Selecciona primero una diapositiva de contenido');
      return;
    }
    const target = draft.slides.find((s) => s.id === activeSlideId);
    if (!target || target.tipo === 'section') {
      toast.error('Solo puedes asignar archivos a diapositivas de contenido (no separadores)');
      return;
    }
    const selected = stagedMedia.filter((m) => selectedStagedIds.includes(m.id));
    if (selected.length === 0) {
      toast.error('Selecciona archivos de la bandeja');
      return;
    }
    applySlidesUpdate((prev) =>
      prev.map((s) => {
        if (s.id !== activeSlideId) return s;
        const nextItems = [...parseSlideItems(s), ...selected];
        return { ...s, items: nextItems, itemsJson: JSON.stringify(nextItems) };
      })
    );
    setStagedMedia((prev) => prev.filter((m) => !selectedStagedIds.includes(m.id)));
    setSelectedStagedIds([]);
    toast.success(`${selected.length} archivo(s) agregados a "${target.titulo}"`);
  };

  const handleAppendMediaToSlide = async (slideId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const uploaded = await uploadFilesToServer(files);
      applySlidesUpdate((prev) =>
        prev.map((s) => {
          if (s.id !== slideId) return s;
          const nextItems = [...parseSlideItems(s), ...uploaded];
          return { ...s, items: nextItems, itemsJson: JSON.stringify(nextItems) };
        })
      );
      toast.success(`${uploaded.length} archivo(s) agregados`);
    } catch (err: any) {
      toast.error(err.message || 'Error al subir archivo');
    }
  };

  const handleClientLogoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const uploaded = await uploadFilesToServer([files[0]]);
      if (uploaded[0]?.url) {
        setDraft((prev) => ({ ...prev, clientLogoUrl: uploaded[0].url }));
        setIsDirty(true);
        toast.success('Logo del cliente cargado');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar logo');
    }
  };

  const handleAddSectionDivider = (presetTitle?: string) => {
    const title = presetTitle || 'PROMOTORAS';
    const newId = createTempId();
    const newSlide: BookSlide = {
      id: newId,
      tipo: 'section',
      titulo: title,
      subtitulo: '',
      items: [],
      itemsJson: '[]',
      order: draft.slides.length,
    };
    const offsetBeforeDynamic =
      (draft.includeCover ? 1 : 0) + (draft.includeGeneralData ? 1 : 0);
    const nextIdx = draft.slides.length;
    applySlidesUpdate((prev) => [...prev, newSlide]);
    setActiveSlideId(newId);
    setActiveDeckIndex(offsetBeforeDynamic + nextIdx);
  };

  const handleAddEmptyItemSlide = () => {
    const newId = createTempId();
    const num = draft.slides.filter((s) => s.tipo !== 'section').length + 1;
    const newSlide: BookSlide = {
      id: newId,
      tipo: 'item',
      titulo: `Perfil ${num}`,
      subtitulo: '',
      items: [],
      itemsJson: '[]',
      order: draft.slides.length,
    };
    const offsetBeforeDynamic =
      (draft.includeCover ? 1 : 0) + (draft.includeGeneralData ? 1 : 0);
    const nextIdx = draft.slides.length;
    applySlidesUpdate((prev) => [...prev, newSlide]);
    setActiveSlideId(newId);
    setActiveDeckIndex(offsetBeforeDynamic + nextIdx);
  };

  const handleMoveSlide = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= draft.slides.length) return;
    const movedId = draft.slides[idx]?.id;
    applySlidesUpdate((prev) => {
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
    if (movedId) {
      const offsetBeforeDynamic =
        (draft.includeCover ? 1 : 0) + (draft.includeGeneralData ? 1 : 0);
      setActiveDeckIndex(offsetBeforeDynamic + target);
    }
  };

  const handleDropSlideReorder = (dropIdx: number) => {
    if (dragSlideIdx === null || dragSlideIdx === dropIdx) {
      setDragSlideIdx(null);
      return;
    }
    const movedId = draft.slides[dragSlideIdx]?.id;
    applySlidesUpdate((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragSlideIdx, 1);
      next.splice(dropIdx, 0, moved);
      return next;
    });
    if (movedId) {
      const offsetBeforeDynamic =
        (draft.includeCover ? 1 : 0) + (draft.includeGeneralData ? 1 : 0);
      setActiveDeckIndex(offsetBeforeDynamic + dropIdx);
    }
    setDragSlideIdx(null);
  };

  const handleDeleteSlide = (slideId: string) => {
    applySlidesUpdate((prev) => prev.filter((s) => s.id !== slideId));
    if (activeSlideId === slideId) {
      setActiveSlideId(null);
    }
  };

  const handleMoveMediaInSlide = (slideId: string, itemIdx: number, dir: -1 | 1) => {
    applySlidesUpdate((prev) =>
      prev.map((s) => {
        if (s.id !== slideId) return s;
        const items = [...parseSlideItems(s)];
        const targetIdx = itemIdx + dir;
        if (targetIdx < 0 || targetIdx >= items.length) return s;
        const [moved] = items.splice(itemIdx, 1);
        items.splice(targetIdx, 0, moved);
        return { ...s, items, itemsJson: JSON.stringify(items) };
      })
    );
  };

  const handleRemoveMediaFromSlide = (slideId: string, itemId: string) => {
    applySlidesUpdate((prev) =>
      prev.map((s) => {
        if (s.id !== slideId) return s;
        const items = parseSlideItems(s).filter((it) => it.id !== itemId);
        return { ...s, items, itemsJson: JSON.stringify(items) };
      })
    );
  };

  const handleUpdateMediaCaption = (slideId: string, itemId: string, caption: string) => {
    applySlidesUpdate((prev) =>
      prev.map((s) => {
        if (s.id !== slideId) return s;
        const items = parseSlideItems(s).map((it) =>
          it.id === itemId ? { ...it, caption } : it
        );
        return { ...s, items, itemsJson: JSON.stringify(items) };
      })
    );
  };

  const handleMoveMediaToSlide = (fromSlideId: string, itemId: string, toSlideId: string) => {
    if (!toSlideId || fromSlideId === toSlideId) return;
    let movedItem: BookMediaItem | null = null;
    applySlidesUpdate((prev) => {
      const removed = prev.map((s) => {
        if (s.id !== fromSlideId) return s;
        const items = parseSlideItems(s);
        movedItem = items.find((it) => it.id === itemId) || null;
        const rest = items.filter((it) => it.id !== itemId);
        return { ...s, items: rest, itemsJson: JSON.stringify(rest) };
      });
      if (!movedItem) return removed;
      return removed.map((s) => {
        if (s.id !== toSlideId) return s;
        const nextItems = [...parseSlideItems(s), movedItem!];
        return { ...s, items: nextItems, itemsJson: JSON.stringify(nextItems) };
      });
    });
    toast.success('Archivo movido a la diapositiva destino');
  };

  const persistBook = async (silent = false): Promise<ProjectBook | null> => {
    setIsSaving(true);
    try {
      const payload: ProjectBook = {
        ...draft,
        proyectoId: project.id,
        slides: draft.slides.map((s, idx) => {
          const items = parseSlideItems(s);
          return {
            tipo: s.tipo === 'section' ? 'section' : 'item',
            titulo: s.titulo?.trim() || `Diapositiva ${idx + 1}`,
            subtitulo: s.subtitulo?.trim() || null,
            itemsJson: JSON.stringify(items),
            order: idx,
          };
        }),
      };

      const saved = draft.id ? await updateBook(payload) : await addBook(payload);
      const synced = buildInitialDraft(project, saved);
      setDraft(synced);
      setSelectedBookId(saved.id);
      setIsDirty(false);
      if (!silent) {
        toast.success('Presentación guardada correctamente');
      }
      return saved;
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar presentación');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPptx = async () => {
    let bookToExport: ProjectBook | null = draft.id && !isDirty ? draft : await persistBook(true);
    if (!bookToExport?.id) return;

    setIsExportingPptx(true);
    try {
      const res = await fetch(`${API_URL}/books/${bookToExport.id}/export-pptx`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'No se pudo generar el PowerPoint');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const cleanName = `${project.nombre}_${draft.nombre}`.replace(/[^a-zA-Z0-9_-]+/g, '_');
      a.href = url;
      a.download = `${cleanName}.pptx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('PowerPoint (.pptx) descargado');
    } catch (err: any) {
      toast.error(err.message || 'Error al exportar PowerPoint');
    } finally {
      setIsExportingPptx(false);
    }
  };

  const handleCopyClientLink = async () => {
    const saved = !draft.id || isDirty ? await persistBook(true) : draft;
    if (!saved?.shareToken) {
      toast.error('Guarda primero para generar el enlace compartible');
      return;
    }
    const url = buildBookClientUrl(
      saved.shareToken,
      draft.clienteNombre || clientObj?.empresa,
      project.nombre,
      saved.nombre
    );
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Enlace cliente copiado al portapapeles');
    } catch {
      toast.success(`Link: ${url}`);
    }
  };

  const handleCreateNewVersion = () => {
    const nextNum = projectBooks.length + 1;
    const fresh = buildInitialDraft(project, null);
    fresh.nombre = `Versión ${nextNum}`;
    fresh.clienteNombre = clientObj?.empresa || draft.clienteNombre || '';
    setSelectedBookId('new');
    setDraft(fresh);
    setActiveSlideId(null);
    setActiveDeckIndex(0);
    setIsDirty(true);
    toast.success(`Nueva ${fresh.nombre} lista para editar y guardar`);
  };

  const handleSwitchVersion = (id: string) => {
    if (isDirty && !window.confirm('Tienes cambios sin guardar. ¿Deseas descartarlos y cambiar de versión?')) {
      return;
    }
    const found = projectBooks.find((b) => b.id === id);
    if (!found) return;
    setSelectedBookId(id);
    const next = buildInitialDraft(project, found);
    setDraft(next);
    setActiveSlideId(next.slides[0]?.id || null);
    setActiveDeckIndex(0);
    setIsDirty(false);
  };

  const handleDeleteCurrentBook = async () => {
    if (!draft.id) return;
    if (!window.confirm(`¿Eliminar la presentación "${draft.nombre}" de este proyecto?`)) return;
    try {
      await deleteBook(draft.id);
      toast.success('Presentación eliminada');
      const remaining = projectBooks.filter((b) => b.id !== draft.id);
      if (remaining[0]) {
        setSelectedBookId(remaining[0].id);
        setDraft(buildInitialDraft(project, remaining[0]));
        setIsDirty(false);
      } else {
        const fresh = buildInitialDraft(project, null);
        fresh.clienteNombre = clientObj?.empresa || '';
        setSelectedBookId('new');
        setDraft(fresh);
        setIsDirty(false);
      }
    } catch (err: any) {
      toast.error(err.message || 'No se pudo eliminar');
    }
  };

  const activeRenderedSlide = deck[activeDeckIndex] || deck[0];
  const activeDynamicSlide = draft.slides.find((s) => s.id === activeSlideId) || null;
  const activeDynamicItems = parseSlideItems(activeDynamicSlide);
  const itemSlidesOnly = draft.slides.filter((s) => s.tipo !== 'section');

  return (
    <div className="book-builder-root" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <BookPrintStyles />
      <style>{`
        .book-studio-grid {
          display: grid;
          grid-template-columns: minmax(340px, 420px) minmax(0, 1fr);
          gap: 18px;
          align-items: start;
        }
        @media (max-width: 1080px) {
          .book-studio-grid {
            grid-template-columns: 1fr;
          }
        }
        .book-thumb-strip::-webkit-scrollbar { height: 6px; }
        .book-thumb-strip::-webkit-scrollbar-thumb { background: #d8b4fe; border-radius: 99px; }
      `}</style>

      {/* HIDDEN INPUTS */}
      <input
        ref={quickFileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          handleQuickCreateSlideUpload(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={batchFileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          handleBatchTrayUpload(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={appendSlideFileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (activeSlideId) handleAppendMediaToSlide(activeSlideId, e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={logoFileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          handleClientLogoUpload(e.target.files);
          e.target.value = '';
        }}
      />

      {/* TOP TOOLBAR */}
      <div
        className="no-print"
        style={{
          backgroundColor: 'var(--bg-panel)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          boxShadow: 'var(--panel-shadow)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button
            className="btn-secondary"
            onClick={onBack}
            style={{ padding: '7px 12px', fontSize: '0.85rem' }}
          >
            <ArrowLeft size={16} /> Volver
          </button>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <BookOpen size={18} style={{ color: '#7030A0' }} />
              <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>
                {draft.clienteNombre || clientObj?.empresa || 'Cliente'} — {project.nombre}
              </strong>
              {isDirty && (
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '99px',
                    backgroundColor: '#fef3c7',
                    color: '#92400e',
                  }}
                >
                  Sin guardar
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Presentación / Book automatizado · {deck.length} diapositivas totales (16:9 Purple BTL)
            </div>
          </div>

          {projectBooks.length > 0 && (
            <select
              className="form-control"
              value={draft.id || 'new'}
              onChange={(e) => {
                if (e.target.value === 'new') handleCreateNewVersion();
                else handleSwitchVersion(e.target.value);
              }}
              style={{ width: 'auto', minWidth: '150px', padding: '6px 10px', fontSize: '0.85rem' }}
            >
              {projectBooks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre} ({b.slides?.length || 0} diapos)
                </option>
              ))}
              {!draft.id && <option value="new">{draft.nombre} (nueva)</option>}
            </select>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className="btn-secondary"
            onClick={handleCreateNewVersion}
            style={{ padding: '7px 12px', fontSize: '0.83rem' }}
            title="Crear otra versión de Book o Reporte en este proyecto"
          >
            <Plus size={15} /> Nueva Versión
          </button>

          {draft.id && (
            <button
              className="btn-secondary"
              onClick={handleDeleteCurrentBook}
              style={{ padding: '7px 10px', color: 'var(--danger)', borderColor: '#fecaca' }}
              title="Eliminar esta versión"
            >
              <Trash2 size={15} />
            </button>
          )}

          <button
            className="btn-secondary"
            onClick={handleCopyClientLink}
            style={{ padding: '7px 12px', fontSize: '0.83rem' }}
          >
            <Copy size={15} /> Link Cliente
          </button>

          <button
            className="btn-secondary"
            onClick={() => window.print()}
            style={{ padding: '7px 12px', fontSize: '0.83rem' }}
          >
            <Printer size={15} /> PDF 16:9
          </button>

          <button
            className="btn-secondary"
            disabled={isExportingPptx}
            onClick={handleDownloadPptx}
            style={{
              padding: '7px 13px',
              fontSize: '0.83rem',
              borderColor: '#7030A0',
              color: '#7030A0',
              fontWeight: 600,
            }}
          >
            <Download size={15} /> {isExportingPptx ? 'Generando PPTX...' : 'Descargar PPTX'}
          </button>

          <button
            className="btn-primary"
            disabled={isSaving}
            onClick={() => persistBook(false)}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <Save size={15} /> {isSaving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* STUDIO WORKSPACE */}
      <div className="book-studio-grid no-print">
        {/* LEFT PANEL: UPLOADER + CONFIG + SLIDES SEQUENCE */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* 1. QUICK AUTOMATED UPLOAD CARD */}
          <div
            style={{
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid #e9d5ff',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              boxShadow: 'var(--panel-shadow)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '8px',
                    backgroundColor: '#f3e8ff',
                    color: '#7030A0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ImagePlus size={16} />
                </div>
                <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                  Crear Diapositiva Automática
                </strong>
              </div>
              <button
                type="button"
                onClick={() => setShowBatchTray((v) => !v)}
                style={{
                  background: showBatchTray ? '#7030A0' : '#f3e8ff',
                  color: showBatchTray ? '#fff' : '#7030A0',
                  border: 'none',
                  borderRadius: '99px',
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Sparkles size={12} /> {showBatchTray ? 'Cerrar Lote' : 'Carga en Lote'}
              </button>
            </div>

            {!showBatchTray ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      marginBottom: '4px',
                    }}
                  >
                    1. Nombre de la diapositiva (ej. Anais, María, Activación Hall A)
                  </label>
                  <input
                    ref={quickNameInputRef}
                    type="text"
                    className="form-control"
                    placeholder="Escribe el nombre para la pastilla morada..."
                    value={quickSlideName}
                    onChange={(e) => setQuickSlideName(e.target.value)}
                    style={{ fontSize: '0.88rem' }}
                  />
                </div>

                <div>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Subtítulo o dato opcional (ej. Sede Jockey Plaza)"
                    value={quickSlideSubtitle}
                    onChange={(e) => setQuickSlideSubtitle(e.target.value)}
                    style={{ fontSize: '0.82rem', padding: '7px 11px' }}
                  />
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsQuickDropOver(true);
                  }}
                  onDragLeave={() => setIsQuickDropOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsQuickDropOver(false);
                    if (e.dataTransfer.files?.length) {
                      handleQuickCreateSlideUpload(e.dataTransfer.files);
                    }
                  }}
                  onClick={() => quickFileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${isQuickDropOver ? '#7030A0' : '#d8b4fe'}`,
                    backgroundColor: isQuickDropOver ? '#f3e8ff' : '#faf5ff',
                    borderRadius: '10px',
                    padding: '16px 12px',
                    textAlign: 'center',
                    cursor: isUploading ? 'wait' : 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Upload size={22} style={{ color: '#7030A0', marginBottom: '6px' }} />
                  <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#5B108B' }}>
                    {isUploading
                      ? 'Subiendo multimedia...'
                      : '2. Arrastra fotos o videos aquí (o haz clic)'}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Se ajustarán automáticamente en 16:9 dentro de la diapositiva
                  </div>
                </div>
              </div>
            ) : (
              /* BATCH STAGING TRAY */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={isUploading}
                    onClick={() => batchFileInputRef.current?.click()}
                    style={{ flex: 1, justifyContent: 'center', padding: '8px 12px', fontSize: '0.82rem' }}
                  >
                    <Upload size={14} /> {isUploading ? 'Subiendo...' : 'Subir Varios Archivos'}
                  </button>
                  {stagedMedia.length > 0 && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleAutoGroupStaged}
                      style={{
                        padding: '8px 12px',
                        fontSize: '0.8rem',
                        color: '#7030A0',
                        borderColor: '#d8b4fe',
                      }}
                      title="Agrupa fotos por prefijo de nombre de archivo (ej. Anais_1.jpg, Anais_2.jpg -> Diapositiva Anais)"
                    >
                      <Sparkles size={14} /> Auto-agrupar
                    </button>
                  )}
                </div>

                {stagedMedia.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', margin: '8px 0' }}>
                    Sube todas tus fotos de golpe aquí para distribuirlas o auto-agruparlas por nombre de archivo.
                  </p>
                ) : (
                  <>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                        gap: '6px',
                        maxHeight: '190px',
                        overflowY: 'auto',
                        padding: '4px',
                        backgroundColor: '#f8fafc',
                        borderRadius: '8px',
                      }}
                    >
                      {stagedMedia.map((m) => {
                        const checked = selectedStagedIds.includes(m.id);
                        return (
                          <div
                            key={m.id}
                            onClick={() =>
                              setSelectedStagedIds((prev) =>
                                prev.includes(m.id)
                                  ? prev.filter((id) => id !== m.id)
                                  : [...prev, m.id]
                              )
                            }
                            style={{
                              position: 'relative',
                              aspectRatio: '1 / 1',
                              borderRadius: '6px',
                              overflow: 'hidden',
                              border: checked ? '2px solid #7030A0' : '1px solid #e2e8f0',
                              cursor: 'pointer',
                              backgroundColor: '#fff',
                            }}
                            title={m.filename}
                          >
                            {m.mediaType === 'video' ? (
                              <div
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  backgroundColor: '#1e293b',
                                  color: '#fff',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Film size={18} />
                              </div>
                            ) : (
                              <img
                                src={resolveMediaUrl(m.url)}
                                alt={m.filename}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            )}
                            <div
                              style={{
                                position: 'absolute',
                                top: '3px',
                                right: '3px',
                                width: '16px',
                                height: '16px',
                                borderRadius: '4px',
                                backgroundColor: checked ? '#7030A0' : 'rgba(255,255,255,0.85)',
                                color: '#fff',
                                fontSize: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '1px solid #7030A0',
                              }}
                            >
                              {checked ? '✓' : ''}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Nombre para seleccionados..."
                        value={batchTargetName}
                        onChange={(e) => setBatchTargetName(e.target.value)}
                        style={{ flex: 1, padding: '6px 10px', fontSize: '0.82rem' }}
                      />
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={handleCreateSlideFromStagedSelection}
                        style={{ padding: '7px 11px', fontSize: '0.78rem', whiteSpace: 'nowrap' }}
                      >
                        + Crear Diapo ({selectedStagedIds.length})
                      </button>
                    </div>
                    {activeSlideId && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleAssignStagedToActiveSlide}
                        style={{
                          padding: '6px 10px',
                          fontSize: '0.78rem',
                          justifyContent: 'center',
                        }}
                      >
                        Añadir seleccionados a "{activeDynamicSlide?.titulo || 'diapositiva'}"
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* 2. GENERAL DATA & TEMPLATE CONFIG ACCORDION */}
          <div
            style={{
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              boxShadow: 'var(--panel-shadow)',
            }}
          >
            <button
              type="button"
              onClick={() => setShowConfigPanel((v) => !v)}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: '#fafafa',
                border: 'none',
                borderBottom: showConfigPanel ? '1px solid var(--border-color)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.88rem',
                color: 'var(--text-primary)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={15} style={{ color: '#7030A0' }} /> Datos Generales y Plantilla
              </span>
              {showConfigPanel ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showConfigPanel && (
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                      Formato
                    </label>
                    <select
                      className="form-control"
                      value={draft.tipoPresentacion}
                      onChange={(e) => {
                        setDraft((p) => ({ ...p, tipoPresentacion: e.target.value }));
                        setIsDirty(true);
                      }}
                      style={{ padding: '7px 10px', fontSize: '0.83rem' }}
                    >
                      <option value="book">Book (Requerimiento)</option>
                      <option value="reporte">Reporte (Actividad)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                      Nombre versión
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={draft.nombre}
                      onChange={(e) => {
                        setDraft((p) => ({ ...p, nombre: e.target.value }));
                        setIsDirty(true);
                      }}
                      style={{ padding: '7px 10px', fontSize: '0.83rem' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Cliente (Datos Generales)
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={draft.clienteNombre || ''}
                    onChange={(e) => {
                      setDraft((p) => ({ ...p, clienteNombre: e.target.value }));
                      setIsDirty(true);
                    }}
                    style={{ padding: '7px 10px', fontSize: '0.83rem' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    {draft.tipoPresentacion === 'reporte' ? 'Actividad' : 'Requerimiento'}
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={draft.requerimiento || ''}
                    onChange={(e) => {
                      setDraft((p) => ({ ...p, requerimiento: e.target.value }));
                      setIsDirty(true);
                    }}
                    style={{ padding: '7px 10px', fontSize: '0.83rem' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Fecha de activación (opcional)
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. Sábado 29 de noviembre"
                    value={draft.fechaActivacion || ''}
                    onChange={(e) => {
                      setDraft((p) => ({ ...p, fechaActivacion: e.target.value }));
                      setIsDirty(true);
                    }}
                    style={{ padding: '7px 10px', fontSize: '0.83rem' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Logo del Cliente (opcional):
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => logoFileInputRef.current?.click()}
                      style={{ padding: '5px 10px', fontSize: '0.76rem' }}
                    >
                      {draft.clientLogoUrl ? 'Cambiar Logo' : 'Subir Logo'}
                    </button>
                    {draft.clientLogoUrl && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setDraft((p) => ({ ...p, clientLogoUrl: null }));
                          setIsDirty(true);
                        }}
                        style={{ padding: '5px 8px', color: 'var(--danger)' }}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', paddingTop: '4px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={draft.includeCover}
                      onChange={(e) => {
                        setDraft((p) => ({ ...p, includeCover: e.target.checked }));
                        setIsDirty(true);
                      }}
                    />
                    Portada
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={draft.includeGeneralData}
                      onChange={(e) => {
                        setDraft((p) => ({ ...p, includeGeneralData: e.target.checked }));
                        setIsDirty(true);
                      }}
                    />
                    Datos Generales
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={draft.includeClosing}
                      onChange={(e) => {
                        setDraft((p) => ({ ...p, includeClosing: e.target.checked }));
                        setIsDirty(true);
                      }}
                    />
                    Cierre "Gracias"
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* 3. ORDERED SLIDE LIST */}
          <div
            style={{
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '14px 16px',
              boxShadow: 'var(--panel-shadow)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layers size={15} style={{ color: '#7030A0' }} /> Orden de Diapositivas ({draft.slides.length})
              </strong>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleAddSectionDivider('PROMOTORAS')}
                  style={{ padding: '4px 9px', fontSize: '0.74rem' }}
                  title="Insertar banner separador morado (ej. PROMOTORAS, ANIMADORAS)"
                >
                  + Separador
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleAddEmptyItemSlide}
                  style={{ padding: '4px 9px', fontSize: '0.74rem' }}
                >
                  + Diapositiva
                </button>
              </div>
            </div>

            {draft.slides.length === 0 ? (
              <div
                style={{
                  padding: '18px 12px',
                  borderRadius: '8px',
                  backgroundColor: '#f8fafc',
                  border: '1px dashed #cbd5e1',
                  textAlign: 'center',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                }}
              >
                Aún no hay diapositivas dinámicas. Usa el cuadro superior para asignar un nombre y subir fotos/videos.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '460px', overflowY: 'auto' }}>
                {draft.slides.map((s, idx) => {
                  const isActive = s.id === activeSlideId;
                  const items = parseSlideItems(s);
                  const isSection = s.tipo === 'section';
                  return (
                    <div
                      key={s.id || idx}
                      draggable
                      onDragStart={() => setDragSlideIdx(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDropSlideReorder(idx)}
                      onClick={() => s.id && focusRenderedSlideByDynamicId(s.id)}
                      style={{
                        border: isActive ? '1.5px solid #7030A0' : '1px solid var(--border-color)',
                        backgroundColor: isActive ? '#faf5ff' : '#ffffff',
                        borderRadius: '10px',
                        padding: '10px',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <GripVertical size={14} style={{ color: '#94a3b8', cursor: 'grab', flexShrink: 0 }} />
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '6px',
                            backgroundColor: isSection ? '#7030A0' : '#2AD2C5',
                            color: '#ffffff',
                            flexShrink: 0,
                          }}
                        >
                          {isSection ? 'SECCIÓN' : `#${idx + 1}`}
                        </span>

                        <input
                          type="text"
                          value={s.titulo}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (s.id) focusRenderedSlideByDynamicId(s.id);
                          }}
                          onChange={(e) => {
                            const val = e.target.value;
                            applySlidesUpdate((prev) =>
                              prev.map((item) => (item.id === s.id ? { ...item, titulo: val } : item))
                            );
                          }}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            border: '1px solid transparent',
                            borderBottom: '1px solid #e2e8f0',
                            background: 'transparent',
                            fontSize: '0.86rem',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            padding: '2px 4px',
                            outline: 'none',
                          }}
                        />

                        {!isSection && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                            {items.length} arch.
                          </span>
                        )}

                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveSlide(idx, -1);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: idx === 0 ? 'default' : 'pointer',
                            opacity: idx === 0 ? 0.3 : 0.75,
                            padding: '2px',
                          }}
                          title="Subir diapositiva"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          type="button"
                          disabled={idx === draft.slides.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveSlide(idx, 1);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: idx === draft.slides.length - 1 ? 'default' : 'pointer',
                            opacity: idx === draft.slides.length - 1 ? 0.3 : 0.75,
                            padding: '2px',
                          }}
                          title="Bajar diapositiva"
                        >
                          <ChevronDown size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (s.id) handleDeleteSlide(s.id);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--danger)',
                            padding: '2px',
                          }}
                          title="Eliminar diapositiva"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* EXPANDED MEDIA MANAGER WHEN ACTIVE */}
                      {isActive && !isSection && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            marginTop: '10px',
                            paddingTop: '10px',
                            borderTop: '1px solid #ede9fe',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="Subtítulo opcional de diapositiva..."
                              value={s.subtitulo || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                applySlidesUpdate((prev) =>
                                  prev.map((item) =>
                                    item.id === s.id ? { ...item, subtitulo: val } : item
                                  )
                                );
                              }}
                              style={{ flex: 1, padding: '5px 8px', fontSize: '0.78rem' }}
                            />
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => appendSlideFileInputRef.current?.click()}
                              style={{ padding: '5px 10px', fontSize: '0.76rem' }}
                            >
                              <Plus size={13} /> Fotos/Videos
                            </button>
                          </div>

                          {items.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {items.map((media, mIdx) => (
                                <div
                                  key={media.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '6px',
                                    backgroundColor: '#fff',
                                    borderRadius: '8px',
                                    border: '1px solid #e2e8f0',
                                  }}
                                >
                                  <div
                                    style={{
                                      width: '40px',
                                      height: '40px',
                                      borderRadius: '6px',
                                      overflow: 'hidden',
                                      backgroundColor: '#f1f5f9',
                                      flexShrink: 0,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    {media.mediaType === 'video' ? (
                                      <Film size={16} style={{ color: '#7030A0' }} />
                                    ) : (
                                      <img
                                        src={resolveMediaUrl(media.url)}
                                        alt={media.filename}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                      />
                                    )}
                                  </div>

                                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                    <div
                                      style={{
                                        fontSize: '0.74rem',
                                        color: 'var(--text-muted)',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                      }}
                                      title={media.filename}
                                    >
                                      {media.filename}
                                    </div>
                                    <input
                                      type="text"
                                      placeholder="Pie de foto opcional..."
                                      value={media.caption || ''}
                                      onChange={(e) =>
                                        s.id && handleUpdateMediaCaption(s.id, media.id, e.target.value)
                                      }
                                      style={{
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '5px',
                                        padding: '3px 6px',
                                        fontSize: '0.74rem',
                                        width: '100%',
                                      }}
                                    />
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                                    {itemSlidesOnly.length > 1 && (
                                      <select
                                        value=""
                                        onChange={(e) =>
                                          s.id &&
                                          e.target.value &&
                                          handleMoveMediaToSlide(s.id, media.id, e.target.value)
                                        }
                                        title="Mover a otra diapositiva"
                                        style={{
                                          fontSize: '0.7rem',
                                          border: '1px solid #e2e8f0',
                                          borderRadius: '4px',
                                          padding: '2px',
                                          maxWidth: '72px',
                                        }}
                                      >
                                        <option value="">Mover...</option>
                                        {itemSlidesOnly
                                          .filter((other) => other.id !== s.id)
                                          .map((other) => (
                                            <option key={other.id} value={other.id}>
                                              → {other.titulo}
                                            </option>
                                          ))}
                                      </select>
                                    )}
                                    <button
                                      type="button"
                                      disabled={mIdx === 0}
                                      onClick={() => s.id && handleMoveMediaInSlide(s.id, mIdx, -1)}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: mIdx === 0 ? 'default' : 'pointer',
                                        opacity: mIdx === 0 ? 0.3 : 0.75,
                                        padding: '2px',
                                      }}
                                      title="Mover antes"
                                    >
                                      <ChevronLeft size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={mIdx === items.length - 1}
                                      onClick={() => s.id && handleMoveMediaInSlide(s.id, mIdx, 1)}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: mIdx === items.length - 1 ? 'default' : 'pointer',
                                        opacity: mIdx === items.length - 1 ? 0.3 : 0.75,
                                        padding: '2px',
                                      }}
                                      title="Mover después"
                                    >
                                      <ChevronRight size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => s.id && handleRemoveMediaFromSlide(s.id, media.id)}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: 'var(--danger)',
                                        padding: '2px',
                                      }}
                                      title="Quitar archivo"
                                    >
                                      <X size={13} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: LIVE 16:9 SLIDE CANVAS & FILMSTRIP */}
        <div
          style={{
            backgroundColor: 'var(--bg-panel)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            boxShadow: 'var(--panel-shadow)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {/* PREVIEW HEADER CONTROLS */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: '#7030A0',
                  backgroundColor: '#f3e8ff',
                  padding: '4px 10px',
                  borderRadius: '99px',
                }}
              >
                Diapositiva {activeDeckIndex + 1} / {deck.length}
              </span>
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {activeRenderedSlide?.label}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPreviewMode('single')}
                style={{
                  padding: '6px 11px',
                  fontSize: '0.78rem',
                  backgroundColor: previewMode === 'single' ? '#7030A0' : '#fff',
                  color: previewMode === 'single' ? '#fff' : 'var(--text-primary)',
                  borderColor: previewMode === 'single' ? '#7030A0' : '#d1d5db',
                }}
              >
                <MonitorPlay size={14} /> Diapositiva
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPreviewMode('deck')}
                style={{
                  padding: '6px 11px',
                  fontSize: '0.78rem',
                  backgroundColor: previewMode === 'deck' ? '#7030A0' : '#fff',
                  color: previewMode === 'deck' ? '#fff' : 'var(--text-primary)',
                  borderColor: previewMode === 'deck' ? '#7030A0' : '#d1d5db',
                }}
              >
                <LayoutGrid size={14} /> Ver Todo ({deck.length})
              </button>
            </div>
          </div>

          {previewMode === 'single' ? (
            <>
              <div
                style={{
                  position: 'relative',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 10px 30px rgba(91, 16, 139, 0.12)',
                }}
              >
                {activeRenderedSlide && (
                  <BookSlideCanvas
                    book={{
                      ...draft,
                      proyecto: { ...project, cliente: clientObj || null },
                    }}
                    renderedSlide={activeRenderedSlide}
                    onMediaClick={(item) => setLightboxItem(item)}
                  />
                )}
              </div>

              {/* NAVIGATION + FILMSTRIP */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={activeDeckIndex === 0}
                  onClick={() => {
                    const nextIdx = Math.max(0, activeDeckIndex - 1);
                    setActiveDeckIndex(nextIdx);
                    const target = deck[nextIdx];
                    if (target && (target.kind === 'item' || target.kind === 'section')) {
                      setActiveSlideId(target.slide.id || null);
                    }
                  }}
                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                >
                  <ChevronLeft size={15} /> Anterior
                </button>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Haz clic en cualquier miniatura abajo para saltar
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={activeDeckIndex >= deck.length - 1}
                  onClick={() => {
                    const nextIdx = Math.min(deck.length - 1, activeDeckIndex + 1);
                    setActiveDeckIndex(nextIdx);
                    const target = deck[nextIdx];
                    if (target && (target.kind === 'item' || target.kind === 'section')) {
                      setActiveSlideId(target.slide.id || null);
                    }
                  }}
                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                >
                  Siguiente <ChevronRight size={15} />
                </button>
              </div>

              <div
                className="book-thumb-strip"
                style={{
                  display: 'flex',
                  gap: '10px',
                  overflowX: 'auto',
                  paddingBottom: '6px',
                }}
              >
                {deck.map((slideItem, dIdx) => {
                  const isCurrent = dIdx === activeDeckIndex;
                  return (
                    <div
                      key={slideItem.key}
                      onClick={() => {
                        setActiveDeckIndex(dIdx);
                        if (slideItem.kind === 'item' || slideItem.kind === 'section') {
                          setActiveSlideId(slideItem.slide.id || null);
                        }
                      }}
                      style={{
                        width: '150px',
                        flexShrink: 0,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      <div
                        style={{
                          borderRadius: '6px',
                          overflow: 'hidden',
                          border: isCurrent ? '2.5px solid #7030A0' : '1px solid #cbd5e1',
                          boxShadow: isCurrent ? '0 0 0 2px rgba(112, 48, 160, 0.2)' : 'none',
                        }}
                      >
                        <BookSlideCanvas
                          book={{ ...draft, proyecto: { ...project, cliente: clientObj || null } }}
                          renderedSlide={slideItem}
                          interactiveMedia={false}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: isCurrent ? 700 : 500,
                          color: isCurrent ? '#7030A0' : 'var(--text-muted)',
                          textAlign: 'center',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {dIdx + 1}. {slideItem.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {deck.map((slideItem, dIdx) => (
                <div
                  key={slideItem.key}
                  onClick={() => {
                    setActiveDeckIndex(dIdx);
                    if (slideItem.kind === 'item' || slideItem.kind === 'section') {
                      setActiveSlideId(slideItem.slide.id || null);
                    }
                  }}
                  style={{
                    borderRadius: '12px',
                    overflow: 'hidden',
                    border:
                      dIdx === activeDeckIndex ? '2px solid #7030A0' : '1px solid #e2e8f0',
                    boxShadow: '0 6px 20px rgba(0,0,0,0.06)',
                    cursor: 'pointer',
                  }}
                >
                  <BookSlideCanvas
                    book={{ ...draft, proyecto: { ...project, cliente: clientObj || null } }}
                    renderedSlide={slideItem}
                    onMediaClick={(item) => setLightboxItem(item)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* PRINT-ONLY 16:9 FULL DECK */}
      <div className="book-print-only">
        {deck.map((slideItem) => (
          <BookSlideCanvas
            key={slideItem.key}
            book={{ ...draft, proyecto: { ...project, cliente: clientObj || null } }}
            renderedSlide={slideItem}
            interactiveMedia={false}
            className="book-print-page"
          />
        ))}
      </div>

      {/* LIGHTBOX MODAL */}
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
