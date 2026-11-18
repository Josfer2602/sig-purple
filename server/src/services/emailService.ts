import nodemailer from 'nodemailer';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

export const sendEmail = async (to: string, subject: string, html: string, attachments?: any[], userSmtp?: SmtpConfig, cc?: string) => {
  const host = (userSmtp?.host && userSmtp.host.trim()) || process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = userSmtp?.port || parseInt(process.env.SMTP_PORT || '587');
  const user = (userSmtp?.user && userSmtp.user.trim()) || process.env.SMTP_USER;
  const rawPass = (userSmtp?.pass && userSmtp.pass.trim()) || process.env.SMTP_PASS;
  const pass = rawPass ? rawPass.replace(/\s+/g, '') : '';

  if (!user || !pass) {
    const errorMsg = `⚠️ No se pueden enviar correos: las credenciales SMTP no están configuradas ni a nivel de sistema ni en el perfil del usuario. Destinatario: ${to}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 20000,
    auth: {
      user: user.trim(),
      pass,
    },
  });

  const mailOptions: any = {
    from: `"SIG PURPLE BTL" <${user}>`,
    to,
    subject,
    html,
    attachments,
  };

  if (cc && cc.trim()) {
    mailOptions.cc = cc.trim();
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Message sent: %s', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};
