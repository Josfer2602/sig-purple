import { Router } from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { MeetingManager } from './meetingSocketService';
import { transcribeAudioChunk, extractSourceContent } from './meetingAiService';

const uploadSourceMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

export function createMeetingRouter(prisma: PrismaClient, meetingManager: MeetingManager) {
  const router = Router();

  // Listar todas las reuniones registradas
  router.get('/reuniones-ai', async (req: any, res: any) => {
    try {
      const reuniones = await prisma.reunionAsistente.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50
      });
      res.json(reuniones);
    } catch (err: any) {
      console.error('Error al obtener reuniones AI:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Obtener detalle de una reunión
  router.get('/reuniones-ai/:id', async (req: any, res: any) => {
    try {
      const reunion = await prisma.reunionAsistente.findUnique({
        where: { id: req.params.id }
      });
      if (!reunion) {
        return res.status(404).json({ error: 'Reunión no encontrada' });
      }
      res.json(reunion);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Iniciar / Crear una nueva sesión de reunión
  router.post('/reuniones-ai', async (req: any, res: any) => {
    try {
      const { titulo, clienteId, tipoServicio, tipoProyecto } = req.body;
      const nuevaReunion = await prisma.reunionAsistente.create({
        data: {
          titulo: titulo || `Reunión de Briefing - ${new Date().toLocaleDateString('es-PE')}`,
          clienteId: clienteId || null,
          tipoServicio: tipoServicio || 'PURPLE STRATEGY & CREATIVITY',
          tipoProyecto: tipoProyecto || 'Activación',
          estado: 'EN_PROCESO',
          briefJson: JSON.stringify({
            tipoServicio: tipoServicio || 'PURPLE STRATEGY & CREATIVITY',
            tipoProyecto: tipoProyecto || 'Activación',
            clienteId: clienteId || null,
            completitudPorcentaje: 0
          }),
          transcripcion: '',
          preguntasJson: JSON.stringify([])
        }
      });
      res.status(201).json(nuevaReunion);
    } catch (err: any) {
      console.error('Error al crear reunión AI:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Enviar chunk de transcripción vía REST (útil como fallback o integración directa)
  router.post('/reuniones-ai/:id/chunk', async (req: any, res: any) => {
    try {
      const { text, speaker, forceAi } = req.body;
      if (!text) return res.status(400).json({ error: 'Texto requerido' });

      await meetingManager.handleTranscriptChunk(req.params.id, text, speaker);
      if (forceAi) {
        await meetingManager.triggerAiAnalysis(req.params.id, true);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Crear una sesión nueva directamente desde archivo (PDF/Imagen/Word/Audio) o texto pegado (WhatsApp/Correo)
  router.post('/reuniones-ai/from-source', uploadSourceMiddleware.single('file'), async (req: any, res: any) => {
    try {
      const { titulo, clienteId, tipoServicio, tipoProyecto, text, sourceLabel } = req.body || {};
      const cleanText = typeof text === 'string' ? text.trim() : '';
      if (!cleanText && !req.file) {
        return res.status(400).json({ error: 'No se recibió texto ni archivo para importar.' });
      }
      const parsedSource = await extractSourceContent({
        text: cleanText || undefined,
        file: req.file ? {
          buffer: req.file.buffer,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype
        } : undefined,
        sourceLabel
      });

      const autoTitle = titulo || (req.file?.originalname
        ? `Brief: ${req.file.originalname.replace(/\.[^.]+$/, '')}`
        : `Brief desde ${parsedSource.sourceLabel} - ${new Date().toLocaleDateString('es-PE')}`);

      const nuevaReunion = await prisma.reunionAsistente.create({
        data: {
          titulo: autoTitle,
          clienteId: clienteId || null,
          tipoServicio: tipoServicio || 'PURPLE STRATEGY & CREATIVITY',
          tipoProyecto: tipoProyecto || 'Activación',
          estado: 'EN_PROCESO',
          briefJson: JSON.stringify({
            tipoServicio: tipoServicio || 'PURPLE STRATEGY & CREATIVITY',
            tipoProyecto: tipoProyecto || 'Activación',
            tipoProyectoManual: Boolean(req.body?.tipoProyectoManual),
            clienteId: clienteId || null,
            completitudPorcentaje: 0
          }),
          transcripcion: '',
          preguntasJson: JSON.stringify([])
        }
      });

      const imported = await meetingManager.handleImportSource(nuevaReunion.id, {
        extractedText: parsedSource.extractedText,
        sourceLabel: parsedSource.sourceLabel,
        sourceType: parsedSource.sourceType,
        replaceTranscript: true
      });

      const updatedMeeting = await prisma.reunionAsistente.findUnique({ where: { id: nuevaReunion.id } });
      res.status(201).json({
        success: true,
        meeting: updatedMeeting,
        brief: imported.brief,
        questions: imported.questions,
        transcript: imported.transcript,
        sourceLabel: parsedSource.sourceLabel
      });
    } catch (err: any) {
      console.error('Error creando brief desde fuente:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Importar fuente adicional a una sesión existente (Correo, WhatsApp, PDF, Imagen, Word, Audio)
  router.post('/reuniones-ai/:id/import-source', uploadSourceMiddleware.single('file'), async (req: any, res: any) => {
    try {
      const { text, sourceLabel, replaceTranscript } = req.body || {};
      const cleanText = typeof text === 'string' ? text.trim() : '';
      if (!cleanText && !req.file) {
        return res.status(400).json({ error: 'No se recibió texto ni archivo para importar.' });
      }
      const parsedSource = await extractSourceContent({
        text: cleanText || undefined,
        file: req.file ? {
          buffer: req.file.buffer,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype
        } : undefined,
        sourceLabel
      });

      const imported = await meetingManager.handleImportSource(req.params.id, {
        extractedText: parsedSource.extractedText,
        sourceLabel: parsedSource.sourceLabel,
        sourceType: parsedSource.sourceType,
        replaceTranscript: replaceTranscript === true || replaceTranscript === 'true'
      });

      res.json({
        success: true,
        brief: imported.brief,
        questions: imported.questions,
        transcript: imported.transcript,
        sourceLabel: parsedSource.sourceLabel,
        extractedLength: parsedSource.extractedText.length
      });
    } catch (err: any) {
      console.error('Error importando fuente al brief:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Transcribir chunk de audio (micrófono + audio interno / llamada mezclados)
  router.post('/reuniones-ai/:id/audio-chunk', async (req: any, res: any) => {
    try {
      const { audioBase64, mimeType } = req.body;
      if (!audioBase64) return res.status(400).json({ error: 'Audio requerido' });

      const sttCtx = await meetingManager.getTranscriptionContext(req.params.id);
      const text = await transcribeAudioChunk(audioBase64, mimeType || 'audio/webm', sttCtx);

      if (text && text.trim().length > 0) {
        await meetingManager.handleTranscriptChunk(req.params.id, text);
        res.json({ success: true, text });
      } else {
        res.json({ success: true, text: '' });
      }
    } catch (err: any) {
      console.error('Error procesando audio chunk:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Forzar análisis IA completo
  router.post('/reuniones-ai/:id/analizar', async (req: any, res: any) => {
    try {
      const analyzed = await meetingManager.triggerAiAnalysis(req.params.id, true);
      res.json({
        success: true,
        brief: analyzed?.brief || null,
        questions: analyzed?.questions || null,
        transcript: analyzed?.transcript || null
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Generar propuesta creativa detallada (Big Idea, Storytelling, 4 Pilares, Look&Feel)
  router.post('/reuniones-ai/:id/generate-creative-idea', async (req: any, res: any) => {
    try {
      const idea = await meetingManager.handleGenerateCreativeIdea(req.params.id);
      res.json({ success: true, propuestaCreativa: idea });
    } catch (err: any) {
      console.error('Error generando propuesta creativa:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Finalizar reunión y generar entregable
  router.post('/reuniones-ai/:id/finish', async (req: any, res: any) => {
    try {
      const { tipoEntregable, requiereIdeaCreativa } = req.body;
      const deliverable = await meetingManager.finishMeeting(
        req.params.id, 
        tipoEntregable || 'INTEGRAL',
        requiereIdeaCreativa
      );
      res.json({ success: true, deliverable });
    } catch (err: any) {
      console.error('Error finalizando reunión:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Convertir a Proyecto y Cotización en SIG Purple
  router.post('/reuniones-ai/:id/convert-project', async (req: any, res: any) => {
    try {
      const usuarioNombre = req.user?.nombre || req.body.usuarioNombre || 'Eric Higa';
      const { customCategories, customBrief } = req.body;
      const result = await meetingManager.convertToProject(
        req.params.id, 
        usuarioNombre,
        customCategories,
        customBrief
      );
      res.json({ success: true, project: result.project, quote: result.quote });
    } catch (err: any) {
      console.error('Error convirtiendo a proyecto:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Eliminar reunión
  router.delete('/reuniones-ai/:id', async (req: any, res: any) => {
    try {
      await prisma.reunionAsistente.delete({
        where: { id: req.params.id }
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

