require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { sendEmail } = require('../dist/services/emailService');

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findFirst({
    where: { smtpPass: { not: null }, smtpUser: { not: null } }
  });

  if (!admin) {
    console.error('No se encontró usuario con SMTP configurado');
    return;
  }

  const smtp = {
    host: admin.smtpHost || 'smtp.gmail.com',
    port: admin.smtpPort || 587,
    user: admin.smtpUser,
    pass: admin.smtpPass
  };

  const config = await prisma.appConfig.findUnique({ where: { id: 'global' } });
  const internalEmails = (config?.notificacionPagosEmails || 'renato.perez@purplebtl.com, eric.higa@purplebtl.com')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean);

  // Buscar los pagos de hoy (2026-11-24)
  const pagos = await prisma.pago.findMany({
    where: { fechaRegistro: '2026-11-24' },
    include: {
      proveedor: { include: { cuentas: true } },
      proyecto: true,
      cliente: true,
      orden: true
    },
    orderBy: { fechaRegistro: 'desc' }
  });

  console.log(`Encontrados ${pagos.length} pagos registrados hoy.`);

  for (const pago of pagos) {
    const recipients = new Set(internalEmails);
    recipients.add('jose.narva@purplebtl.com');
    if (pago.proveedor?.correo && pago.proveedor.correo.trim()) {
      recipients.add(pago.proveedor.correo.trim());
    }

    const to = Array.from(recipients).join(', ');
    const provName = pago.proveedor?.razonSocial || pago.proveedor?.nombre || 'Proveedor';
    const proyName = pago.proyecto?.nombre || 'Proyecto';
    const cuenta = pago.proveedor?.cuentas?.[0];

    const subject = `Pago a proveedor ${pago.id} ${proyName} ${provName} ${pago.concepto || ''}`.trim();

    const comprobanteLink = pago.comprobanteUrl
      ? (pago.comprobanteUrl.startsWith('http')
          ? `<p><strong>Comprobante / Factura:</strong> <a href="${pago.comprobanteUrl}">${pago.numeroComprobante || 'Ver Comprobante'}</a></p>`
          : `<p><strong>Comprobante:</strong> ${pago.numeroComprobante || 'Adjunto en sistema'}</p>`)
      : '';

    const html = `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px;">
        <h3 style="color: #7c3aed; margin-bottom: 10px;">Notificación de Pago Registrado — SIG Purple</h3>
        <p>Se ha registrado un pago para el proveedor <strong>${provName}</strong>.</p>
        <p><strong>Proyecto:</strong> ${proyName} (${pago.cliente?.empresa || 'Cliente'})</p>
        <p><strong>Monto a Pagar:</strong> <span style="font-size: 16px; font-weight: bold; color: #16a34a;">S/ ${Number(pago.monto || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span></p>
        <p><strong>Fecha Programada de Pago:</strong> ${pago.fechaPago || pago.fechaRegistro}</p>
        <p><strong>Orden Vinculada:</strong> ${pago.ordenId || '-'}</p>
        <p><strong>Concepto:</strong> ${pago.concepto || '-'}</p>
        ${comprobanteLink}
        
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-top: 16px;">
          <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #475569;">Datos Bancarios del Proveedor:</h4>
          <p style="margin: 3px 0; font-size: 12px;"><strong>RUC:</strong> ${pago.proveedor?.ruc || '-'}</p>
          <p style="margin: 3px 0; font-size: 12px;"><strong>Banco:</strong> ${cuenta?.banco || '-'}</p>
          <p style="margin: 3px 0; font-size: 12px;"><strong>Tipo de Cuenta:</strong> ${cuenta?.tipoCuenta || '-'}</p>
          <p style="margin: 3px 0; font-size: 12px;"><strong>N° de Cuenta:</strong> ${cuenta?.numeroCuenta || '-'}</p>
          <p style="margin: 3px 0; font-size: 12px;"><strong>CCI:</strong> ${cuenta?.cci || '-'}</p>
        </div>
        <p style="margin-top: 20px; font-size: 12px; color: #94a3b8;">Mensaje automático emitido desde el Sistema Integrado de Gestión (SIG Purple BTL).</p>
      </div>
    `;

    try {
      await sendEmail(to, subject, html, [], smtp);
      console.log(`✅ Correo enviado exitosamente para ${pago.id} a: ${to}`);
    } catch (err) {
      console.error(`❌ Error al enviar correo para ${pago.id}:`, err.message);
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
