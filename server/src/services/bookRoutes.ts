import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { fixFileNameEncoding } from './driveService';
import {
  generateBookPptxBuffer,
  readImageDimensions,
  BookMediaItem,
} from './bookPptxService';

const sanitizeSegment = (val: string, fallback = 'general') => {
  const cleaned = String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return cleaned || fallback;
};

const safeFileName = (rawName: string) => {
  const decoded = fixFileNameEncoding(rawName || 'archivo');
  const ext = path.extname(decoded).toLowerCase();
  const base = path.basename(decoded, path.extname(decoded));
  const cleanBase = sanitizeSegment(base, 'media');
  return `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${cleanBase}${ext}`;
};

export function createBookRouter(
  prisma: PrismaClient,
  authenticateToken: (req: any, res: any, next: any) => void,
  uploadsDir: string
) {
  const router = Router();
  const booksRootDir = path.join(uploadsDir, 'books');
  if (!fs.existsSync(booksRootDir)) {
    fs.mkdirSync(booksRootDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, _file, cb) => {
      const folderSeg = sanitizeSegment(
        String(req.query.proyectoId || req.body?.proyectoId || 'general'),
        'general'
      );
      const targetDir = path.join(booksRootDir, folderSeg);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      cb(null, targetDir);
    },
    filename: (_req, file, cb) => {
      cb(null, safeFileName(file.originalname));
    },
  });

  const bookUpload = multer({
    storage,
    limits: {
      fileSize: 120 * 1024 * 1024, // 120MB por archivo (videos e imágenes HQ)
      files: 60,
    },
    fileFilter: (_req, file, cb) => {
      const mime = (file.mimetype || '').toLowerCase();
      const ext = path.extname(file.originalname || '').toLowerCase();
      const isAllowedImage =
        mime.startsWith('image/') ||
        ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.jfif'].includes(ext);
      const isAllowedVideo =
        mime.startsWith('video/') ||
        ['.mp4', '.mov', '.webm', '.m4v', '.avi'].includes(ext);

      if (isAllowedImage || isAllowedVideo) {
        cb(null, true);
      } else {
        cb(
          new Error(
            `Formato no soportado (${file.originalname}). Sube imágenes (JPG, PNG, WebP, GIF) o videos (MP4, MOV, WebM).`
          )
        );
      }
    },
  });

  // Listar todos los books (opcionalmente filtrados por proyectoId)
  router.get('/', authenticateToken, async (req, res) => {
    try {
      const proyectoId = req.query.proyectoId ? String(req.query.proyectoId) : undefined;
      const books = await prisma.projectBook.findMany({
        where: proyectoId ? { proyectoId } : undefined,
        include: {
          proyecto: { include: { cliente: true } },
          slides: { orderBy: { order: 'asc' } },
        },
        orderBy: { updatedAt: 'desc' },
      });
      res.json(books);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error al obtener presentaciones' });
    }
  });

  // Vista pública por shareToken (para enlace cliente)
  router.get('/shared/:token', async (req, res) => {
    try {
      const book = await prisma.projectBook.findUnique({
        where: { shareToken: String(req.params.token) },
        include: {
          proyecto: { include: { cliente: true } },
          slides: { orderBy: { order: 'asc' } },
        },
      });
      if (!book) {
        return res.status(404).json({ error: 'Presentación o book no encontrado' });
      }
      res.json(book);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error al cargar presentación compartida' });
    }
  });

  // Subir múltiples imágenes o videos locales para armar diapositivas
  router.post('/upload', authenticateToken, (req, res) => {
    bookUpload.array('files', 60)(req, res, (err: any) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Error al subir archivos multimedia' });
      }
      const uploadedFiles = (req.files as Express.Multer.File[]) || [];
      if (uploadedFiles.length === 0) {
        return res.status(400).json({ error: 'No se recibieron archivos válidos' });
      }

      const folderSeg = sanitizeSegment(
        String(req.query.proyectoId || req.body?.proyectoId || 'general'),
        'general'
      );

      const items: BookMediaItem[] = uploadedFiles.map((file) => {
        const decodedOriginal = fixFileNameEncoding(file.originalname || file.filename);
        const ext = path.extname(file.filename).toLowerCase();
        const isVideo =
          (file.mimetype || '').toLowerCase().startsWith('video/') ||
          ['.mp4', '.mov', '.webm', '.m4v', '.avi'].includes(ext);
        const dims = !isVideo ? readImageDimensions(file.path) : null;

        return {
          id: crypto.randomUUID(),
          url: `/uploads/books/${folderSeg}/${file.filename}`,
          filename: decodedOriginal,
          mediaType: isVideo ? 'video' : 'image',
          mimeType: file.mimetype || undefined,
          width: dims?.width,
          height: dims?.height,
        };
      });

      res.json({ files: items });
    });
  });

  // Crear un nuevo book asociado a un proyecto
  router.post('/', authenticateToken, async (req, res) => {
    try {
      const {
        proyectoId,
        nombre,
        tipoPresentacion,
        clienteNombre,
        requerimiento,
        fechaActivacion,
        clientLogoUrl,
        includeCover,
        includeGeneralData,
        includeClosing,
        slides,
      } = req.body;

      if (!proyectoId) {
        return res.status(400).json({ error: 'proyectoId es obligatorio' });
      }

      const created = await prisma.projectBook.create({
        data: {
          proyectoId: String(proyectoId),
          nombre: nombre?.trim() || 'Versión 1',
          tipoPresentacion: tipoPresentacion === 'reporte' ? 'reporte' : 'book',
          clienteNombre: clienteNombre || null,
          requerimiento: requerimiento || null,
          fechaActivacion: fechaActivacion || null,
          clientLogoUrl: clientLogoUrl || null,
          includeCover: includeCover !== undefined ? Boolean(includeCover) : true,
          includeGeneralData: includeGeneralData !== undefined ? Boolean(includeGeneralData) : true,
          includeClosing: includeClosing !== undefined ? Boolean(includeClosing) : true,
          slides: Array.isArray(slides)
            ? {
                create: slides.map((s: any, idx: number) => ({
                  tipo: s.tipo === 'section' ? 'section' : 'item',
                  titulo: String(s.titulo || `Diapositiva ${idx + 1}`),
                  subtitulo: s.subtitulo ? String(s.subtitulo) : null,
                  itemsJson:
                    typeof s.itemsJson === 'string'
                      ? s.itemsJson
                      : JSON.stringify(Array.isArray(s.items) ? s.items : []),
                  order: typeof s.order === 'number' ? s.order : idx,
                })),
              }
            : undefined,
        },
        include: {
          proyecto: { include: { cliente: true } },
          slides: { orderBy: { order: 'asc' } },
        },
      });

      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error al crear la presentación' });
    }
  });

  // Actualizar metadata y diapositivas (reemplazo atómico ordenado)
  router.put('/:id', authenticateToken, async (req, res) => {
    try {
      const bookId = String(req.params.id);
      const {
        nombre,
        tipoPresentacion,
        clienteNombre,
        requerimiento,
        fechaActivacion,
        clientLogoUrl,
        includeCover,
        includeGeneralData,
        includeClosing,
        slides,
      } = req.body;

      const existing = await prisma.projectBook.findUnique({ where: { id: bookId } });
      if (!existing) {
        return res.status(404).json({ error: 'Presentación no encontrada' });
      }

      const updated = await prisma.$transaction(async (tx) => {
        if (Array.isArray(slides)) {
          await tx.bookSlide.deleteMany({ where: { bookId } });
        }

        return tx.projectBook.update({
          where: { id: bookId },
          data: {
            nombre: nombre !== undefined ? String(nombre).trim() || existing.nombre : existing.nombre,
            tipoPresentacion:
              tipoPresentacion !== undefined
                ? tipoPresentacion === 'reporte'
                  ? 'reporte'
                  : 'book'
                : existing.tipoPresentacion,
            clienteNombre: clienteNombre !== undefined ? clienteNombre || null : existing.clienteNombre,
            requerimiento: requerimiento !== undefined ? requerimiento || null : existing.requerimiento,
            fechaActivacion:
              fechaActivacion !== undefined ? fechaActivacion || null : existing.fechaActivacion,
            clientLogoUrl: clientLogoUrl !== undefined ? clientLogoUrl || null : existing.clientLogoUrl,
            includeCover: includeCover !== undefined ? Boolean(includeCover) : existing.includeCover,
            includeGeneralData:
              includeGeneralData !== undefined
                ? Boolean(includeGeneralData)
                : existing.includeGeneralData,
            includeClosing:
              includeClosing !== undefined ? Boolean(includeClosing) : existing.includeClosing,
            slides: Array.isArray(slides)
              ? {
                  create: slides.map((s: any, idx: number) => ({
                    tipo: s.tipo === 'section' ? 'section' : 'item',
                    titulo: String(s.titulo || `Diapositiva ${idx + 1}`),
                    subtitulo: s.subtitulo ? String(s.subtitulo) : null,
                    itemsJson:
                      typeof s.itemsJson === 'string'
                        ? s.itemsJson
                        : JSON.stringify(Array.isArray(s.items) ? s.items : []),
                    order: idx,
                  })),
                }
              : undefined,
          },
          include: {
            proyecto: { include: { cliente: true } },
            slides: { orderBy: { order: 'asc' } },
          },
        });
      });

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error al actualizar presentación' });
    }
  });

  // Eliminar presentación
  router.delete('/:id', authenticateToken, async (req, res) => {
    try {
      const bookId = String(req.params.id);
      await prisma.projectBook.delete({ where: { id: bookId } });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error al eliminar presentación' });
    }
  });

  // Exportar presentación editable en PowerPoint (.pptx)
  router.get('/:id/export-pptx', authenticateToken, async (req, res) => {
    try {
      const bookId = String(req.params.id);
      const book = await prisma.projectBook.findUnique({
        where: { id: bookId },
        include: {
          proyecto: { include: { cliente: true } },
          slides: { orderBy: { order: 'asc' } },
        },
      });
      if (!book) {
        return res.status(404).json({ error: 'Presentación no encontrada' });
      }

      const buffer = await generateBookPptxBuffer(book);
      const rawTitle = `${book.proyecto?.nombre || 'Presentacion'} - ${book.nombre}`;
      const safeDownloadName = sanitizeSegment(rawTitle, 'Presentacion_Purple_BTL') + '.pptx';

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${safeDownloadName}"`);
      res.send(buffer);
    } catch (err: any) {
      console.error('Error generando PPTX:', err);
      res.status(500).json({ error: err.message || 'Error al generar el archivo PPTX' });
    }
  });

  return router;
}

