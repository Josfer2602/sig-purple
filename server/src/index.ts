import 'dotenv/config';
import http from 'http';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  sendEmail,
  diagnoseEmailConnectivity,
  isSmtpCurrentlyBlocked,
  hasConfiguredHttpsTransport,
  SmtpConfig,
  HttpsEmailConfig
} from './services/emailService';
import {
  uploadToDrive,
  listSharedDrives,
  listDriveFiles,
  createDriveFolder,
  uploadFileToDrive,
  createProjectDriveStructure,
  getOrCreateProviderDriveFolder,
  uploadToProjectDriveFolder,
  fixFileNameEncoding
} from './services/driveService';
import { getOrCreateDriveFolder, resolvePathAndUpload, resolvePathAndUploadBuffer, downloadBufferFromDrive } from './services/googleDriveService';
import { startBackupCron, runFullBackup } from './services/backupService';
import { generatePdfFromUrl, checkPdfEngineHealth, closePdfBrowser } from './services/pdfService';
import { generateQuoteExcel, parseQuoteExcel } from './services/excelService';
import { MeetingManager } from './services/meetingSocketService';
import { createMeetingRouter } from './services/meetingRoutes';
import { createBookRouter } from './services/bookRoutes';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import NodeCache from 'node-cache';
import {
  getCalendarAuthUrl,
  exchangeCodeForTokens,
  getCalendarEvents,
  getStoredTokens,
  deleteTokens,
  createCalendarEvent
} from './services/calendarService';

const prisma = new PrismaClient();
const rawGeminiKey = (process.env.GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '');
const ai = new GoogleGenAI({ apiKey: rawGeminiKey });

const GEMINI_FAST_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest'
];

const isValidGeminiKeyConfigured = (): boolean =>
  Boolean(rawGeminiKey && rawGeminiKey !== 'TU_CLAVE_AQUI' && rawGeminiKey.length >= 16);

const GEMINI_MISSING_KEY_ERROR =
  'La API Key de Gemini no está configurada o es inválida en el servidor. Configura una GEMINI_API_KEY válida en las variables de entorno del backend.';

async function generateTextWithGeminiFallback(params: {
  contents: any;
  config?: Record<string, any>;
  timeoutMs?: number;
  logLabel: string;
}): Promise<string> {
  let lastError: any = null;
  const timeoutMs = params.timeoutMs ?? 20000;

  for (const modelName of GEMINI_FAST_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: params.contents,
        config: {
          ...(params.config || {}),
          abortSignal: AbortSignal.timeout(timeoutMs)
        }
      });
      if (response?.text) {
        return response.text;
      }
    } catch (err: any) {
      console.error(`[Gemini:${params.logLabel}] Error con ${modelName}:`, err?.message || err);
      lastError = err;
    }
  }

  throw lastError || new Error(`No se pudo obtener respuesta de Gemini (${params.logLabel}).`);
}
const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;
const cache = new NodeCache({ stdTTL: 60, checkperiod: 120 }); // Cache for 60 seconds by default

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  validate: { xForwardedForHeader: false },
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/api', apiLimiter); // Apply rate limiter to all /api routes

// --- UTILIDADES ---
const cleanFolderName = (name: string) => name.replace(/[^a-z0-9]/gi, '_').substring(0, 50);

/**
 * Evita duplicar ítems idénticos en una misma orden cuando la suma de ítems supera al total real.
 */
const dedupeIncomingOrderItems = (rawItems: any[], orderTotal: number) => {
  if (!Array.isArray(rawItems) || rawItems.length <= 1) return Array.isArray(rawItems) ? rawItems : [];
  const rawSum = rawItems.reduce((sum, it) => sum + (Number(it?.total) || 0), 0);
  if (orderTotal <= 0 || rawSum <= orderTotal + 0.05) return rawItems;

  const seen = new Set<string>();
  return rawItems.filter((it: any) => {
    const key = [
      String(it?.quoteSubItemId || '').trim(),
      String(it?.customDescription || it?.name || '').trim().toLowerCase(),
      Number(it?.quantity) || 0,
      Number(it?.total) || 0
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const mapOrdenItemsForCreate = (rawItems: any[], orderTotal: number) =>
  dedupeIncomingOrderItems(rawItems, orderTotal).map((it: any) => ({
    quoteSubItemId: it.quoteSubItemId,
    name: it.customDescription || it.name || 'Ítem',
    quantity: Number(it.quantity) || 0,
    unitCost: Number(it.unitCost) || 0,
    total: Number(it.total) || 0,
    customDescription: it.customDescription || it.name || undefined,
    costPercentage: it.costPercentage != null ? Number(it.costPercentage) : undefined,
  }));

const isReciboPorHonorariosDoc = (tipoDocumento?: string | null): boolean => {
  const normalized = (tipoDocumento || '').trim().toLowerCase();
  return normalized.includes('honorario') || normalized === 'rxh' || normalized === 'rhe';
};

const validateAndNormalizeDetraccion = (params: {
  aplicaDetraccion?: unknown;
  porcentajeDetraccion?: unknown;
  montoDetraccion?: unknown;
  baseAmount: number;
  isServicio: boolean;
  proveedorTipoDocumento?: string | null;
  proveedorRazonSocial?: string | null;
  clampNetoZero?: boolean;
}) => {
  const isRxH = isReciboPorHonorariosDoc(params.proveedorTipoDocumento);
  const requestedAplica = Boolean(params.aplicaDetraccion);

  if (requestedAplica && isRxH) {
    return {
      error: `Detracción SPOT no permitida: El proveedor '${params.proveedorRazonSocial || 'Recibo por Honorarios'}' emite Recibo por Honorarios (4ta Categoría) y no está sujeto a detracción.`
    };
  }

  const pct = Number(params.porcentajeDetraccion) || 0;
  const effectiveAplica = requestedAplica && params.isServicio && !isRxH && pct > 0;
  const montoDetraccion = effectiveAplica
    ? (Number(params.montoDetraccion) || Number((params.baseAmount * (pct / 100)).toFixed(2)))
    : 0;
  const rawNeto = effectiveAplica
    ? Number((params.baseAmount - montoDetraccion).toFixed(2))
    : params.baseAmount;

  return {
    aplicaDetraccion: effectiveAplica,
    porcentajeDetraccion: effectiveAplica ? pct : 0,
    montoDetraccion,
    montoNeto: params.clampNetoZero ? Math.max(0, rawNeto) : rawNeto
  };
};

const UPLOADS_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

const storage = multer.memoryStorage();
const rawUpload = multer({ storage: storage });

const sanitizeFileObj = (file: any) => {
  if (file && typeof file.originalname === 'string') {
    file.originalname = fixFileNameEncoding(file.originalname);
  }
};

const upload: any = {
  single: (fieldName: string) => (req: any, res: any, next: any) => {
    rawUpload.single(fieldName)(req, res, (err: any) => {
      if (err) return next(err);
      if (req.file) sanitizeFileObj(req.file);
      next();
    });
  },
  array: (fieldName: string, maxCount?: number) => (req: any, res: any, next: any) => {
    rawUpload.array(fieldName, maxCount)(req, res, (err: any) => {
      if (err) return next(err);
      if (req.files && Array.isArray(req.files)) req.files.forEach(sanitizeFileObj);
      next();
    });
  },
  fields: (fields: any) => (req: any, res: any, next: any) => {
    rawUpload.fields(fields)(req, res, (err: any) => {
      if (err) return next(err);
      if (req.files) {
        Object.values(req.files).forEach((arr: any) => {
          if (Array.isArray(arr)) arr.forEach(sanitizeFileObj);
        });
      }
      next();
    });
  },
  any: () => (req: any, res: any, next: any) => {
    rawUpload.any()(req, res, (err: any) => {
      if (err) return next(err);
      if (req.file) sanitizeFileObj(req.file);
      if (req.files && Array.isArray(req.files)) req.files.forEach(sanitizeFileObj);
      next();
    });
  }
};

startBackupCron();

const JWT_SECRET = process.env.JWT_SECRET || '7720120ef94c5d0396e41469ad81bd31a2898b18a1d0425254f105fc5971571e';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  validate: { xForwardedForHeader: false },
  message: 'Demasiados intentos de inicio de sesión. Por favor intenta de nuevo en 15 minutos.'
});

const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || (req.query && (req.query.token as string));
  if (!token) return res.status(401).json({ error: 'No autorizado: Token no proporcionado' });
  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Sesión expirada o token inválido. Por favor, inicia sesión nuevamente.' });
    req.user = user;
    next();
  });
};

const optionalAuthenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || (req.query && (req.query.token as string));
  if (token) {
    try {
      const user = jwt.verify(token, JWT_SECRET);
      req.user = user;
    } catch (e) { }
  }
  next();
};

const requireAdmin = (req: any, res: any, next: any) => {
  if (req.user?.role !== 'Admin') {
    return res.status(403).json({ error: 'Acceso denegado: Se requieren privilegios de Administrador' });
  }
  next();
};

const sanitizeUser = (user: any) => {
  if (!user) return null;
  const { password, smtpPass, ...safeUser } = user;
  return safeUser;
};

const MASKED_SECRET = '********';

const buildHttpsConfigFromAppConfig = (cfg: any): HttpsEmailConfig => ({
  webhookUrl: cfg?.emailWebhookUrl || process.env.EMAIL_WEBHOOK_URL || '',
  webhookSecret: cfg?.emailWebhookSecret || process.env.EMAIL_WEBHOOK_SECRET || '',
  brevoApiKey: cfg?.brevoApiKey || process.env.BREVO_API_KEY || '',
  resendApiKey: cfg?.resendApiKey || process.env.RESEND_API_KEY || '',
  fromEmail: cfg?.emailFromAddress || process.env.EMAIL_FROM || ''
});

const sanitizeAppConfig = (cfg: any, isAdmin: boolean) => {
  if (!cfg) return {};
  const hasWebhook = Boolean(cfg.emailWebhookUrl?.trim() || process.env.EMAIL_WEBHOOK_URL?.trim());
  const hasWebhookSecret = Boolean(cfg.emailWebhookSecret?.trim());
  const hasBrevo = Boolean(cfg.brevoApiKey?.trim() || process.env.BREVO_API_KEY?.trim());
  const hasResend = Boolean(cfg.resendApiKey?.trim() || process.env.RESEND_API_KEY?.trim());

  return {
    ...cfg,
    emailWebhookUrl: isAdmin ? (cfg.emailWebhookUrl || '') : (cfg.emailWebhookUrl ? '[configurado]' : ''),
    emailWebhookSecret: cfg.emailWebhookSecret ? MASKED_SECRET : '',
    brevoApiKey: cfg.brevoApiKey ? MASKED_SECRET : '',
    resendApiKey: cfg.resendApiKey ? MASKED_SECRET : '',
    hasEmailWebhook: hasWebhook,
    hasEmailWebhookSecret: hasWebhookSecret,
    hasBrevoApiKey: hasBrevo,
    hasResendApiKey: hasResend,
    hasHttpsEmailRelay: hasWebhook || hasBrevo || hasResend
  };
};

async function resolveEmailContext(userId?: string): Promise<{
  config: any;
  userDb: any;
  smtp?: SmtpConfig;
  httpsConfig: HttpsEmailConfig;
}> {
  const [config, userDb] = await Promise.all([
    prisma.appConfig.findUnique({ where: { id: 'global' } }),
    userId ? prisma.user.findUnique({ where: { id: userId } }) : Promise.resolve(null)
  ]);

  let smtp: SmtpConfig | undefined;
  if (userDb?.smtpHost?.trim() && userDb?.smtpUser?.trim() && userDb?.smtpPass?.trim()) {
    smtp = {
      host: userDb.smtpHost.trim(),
      port: userDb.smtpPort || 587,
      user: userDb.smtpUser.trim(),
      pass: userDb.smtpPass.trim()
    };
  } else {
    const adminSmtpUser = await prisma.user.findFirst({
      where: {
        smtpPass: { not: null },
        smtpUser: { not: null }
      },
      orderBy: { createdAt: 'asc' }
    });
    if (adminSmtpUser?.smtpUser?.trim() && adminSmtpUser?.smtpPass?.trim()) {
      smtp = {
        host: (adminSmtpUser.smtpHost || 'smtp.gmail.com').trim(),
        port: adminSmtpUser.smtpPort || 587,
        user: adminSmtpUser.smtpUser.trim(),
        pass: adminSmtpUser.smtpPass.trim()
      };
    }
  }

  const httpsConfig = buildHttpsConfigFromAppConfig(config);
  if (!httpsConfig.fromEmail && (smtp?.user || process.env.SMTP_USER)) {
    httpsConfig.fromEmail = (smtp?.user || process.env.SMTP_USER || '').trim();
  }

  return { config, userDb, smtp, httpsConfig };
}

function preflightPaymentEmailWarning(emailCtx: {
  config: any;
  smtp?: SmtpConfig;
  httpsConfig: HttpsEmailConfig;
}): string | undefined {
  if (!emailCtx.config?.habilitarNotificacionPagos) return undefined;

  const httpsInfo = hasConfiguredHttpsTransport(emailCtx.httpsConfig);
  if (httpsInfo.configured) return undefined;

  const hasSmtp = Boolean(
    (emailCtx.smtp?.user && emailCtx.smtp?.pass) ||
    (process.env.SMTP_USER && process.env.SMTP_PASS)
  );

  if (!hasSmtp) {
    return 'Pago registrado, pero no se pudo enviar correo: faltan credenciales SMTP o envío HTTPS en Configuración > Correos.';
  }

  if (isSmtpCurrentlyBlocked()) {
    return 'Pago registrado, pero los puertos SMTP (587/465) están bloqueados en este servidor (Render gratuito). Configura envío por HTTPS (Apps Script / Brevo / Resend) en Configuración > Correos.';
  }

  return undefined;
}

const recentPagoEmailStatus = new Map<string, { ok: boolean; error?: string; transport?: string; sentTo?: string; attachments?: string[]; updatedAt: string }>();

function recordPagoEmailStatus(pagoId: string, status: { ok: boolean; error?: string; transport?: string; sentTo?: string; attachments?: string[] }) {
  if (recentPagoEmailStatus.size >= 250) {
    const firstKey = recentPagoEmailStatus.keys().next().value;
    if (firstKey) recentPagoEmailStatus.delete(firstKey);
  }
  recentPagoEmailStatus.set(pagoId, { ...status, updatedAt: new Date().toISOString() });
}

const meetingManager = new MeetingManager(prisma);
app.use('/api', optionalAuthenticateToken, createMeetingRouter(prisma, meetingManager));
app.use('/api/books', createBookRouter(prisma, authenticateToken, UPLOADS_DIR));

// Helper para obtener el email del usuario autenticado exclusivamente desde token validado
const resolveUserEmail = (req: any): string | undefined => {
  if (req.user?.email) return String(req.user.email).toLowerCase().trim();
  const authHeader = req.headers?.['authorization'];
  if (authHeader && authHeader.split(' ')[1]) {
    try {
      const decoded: any = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      if (decoded?.email) return String(decoded.email).toLowerCase().trim();
    } catch (e) { }
  }
  return undefined;
};

/**
 * Devuelve el origen público real de la API (Render, VPS con nginx, etc.).
 * Las vistas de impresión lo usan para reconducir cualquier llamada `/api/*`
 * del bundle publicado hacia la API correcta, aunque el frontend esté en otro
 * dominio (Vercel + Render) o el bundle apunte a un dominio retirado.
 */
const resolvePrintApiOrigin = (req: any): string | undefined => {
  const firstHeaderValue = (value: any): string => {
    const raw = Array.isArray(value) ? value[0] : value;
    return typeof raw === 'string' ? raw.split(',')[0].trim() : '';
  };

  const originFromUrl = (raw: string): string | undefined => {
    if (!raw) return undefined;
    try {
      const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
      return parsed.origin;
    } catch {
      return undefined;
    }
  };

  // Render expone RENDER_EXTERNAL_URL; permite además un dominio público propio.
  const explicitOrigin = originFromUrl(
    firstHeaderValue(process.env.PUBLIC_API_URL || process.env.API_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL)
  );
  if (explicitOrigin) return explicitOrigin;

  const apiHost = firstHeaderValue(req?.headers?.['x-forwarded-host']) || firstHeaderValue(req?.headers?.host);
  if (!apiHost) return undefined;

  const forwardedProto = firstHeaderValue(req?.headers?.['x-forwarded-proto']).toLowerCase();
  const proto = forwardedProto === 'https' || forwardedProto === 'http'
    ? forwardedProto
    : (apiHost.includes('onrender.com') ? 'https' : (req?.secure ? 'https' : 'http'));

  return originFromUrl(`${proto}://${apiHost}`);
};

// --- AUTH ---
app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Correo y contraseña requeridos' });
  }
  let user = await prisma.user.findUnique({ where: { email } });
  if (user && await bcrypt.compare(password, user.password)) {
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, user: sanitizeUser(user) });
  } else res.status(401).json({ error: 'Credenciales inválidas' });
});

app.put('/api/users/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    if (req.user.id !== id && req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Prohibido' });
    }

    const { smtpHost, smtpPort, smtpUser, smtpPass, email, password, role } = req.body;
    const updateData: any = {};

    if (smtpHost !== undefined) updateData.smtpHost = smtpHost;
    if (smtpPort !== undefined) updateData.smtpPort = smtpPort;
    if (smtpUser !== undefined) updateData.smtpUser = smtpUser;
    if (smtpPass !== undefined) updateData.smtpPass = smtpPass;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined && req.user.role === 'Admin') updateData.role = role;
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData
    });
    res.json(sanitizeUser(user));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users', authenticateToken, async (req: any, res: any) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true, createdAt: true },
      orderBy: { email: 'asc' }
    });
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', authenticateToken, async (req: any, res: any) => {
  try {
    if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Prohibido' });
    const { email, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, role }
    });
    res.json({ id: user.id, email: user.email, role: user.role });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', authenticateToken, async (req: any, res: any) => {
  try {
    if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Prohibido' });
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- CLIENTES, PROYECTOS, PROVEEDORES ---
app.get('/api/clientes', authenticateToken, async (req, res) => {
  try {
    const clientes = await prisma.cliente.findMany({
      include: { contactos: true },
      orderBy: { empresa: 'asc' }
    });

    const formatted = clientes.map(c => {
      let contactos = c.contactos || [];
      if (contactos.length === 0 && (c.contacto || c.email || c.telefono)) {
        contactos = [{
          id: `legacy-${c.id}`,
          clienteId: c.id,
          nombre: c.contacto || 'Contacto Principal',
          cargo: c.cargo || null,
          email: c.email || null,
          telefono: c.telefono || null,
          esPrincipal: true
        }];
      }
      return { ...c, contactos };
    });

    res.json(formatted);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/clientes', authenticateToken, async (req, res) => {
  try {
    const { contactos, ...data } = req.body;
    const contactosList = Array.isArray(contactos) ? contactos : [];
    const principalContact = contactosList.find((c: any) => c.esPrincipal) || contactosList[0];

    const contacto = principalContact?.nombre || data.contacto || '';
    const cargo = principalContact?.cargo || data.cargo || null;
    const email = principalContact?.email || data.email || '';
    const telefono = principalContact?.telefono || data.telefono || '';

    const created = await prisma.cliente.create({
      data: {
        ...data,
        contacto,
        cargo,
        email,
        telefono,
        contactos: contactosList.length > 0 ? {
          create: contactosList.map((c: any) => ({
            nombre: String(c.nombre || '').trim(),
            cargo: c.cargo ? String(c.cargo).trim() : null,
            email: c.email ? String(c.email).trim() : null,
            telefono: c.telefono ? String(c.telefono).trim() : null,
            esPrincipal: Boolean(c.esPrincipal)
          })).filter((c: any) => c.nombre)
        } : undefined
      },
      include: { contactos: true }
    });

    res.json(created);
  } catch (error: any) {
    console.error('Error creating cliente:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/clientes/:id', authenticateToken, async (req, res) => {
  try {
    const { contactos, ...data } = req.body;
    const contactosList = Array.isArray(contactos) ? contactos : undefined;
    let syncData: any = { ...data };

    if (contactosList !== undefined) {
      const principalContact = contactosList.find((c: any) => c.esPrincipal) || contactosList[0];
      if (principalContact) {
        if (!syncData.contacto) syncData.contacto = principalContact.nombre;
        syncData.cargo = principalContact.cargo || null;
        if (!syncData.email) syncData.email = principalContact.email || '';
        if (!syncData.telefono) syncData.telefono = principalContact.telefono || '';
      }

      await prisma.contactoCliente.deleteMany({ where: { clienteId: req.params.id } });
      syncData.contactos = {
        create: contactosList.map((c: any) => ({
          nombre: String(c.nombre || '').trim(),
          cargo: c.cargo ? String(c.cargo).trim() : null,
          email: c.email ? String(c.email).trim() : null,
          telefono: c.telefono ? String(c.telefono).trim() : null,
          esPrincipal: Boolean(c.esPrincipal)
        })).filter((c: any) => c.nombre)
      };
    }

    const updated = await prisma.cliente.update({
      where: { id: req.params.id },
      data: syncData,
      include: { contactos: true }
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Error updating cliente:', error);
    res.status(500).json({ error: error.message });
  }
});
app.delete('/api/clientes/:id', authenticateToken, async (req, res) => {
  try {
    // Soft delete
    res.json(await prisma.cliente.update({ where: { id: req.params.id }, data: { estado: 'Archivado' } }));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

function isQuoteStatusForSubtotal(status?: string | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s.includes('enviad') || s.includes('aprobad') || s.includes('liquidad');
}

const parseSpecialSourceItemIdsServer = (raw: unknown): string[] => {
  let arr: unknown[] = [];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      arr = [];
    }
  }
  return Array.from(new Set(arr.map((v) => String(v || '').trim()).filter(Boolean)));
};

function resolveQuoteItemProviderCostsServer(categories: any[]): Map<string, number> {
  const itemById = new Map<string, any>();
  for (const cat of categories || []) {
    for (const item of cat?.items || []) {
      if (item?.id) itemById.set(String(item.id), item);
    }
  }
  const resolved = new Map<string, number>();
  const calc = (item: any, visiting: Set<string>): number => {
    const id = item?.id ? String(item.id) : '';
    if (id && resolved.has(id)) return resolved.get(id)!;
    if (!item?.isSpecial) {
      const val = (item?.subItems || []).reduce((acc: number, sub: any) =>
        acc + (parseFloat(String(sub.unitCost || 0).replace(',', '.')) * parseFloat(String(sub.quantity || 0).replace(',', '.')) * parseFloat(String(sub.dates || 0).replace(',', '.'))), 0);
      if (id) resolved.set(id, val);
      return val;
    }
    if (id && visiting.has(id)) return 0;
    const next = new Set(visiting);
    if (id) next.add(id);
    const srcIds = parseSpecialSourceItemIdsServer(item.specialSourceItemIds);
    let srcSum = 0;
    for (const srcId of srcIds) {
      if (srcId === id) continue;
      const src = itemById.get(srcId);
      if (src) srcSum += calc(src, next);
    }
    const rate = Number(item.specialRatePercent ?? 0) || 0;
    const val = Number((srcSum * (rate / 100)).toFixed(2));
    if (id) resolved.set(id, val);
    return val;
  };
  for (const cat of categories || []) {
    for (const item of cat?.items || []) calc(item, new Set());
  }
  return resolved;
}

function normalizeQuoteCategoriesForPersistence(categories: any[], generateFreshIds: boolean): any[] {
  const idMap = new Map<string, string>();
  const firstPass = (categories || []).map((cat: any) => {
    const catId = generateFreshIds
      ? crypto.randomUUID()
      : ((typeof cat.id === 'string' && cat.id.trim()) ? cat.id.trim() : crypto.randomUUID());
    const items = (cat.items || []).map((item: any) => {
      const origId = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : '';
      const nextId = generateFreshIds ? crypto.randomUUID() : (origId || crypto.randomUUID());
      if (origId) idMap.set(origId, nextId);
      return { ...item, id: nextId };
    });
    return { ...cat, id: catId, items };
  });

  const validItemIds = new Set<string>();
  firstPass.forEach((cat: any) => cat.items.forEach((it: any) => validItemIds.add(it.id)));

  const remapped = firstPass.map((cat: any) => ({
    ...cat,
    items: cat.items.map((item: any) => {
      const rawRefs = parseSpecialSourceItemIdsServer(item.specialSourceItemIds);
      const mappedRefs = rawRefs
        .map((r) => idMap.get(r) || r)
        .filter((r) => r !== item.id && validItemIds.has(r));
      return {
        ...item,
        isSpecial: Boolean(item.isSpecial),
        specialRatePercent: item.isSpecial
          ? (item.specialRatePercent !== undefined && item.specialRatePercent !== null ? Number(item.specialRatePercent) : 10)
          : (item.specialRatePercent !== undefined && item.specialRatePercent !== null ? Number(item.specialRatePercent) : null),
        specialSourceItemIds: mappedRefs
      };
    })
  }));

  const costMap = resolveQuoteItemProviderCostsServer(remapped);
  return remapped.map((cat: any) => ({
    ...cat,
    items: cat.items.map((item: any) => {
      if (!item.isSpecial) return item;
      const computedCost = Number((costMap.get(item.id) ?? 0).toFixed(2));
      const subs = Array.isArray(item.subItems) ? item.subItems : [];
      const nonImp = subs.filter((s: any) => !String(s?.name || '').toLowerCase().includes('imprevisto'));
      const imp = subs.find((s: any) => String(s?.name || '').toLowerCase().includes('imprevisto'));
      const baseSub = nonImp.length > 0
        ? { ...nonImp[0], name: nonImp[0].name || item.name || 'Servicio porcentual', quantity: 1, dates: 1, unitCost: computedCost }
        : { name: item.name || 'Servicio porcentual', description: '', quantity: 1, dates: 1, unitCost: computedCost, providerName: '', providerId: null };
      const syncedImp = imp
        ? { ...imp, quantity: 1, dates: 1, unitCost: 0 }
        : { name: 'Imprevistos', description: '', quantity: 1, dates: 1, unitCost: 0, providerName: '', providerId: null };
      return { ...item, subItems: [baseSub, syncedImp] };
    })
  }));
}

function calculateQuoteTotalInSoles(categories: any[], currency?: string | null, exchangeRate?: number | null): number {
  const providerCostMap = resolveQuoteItemProviderCostsServer(categories || []);
  let subTotalClient = 0;
  for (const cat of categories || []) {
    const items = cat.items || [];
    for (const item of items) {
      const itemId = item?.id ? String(item.id) : '';
      const totalProvider = item?.isSpecial && itemId && providerCostMap.has(itemId)
        ? providerCostMap.get(itemId)!
        : (item.subItems || []).reduce((acc: number, sub: any) =>
            acc + (parseFloat(String(sub.unitCost).replace(',', '.')) * parseFloat(String(sub.quantity).replace(',', '.')) * parseFloat(String(sub.dates).replace(',', '.'))), 0);
      const internalMultiplierAmount = totalProvider * (Number(item.internalMultiplierPercent) / 100);
      const financialExpense = totalProvider * (Number(item.financialExpensePercent) / 100);
      const rawCalculatedClientCost = totalProvider + internalMultiplierAmount + financialExpense;
      const totalClient = Math.round(rawCalculatedClientCost);
      subTotalClient += totalClient;
    }
  }
  const feeAgencia = subTotalClient * 0.12;
  const finalTotalClient = subTotalClient + feeAgencia;

  const rate = Number(exchangeRate) || 1.0;
  return currency === 'USD'
    ? Number((finalTotalClient * rate).toFixed(2))
    : Number(finalTotalClient.toFixed(2));
}

async function syncProjectSubtotalFromQuotes(projectId: string): Promise<number> {
  try {
    const quotes = await (prisma.quote as any).findMany({
      where: { projectId, isTemplate: false },
      include: { categories: { include: { items: { include: { subItems: true } } } } },
      orderBy: { version: 'desc' }
    });

    const approvedQuotes = quotes.filter((q: any) => {
      const s = (q.status || '').toLowerCase();
      return s.includes('aprob') || s.includes('liquid');
    });

    const targetQuotes = approvedQuotes.length > 0
      ? approvedQuotes
      : quotes.filter((q: any) => (q.status || '').toLowerCase().includes('enviad'));

    if (targetQuotes.length === 0) return 0;

    // Detectar si las cotizaciones son opciones mutuamente excluyentes (ej. "Opción 1", "Opción 2")
    const isOptionsPattern = targetQuotes.some((q: any) => /opci[oó]n|op\b/i.test(q.requirement || ''));
    let totalInSoles = 0;

    if (isOptionsPattern) {
      // Si son opciones mutuamente excluyentes, tomamos únicamente la cotización aprobada o más reciente
      const bestQuote = targetQuotes[0];
      if (bestQuote?.categories && bestQuote.categories.length > 0) {
        totalInSoles = calculateQuoteTotalInSoles(bestQuote.categories, bestQuote.currency, bestQuote.exchangeRate);
      }
    } else {
      // Agrupar por requerimiento para tomar la versión más reciente por requerimiento
      const byReqMap = new Map<string, any>();
      targetQuotes.forEach((q: any) => {
        const key = (q.requirement || q.id).trim().toLowerCase();
        const existing = byReqMap.get(key);
        if (!existing || (Number(q.version) || 1) > (Number(existing.version) || 1)) {
          byReqMap.set(key, q);
        }
      });

      byReqMap.forEach((q: any) => {
        if (q.categories && q.categories.length > 0) {
          totalInSoles += calculateQuoteTotalInSoles(q.categories, q.currency, q.exchangeRate);
        }
      });
    }

    if (totalInSoles > 0) {
      await prisma.proyecto.update({
        where: { id: projectId },
        data: { subtotal: Number(totalInSoles.toFixed(2)) }
      });
      return Number(totalInSoles.toFixed(2));
    }
  } catch (err) {
    console.error(`Error syncing subtotal for project ${projectId}:`, err);
  }
  return 0;
}

app.get('/api/proyectos', authenticateToken, async (req, res) => {
  try {
    const proyectos = await prisma.proyecto.findMany({
      orderBy: { fechaRegistro: 'desc' }
    });
    res.json(proyectos);
  } catch (error: any) {
    console.error('Error fetching proyectos:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint opcional para sincronizar subtotales bajo demanda (no en cada GET)
app.post('/api/proyectos/sync-subtotals', authenticateToken, async (req, res) => {
  try {
    const proyectos = await prisma.proyecto.findMany({ select: { id: true } });
    let updatedCount = 0;
    // Procesar en lotes pequeños de 10 para no saturar el pool de conexiones
    const batchSize = 10;
    for (let i = 0; i < proyectos.length; i += batchSize) {
      const batch = proyectos.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (p: any) => {
          const synced = await syncProjectSubtotalFromQuotes(p.id);
          if (synced > 0) updatedCount++;
        })
      );
    }
    res.json({ success: true, updatedCount, total: proyectos.length });
  } catch (error: any) {
    console.error('Error en sync-subtotals:', error);
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/proyectos', authenticateToken, async (req: any, res: any) => {
  try {
    const userEmail = resolveUserEmail(req);
    const { userEmail: _, ...projectData } = req.body;

    // Garantizar ID único secuencial para el Proyecto (ej. PRJ-2026-003)
    let finalId = projectData.id;
    const currentYear = new Date().getFullYear();
    const existingProjects = await prisma.proyecto.findMany({ select: { id: true } });
    const existingIds = new Set(existingProjects.map(p => p.id));

    if (!finalId || existingIds.has(finalId)) {
      const numbers = existingProjects
        .map(p => {
          const match = p.id?.match(/PRJ-\d{4}-(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => !isNaN(n));
      const nextNum = (numbers.length > 0 ? Math.max(...numbers) : 0) + 1;
      finalId = `PRJ-${currentYear}-${String(nextNum).padStart(3, '0')}`;
    }

    // Buscar información del cliente para la estructura de carpetas
    let clientName = 'Cliente';
    if (projectData.clienteId) {
      try {
        const cliente = await prisma.cliente.findUnique({
          where: { id: projectData.clienteId }
        });
        if (cliente && cliente.empresa) {
          clientName = cliente.empresa;
        }
      } catch (e: any) {
        console.warn('No se pudo obtener el nombre del cliente:', e.message);
      }
    }

    let driveFolderId: string | undefined;
    let driveFolderUrl: string | undefined;

    // Crear la estructura de carpetas en Google Drive (Repositorio SIG PurpleBTL)
    if (projectData.nombre) {
      try {
        console.log(`[Google Drive] Creando estructura oficial para proyecto "${projectData.nombre}" (Cliente: "${clientName}")...`);
        const driveResult = await createProjectDriveStructure({
          clientName,
          projectName: projectData.nombre,
          userEmail
        });
        if (driveResult && driveResult.folderId) {
          driveFolderId = driveResult.folderId;
          driveFolderUrl = driveResult.webViewLink;
          console.log(`[Google Drive] Proyecto vinculado con ID de carpeta: ${driveFolderId}`);
        }
      } catch (driveErr: any) {
        console.error('[Google Drive] Error al crear carpetas en Google Drive:', driveErr.message);
      }
    }

    const { fechaEstado: pFechaEstado, ...restProjectData } = projectData;

    const created = await prisma.proyecto.create({
      data: {
        ...restProjectData,
        id: finalId,
        fechaRegistro: restProjectData.fechaRegistro || new Date().toLocaleDateString('es-PE'),
        fechaAprobacion: restProjectData.fechaAprobacion || pFechaEstado || null,
        moneda: restProjectData.moneda || 'PEN',
        subtotal: typeof restProjectData.subtotal === 'number' ? restProjectData.subtotal : (parseFloat(restProjectData.subtotal) || 0),
        gastosAdicionales: restProjectData.gastosAdicionales !== undefined ? Number(restProjectData.gastosAdicionales) : 0,
        gastosAdicionalesNota: restProjectData.gastosAdicionalesNota || null,
        driveFolderId: driveFolderId || null,
        driveFolderUrl: driveFolderUrl || null,
        contactoId: restProjectData.contactoId || null,
        contactoNombre: restProjectData.contactoNombre || null,
        contactoCargo: restProjectData.contactoCargo || null,
        contactoEmail: restProjectData.contactoEmail || null,
        contactoTelefono: restProjectData.contactoTelefono || null
      }
    });

    res.json(created);
  } catch (error: any) {
    console.error('Error al registrar proyecto:', error);
    res.status(500).json({ error: error.message });
  }
});
app.put('/api/proyectos/:id', authenticateToken, async (req, res) => {
  try {
    const updateData = { ...req.body };
    delete updateData.id;
    delete updateData.cliente;
    delete updateData.facturasCliente;
    if (updateData.fechaEstado !== undefined && updateData.fechaAprobacion === undefined) {
      updateData.fechaAprobacion = updateData.fechaEstado;
    }
    delete updateData.fechaEstado;
    if (updateData.gastosAdicionales !== undefined) {
      updateData.gastosAdicionales = Number(updateData.gastosAdicionales) || 0;
    }
    res.json(await prisma.proyecto.update({ where: { id: req.params.id }, data: updateData }));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
app.delete('/api/proyectos/:id', authenticateToken, async (req, res) => {
  try {
    res.json(await prisma.proyecto.update({ where: { id: req.params.id }, data: { estado: 'Archivado' } }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});


// Facturas Cliente
app.get('/api/facturas-cliente', authenticateToken, async (req, res) => {
  try {
    const facturas = await prisma.facturaCliente.findMany({
      include: {
        proyecto: {
          include: { cliente: true }
        }
      },
      orderBy: { fechaEmision: 'desc' }
    });
    res.json(facturas);
  } catch (error: any) {
    console.error('Error fetching facturas-cliente:', error);
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/facturas-cliente', authenticateToken, async (req, res) => {
  try {
    const { id, createdAt, updatedAt, proyecto, cliente, ...cleanData } = req.body;
    const rec = Number(cleanData.importeRecibido) || 0;
    const tot = Number(cleanData.montoConIgv) || 0;
    const aplicaDet = cleanData.aplicaDetraccion;
    const aplicaRet = cleanData.aplicaRetencion;
    const retDetMonto = aplicaDet ? Number((tot * 0.12).toFixed(2)) : (aplicaRet ? Number((tot * 0.03).toFixed(2)) : 0);
    const neto = Number((tot - retDetMonto).toFixed(2));
    const pagoImpuestos = cleanData.pagoImpuestos || false;

    let estado = cleanData.estado;
    if (!estado) {
      if (rec > 0 && ((neto - rec) <= 2.00 || (tot - rec) <= 2.00)) {
        estado = (retDetMonto > 0 && !pagoImpuestos) ? 'Neto Cobrado' : 'Pagado';
      } else if (rec > 0) {
        estado = 'Pagado Parcial';
      } else {
        estado = 'Pendiente';
      }
    }

    const result = await prisma.facturaCliente.create({
      data: {
        ...cleanData,
        estado,
        diasPago: Number(cleanData.diasPago) || 30,
        montoSinIgv: Number(cleanData.montoSinIgv) || 0,
        igv: Number(cleanData.igv) || 0,
        montoConIgv: tot,
        importeRecibido: rec,
        porcentajeFacturacion: cleanData.porcentajeFacturacion !== undefined ? Number(cleanData.porcentajeFacturacion) : 100,
      }
    });
    res.json(result);
  } catch (err: any) {
    console.error('Error creando factura cliente:', err);
    res.status(500).json({ error: err.message });
  }
});
app.put('/api/facturas-cliente/:id', authenticateToken, async (req, res) => {
  try {
    const { id, createdAt, updatedAt, proyecto, cliente, ...cleanData } = req.body;
    if (cleanData.diasPago !== undefined) cleanData.diasPago = Number(cleanData.diasPago) || 30;
    if (cleanData.montoSinIgv !== undefined) cleanData.montoSinIgv = Number(cleanData.montoSinIgv) || 0;
    if (cleanData.igv !== undefined) cleanData.igv = Number(cleanData.igv) || 0;
    if (cleanData.montoConIgv !== undefined) cleanData.montoConIgv = Number(cleanData.montoConIgv) || 0;
    if (cleanData.importeRecibido !== undefined) cleanData.importeRecibido = Number(cleanData.importeRecibido) || 0;
    if (cleanData.porcentajeFacturacion !== undefined) cleanData.porcentajeFacturacion = Number(cleanData.porcentajeFacturacion);

    if (cleanData.importeRecibido !== undefined || cleanData.montoConIgv !== undefined) {
      const existing = await prisma.facturaCliente.findUnique({ where: { id: req.params.id } });
      const rec = cleanData.importeRecibido !== undefined ? Number(cleanData.importeRecibido) : (existing?.importeRecibido || 0);
      const tot = cleanData.montoConIgv !== undefined ? Number(cleanData.montoConIgv) : (existing?.montoConIgv || 0);
      const aplicaDet = cleanData.aplicaDetraccion !== undefined ? cleanData.aplicaDetraccion : existing?.aplicaDetraccion;
      const aplicaRet = cleanData.aplicaRetencion !== undefined ? cleanData.aplicaRetencion : existing?.aplicaRetencion;
      const retDetMonto = aplicaDet ? Number((tot * 0.12).toFixed(2)) : (aplicaRet ? Number((tot * 0.03).toFixed(2)) : 0);
      const neto = Number((tot - retDetMonto).toFixed(2));
      const pagoImpuestos = cleanData.pagoImpuestos !== undefined ? cleanData.pagoImpuestos : existing?.pagoImpuestos;

      if (!cleanData.estado) {
        if (rec > 0 && ((neto - rec) <= 2.00 || (tot - rec) <= 2.00)) {
          cleanData.estado = (retDetMonto > 0 && !pagoImpuestos) ? 'Neto Cobrado' : 'Pagado';
        } else if (rec > 0) {
          cleanData.estado = 'Pagado Parcial';
        } else {
          cleanData.estado = 'Pendiente';
        }
      }
    }

    const result = await prisma.facturaCliente.update({
      where: { id: req.params.id },
      data: cleanData
    });
    res.json(result);
  } catch (err: any) {
    console.error('Error actualizando factura cliente:', err);
    res.status(500).json({ error: err.message });
  }
});
app.delete('/api/facturas-cliente/:id', authenticateToken, async (req, res) => {
  try {
    await prisma.facturaCliente.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- GANTTS (CRONOGRAMAS) ---
function sortGanttTasks(gantt: any) {
  if (!gantt || !Array.isArray(gantt.tasks)) return gantt;
  let taskOrder: string[] = [];
  try {
    if (gantt.settings) {
      const s = typeof gantt.settings === 'string' ? JSON.parse(gantt.settings) : gantt.settings;
      if (Array.isArray(s.taskOrder)) taskOrder = s.taskOrder;
    }
  } catch {}

  gantt.tasks.sort((a: any, b: any) => {
    if (taskOrder.length > 0) {
      const iA = taskOrder.indexOf(a.id);
      const iB = taskOrder.indexOf(b.id);
      if (iA !== -1 && iB !== -1) return iA - iB;
      if (iA !== -1) return -1;
      if (iB !== -1) return 1;
    }
    const depA = parseInt(a.dependencies, 10);
    const depB = parseInt(b.dependencies, 10);
    if (!isNaN(depA) && !isNaN(depB)) return depA - depB;
    if (!isNaN(depA)) return -1;
    if (!isNaN(depB)) return 1;
    return 0;
  });
  return gantt;
}

app.get('/api/gantts', authenticateToken, async (req, res) => {
  try {
    const gantts = await prisma.projectGantt.findMany({
      include: {
        tasks: {
          orderBy: { dependencies: 'asc' }
        },
        proyecto: {
          include: { cliente: true }
        }
      },
      orderBy: { version: 'asc' }
    });
    res.json(gantts.map(sortGanttTasks));
  } catch (error: any) {
    console.error('Error fetching gantts:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/gantts/shared/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const gantt = await prisma.projectGantt.findUnique({
      where: { shareToken: token },
      include: {
        tasks: { orderBy: { dependencies: 'asc' } },
        proyecto: { include: { cliente: true } }
      }
    });
    if (!gantt) return res.status(404).json({ error: 'Gantt no encontrado' });
    res.json(sortGanttTasks(gantt));
  } catch (error: any) {
    console.error('Error fetching shared gantt:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/gantts', authenticateToken, async (req, res) => {
  try {
    const { id, projectId, version, status, name, shareToken, settings, tasks } = req.body;
    const cleanId = id && !id.startsWith('temp-') ? id : crypto.randomUUID();
    const token = shareToken || crypto.randomUUID().replace(/-/g, '');

    const taskList = (Array.isArray(tasks) ? tasks : []).map((t: any, index: number) => ({
      id: t.id && !t.id.startsWith('task-') ? t.id : crypto.randomUUID(),
      name: t.name || 'Nueva Tarea',
      startDate: t.startDate ? (t.startDate.includes('T') ? t.startDate.split('T')[0] : t.startDate) : new Date().toISOString().split('T')[0],
      endDate: t.endDate ? (t.endDate.includes('T') ? t.endDate.split('T')[0] : t.endDate) : new Date().toISOString().split('T')[0],
      progress: Number(t.progress) || 0,
      dependencies: t.dependencies && t.dependencies.trim() !== '' ? t.dependencies : String(index).padStart(5, '0'),
      type: t.type || 'task',
      assignee: t.assignee || '',
      color: t.color || '#662D91'
    }));

    const dataObj = {
      projectId,
      version: Number(version) || 1,
      status: status || 'Borrador',
      name: name || `Cronograma V${version || 1}`,
      shareToken: token,
      settings: typeof settings === 'string' ? settings : JSON.stringify(settings || {})
    };

    const saved = await prisma.projectGantt.upsert({
      where: { id: cleanId },
      update: {
        ...dataObj,
        tasks: {
          deleteMany: {},
          create: taskList
        }
      },
      create: {
        id: cleanId,
        ...dataObj,
        tasks: { create: taskList }
      },
      include: {
        tasks: { orderBy: { dependencies: 'asc' } },
        proyecto: { include: { cliente: true } }
      }
    });
    res.json(sortGanttTasks(saved));
  } catch (error: any) {
    console.error('Error saving gantt:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/gantts/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { version, status, name, shareToken, settings, tasks } = req.body;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.projectGantt.update({
        where: { id },
        data: {
          version: version !== undefined ? Number(version) : undefined,
          status: status !== undefined ? status : undefined,
          name: name !== undefined ? name : undefined,
          shareToken: shareToken !== undefined ? shareToken : undefined,
          settings: settings !== undefined ? (typeof settings === 'string' ? settings : JSON.stringify(settings)) : undefined,
        }
      });

      if (Array.isArray(tasks)) {
        await tx.ganttTask.deleteMany({ where: { ganttId: id } });
        if (tasks.length > 0) {
          await tx.ganttTask.createMany({
            data: tasks.map((t: any, index: number) => ({
              id: t.id && !t.id.startsWith('task-') ? t.id : crypto.randomUUID(),
              ganttId: id,
              name: t.name || 'Nueva Tarea',
              startDate: t.startDate ? (t.startDate.includes('T') ? t.startDate.split('T')[0] : t.startDate) : new Date().toISOString().split('T')[0],
              endDate: t.endDate ? (t.endDate.includes('T') ? t.endDate.split('T')[0] : t.endDate) : new Date().toISOString().split('T')[0],
              progress: Number(t.progress) || 0,
              dependencies: t.dependencies && t.dependencies.trim() !== '' ? t.dependencies : String(index).padStart(5, '0'),
              type: t.type || 'task',
              assignee: t.assignee || '',
              color: t.color || '#662D91'
            }))
          });
        }
      }

      return await tx.projectGantt.findUnique({
        where: { id },
        include: {
          tasks: { orderBy: { dependencies: 'asc' } },
          proyecto: { include: { cliente: true } }
        }
      });
    });

    res.json(sortGanttTasks(updated));
  } catch (error: any) {
    console.error('Error updating gantt:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/gantts/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.ganttTask.deleteMany({ where: { ganttId: id } });
    await prisma.projectGantt.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting gantt:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/proveedores', authenticateToken, async (req, res) => {
  try {
    const proveedores = await prisma.proveedor.findMany({
      include: { cuentas: true },
      orderBy: { razonSocial: 'asc' }
    });
    res.json(proveedores);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/proveedores', authenticateToken, async (req, res) => {
  try {
    const { cuentas, ordenes, pagos, id, ...data } = req.body;
    if (data.documentos && typeof data.documentos === 'object') {
      data.documentos = JSON.stringify(data.documentos);
    }
    if (data.categorias !== undefined && typeof data.categorias === 'object') {
      data.categorias = JSON.stringify(data.categorias);
    }
    if (data.subcategorias !== undefined && typeof data.subcategorias === 'object') {
      data.subcategorias = JSON.stringify(data.subcategorias);
    }
    if (data.tags !== undefined && typeof data.tags === 'object') {
      data.tags = JSON.stringify(data.tags);
    }
    if (!data.categoria && data.categorias) {
      try {
        const parsed = JSON.parse(data.categorias);
        if (Array.isArray(parsed) && parsed.length > 0) data.categoria = parsed[0];
      } catch (e) { }
    }
    if (data.esConfiable !== undefined) {
      data.esConfiable = Boolean(data.esConfiable);
    }

    // Create/Ensure Google Drive folder
    try {
      const userEmail = resolveUserEmail(req);
      const folderRes = await getOrCreateProviderDriveFolder({
        providerName: data.razonSocial || data.nombre || 'Proveedor',
        userEmail
      });
      data.driveFolderId = folderRes.folderId;
      data.driveFolderUrl = folderRes.webViewLink;
    } catch (err: any) {
      console.warn("No se pudo crear/vincular la carpeta en Google Drive para el proveedor:", err.message);
    }

    const created = await prisma.proveedor.create({
      data: {
        ...data,
        cuentas: { create: cuentas || [] }
      },
      include: { cuentas: true }
    });
    res.json(created);
  } catch (e: any) {
    console.error("Error creating proveedor:", e);
    res.status(500).json({ error: e.message || e });
  }
});

app.put('/api/proveedores/:id', authenticateToken, async (req, res) => {
  try {
    const { cuentas, ordenes, pagos, id, createdAt, updatedAt, ...data } = req.body;
    if (data.documentos && typeof data.documentos === 'object') {
      data.documentos = JSON.stringify(data.documentos);
    }
    if (data.categorias !== undefined && typeof data.categorias === 'object') {
      data.categorias = JSON.stringify(data.categorias);
    }
    if (data.subcategorias !== undefined && typeof data.subcategorias === 'object') {
      data.subcategorias = JSON.stringify(data.subcategorias);
    }
    if (data.tags !== undefined && typeof data.tags === 'object') {
      data.tags = JSON.stringify(data.tags);
    }
    if (!data.categoria && data.categorias) {
      try {
        const parsed = JSON.parse(data.categorias);
        if (Array.isArray(parsed) && parsed.length > 0) data.categoria = parsed[0];
      } catch (e) { }
    }
    if (data.esConfiable !== undefined) {
      data.esConfiable = Boolean(data.esConfiable);
    }
    const cuentasClean = (cuentas || []).map((c: any) => {
      const { id: cId, proveedorId, ...rest } = c;
      return rest;
    });

    // Ensure Google Drive folder if missing
    if (!data.driveFolderId) {
      try {
        const userEmail = resolveUserEmail(req);
        const folderRes = await getOrCreateProviderDriveFolder({
          providerName: data.razonSocial || data.nombre || 'Proveedor',
          userEmail
        });
        data.driveFolderId = folderRes.folderId;
        data.driveFolderUrl = folderRes.webViewLink;
      } catch (err: any) {
        console.warn("No se pudo crear/vincular la carpeta en Google Drive para el proveedor:", err.message);
      }
    }

    await prisma.cuentaBancaria.deleteMany({ where: { proveedorId: req.params.id } });
    const updated = await prisma.proveedor.update({
      where: { id: req.params.id },
      data: {
        ...data,
        cuentas: { create: cuentasClean }
      },
      include: { cuentas: true }
    });
    res.json(updated);
  } catch (e: any) {
    console.error("Error updating proveedor:", e);
    res.status(500).json({ error: e.message || e });
  }
});

app.delete('/api/proveedores/:id', authenticateToken, async (req, res) => {
  try {
    res.json(await prisma.proveedor.delete({ where: { id: req.params.id } }));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Renombrar categoría, subcategoría o tag globalmente y actualizar todos los proveedores vinculados
app.post('/api/proveedores/bulk-rename', authenticateToken, async (req, res) => {
  try {
    const { type, oldName, newName } = req.body;
    if (!oldName || !newName || !type) {
      return res.status(400).json({ error: 'Faltan parámetros: type, oldName, newName' });
    }

    const trimmedOld = String(oldName).trim();
    const trimmedNew = String(newName).trim();
    if (trimmedOld.toLowerCase() === trimmedNew.toLowerCase()) {
      return res.json({ updatedCount: 0, message: 'Nombres idénticos' });
    }

    // 1. Actualizar en registros de Proveedores
    const allProviders = await prisma.proveedor.findMany();
    let updatedCount = 0;

    for (const p of allProviders) {
      let changed = false;
      let newCategoria = p.categoria;
      let newCategorias = p.categorias;
      let newSubcategorias = p.subcategorias;
      let newTags = p.tags;

      if (type === 'categoria') {
        if (p.categoria && p.categoria.trim().toLowerCase() === trimmedOld.toLowerCase()) {
          newCategoria = trimmedNew;
          changed = true;
        }
        if (p.categorias) {
          try {
            const list = JSON.parse(p.categorias);
            if (Array.isArray(list) && list.some((c: string) => c.trim().toLowerCase() === trimmedOld.toLowerCase())) {
              const updatedList = list.map((c: string) => c.trim().toLowerCase() === trimmedOld.toLowerCase() ? trimmedNew : c);
              newCategorias = JSON.stringify(updatedList);
              changed = true;
            }
          } catch (e) { }
        }
      } else if (type === 'subcategoria') {
        if (p.subcategorias) {
          try {
            const list = JSON.parse(p.subcategorias);
            if (Array.isArray(list) && list.some((s: string) => s.trim().toLowerCase() === trimmedOld.toLowerCase())) {
              const updatedList = list.map((s: string) => s.trim().toLowerCase() === trimmedOld.toLowerCase() ? trimmedNew : s);
              newSubcategorias = JSON.stringify(updatedList);
              changed = true;
            }
          } catch (e) { }
        }
      } else if (type === 'tag') {
        if (p.tags) {
          try {
            const list = JSON.parse(p.tags);
            if (Array.isArray(list) && list.some((t: string) => t.trim().toLowerCase() === trimmedOld.toLowerCase())) {
              const updatedList = list.map((t: string) => t.trim().toLowerCase() === trimmedOld.toLowerCase() ? trimmedNew : t);
              newTags = JSON.stringify(updatedList);
              changed = true;
            }
          } catch (e) { }
        }
      }

      if (changed) {
        await prisma.proveedor.update({
          where: { id: p.id },
          data: {
            categoria: newCategoria,
            categorias: newCategorias,
            subcategorias: newSubcategorias,
            tags: newTags
          }
        });
        updatedCount++;
      }
    }

    // 2. Actualizar en AppConfig listasDinamicas
    const cfg = await prisma.appConfig.findFirst();
    if (cfg && cfg.listasDinamicas) {
      try {
        const listas = typeof cfg.listasDinamicas === 'string' ? JSON.parse(cfg.listasDinamicas) : cfg.listasDinamicas;
        const listKey = type === 'categoria' ? 'categoriasProveedor' : type === 'subcategoria' ? 'subcategoriasProveedor' : 'tagsProveedor';
        if (Array.isArray(listas[listKey])) {
          listas[listKey] = listas[listKey].map((item: string) => item.trim().toLowerCase() === trimmedOld.toLowerCase() ? trimmedNew : item);
          await prisma.appConfig.update({
            where: { id: cfg.id },
            data: { listasDinamicas: JSON.stringify(listas) }
          });
        }
      } catch (e) { }
    }

    res.json({ success: true, updatedCount });
  } catch (err: any) {
    console.error('Error in bulk-rename:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/proveedores/:id/ensure-folder', authenticateToken, async (req, res) => {
  try {
    const prov = await prisma.proveedor.findUnique({ where: { id: req.params.id } });
    if (!prov) return res.status(404).json({ error: 'Proveedor no encontrado' });

    if (prov.driveFolderId && prov.driveFolderUrl) {
      return res.json({ driveFolderId: prov.driveFolderId, driveFolderUrl: prov.driveFolderUrl });
    }

    const userEmail = resolveUserEmail(req);
    const folderRes = await getOrCreateProviderDriveFolder({
      providerName: prov.razonSocial || prov.nombre || 'Proveedor',
      userEmail
    });

    const updated = await prisma.proveedor.update({
      where: { id: prov.id },
      data: {
        driveFolderId: folderRes.folderId,
        driveFolderUrl: folderRes.webViewLink
      }
    });

    res.json({ driveFolderId: updated.driveFolderId, driveFolderUrl: updated.driveFolderUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Descargar plantilla oficial de proveedores en Excel
app.get('/api/proveedores/plantilla-excel', authenticateToken, async (req, res) => {
  try {
    const templateCandidates = [
      path.join(__dirname, '..', '..', 'Plantilla_Carga_Proveedores_SIG_Purple.xlsx'),
      path.join(__dirname, '..', '..', 'public', 'Plantilla_Carga_Proveedores_SIG_Purple.xlsx'),
      path.join(__dirname, '..', 'public', 'Plantilla_Carga_Proveedores_SIG_Purple.xlsx'),
      path.join(process.cwd(), 'Plantilla_Carga_Proveedores_SIG_Purple.xlsx'),
      path.join(process.cwd(), 'public', 'Plantilla_Carga_Proveedores_SIG_Purple.xlsx')
    ];

    let foundPath: string | null = null;
    for (const p of templateCandidates) {
      if (fs.existsSync(p)) {
        foundPath = p;
        break;
      }
    }

    if (foundPath) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="Plantilla_Carga_Proveedores_SIG_Purple.xlsx"');
      return res.sendFile(path.resolve(foundPath));
    }

    // Si no está en disco, generar y responder directamente
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Plantilla Proveedores');
    ws.columns = [
      { header: 'Razón Social *', key: 'razonSocial', width: 34 },
      { header: 'RUC', key: 'ruc', width: 16 },
      { header: 'Contacto', key: 'nombre', width: 24 },
      { header: 'Teléfono', key: 'telefono', width: 18 },
      { header: 'Email', key: 'correo', width: 30 },
      { header: 'Categoría Principal *', key: 'categoria', width: 24 },
      { header: 'Otras Categorías', key: 'categorias', width: 28 },
      { header: 'Subcategorías', key: 'subcategorias', width: 32 },
      { header: 'Tags / Palabras Clave', key: 'tags', width: 26 },
      { header: 'Ciudad', key: 'ciudad', width: 14 },
      { header: 'Dirección', key: 'direccion', width: 32 },
      { header: 'Web / Redes', key: 'web', width: 28 },
      { header: 'Tipo Proveedor', key: 'tipoProveedor', width: 16 },
      { header: 'Tipo Documento', key: 'tipoDocumento', width: 16 },
      { header: 'Banco', key: 'banco', width: 15 },
      { header: 'Número de Cuenta', key: 'numeroCuenta', width: 24 },
      { header: 'CCI Interbancario', key: 'cci', width: 26 },
      { header: 'Tipo de Cuenta', key: 'tipoCuenta', width: 18 }
    ];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Plantilla_Carga_Proveedores_SIG_Purple.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error("Error al descargar plantilla de proveedores:", err);
    res.status(500).json({ error: err.message });
  }
});

// Importar proveedores desde Excel subido
app.post('/api/proveedores/import-excel', authenticateToken, upload.single('file'), async (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo Excel' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);
    const ws = wb.getWorksheet(1);
    if (!ws) return res.status(400).json({ error: 'No se encontró la hoja de cálculo en el archivo' });

    // Detectar fila de encabezados dinámicamente (revisar filas 1 a 6)
    let headerRowIdx = 1;
    for (let r = 1; r <= Math.min(6, ws.rowCount); r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= ws.columnCount; c++) {
        const val = String(row.getCell(c).value || '').trim().toLowerCase();
        if (val.includes('razón social') || val.includes('razon social') || val === 'proveedor') {
          headerRowIdx = r;
          break;
        }
      }
      if (headerRowIdx > 1) break;
    }
    const headerRow = ws.getRow(headerRowIdx);

    const colMap: Record<string, number> = {};
    for (let c = 1; c <= ws.columnCount; c++) {
      const val = String(headerRow.getCell(c).value || '').trim().toLowerCase();
      if (val.includes('razón social') || val.includes('razon social') || val === 'proveedor') colMap.razonSocial = c;
      else if (val === 'id') colMap.id = c;
      else if (val.includes('ruc')) colMap.ruc = c;
      else if (val.includes('contacto') || val.includes('nombre')) colMap.nombre = c;
      else if (val.includes('teléfono') || val.includes('telefono') || val.includes('celular')) colMap.telefono = c;
      else if (val.includes('email') || val.includes('correo')) colMap.correo = c;
      else if (val.includes('todas las categorías') || val.includes('todas las categorias') || val.includes('otras categor') || val === 'categorias') colMap.categorias = c;
      else if (val.includes('subcategor')) colMap.subcategorias = c;
      else if (val.includes('tag') || val.includes('etiqueta') || val.includes('clave')) colMap.tags = c;
      else if (val.includes('categoría principal') || val.includes('categoria principal') || val.includes('categoría') || val.includes('categoria')) colMap.categoria = c;
      else if (val.includes('ciudad')) colMap.ciudad = c;
      else if (val.includes('direcci')) colMap.direccion = c;
      else if (val.includes('web') || val.includes('redes')) colMap.web = c;
      else if (val.includes('tipo prov') || val.includes('tipo de prov')) colMap.tipoProveedor = c;
      else if (val.includes('tipo doc') || val.includes('comprobante')) colMap.tipoDocumento = c;
      else if (val.includes('banco')) colMap.banco = c;
      else if (val.includes('número de cuenta') || val.includes('numero de cuenta') || val === 'cuenta') colMap.numeroCuenta = c;
      else if (val.includes('cci')) colMap.cci = c;
      else if (val.includes('tipo de cuenta') || val.includes('tipo cuenta')) colMap.tipoCuenta = c;
      else if (val.includes('cuentas')) colMap.cuentas = c;
    }

    const getCellStr = (row: any, colIdx?: number): string => {
      if (!colIdx) return '';
      const cellVal = row.getCell(colIdx).value;
      if (cellVal === null || cellVal === undefined) return '';
      if (typeof cellVal === 'object' && 'text' in cellVal) return String((cellVal as any).text || '').trim();
      return String(cellVal).trim();
    };

    const parseListFromStr = (str: string): string[] => {
      if (!str || str === '-') return [];
      return str.split(/[,|;]/).map(s => s.trim().replace(/^#/, '')).filter(Boolean);
    };

    let total = 0, imported = 0, updated = 0;
    for (let r = headerRowIdx + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const razonSocial = colMap.razonSocial ? getCellStr(row, colMap.razonSocial) : getCellStr(row, 1);
      if (!razonSocial || razonSocial.toLowerCase() === 'razón social' || razonSocial.toLowerCase() === 'proveedor') continue;
      total++;

      const ruc = colMap.ruc ? getCellStr(row, colMap.ruc) : '';
      const nombre = colMap.nombre ? getCellStr(row, colMap.nombre) : razonSocial;
      const telefono = colMap.telefono ? getCellStr(row, colMap.telefono) : '';
      let correo = colMap.correo ? getCellStr(row, colMap.correo) : '';
      if (correo === '-' || correo.toLowerCase().includes('notiene')) correo = '';

      const categoriaDirect = colMap.categoria ? getCellStr(row, colMap.categoria) : '';
      const categoriasStr = colMap.categorias ? getCellStr(row, colMap.categorias) : '';
      const subcategoriasStr = colMap.subcategorias ? getCellStr(row, colMap.subcategorias) : '';
      const tagsStr = colMap.tags ? getCellStr(row, colMap.tags) : '';

      const categoriasList = parseListFromStr(categoriasStr);
      if (categoriasList.length === 0 && categoriaDirect && categoriaDirect !== '-') {
        categoriasList.push(categoriaDirect);
      }
      const subcategoriasList = parseListFromStr(subcategoriasStr);
      const tagsList = parseListFromStr(tagsStr);

      const mainCategory = categoriasList[0] || (categoriaDirect && categoriaDirect !== '-' ? categoriaDirect : 'General');
      const ciudad = colMap.ciudad ? (getCellStr(row, colMap.ciudad) || 'Lima') : 'Lima';
      const web = colMap.web ? getCellStr(row, colMap.web) : '';
      const direccion = colMap.direccion ? getCellStr(row, colMap.direccion) : '';
      const tipoProveedor = colMap.tipoProveedor ? (getCellStr(row, colMap.tipoProveedor) || 'Trabajado') : 'Trabajado';
      const tipoDocumento = colMap.tipoDocumento ? (getCellStr(row, colMap.tipoDocumento) || 'Factura') : 'Factura';

      const banco = colMap.banco ? getCellStr(row, colMap.banco) : '';
      const numeroCuenta = colMap.numeroCuenta ? getCellStr(row, colMap.numeroCuenta) : '';
      const cci = colMap.cci ? getCellStr(row, colMap.cci) : '';
      const tipoCuenta = colMap.tipoCuenta ? getCellStr(row, colMap.tipoCuenta) : 'Corriente Soles';

      const existing = await prisma.proveedor.findFirst({
        where: { razonSocial: { equals: razonSocial, mode: 'insensitive' } },
        include: { cuentas: true }
      });

      let targetProveedorId: string;

      if (existing) {
        targetProveedorId = existing.id;
        await prisma.proveedor.update({
          where: { id: existing.id },
          data: {
            categoria: (mainCategory && mainCategory !== 'General') ? mainCategory : (existing.categoria || 'General'),
            ...(categoriasList.length > 0 ? { categorias: JSON.stringify(categoriasList) } : {}),
            ...(subcategoriasList.length > 0 ? { subcategorias: JSON.stringify(subcategoriasList) } : {}),
            ...(tagsList.length > 0 ? { tags: JSON.stringify(tagsList) } : {}),
            ...(telefono && telefono !== '-' ? { telefono } : {}),
            ...(correo && correo !== '-' ? { correo } : {}),
            ...(ruc && ruc !== '-' ? { ruc } : {}),
            ...(web && web !== '-' ? { web } : {}),
            ...(direccion && direccion !== '-' ? { direccion } : {}),
            ...(tipoProveedor && tipoProveedor !== '-' ? { tipoProveedor } : {}),
            ...(tipoDocumento && tipoDocumento !== '-' ? { tipoDocumento } : {})
          }
        });
        updated++;
      } else {
        const createdPrv = await prisma.proveedor.create({
          data: {
            razonSocial,
            nombre,
            ruc: ruc === '-' ? '' : ruc,
            correo,
            telefono,
            tipoDocumento,
            categoria: mainCategory,
            categorias: JSON.stringify(categoriasList.length > 0 ? categoriasList : [mainCategory]),
            subcategorias: JSON.stringify(subcategoriasList),
            tags: JSON.stringify(tagsList),
            ciudad: ciudad === '-' ? 'Lima' : ciudad,
            direccion: direccion === '-' ? '' : direccion,
            tipoProveedor: tipoProveedor === '-' ? 'Trabajado' : tipoProveedor,
            esConfiable: true,
            motivoNoConfiable: null,
            web: web === '-' ? '' : web,
            documentos: '[]',
            servicios: mainCategory
          }
        });
        targetProveedorId = createdPrv.id;
        imported++;
      }

      // Procesar Cuentas Bancarias si vienen en el Excel
      if (banco || numeroCuenta || cci) {
        try {
          const existsCuenta = await prisma.cuentaBancaria.findFirst({
            where: {
              proveedorId: targetProveedorId,
              ...(numeroCuenta ? { numeroCuenta } : { banco })
            }
          });
          if (!existsCuenta) {
            await prisma.cuentaBancaria.create({
              data: {
                proveedorId: targetProveedorId,
                banco: banco || 'Banco',
                numeroCuenta: numeroCuenta || '-',
                cci: cci || '-',
                tipoCuenta: tipoCuenta || 'Corriente Soles'
              }
            });
          }
        } catch (eBank) {
          console.warn('Advertencia al registrar cuenta bancaria para proveedor:', razonSocial, eBank);
        }
      }
    }
    res.json({ success: true, total, imported, updated });
  } catch (err: any) {
    console.error("Error importando Excel:", err);
    res.status(500).json({ error: err.message });
  }
});

// Exportar proveedores a Excel
app.get('/api/proveedores/export-excel', authenticateToken, async (req, res) => {
  try {
    const proveedores = await prisma.proveedor.findMany({
      include: { cuentas: true },
      orderBy: { razonSocial: 'asc' }
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Proveedores');

    ws.columns = [
      { header: 'ID', key: 'id', width: 20 },
      { header: 'Razón Social', key: 'razonSocial', width: 32 },
      { header: 'RUC', key: 'ruc', width: 16 },
      { header: 'Contacto', key: 'nombre', width: 25 },
      { header: 'Categoría Principal', key: 'categoria', width: 22 },
      { header: 'Todas las Categorías', key: 'categorias', width: 28 },
      { header: 'Subcategorías', key: 'subcategorias', width: 28 },
      { header: 'Tags / Etiquetas', key: 'tags', width: 25 },
      { header: 'Ciudad', key: 'ciudad', width: 15 },
      { header: 'Web', key: 'web', width: 30 },
      { header: 'Tipo', key: 'tipoProveedor', width: 15 },
      { header: 'Confiable', key: 'esConfiable', width: 12 },
      { header: 'Motivo No Confiable', key: 'motivoNoConfiable', width: 30 },
      { header: 'Teléfono', key: 'telefono', width: 18 },
      { header: 'Email', key: 'correo', width: 30 },
      { header: 'Tipo Doc', key: 'tipoDocumento', width: 15 },
      { header: 'Cuentas Bancarias', key: 'cuentas', width: 45 }
    ];

    // Estilo encabezado
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8A2BE2' } };

    for (const p of proveedores) {
      const cuentasStr = (p.cuentas || []).map(c => `${c.banco}: ${c.numeroCuenta} (CCI: ${c.cci || '-'})`).join(' | ');

      const parseJsonList = (val: any) => {
        if (!val) return '';
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) return parsed.join(', ');
        } catch (e) { }
        return String(val);
      };

      ws.addRow({
        id: p.id,
        razonSocial: p.razonSocial,
        ruc: p.ruc || '-',
        nombre: p.nombre || '-',
        categoria: p.categoria || '-',
        categorias: parseJsonList(p.categorias) || p.categoria || '-',
        subcategorias: parseJsonList(p.subcategorias) || '-',
        tags: parseJsonList(p.tags) || '-',
        ciudad: p.ciudad || 'Lima',
        web: p.web || '-',
        tipoProveedor: p.tipoProveedor || 'Trabajado',
        esConfiable: p.esConfiable ? 'Sí' : 'No',
        motivoNoConfiable: p.motivoNoConfiable || '-',
        telefono: p.telefono || '-',
        correo: p.correo || '-',
        tipoDocumento: p.tipoDocumento || 'Factura',
        cuentas: cuentasStr || '-'
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Proveedores_SIG_Purple.xlsx');
    await wb.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error("Error exportando proveedores a Excel:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- COTIZACIONES (QUOTES) ---
let cachedCatalogItems: any[] | null = null;
app.get('/api/quotes/catalog-items', optionalAuthenticateToken, async (req, res) => {
  try {
    if (!cachedCatalogItems) {
      const candidatePaths = [
        path.join(__dirname, 'data', 'items_catalog_dedup.json'),
        path.join(process.cwd(), 'src', 'data', 'items_catalog_dedup.json'),
        path.join(process.cwd(), 'server', 'src', 'data', 'items_catalog_dedup.json')
      ];
      const foundPath = candidatePaths.find(p => fs.existsSync(p));
      if (foundPath) {
        cachedCatalogItems = JSON.parse(fs.readFileSync(foundPath, 'utf8'));
      } else {
        cachedCatalogItems = [];
      }
    }
    res.json(cachedCatalogItems || []);
  } catch (err: any) {
    console.error('Error al servir catálogo de ítems:', err);
    res.status(500).json({ error: 'No se pudo cargar el catálogo de ítems' });
  }
});

app.get('/api/quotes', authenticateToken, async (req, res) => {
  try {
    const quotes = await (prisma.quote as any).findMany({
      include: { categories: { include: { items: { include: { subItems: true } } } } }
    });
    res.json(quotes || []);
  } catch (e) { res.json(await prisma.quote.findMany()); }
});

app.post('/api/quotes', authenticateToken, async (req: any, res: any) => {
  try {
    const { categories, ...quoteData } = req.body;
    const cleanData = {
      projectId: quoteData.projectId || null,
      version: Number(quoteData.version) || 1,
      isTemplate: Boolean(quoteData.isTemplate),
      templateName: quoteData.templateName || null,
      status: quoteData.status || 'En Creación',
      client: quoteData.client || '',
      brand: quoteData.brand || '',
      requirement: quoteData.requirement || '',
      date: quoteData.date || '',
      businessName: quoteData.businessName || '',
      ruc: quoteData.ruc || '',
      paymentConditions: quoteData.paymentConditions || '',
      currency: quoteData.currency || 'PEN',
      exchangeRate: quoteData.exchangeRate !== undefined ? Number(quoteData.exchangeRate) : 1.0,
      includeIgv: Boolean(quoteData.includeIgv)
    };
    const normalizedCategories = normalizeQuoteCategoriesForPersistence(categories || [], true);
    const result = await prisma.quote.create({
      data: {
        ...cleanData,
        categories: {
          create: normalizedCategories.map((cat: any) => ({
            id: cat.id,
            name: cat.name,
            items: {
              create: (cat.items || []).map((item: any) => ({
                id: item.id,
                name: item.name || '', quantity: Math.round(parseFloat(String(item.quantity).replace(',', '.'))) || 0, dates: Math.round(parseFloat(String(item.dates).replace(',', '.'))) || 0,
                details: typeof item.details === 'string' ? item.details : JSON.stringify(item.details || []),
                internalMultiplierPercent: Number(item.internalMultiplierPercent) || 0,
                financialExpensePercent: Number(item.financialExpensePercent) || 0,
                isSpecial: Boolean(item.isSpecial),
                specialRatePercent: item.specialRatePercent !== undefined && item.specialRatePercent !== null ? Number(item.specialRatePercent) : null,
                specialSourceItemIds: JSON.stringify(item.specialSourceItemIds || []),
                providerContact: item.providerContact || '',
                productionTime: item.productionTime || '',
                subItems: {
                  create: (item.subItems || []).map((s: any) => ({
                    name: s.name || '', description: s.description || '', quantity: Math.round(parseFloat(String(s.quantity).replace(',', '.'))) || 0, dates: Math.round(parseFloat(String(s.dates).replace(',', '.'))) || 0, unitCost: parseFloat(String(s.unitCost).replace(',', '.')) || 0, providerName: s.providerName || '', providerId: s.providerId || null
                  }))
                }
              }))
            }
          }))
        }
      },
      include: {
        categories: {
          include: {
            items: {
              include: { subItems: true }
            }
          }
        }
      }
    });

    if (cleanData.projectId) {
      await syncProjectSubtotalFromQuotes(cleanData.projectId);
    }

    // Record History
    await prisma.quoteHistory.create({
      data: {
        quoteId: result.id,
        userName: req.user.email,
        action: 'Creación',
        details: `Cotización creada con estado: ${cleanData.status}`
      }
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- GESTIÓN DE BLOQUEO SUAVE Y PRESENCIA EN COTIZACIONES ---
interface QuoteLock {
  quoteId: string;
  userId: string;
  userEmail: string;
  userRole: string;
  lockedAt: number;
  lastHeartbeat: number;
}

const quoteLocks = new Map<string, QuoteLock>();
const QUOTE_LOCK_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutos sin heartbeat

function cleanExpiredQuoteLocks() {
  const now = Date.now();
  for (const [quoteId, lock] of quoteLocks.entries()) {
    if (now - lock.lastHeartbeat > QUOTE_LOCK_TIMEOUT_MS) {
      quoteLocks.delete(quoteId);
    }
  }
}

// Limpiar periódicamente cada minuto
setInterval(cleanExpiredQuoteLocks, 60 * 1000);

// 1. Obtener todos los candados activos
app.get('/api/quotes/locks', authenticateToken, (req: any, res: any) => {
  cleanExpiredQuoteLocks();
  const locksObj: Record<string, any> = {};
  for (const [quoteId, lock] of quoteLocks.entries()) {
    locksObj[quoteId] = {
      quoteId: lock.quoteId,
      userEmail: lock.userEmail,
      userRole: lock.userRole,
      lockedAt: lock.lockedAt,
      lastHeartbeat: lock.lastHeartbeat,
      isSelf: lock.userId === req.user.id
    };
  }
  res.json(locksObj);
});

// 2. Adquirir o verificar candado
app.post('/api/quotes/:id/lock', authenticateToken, (req: any, res: any) => {
  cleanExpiredQuoteLocks();
  const quoteId = req.params.id;
  const now = Date.now();
  const existing = quoteLocks.get(quoteId);

  if (existing && existing.userId !== req.user.id && (now - existing.lastHeartbeat <= QUOTE_LOCK_TIMEOUT_MS)) {
    // Bloqueada por otro usuario
    return res.json({
      locked: true,
      isSelf: false,
      currentEditor: {
        userEmail: existing.userEmail,
        userRole: existing.userRole,
        lockedAt: existing.lockedAt,
        lastHeartbeat: existing.lastHeartbeat
      }
    });
  }

  // Asignar o renovar candado para el usuario actual
  const lock: QuoteLock = {
    quoteId,
    userId: req.user.id,
    userEmail: req.user.email,
    userRole: req.user.role || 'Usuario',
    lockedAt: existing && existing.userId === req.user.id ? existing.lockedAt : now,
    lastHeartbeat: now
  };
  quoteLocks.set(quoteId, lock);

  res.json({
    locked: true,
    isSelf: true,
    currentEditor: {
      userEmail: lock.userEmail,
      userRole: lock.userRole,
      lockedAt: lock.lockedAt,
      lastHeartbeat: lock.lastHeartbeat
    }
  });
});

// 3. Heartbeat (keep-alive)
app.post('/api/quotes/:id/lock/heartbeat', authenticateToken, (req: any, res: any) => {
  cleanExpiredQuoteLocks();
  const quoteId = req.params.id;
  const now = Date.now();
  const existing = quoteLocks.get(quoteId);

  if (!existing) {
    const lock: QuoteLock = {
      quoteId,
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role || 'Usuario',
      lockedAt: now,
      lastHeartbeat: now
    };
    quoteLocks.set(quoteId, lock);
    return res.json({ ok: true });
  }

  if (existing.userId === req.user.id) {
    existing.lastHeartbeat = now;
    return res.json({ ok: true });
  }

  return res.json({
    ok: false,
    message: 'El control de la cotización ha sido tomado por otro usuario.',
    currentEditor: {
      userEmail: existing.userEmail,
      userRole: existing.userRole,
      lockedAt: existing.lockedAt
    }
  });
});

// 4. Liberar candado
app.post('/api/quotes/:id/lock/release', authenticateToken, (req: any, res: any) => {
  const quoteId = req.params.id;
  const existing = quoteLocks.get(quoteId);
  if (existing && existing.userId === req.user.id) {
    quoteLocks.delete(quoteId);
  }
  res.json({ success: true });
});

// 5. Tomar control forzoso (Takeover)
app.post('/api/quotes/:id/lock/takeover', authenticateToken, async (req: any, res: any) => {
  const quoteId = req.params.id;
  const now = Date.now();
  const oldLock = quoteLocks.get(quoteId);

  const newLock: QuoteLock = {
    quoteId,
    userId: req.user.id,
    userEmail: req.user.email,
    userRole: req.user.role || 'Usuario',
    lockedAt: now,
    lastHeartbeat: now
  };
  quoteLocks.set(quoteId, newLock);

  try {
    const quoteExists = await prisma.quote.findUnique({ where: { id: quoteId }, select: { id: true } });
    if (quoteExists) {
      await prisma.quoteHistory.create({
        data: {
          quoteId,
          userName: req.user.name || req.user.email,
          action: 'Toma de Control',
          details: oldLock
            ? `Control de edición tomado de ${oldLock.userEmail} por ${req.user.name || req.user.email}`
            : `Control de edición asignado a ${req.user.name || req.user.email}`
        }
      });
    }
  } catch (e) {
    console.error('Error logging takeover to history:', e);
  }

  res.json({
    success: true,
    isSelf: true,
    currentEditor: {
      userEmail: newLock.userEmail,
      userRole: newLock.userRole,
      lockedAt: newLock.lockedAt,
      lastHeartbeat: newLock.lastHeartbeat
    }
  });
});

app.put('/api/quotes/:id', authenticateToken, async (req: any, res: any) => {
  try {
    cleanExpiredQuoteLocks();
    const activeLock = quoteLocks.get(req.params.id);
    const now = Date.now();
    if (activeLock && activeLock.userId !== req.user.id && (now - activeLock.lastHeartbeat <= QUOTE_LOCK_TIMEOUT_MS)) {
      return res.status(409).json({
        error: `Esta cotización está siendo editada por ${activeLock.userEmail}. Debes tomar el control antes de guardar cambios.`
      });
    }

    // Renovar o registrar candado para el usuario que está guardando
    quoteLocks.set(req.params.id, {
      quoteId: req.params.id,
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role || 'Usuario',
      lockedAt: activeLock?.lockedAt || now,
      lastHeartbeat: now
    });
    const { categories, ...quoteData } = req.body;
    const cleanData = {
      projectId: quoteData.projectId || null,
      version: Number(quoteData.version) || 1,
      isTemplate: Boolean(quoteData.isTemplate),
      templateName: quoteData.templateName || null,
      status: quoteData.status || 'En Creación',
      client: quoteData.client || '',
      brand: quoteData.brand || '',
      requirement: quoteData.requirement || '',
      date: quoteData.date || '',
      businessName: quoteData.businessName || '',
      ruc: quoteData.ruc || '',
      paymentConditions: quoteData.paymentConditions || '',
      currency: quoteData.currency || 'PEN',
      exchangeRate: quoteData.exchangeRate !== undefined ? Number(quoteData.exchangeRate) : 1.0,
      includeIgv: Boolean(quoteData.includeIgv)
    };

    // Get old quote to check what changed or create if missing
    let oldQuote = await prisma.quote.findUnique({ where: { id: req.params.id } });
    if (!oldQuote) {
      oldQuote = await prisma.quote.create({
        data: {
          id: req.params.id,
          ...cleanData
        }
      });
    } else {
      await prisma.quote.update({ where: { id: req.params.id }, data: cleanData });
    }

    await prisma.quoteCategory.deleteMany({ where: { quoteId: req.params.id } });
    const targetProjectId = cleanData.projectId || oldQuote?.projectId;

    if (categories) {
      const normalizedCategories = normalizeQuoteCategoriesForPersistence(categories, false);
      const cleanId = (id?: any) => (typeof id === 'string' && id.trim().length > 0) ? id.trim() : undefined;
      for (const cat of normalizedCategories) {
        await prisma.quoteCategory.create({
          data: {
            id: cleanId(cat.id),
            quoteId: req.params.id, name: cat.name,
            items: {
              create: (cat.items || []).map((i: any) => ({
                id: cleanId(i.id),
                name: i.name || '', quantity: Number(i.quantity) || 0, dates: Number(i.dates) || 0,
                details: typeof i.details === 'string' ? i.details : JSON.stringify(i.details || []),
                internalMultiplierPercent: Number(i.internalMultiplierPercent) || 0, financialExpensePercent: Number(i.financialExpensePercent) || 0,
                isSpecial: Boolean(i.isSpecial),
                specialRatePercent: i.specialRatePercent !== undefined && i.specialRatePercent !== null ? Number(i.specialRatePercent) : null,
                specialSourceItemIds: JSON.stringify(i.specialSourceItemIds || []),
                providerContact: i.providerContact || '',
                productionTime: i.productionTime || '',
                subItems: {
                  create: (i.subItems || []).map((s: any) => ({
                    id: cleanId(s.id),
                    name: s.name || '', description: s.description || '', quantity: parseFloat(String(s.quantity).replace(',', '.')) || 0, dates: parseFloat(String(s.dates).replace(',', '.')) || 0, unitCost: parseFloat(String(s.unitCost).replace(',', '.')) || 0, providerName: s.providerName || '', providerId: s.providerId || null
                  }))
                }
              }))
            }
          }
        });
      }
    }

    if (targetProjectId) {
      await syncProjectSubtotalFromQuotes(targetProjectId);
    }
    // Record History
    let actionDesc = 'Modificación';
    let details = 'Cotización actualizada';
    if (oldQuote && oldQuote.status !== cleanData.status) {
      actionDesc = 'Cambio de Estado';
      details = `Estado cambiado de ${oldQuote.status} a ${cleanData.status}`;
    }

    await prisma.quoteHistory.create({
      data: {
        quoteId: req.params.id,
        userName: req.user.email,
        action: actionDesc,
        details: details
      }
    });

    res.json(await (prisma.quote as any).findUnique({ where: { id: req.params.id }, include: { categories: { include: { items: { include: { subItems: true } } } } } }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Obtener cotización individual (resuelve automáticamente a la versión más reciente si no se especifica otra)
app.get('/api/quotes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { latest, version } = req.query;

    const target = await (prisma.quote as any).findFirst({
      where: {
        OR: [{ id: id }, { projectId: id }]
      },
      include: {
        categories: {
          include: {
            items: {
              include: { subItems: true }
            }
          }
        }
      }
    });

    if (!target) {
      return res.status(404).json({ error: 'Cotización no encontrada' });
    }

    // Buscar todas las versiones hermanas (mismo proyecto o mismo cliente+requerimiento)
    const siblingFilter: any = { isTemplate: false };
    if (target.projectId) {
      siblingFilter.projectId = target.projectId;
    } else {
      siblingFilter.client = target.client;
      siblingFilter.requirement = target.requirement;
    }

    const allSiblingQuotes = await (prisma.quote as any).findMany({
      where: siblingFilter,
      orderBy: { version: 'desc' },
      include: {
        categories: {
          include: {
            items: {
              include: { subItems: true }
            }
          }
        }
      }
    });

    let selectedQuote = target;
    if (version) {
      const exact = allSiblingQuotes.find((q: any) => String(q.version) === String(version));
      if (exact) selectedQuote = exact;
    } else if (latest === 'true') {
      if (allSiblingQuotes.length > 0) {
        selectedQuote = allSiblingQuotes[0];
      }
    } else if (latest === undefined) {
      // Si el id buscado era un projectId, devolver la versión más reciente
      if (target.id !== id && target.projectId === id) {
        if (allSiblingQuotes.length > 0) {
          selectedQuote = allSiblingQuotes[0];
        }
      }
      // Si el id era directamente el quote.id, selectedQuote se mantiene como target
    }

    res.json({
      ...selectedQuote,
      availableVersions: allSiblingQuotes.map((q: any) => ({
        id: q.id,
        version: q.version,
        date: q.date,
        status: q.status,
        requirement: q.requirement
      }))
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/quotes/:id/history', authenticateToken, async (req, res) => {
  try {
    const history = await prisma.quoteHistory.findMany({
      where: { quoteId: req.params.id },
      orderBy: { createdAt: 'desc' }
    });

    // Map to frontend expected format
    const formatted = history.map(h => ({
      id: h.id,
      action: h.action,
      details: h.details,
      createdAt: h.createdAt,
      userName: h.userName || 'Usuario Desconocido'
    }));

    res.json(formatted);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/quotes/:id', authenticateToken, async (req, res) => {
  try {
    const quoteId = req.params.id;
    quoteLocks.delete(quoteId);

    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        ordenes: { select: { id: true, tipoOrden: true } },
        pagos: { select: { id: true } }
      }
    });

    if (!quote) {
      return res.status(404).json({ error: 'La cotización no existe o ya fue eliminada.' });
    }

    if (quote.ordenes && quote.ordenes.length > 0) {
      const orderCodes = quote.ordenes.map(o => o.id).slice(0, 3).join(', ');
      return res.status(400).json({ 
        error: `No se puede eliminar la cotización porque tiene ${quote.ordenes.length} orden(es) asociada(s) (${orderCodes}). Para eliminarla, primero debes anular o reasignar las órdenes en el módulo correspondiente.` 
      });
    }

    if (quote.pagos && quote.pagos.length > 0) {
      return res.status(400).json({ 
        error: `No se puede eliminar la cotización porque tiene ${quote.pagos.length} pago(s) registrado(s). Primero debes anular los pagos asociados.` 
      });
    }

    try {
      await prisma.quoteHistory.deleteMany({ where: { quoteId } });
      await prisma.quote.delete({ where: { id: quoteId } });
    } catch {
      await prisma.quote.update({ where: { id: quoteId }, data: { status: 'Archivado' } });
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error al eliminar cotización:', err);
    res.status(500).json({ error: 'No se pudo eliminar la cotización. Verifica que no tenga dependencias activas.' });
  }
});

app.post('/api/quotes/bulk-status', authenticateToken, async (req, res) => {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || ids.length === 0 || !status) {
      return res.status(400).json({ error: 'Debes proporcionar una lista de cotizaciones y el nuevo estado.' });
    }

    await prisma.quote.updateMany({
      where: { id: { in: ids } },
      data: { status }
    });

    res.json({ success: true, count: ids.length, status });
  } catch (err: any) {
    console.error('Error en bulk-status:', err);
    res.status(500).json({ error: 'Error al actualizar el estado de las cotizaciones.' });
  }
});

app.post('/api/quotes/bulk-delete', authenticateToken, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Debes seleccionar al menos una cotización para eliminar.' });
    }

    const quotes = await prisma.quote.findMany({
      where: { id: { in: ids } },
      include: {
        ordenes: { select: { id: true } },
        pagos: { select: { id: true } }
      }
    });

    const deletedIds: string[] = [];
    const blocked: { id: string; reason: string }[] = [];

    for (const q of quotes) {
      if (q.ordenes && q.ordenes.length > 0) {
        blocked.push({
          id: q.id,
          reason: `Tiene ${q.ordenes.length} orden(es) de compra/servicio asociadas`
        });
        continue;
      }
      if (q.pagos && q.pagos.length > 0) {
        blocked.push({
          id: q.id,
          reason: `Tiene ${q.pagos.length} pago(s) a proveedor registrado(s)`
        });
        continue;
      }

      quoteLocks.delete(q.id);
      try {
        await prisma.quoteHistory.deleteMany({ where: { quoteId: q.id } });
        await prisma.quote.delete({ where: { id: q.id } });
        deletedIds.push(q.id);
      } catch {
        await prisma.quote.update({ where: { id: q.id }, data: { status: 'Archivado' } });
        deletedIds.push(q.id);
      }
    }

    res.json({
      success: true,
      deletedIds,
      blocked
    });
  } catch (err: any) {
    console.error('Error en bulk-delete:', err);
    res.status(500).json({ error: 'Error al procesar la eliminación masiva.' });
  }
});

app.get('/api/quotes/:id/export-excel', authenticateToken, async (req, res) => {
  try {
    const quote = await (prisma.quote as any).findUnique({
      where: { id: req.params.id },
      include: {
        categories: {
          include: {
            items: {
              include: { subItems: true }
            }
          }
        }
      }
    });

    if (!quote) {
      return res.status(404).json({ error: 'Cotización no encontrada' });
    }

    const buffer = await generateQuoteExcel(quote);

    // Formato de nombre solicitado: "Cotización {client} - {requirement}.xlsm"
    let resolvedClient = (quote.client || '').trim();
    let resolvedReq = (quote.requirement || '').trim();
    if (quote.projectId) {
      const proj = await prisma.proyecto.findUnique({
        where: { id: quote.projectId },
        include: { cliente: true }
      });
      if (proj) {
        if (proj.cliente?.empresa) resolvedClient = proj.cliente.empresa;
        if (!resolvedReq && proj.nombre) resolvedReq = proj.nombre;
      }
    }
    if (!resolvedClient && quote.client) {
      const cl = await prisma.cliente.findUnique({ where: { id: quote.client } });
      if (cl?.empresa) resolvedClient = cl.empresa;
    }

    const clientPart = resolvedClient.trim();
    const reqPart = resolvedReq.trim();
    let fileBase = 'Cotización';
    if (clientPart && reqPart) {
      fileBase = `Cotización ${clientPart} - ${reqPart}`;
    } else if (clientPart) {
      fileBase = `Cotización ${clientPart}`;
    } else if (reqPart) {
      fileBase = `Cotización ${reqPart}`;
    }
    const safeFileBase = fileBase.replace(/[\\/:*?"<>|]/g, '_').trim();
    const asciiFallback = safeFileBase.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '_');
    const encodedFilename = encodeURIComponent(`${safeFileBase}.xlsm`);

    res.setHeader('Content-Type', 'application/vnd.ms-excel.sheet.macroEnabled.12');
    res.setHeader('Content-Disposition', `attachment; filename="${asciiFallback}.xlsm"; filename*=UTF-8''${encodedFilename}`);
    res.send(buffer);
  } catch (error: any) {
    console.error('Error exportando excel - FULL STACK:', error.stack || error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// Importar / Parsear cotización desde Excel subido (.xlsm / .xlsx)
app.post('/api/quotes/parse-excel', authenticateToken, upload.single('file'), async (req: any, res: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se subió ningún archivo Excel (.xlsm o .xlsx)' });
    }
    const result = await parseQuoteExcel(req.file.buffer);
    res.json(result);
  } catch (error: any) {
    console.error('Error parseando cotización desde Excel:', error.stack || error);
    res.status(500).json({ error: error.message || 'Error al procesar el archivo Excel' });
  }
});

/**
 * Genera el PDF oficial de la Orden de Compra/Servicio y lo sube automáticamente
 * a Google Drive en [Cliente] > [Proyecto] > Producción > Órdenes de compra.
 * Si ya existen versiones previas, desglosa automáticamente en una subcarpeta
 * "[ID] - [Proveedor]" y agrupa el historial (V1, V2, etc.).
 */
async function uploadOrdenPdfToDrive(ordenId: string, req?: any): Promise<any> {
  const orden = await prisma.orden.findUnique({
    where: { id: ordenId },
    include: { cliente: true, proyecto: true, proveedor: true, items: true }
  });
  if (!orden) return null;

  const originUrl = req?.headers?.origin || (req?.headers?.referer ? new URL(req.headers.referer).origin : '');
  const baseUrl = originUrl || process.env.FRONTEND_URL || 'http://localhost:5173';

  const reqToken = req?.headers?.['authorization']?.split(' ')[1] || jwt.sign(
    { id: req?.user?.id || 'system', email: req?.user?.email || 'system@purplebtl.com', role: req?.user?.role || 'Admin' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  let pdfPath: string | null = null;
  try {
    console.log(`[Google Drive] Generando PDF automático para orden ${orden.id}...`);
    pdfPath = await generatePdfFromUrl(
      `${baseUrl}/?printOrden=${orden.id}&token=${reqToken}`,
      `orden_${orden.id}`,
      { apiOrigin: resolvePrintApiOrigin(req) }
    );

    const tipoDoc = orden.tipoOrden ? orden.tipoOrden.toUpperCase() : 'COMPRA';
    const fileName = `Orden_${tipoDoc}_${orden.id}.pdf`;
    const provName = (orden.proveedor?.razonSocial || orden.proveedor?.nombre || '').trim();

    const driveResult = await uploadToProjectDriveFolder({
      projectId: orden.proyectoId,
      clienteId: orden.clienteId,
      clientName: orden.cliente?.empresa,
      projectName: orden.proyecto?.nombre,
      area: 'Producción',
      subfolder: 'Órdenes de compra',
      fileName,
      mimeType: 'application/pdf',
      filePath: pdfPath,
      userEmail: resolveUserEmail(req),
      prisma,
      versioning: true,
      itemIdentifier: orden.id,
      entityName: provName
    });

    if (driveResult?.webViewLink) {
      await prisma.orden.update({
        where: { id: orden.id },
        data: {
          pdfUrl: driveResult.webViewLink,
          driveFileId: driveResult.id
        }
      });
      console.log(`[Google Drive] ✅ PDF de orden ${orden.id} guardado en Drive: ${driveResult.webViewLink}`);
    }

    return driveResult;
  } catch (err: any) {
    console.error(`[Google Drive] ⚠️ Error subiendo PDF automático de orden ${orden.id}:`, err?.message || err);
  } finally {
    if (pdfPath && fs.existsSync(pdfPath)) {
      try { fs.unlinkSync(pdfPath); } catch (e) {}
    }
  }
}

/**
 * Genera el PDF oficial del Pago a Proveedor y lo sube automáticamente
 * a Google Drive en [Cliente] > [Proyecto] > Producción > Pago a proveedor.
 * Si ya existen versiones previas, desglosa automáticamente en una subcarpeta
 * "[ID] - [Proveedor]" y agrupa el historial (V1, V2, etc.).
 */
async function uploadPagoPdfToDriveWithArtifact(
  pagoId: string,
  req?: any,
  options?: { keepTempFile?: boolean }
): Promise<{ driveResult: any; pdfPath: string | null }> {
  const pago = await prisma.pago.findUnique({
    where: { id: pagoId },
    include: { cliente: true, proyecto: true, proveedor: true, orden: true }
  });
  if (!pago) return { driveResult: null, pdfPath: null };

  const originUrl = req?.headers?.origin || (req?.headers?.referer ? new URL(req.headers.referer).origin : '');
  const baseUrl = originUrl || process.env.FRONTEND_URL || 'http://localhost:5173';

  const reqToken = req?.headers?.['authorization']?.split(' ')[1] || jwt.sign(
    { id: req?.user?.id || 'system', email: req?.user?.email || 'system@purplebtl.com', role: req?.user?.role || 'Admin' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  let pdfPath: string | null = null;
  let driveResult: any = null;
  try {
    console.log(`[Google Drive] Generando PDF automático para pago ${pago.id}...`);
    pdfPath = await generatePdfFromUrl(
      `${baseUrl}/?printPago=${pago.id}&token=${reqToken}`,
      `pago_${pago.id}`,
      { apiOrigin: resolvePrintApiOrigin(req) }
    );

    const provName = (pago.proveedor?.razonSocial || pago.proveedor?.nombre || '').trim();
    const cleanId = pago.numeroComprobante ? `Comprobante_${pago.numeroComprobante}` : pago.id;
    const fileName = `Pago_${cleanId}.pdf`;

    driveResult = await uploadToProjectDriveFolder({
      projectId: pago.proyectoId,
      clienteId: pago.clienteId,
      clientName: pago.cliente?.empresa,
      projectName: pago.proyecto?.nombre,
      area: 'Producción',
      subfolder: 'Pago a proveedor',
      fileName,
      mimeType: 'application/pdf',
      filePath: pdfPath,
      userEmail: resolveUserEmail(req),
      prisma,
      versioning: true,
      itemIdentifier: pago.id,
      entityName: provName
    });

    if (driveResult?.webViewLink) {
      await prisma.pago.update({
        where: { id: pago.id },
        data: {
          pdfUrl: driveResult.webViewLink,
          driveFileId: driveResult.id
        }
      });
      console.log(`[Google Drive] ✅ PDF de pago ${pago.id} guardado en Drive: ${driveResult.webViewLink}`);
    }

    return {
      driveResult,
      pdfPath: options?.keepTempFile ? pdfPath : null
    };
  } catch (err: any) {
    console.error(`[Google Drive] ⚠️ Error subiendo PDF automático de pago ${pago.id}:`, err?.message || err);
    return {
      driveResult: null,
      pdfPath: options?.keepTempFile && pdfPath && fs.existsSync(pdfPath) ? pdfPath : null
    };
  } finally {
    if (!options?.keepTempFile && pdfPath && fs.existsSync(pdfPath)) {
      try { fs.unlinkSync(pdfPath); } catch (e) {}
    }
  }
}

async function uploadPagoPdfToDrive(pagoId: string, req?: any): Promise<any> {
  const { driveResult } = await uploadPagoPdfToDriveWithArtifact(pagoId, req, { keepTempFile: false });
  return driveResult;
}

// --- ORDENES (CORREGIDO PARA GUARDAR) ---
app.get('/api/ordenes', authenticateToken, async (req, res) => {
  try {
    const ordenes = await prisma.orden.findMany({ include: { items: true, cliente: true, proyecto: true, proveedor: true } });
    console.log(`GET /api/ordenes -> found ${ordenes.length} orden(es)`);
    if (ordenes.length > 0) console.log('sample orden:', ordenes[0]);
    res.json(ordenes);
  } catch (error: any) {
    console.error('Error fetching ordenes:', error.message || error);
    res.status(500).json({ error: 'Error fetching ordenes', details: error.message || String(error) });
  }
});

app.post('/api/ordenes', authenticateToken, upload.single('cotizacionFile'), async (req: any, res) => {
  try {
    let payload = req.body;
    if (req.body.data && typeof req.body.data === 'string') {
      try { payload = JSON.parse(req.body.data); } catch (e) {}
    }
    const { items, ...data } = payload;
    console.log('POST /api/ordenes payload - data:', data);
    console.log('POST /api/ordenes payload - items:', items);

    // Evitar pasar objetos anidados o relaciones inesperadas a Prisma
    delete (data as any).pagos;
    delete (data as any).cliente;
    delete (data as any).proyecto;
    delete (data as any).proveedor;

    // Validación estricta: RUC y Cuenta Bancaria obligatorios para emitir órdenes
    let prv: any = null;
    if (data.proveedorId) {
      prv = await prisma.proveedor.findUnique({
        where: { id: data.proveedorId },
        include: { cuentas: true }
      });
      if (prv) {
        const ruc = (prv.ruc || '').trim();
        const hasValidRuc = ruc && ruc !== '-' && ruc.length >= 8;
        const hasValidAccount = prv.cuentas && prv.cuentas.some((c: any) => c.numeroCuenta && c.numeroCuenta.trim() !== '-');
        if (!hasValidRuc || !hasValidAccount) {
          const missing: string[] = [];
          if (!hasValidRuc) missing.push('RUC válido (11 dígitos)');
          if (!hasValidAccount) missing.push('al menos una Cuenta Bancaria');
          return res.status(400).json({
            error: `Emisión bloqueada: El proveedor '${prv.razonSocial}' no tiene ${missing.join(' ni ')} registrado.`
          });
        }
      }
    }

    const ordTotal = Number(data.total) || 0;
    const detrCheck = validateAndNormalizeDetraccion({
      aplicaDetraccion: data.aplicaDetraccion,
      porcentajeDetraccion: data.porcentajeDetraccion,
      montoDetraccion: data.montoDetraccion,
      baseAmount: ordTotal,
      isServicio: (data.tipoOrden || 'Compra') === 'Servicio',
      proveedorTipoDocumento: prv?.tipoDocumento,
      proveedorRazonSocial: prv?.razonSocial
    });
    if ('error' in detrCheck) {
      return res.status(400).json({ error: detrCheck.error });
    }

    // Subir Cotización del Proveedor a Google Drive si se adjuntó archivo
    let cotizacionUrl = data.cotizacionProveedorUrl || null;
    let cotizacionName = data.cotizacionProveedorName || null;
    if (req.file) {
      try {
        const prov = data.proveedorId ? await prisma.proveedor.findUnique({ where: { id: data.proveedorId } }) : null;
        const provName = (prov?.razonSocial || prov?.nombre || 'Proveedor').trim();
        const cleanProvName = provName.replace(/[/\\?%*:|"<>]/g, '_');
        const ext = path.extname(req.file.originalname) || (req.file.mimetype.includes('pdf') ? '.pdf' : '.jpg');
        const fileName = `Cotizacion - ${cleanProvName} - ${data.id}${ext}`;

        const driveResult = await uploadToProjectDriveFolder({
          projectId: data.proyectoId,
          clienteId: data.clienteId,
          area: 'Producción',
          subfolder: 'Cotizaciones de proveedores',
          fileName,
          mimeType: req.file.mimetype,
          buffer: req.file.buffer,
          userEmail: resolveUserEmail(req),
          prisma,
          versioning: true,
          itemIdentifier: `Cotiz_${data.id}`,
          entityName: cleanProvName
        });
        cotizacionUrl = driveResult.webViewLink || null;
        cotizacionName = req.file.originalname;
      } catch (cErr: any) {
        console.error("Error subiendo cotización de proveedor a Drive en creación:", cErr);
      }
    }

    // Filtro de campos permitidos para la tabla Orden
    const cleanOrdenData = {
      id: data.id,
      proveedorId: data.proveedorId,
      clienteId: data.clienteId,
      proyectoId: data.proyectoId,
      quoteId: data.quoteId,
      fechaEmision: data.fechaEmision,
      total: ordTotal,
      condicionesPago: data.condicionesPago || '',
      tipoOrden: data.tipoOrden || 'Compra',
      aplicaDetraccion: detrCheck.aplicaDetraccion,
      porcentajeDetraccion: detrCheck.porcentajeDetraccion,
      montoDetraccion: detrCheck.montoDetraccion,
      montoNeto: detrCheck.montoNeto,
      estadoEntrega: data.estadoEntrega || 'Pendiente',
      cuentaBancariaId: data.cuentaBancariaId || null,
      titulo: data.titulo || null,
      cotizacionProveedorUrl: cotizacionUrl,
      cotizacionProveedorName: cotizacionName,
    };

    const result = await prisma.orden.create({
      data: {
        ...cleanOrdenData,
        items: {
          create: mapOrdenItemsForCreate(items || [], ordTotal)
        }
      },
      include: { items: true, cliente: true, proyecto: true, proveedor: true }
    });
    res.json(result);

    // Subir PDF oficial a Google Drive en segundo plano con desglose de versiones
    setImmediate(() => {
      uploadOrdenPdfToDrive(result.id, req).catch(err => {
        console.error('[Google Drive] Error al subir PDF de orden en segundo plano:', err?.message || err);
      });
    });
  } catch (error: any) {
    console.error("Error al crear orden:", error);
    res.status(500).json({ error: 'No se pudo guardar la orden', details: error.message || String(error) });
  }
});

// --- CREAR ÓRDENES EN LOTE (GENERACIÓN MASIVA) ---
app.post('/api/ordenes/batch', authenticateToken, async (req, res) => {
  try {
    const { ordenes } = req.body;
    if (!Array.isArray(ordenes) || ordenes.length === 0) {
      return res.status(400).json({ error: 'La lista de órdenes a generar está vacía.' });
    }

    // 1. Validar proveedores (RUC, cuenta bancaria) y reglas tributarias SPOT (no RxH)
    const normalizedDetrByIndex: Array<{ aplicaDetraccion: boolean; porcentajeDetraccion: number; montoDetraccion: number; montoNeto: number }> = [];
    for (let idx = 0; idx < ordenes.length; idx++) {
      const ord = ordenes[idx];
      let prv: any = null;
      if (ord.proveedorId) {
        prv = await prisma.proveedor.findUnique({
          where: { id: ord.proveedorId },
          include: { cuentas: true }
        });
        if (prv) {
          const ruc = (prv.ruc || '').trim();
          const hasValidRuc = ruc && ruc !== '-' && ruc.length >= 8;
          const hasValidAccount = prv.cuentas && prv.cuentas.some((c: any) => c.numeroCuenta && c.numeroCuenta.trim() !== '-');
          if (!hasValidRuc || !hasValidAccount) {
            const missing: string[] = [];
            if (!hasValidRuc) missing.push('RUC válido (11 dígitos)');
            if (!hasValidAccount) missing.push('al menos una Cuenta Bancaria');
            return res.status(400).json({
              error: `Emisión bloqueada: El proveedor '${prv.razonSocial}' no tiene ${missing.join(' ni ')} registrado.`
            });
          }
        }
      }

      const ordTotal = Number(ord.total) || 0;
      const detrCheck = validateAndNormalizeDetraccion({
        aplicaDetraccion: ord.aplicaDetraccion,
        porcentajeDetraccion: ord.porcentajeDetraccion,
        montoDetraccion: ord.montoDetraccion,
        baseAmount: ordTotal,
        isServicio: (ord.tipoOrden || 'Compra') === 'Servicio',
        proveedorTipoDocumento: prv?.tipoDocumento,
        proveedorRazonSocial: prv?.razonSocial
      });
      if ('error' in detrCheck) {
        return res.status(400).json({ error: detrCheck.error });
      }
      normalizedDetrByIndex.push(detrCheck);
    }

    // 2. Crear las órdenes en la base de datos
    const createdOrders: any[] = [];
    for (let idx = 0; idx < ordenes.length; idx++) {
      const ord = ordenes[idx];
      const { items, ...data } = ord;
      delete (data as any).pagos;
      delete (data as any).cliente;
      delete (data as any).proyecto;
      delete (data as any).proveedor;

      const detrCheck = normalizedDetrByIndex[idx];
      const cleanOrdenData = {
        id: data.id,
        proveedorId: data.proveedorId,
        clienteId: data.clienteId,
        proyectoId: data.proyectoId,
        quoteId: data.quoteId,
        fechaEmision: data.fechaEmision || new Date().toISOString().split('T')[0],
        total: Number(data.total) || 0,
        condicionesPago: data.condicionesPago || '',
        tipoOrden: data.tipoOrden || 'Compra',
        aplicaDetraccion: detrCheck.aplicaDetraccion,
        porcentajeDetraccion: detrCheck.porcentajeDetraccion,
        montoDetraccion: detrCheck.montoDetraccion,
        montoNeto: detrCheck.montoNeto,
        estadoEntrega: data.estadoEntrega || 'Pendiente',
        cuentaBancariaId: data.cuentaBancariaId || null,
        titulo: data.titulo || null,
      };

      const result = await prisma.orden.create({
        data: {
          ...cleanOrdenData,
          items: {
            create: mapOrdenItemsForCreate(items || [], Number(data.total) || 0)
          }
        },
        include: { items: true, cliente: true, proyecto: true, proveedor: true }
      });
      createdOrders.push(result);
    }

    res.json(createdOrders);

    // Subir PDFs oficiales a Google Drive en segundo plano secuencialmente
    setImmediate(async () => {
      for (const ord of createdOrders) {
        try {
          await uploadOrdenPdfToDrive(ord.id, req);
        } catch (err: any) {
          console.error(`[Google Drive] Error al subir PDF en lote para orden ${ord.id}:`, err?.message || err);
        }
      }
    });
  } catch (error: any) {
    console.error("Error al crear órdenes en lote:", error);
    res.status(500).json({ error: 'No se pudieron guardar las órdenes en lote', details: error.message || String(error) });
  }
});

app.put('/api/ordenes/:id', authenticateToken, async (req, res) => {
  try {
    const { items, ...data } = req.body;
    console.log('PUT /api/ordenes/:id payload - data:', data);

    const existingOrden = await prisma.orden.findUnique({
      where: { id: req.params.id },
      include: { proveedor: true }
    });
    if (!existingOrden) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    const targetProveedorId = data.proveedorId !== undefined ? data.proveedorId : existingOrden.proveedorId;
    const targetProveedor =
      targetProveedorId && targetProveedorId !== existingOrden.proveedorId
        ? await prisma.proveedor.findUnique({ where: { id: targetProveedorId } })
        : existingOrden.proveedor;
    const targetTipoOrden = data.tipoOrden !== undefined ? (data.tipoOrden || 'Compra') : existingOrden.tipoOrden;
    const targetTotal = data.total !== undefined ? (Number(data.total) || 0) : existingOrden.total;
    const targetIsRxH = isReciboPorHonorariosDoc(targetProveedor?.tipoDocumento);

    if (Boolean(data.aplicaDetraccion) && targetIsRxH) {
      return res.status(400).json({
        error: `Detracción SPOT no permitida: El proveedor '${targetProveedor?.razonSocial || 'Recibo por Honorarios'}' emite Recibo por Honorarios (4ta Categoría) y no está sujeto a detracción.`
      });
    }

    // Filtrar estrictamente solo campos escalares para evitar conflictos de relaciones con Prisma
    const updateData: any = {};
    if (data.proveedorId !== undefined) updateData.proveedorId = data.proveedorId;
    if (data.clienteId !== undefined) updateData.clienteId = data.clienteId;
    if (data.proyectoId !== undefined) updateData.proyectoId = data.proyectoId;
    if (data.quoteId !== undefined) updateData.quoteId = data.quoteId;
    if (data.fechaEmision !== undefined) updateData.fechaEmision = data.fechaEmision;
    if (data.total !== undefined) updateData.total = Number(data.total) || 0;
    if (data.condicionesPago !== undefined) updateData.condicionesPago = data.condicionesPago || '';
    if (data.tipoOrden !== undefined) updateData.tipoOrden = data.tipoOrden || 'Compra';

    if (
      data.aplicaDetraccion !== undefined ||
      data.porcentajeDetraccion !== undefined ||
      data.montoDetraccion !== undefined ||
      data.montoNeto !== undefined ||
      data.proveedorId !== undefined ||
      data.tipoOrden !== undefined
    ) {
      const candidateAplica =
        data.aplicaDetraccion !== undefined ? data.aplicaDetraccion : existingOrden.aplicaDetraccion;
      const candidatePct =
        data.porcentajeDetraccion !== undefined ? data.porcentajeDetraccion : existingOrden.porcentajeDetraccion;
      const candidateMontoDetr =
        data.montoDetraccion !== undefined ? data.montoDetraccion : existingOrden.montoDetraccion;

      const detrCheck = validateAndNormalizeDetraccion({
        aplicaDetraccion: targetIsRxH ? false : candidateAplica,
        porcentajeDetraccion: candidatePct,
        montoDetraccion: candidateMontoDetr,
        baseAmount: targetTotal,
        isServicio: targetTipoOrden === 'Servicio',
        proveedorTipoDocumento: targetProveedor?.tipoDocumento,
        proveedorRazonSocial: targetProveedor?.razonSocial
      });
      if ('error' in detrCheck) {
        return res.status(400).json({ error: detrCheck.error });
      }
      updateData.aplicaDetraccion = detrCheck.aplicaDetraccion;
      updateData.porcentajeDetraccion = detrCheck.porcentajeDetraccion;
      updateData.montoDetraccion = detrCheck.montoDetraccion;
      updateData.montoNeto = detrCheck.montoNeto;
    }
    if (data.estadoEntrega !== undefined) updateData.estadoEntrega = data.estadoEntrega || 'Pendiente';
    if (data.cuentaBancariaId !== undefined) updateData.cuentaBancariaId = data.cuentaBancariaId || null;
    if (data.titulo !== undefined) updateData.titulo = data.titulo || null;
    if (data.cotizacionProveedorUrl !== undefined) updateData.cotizacionProveedorUrl = data.cotizacionProveedorUrl;
    if (data.cotizacionProveedorName !== undefined) updateData.cotizacionProveedorName = data.cotizacionProveedorName;

    if (items && Array.isArray(items)) {
      updateData.items = {
        deleteMany: {},
        create: mapOrdenItemsForCreate(items, targetTotal)
      };
    }

    const result = await prisma.orden.update({
      where: { id: req.params.id },
      data: updateData,
      include: { items: true, cliente: true, proyecto: true, proveedor: true }
    });
    res.json(result);

    // Re-generar y subir nueva versión a Google Drive en segundo plano (desglosa por carpeta automáticamente)
    setImmediate(() => {
      uploadOrdenPdfToDrive(result.id, req).catch(err => {
        console.error('[Google Drive] Error actualizando PDF de orden en segundo plano:', err?.message || err);
      });
    });
  } catch (error: any) {
    console.error('Error al actualizar orden:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/ordenes/:id', authenticateToken, async (req, res) => {
  try {
    await prisma.orden.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// --- SUBIR COTIZACIÓN DEL PROVEEDOR PARA UNA ORDEN DE COMPRA (IMAGEN O PDF) ---
app.post('/api/ordenes/:id/upload-cotizacion', authenticateToken, upload.single('cotizacionFile'), async (req: any, res) => {
  try {
    const { id } = req.params;
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No se envió ningún archivo de cotización.' });
    }

    const orden = await prisma.orden.findUnique({
      where: { id },
      include: { cliente: true, proyecto: true, proveedor: true }
    });
    if (!orden) {
      return res.status(404).json({ error: 'Orden no encontrada.' });
    }

    const provName = (orden.proveedor?.razonSocial || orden.proveedor?.nombre || 'Proveedor').trim();
    const cleanProvName = provName.replace(/[/\\?%*:|"<>]/g, '_');
    const ext = path.extname(file.originalname) || (file.mimetype.includes('pdf') ? '.pdf' : '.jpg');
    
    // Nombres limpios requeridos por el usuario:
    // "ese archivo debe guardarse en la carpeta cotizacciones con el nombre del proveedor."
    const fileName = `Cotizacion - ${cleanProvName} - ${orden.id}${ext}`;

    const driveResult = await uploadToProjectDriveFolder({
      projectId: orden.proyectoId,
      clienteId: orden.clienteId,
      clientName: orden.cliente?.empresa,
      projectName: orden.proyecto?.nombre,
      area: 'Producción',
      subfolder: 'Cotizaciones de proveedores',
      fileName,
      mimeType: file.mimetype,
      buffer: file.buffer,
      userEmail: resolveUserEmail(req),
      prisma,
      versioning: true,
      itemIdentifier: `Cotiz_${orden.id}`,
      entityName: cleanProvName
    });

    const updatedOrden = await prisma.orden.update({
      where: { id },
      data: {
        cotizacionProveedorUrl: driveResult.webViewLink || `/uploads/${file.originalname}`,
        cotizacionProveedorName: file.originalname
      },
      include: { items: true, cliente: true, proyecto: true, proveedor: true }
    });

    res.json({
      success: true,
      orden: updatedOrden,
      fileUrl: driveResult.webViewLink,
      fileName: driveResult.fileName || fileName
    });
  } catch (error: any) {
    console.error('Error al subir cotización del proveedor:', error);
    res.status(500).json({ error: error.message || 'Error al subir cotización a Google Drive' });
  }
});

// --- DESCARGAR / VER PDF DE ORDEN DE COMPRA/SERVICIO ---
app.get('/api/ordenes/:id/pdf', authenticateToken, async (req: any, res: any) => {
  let pdfPath: string | null = null;
  try {
    const orden = await prisma.orden.findUnique({ where: { id: req.params.id } });
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });

    const originUrl = req?.headers?.origin || (req?.headers?.referer ? new URL(req.headers.referer).origin : '');
    const baseUrl = originUrl || process.env.FRONTEND_URL || 'http://localhost:5173';

    const reqToken = req?.headers?.['authorization']?.split(' ')[1] || jwt.sign(
      { id: req.user?.id || 'system', email: req.user?.email || 'system@purplebtl.com', role: req.user?.role || 'Admin' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    pdfPath = await generatePdfFromUrl(
      `${baseUrl}/?printOrden=${orden.id}&token=${reqToken}`,
      `orden_${orden.id}`,
      { apiOrigin: resolvePrintApiOrigin(req) }
    );

    const tipoDoc = orden.tipoOrden ? orden.tipoOrden.toUpperCase() : 'COMPRA';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Orden_${tipoDoc}_${orden.id}.pdf"`);

    const stream = fs.createReadStream(pdfPath);
    stream.pipe(res);
    stream.on('end', () => {
      if (pdfPath && fs.existsSync(pdfPath)) {
        try { fs.unlinkSync(pdfPath); } catch (e) { }
      }
    });
    stream.on('error', (err) => {
      console.error('Error streaming PDF:', err);
      if (pdfPath && fs.existsSync(pdfPath)) {
        try { fs.unlinkSync(pdfPath); } catch (e) { }
      }
    });
  } catch (error: any) {
    console.error('Error generando PDF de orden:', error);
    if (pdfPath && fs.existsSync(pdfPath)) {
      try { fs.unlinkSync(pdfPath); } catch (e) { }
    }
    res.status(500).json({ error: error.message || 'Error al generar el PDF de la orden' });
  }
});

// --- ENVIAR ÓRDENES DE COMPRA/SERVICIO POR CORREO CON PDF ADJUNTO ---
app.post('/api/ordenes/send-email', authenticateToken, async (req: any, res: any) => {
  const generatedPdfs: string[] = [];
  try {
    const {
      ordenIds,
      mode = 'individual', // 'individual' | 'consolidated'
      destinationEmail,
      ccEmails,
      subject,
      message,
      recipientOverrides = {} // { [ordenId]: string }
    } = req.body;

    if (!Array.isArray(ordenIds) || ordenIds.length === 0) {
      return res.status(400).json({ error: 'Debes seleccionar al menos una orden para enviar.' });
    }

    console.log(`[Email Ordenes] Solicitud recibida: mode=${mode}, ${ordenIds.length} ordenes, usuario: ${req.user?.email || req.user?.id}`);

    const emailCtx = await resolveEmailContext(req.user?.id);

    // Para Puppeteer, priorizar el origen del cliente (localhost o dominio de producción)
    const originUrl = req?.headers?.origin || (req?.headers?.referer ? new URL(req.headers.referer).origin : '');
    const baseUrl = originUrl || process.env.FRONTEND_URL || 'http://localhost:5173';

    const reqToken = req?.headers?.['authorization']?.split(' ')[1] || jwt.sign(
      { id: req.user?.id || 'system', email: req.user?.email || 'system@purplebtl.com', role: req.user?.role || 'Admin' },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Obtener órdenes con relaciones completas
    const ordenes = await prisma.orden.findMany({
      where: { id: { in: ordenIds } },
      include: {
        proveedor: { include: { cuentas: true } },
        cliente: true,
        proyecto: true,
        items: true
      }
    });

    if (ordenes.length === 0) {
      return res.status(404).json({ error: 'No se encontraron las órdenes solicitadas en la base de datos.' });
    }

    const formatSoles = (amount: number) => `S/ ${Number(amount || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    if (mode === 'consolidated') {
      // Envío consolidado: todos los PDFs adjuntos en un único correo
      const targetTo = (destinationEmail || '').trim();
      if (!targetTo) {
        return res.status(400).json({ error: 'Debes indicar un correo destinatario para el envío consolidado.' });
      }

      const attachments: any[] = [];
      const ordersSummaryHtml: string[] = [];

      for (const orden of ordenes) {
        try {
          const pdfPath = await generatePdfFromUrl(
            `${baseUrl}/?printOrden=${orden.id}&token=${reqToken}`,
            `orden_${orden.id}`,
            { apiOrigin: resolvePrintApiOrigin(req) }
          );
          generatedPdfs.push(pdfPath);
          const cleanTipo = orden.tipoOrden ? orden.tipoOrden.toUpperCase() : 'COMPRA';
          attachments.push({
            filename: `Orden_${cleanTipo}_${orden.id}.pdf`,
            path: pdfPath
          });

          ordersSummaryHtml.push(`
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px; font-weight: bold; color: #7c3aed;">${orden.id}</td>
              <td style="padding: 10px;">${orden.tipoOrden || 'Compra'}</td>
              <td style="padding: 10px; font-weight: 600;">${orden.proveedor?.razonSocial || 'Proveedor'}</td>
              <td style="padding: 10px;">${orden.proyecto?.nombre || '-'}</td>
              <td style="padding: 10px; text-align: right; font-weight: bold; color: #059669;">${formatSoles(orden.total)}</td>
            </tr>
          `);
        } catch (pdfErr: any) {
          console.error(`Error generando PDF para orden ${orden.id}:`, pdfErr?.message || pdfErr);
        }
      }

      if (attachments.length === 0) {
        return res.status(500).json({ error: 'No se pudieron generar los PDFs de las órdenes seleccionadas.' });
      }

      const emailSubject = (subject || '').trim() || `Órdenes de Compra y Servicio (${ordenes.length}) - Purple BTL`;
      const userMessageHtml = message ? `
        <div style="background: #f8fafc; border-left: 4px solid #7c3aed; padding: 14px 18px; margin: 18px 0; border-radius: 4px; font-style: italic; color: #334155;">
          ${message.replace(/\n/g, '<br/>')}
        </div>
      ` : '';

      const htmlBody = `
        <div style="font-family: Arial, Helvetica, sans-serif; max-width: 700px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
          <div style="background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); padding: 24px; border-radius: 12px 12px 0 0; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 22px; font-weight: bold; letter-spacing: -0.02em;">Órdenes de Compra y Servicio</h1>
            <p style="margin: 6px 0 0; font-size: 13px; opacity: 0.9;">PURPLE BTL - Soluciones BTL & Eventos Corporativos</p>
          </div>
          <div style="background: #ffffff; padding: 28px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="font-size: 15px; margin-top: 0;">Estimado(a),</p>
            <p>Se adjuntan en formato PDF oficial las <strong>${ordenes.length}</strong> órdenes de compra y servicio seleccionadas:</p>
            ${userMessageHtml}
            <div style="margin: 20px 0; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                <thead>
                  <tr style="background: #f1f5f9; color: #475569; font-weight: 600; font-size: 12px; text-transform: uppercase;">
                    <th style="padding: 10px;">ID Orden</th>
                    <th style="padding: 10px;">Tipo</th>
                    <th style="padding: 10px;">Proveedor</th>
                    <th style="padding: 10px;">Proyecto</th>
                    <th style="padding: 10px; text-align: right;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${ordersSummaryHtml.join('')}
                </tbody>
              </table>
            </div>
            <p style="font-size: 13px; color: #64748b; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 14px;">
              Este correo ha sido generado y enviado de manera automatizada a través del sistema <strong>SIG Purple BTL</strong>.
            </p>
          </div>
        </div>
      `;

      await sendEmail(targetTo, emailSubject, htmlBody, attachments, emailCtx.smtp, ccEmails, emailCtx.httpsConfig);

      return res.json({
        success: true,
        mode: 'consolidated',
        count: ordenes.length,
        sentTo: [targetTo],
        attachmentsCount: attachments.length
      });

    } else {
      // Envío individual: cada orden se envía directamente a su proveedor
      const results: any[] = [];
      const failedOrders: any[] = [];

      for (const orden of ordenes) {
        let pdfPath: string | null = null;
        try {
          const provEmail = (recipientOverrides[orden.id] || orden.proveedor?.correo || (orden.proveedor as any)?.email || '').trim();
          if (!provEmail) {
            failedOrders.push({
              ordenId: orden.id,
              proveedor: orden.proveedor?.razonSocial || 'Proveedor sin nombre',
              error: `El proveedor no cuenta con correo registrado en su ficha comercial.`
            });
            continue;
          }

          pdfPath = await generatePdfFromUrl(
            `${baseUrl}/?printOrden=${orden.id}&token=${reqToken}`,
            `orden_${orden.id}`,
            { apiOrigin: resolvePrintApiOrigin(req) }
          );
          generatedPdfs.push(pdfPath);

          const cleanTipo = orden.tipoOrden ? orden.tipoOrden.toUpperCase() : 'COMPRA';
          const attachments = [{
            filename: `Orden_${cleanTipo}_${orden.id}.pdf`,
            path: pdfPath
          }];

          const ordenSubject = (subject || '').trim() || `Orden de ${orden.tipoOrden || 'Compra'} N° ${orden.id} - ${orden.proyecto?.nombre || 'Purple BTL'}`;
          const userMessageHtml = message ? `
            <div style="background: #f8fafc; border-left: 4px solid #7c3aed; padding: 14px 18px; margin: 18px 0; border-radius: 4px; font-style: italic; color: #334155;">
              ${message.replace(/\n/g, '<br/>')}
            </div>
          ` : '';

          const htmlBody = `
            <div style="font-family: Arial, Helvetica, sans-serif; max-width: 650px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
              <div style="background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); padding: 22px 24px; border-radius: 12px 12px 0 0; color: #ffffff;">
                <h1 style="margin: 0; font-size: 20px; font-weight: bold;">Orden de ${orden.tipoOrden || 'Compra'} N° ${orden.id}</h1>
                <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">PURPLE BTL - Soluciones BTL & Eventos Corporativos</p>
              </div>
              <div style="background: #ffffff; padding: 26px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
                <p style="font-size: 15px; margin-top: 0;">Estimados señores de <strong>${orden.proveedor?.razonSocial || 'Proveedor'}</strong>,</p>
                <p>Por medio del presente adjuntamos en formato PDF la <strong>Orden de ${orden.tipoOrden || 'Compra'} N° ${orden.id}</strong> aprobada para el proyecto <strong>${orden.proyecto?.nombre || '-'}</strong>.</p>
                ${userMessageHtml}
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin: 18px 0;">
                  <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                    <tr><td style="color: #64748b; padding: 4px 0; width: 35%;">Cliente:</td><td style="font-weight: 600;">${orden.cliente?.empresa || '-'}</td></tr>
                    <tr><td style="color: #64748b; padding: 4px 0;">Proyecto:</td><td style="font-weight: 600;">${orden.proyecto?.nombre || '-'}</td></tr>
                    <tr><td style="color: #64748b; padding: 4px 0;">Fecha Emisión:</td><td>${orden.fechaEmision || '-'}</td></tr>
                    <tr><td style="color: #64748b; padding: 4px 0;">Condición de Pago:</td><td>${orden.condicionesPago || '-'}</td></tr>
                    <tr style="border-top: 1px dashed #cbd5e1;"><td style="color: #1e293b; padding: 8px 0 4px; font-size: 14px;"><strong>Monto Total:</strong></td><td style="font-size: 16px; font-weight: bold; color: #059669; padding-top: 6px;"><strong>${formatSoles(orden.total)}</strong></td></tr>
                  </table>
                </div>
                <p style="font-size: 13px; color: #475569;">
                  Agradeceremos confirmar la recepción de este documento y coordinar las entregas/servicios según las condiciones y plazos acordados.
                </p>
                <p style="font-size: 12px; color: #64748b; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 14px;">
                  Atentamente,<br/>
                  <strong>Equipo de Administración y Operaciones</strong><br/>
                  Purple BTL
                </p>
              </div>
            </div>
          `;

          await sendEmail(provEmail, ordenSubject, htmlBody, attachments, emailCtx.smtp, ccEmails, emailCtx.httpsConfig);
          results.push({
            ordenId: orden.id,
            proveedor: orden.proveedor?.razonSocial,
            sentTo: provEmail,
            status: 'sent'
          });
        } catch (err: any) {
          console.error(`Error enviando orden ${orden.id}:`, err?.message || err);
          failedOrders.push({ ordenId: orden.id, error: err?.message || 'Error al enviar correo' });
        }
      }

      if (results.length === 0) {
        const firstErr = failedOrders[0]?.error || 'Error desconocido al enviar correos';
        return res.status(400).json({
          success: false,
          error: `No se pudo enviar ninguna orden: ${firstErr}`,
          mode: 'individual',
          count: 0,
          results,
          failedOrders
        });
      }

      return res.json({
        success: true,
        mode: 'individual',
        count: results.length,
        results,
        failedOrders
      });
    }
  } catch (error: any) {
    console.error('Error general en /api/ordenes/send-email:', error);
    res.status(500).json({ error: error.message || 'Error interno al procesar el envío de órdenes por correo' });
  } finally {
    // Limpieza segura de todos los archivos PDF temporales generados
    for (const p of generatedPdfs) {
      if (p && fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch (e) { }
      }
    }
  }
});

// --- FUNCIÓN ASÍNCRONA DE NOTIFICACIÓN DE PAGO POR CORREO (BACKGROUND) ---
function cleanItemDescription(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed.includes('>')) return trimmed;
  const parts = trimmed.split(/\s*>\s*/);
  return parts[parts.length - 1]?.trim() || trimmed;
}

function generateItemsTitle(items?: { name?: string | null; customDescription?: string | null }[]): string {
  if (!items || items.length === 0) return '';
  const names = items.map(it => cleanItemDescription(it.customDescription || it.name)).filter(Boolean);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  const remainder = names.length - 2;
  return `${names[0]}, ${names[1]} y ${remainder} ítem${remainder > 1 ? 's' : ''} más`;
}

const MIN_VALID_PDF_BYTES = 12000;

function isValidPdfBuffer(buf: Buffer | null | undefined): boolean {
  return Boolean(buf && buf.length >= MIN_VALID_PDF_BYTES && buf.subarray(0, 5).toString('ascii') === '%PDF-');
}

async function resolveDocumentPdfForEmail(params: {
  label: string;
  localPath: string | null;
  driveFileId?: string | null;
  printUrl: string;
  prefix: string;
  req: any;
}): Promise<{ buffer: Buffer | null; generatedPath: string | null; needsDriveUpdate: boolean }> {
  const { label, localPath, driveFileId, printUrl, prefix, req } = params;

  if (localPath && fs.existsSync(localPath)) {
    return { buffer: fs.readFileSync(localPath), generatedPath: null, needsDriveUpdate: false };
  }

  let driveWasInvalid = false;
  if (driveFileId) {
    try {
      const driveBuffer = await downloadBufferFromDrive(driveFileId);
      if (isValidPdfBuffer(driveBuffer)) {
        console.log(`[Email Notif] PDF de ${label} obtenido desde Drive (${driveFileId}, ${driveBuffer.length} bytes)`);
        return { buffer: driveBuffer, generatedPath: null, needsDriveUpdate: false };
      }
      driveWasInvalid = true;
      console.warn(`[Email Notif] PDF de ${label} en Drive (${driveFileId}) es inválido/incompleto (${driveBuffer?.length || 0} bytes); regenerando con Puppeteer.`);
    } catch (driveErr: any) {
      console.warn(`[Email Notif] No se pudo descargar PDF de ${label} desde Drive (${driveFileId}): ${driveErr?.message || driveErr}`);
    }
  }

  try {
    const genPath = await generatePdfFromUrl(printUrl, prefix, { apiOrigin: resolvePrintApiOrigin(req) });
    if (genPath && fs.existsSync(genPath)) {
      return {
        buffer: fs.readFileSync(genPath),
        generatedPath: genPath,
        needsDriveUpdate: !driveFileId || driveWasInvalid
      };
    }
  } catch (pdfErr: any) {
    console.error(`[Email Notif] Error generando PDF de ${label}:`, pdfErr?.message || pdfErr);
  }

  return { buffer: null, generatedPath: null, needsDriveUpdate: false };
}

async function sendPagoNotificationEmailDetailed(
  pagoId: string,
  req: any,
  options?: { existingPagoPdfPath?: string; skipPagoDriveUpload?: boolean }
): Promise<{ success: boolean; error?: string; transport?: string; sentTo?: string; attachments?: string[] }> {
  let oPdf: string | null = null;
  let pPdf: string | null =
    options?.existingPagoPdfPath && fs.existsSync(options.existingPagoPdfPath)
      ? options.existingPagoPdfPath
      : null;
  const ownsPagoPdf = !pPdf;

  try {
    const emailCtx = await resolveEmailContext(req?.user?.id);
    const config = emailCtx.config;
    if (!config?.habilitarNotificacionPagos) {
      console.log(`[Email Notif] Envío desactivado por el Administrador para el pago ${pagoId}`);
      return { success: false, error: 'El envío automático de notificaciones de pago está desactivado en Configuración.' };
    }

    const pago = await prisma.pago.findUnique({ where: { id: pagoId } });
    if (!pago) {
      console.warn(`[Email Notif] Pago ${pagoId} no encontrado en base de datos`);
      return { success: false, error: `Pago ${pagoId} no encontrado en la base de datos.` };
    }

    const [prov, cli, proy, ordenObj] = await Promise.all([
      pago.proveedorId ? prisma.proveedor.findUnique({ where: { id: pago.proveedorId }, include: { cuentas: true } }) : null,
      pago.clienteId ? prisma.cliente.findUnique({ where: { id: pago.clienteId } }) : null,
      pago.proyectoId ? prisma.proyecto.findUnique({ where: { id: pago.proyectoId } }) : null,
      pago.ordenId ? prisma.orden.findUnique({ where: { id: pago.ordenId }, include: { items: true } }) : null
    ]);

    const originUrl = req?.headers?.origin || (req?.headers?.referer ? new URL(req.headers.referer).origin : '');
    const baseUrl = originUrl || process.env.FRONTEND_URL || 'http://localhost:5173';

    const reqToken = req?.headers?.['authorization']?.split(' ')[1] || jwt.sign(
      { id: 'system', email: 'system@purplebtl.com', role: 'Admin' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // 1. Obtener PDFs secuencialmente priorizando artefacto en curso o respaldo válido en Drive para ahorrar RAM/tiempo en Render, y Puppeteer si falta o está incompleto
    const ordenDoc = pago.ordenId
      ? await resolveDocumentPdfForEmail({
          label: `Orden ${pago.ordenId}`,
          localPath: null,
          driveFileId: ordenObj?.driveFileId,
          printUrl: `${baseUrl}/?printOrden=${pago.ordenId}&token=${reqToken}`,
          prefix: 'orden',
          req
        })
      : { buffer: null, generatedPath: null, needsDriveUpdate: false };

    const pagoDoc = await resolveDocumentPdfForEmail({
      label: `Pago ${pago.id}`,
      localPath: pPdf,
      driveFileId: pago.driveFileId,
      printUrl: `${baseUrl}/?printPago=${pago.id}&token=${reqToken}`,
      prefix: 'pago',
      req
    });
    oPdf = ordenDoc.generatedPath;
    if (pagoDoc.generatedPath) pPdf = pagoDoc.generatedPath;

    const rawTitulo = (pago.concepto || ordenObj?.titulo || (ordenObj?.items ? generateItemsTitle(ordenObj.items) : '') || '').trim();

    const cuenta = prov?.cuentas?.[0];
    const vars: Record<string, any> = {
      '{{PAGO_ID}}': pago.id,
      '{{ORDEN_ID}}': pago.ordenId || '-',
      '{{PAGO_ESTADO}}': pago.estado || 'Pendiente',
      '{{PAGO_MONTO}}': Number(pago.monto || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }),
      '{{PROVEEDOR_NOMBRE}}': prov?.razonSocial || prov?.nombre || '',
      '{{PROVEEDOR_RUC}}': prov?.ruc || '',
      '{{FECHA_PAGO}}': pago.fechaPago || pago.fechaRegistro || '',
      '{{BANCO}}': cuenta?.banco || '-',
      '{{CUENTA_NUMERO}}': cuenta?.numeroCuenta || '-',
      '{{TIPO_CUENTA}}': cuenta?.tipoCuenta || '(No guardado en sistema)',
      '{{MONEDA}}': 'Soles',
      '{{CUENTA_CCI}}': cuenta?.cci || '-',
      '{{CLIENTE_NOMBRE}}': cli?.empresa || '-',
      '{{PROYECTO_NOMBRE}}': proy?.nombre || '-',
      '{{TITULO_PAGO}}': rawTitulo,
      '{{TITULO_ORDEN}}': ordenObj?.titulo?.trim() || rawTitulo,
      '{{TITULO}}': rawTitulo,
      '{{CONCEPTO}}': rawTitulo,
      '{{COMENTARIOS}}': pago.comentarios || pago.notas || '',
      '{{NOTAS}}': pago.notas || pago.comentarios || '',
      '{{COMPROBANTE}}': pago.numeroComprobante || 'POR REGULARIZAR',
      '{{NUMERO_COMPROBANTE}}': pago.numeroComprobante || 'POR REGULARIZAR',
      '{{TITULO_PAGO}': rawTitulo,
      '{{TITULO_ORDEN}': ordenObj?.titulo?.trim() || rawTitulo,
      '{{TITULO}': rawTitulo,
      '{{CONCEPTO}': rawTitulo,
      '{{COMPROBANTE}': pago.numeroComprobante || 'POR REGULARIZAR',
      '{{NUMERO_COMPROBANTE}': pago.numeroComprobante || 'POR REGULARIZAR'
    };

    const replaceEmailVars = (text: string) => {
      let res = Object.entries(vars).reduce((str, [k, v]) => str.split(k).join(String(v)), text);
      // Fallback regex to catch any variation of {{TITULO...}} or {{TITULO...}
      res = res.replace(/\{\{TITULO(_PAGO|_ORDEN)?\}?/gi, rawTitulo);
      return res;
    };

    const templateHtml = config.notificacionPagosTemplate || '<p>Se ha registrado un pago con ID {{PAGO_ID}} para el proveedor {{PROVEEDOR_NOMBRE}}.</p>';
    let finalHtml = replaceEmailVars(templateHtml);

    // Nombres de archivos dinámicos
    const tipoOrdenName = ordenObj?.tipoOrden === 'Servicio' ? 'OS' : 'OC';
    const proyName = proy?.nombre || 'Proyecto';
    const provName = prov?.razonSocial || prov?.nombre || 'Proveedor';

    const sanitizePdfAttachmentName = (raw: string) =>
      raw.replace(/[\/\\:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

    const ordenFileName = sanitizePdfAttachmentName(`${tipoOrdenName} ${pago.ordenId || ''} ${proyName} - ${provName}.pdf`);
    const pagoFileName = sanitizePdfAttachmentName(`Pago a proveedor ${pago.id} ${proyName} - ${provName}.pdf`);

    const attachments: any[] = [];
    if (ordenDoc.buffer && ordenDoc.buffer.length > 0) {
      attachments.push({ filename: ordenFileName, content: ordenDoc.buffer });
    }
    if (pagoDoc.buffer && pagoDoc.buffer.length > 0) {
      attachments.push({ filename: pagoFileName, content: pagoDoc.buffer });
    }

    // 2. Adjuntar factura / comprobante
    if (pago.comprobanteUrl && pago.comprobanteUrl.startsWith('http')) {
      finalHtml += `<br><br><p>Puede visualizar su comprobante en el siguiente enlace: <a href="${pago.comprobanteUrl}">Ver Comprobante</a></p>`;
      const fileIdMatch = pago.comprobanteUrl.match(/file\/d\/([a-zA-Z0-9_-]+)/);
      if (fileIdMatch && fileIdMatch[1]) {
        try {
          const buffer = await downloadBufferFromDrive(fileIdMatch[1]);
          const isPdf = buffer.length > 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
          const ext = isPdf ? '.pdf' : '.jpg';
          attachments.push({ filename: `Factura_Comprobante_${pago.numeroComprobante || pago.id}${ext}`, content: buffer });
        } catch (e: any) {
          console.error('[Email Notif] Error al descargar comprobante de Drive:', e?.message || e);
        }
      }
    } else if (pago.comprobanteUrl && !pago.comprobanteUrl.startsWith('http')) {
      const localPath = path.join(UPLOADS_DIR, path.basename(pago.comprobanteUrl));
      if (fs.existsSync(localPath)) {
        const ext = path.extname(localPath);
        attachments.push({ filename: `Factura_Comprobante_${pago.numeroComprobante || pago.id}${ext}`, content: fs.readFileSync(localPath) });
      }
    }

    // 3. Subir a Google Drive si se generó nuevo respaldo oficial o si faltaba/estaba incompleto
    try {
      if (oPdf && fs.existsSync(oPdf) && ordenDoc.needsDriveUpdate) {
        const ordenDriveRes = await uploadToProjectDriveFolder({
          projectId: proy?.id,
          clienteId: proy?.clienteId,
          clientName: cli?.empresa,
          projectName: proy?.nombre,
          area: 'Producción',
          subfolder: 'Órdenes de compra',
          fileName: ordenFileName,
          mimeType: 'application/pdf',
          filePath: oPdf,
          userEmail: resolveUserEmail(req),
          prisma,
          versioning: true,
          itemIdentifier: pago.ordenId || undefined,
          entityName: provName
        });
        if (ordenDriveRes?.webViewLink && pago.ordenId) {
          await prisma.orden.update({
            where: { id: pago.ordenId },
            data: { pdfUrl: ordenDriveRes.webViewLink, driveFileId: ordenDriveRes.id }
          }).catch(() => {});
        }
      }
      if (!options?.skipPagoDriveUpload && pPdf && fs.existsSync(pPdf) && pagoDoc.needsDriveUpdate) {
        const pagoDriveRes = await uploadToProjectDriveFolder({
          projectId: proy?.id,
          clienteId: proy?.clienteId,
          clientName: cli?.empresa,
          projectName: proy?.nombre,
          area: 'Producción',
          subfolder: 'Pago a proveedor',
          fileName: pagoFileName,
          mimeType: 'application/pdf',
          filePath: pPdf,
          userEmail: resolveUserEmail(req),
          prisma,
          versioning: true,
          itemIdentifier: pago.id,
          entityName: provName
        });
        if (pagoDriveRes?.webViewLink) {
          await prisma.pago.update({
            where: { id: pago.id },
            data: { pdfUrl: pagoDriveRes.webViewLink, driveFileId: pagoDriveRes.id }
          }).catch(() => {});
        }
      }
    } catch (e: any) {
      console.error('[Email Notif] Error subiendo PDFs a Drive:', e?.message || e);
    }

    // 4. Preparar destinatarios
    const recipientsSet = new Set<string>();
    if (config.notificacionPagosEmails) {
      config.notificacionPagosEmails.split(',').map((e: string) => e.trim()).filter(Boolean).forEach((e: string) => recipientsSet.add(e));
    }
    if ((config.notificarProveedorPago === true) && prov?.correo && prov.correo.trim()) {
      recipientsSet.add(prov.correo.trim());
    }
    if (req?.user?.email && req.user.email.includes('@purplebtl.com')) {
      recipientsSet.add(req.user.email.trim());
    }

    const toAddresses = Array.from(recipientsSet).join(', ');
    if (!toAddresses) {
      console.log(`[Email Notif] Sin destinatarios configurados para pago ${pagoId}`);
      recordPagoEmailStatus(pagoId, { ok: false, error: 'Sin destinatarios configurados en appConfig o proveedor.' });
      return { success: false, error: 'Sin destinatarios configurados en Configuración > Correos.' };
    }

    const subjectTemplate = config.notificacionPagosSubject || 'Pago a proveedor {{PAGO_ID}}';
    const emailSubject = replaceEmailVars(subjectTemplate);

    const sendRes = await sendEmail(
      toAddresses,
      emailSubject,
      finalHtml,
      attachments,
      emailCtx.smtp,
      undefined,
      emailCtx.httpsConfig
    );

    const attachmentNames = attachments.map(a => a.filename);
    console.log(`[Email Notif] ✅ Correo enviado (${sendRes.transport}) a [${toAddresses}] para pago ${pagoId} con ${attachmentNames.length} adjunto(s): ${attachmentNames.join(', ')}`);
    recordPagoEmailStatus(pagoId, { ok: true, transport: sendRes.transport, sentTo: toAddresses, attachments: attachmentNames });
    return { success: true, transport: sendRes.transport, sentTo: toAddresses, attachments: attachmentNames };
  } catch (err: any) {
    const errMsg = err?.message || 'Error desconocido al enviar correo';
    console.error(`[Email Notif] ❌ Fallo controlado al enviar notificación de pago (${pagoId}):`, errMsg);
    recordPagoEmailStatus(pagoId, { ok: false, error: errMsg });
    return { success: false, error: errMsg };
  } finally {
    if (oPdf && fs.existsSync(oPdf)) {
      try { fs.unlinkSync(oPdf); } catch (e) { }
    }
    if (ownsPagoPdf && pPdf && fs.existsSync(pPdf)) {
      try { fs.unlinkSync(pPdf); } catch (e) { }
    }
  }
}

async function triggerPagoNotificationEmail(
  pagoId: string,
  req: any,
  options?: { existingPagoPdfPath?: string; skipPagoDriveUpload?: boolean }
): Promise<boolean> {
  const res = await sendPagoNotificationEmailDetailed(pagoId, req, options);
  return res.success;
}

/**
 * Encola en segundo plano la regeneración del PDF oficial del pago, su respaldo
 * en Google Drive y el envío de la notificación con la OC/OS adjunta.
 * Se usa tanto al registrar un pago como al confirmarlo (estado -> Pagado).
 */
function queuePagoNotificationEmail(pagoId: string, req: any, options?: { closeBrowser?: boolean }) {
  setImmediate(async () => {
    let artifact: { driveResult: any; pdfPath: string | null } = { driveResult: null, pdfPath: null };
    try {
      artifact = await uploadPagoPdfToDriveWithArtifact(pagoId, req, { keepTempFile: true });
    } catch (dErr: any) {
      console.error(`[Google Drive] Error al subir PDF de pago ${pagoId} en segundo plano:`, dErr?.message || dErr);
    }
    try {
      await triggerPagoNotificationEmail(pagoId, req, {
        existingPagoPdfPath: artifact.pdfPath || undefined,
        skipPagoDriveUpload: Boolean(artifact.driveResult?.webViewLink)
      });
    } catch (err: any) {
      console.error(`[Email Notif] Error en segundo plano al notificar pago ${pagoId}:`, err?.message || err);
    } finally {
      if (artifact.pdfPath && fs.existsSync(artifact.pdfPath)) {
        try { fs.unlinkSync(artifact.pdfPath); } catch {}
      }
      if (options?.closeBrowser) {
        await closePdfBrowser();
      }
    }
  });
}

// --- PAGOS ---
app.get('/api/pagos', authenticateToken, async (req, res) => res.json(await prisma.pago.findMany())); app.post('/api/pagos', authenticateToken, upload.single('comprobanteFile'), async (req: any, res) => {
  try {
    const data = JSON.parse(req.body.data || '{}');
    const { clienteNombre, proyectoNombre, proveedorNombre, ...dbFields } = data;

    const ordObj = dbFields.ordenId
      ? await prisma.orden.findUnique({ where: { id: dbFields.ordenId }, include: { items: true } })
      : null;
    const resolvedProveedorId = dbFields.proveedorId || ordObj?.proveedorId;
    const prv = resolvedProveedorId
      ? await prisma.proveedor.findUnique({ where: { id: resolvedProveedorId } })
      : null;

    const pagoMonto = Number(dbFields.monto) || 0;
    const detrCheck = validateAndNormalizeDetraccion({
      aplicaDetraccion: dbFields.aplicaDetraccion,
      porcentajeDetraccion: dbFields.porcentajeDetraccion,
      montoDetraccion: dbFields.montoDetraccion,
      baseAmount: pagoMonto,
      isServicio: ordObj ? (ordObj.tipoOrden === 'Servicio' || ordObj.id.startsWith('OS-')) : true,
      proveedorTipoDocumento: prv?.tipoDocumento,
      proveedorRazonSocial: prv?.razonSocial,
      clampNetoZero: true
    });
    if ('error' in detrCheck) {
      return res.status(400).json({ error: detrCheck.error });
    }

    let url = data.comprobanteUrl;
    if (req.file) {
      try {
        const driveResult = await uploadToProjectDriveFolder({
          projectId: dbFields.proyectoId || data.proyectoId,
          clienteId: dbFields.clienteId || data.clienteId,
          clientName: clienteNombre,
          projectName: proyectoNombre,
          area: 'Producción',
          subfolder: 'Pago a proveedor',
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          buffer: req.file.buffer,
          userEmail: resolveUserEmail(req),
          prisma
        });
        url = driveResult.webViewLink || url;
      } catch (e: any) {
        console.error("Error subiendo comprobante de pago a Drive:", e);
        const safeName = `pago_${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const filePath = path.join(UPLOADS_DIR, safeName);
        fs.writeFileSync(filePath, req.file.buffer);
        if (!url) url = `/uploads/${safeName}`;
      }
    }
    let conceptoVal = (data.concepto || dbFields.concepto || '').trim();
    if (!conceptoVal && ordObj) {
      conceptoVal = ordObj.titulo || generateItemsTitle(ordObj.items) || '';
    }
    const comentariosVal = (data.comentarios || dbFields.comentarios || data.notas || dbFields.notas || '').trim() || null;
    const result = await prisma.pago.create({
      data: {
        ...dbFields,
        aplicaDetraccion: detrCheck.aplicaDetraccion,
        porcentajeDetraccion: detrCheck.porcentajeDetraccion,
        montoDetraccion: detrCheck.montoDetraccion,
        montoNeto: detrCheck.aplicaDetraccion && dbFields.montoNeto !== undefined
          ? Number(dbFields.montoNeto)
          : detrCheck.montoNeto,
        comprobanteUrl: url,
        concepto: conceptoVal,
        comentarios: comentariosVal,
        notas: comentariosVal
      }
    });
    const preflightCtx = await resolveEmailContext(req.user?.id);
    const emailWarning = preflightPaymentEmailWarning(preflightCtx);

    res.json(emailWarning ? { ...result, emailWarning } : result);

    // Subir PDF oficial a Google Drive y enviar notificación de correo en segundo plano (sin duplicar PDF de pago)
    queuePagoNotificationEmail(result.id, req, { closeBrowser: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// --- REGISTRO MASIVO DE PAGOS A PROVEEDORES (BATCH) ---
app.post('/api/pagos/batch', authenticateToken, async (req: any, res) => {
  try {
    const { pagos: pagosList } = req.body;
    if (!Array.isArray(pagosList) || pagosList.length === 0) {
      return res.status(400).json({ error: 'La lista de pagos a generar está vacía.' });
    }

    const createdPagos: any[] = [];
    const year = new Date().getFullYear();

    // Pre-validar todo el lote antes de persistir
    const preparedItems: Array<{
      dbFields: any;
      p: any;
      ordObj: any;
      clienteId: any;
      proyectoId: any;
      quoteId: any;
      proveedorId: any;
      detrCheck: { aplicaDetraccion: boolean; porcentajeDetraccion: number; montoDetraccion: number; montoNeto: number };
    }> = [];

    for (const p of pagosList) {
      const { clienteNombre, proyectoNombre, proveedorNombre, ...dbFields } = p;
      let quoteId = dbFields.quoteId;
      let clienteId = dbFields.clienteId;
      let proveedorId = dbFields.proveedorId;
      let proyectoId = dbFields.proyectoId;

      let ordObj: any = null;
      if (dbFields.ordenId) {
        ordObj = await prisma.orden.findUnique({ where: { id: dbFields.ordenId }, include: { items: true } });
        if (ordObj) {
          quoteId = quoteId || ordObj.quoteId;
          clienteId = clienteId || ordObj.clienteId;
          proveedorId = proveedorId || ordObj.proveedorId;
          proyectoId = proyectoId || ordObj.proyectoId;
        }
      }

      const prv = proveedorId ? await prisma.proveedor.findUnique({ where: { id: proveedorId } }) : null;
      const pagoMonto = Number(dbFields.monto || 0);
      const detrCheck = validateAndNormalizeDetraccion({
        aplicaDetraccion: dbFields.aplicaDetraccion,
        porcentajeDetraccion: dbFields.porcentajeDetraccion,
        montoDetraccion: dbFields.montoDetraccion,
        baseAmount: pagoMonto,
        isServicio: ordObj ? (ordObj.tipoOrden === 'Servicio' || ordObj.id.startsWith('OS-')) : true,
        proveedorTipoDocumento: prv?.tipoDocumento,
        proveedorRazonSocial: prv?.razonSocial,
        clampNetoZero: true
      });
      if ('error' in detrCheck) {
        return res.status(400).json({ error: detrCheck.error });
      }

      preparedItems.push({ dbFields, p, ordObj, clienteId, proyectoId, quoteId, proveedorId, detrCheck });
    }

    for (const item of preparedItems) {
      const { dbFields, p, ordObj, clienteId, proyectoId, quoteId, proveedorId, detrCheck } = item;
      const pagoId = dbFields.id || `PAG-${year}-${Math.floor(1000 + Math.random() * 9000)}`;

      let conceptoVal = (p.concepto || dbFields.concepto || '').trim();
      if (!conceptoVal && ordObj) {
        conceptoVal = ordObj.titulo || generateItemsTitle(ordObj.items) || '';
      }

      const comentariosVal = (p.comentarios || dbFields.comentarios || p.notas || dbFields.notas || '').trim() || null;
      const newPago = await prisma.pago.create({
        data: {
          ...dbFields,
          id: pagoId,
          clienteId,
          proyectoId,
          quoteId,
          proveedorId,
          ordenId: dbFields.ordenId,
          concepto: conceptoVal,
          comentarios: comentariosVal,
          notas: comentariosVal,
          monto: Number(dbFields.monto || 0),
          aplicaDetraccion: detrCheck.aplicaDetraccion,
          porcentajeDetraccion: detrCheck.porcentajeDetraccion,
          montoDetraccion: detrCheck.montoDetraccion,
          montoNeto: detrCheck.aplicaDetraccion && dbFields.montoNeto !== undefined
            ? Number(dbFields.montoNeto)
            : detrCheck.montoNeto,
          estado: dbFields.estado || 'Pendiente',
          fechaRegistro: dbFields.fechaRegistro || new Date().toISOString().split('T')[0]
        }
      });
      createdPagos.push(newPago);
    }

    // Responder de inmediato al frontend para fluidez de la UI
    const preflightCtx = await resolveEmailContext(req.user?.id);
    const emailWarning = preflightPaymentEmailWarning(preflightCtx);

    res.json({
      success: true,
      count: createdPagos.length,
      data: createdPagos,
      ...(emailWarning ? { emailWarning } : {})
    });

    // Enviar notificaciones de correo y subir PDFs a Drive 1 por 1 en segundo plano (sin duplicar PDFs)
    setImmediate(async () => {
      try {
        for (const created of createdPagos) {
          let artifact: { driveResult: any; pdfPath: string | null } = { driveResult: null, pdfPath: null };
          try {
            artifact = await uploadPagoPdfToDriveWithArtifact(created.id, req, { keepTempFile: true });
          } catch (dErr: any) {
            console.error(`[Google Drive] Error al subir PDF en lote para pago ${created.id}:`, dErr?.message || dErr);
          }
          try {
            await triggerPagoNotificationEmail(created.id, req, {
              existingPagoPdfPath: artifact.pdfPath || undefined,
              skipPagoDriveUpload: Boolean(artifact.driveResult?.webViewLink)
            });
          } catch (err: any) {
            console.error(`[Email Notif] Error enviando correo individual en lote para pago ${created.id}:`, err?.message || err);
          } finally {
            if (artifact.pdfPath && fs.existsSync(artifact.pdfPath)) {
              try { fs.unlinkSync(artifact.pdfPath); } catch {}
            }
          }
        }
      } finally {
        await closePdfBrowser();
      }
    });
  } catch (error: any) {
    console.error('Error en /api/pagos/batch:', error);
    res.status(500).json({ error: error.message || 'Error al crear pagos en lote' });
  }
});

// --- ANALIZAR COMPROBANTE CON IA (OCR & VALIDACIÓN SUNAT) ---
app.post('/api/pagos/analyze-comprobante', authenticateToken, upload.any(), async (req: any, res) => {
  try {
    const file = (req.files && req.files[0]) || req.file;
    if (!file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo de comprobante' });
    }

    let mimeType = file.mimetype || '';
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!mimeType || mimeType === 'application/octet-stream') {
      if (ext === '.pdf') mimeType = 'application/pdf';
      else if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.webp') mimeType = 'image/webp';
    }

    const isPdf = mimeType === 'application/pdf' || ext === '.pdf';
    const isImage = mimeType.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);

    if (!isPdf && !isImage) {
      return res.status(400).json({
        error: 'Formato no soportado. Por favor suba un archivo PDF o una imagen (JPG, PNG, WebP).'
      });
    }

    const actualMime = isPdf ? 'application/pdf' : (mimeType.startsWith('image/') ? mimeType : 'image/jpeg');
    const base64Data = file.buffer.toString('base64');

    const prompt = `Eres un asistente contable y tributario experto en comprobantes de pago peruanos emitidos bajo normativa SUNAT (Facturas Electrónicas, Recibos por Honorarios Electrónicos, Boletas de Venta, Notas de Crédito).
Analiza detalladamente este documento tributario y extrae la información requerida con máxima precisión.

REGLAS CRÍTICAS:
1. IDENTIFICACIÓN DEL EMISOR (PROVEEDOR):
   - En una Factura o Recibo por Honorarios, el EMISOR es la empresa o persona que emite el documento, presta el servicio o vende el bien.
   - El RUC del EMISOR consta de 11 dígitos numéricos (comienza con 10 o 20) y se ubica generalmente en el recuadro superior principal (arriba a la derecha o izquierda) donde se indica "R.U.C. N° [11 dígitos]" y el tipo de comprobante.
   - NO CONFUNDIR con el RUC del CLIENTE / ADQUIRIENTE / RECEPTOR (la persona o empresa a quien se le factura).
   - Extrae también la Razón Social o Nombres y Apellidos del emisor.

2. NÚMERO DE COMPROBANTE:
   - Formato habitual: SERIE-CORRELATIVO (ej: F001-000456, E001-48, E001-12, B001-789, 001-000456).
   - Extrae la serie y el número correlativo completo sin omitir ceros iniciales ni guiones.

3. TIPO DE COMPROBANTE:
   - Clasifícalo como: "Factura", "Recibo por Honorarios", "Boleta de Venta", "Nota de Crédito" u "Otro".

4. IMPORTES:
   - "moneda": "PEN" para Soles (S/) o "USD" para Dólares ($).
   - "montoTotal": Importe total del comprobante (número flotante).
   - "montoSubtotal": Subtotal o total honorarios si aplica (número flotante o 0).
   - "igv": Monto del IGV (18%) si aplica (número flotante o 0).
   - "retencion": Monto de retención si aplica (ej: 8% de cuarta categoría en Recibo por Honorarios o retención del IGV, número flotante o 0).
   - "montoNeto": En Recibos por Honorarios con retención, es el "Total Neto Recibido" o líquido a percibir. Si no hay retención, igual a montoTotal.
   - "montoSugerido": El importe líquido neto a pagar al proveedor (si hay retención el montoNeto, sino el montoTotal).

5. FECHA Y DESCRIPCIÓN:
   - "fechaEmision": Fecha de emisión (formato YYYY-MM-DD si es identificable, o el texto de la fecha tal como aparece).
   - "descripcion": Breve resumen de los conceptos o ítems facturados (máximo 120 caracteres).

Devuelve ÚNICAMENTE un JSON con esta estructura exacta (sin markdown, sin explicaciones):
{
  "rucEmisor": "11 dígitos o null",
  "razonSocialEmisor": "Razón social del emisor o null",
  "tipoComprobante": "Factura | Recibo por Honorarios | Boleta de Venta | Otro",
  "numeroComprobante": "Serie y correlativo o null",
  "fechaEmision": "YYYY-MM-DD o null",
  "moneda": "PEN | USD",
  "montoTotal": 0.00,
  "montoSubtotal": 0.00,
  "igv": 0.00,
  "retencion": 0.00,
  "montoNeto": 0.00,
  "montoSugerido": 0.00,
  "descripcion": "..."
}`;

    let responseText: string | null = null;

    if (!isValidGeminiKeyConfigured()) {
      console.warn('[Gemini] GEMINI_API_KEY no configurada o inválida. Se omite análisis de IA.');
    } else {
      try {
        responseText = await generateTextWithGeminiFallback({
          logLabel: 'analyze-comprobante',
          timeoutMs: 20000,
          contents: [
            {
              inlineData: {
                mimeType: actualMime,
                data: base64Data
              }
            },
            prompt
          ],
          config: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        });
      } catch {
        // Fallback silencioso a parser de archivo / respuesta parcial si todos los modelos fallan
      }
    }

    let extracted: any = {};
    if (responseText) {
      try {
        let cleanJson = responseText.trim();
        if (cleanJson.startsWith('```')) {
          cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        }
        extracted = JSON.parse(cleanJson);
      } catch (parseErr) {
        console.warn('No se pudo parsear el JSON de la IA en analyze-comprobante:', parseErr);
      }
    }

    // Normalizar RUC
    const rawRuc = extracted.rucEmisor ? String(extracted.rucEmisor).replace(/\D/g, '') : '';
    extracted.rucEmisor = rawRuc || extracted.rucEmisor || null;

    // Comparar con proveedor suministrado en el request
    const reqProvRuc = (req.body.proveedorRuc || '').toString().replace(/\D/g, '');
    let rucMatch: boolean | null = null;
    if (reqProvRuc && rawRuc) {
      rucMatch = reqProvRuc === rawRuc;
    }

    // Buscar si existe en la base de datos de proveedores
    let proveedorDetectado: any = null;
    if (rawRuc && rawRuc.length >= 8) {
      proveedorDetectado = await prisma.proveedor.findFirst({
        where: {
          ruc: {
            contains: rawRuc
          }
        },
        select: { id: true, razonSocial: true, ruc: true }
      });
    }

    // Normalizar montos numéricos
    const montoTotal = Math.round((Number(extracted.montoTotal) || 0) * 100) / 100;
    const montoNeto = Math.round((Number(extracted.montoNeto) || montoTotal) * 100) / 100;
    const retencion = Math.round((Number(extracted.retencion) || 0) * 100) / 100;
    const montoSugerido = Math.round((Number(extracted.montoSugerido) || (retencion > 0 ? montoNeto : montoTotal)) * 100) / 100;

    // Guardar comprobante en Drive o localmente para tener comprobanteUrl listo
    let fileUrl = '';
    const projectId = req.body.projectId || req.body.proyectoId;
    const clienteId = req.body.clienteId;
    const clientName = req.body.clientName || req.body.clienteNombre;
    const projectName = req.body.projectName || req.body.proyectoNombre;

    try {
      if (projectId || clienteId) {
        const driveResult = await uploadToProjectDriveFolder({
          projectId,
          clienteId,
          clientName,
          projectName,
          area: 'Producción',
          subfolder: 'Pago a proveedor',
          fileName: file.originalname,
          mimeType: actualMime,
          buffer: file.buffer,
          userEmail: resolveUserEmail(req),
          prisma
        });
        fileUrl = driveResult.webViewLink || '';
      }
    } catch (e: any) {
      console.error('Error subiendo comprobante en analyze-comprobante a Drive:', e.message);
    }

    if (!fileUrl) {
      const safeName = 'comprobante_' + Date.now() + '_' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = path.join(UPLOADS_DIR, safeName);
      fs.writeFileSync(filePath, file.buffer);
      fileUrl = '/uploads/' + safeName;
    }

    res.json({
      success: true,
      warning: responseText ? undefined : 'No se pudo procesar con IA automáticamente, pero el archivo se adjuntó correctamente.',
      data: {
        ...extracted,
        montoTotal,
        montoNeto,
        retencion,
        montoSugerido,
        rucMatch,
        proveedorDetectado,
        comprobanteUrl: fileUrl,
        fileName: file.originalname
      }
    });
  } catch (error: any) {
    console.error('Error en /api/pagos/analyze-comprobante:', error);
    res.status(500).json({ error: error.message || 'Error al analizar comprobante' });
  }
});

// --- GENERIC UPLOAD (GOOGLE DRIVE O LOCAL FALLBACK) ---
app.post('/api/drive/upload', authenticateToken, upload.single('file'), async (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });

    // Si viene desde DriveView con folderId específico
    const folderId = req.body.folderId || req.body.parentFolderId;
    const userEmail = resolveUserEmail(req);

    if (folderId) {
      try {
        const item = await uploadFileToDrive(userEmail, {
          name: req.file.originalname,
          mimeType: req.file.mimetype,
          buffer: req.file.buffer,
          parentFolderId: folderId,
          driveId: req.body.driveId || undefined
        });
        return res.json({ success: true, file: item, ...item });
      } catch (e: any) {
        console.error("Error subiendo a carpeta específica en Drive:", e);
      }
    }

    // Si viene vinculado a un proyecto o proveedor
    const projectId = req.body.projectId || req.body.proyectoId;
    const clienteId = req.body.clienteId;
    const clientName = req.body.clientName || req.body.clienteNombre;
    const projectName = req.body.projectName || req.body.proyectoNombre;
    const area = req.body.area || 'Producción';
    const subfolder = req.body.subfolder || 'Pago a proveedor';

    const proveedorId = req.body.proveedorId;
    const proveedorNombre = req.body.proveedorNombre;

    let url = '';
    try {
      if (proveedorNombre) {
        // Upload to Proveedor Folder
        const folderRes = await getOrCreateProviderDriveFolder({
          providerName: proveedorNombre,
          userEmail
        });
        const driveResult = await uploadFileToDrive(userEmail, {
          name: req.file.originalname,
          mimeType: req.file.mimetype,
          buffer: req.file.buffer,
          parentFolderId: folderRes.folderId
        });
        url = driveResult.webViewLink || '';

        // Si hay proveedorId, actualizar si no tenía folder
        if (proveedorId && folderRes.folderId) {
          try {
            await prisma.proveedor.update({
              where: { id: proveedorId, driveFolderId: null },
              data: { driveFolderId: folderRes.folderId, driveFolderUrl: folderRes.webViewLink }
            });
          } catch (e) { }
        }

        if (url) {
          return res.json({
            webViewLink: url,
            webContentLink: driveResult.webContentLink || url,
            url,
            id: driveResult.id,
            folderId: folderRes.folderId
          });
        }
      } else {
        // Upload to Project Folder
        const driveResult = await uploadToProjectDriveFolder({
          projectId,
          clienteId,
          clientName,
          projectName,
          area,
          subfolder,
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          buffer: req.file.buffer,
          userEmail,
          prisma
        });
        url = driveResult.webViewLink || '';
        if (url) {
          return res.json({
            webViewLink: url,
            webContentLink: driveResult.webContentLink || url,
            url,
            id: driveResult.id,
            folderId: driveResult.folderId
          });
        }
      }
    } catch (e: any) {
      console.error("Error subiendo a Google Drive vía uploadToProjectDriveFolder:", e);
    }

    // Fallback local si Google Drive no está disponible o falla
    if (!url) {
      const safeName = `${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const filePath = path.join(UPLOADS_DIR, safeName);
      fs.writeFileSync(filePath, req.file.buffer);
      url = `/uploads/${safeName}`;
    }
    res.json({ webViewLink: url, webContentLink: url, url });
  } catch (err: any) {
    console.error("Error en /api/drive/upload:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/pagos/:id', authenticateToken, upload.single('comprobanteFile'), async (req: any, res) => {
  try {
    let data: any = {};
    if (req.body.data) {
      data = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;
    } else {
      data = req.body || {};
    }

    const { clienteNombre, proyectoNombre, proveedorNombre, id, createdAt, updatedAt, ...dbFields } = data;
    delete (dbFields as any).cliente;
    delete (dbFields as any).proyecto;
    delete (dbFields as any).proveedor;
    delete (dbFields as any).quote;
    delete (dbFields as any).orden;

    let url = dbFields.comprobanteDeposito;
    if (req.file) {
      try {
        const driveResult = await uploadToProjectDriveFolder({
          projectId: dbFields.proyectoId || data.proyectoId,
          clienteId: dbFields.clienteId || data.clienteId,
          clientName: clienteNombre,
          projectName: proyectoNombre,
          area: 'Producción',
          subfolder: 'Pago a proveedor',
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          buffer: req.file.buffer,
          userEmail: resolveUserEmail(req),
          prisma
        });
        url = driveResult.webViewLink || url;
      } catch (e: any) {
        console.error("Error subiendo comprobante a Drive:", e);
      }
      if (!url) {
        const prefix = (data.targetField === 'comprobanteUrl' || req.body?.targetField === 'comprobanteUrl' || data.isRegularizacion) ? 'comprobante' : 'deposito';
        const safeName = `${prefix}_${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const filePath = path.join(UPLOADS_DIR, safeName);
        fs.writeFileSync(filePath, req.file.buffer);
        url = `/uploads/${safeName}`;
      }
    }

    const allowedFields = [
      'clienteId', 'proyectoId', 'quoteId', 'ordenId', 'proveedorId',
      'tipoPago', 'monto', 'numeroComprobante', 'comprobanteUrl',
      'comprobanteDeposito', 'fechaRegistro', 'fechaPago', 'estado',
      'concepto', 'comentarios', 'notas',
      'aplicaDetraccion', 'porcentajeDetraccion', 'montoDetraccion', 'montoNeto'
    ];
    const updateData: any = {};
    for (const key of allowedFields) {
      if (key in dbFields && dbFields[key] !== undefined) {
        if (key === 'monto' || key === 'porcentajeDetraccion' || key === 'montoDetraccion' || key === 'montoNeto') {
          updateData[key] = Number(dbFields[key]) || 0;
        } else if (key === 'aplicaDetraccion') {
          updateData[key] = Boolean(dbFields[key]);
        } else {
          updateData[key] = dbFields[key];
        }
      }
    }
    if (updateData.comentarios !== undefined && updateData.notas === undefined) {
      updateData.notas = updateData.comentarios;
    }
    if (updateData.notas !== undefined && updateData.comentarios === undefined) {
      updateData.comentarios = updateData.notas;
    }
    if (url) {
      const isFacturaComprobante =
        data.targetField === 'comprobanteUrl' ||
        req.body?.targetField === 'comprobanteUrl' ||
        data.tipoArchivo === 'factura' ||
        req.body?.tipoArchivo === 'factura' ||
        data.isRegularizacion === true ||
        req.body?.isRegularizacion === 'true';

      if (isFacturaComprobante) {
        updateData.comprobanteUrl = url;
      } else {
        updateData.comprobanteDeposito = url;
      }
    }

    const existingPago = await prisma.pago.findUnique({ where: { id: req.params.id } });
    if (!existingPago) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }
    const targetOrdenId = updateData.ordenId !== undefined ? updateData.ordenId : existingPago.ordenId;
    const ordObj = targetOrdenId ? await prisma.orden.findUnique({ where: { id: targetOrdenId } }) : null;
    const targetProveedorId = updateData.proveedorId ?? existingPago.proveedorId ?? ordObj?.proveedorId;
    const prv = targetProveedorId ? await prisma.proveedor.findUnique({ where: { id: targetProveedorId } }) : null;
    const targetIsRxH = isReciboPorHonorariosDoc(prv?.tipoDocumento);

    if (Boolean(updateData.aplicaDetraccion) && targetIsRxH) {
      return res.status(400).json({
        error: `Detracción SPOT no permitida: El proveedor '${prv?.razonSocial || 'Recibo por Honorarios'}' emite Recibo por Honorarios (4ta Categoría) y no está sujeto a detracción.`
      });
    }

    const targetMonto = updateData.monto !== undefined ? Number(updateData.monto) : Number(existingPago.monto);
    if (
      targetIsRxH ||
      updateData.aplicaDetraccion !== undefined ||
      updateData.porcentajeDetraccion !== undefined ||
      updateData.montoDetraccion !== undefined ||
      updateData.proveedorId !== undefined ||
      updateData.ordenId !== undefined
    ) {
      const candidateAplica =
        updateData.aplicaDetraccion !== undefined ? updateData.aplicaDetraccion : existingPago.aplicaDetraccion;
      const candidatePct =
        updateData.porcentajeDetraccion !== undefined ? updateData.porcentajeDetraccion : existingPago.porcentajeDetraccion;
      const candidateMontoDetr =
        updateData.montoDetraccion !== undefined ? updateData.montoDetraccion : existingPago.montoDetraccion;

      const detrCheck = validateAndNormalizeDetraccion({
        aplicaDetraccion: targetIsRxH ? false : candidateAplica,
        porcentajeDetraccion: candidatePct,
        montoDetraccion: candidateMontoDetr,
        baseAmount: targetMonto,
        isServicio: ordObj ? (ordObj.tipoOrden === 'Servicio' || ordObj.id.startsWith('OS-')) : true,
        proveedorTipoDocumento: prv?.tipoDocumento,
        proveedorRazonSocial: prv?.razonSocial,
        clampNetoZero: true
      });
      if ('error' in detrCheck) {
        return res.status(400).json({ error: detrCheck.error });
      }
      updateData.aplicaDetraccion = detrCheck.aplicaDetraccion;
      updateData.porcentajeDetraccion = detrCheck.porcentajeDetraccion;
      updateData.montoDetraccion = detrCheck.montoDetraccion;
      if (!detrCheck.aplicaDetraccion) {
        updateData.montoNeto = targetMonto;
      } else if (updateData.montoNeto === undefined && existingPago.montoNeto == null) {
        updateData.montoNeto = detrCheck.montoNeto;
      }
    }

    const result = await prisma.pago.update({ where: { id: req.params.id }, data: updateData });
    const justMarkedAsPaid = existingPago.estado !== 'Pagado' && result.estado === 'Pagado';
    res.json(result);

    if (justMarkedAsPaid) {
      // Al confirmar el pago se regenera el PDF y se envía la notificación con la OC/OS adjunta
      queuePagoNotificationEmail(result.id, req, { closeBrowser: true });
    } else {
      // Re-generar y subir nueva versión del PDF de pago a Google Drive en segundo plano (desglose por versiones)
      setImmediate(() => {
        uploadPagoPdfToDrive(result.id, req).catch(err => {
          console.error('[Google Drive] Error actualizando PDF de pago en segundo plano:', err?.message || err);
        });
      });
    }
  } catch (error: any) {
    console.error("Error en PUT /api/pagos/:id:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/pagos/:id', authenticateToken, async (req, res) => {
  try {
    await prisma.pago.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// --- GANTTS ---
app.delete('/api/gantts/:id', authenticateToken, async (req, res) => {
  try {
    await prisma.projectGantt.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// --- ENDPOINTS IMPRESIÓN ---
const PRINT_SAFE_CONFIG_SELECT = {
  id: true,
  headerHtml: true,
  footerHtml: true,
  ordenHeaderHtml: true,
  ordenFooterHtml: true,
  pagoHeaderHtml: true,
  pagoFooterHtml: true,
  listasDinamicas: true
};

app.get('/api/print/orden/:id', authenticateToken, async (req, res) => {
  const o = await prisma.orden.findUnique({ where: { id: req.params.id }, include: { items: true } });
  const [prov, cli, proy, cfg] = await Promise.all([
    prisma.proveedor.findUnique({ where: { id: o?.proveedorId }, include: { cuentas: true } }),
    prisma.cliente.findUnique({ where: { id: o?.clienteId } }),
    prisma.proyecto.findUnique({ where: { id: o?.proyectoId } }),
    prisma.appConfig.findUnique({ where: { id: 'global' }, select: PRINT_SAFE_CONFIG_SELECT })
  ]);
  res.json({ orden: o, proveedor: prov, cliente: cli, proyecto: proy, config: cfg });
});

app.get('/api/print/pago/:id', authenticateToken, async (req, res) => {
  const p = await prisma.pago.findUnique({ where: { id: req.params.id } });
  const [o, prov, cli, proy, cfg] = await Promise.all([
    prisma.orden.findUnique({ where: { id: p?.ordenId }, include: { items: true } }),
    prisma.proveedor.findUnique({ where: { id: p?.proveedorId }, include: { cuentas: true } }),
    prisma.cliente.findUnique({ where: { id: p?.clienteId } }),
    prisma.proyecto.findUnique({ where: { id: p?.proyectoId } }),
    prisma.appConfig.findUnique({ where: { id: 'global' }, select: PRINT_SAFE_CONFIG_SELECT })
  ]);
  res.json({ pago: p, orden: o, proveedor: prov, cliente: cli, proyecto: proy, config: cfg });
});

// --- EMAIL ---
app.get('/api/email/diagnose', authenticateToken, async (req: any, res: any) => {
  try {
    const emailCtx = await resolveEmailContext(req.user?.id);
    const [emailDiag, pdfEngine] = await Promise.all([
      diagnoseEmailConnectivity(emailCtx.smtp, emailCtx.httpsConfig),
      checkPdfEngineHealth()
    ]);

    let recommendation = '';
    if (!emailDiag.canSendEmail) {
      if (emailDiag.smtpBlockedByHosting) {
        recommendation = 'Este servidor bloquea los puertos SMTP 587/465 (limitación del plan gratuito de Render). Configura Google Apps Script Webhook (gratis con tu Gmail) o Brevo API en la pestaña Correos, o actualiza a Render Starter ($7/mes).';
      } else if (!emailDiag.hasSmtpCredentials) {
        recommendation = 'No hay credenciales SMTP configuradas ni canal HTTPS activo.';
      } else {
        recommendation = `El puerto SMTP abre pero Gmail rechazó el acceso (${emailDiag.smtpVerifyError}). Verifica el App Password de Google.`;
      }
    } else if (emailDiag.smtpBlockedByHosting && emailDiag.httpsRelay.configured) {
      recommendation = `SMTP está bloqueado por el hosting, pero el envío vía HTTPS está listo (${emailDiag.httpsRelay.providers.join(', ')}).`;
    } else {
      recommendation = 'Conexión operativa para envío de correos.';
    }

    res.json({
      ...emailDiag,
      pdfEngine,
      recommendation
    });
  } catch (error: any) {
    console.error('Error en /api/email/diagnose:', error);
    res.status(500).json({ error: error.message || 'Error diagnosticando conexión de correo' });
  }
});

app.get('/api/pagos/email-statuses', authenticateToken, (req: any, res: any) => {
  res.json(Object.fromEntries(recentPagoEmailStatus));
});

app.post('/api/email/test', authenticateToken, async (req: any, res: any) => {
  try {
    const { to } = req.body;
    const emailCtx = await resolveEmailContext(req.user?.id);
    const smtp = emailCtx.smtp;

    const targetEmail = to || emailCtx.userDb?.email || smtp?.user || process.env.SMTP_USER;
    if (!targetEmail) {
      return res.status(400).json({ error: 'No se especificó un correo destinatario' });
    }

    const sendRes = await sendEmail(
      targetEmail,
      'Prueba de conexión de correo - SIG Purple',
      `<h3>Prueba de correo exitosa</h3><p>Este es un correo de prueba enviado desde SIG Purple BTL.</p><p>Servidor: ${smtp?.host || process.env.SMTP_HOST || 'smtp.gmail.com'}<br>Usuario remitente: ${smtp?.user || emailCtx.httpsConfig.fromEmail || process.env.SMTP_USER}</p>`,
      [],
      smtp,
      undefined,
      emailCtx.httpsConfig
    );

    res.json({
      success: true,
      transport: sendRes.transport,
      message: `Correo de prueba enviado con éxito a ${targetEmail} (canal: ${sendRes.transport})`
    });
  } catch (error: any) {
    console.error('Error en /api/email/test:', error);
    res.status(500).json({ error: error.message || 'Error al conectar con el servidor de correo' });
  }
});

app.post('/api/email/send', authenticateToken, async (req: any, res: any) => {
  try {
    const { to, subject, html, attachments, cc } = req.body;
    const emailCtx = await resolveEmailContext(req.user?.id);

    const sendRes = await sendEmail(to, subject, html, attachments || [], emailCtx.smtp, cc, emailCtx.httpsConfig);
    res.json({ success: true, transport: sendRes.transport });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/pagos/:id/send-email', authenticateToken, async (req: any, res: any) => {
  try {
    const result = await sendPagoNotificationEmailDetailed(req.params.id, req);
    if (!result.success) {
      return res.status(500).json(result);
    }
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  } finally {
    await closePdfBrowser();
  }
});

app.post('/api/pagos/:id/anular', authenticateToken, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const pago = await prisma.pago.findUnique({ where: { id } });
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });

    // Cambiar estado a Anulado
    await prisma.pago.update({ where: { id }, data: { estado: 'Anulado' } });

    const [prov, emailCtx] = await Promise.all([
      prisma.proveedor.findUnique({ where: { id: pago.proveedorId } }),
      resolveEmailContext(req.user?.id)
    ]);

    const config = emailCtx.config;
    const recipients = new Set<string>();
    if (config?.notificacionPagosEmails) {
      config.notificacionPagosEmails.split(',').map((e: string) => e.trim()).filter(Boolean).forEach((e: string) => recipients.add(e));
    }
    if (config?.notificarProveedorPago && prov?.correo?.trim()) {
      recipients.add(prov.correo.trim());
    }
    const toList = Array.from(recipients).join(', ');

    let emailSent = false;
    let emailWarning: string | undefined;

    if (toList) {
      const html = `<h2>ANULACIÓN OFICIAL</h2><p>Estimado/a ${prov?.razonSocial || 'Proveedor'},</p><p>Le notificamos oficialmente que el pago con identificador <b>${pago.id}</b> ha sido <b>ANULADO</b>.</p><p>Cualquier documento o comprobante asociado a este pago queda sin efecto.</p><p>Atentamente,<br>Purple BTL</p>`;
      try {
        await sendEmail(toList, `ANULACIÓN: Pago a Proveedor ${pago.id}`, html, [], emailCtx.smtp, undefined, emailCtx.httpsConfig);
        emailSent = true;
      } catch (mailErr: any) {
        console.error(`[Email Anulación] No se pudo enviar aviso de anulación para ${pago.id}:`, mailErr?.message || mailErr);
        emailWarning = `Pago anulado en el sistema, pero no se pudo enviar correo de aviso: ${mailErr?.message || 'Error de correo'}`;
      }
    }

    res.json({ success: true, estado: 'Anulado', emailSent, ...(emailWarning ? { emailWarning } : {}) });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// --- CONFIG & OTROS ---
app.get('/api/config', authenticateToken, async (req: any, res) => {
  const cfg = await prisma.appConfig.findUnique({ where: { id: 'global' } });
  res.json(sanitizeAppConfig(cfg, req.user?.role === 'Admin'));
});

app.put('/api/config', authenticateToken, requireAdmin, async (req, res) => {
  const {
    hasEmailWebhook,
    hasEmailWebhookSecret,
    hasBrevoApiKey,
    hasResendApiKey,
    hasHttpsEmailRelay,
    id: _ignoredId,
    ...rawBody
  } = req.body || {};

  const updateData: any = { ...rawBody };
  for (const secretField of ['emailWebhookSecret', 'brevoApiKey', 'resendApiKey']) {
    if (updateData[secretField] === MASKED_SECRET) {
      delete updateData[secretField];
    } else if (typeof updateData[secretField] === 'string') {
      updateData[secretField] = updateData[secretField].trim() || null;
    }
  }
  for (const strField of ['emailWebhookUrl', 'emailFromAddress']) {
    if (typeof updateData[strField] === 'string') {
      updateData[strField] = updateData[strField].trim() || null;
    }
  }

  const saved = await prisma.appConfig.upsert({
    where: { id: 'global' },
    update: updateData,
    create: { id: 'global', ...updateData }
  });
  res.json(sanitizeAppConfig(saved, true));
});

app.post('/api/backup', authenticateToken, requireAdmin, async (req, res) => res.json(await runFullBackup()));
// Chatbot API (ai client initialized at top level)

// --- AI QUOTE PARSER ---
app.post('/api/quotes/parse-text-ai', authenticateToken, async (req: any, res: any) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length < 10) {
      return res.status(400).json({ error: 'El texto es muy corto o vacío.' });
    }

    const prompt = `Eres el Director de Operaciones y Cotizaciones de la agencia productora "Purple BTL" en Perú.
Analiza el siguiente texto (puede ser un briefing, correo, lista de requerimientos, notas de reunión, etc.) y genera la cotización estructurada respetando con MÁXIMA PRECISIÓN el formato histórico, técnico y visual oficial de los ítems de Purple BTL.

TEXTO A ANALIZAR:
"""
${text.trim()}
"""

ESTÁNDAR OBLIGATORIO DE FORMATO PURPLE BTL:
1. NOMBRES DE ÍTEM ("name"):
   - SIEMPRE EN MAYÚSCULAS compactas, profesionales y estándar de la agencia (ej: "PRODUCCIÓN DE STAND", "BACKING PUBLICITARIO", "ANIMADOR", "ANFITRIONA", "SISTEMA DE AUDIO", "SUPERVISOR", "VOLANTES A5", "TRANSPORTE Y LOGÍSTICA", "DADO PUBLICITARIO", "PREMIOS").

2. DESCRIPCIONES TÉCNICAS ("details" - array de strings):
   - Cada elemento es una línea de texto que se renderiza con saltos de línea e indentación visual tanto en la web como en el PDF para el cliente.
   - Nivel 1 (Atributos principales): Se inician con un guión medio y un espacio: " - [Atributo]: [Valor]".
   - Nivel 2 (Sub-especificaciones o desgloses): Se inician con sangría de 3 espacios + asterisco + espacio: "   * [Detalle]".
   - Secciones canónicas según aplique al tipo de ítem:
     * Para Producción / Estructuras / Stands / POP:
       - " - 01 [Nombre del elemento]."
       - " - Medidas: [Alto x Ancho x Profundidad en mts]."
       - " - Material:"
       - "   * [Estructura en bastidor de madera / MDF / metal / etc.]"
       - "   * [Tensado en banner mate 13oz / vinil laminado / etc.]"
       - " - Acabado: [Laminado mate / brillo / impresión digital full color]."
       - " - Incluye:"
       - "   * Transporte e instalación y desinstalación."
       - "   * Personal calificado, SCTR y EPP."
       - "   * Prueba de color previa."
       - " - Tiempo de producción: [XX] días hábiles."
     * Para Personal / Talento / Staff BTL:
       - " - [Rol] con experiencia en activaciones BTL / eventos corporativos."
       - " - Fechas: [Días del evento o activación]."
       - " - Horario: [HH:MM a HH:MM am/pm / X horas de jornada]."
       - " - Lugar: [Sede, local, centro comercial, ciudad]."
       - " - Funciones:" (si aplica)
       - "   * [Función 1]"
       - " - Incluye: Movilidad, SCTR y refrigerio."
     * Para Audiovisual / Sonido / Pantallas:
       - " - Alquiler de [Sonido / Luces / Pantalla LED]."
       - " - Horario: [X horas operativas] + horas de montaje y prueba de sonido."
       - " - Especificaciones:"
       - "   * 02 parlantes amplificados con pedestales."
       - "   * 01 consola + micrófonos inalámbricos."
       - "   * 01 operador técnico de sonido."
       - " - Incluye: Transporte, cableado de alto tránsito, montaje y desmontaje."
     * Para Merchandising e Impresiones:
       - " - Impresión de [Cantidad] [Pieza]."
       - " - Medidas: [A5, A4, etc.]."
       - " - Material: [Couché 150gr, Algodón 30/1, etc.]."
       - " - Acabado / Impresión: [Full color tira y retira, serigrafía, bordado]."
       - " - Tiempo de producción: [XX] días hábiles."

3. SUB-ITEMS ("subItems"):
   - Desglose realista de costos directos de compra / proveedor en Perú (Soles PEN).
   - REGLA DE ORO DE PURPLE BTL: TODO ítem DEBE incluir como último sub-ítem uno llamado "Imprevistos" con un valor de contingencia estimado (ej. entre 5% y 10% del costo o entre S/ 20 y S/ 100).
   - Cada sub-ítem debe incluir:
     * "name": Nombre del concepto del costo o servicio.
     * "description": Descripción breve o proveedor sugerido.
     * "quantity": Cantidad (número entero >= 1).
     * "dates": Días/fechas (número entero >= 1).
     * "unitCost": Costo unitario estimado de mercado en Soles (PEN).

4. COEFICIENTES FINANCIEROS Y MÁRGENES:
   - "internalMultiplierPercent": 10
   - "financialExpensePercent": 10

Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura exacta (sin markdown, sin explicaciones, solo el JSON):
{
  "categories": [
    {
      "name": "1. PRODUCCIÓN, ESTRUCTURAS & BRANDING",
      "items": [
        {
          "name": "BACKING PUBLICITARIO",
          "quantity": 1,
          "dates": 1,
          "details": [
            "",
            " - Backing publicitario autoportante.",
            " - Medidas: 3.00 x 2.00 mts.",
            " - Material:",
            "   * Bastidor de madera reforzado.",
            "   * Tensado en banner mate antirreflejo 13 Oz.",
            " - Acabado: Impresión digital full color 1440 dpi.",
            " - Incluye:",
            "   * Transporte e instalación en sede del cliente.",
            "   * Desmontaje al finalizar la actividad.",
            "   * Personal con SCTR y EPP.",
            " - Tiempo de producción: 05 días hábiles.",
            ""
          ],
          "internalMultiplierPercent": 10,
          "financialExpensePercent": 10,
          "subItems": [
            {
              "name": "Fabricación y tensado de estructura",
              "description": "Bastidor de madera y banner",
              "quantity": 1,
              "dates": 1,
              "unitCost": 415
            },
            {
              "name": "Transporte y montaje",
              "description": "Flete ida y vuelta y cuadrilla",
              "quantity": 1,
              "dates": 1,
              "unitCost": 120
            },
            {
              "name": "Imprevistos",
              "description": "Contingencia de producción",
              "quantity": 1,
              "dates": 1,
              "unitCost": 50
            }
          ]
        }
      ]
    }
  ],
  "notes": "Breve resumen ejecutivo de la cotización detectada"
}`;

    if (!isValidGeminiKeyConfigured()) {
      return res.status(400).json({ error: GEMINI_MISSING_KEY_ERROR });
    }

    const responseText = await generateTextWithGeminiFallback({
      logLabel: 'parse-text-ai',
      timeoutMs: 25000,
      contents: prompt,
      config: {
        temperature: 0.2,
        responseMimeType: 'application/json'
      }
    });

    const rawText = responseText;
    // Strip any accidental markdown code fences
    const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({ error: 'La IA devolvió un formato inválido. Intenta con un texto más detallado.' });
    }

    if (!parsed.categories || !Array.isArray(parsed.categories)) {
      return res.status(500).json({ error: 'No se pudo estructurar el texto. Intenta con más detalle.' });
    }

    // Normalizar categorías e ítems al estándar oficial de Purple BTL
    parsed.categories.forEach((cat: any) => {
      cat.name = (cat.name || 'CATEGORÍA').trim();
      if (!Array.isArray(cat.items)) cat.items = [];
      cat.items.forEach((item: any) => {
        item.name = (item.name || 'ÍTEM').trim().toUpperCase();
        item.quantity = Number(item.quantity) || 1;
        item.dates = Number(item.dates) || 1;
        item.internalMultiplierPercent = Number(item.internalMultiplierPercent) || 10;
        item.financialExpensePercent = 10;
        if (!Array.isArray(item.details)) item.details = [];
        if (!Array.isArray(item.subItems)) item.subItems = [];

        // Garantizar sub-ítem de Imprevistos al final
        const hasImprevisto = item.subItems.some((s: any) => 
          (s?.name || '').toLowerCase().includes('imprevisto')
        );
        if (!hasImprevisto) {
          const baseCost = item.subItems.reduce((acc: number, s: any) => acc + (Number(s.unitCost) || 0), 0);
          const imprevistoCost = Math.max(20, Math.round(baseCost * 0.08));
          item.subItems.push({
            name: 'Imprevistos',
            description: 'Contingencia de producción',
            quantity: 1,
            dates: 1,
            unitCost: imprevistoCost
          });
        }
      });
    });

    res.json(parsed);
  } catch (error: any) {
    console.error('AI Quote Parser Error:', error);
    res.status(500).json({ error: 'Error al procesar con IA: ' + (error.message || 'Error desconocido') });
  }
});

// --- GASTOS PRODUCCIÓN ---
app.get('/api/gastos-produccion', authenticateToken, async (req, res) => {
  try {
    const gastos = await prisma.gastoProduccion.findMany({ include: { items: true, proyecto: true, cliente: true } });
    res.json(gastos);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

app.post('/api/gastos-produccion', authenticateToken, upload.single('comprobanteUrl'), async (req: any, res) => {
  try {
    const data = JSON.parse(req.body.data || '{}');
    const { items, proyectoNombre, proveedorNombre, ...dbFields } = data;
    let url = null;
    if (req.file) {
      const subfolder = (dbFields.tipoComprobante === 'Factura' || data.tipoComprobante === 'Factura')
        ? 'Facturas'
        : 'Desglose de Producción';
      try {
        const driveResult = await uploadToProjectDriveFolder({
          projectId: dbFields.proyectoId || data.proyectoId,
          clienteId: dbFields.clienteId || data.clienteId,
          clientName: undefined,
          projectName: proyectoNombre,
          area: 'Producción',
          subfolder,
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          buffer: req.file.buffer,
          userEmail: resolveUserEmail(req),
          prisma
        });
        url = driveResult.webViewLink || '';
      } catch (e: any) {
        console.error("Error subiendo gasto a Drive:", e);
      }
      if (!url) {
        const safeName = `gasto_${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const filePath = path.join(UPLOADS_DIR, safeName);
        fs.writeFileSync(filePath, req.file.buffer);
        url = `/uploads/${safeName}`;
      }
    }

    // Explicitly delete unexpected relational fields if they leak
    delete (dbFields as any).cliente;
    delete (dbFields as any).proyecto;
    delete (dbFields as any).quote;
    delete (dbFields as any).fechaRegistro;

    const fechaEmision = dbFields.fechaEmision || data.fechaEmision || data.fechaRegistro || new Date().toISOString().split('T')[0];

    const totalMonto = Number(dbFields.total || 0);
    const esFact = (dbFields.tipoComprobante || 'Boleta').toLowerCase().includes('factur');
    const baseMonto = dbFields.montoBase !== undefined ? Number(dbFields.montoBase) : (esFact ? Number((totalMonto / 1.18).toFixed(2)) : totalMonto);
    const igvMonto = dbFields.montoIgv !== undefined ? Number(dbFields.montoIgv) : (esFact ? Number((totalMonto - baseMonto).toFixed(2)) : 0);

    const result = await prisma.gastoProduccion.create({
      data: {
        clienteId: dbFields.clienteId,
        proyectoId: dbFields.proyectoId,
        quoteId: dbFields.quoteId,
        tipoComprobante: dbFields.tipoComprobante || 'Boleta',
        numeroComprobante: dbFields.numeroComprobante || '',
        fechaEmision: fechaEmision,
        total: totalMonto,
        montoBase: baseMonto,
        montoIgv: igvMonto,
        areaResponsable: dbFields.areaResponsable || 'General',
        estadoGasto: dbFields.estadoGasto || 'Pendiente',
        esGastoAdicional: Boolean(dbFields.esGastoAdicional || data.esGastoAdicional),
        motivoAdicional: dbFields.motivoAdicional || data.motivoAdicional || null,
        comprobanteUrl: url,
        items: {
          create: (items || []).map((it: any) => ({
            quoteSubItemId: it.quoteSubItemId,
            name: it.name,
            costPercentage: Number(it.costPercentage) || 0,
            monto: Number(it.monto) || 0
          }))
        }
      },
      include: { items: true, cliente: true, proyecto: true }
    });
    res.json(result);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/gastos-produccion/:id', authenticateToken, upload.single('comprobanteUrl'), async (req: any, res) => {
  try {
    let data;
    if (req.body?.data) {
      data = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;
    } else {
      data = req.body || {};
    }

    const { items, proyectoNombre, proveedorNombre } = data;
    let url = data.comprobanteUrl;
    if (req.file) {
      const subfolder = data.tipoComprobante === 'Factura' ? 'Facturas' : 'Desglose de Producción';
      try {
        const driveResult = await uploadToProjectDriveFolder({
          projectId: data.proyectoId,
          clienteId: data.clienteId,
          projectName: proyectoNombre,
          area: 'Producción',
          subfolder,
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          buffer: req.file.buffer,
          userEmail: resolveUserEmail(req),
          prisma
        });
        url = driveResult.webViewLink || '';
      } catch (e: any) {
        console.error("Error subiendo comprobante gasto a Drive:", e);
      }
      if (!url) {
        const safeName = `gasto_${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const filePath = path.join(UPLOADS_DIR, safeName);
        fs.writeFileSync(filePath, req.file.buffer);
        url = `/uploads/${safeName}`;
      }
    }

    const allowedFields = [
      'clienteId', 'proyectoId', 'quoteId', 'tipoComprobante',
      'numeroComprobante', 'fechaEmision', 'total', 'estadoGasto',
      'areaResponsable', 'comprobanteUrl', 'comprobanteDevolucionUrl',
      'fechaDevolucion', 'codigoDevolucion', 'esGastoAdicional', 'motivoAdicional'
    ];
    const updateData: any = {};
    for (const key of allowedFields) {
      if (key in data && data[key] !== undefined) {
        if (key === 'total') updateData[key] = Number(data[key]) || 0;
        else if (key === 'esGastoAdicional') updateData[key] = Boolean(data[key]);
        else updateData[key] = data[key];
      }
    }
    if (url !== undefined && url !== null) {
      updateData.comprobanteUrl = url;
    }

    if (Array.isArray(items) && items.length > 0 && items[0].quoteSubItemId) {
      updateData.items = {
        deleteMany: {},
        create: items.map((it: any) => ({
          quoteSubItemId: it.quoteSubItemId,
          name: it.name,
          costPercentage: Number(it.costPercentage) || 0,
          monto: Number(it.monto) || 0
        }))
      };
    }

    const result = await prisma.gastoProduccion.update({
      where: { id: req.params.id },
      data: updateData,
      include: { items: true, cliente: true, proyecto: true }
    });
    res.json(result);
  } catch (error: any) {
    console.error("Error actualizando gasto:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/gastos-produccion/:id', authenticateToken, async (req, res) => {
  try {
    await prisma.gastoProduccion.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// --- REGISTRO MASIVO DE GASTOS DE PRODUCCIÓN (IMPORTACIÓN DESDE EXCEL) ---
app.post('/api/gastos-produccion/batch', authenticateToken, async (req: any, res) => {
  try {
    const { gastos } = req.body;
    if (!Array.isArray(gastos) || gastos.length === 0) {
      return res.status(400).json({ error: 'La lista de gastos está vacía.' });
    }

    const createdGastos: any[] = [];
    const today = new Date().toISOString().split('T')[0];

    for (const g of gastos) {
      let { clienteId, proyectoId, quoteId, items, ...fields } = g;

      // Si falta clienteId o quoteId pero se tiene proyectoId, resolverlos automáticamente
      if (proyectoId && (!clienteId || !quoteId)) {
        const proy = await prisma.proyecto.findUnique({
          where: { id: proyectoId }
        });
        if (proy) {
          clienteId = clienteId || proy.clienteId;
          if (!quoteId) {
            const projectQuotes = await prisma.quote.findMany({ where: { projectId: proyectoId } });
            const approved = projectQuotes.find(q => (q.status || '').toLowerCase().includes('aprob'));
            quoteId = approved ? approved.id : (projectQuotes[0] ? projectQuotes[0].id : null);
          }
        }
      }

      if (!clienteId || !proyectoId) {
        return res.status(400).json({ 
          error: `El gasto con comprobante '${fields.numeroComprobante || fields.concepto}' no tiene un proyecto o cliente asociado.` 
        });
      }

      // Si el proyecto no tiene ninguna cotización aún, buscar o crear una de respaldo
      if (!quoteId) {
        let defaultQuote = await prisma.quote.findFirst({ where: { projectId: proyectoId } });
        if (!defaultQuote) {
          const allQuotes = await prisma.quote.findMany({ select: { id: true } });
          const existingNums = allQuotes
            .map(q => {
              const m = q.id?.match(/COT-(\d+)/);
              return m ? parseInt(m[1], 10) : 0;
            })
            .filter(n => !isNaN(n));
          const nextNum = (existingNums.length > 0 ? Math.max(...existingNums) : 1000) + 1;
          const newQuoteId = `COT-${String(nextNum).padStart(4, '0')}`;

          defaultQuote = await prisma.quote.create({
            data: {
              id: newQuoteId,
              projectId: proyectoId,
              version: 1,
              isTemplate: false,
              status: 'Aprobado',
              client: clienteId,
              brand: clienteId,
              requirement: 'Gastos de Producción en Campo',
              date: today,
              businessName: clienteId,
              ruc: '20603757417',
              paymentConditions: 'Contado'
            }
          });
        }
        quoteId = defaultQuote.id;
      }

      const tipoComprobante = (fields.tipoComprobante || 'Boleta').trim();
      const esFactura = tipoComprobante.toLowerCase().includes('factur');
      const costoBase = Number(fields.montoBase !== undefined ? fields.montoBase : (fields.costoBase !== undefined ? fields.costoBase : fields.total || 0));
      const montoIgv = esFactura ? Number((costoBase * 0.18).toFixed(2)) : 0;
      const total = Number(fields.total !== undefined ? fields.total : (costoBase + montoIgv).toFixed(2));

      const finalItems = (Array.isArray(items) && items.length > 0)
        ? items.map((it: any) => ({
            quoteSubItemId: it.quoteSubItemId || 'item-gasto-prod',
            name: it.name || fields.concepto || fields.descripcion || 'Gasto de Producción',
            costPercentage: Number(it.costPercentage) || 100,
            monto: Number(it.monto) || total
          }))
        : [{
            quoteSubItemId: 'item-gasto-prod',
            name: fields.concepto || fields.descripcion || 'Gasto de Producción',
            costPercentage: 100,
            monto: total
          }];

      const created = await prisma.gastoProduccion.create({
        data: {
          clienteId,
          proyectoId,
          quoteId,
          tipoComprobante,
          numeroComprobante: fields.numeroComprobante || '',
          fechaEmision: fields.fechaEmision || today,
          total,
          montoBase: costoBase,
          montoIgv,
          areaResponsable: fields.areaResponsable || fields.responsable || resolveUserEmail(req) || 'Producción',
          estadoGasto: fields.estadoGasto || 'Pendiente',
          esGastoAdicional: Boolean(fields.esGastoAdicional),
          motivoAdicional: fields.motivoAdicional || null,
          items: {
            create: finalItems
          }
        },
        include: { items: true, cliente: true, proyecto: true }
      });

      createdGastos.push(created);
    }

    res.json(createdGastos);
  } catch (error: any) {
    console.error("Error en registro batch de gastos de producción:", error);
    res.status(500).json({ error: 'No se pudieron registrar los gastos en lote', details: error.message || String(error) });
  }
});

// --- DEVOLUCION / REEMBOLSO MULTIMODAL EN LOTE (GASTOS PRODUCCION) ---
app.post('/api/gastos-produccion/devolucion-lote', authenticateToken, upload.single('comprobanteFile'), async (req: any, res) => {
  try {
    let gastoIds: string[] = [];
    if (req.body?.gastoIds) {
      if (typeof req.body.gastoIds === 'string') {
        try {
          gastoIds = JSON.parse(req.body.gastoIds);
        } catch (e) {
          gastoIds = req.body.gastoIds.split(',').map((s: string) => s.trim().replace(/^["']|["']$/g, ''));
        }
      } else if (Array.isArray(req.body.gastoIds)) {
        gastoIds = req.body.gastoIds;
      }
    }
    const fechaDevolucion = req.body?.fechaDevolucion || new Date().toISOString().split('T')[0];
    const codigoDevolucion = req.body?.codigoDevolucion || '';

    if (!Array.isArray(gastoIds) || gastoIds.length === 0) {
      return res.status(400).json({ error: 'Debe proporcionar al menos un ID de gasto para la devolución.' });
    }

    let url = req.body?.comprobanteDevolucionUrl || '';
    if (req.file) {
      try {
        let firstGasto: any = null;
        if (gastoIds && gastoIds[0]) {
          firstGasto = await prisma.gastoProduccion.findUnique({ where: { id: gastoIds[0] } });
        }
        const driveResult = await uploadToProjectDriveFolder({
          projectId: firstGasto?.proyectoId,
          clienteId: firstGasto?.clienteId,
          area: 'Producción',
          subfolder: 'Desglose de Producción',
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          buffer: req.file.buffer,
          userEmail: resolveUserEmail(req),
          prisma
        });
        url = driveResult.webViewLink || '';
      } catch (e: any) {
        console.error("Error subiendo voucher de devolución a Drive:", e);
      }
      if (!url) {
        const safeName = `devolucion_${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const filePath = path.join(UPLOADS_DIR, safeName);
        fs.writeFileSync(filePath, req.file.buffer);
        url = `/uploads/${safeName}`;
      }
    }

    // Actualizar todos los gastos seleccionados en lote
    await prisma.gastoProduccion.updateMany({
      where: { id: { in: gastoIds } },
      data: {
        estadoGasto: 'Devuelto',
        comprobanteDevolucionUrl: url || undefined,
        fechaDevolucion,
        codigoDevolucion
      }
    });

    const updatedGastos = await prisma.gastoProduccion.findMany({
      where: { id: { in: gastoIds } },
      include: { items: true, cliente: true, proyecto: true }
    });

    res.json({ success: true, updatedCount: updatedGastos.length, gastos: updatedGastos, url });
  } catch (err: any) {
    console.error("Error en devolucion-lote:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chat', authenticateToken, async (req, res) => {
  try {
    const { message, history, currentQuoteId } = req.body;

    // Helper to format detailed quote breakdown including categories, items, specs, and production times
    const formatQuoteDetails = (c: any) => {
      let header = `• COTIZACIÓN ID: ${c.id} (V${c.version}) | Estado: ${c.status} | Fecha: ${c.date} | Cliente: ${c.client || 'N/A'} | Requerimiento: "${c.requirement}" | Moneda: ${c.currency || 'PEN'} (TC: ${c.exchangeRate || 1})`;
      if (!c.categories || c.categories.length === 0) {
        return header + '\n  (Sin categorías o ítems registrados)';
      }
      const lines: string[] = [header];
      lines.push(`  DESGLOSE DETALLADO DE ÍTEMS Y ESPECIFICACIONES (${c.categories.length} categorías):`);
      c.categories.forEach((cat: any) => {
        lines.push(`  [Categoría: ${cat.name}]`);
        (cat.items || []).forEach((item: any, idx: number) => {
          let detailsText = '';
          if (item.details) {
            try {
              const parsed = JSON.parse(item.details);
              if (Array.isArray(parsed)) {
                detailsText = parsed.filter(Boolean).map((d: any) => typeof d === 'string' ? d.trim() : JSON.stringify(d)).join(' // ');
              } else {
                detailsText = String(parsed).trim();
              }
            } catch {
              detailsText = String(item.details).replace(/\n+/g, ' // ').trim();
            }
          }

          let itemLine = `    ${idx + 1}. Ítem: "${item.name}" | Cant: ${item.quantity} | Días: ${item.dates}`;
          if (item.productionTime && item.productionTime.trim()) {
            itemLine += ` | ⏳ TIEMPO DE PRODUCCIÓN: "${item.productionTime.trim()}"`;
          }
          if (detailsText) {
            itemLine += ` | Especificaciones / Viñetas: [${detailsText}]`;
          }
          if (item.providerContact && item.providerContact.trim()) {
            itemLine += ` | Contacto Prov: ${item.providerContact}`;
          }
          if (item.subItems && item.subItems.length > 0) {
            const subStr = item.subItems.map((s: any) => `${s.name || s.description}: S/ ${s.unitCost} (Prov: ${s.providerName || 'N/A'})`).join('; ');
            itemLine += ` | Sub-ítems costos: [${subStr}]`;
          }
          lines.push(itemLine);
        });
      });
      return lines.join('\n');
    };

    // 1. If user is currently looking at a specific quote in the frontend, fetch it with full details
    let activeViewingQuote: any = null;
    if (currentQuoteId) {
      try {
        activeViewingQuote = await prisma.quote.findUnique({
          where: { id: String(currentQuoteId) },
          include: {
            categories: {
              include: {
                items: {
                  include: {
                    subItems: true
                  }
                }
              }
            }
          }
        });
      } catch (err) {
        console.error('Error fetching activeViewingQuote:', err);
      }
    }

    // 2. Extract keywords from message to search specific quotes, orders and expenses in DB
    const cleanMsg = (message || '').toLowerCase();
    const stopWords = ['los', 'las', 'del', 'para', 'con', 'una', 'uno', 'por', 'que', 'como', 'cual', 'cuales', 'este', 'esta', 'estos', 'estas', 'tiene', 'tienen', 'tienes', 'dame', 'pasa', 'dime', 'info', 'informacion', 'asistente', 'purple', 'ayuda', 'costo', 'costos', 'precio', 'precios', 'algun', 'alguna', 'algunos', 'algunas', 'proyecto', 'proyectos', 'cotizacion', 'cotizaciones'];
    const rawWords = cleanMsg
      .replace(/[^a-z0-9áéíóúüñ]/gi, ' ')
      .split(/\s+/)
      .filter((w: string) => w.length >= 3 && !stopWords.includes(w));

    // Expand words with singular and plural variants (e.g. telarañas -> telaraña)
    const queryWords = new Set<string>();
    rawWords.forEach((w: string) => {
      queryWords.add(w);
      if (w.endsWith('s') && w.length > 4) queryWords.add(w.slice(0, -1));
      if (w.endsWith('es') && w.length > 5) queryWords.add(w.slice(0, -2));
    });

    let targetedQuotes: any[] = [];
    let targetedOrdenes: any[] = [];
    let targetedGastos: any[] = [];

    if (queryWords.size > 0) {
      try {
        const orConditionsQuotes: any[] = [];
        const orConditionsOrdenes: any[] = [];
        const orConditionsGastos: any[] = [];

        for (const word of queryWords) {
          orConditionsQuotes.push({ client: { contains: word, mode: 'insensitive' } });
          orConditionsQuotes.push({ requirement: { contains: word, mode: 'insensitive' } });
          orConditionsQuotes.push({ id: { contains: word, mode: 'insensitive' } });
          orConditionsQuotes.push({
            categories: {
              some: {
                OR: [
                  { name: { contains: word, mode: 'insensitive' } },
                  {
                    items: {
                      some: {
                        OR: [
                          { name: { contains: word, mode: 'insensitive' } },
                          { details: { contains: word, mode: 'insensitive' } },
                          {
                            subItems: {
                              some: {
                                OR: [
                                  { name: { contains: word, mode: 'insensitive' } },
                                  { description: { contains: word, mode: 'insensitive' } }
                                ]
                              }
                            }
                          }
                        ]
                      }
                    }
                  }
                ]
              }
            }
          });

          orConditionsOrdenes.push({
            items: {
              some: {
                OR: [
                  { name: { contains: word, mode: 'insensitive' } },
                  { customDescription: { contains: word, mode: 'insensitive' } }
                ]
              }
            }
          });

          orConditionsGastos.push({
            items: {
              some: {
                OR: [
                  { name: { contains: word, mode: 'insensitive' } },
                  { descripcion: { contains: word, mode: 'insensitive' } }
                ]
              }
            }
          });
        }

        const [tQuotes, tOrdenes, tGastos] = await Promise.all([
          prisma.quote.findMany({
            where: { OR: orConditionsQuotes },
            include: {
              categories: {
                include: {
                  items: {
                    include: {
                      subItems: true
                    }
                  }
                }
              }
            },
            take: 15
          }),
          prisma.orden.findMany({
            where: { OR: orConditionsOrdenes },
            include: { items: true, proveedor: true, proyecto: true },
            take: 10
          }),
          prisma.gastoProduccion.findMany({
            where: { OR: orConditionsGastos },
            include: { items: true, cliente: true, proyecto: true },
            take: 10
          })
        ]);

        targetedQuotes = tQuotes;
        targetedOrdenes = tOrdenes;
        targetedGastos = tGastos;
      } catch (err) {
        console.error('Error searching targeted data:', err);
      }
    }

    // 3. Gather comprehensive system context from all tables
    const [clientes, proyectos, cotizaciones, proveedores, ordenes, pagos, facturas, gastos, gantts] = await Promise.all([
      prisma.cliente.findMany({ select: { id: true, empresa: true, contacto: true, cargo: true, email: true, telefono: true, estado: true } }),
      prisma.proyecto.findMany({ include: { cliente: true }, orderBy: { fechaRegistro: 'desc' }, take: 60 }),
      prisma.quote.findMany({
        include: {
          categories: {
            include: {
              items: {
                include: {
                  subItems: true
                }
              }
            }
          }
        },
        orderBy: { id: 'desc' },
        take: 40
      }),
      prisma.proveedor.findMany({ select: { id: true, razonSocial: true, ruc: true, categoria: true, ciudad: true, tipoProveedor: true, esConfiable: true, motivoNoConfiable: true, telefono: true, correo: true, servicios: true } }),
      prisma.orden.findMany({ include: { items: true, proveedor: true, proyecto: true }, orderBy: { fechaEmision: 'desc' }, take: 30 }),
      prisma.pago.findMany({ include: { proveedor: true, proyecto: true }, orderBy: { fechaPago: 'desc' }, take: 30 }),
      prisma.facturaCliente.findMany({ include: { proyecto: { include: { cliente: true } } }, orderBy: { fechaEmision: 'desc' }, take: 40 }),
      prisma.gastoProduccion.findMany({ include: { items: true, proyecto: true }, orderBy: { fechaEmision: 'desc' }, take: 30 }),
      prisma.projectGantt.findMany({ include: { tasks: true, proyecto: true }, take: 20 })
    ]);

    // Merge quotes ensuring no duplicates
    const quoteMap = new Map<string, any>();
    if (activeViewingQuote) quoteMap.set(activeViewingQuote.id, activeViewingQuote);
    targetedQuotes.forEach(q => quoteMap.set(q.id, q));
    cotizaciones.forEach(q => quoteMap.set(q.id, q));
    const allQuotesToDisplay = Array.from(quoteMap.values());

    // Merge orders ensuring no duplicates
    const ordenMap = new Map<string, any>();
    targetedOrdenes.forEach(o => ordenMap.set(o.id, o));
    ordenes.forEach(o => ordenMap.set(o.id, o));
    const allOrdenesToDisplay = Array.from(ordenMap.values());

    // Merge gastos ensuring no duplicates
    const gastoMap = new Map<string, any>();
    targetedGastos.forEach(g => gastoMap.set(g.id, g));
    gastos.forEach(g => gastoMap.set(g.id, g));
    const allGastosToDisplay = Array.from(gastoMap.values());

    const totalFacturadoClientes = facturas.reduce((acc, f) => acc + (f.montoConIgv || 0), 0);
    const totalPendienteCobranza = facturas.filter(f => f.estado !== 'Pagado').reduce((acc, f) => acc + Math.max(0, (f.montoConIgv || 0) - (f.importeRecibido || 0)), 0);
    const totalPagadoProveedores = pagos.filter(p => p.estado === 'Pagado').reduce((acc, p) => acc + (p.monto || 0), 0);
    const totalPendienteProveedores = pagos.filter(p => p.estado === 'Pendiente').reduce((acc, p) => acc + (p.monto || 0), 0);
    const totalGastosProduccion = gastos.reduce((acc, g) => acc + (g.total || 0), 0);

    let upcomingEventsStr = '';
    try {
      const calRes = await getCalendarEvents({ maxResults: 15 });
      if (calRes.connected && calRes.events && calRes.events.length > 0) {
        upcomingEventsStr = `\n=== REUNIONES Y EVENTOS EN GOOGLE CALENDAR (${calRes.events.length} agendadas) ===\n` +
          calRes.events.map((e: any) => `- [${e.start ? e.start.substring(0, 16).replace('T', ' ') : 'N/A'}] "${e.title}" | Meet: ${e.meetLink || 'Sin Meet'} | Ubicación: ${e.location || 'Virtual'} | Asistentes: ${e.attendees.map((a: any) => a.name || a.email).join(', ') || 'N/A'}`).join('\n');
      }
    } catch (e) {
      // ignore
    }

    let activeViewingQuoteStr = '';
    if (activeViewingQuote) {
      activeViewingQuoteStr = `
=== 👁️ COTIZACIÓN ABIERTA ACTUALMENTE EN LA PANTALLA DEL USUARIO ===
El usuario se encuentra visualizando en este momento la siguiente cotización. Prioriza responder sobre sus ítems, tiempos y detalles técnicos:
${formatQuoteDetails(activeViewingQuote)}
`;
    }

    const contextStr = `
CONTEXTO INTEGRAL DEL SISTEMA (SIG PURPLE BTL):
Tienes acceso directo, granular y en tiempo real a TODAS las tablas, cotizaciones, ítems, proyectos y operaciones de la agencia Purple BTL.
${activeViewingQuoteStr}
=== RESUMEN FINANCIERO Y MÉTRICAS CLAVE ===
- Total Facturado a Clientes: S/ ${totalFacturadoClientes.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
- Total Pendiente de Cobro a Clientes: S/ ${totalPendienteCobranza.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
- Total Pagado a Proveedores: S/ ${totalPagadoProveedores.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
- Total Pendiente de Pago a Proveedores: S/ ${totalPendienteProveedores.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
- Total en Gastos de Producción: S/ ${totalGastosProduccion.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
- Total Clientes Registrados: ${clientes.length}
- Total Proveedores Registrados: ${proveedores.length} (${proveedores.filter(p => !p.esConfiable).length} marcados como NO CONFIABLES)

=== CLIENTES DE LA AGENCIA (${clientes.length}) ===
${clientes.map(c => `- ${c.empresa} (Contacto: ${c.contacto || 'N/A'}${c.cargo ? ` - ${c.cargo}` : ''}, Tel: ${c.telefono || 'N/A'}, Email: ${c.email || 'N/A'}, Estado: ${c.estado})`).join('\n')}

=== PROYECTOS (${proyectos.length} más recientes) ===
${proyectos.map(p => `- ID: ${p.id} | Proyecto: ${p.nombre} | Cliente: ${p.cliente?.empresa || 'N/A'} | Estado: ${p.estado} | Servicio: ${p.tipoServicio} | Presupuesto: S/ ${p.presupuestoEstimado || p.subtotal || 0} | PM: ${p.projectManager || 'N/A'}${p.contactoNombre ? ` | Solicitado por: ${p.contactoNombre} (${p.contactoCargo || ''})` : ''}${p.ordenesCompra ? ` | OC: ${p.ordenesCompra}` : ''}${p.ordenesServicio ? ` | OS: ${p.ordenesServicio}` : ''}${p.statusActividad ? ` | Actividad: ${p.statusActividad}` : ''}${p.comentarios ? ` | Notas: ${p.comentarios}` : ''}`).join('\n')}

=== COTIZACIONES CON DESGLOSE ÍNTEGRO DE ÍTEMS Y TIEMPOS DE PRODUCCIÓN (${allQuotesToDisplay.length}) ===
${allQuotesToDisplay.map(c => formatQuoteDetails(c)).join('\n\n')}

=== DIRECTORIO DE PROVEEDORES (${proveedores.length}) ===
${proveedores.map(p => `- ${p.razonSocial} | RUC: ${p.ruc || 'S/N'} | Cat: ${p.categoria || 'General'} | Ciudad: ${p.ciudad || 'Lima'} | Tipo: ${p.tipoProveedor || 'Trabajado'} | Tel: ${p.telefono || 'S/N'} | ${p.esConfiable ? '✅ Confiable' : `❌ NO CONFIABLE (Motivo: ${p.motivoNoConfiable || 'No especificado'})`}`).join('\n')}

=== FACTURACIÓN Y COBRANZAS A CLIENTES (${facturas.length} facturas) ===
${facturas.map(f => `- Factura: ${f.numeroFactura} | Cliente: ${f.proyecto?.cliente?.empresa || 'N/A'} | Proyecto: ${f.proyecto?.nombre || 'N/A'} | Monto con IGV: S/ ${f.montoConIgv} | Cobrado: S/ ${f.importeRecibido} | Estado: ${f.estado} | Emisión: ${f.fechaEmision} | Días de Crédito: ${f.diasPago}`).join('\n')}

=== PAGOS A PROVEEDORES (${pagos.length} recientes) ===
${pagos.map(p => `- Pago: S/ ${p.monto} | Proveedor: ${p.proveedor?.razonSocial || p.proveedorId} | Proyecto: ${p.proyecto?.nombre || 'N/A'} | Estado: ${p.estado} | Fecha: ${p.fechaPago} | Tipo: ${p.tipoPago}`).join('\n')}

=== ÓRDENES DE COMPRA Y SERVICIO (${allOrdenesToDisplay.length}) ===
${allOrdenesToDisplay.map(o => {
      const itemsStr = (o.items || []).map((it: any) => `${it.name} (Cant: ${it.quantity}, S/ ${it.total})`).join(', ');
      return `- Orden ${o.id} (${o.tipoOrden}) | Proveedor: ${o.proveedor?.razonSocial || 'N/A'} | Total: S/ ${o.total} | Entrega: ${o.estadoEntrega} | Proyecto: ${o.proyecto?.nombre || 'N/A'}${itemsStr ? ` | Ítems: [${itemsStr}]` : ''}`;
    }).join('\n')}

=== GASTOS DE PRODUCCIÓN Y REEMBOLSOS (${allGastosToDisplay.length}) ===
${allGastosToDisplay.map(g => {
      const itemsStr = (g.items || []).map((it: any) => `${it.descripcion || it.name}: S/ ${it.monto || it.subtotal}`).join(', ');
      return `- Comprobante ${g.tipoComprobante} ${g.numeroComprobante} | S/ ${g.total} | Área: ${g.areaResponsable} | Estado: ${g.estadoGasto} | Proyecto: ${g.proyecto?.nombre || 'N/A'}${itemsStr ? ` | Detalle: [${itemsStr}]` : ''}`;
    }).join('\n')}

=== CRONOGRAMAS Y GANTTS (${gantts.length} activos) ===
${gantts.map(g => {
      const taskCount = g.tasks ? g.tasks.length : 0;
      const avgProgress = taskCount > 0 ? Math.round(g.tasks.reduce((a: number, t: any) => a + (t.progress || 0), 0) / taskCount) : 0;
      return `- Gantt: ${g.name || 'Cronograma'} | Proyecto: ${g.proyecto?.nombre || g.projectId} | Versión: V${g.version} | Avance Promedio: ${avgProgress}% | Tareas: ${taskCount}`;
    }).join('\n')}
${upcomingEventsStr}
`;

    const systemInstruction = `Eres "Purple Bot", el asistente de inteligencia artificial central de la agencia Purple BTL S.A.C.
Tienes acceso total, granular y actualizado a TODAS las bases de datos del sistema ERP/SIG y a Google Calendar:
- Clientes, proyectos y su estado operativo
- Cotizaciones comerciales completas, incluyendo cada categoría, desglose íntegro de ítems, especificaciones técnicas, viñetas de detalle, tiempos de producción (tanto en el campo de tiempo como dentro del texto de viñetas/detalles), costos, sub-ítems y contactos de proveedores
- Directorio de proveedores (incluyendo si son confiables o no, advertencias y cuentas bancarias)
- Órdenes de compra y servicio con desglose de ítems solicitados
- Pagos a proveedores, estados y comprobantes
- Facturas a clientes, créditos, cobranzas e importes pendientes
- Gastos de producción y reembolsos detallados
- Cronogramas de proyectos (Gantts), avance porcentual y tareas
- Reuniones, eventos y citas agendadas en Google Calendar (con enlaces a Google Meet)
- Métricas financieras consolidadas

Instrucciones Clave:
1. Responde de manera profesional, ejecutiva, empática y precisa con los datos exactos del sistema.
2. IMPORTANTE SOBRE COTIZACIONES Y TIEMPOS DE PRODUCCIÓN: Tienes acceso al desglose completo de ítems de las cotizaciones. Los tiempos de producción pueden estar especificados en "⏳ TIEMPO DE PRODUCCIÓN" o redactados dentro de las viñetas de detalle (por ejemplo: "- Tiempo de producción: 07 días hábiles", "- Tiempo de producción: 04 días hábiles", "- Tiempo de producción: 3 días hábiles", etc.). Cuando el usuario te pregunte por los tiempos de producción, plazos, materiales o ítems de una cotización, BUSCA y extrae los datos EXACTOS registrados para cada ítem y preséntalos organizados por ítem. NUNCA digas que la base de datos no está segregada o que no tienes la información cuando esté presente en el contexto.
3. Si el usuario te hace una pregunta teniendo una cotización abierta en pantalla, responde directamente sobre los ítems de esa cotización.
4. Si te preguntan sobre montos o finanzas, presenta cifras claras en soles (S/.) y resalta si están pagadas o pendientes.
5. Si te preguntan por un proveedor, especifica si es confiable o si tiene alguna advertencia registrada.
6. Si te preguntan por el estado de un proyecto o cronograma, menciona el porcentaje de avance, cliente y tareas clave.
7. Si te preguntan por reuniones, citas o la agenda del día o semana, detalla los eventos de Google Calendar con sus horarios y enlaces de Google Meet si los hay.
8. Puedes hacer resúmenes ejecutivos cuando te pidan un balance o panorama general.`;

    const contents = [
      { role: 'user', parts: [{ text: systemInstruction + '\n\n' + contextStr }] },
      { role: 'model', parts: [{ text: 'Entendido. Estoy listo para ayudar con la información de Purple BTL.' }] }
    ];

    if (history && Array.isArray(history)) {
      history.forEach((msg: any) => {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      });
    }

    contents.push({ role: 'user', parts: [{ text: message }] });

    if (!isValidGeminiKeyConfigured()) {
      return res.status(400).json({ error: GEMINI_MISSING_KEY_ERROR });
    }

    const responseText = await generateTextWithGeminiFallback({
      logLabel: 'chat',
      timeoutMs: 25000,
      contents
    });

    res.json({ response: responseText });
  } catch (error: any) {
    console.error('Chat API Error Total:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- GOOGLE WORKSPACE AUTH & CALENDAR ENDPOINTS ---

const resolveGoogleRedirectUri = (req: any, fallbackFrontend?: string): string => {
  if (req.query?.redirectUri) return (req.query.redirectUri as string).trim();
  const frontend = ((req.query?.frontendUrl as string) || fallbackFrontend || process.env.FRONTEND_URL || '').trim();
  if (frontend.includes('localhost') || frontend.includes('127.0.0.1')) {
    return 'http://localhost:52823/api/auth/google/callback';
  }
  if (process.env.GOOGLE_REDIRECT_URI && process.env.GOOGLE_REDIRECT_URI.trim()) {
    return process.env.GOOGLE_REDIRECT_URI.trim();
  }
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host || '';
  const proto = req.headers?.['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  if (host && host.includes('onrender.com')) {
    return `${proto}://${host}/api/auth/google/callback`;
  }
  return 'https://purple.devlian.de/api/auth/google/callback';
};

// 0. Obtener URL de inicio de sesión con Google Workspace (@purplebtl.com)
app.get('/api/auth/google/login-url', (req, res) => {
  try {
    const frontendUrl = (req.query.frontendUrl as string) || process.env.FRONTEND_URL || 'https://purple.devlian.de';
    const redirectUri = resolveGoogleRedirectUri(req, frontendUrl);
    const url = getCalendarAuthUrl({ frontendUrl, action: 'login', redirectUri });
    res.json({ url });
  } catch (error: any) {
    console.error('Error generating Google login URL:', error);
    res.status(500).json({ error: error.message });
  }
});

// 1. Obtener URL de autenticación OAuth2 de Google para vincular calendario
app.get('/api/calendar/auth-url', (req, res) => {
  try {
    const frontendUrl = (req.query.frontendUrl as string) || process.env.FRONTEND_URL || 'https://purple.devlian.de';
    const redirectUri = resolveGoogleRedirectUri(req, frontendUrl);
    const url = getCalendarAuthUrl({ frontendUrl, action: 'calendar', redirectUri });
    res.json({ url });
  } catch (error: any) {
    console.error('Error generating calendar auth URL:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Callback unificado de Google OAuth2 (Login o Vincular Calendario)
app.get('/api/auth/google/callback', async (req, res) => {
  const { code, state, error } = req.query;

  let stateData: { frontendUrl: string; action: string; redirectUri?: string } = {
    frontendUrl: process.env.FRONTEND_URL || 'https://purple.devlian.de',
    action: 'calendar'
  };

  if (state) {
    try {
      stateData = JSON.parse(state as string);
    } catch (e) {
      stateData = { frontendUrl: state as string, action: 'calendar' };
    }
  }

  const targetOrigin = stateData.frontendUrl || process.env.FRONTEND_URL || 'https://purple.devlian.de';
  const effectiveRedirectUri = stateData.redirectUri || resolveGoogleRedirectUri(req, targetOrigin);

  if (error) {
    console.error('Google OAuth error:', error);
    const hasParams = targetOrigin.includes('?');
    const paramName = stateData.action === 'login' ? 'login_error' : 'calendar_error';
    return res.redirect(`${targetOrigin}${hasParams ? '&' : '?'}${paramName}=${encodeURIComponent(String(error))}`);
  }

  if (!code) {
    return res.status(400).send('Código de autorización de Google no proporcionado.');
  }

  try {
    const tokenData = await exchangeCodeForTokens(code as string, effectiveRedirectUri);
    const email = (tokenData.email || '').toLowerCase().trim();

    // CASO 1: INICIO DE SESIÓN CON GOOGLE WORKSPACE
    if (stateData.action === 'login') {
      const isPurpleDomain = email.endsWith('@purplebtl.com');
      const isAllowedAdmin = email === 'jose.narva@purplebtl.com' || email === 'directorio@purplebtl.com' || email === 'system@purplebtl.com';

      // Validación estricta de dominio corporativo
      if (!isPurpleDomain && !isAllowedAdmin) {
        console.warn(`Intento de login con dominio no autorizado: ${email}`);
        const hasParams = targetOrigin.includes('?');
        return res.redirect(`${targetOrigin}${hasParams ? '&' : '?'}login_error=domain_not_allowed&email=${encodeURIComponent(email)}`);
      }

      // Buscar o crear usuario en la base de datos
      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        let defaultRole = 'Producción';
        if (email.includes('directorio') || email.includes('jose.narva') || email.includes('admin')) {
          defaultRole = 'Admin';
        } else if (email.includes('cuenta')) {
          defaultRole = 'Cuentas';
        } else if (email.includes('conta')) {
          defaultRole = 'Contabilidad';
        }

        const randomPassword = crypto.randomBytes(16).toString('hex');
        const hashedPassword = await bcrypt.hash(randomPassword, 10);
        user = await prisma.user.create({
          data: {
            email,
            password: hashedPassword,
            role: defaultRole
          }
        });
        console.log(`Nuevo colaborador registrado automáticamente vía Google: ${email} con rol ${defaultRole}`);
      } else if ((email.toLowerCase().includes('jose.narva') || email.toLowerCase() === 'admin@purplebtl.com') && user.role !== 'Admin') {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { role: 'Admin' }
        });
        console.log(`Rol de Administrador confirmado para: ${email}`);
      }

      // Generar JWT de sesión corporativa
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role, name: tokenData.name },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      const userPayload = {
        id: user.id,
        email: user.email,
        role: user.role,
        name: tokenData.name || user.email.split('@')[0],
        picture: tokenData.picture || ''
      };

      const hasParams = targetOrigin.includes('?');
      return res.redirect(`${targetOrigin}${hasParams ? '&' : '?'}token=${encodeURIComponent(token)}&user=${encodeURIComponent(JSON.stringify(userPayload))}&google_login=success`);
    }

    // CASO 2: VINCULACIÓN DE CALENDARIO
    const hasParams = targetOrigin.includes('?');
    res.redirect(`${targetOrigin}${hasParams ? '&' : '?'}calendar_connected=true`);
  } catch (err: any) {
    console.error('Error en exchangeCodeForTokens:', err);
    res.status(500).send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: #ef4444;">Error de autenticación con Google</h2>
          <p>${err.message}</p>
          <a href="${targetOrigin}" style="color: #7c3aed; font-weight: bold;">Volver a SIG Purple</a>
        </body>
      </html>
    `);
  }
});

// 3. Estado de la conexión de Google Calendar
app.get('/api/calendar/status', authenticateToken, (req, res) => {
  try {
    const userEmail = resolveUserEmail(req);
    const tokens = getStoredTokens(userEmail);
    if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
      return res.json({ connected: false });
    }
    res.json({
      connected: true,
      email: tokens.email || userEmail || 'directorio@purplebtl.com',
      name: tokens.name || 'Directorio',
      picture: tokens.picture,
      connectedAt: tokens.connectedAt
    });
  } catch (error: any) {
    console.error('Error al obtener estado de Google Calendar:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Listar eventos y reuniones de Google Calendar
app.get('/api/calendar/events', authenticateToken, async (req, res) => {
  try {
    const userEmail = resolveUserEmail(req);
    const { timeMin, timeMax, maxResults } = req.query;
    const result = await getCalendarEvents({
      userEmail,
      timeMin: timeMin as string,
      timeMax: timeMax as string,
      maxResults: maxResults ? parseInt(maxResults as string, 10) : undefined
    });
    res.json(result);
  } catch (error: any) {
    console.error('Error al obtener eventos de Google Calendar:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Desconectar cuenta de Google Calendar
app.post('/api/calendar/disconnect', authenticateToken, (req, res) => {
  try {
    const userEmail = resolveUserEmail(req);
    deleteTokens(userEmail);
    res.json({ success: true, message: 'Google Calendar desconectado exitosamente' });
  } catch (error: any) {
    console.error('Error al desconectar Google Calendar:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6. Crear un evento o reunión con Google Meet
app.post('/api/calendar/events', authenticateToken, async (req, res) => {
  try {
    const userEmail = resolveUserEmail(req);
    const { title, description, start, end, attendees, addMeet } = req.body;
    if (!title || !start || !end) {
      return res.status(400).json({ error: 'title, start y end son requeridos' });
    }
    const event = await createCalendarEvent({ title, description, start, end, attendees, addMeet, userEmail });
    res.json({ success: true, event });
  } catch (error: any) {
    console.error('Error al crear evento en Google Calendar:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// RUTAS DE GOOGLE DRIVE & UNIDADES COMPARTIDAS
// ==========================================

// 1. Listar Unidades Compartidas (Shared Drives)
app.get('/api/drive/shared-drives', authenticateToken, async (req: any, res: any) => {
  try {
    const userEmail = resolveUserEmail(req);
    const drives = await listSharedDrives(userEmail);
    res.json({ drives });
  } catch (error: any) {
    console.error('Error in /api/drive/shared-drives:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Listar archivos y carpetas dentro de una Unidad Compartida o carpeta
app.get('/api/drive/files', authenticateToken, async (req: any, res: any) => {
  try {
    const userEmail = resolveUserEmail(req);
    const { driveId, folderId, searchTerm, pageToken, pageSize } = req.query;
    const result = await listDriveFiles(userEmail, {
      driveId: driveId ? String(driveId) : undefined,
      folderId: folderId ? String(folderId) : undefined,
      searchTerm: searchTerm ? String(searchTerm) : undefined,
      pageToken: pageToken ? String(pageToken) : undefined,
      pageSize: pageSize ? parseInt(String(pageSize), 10) : undefined
    });
    res.json(result);
  } catch (error: any) {
    console.error('Error in /api/drive/files:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Crear nueva carpeta en Google Drive
app.post('/api/drive/folder', authenticateToken, async (req: any, res: any) => {
  try {
    const userEmail = resolveUserEmail(req);
    const { name, parentFolderId, driveId } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nombre de la carpeta es requerido' });
    }
    const folder = await createDriveFolder(userEmail, {
      name: name.trim(),
      parentFolderId,
      driveId
    });
    res.json({ success: true, folder });
  } catch (error: any) {
    console.error('Error in /api/drive/folder:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'SIG Purple Backend API',
    port: PORT
  });
});

const server = app.listen(PORT, () => console.log(`🚀 Backend listo en http://localhost:${PORT} (Puerto ${PORT})`));
meetingManager.initWebSocket(server);

// Google OAuth callback listener secundario:
// Google Cloud Console exige URIs de redirección exactas (registrada como http://localhost:52823/api/auth/google/callback).
// Cuando el backend se lanza con un puerto dinámico (ej. vía AppLauncher), levantamos también el listener en 52823
// para recibir el callback de Google y redirigir automáticamente al frontend dinámico activo.
let oauthPort: number | null = 52823;
try {
  const parsedRedirect = new URL(process.env.GOOGLE_REDIRECT_URI || 'http://localhost:52823/api/auth/google/callback');
  if (parsedRedirect.port) {
    oauthPort = parseInt(parsedRedirect.port, 10);
  }
} catch {
  oauthPort = 52823;
}

if (oauthPort && Number(PORT) !== oauthPort) {
  try {
    const oauthServer = http.createServer(app);
    oauthServer.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`ℹ️ [OAuth Listener] El puerto ${oauthPort} ya está en uso por otra instancia.`);
      } else {
        console.warn(`⚠️ [OAuth Listener] No se pudo enlazar el puerto ${oauthPort}: ${err.message}`);
      }
    });
    oauthServer.listen(oauthPort, () => {
      console.log(`🔑 Google OAuth Listener activo en http://localhost:${oauthPort} para recibir callbacks de Google`);
    });
  } catch (err: any) {
    console.warn(`⚠️ [OAuth Listener] Error al iniciar listener en puerto ${oauthPort}:`, err);
  }
}