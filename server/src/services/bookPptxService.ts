import fs from 'fs';
import path from 'path';
import PptxGenJS from 'pptxgenjs';

export interface BookMediaItem {
  id: string;
  url: string;
  filename: string;
  mediaType: 'image' | 'video';
  mimeType?: string;
  caption?: string;
  width?: number;
  height?: number;
}

export interface BookSlideData {
  id?: string;
  tipo: string; // 'section' | 'item'
  titulo: string;
  subtitulo?: string | null;
  itemsJson: string;
  order: number;
}

export interface BookExportData {
  id: string;
  nombre: string;
  tipoPresentacion: string;
  clienteNombre?: string | null;
  requerimiento?: string | null;
  fechaActivacion?: string | null;
  clientLogoUrl?: string | null;
  includeCover: boolean;
  includeGeneralData: boolean;
  includeClosing: boolean;
  proyecto?: {
    nombre: string;
    cliente?: { empresa?: string | null; nombre?: string | null } | null;
  } | null;
  slides: BookSlideData[];
}

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const FONT_FAMILY = 'Ubuntu';
const COLOR_PURPLE_DARK = '5B108B';
const COLOR_PURPLE = '7030A0';
const COLOR_TURQUOISE = '2AD2C5';
const COLOR_WHITE = 'FFFFFF';
const COLOR_TEXT = '1F2937';
const COLOR_MUTED = '6B7280';

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
const ASSETS_DIR = path.resolve(__dirname, '../../assets/book-assets');

function getAssetPath(filename: string): string | null {
  const fullPath = path.join(ASSETS_DIR, filename);
  return fs.existsSync(fullPath) ? fullPath : null;
}

export function resolveUploadDiskPath(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let relativePart = rawUrl.trim();
  const uploadsIdx = relativePart.indexOf('/uploads/');
  if (uploadsIdx !== -1) {
    relativePart = relativePart.slice(uploadsIdx + '/uploads/'.length);
  } else if (relativePart.startsWith('uploads/')) {
    relativePart = relativePart.slice('uploads/'.length);
  } else if (relativePart.startsWith('/')) {
    relativePart = relativePart.slice(1);
  }

  try {
    relativePart = decodeURIComponent(relativePart.split('?')[0]);
  } catch {
    relativePart = relativePart.split('?')[0];
  }

  const resolved = path.resolve(UPLOADS_DIR, relativePart);
  if (!resolved.startsWith(UPLOADS_DIR + path.sep) && resolved !== UPLOADS_DIR) {
    return null;
  }
  return fs.existsSync(resolved) ? resolved : null;
}

/**
 * Lee dimensiones reales de PNG, JPEG, GIF o WebP desde disco sin dependencias externas.
 */
export function readImageDimensions(filePath: string): { width: number; height: number } | null {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(65536);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    if (bytesRead < 12) return null;

    // PNG: signature 89 50 4E 47 0D 0A 1A 0A + IHDR width/height
    if (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    ) {
      if (bytesRead >= 24) {
        const width = buf.readUInt32BE(16);
        const height = buf.readUInt32BE(20);
        if (width > 0 && height > 0) return { width, height };
      }
      return null;
    }

    // GIF: GIF87a / GIF89a
    if (buf.toString('ascii', 0, 3) === 'GIF' && bytesRead >= 10) {
      const width = buf.readUInt16LE(6);
      const height = buf.readUInt16LE(8);
      if (width > 0 && height > 0) return { width, height };
      return null;
    }

    // WebP: RIFF....WEBP
    if (
      buf.toString('ascii', 0, 4) === 'RIFF' &&
      buf.toString('ascii', 8, 12) === 'WEBP' &&
      bytesRead >= 30
    ) {
      const chunk = buf.toString('ascii', 12, 16);
      if (chunk === 'VP8X' && bytesRead >= 30) {
        const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
        const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
        return { width, height };
      }
      if (chunk === 'VP8 ' && bytesRead >= 30) {
        const width = buf.readUInt16LE(26) & 0x3fff;
        const height = buf.readUInt16LE(28) & 0x3fff;
        if (width > 0 && height > 0) return { width, height };
      }
      if (chunk === 'VP8L' && bytesRead >= 25) {
        const bits = buf.readUInt32LE(21);
        const width = (bits & 0x3fff) + 1;
        const height = ((bits >> 14) & 0x3fff) + 1;
        return { width, height };
      }
    }

    // JPEG: FF D8 ... SOFn markers
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let offset = 2;
      while (offset + 4 < bytesRead) {
        if (buf[offset] !== 0xff) {
          offset++;
          continue;
        }
        while (offset < bytesRead && buf[offset] === 0xff) offset++;
        if (offset >= bytesRead) break;
        const marker = buf[offset];
        offset++;
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
          continue;
        }
        if (offset + 2 > bytesRead) break;
        const segLen = buf.readUInt16BE(offset);
        if (segLen < 2) break;
        // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
        const isSof =
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf);
        if (isSof && offset + 7 < bytesRead) {
          const height = buf.readUInt16BE(offset + 3);
          const width = buf.readUInt16BE(offset + 5);
          if (width > 0 && height > 0) return { width, height };
        }
        offset += segLen;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function parseSlideItems(itemsJson?: string | null): BookMediaItem[] {
  if (!itemsJson) return [];
  try {
    const parsed = JSON.parse(itemsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function computeContainedBox(
  slotX: number,
  slotY: number,
  slotW: number,
  slotH: number,
  natW?: number,
  natH?: number
): { x: number; y: number; w: number; h: number } {
  if (!natW || !natH || natW <= 0 || natH <= 0) {
    return { x: slotX, y: slotY, w: slotW, h: slotH };
  }
  const ratio = natW / natH;
  const slotRatio = slotW / slotH;
  let w = slotW;
  let h = slotH;
  if (ratio > slotRatio) {
    h = slotW / ratio;
  } else {
    w = slotH * ratio;
  }
  return {
    x: slotX + (slotW - w) / 2,
    y: slotY + (slotH - h) / 2,
    w,
    h,
  };
}

function computeGridSlots(
  items: Array<{ mediaType?: string; width?: number; height?: number }>,
  areaX: number,
  areaY: number,
  areaW: number,
  areaH: number,
  gap: number
): Array<{ x: number; y: number; w: number; h: number }> {
  const count = items.length;
  if (count <= 0) return [];
  if (count === 1) {
    return [{ x: areaX, y: areaY, w: areaW, h: areaH }];
  }
  const landscapeCount = items.filter(
    (it) => it.mediaType === 'video' || (it.width && it.height && it.width > it.height * 1.05)
  ).length;
  const preferTwoByTwoForFour = count === 4 && landscapeCount >= 2;

  if (count <= 4 && !preferTwoByTwoForFour) {
    const cols = count;
    const cellW = (areaW - gap * (cols - 1)) / cols;
    return Array.from({ length: count }, (_, idx) => ({
      x: areaX + idx * (cellW + gap),
      y: areaY,
      w: cellW,
      h: areaH,
    }));
  }
  const cols = count === 4 ? 2 : Math.min(4, Math.ceil(count / 2));
  const rows = Math.ceil(count / cols);
  const cellW = (areaW - gap * (cols - 1)) / cols;
  const cellH = (areaH - gap * (rows - 1)) / rows;
  const slots: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const itemsInRow = r === rows - 1 ? count - r * cols : cols;
    const rowWidth = itemsInRow * cellW + (itemsInRow - 1) * gap;
    const rowStartX = areaX + (areaW - rowWidth) / 2;
    slots.push({
      x: rowStartX + c * (cellW + gap),
      y: areaY + r * (cellH + gap),
      w: cellW,
      h: cellH,
    });
  }
  return slots;
}

function addCorporateFooter(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  footerBarPath: string | null,
  catIconPath: string | null
) {
  if (footerBarPath) {
    slide.addImage({
      path: footerBarPath,
      x: 0,
      y: 6.69,
      w: SLIDE_W,
      h: 0.81,
    });
  } else {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 6.72,
      w: SLIDE_W,
      h: 0.16,
      fill: { color: COLOR_TURQUOISE },
      line: { color: COLOR_TURQUOISE, width: 0 },
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 6.88,
      w: SLIDE_W,
      h: 0.62,
      fill: { color: COLOR_PURPLE_DARK },
      line: { color: COLOR_PURPLE_DARK, width: 0 },
    });
  }

  // White circle badge + Purple cat icon in bottom right
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 11.93,
    y: 6.38,
    w: 1.02,
    h: 1.02,
    fill: { color: COLOR_WHITE },
    line: { color: COLOR_WHITE, width: 0 },
  });
  if (catIconPath) {
    slide.addImage({
      path: catIconPath,
      x: 12.04,
      y: 6.49,
      w: 0.8,
      h: 0.8,
    });
  }
}

export async function generateBookPptxBuffer(book: BookExportData): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'PURPLE_WIDE', width: SLIDE_W, height: SLIDE_H });
  pptx.layout = 'PURPLE_WIDE';
  pptx.author = 'PURPLE BTL S.A.C.';
  pptx.company = 'PURPLE BTL S.A.C.';
  pptx.title = `${book.proyecto?.nombre || book.nombre} - Purple BTL`;

  const coverBgPath = getAssetPath('cover-bg.png');
  const coverLogoPath = getAssetPath('cover-logo.png');
  const footerBarPath = getAssetPath('footer-bar.png');
  const catIconPath = getAssetPath('cat-icon.png');

  const clienteDisplay =
    (book.clienteNombre || book.proyecto?.cliente?.empresa || book.proyecto?.cliente?.nombre || '').trim() || 'Cliente';
  const reqDisplay =
    (book.requerimiento || book.proyecto?.nombre || '').trim() || 'Presentación';

  // 1. PORTADA
  if (book.includeCover) {
    const slide = pptx.addSlide();
    slide.background = { color: COLOR_PURPLE_DARK };
    if (coverBgPath) {
      slide.addImage({
        path: coverBgPath,
        x: 0,
        y: 0,
        w: SLIDE_W,
        h: SLIDE_H,
      });
    }
    if (coverLogoPath) {
      slide.addImage({
        path: coverLogoPath,
        x: 5.34,
        y: 2.16,
        w: 2.64,
        h: 3.18,
      });
    } else {
      slide.addText('PURPLE', {
        x: 3.5,
        y: 2.8,
        w: 6.33,
        h: 1.5,
        fontFace: FONT_FAMILY,
        fontSize: 48,
        bold: true,
        color: COLOR_WHITE,
        align: 'center',
        valign: 'middle',
      });
    }
  }

  // 2. DATOS GENERALES
  if (book.includeGeneralData) {
    const slide = pptx.addSlide();
    slide.background = { color: COLOR_WHITE };

    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.8,
      y: 0.27,
      w: 11.65,
      h: 0.77,
      rectRadius: 0.22,
      fill: { color: COLOR_TURQUOISE },
      line: { color: COLOR_TURQUOISE, width: 0 },
    });
    slide.addText('Datos Generales', {
      x: 0.8,
      y: 0.27,
      w: 11.65,
      h: 0.77,
      fontFace: FONT_FAMILY,
      fontSize: 32,
      bold: true,
      color: COLOR_WHITE,
      align: 'center',
      valign: 'middle',
    });

    const isReporte = book.tipoPresentacion === 'reporte';
    const textRuns: PptxGenJS.TextProps[] = [
      {
        text: 'Cliente: ',
        options: { fontFace: FONT_FAMILY, fontSize: 19, bold: true, color: COLOR_PURPLE },
      },
      {
        text: clienteDisplay,
        options: { fontFace: FONT_FAMILY, fontSize: 19, bold: false, color: COLOR_TEXT, breakLine: true },
      },
      {
        text: isReporte ? 'Actividad: ' : 'Requerimiento: ',
        options: { fontFace: FONT_FAMILY, fontSize: 19, bold: true, color: COLOR_PURPLE },
      },
      {
        text: reqDisplay,
        options: {
          fontFace: FONT_FAMILY,
          fontSize: 19,
          bold: false,
          color: COLOR_TEXT,
          breakLine: Boolean(book.fechaActivacion?.trim()),
        },
      },
    ];

    if (book.fechaActivacion?.trim()) {
      textRuns.push(
        {
          text: 'Fecha de activación: ',
          options: { fontFace: FONT_FAMILY, fontSize: 19, bold: true, color: COLOR_PURPLE },
        },
        {
          text: book.fechaActivacion.trim(),
          options: { fontFace: FONT_FAMILY, fontSize: 19, bold: false, color: COLOR_TEXT },
        }
      );
    }

    slide.addText(textRuns, {
      x: 0.8,
      y: 1.55,
      w: book.clientLogoUrl ? 8.1 : 11.65,
      h: 2.8,
      valign: 'top',
      paraSpaceAfter: 10,
    });

    const clientLogoDisk = resolveUploadDiskPath(book.clientLogoUrl);
    if (clientLogoDisk) {
      const dims = readImageDimensions(clientLogoDisk);
      const box = computeContainedBox(9.2, 1.5, 3.25, 2.2, dims?.width, dims?.height);
      slide.addImage({
        path: clientLogoDisk,
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
      });
    }

    addCorporateFooter(pptx, slide, footerBarPath, catIconPath);
  }

  // 3. DIAPOSITIVAS DINÁMICAS (SECCIONES E ÍTEMS/PERFILES)
  const orderedSlides = [...(book.slides || [])].sort((a, b) => a.order - b.order);
  for (const s of orderedSlides) {
    const slide = pptx.addSlide();
    slide.background = { color: COLOR_WHITE };

    if (s.tipo === 'section') {
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 0.0,
        y: 2.41,
        w: SLIDE_W,
        h: 1.5,
        rectRadius: 0.18,
        fill: { color: COLOR_PURPLE },
        line: { color: COLOR_PURPLE, width: 0 },
      });
      slide.addText(s.titulo || 'SECCIÓN', {
        x: 0.5,
        y: 2.41,
        w: SLIDE_W - 1.0,
        h: s.subtitulo ? 1.0 : 1.5,
        fontFace: FONT_FAMILY,
        fontSize: 44,
        bold: true,
        color: COLOR_WHITE,
        align: 'center',
        valign: 'middle',
      });
      if (s.subtitulo?.trim()) {
        slide.addText(s.subtitulo.trim(), {
          x: 0.5,
          y: 3.32,
          w: SLIDE_W - 1.0,
          h: 0.48,
          fontFace: FONT_FAMILY,
          fontSize: 18,
          color: 'F3E8FF',
          align: 'center',
          valign: 'middle',
        });
      }
      addCorporateFooter(pptx, slide, footerBarPath, catIconPath);
      continue;
    }

    // Item slide: Purple rounded title pill on top-left + cat icon top-right
    const titleText = (s.titulo || 'Sin título').trim();
    const pillW = Math.min(7.8, Math.max(4.99, 1.4 + titleText.length * 0.25));

    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.36,
      y: 0.23,
      w: pillW,
      h: 0.77,
      rectRadius: 0.22,
      fill: { color: COLOR_PURPLE },
      line: { color: COLOR_PURPLE, width: 0 },
    });
    slide.addText(titleText, {
      x: 0.36,
      y: 0.23,
      w: pillW,
      h: 0.77,
      fontFace: FONT_FAMILY,
      fontSize: titleText.length > 22 ? 24 : 32,
      bold: true,
      color: COLOR_WHITE,
      align: 'center',
      valign: 'middle',
    });

    if (s.subtitulo?.trim()) {
      slide.addText(s.subtitulo.trim(), {
        x: 0.36 + pillW + 0.25,
        y: 0.32,
        w: Math.max(1.5, 12.1 - (0.36 + pillW + 0.25)),
        h: 0.6,
        fontFace: FONT_FAMILY,
        fontSize: 15,
        color: COLOR_MUTED,
        align: 'left',
        valign: 'middle',
      });
    }

    if (catIconPath) {
      slide.addImage({
        path: catIconPath,
        x: 12.41,
        y: 0.19,
        w: 0.69,
        h: 0.69,
      });
    }

    const items = parseSlideItems(s.itemsJson);
    const enrichedItems = items.map((item) => {
      if (item.mediaType === 'image' && (!item.width || !item.height)) {
        const dp = resolveUploadDiskPath(item.url);
        const dims = dp ? readImageDimensions(dp) : null;
        if (dims) return { ...item, width: dims.width, height: dims.height };
      }
      return item;
    });
    const slots = computeGridSlots(enrichedItems, 0.65, 1.22, 12.03, 5.83, 0.24);

    for (let i = 0; i < enrichedItems.length; i++) {
      const item = enrichedItems[i];
      const slot = slots[i];
      const hasCaption = Boolean(item.caption?.trim());
      const mediaSlotH = hasCaption ? Math.max(1.0, slot.h - 0.34) : slot.h;
      const diskPath = resolveUploadDiskPath(item.url);

      if (diskPath) {
        if (item.mediaType === 'video') {
          const box = computeContainedBox(
            slot.x,
            slot.y,
            slot.w,
            mediaSlotH,
            item.width || 16,
            item.height || 9
          );
          slide.addMedia({
            type: 'video',
            path: diskPath,
            x: box.x,
            y: box.y,
            w: box.w,
            h: box.h,
          });
        } else {
          const detectedDims =
            item.width && item.height ? { width: item.width, height: item.height } : readImageDimensions(diskPath);
          const box = computeContainedBox(
            slot.x,
            slot.y,
            slot.w,
            mediaSlotH,
            detectedDims?.width,
            detectedDims?.height
          );
          slide.addImage({
            path: diskPath,
            x: box.x,
            y: box.y,
            w: box.w,
            h: box.h,
          });
        }
      } else {
        slide.addShape(pptx.ShapeType.roundRect, {
          x: slot.x,
          y: slot.y,
          w: slot.w,
          h: mediaSlotH,
          rectRadius: 0.1,
          fill: { color: 'F3F4F6' },
          line: { color: 'D1D5DB', width: 1 },
        });
        slide.addText(item.filename || 'Archivo no disponible', {
          x: slot.x,
          y: slot.y,
          w: slot.w,
          h: mediaSlotH,
          fontFace: FONT_FAMILY,
          fontSize: 12,
          color: COLOR_MUTED,
          align: 'center',
          valign: 'middle',
        });
      }

      if (hasCaption) {
        slide.addText(item.caption!.trim(), {
          x: slot.x,
          y: slot.y + mediaSlotH + 0.04,
          w: slot.w,
          h: 0.28,
          fontFace: FONT_FAMILY,
          fontSize: 11,
          color: COLOR_TEXT,
          align: 'center',
          valign: 'middle',
        });
      }
    }
  }

  // 4. CIERRE / GRACIAS
  if (book.includeClosing) {
    const slide = pptx.addSlide();
    slide.background = { color: COLOR_PURPLE_DARK };
    if (coverBgPath) {
      slide.addImage({
        path: coverBgPath,
        x: 0,
        y: 0,
        w: SLIDE_W,
        h: SLIDE_H,
      });
    }
    if (coverLogoPath) {
      slide.addImage({
        path: coverLogoPath,
        x: 5.36,
        y: 1.55,
        w: 2.64,
        h: 3.18,
      });
    }
    slide.addText('GRACIAS', {
      x: 4.5,
      y: 4.82,
      w: 4.33,
      h: 0.84,
      fontFace: FONT_FAMILY,
      fontSize: 44,
      bold: true,
      color: COLOR_WHITE,
      align: 'center',
      valign: 'middle',
    });
    slide.addText(
      'Este documento es propiedad intelectual de PURPLE BTL. Cualquier implementación total o parcial sin nuestro consentimiento, generará las acciones respectivas de acuerdo a la legislación que protege los Derechos de Autor.',
      {
        x: 0.54,
        y: 6.45,
        w: 12.25,
        h: 0.7,
        fontFace: FONT_FAMILY,
        fontSize: 13.5,
        color: COLOR_WHITE,
        align: 'center',
        valign: 'middle',
      }
    );
  }

  const output = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.isBuffer(output) ? output : Buffer.from(output as Uint8Array);
}
