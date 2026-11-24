import nodemailer from 'nodemailer';
import fs from 'fs';
import net from 'net';
import path from 'path';

export interface SmtpConfig {
  host?: string;
  port?: number;
  user: string;
  pass: string;
}

export interface HttpsEmailConfig {
  webhookUrl?: string | null;
  webhookSecret?: string | null;
  brevoApiKey?: string | null;
  resendApiKey?: string | null;
  fromEmail?: string | null;
}

interface NormalizedAttachment {
  filename: string;
  content: Buffer;
  contentBase64: string;
  contentType: string;
}

const SMTP_BLOCK_CACHE_TTL_MS = 10 * 60 * 1000;
let lastSmtpBlockedAt = 0;

export const isSmtpCurrentlyBlocked = (): boolean =>
  lastSmtpBlockedAt > 0 && Date.now() - lastSmtpBlockedAt < SMTP_BLOCK_CACHE_TTL_MS;

const isNetworkBlockError = (err: any): boolean => {
  const code = String(err?.code || '').toUpperCase();
  const msg = String(err?.message || '').toLowerCase();
  return (
    ['ETIMEDOUT', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ESOCKET', 'EAI_AGAIN'].includes(code) ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('greeting never received') ||
    msg.includes('econnrefused')
  );
};

const parseEmailList = (value?: string): string[] =>
  (value || '')
    .split(',')
    .map(e => e.trim())
    .filter(e => Boolean(e) && e.includes('@'));

const inferMimeType = (filename: string, explicit?: string): string => {
  if (explicit) return explicit;
  const ext = path.extname(filename || '').toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return 'application/octet-stream';
};

const normalizeAttachments = (attachments?: any[]): NormalizedAttachment[] => {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];
  const normalized: NormalizedAttachment[] = [];

  for (const att of attachments) {
    if (!att) continue;
    const filename = String(att.filename || att.name || 'adjunto.pdf').trim();
    let buffer: Buffer | null = null;

    if (Buffer.isBuffer(att.content)) {
      buffer = att.content;
    } else if (typeof att.content === 'string') {
      buffer = Buffer.from(att.content, att.encoding === 'base64' ? 'base64' : 'utf8');
    } else if (att.path && typeof att.path === 'string' && fs.existsSync(att.path)) {
      buffer = fs.readFileSync(att.path);
    }

    if (buffer) {
      normalized.push({
        filename,
        content: buffer,
        contentBase64: buffer.toString('base64'),
        contentType: inferMimeType(filename, att.contentType)
      });
    }
  }

  return normalized;
};

const resolveEffectiveHttpsConfig = (httpsConfig?: HttpsEmailConfig) => {
  const webhookUrl = (httpsConfig?.webhookUrl || process.env.EMAIL_WEBHOOK_URL || '').trim();
  const webhookSecret = (httpsConfig?.webhookSecret || process.env.EMAIL_WEBHOOK_SECRET || '').trim();
  const brevoApiKey = (httpsConfig?.brevoApiKey || process.env.BREVO_API_KEY || '').trim();
  const resendApiKey = (httpsConfig?.resendApiKey || process.env.RESEND_API_KEY || '').trim();
  const fromEmail = (httpsConfig?.fromEmail || process.env.EMAIL_FROM || process.env.SMTP_USER || '').trim();

  return { webhookUrl, webhookSecret, brevoApiKey, resendApiKey, fromEmail };
};

export const hasConfiguredHttpsTransport = (httpsConfig?: HttpsEmailConfig) => {
  const cfg = resolveEffectiveHttpsConfig(httpsConfig);
  const providers: string[] = [];
  if (cfg.webhookUrl) providers.push('Google Apps Script / Webhook HTTPS');
  if (cfg.brevoApiKey) providers.push('Brevo API');
  if (cfg.resendApiKey) providers.push('Resend API');
  return {
    configured: providers.length > 0,
    providers
  };
};

const resolveSmtpParams = (userSmtp?: SmtpConfig) => {
  const host = ((userSmtp?.host && userSmtp.host.trim()) || process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const port = Number(userSmtp?.port || process.env.SMTP_PORT || 587);
  const user = ((userSmtp?.user && userSmtp.user.trim()) || process.env.SMTP_USER || '').trim();
  const rawPass = (userSmtp?.pass && userSmtp.pass.trim()) || process.env.SMTP_PASS || '';
  const pass = rawPass ? rawPass.replace(/\s+/g, '') : '';
  return { host, port, user, pass };
};

async function sendViaWebhook(
  webhookUrl: string,
  webhookSecret: string,
  params: { to: string[]; cc: string[]; fromEmail?: string; subject: string; html: string; attachments: NormalizedAttachment[] }
) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(25000),
    body: JSON.stringify({
      secret: webhookSecret || undefined,
      to: params.to.join(', '),
      cc: params.cc.length > 0 ? params.cc.join(', ') : undefined,
      from: params.fromEmail || undefined,
      subject: params.subject,
      html: params.html,
      attachments: params.attachments.map(a => ({
        filename: a.filename,
        contentType: a.contentType,
        contentBase64: a.contentBase64
      }))
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Webhook HTTPS HTTP ${response.status}: ${text.slice(0, 220)}`);
  }

  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Google Apps Script might return non-JSON HTML error page on auth issue
    if (text.toLowerCase().includes('accounts.google.com') || text.toLowerCase().includes('<!doctype html>')) {
      throw new Error('El Web App de Google Apps Script requiere acceso público ("Cualquier usuario" / Anyone) para aceptar envíos del servidor.');
    }
  }

  if (parsed && (parsed.success === false || parsed.ok === false || parsed.error)) {
    throw new Error(parsed.error || parsed.message || 'El Webhook HTTPS rechazó el envío');
  }

  return { transport: 'https_webhook', messageId: parsed?.messageId || 'webhook-ok' };
}

async function sendViaBrevo(
  apiKey: string,
  params: { to: string[]; cc: string[]; fromEmail: string; subject: string; html: string; attachments: NormalizedAttachment[] }
) {
  if (!params.fromEmail || !params.fromEmail.includes('@')) {
    throw new Error('Configura un correo remitente válido (ej. jose.narva@purplebtl.com) para enviar vía Brevo.');
  }

  const body: any = {
    sender: { name: 'SIG Purple BTL', email: params.fromEmail },
    to: params.to.map(email => ({ email })),
    subject: params.subject,
    htmlContent: params.html
  };
  if (params.cc.length > 0) {
    body.cc = params.cc.map(email => ({ email }));
  }
  if (params.attachments.length > 0) {
    body.attachment = params.attachments.map(a => ({
      name: a.filename,
      content: a.contentBase64
    }));
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    signal: AbortSignal.timeout(25000),
    body: JSON.stringify(body)
  });

  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Brevo API (${response.status}): ${data?.message || JSON.stringify(data)}`);
  }

  return { transport: 'https_brevo', messageId: data?.messageId || 'brevo-ok' };
}

async function sendViaResend(
  apiKey: string,
  params: { to: string[]; cc: string[]; fromEmail: string; subject: string; html: string; attachments: NormalizedAttachment[] }
) {
  const from = params.fromEmail && params.fromEmail.includes('@')
    ? `SIG Purple BTL <${params.fromEmail}>`
    : 'SIG Purple BTL <onboarding@resend.dev>';

  const body: any = {
    from,
    to: params.to,
    subject: params.subject,
    html: params.html
  };
  if (params.cc.length > 0) body.cc = params.cc;
  if (params.attachments.length > 0) {
    body.attachments = params.attachments.map(a => ({
      filename: a.filename,
      content: a.contentBase64
    }));
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    signal: AbortSignal.timeout(25000),
    body: JSON.stringify(body)
  });

  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Resend API (${response.status}): ${data?.message || data?.error || JSON.stringify(data)}`);
  }

  return { transport: 'https_resend', messageId: data?.id || 'resend-ok' };
}

async function tryConfiguredHttpsProviders(
  httpsCfg: ReturnType<typeof resolveEffectiveHttpsConfig>,
  params: { to: string[]; cc: string[]; fallbackFromEmail: string; subject: string; html: string; attachments: NormalizedAttachment[] }
) {
  const effectiveFrom = httpsCfg.fromEmail || params.fallbackFromEmail;
  const errors: string[] = [];

  if (httpsCfg.webhookUrl) {
    try {
      return await sendViaWebhook(httpsCfg.webhookUrl, httpsCfg.webhookSecret, {
        ...params,
        fromEmail: effectiveFrom
      });
    } catch (err: any) {
      errors.push(`Webhook HTTPS: ${err?.message || err}`);
    }
  }

  if (httpsCfg.brevoApiKey) {
    try {
      return await sendViaBrevo(httpsCfg.brevoApiKey, {
        ...params,
        fromEmail: effectiveFrom
      });
    } catch (err: any) {
      errors.push(`Brevo API: ${err?.message || err}`);
    }
  }

  if (httpsCfg.resendApiKey) {
    try {
      return await sendViaResend(httpsCfg.resendApiKey, {
        ...params,
        fromEmail: effectiveFrom
      });
    } catch (err: any) {
      errors.push(`Resend API: ${err?.message || err}`);
    }
  }

  throw new Error(errors.join(' | '));
}

async function sendViaSmtpAttempt(
  host: string,
  port: number,
  user: string,
  pass: string,
  params: { to: string[]; cc: string[]; subject: string; html: string; attachments: NormalizedAttachment[] },
  timeoutMs: number
) {
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: Math.max(timeoutMs, 15000),
    auth: { user, pass }
  });

  const mailOptions: any = {
    from: `"SIG Purple BTL" <${user}>`,
    to: params.to.join(', '),
    subject: params.subject,
    html: params.html,
    attachments: params.attachments.map(a => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType
    }))
  };

  if (params.cc.length > 0) {
    mailOptions.cc = params.cc.join(', ');
  }

  const info = await transporter.sendMail(mailOptions);
  lastSmtpBlockedAt = 0; // SMTP works cleanly
  return { transport: `smtp:${port}`, messageId: info.messageId };
}

export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  attachments?: any[],
  userSmtp?: SmtpConfig,
  cc?: string,
  httpsConfig?: HttpsEmailConfig
) => {
  const toList = parseEmailList(to);
  const ccList = parseEmailList(cc);
  if (toList.length === 0) {
    throw new Error('No se especificó ningún destinatario de correo válido.');
  }

  const smtp = resolveSmtpParams(userSmtp);
  const httpsCfg = resolveEffectiveHttpsConfig(httpsConfig);
  const hasHttps = Boolean(httpsCfg.webhookUrl || httpsCfg.brevoApiKey || httpsCfg.resendApiKey);
  const hasSmtp = Boolean(smtp.user && smtp.pass);

  if (!hasSmtp && !hasHttps) {
    throw new Error(`No hay credenciales SMTP ni envío por HTTPS configurados. Destinatario: ${to}`);
  }

  const normalizedAttachments = normalizeAttachments(attachments);
  const payload = {
    to: toList,
    cc: ccList,
    subject,
    html,
    attachments: normalizedAttachments,
    fallbackFromEmail: smtp.user
  };

  const preferHttps =
    hasHttps &&
    (process.env.EMAIL_FORCE_HTTPS === 'true' ||
      process.env.RENDER === 'true' ||
      isSmtpCurrentlyBlocked() ||
      !hasSmtp);

  if (preferHttps) {
    try {
      const result = await tryConfiguredHttpsProviders(httpsCfg, payload);
      console.log(`📧 Correo enviado por [${result.transport}] a ${toList.join(', ')} (${result.messageId})`);
      return result;
    } catch (httpsErr: any) {
      console.warn(`⚠️ Fallo envío HTTPS (${httpsErr?.message}), verificando respaldo SMTP...`);
      if (!hasSmtp || isSmtpCurrentlyBlocked()) {
        throw httpsErr;
      }
    }
  }

  if (!hasSmtp) {
    throw new Error('Las credenciales SMTP no están configuradas ni en el usuario ni en el sistema.');
  }

  try {
    const result = await sendViaSmtpAttempt(smtp.host, smtp.port, smtp.user, smtp.pass, payload, 8000);
    console.log(`📧 Correo enviado por SMTP (${smtp.host}:${smtp.port}) a ${toList.join(', ')}: ${result.messageId}`);
    return result;
  } catch (smtpErr: any) {
    // If primary port (e.g. 587) fails due to network timeout/refusal, try 465 once if no HTTPS was tried yet
    if (isNetworkBlockError(smtpErr) && smtp.port === 587) {
      try {
        const result465 = await sendViaSmtpAttempt(smtp.host, 465, smtp.user, smtp.pass, payload, 5000);
        console.log(`📧 Correo enviado por SMTP (${smtp.host}:465) a ${toList.join(', ')}: ${result465.messageId}`);
        return result465;
      } catch (err465: any) {
        if (isNetworkBlockError(err465)) {
          lastSmtpBlockedAt = Date.now();
        }
      }
    } else if (isNetworkBlockError(smtpErr)) {
      lastSmtpBlockedAt = Date.now();
    }

    if (hasHttps && !preferHttps) {
      try {
        const fallbackResult = await tryConfiguredHttpsProviders(httpsCfg, payload);
        console.log(`📧 Correo enviado por respaldo [${fallbackResult.transport}] a ${toList.join(', ')}`);
        return fallbackResult;
      } catch (httpsFallbackErr: any) {
        throw new Error(`SMTP falló (${smtpErr?.message}) y respaldo HTTPS falló (${httpsFallbackErr?.message}).`);
      }
    }

    if (isNetworkBlockError(smtpErr)) {
      throw new Error(
        `Conexión SMTP bloqueada o agotada (${smtp.host}:${smtp.port} -> ${smtpErr?.code || smtpErr?.message}). En planes gratuitos de Render los puertos SMTP 25/465/587 están bloqueados: configura envío por HTTPS (Google Apps Script / Brevo / Resend) en Configuración > Correos.`
      );
    }

    console.error(`❌ Error al enviar correo a ${to} desde ${smtp.user}:`, smtpErr?.message || smtpErr);
    throw smtpErr;
  }
};

function probeTcpPort(host: string, port: number, timeoutMs = 4000): Promise<{ ok: boolean; latencyMs: number; code?: string; error?: string }> {
  return new Promise(resolve => {
    const start = Date.now();
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (result: { ok: boolean; latencyMs: number; code?: string; error?: string }) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => finish({ ok: true, latencyMs: Date.now() - start }));
    socket.on('timeout', () => finish({ ok: false, latencyMs: Date.now() - start, code: 'ETIMEDOUT', error: `Timeout (${timeoutMs}ms)` }));
    socket.on('error', (err: any) => finish({ ok: false, latencyMs: Date.now() - start, code: err?.code, error: err?.message }));
  });
}

/**
 * Diagnóstico no destructivo (NO envía ningún correo):
 * - Prueba conexión TCP a puertos SMTP 587 y 465
 * - Ejecuta transporter.verify() si el puerto responde
 * - Verifica qué proveedores HTTPS (port 443) están configurados
 */
export async function diagnoseEmailConnectivity(userSmtp?: SmtpConfig, httpsConfig?: HttpsEmailConfig) {
  const smtp = resolveSmtpParams(userSmtp);
  const httpsInfo = hasConfiguredHttpsTransport(httpsConfig);
  const hasSmtpCredentials = Boolean(smtp.user && smtp.pass);

  const [probe587, probe465] = await Promise.all([
    probeTcpPort(smtp.host, 587, 4500),
    probeTcpPort(smtp.host, 465, 4500)
  ]);

  let smtpVerifyOk = false;
  let smtpVerifyError: string | null = null;

  if (hasSmtpCredentials && (probe587.ok || probe465.ok)) {
    const workingPort = probe587.ok ? (smtp.port || 587) : 465;
    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: workingPort,
        secure: workingPort === 465,
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        auth: { user: smtp.user, pass: smtp.pass }
      });
      await transporter.verify();
      smtpVerifyOk = true;
      lastSmtpBlockedAt = 0;
    } catch (err: any) {
      smtpVerifyError = err?.message || 'Error de autenticación SMTP';
    }
  } else if (!hasSmtpCredentials) {
    smtpVerifyError = 'No hay usuario/contraseña SMTP configurados en DB ni variables de entorno.';
  } else {
    lastSmtpBlockedAt = Date.now();
    smtpVerifyError = `Puertos SMTP bloqueados o inaccesibles desde este servidor (587: ${probe587.code || probe587.error}, 465: ${probe465.code || probe465.error}).`;
  }

  const smtpBlockedByHosting = !probe587.ok && !probe465.ok;

  return {
    environment: process.env.RENDER ? 'render' : 'local',
    hasSmtpCredentials,
    smtpHost: smtp.host,
    smtpPort: smtp.port,
    smtpUser: smtp.user || null,
    ports: {
      port587: probe587,
      port465: probe465
    },
    smtpBlockedByHosting,
    smtpVerifyOk,
    smtpVerifyError,
    httpsRelay: httpsInfo,
    canSendEmail: smtpVerifyOk || httpsInfo.configured
  };
}
