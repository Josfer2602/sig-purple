import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { PrismaClient } from '@prisma/client';
import { 
  updateBriefFromTranscript, 
  generateMeetingDeliverables, 
  generateDetailedCreativeIdea,
  createProjectFromBrief,
  createProjectAndQuoteFromBrief,
  populateOfficialBriefSections,
  computeHonestCompleteness,
  SmartBriefData,
  LiveQuestion,
  FuenteBriefItem,
  QuoteCategoryPayload
} from './meetingAiService';

interface MeetingRoomState {
  meetingId: string;
  clients: Set<WebSocket>;
  accumulatedTranscript: string;
  currentBrief: Partial<SmartBriefData>;
  questions: LiveQuestion[];
  isProcessingAi: boolean;
  lastAiProcessedLength: number;
  lastAiCallTime: number;
  deliverable?: any;
}

export class MeetingManager {
  private wss: WebSocketServer | null = null;
  private prisma: PrismaClient;
  private rooms: Map<string, MeetingRoomState> = new Map();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  public initWebSocket(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws/meeting' });

    console.log('🎙️ [MeetingManager] WebSocket server inicializado en /ws/meeting');

    this.wss.on('connection', (ws: WebSocket) => {
      let currentMeetingId: string | null = null;

      ws.on('message', async (data: string) => {
        try {
          const payload = JSON.parse(data.toString());
          const { type } = payload;

          if (type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            return;
          }

          if (type === 'join') {
            const { meetingId } = payload;
            currentMeetingId = meetingId;
            await this.joinRoom(meetingId, ws);
            return;
          }

          if (type === 'transcript_chunk') {
            const { meetingId, text, speaker } = payload;
            if (meetingId && text) {
              await this.handleTranscriptChunk(meetingId, text, speaker);
            }
            return;
          }

          if (type === 'manual_trigger_ai') {
            const { meetingId } = payload;
            if (meetingId) {
              await this.triggerAiAnalysis(meetingId, true);
            }
            return;
          }

          if (type === 'update_brief_manual') {
            const { meetingId, brief } = payload;
            if (meetingId && brief) {
              await this.handleManualBriefUpdate(meetingId, brief);
            }
            return;
          }

          if (type === 'dismiss_question') {
            const { meetingId, questionId } = payload;
            if (meetingId && questionId) {
              this.handleDismissQuestion(meetingId, questionId);
            }
            return;
          }

          if (type === 'generate_creative_idea') {
            const { meetingId } = payload;
            if (meetingId) {
              await this.handleGenerateCreativeIdea(meetingId);
            }
            return;
          }
        } catch (err: any) {
          console.error('[MeetingManager] Error en mensaje WS:', err.message);
          ws.send(JSON.stringify({ type: 'error', message: err.message }));
        }
      });

      ws.on('close', () => {
        if (currentMeetingId) {
          this.leaveRoom(currentMeetingId, ws);
        }
      });

      ws.on('error', (err) => {
        console.error('[MeetingManager] WebSocket error:', err);
      });
    });
  }

  private async getOrCreateRoom(meetingId: string): Promise<MeetingRoomState> {
    let room = this.rooms.get(meetingId);
    if (room) return room;

    // Cargar estado inicial desde BD si existe
    const dbMeeting = await this.prisma.reunionAsistente.findUnique({
      where: { id: meetingId }
    });

    let loadedBrief: Partial<SmartBriefData> = {};
    let loadedQuestions: LiveQuestion[] = [];
    let loadedTranscript = '';

    if (dbMeeting) {
      try {
        if (dbMeeting.briefJson) loadedBrief = JSON.parse(dbMeeting.briefJson);
        if (dbMeeting.preguntasJson) loadedQuestions = JSON.parse(dbMeeting.preguntasJson);
        if (dbMeeting.transcripcion) loadedTranscript = dbMeeting.transcripcion;
      } catch (e) {
        console.warn('[MeetingManager] Error parseando JSON de reunión BD:', e);
      }
    }

    room = {
      meetingId,
      clients: new Set(),
      accumulatedTranscript: loadedTranscript,
      currentBrief: loadedBrief,
      questions: loadedQuestions,
      isProcessingAi: false,
      lastAiProcessedLength: loadedTranscript.length,
      lastAiCallTime: 0
    };

    this.rooms.set(meetingId, room);
    return room;
  }

  private async joinRoom(meetingId: string, ws?: WebSocket) {
    const room = await this.getOrCreateRoom(meetingId);

    if (ws && typeof ws.send === 'function') {
      room.clients.add(ws);

      // Enviar estado actual al cliente recién conectado
      ws.send(JSON.stringify({
        type: 'room_state',
        meetingId,
        transcript: room.accumulatedTranscript,
        brief: room.currentBrief,
        questions: room.questions,
        completitudPorcentaje: room.currentBrief.completitudPorcentaje || 0
      }));
    }
  }

  private leaveRoom(meetingId: string, ws: WebSocket) {
    const room = this.rooms.get(meetingId);
    if (room) {
      room.clients.delete(ws);
      if (room.clients.size === 0) {
        // Guardar estado final en BD al vaciarse la sala
        this.persistRoomToDb(room).catch(console.error);
      }
    }
  }

  private broadcast(meetingId: string, message: any) {
    const room = this.rooms.get(meetingId);
    if (!room) return;

    const str = JSON.stringify(message);
    for (const client of room.clients) {
      if (client && client.readyState === WebSocket.OPEN && typeof client.send === 'function') {
        try {
          client.send(str);
        } catch (e) {
          console.warn('Error broadcasting a client:', e);
        }
      }
    }
  }

  public async handleTranscriptChunk(meetingId: string, text: string, speaker?: string) {
    const room = await this.getOrCreateRoom(meetingId);

    const formatted = speaker ? `\n[${speaker}]: ${text}` : ` ${text}`;
    room.accumulatedTranscript += formatted;

    // Notificar inmediatamente la transcripción en vivo
    this.broadcast(meetingId, {
      type: 'transcript_appended',
      chunk: formatted,
      fullTranscript: room.accumulatedTranscript
    });

    // Evaluar si corresponde ejecutar análisis con Gemini
    // Criterio: Han pasado al menos 12 segundos y hay al menos 80 caracteres nuevos
    const now = Date.now();
    const newChars = room.accumulatedTranscript.length - room.lastAiProcessedLength;
    const timeSinceLastAi = now - room.lastAiCallTime;

    if (!room.isProcessingAi && newChars >= 80 && timeSinceLastAi >= 12000) {
      await this.triggerAiAnalysis(meetingId);
    }
  }

  public async getTranscriptionContext(meetingId: string): Promise<{ previousContext: string; clienteNombre?: string; titulo?: string }> {
    const room = await this.getOrCreateRoom(meetingId);
    const dbMeeting = await this.prisma.reunionAsistente.findUnique({
      where: { id: meetingId },
      select: { titulo: true }
    }).catch(() => null);
    return {
      previousContext: room?.accumulatedTranscript?.slice(-300) || '',
      clienteNombre: room?.currentBrief?.clienteNombre,
      titulo: dbMeeting?.titulo
    };
  }

  public async handleImportSource(
    meetingId: string,
    params: {
      extractedText: string;
      sourceLabel: string;
      sourceType: FuenteBriefItem['tipo'];
      replaceTranscript?: boolean;
    }
  ) {
    const room = await this.getOrCreateRoom(meetingId);
    if (!room) throw new Error('Reunión no encontrada');

    const stamp = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    const header = `[FUENTE IMPORTADA: ${params.sourceLabel} · ${stamp}]`;
    const body = params.extractedText.trim();

    if (params.replaceTranscript) {
      room.accumulatedTranscript = `${header}\n${body}`;
    } else {
      room.accumulatedTranscript = room.accumulatedTranscript.trim()
        ? `${room.accumulatedTranscript.trim()}\n\n${header}\n${body}`
        : `${header}\n${body}`;
    }

    const existingSources = Array.isArray(room.currentBrief.fuentesIngresadas)
      ? room.currentBrief.fuentesIngresadas
      : [];
    room.currentBrief.fuentesIngresadas = [
      ...existingSources,
      {
        id: `src_${Date.now().toString(36)}`,
        tipo: params.sourceType,
        nombre: params.sourceLabel,
        fecha: new Date().toISOString(),
        caracteres: body.length
      }
    ];

    this.broadcast(meetingId, {
      type: 'transcript_appended',
      chunk: `\n\n${header}\n${body}`,
      fullTranscript: room.accumulatedTranscript
    });

    const analyzed = await this.triggerAiAnalysis(meetingId, true);
    return {
      brief: analyzed?.brief || room.currentBrief,
      questions: analyzed?.questions || room.questions,
      transcript: room.accumulatedTranscript
    };
  }

  public async triggerAiAnalysis(meetingId: string, force: boolean = false) {
    const room = await this.getOrCreateRoom(meetingId);
    if (!room) return null;
    if (room.isProcessingAi && !force) return null;
    if (!room.accumulatedTranscript || room.accumulatedTranscript.trim().length < 15) {
      return { brief: room.currentBrief, questions: room.questions, transcript: room.accumulatedTranscript };
    }

    room.isProcessingAi = true;
    this.broadcast(meetingId, { type: 'ai_processing_status', isProcessing: true });

    try {
      const dbMeeting = await this.prisma.reunionAsistente.findUnique({
        where: { id: meetingId }
      });

      let linkedClienteNombre = room.currentBrief.clienteNombre;
      const targetClienteId = room.currentBrief.clienteId || dbMeeting?.clienteId;
      if (targetClienteId) {
        const cliente = await this.prisma.cliente.findUnique({
          where: { id: targetClienteId }
        });
        if (cliente) {
          linkedClienteNombre = cliente.empresa;
        }
      }

      const result = await updateBriefFromTranscript(
        room.accumulatedTranscript,
        room.currentBrief,
        room.questions,
        {
          clienteId: targetClienteId || undefined,
          clienteNombre: linkedClienteNombre,
          titulo: dbMeeting?.titulo
        }
      );

      // Si IA detectó cliente y aún no hay clienteId vinculado, intentar vincular cliente del ERP
      let autoMatchedClientId = room.currentBrief.clienteId || result.brief.clienteId || dbMeeting?.clienteId || undefined;
      let autoMatchedClientName = room.currentBrief.clienteId
        ? room.currentBrief.clienteNombre
        : (result.brief.clienteNombre || room.currentBrief.clienteNombre);

      if (!autoMatchedClientId && autoMatchedClientName && autoMatchedClientName.trim().length > 2) {
        const matched = await this.prisma.cliente.findFirst({
          where: {
            empresa: { contains: autoMatchedClientName.trim(), mode: 'insensitive' }
          }
        }).catch(() => null);
        if (matched) {
          autoMatchedClientId = matched.id;
          autoMatchedClientName = matched.empresa;
        }
      }

      const prev = room.currentBrief;
      const isGenericName = !prev.nombreTentativoProyecto || /^Reuni[oó]n de Briefing|^Nuevo Proyecto/i.test(prev.nombreTentativoProyecto);

      room.currentBrief = {
        ...prev,
        ...result.brief,
        clienteId: autoMatchedClientId,
        clienteNombre: autoMatchedClientName,
        contactoNombre: prev.clienteId ? prev.contactoNombre : (result.brief.contactoNombre || prev.contactoNombre),
        contactoCargo: prev.clienteId ? prev.contactoCargo : (result.brief.contactoCargo || prev.contactoCargo),
        contactoEmail: prev.clienteId ? prev.contactoEmail : (result.brief.contactoEmail || prev.contactoEmail),
        contactoTelefono: prev.clienteId ? prev.contactoTelefono : (result.brief.contactoTelefono || prev.contactoTelefono),
        // Respetar tipoProyecto si fue elegido manualmente; si no, aceptar clasificación IA
        tipoProyecto: prev.tipoProyectoManual ? (prev.tipoProyecto || result.brief.tipoProyecto) : result.brief.tipoProyecto,
        tipoProyectoManual: Boolean(prev.tipoProyectoManual),
        tipoServicio: result.brief.tipoServicio || prev.tipoServicio,
        nombreTentativoProyecto: isGenericName ? (result.brief.nombreTentativoProyecto || prev.nombreTentativoProyecto) : prev.nombreTentativoProyecto,
        fuentesIngresadas: prev.fuentesIngresadas || result.brief.fuentesIngresadas || [],
        seccionesBrief: result.brief.seccionesBrief || prev.seccionesBrief,
        propuestaCreativaDetallada: prev.propuestaCreativaDetallada || result.brief.propuestaCreativaDetallada
      };

      // Control inteligente de preguntas: en re-análisis forzado reemplazar antiguas no descartadas por las nuevas preguntas de alta precisión
      const dismissedQuestions = room.questions.filter(q => q.respondida);
      const basePool = force ? [...dismissedQuestions] : [...room.questions];
      const existingNormalized = basePool.map(q => ({
        text: q.pregunta.toLowerCase().replace(/[¿?¡!.,;:"]/g, '').trim(),
        cat: q.categoria
      }));

      const nextQuestions = [...basePool];
      for (const q of result.preguntasSugeridas) {
        const normQ = q.pregunta.toLowerCase().replace(/[¿?¡!.,;:"]/g, '').trim();
        const isDuplicate = existingNormalized.some(ex => {
          if (ex.text === normQ) return true;
          const wordsQ = normQ.split(/\s+/).filter(w => w.length >= 4);
          const wordsEx = ex.text.split(/\s+/).filter(w => w.length >= 4);
          const common = wordsQ.filter(w => wordsEx.includes(w));
          return common.length >= 3;
        });

        if (!isDuplicate) {
          nextQuestions.unshift(q);
          existingNormalized.unshift({ text: normQ, cat: q.categoria });
        }
      }
      room.questions = nextQuestions.slice(0, 12);

      // Limitar a máximo 8 preguntas pendientes de respuesta
      const unreadQuestions = room.questions.filter(q => !q.respondida).slice(0, 8);
      const readQuestions = room.questions.filter(q => q.respondida).slice(0, 4);
      room.questions = [...unreadQuestions, ...readQuestions];

      room.lastAiProcessedLength = room.accumulatedTranscript.length;
      room.lastAiCallTime = Date.now();

      // Emitir actualización a todos los clientes en la reunión
      this.broadcast(meetingId, {
        type: 'brief_updated',
        brief: room.currentBrief,
        questions: room.questions,
        completitudPorcentaje: result.completitudPorcentaje
      });

      // Persistir en BD
      await this.persistRoomToDb(room);
      return {
        brief: room.currentBrief,
        questions: room.questions,
        transcript: room.accumulatedTranscript
      };
    } catch (err: any) {
      console.error(`[MeetingManager] Error procesando análisis IA para ${meetingId}:`, err.message);
      this.broadcast(meetingId, {
        type: 'ai_error',
        message: 'No se pudo actualizar el brief con IA: ' + err.message
      });
      return null;
    } finally {
      room.isProcessingAi = false;
      this.broadcast(meetingId, { type: 'ai_processing_status', isProcessing: false });
    }
  }

  public async handleManualBriefUpdate(meetingId: string, updatedBrief: Partial<SmartBriefData>) {
    const room = await this.getOrCreateRoom(meetingId);
    if (!room) return;

    const oldTipo = room.currentBrief.tipoProyecto;
    room.currentBrief = {
      ...room.currentBrief,
      ...updatedBrief
    };

    if (updatedBrief.tipoProyecto && updatedBrief.tipoProyecto !== oldTipo && !updatedBrief.seccionesBrief) {
      room.currentBrief.seccionesBrief = populateOfficialBriefSections(room.currentBrief as SmartBriefData, room.currentBrief.seccionesBrief);
    }

    room.currentBrief.completitudPorcentaje = computeHonestCompleteness(room.currentBrief as SmartBriefData);

    this.broadcast(meetingId, {
      type: 'brief_updated',
      brief: room.currentBrief,
      questions: room.questions,
      completitudPorcentaje: room.currentBrief.completitudPorcentaje || 0
    });

    await this.persistRoomToDb(room);
  }

  public async handleGenerateCreativeIdea(meetingId: string) {
    const room = await this.getOrCreateRoom(meetingId);
    if (!room) return;

    this.broadcast(meetingId, { type: 'generating_creative_idea', status: true });
    try {
      const idea = await generateDetailedCreativeIdea(
        room.currentBrief as SmartBriefData,
        room.accumulatedTranscript
      );

      room.currentBrief.propuestaCreativaDetallada = idea;
      room.currentBrief.mensajeClaveOConcepto = idea.bigIdea;

      this.broadcast(meetingId, {
        type: 'creative_idea_generated',
        propuestaCreativa: idea,
        brief: room.currentBrief
      });

      await this.persistRoomToDb(room);
      return idea;
    } catch (err: any) {
      console.error('[MeetingManager] Error generando idea creativa:', err.message);
      this.broadcast(meetingId, {
        type: 'creative_idea_error',
        message: 'No se pudo generar la propuesta creativa: ' + err.message
      });
      throw err;
    } finally {
      this.broadcast(meetingId, { type: 'generating_creative_idea', status: false });
    }
  }

  public handleDismissQuestion(meetingId: string, questionId: string) {
    const room = this.rooms.get(meetingId);
    if (!room) return;

    room.questions = room.questions.map(q => q.id === questionId ? { ...q, respondida: true } : q);

    this.broadcast(meetingId, {
      type: 'questions_updated',
      questions: room.questions
    });

    this.persistRoomToDb(room).catch(console.error);
  }

  public async finishMeeting(
    meetingId: string, 
    tipoEntregable: 'CREATIVO' | 'PRODUCCION' | 'INTEGRAL' = 'INTEGRAL',
    requiereIdeaCreativa?: boolean
  ) {
    const room = await this.getOrCreateRoom(meetingId);
    if (!room) throw new Error('Reunión no encontrada');

    // Generar entregables con Gemini
    const deliverable = await generateMeetingDeliverables(
      room.currentBrief as SmartBriefData,
      room.accumulatedTranscript,
      tipoEntregable,
      requiereIdeaCreativa
    );

    room.deliverable = deliverable;
    const deliverableJson = JSON.stringify(deliverable);

    await this.prisma.reunionAsistente.update({
      where: { id: meetingId },
      data: {
        estado: 'FINALIZADA',
        transcripcion: room.accumulatedTranscript,
        briefJson: JSON.stringify(room.currentBrief),
        preguntasJson: JSON.stringify(room.questions),
        entregableJson: deliverableJson
      }
    });

    this.broadcast(meetingId, {
      type: 'meeting_finished',
      deliverable
    });

    return deliverable;
  }

  public async convertToProject(
    meetingId: string, 
    usuarioNombre: string,
    customCategories?: QuoteCategoryPayload[],
    customBrief?: Partial<SmartBriefData>
  ) {
    const room = this.rooms.get(meetingId);
    let brief = customBrief ? { ...(room?.currentBrief || {}), ...customBrief } : room?.currentBrief;

    if (!brief || !brief.nombreTentativoProyecto) {
      const db = await this.prisma.reunionAsistente.findUnique({ where: { id: meetingId } });
      if (db?.briefJson) {
        const parsed = JSON.parse(db.briefJson);
        brief = customBrief ? { ...parsed, ...customBrief } : parsed;
      }
    }

    if (!brief) throw new Error('No hay datos de brief disponibles para crear el proyecto');

    let categoriesToUse = customCategories;
    if (!categoriesToUse || categoriesToUse.length === 0) {
      if (room?.deliverable?.categoriasCotizacion) {
        categoriesToUse = room.deliverable.categoriasCotizacion;
      } else {
        const db = await this.prisma.reunionAsistente.findUnique({ where: { id: meetingId } });
        if (db?.entregableJson) {
          try {
            const parsed = JSON.parse(db.entregableJson);
            categoriesToUse = parsed.categoriasCotizacion;
          } catch (e) {}
        }
      }
    }

    const result = await createProjectAndQuoteFromBrief(
      this.prisma, 
      brief as SmartBriefData, 
      usuarioNombre,
      categoriesToUse
    );

    await this.prisma.reunionAsistente.update({
      where: { id: meetingId },
      data: {
        proyectoId: result.project.id,
        estado: 'PROCESADA'
      }
    });

    this.broadcast(meetingId, {
      type: 'project_created',
      project: result.project,
      quote: result.quote
    });

    return result;
  }

  private async persistRoomToDb(room: MeetingRoomState) {
    try {
      await this.prisma.reunionAsistente.update({
        where: { id: room.meetingId },
        data: {
          transcripcion: room.accumulatedTranscript,
          briefJson: JSON.stringify(room.currentBrief),
          preguntasJson: JSON.stringify(room.questions),
          clienteId: room.currentBrief.clienteId || undefined,
          tipoServicio: room.currentBrief.tipoServicio,
          tipoProyecto: room.currentBrief.tipoProyecto
        }
      });
    } catch (e: any) {
      console.warn(`[MeetingManager] No se pudo guardar reunión ${room.meetingId} en BD:`, e.message);
    }
  }
}

