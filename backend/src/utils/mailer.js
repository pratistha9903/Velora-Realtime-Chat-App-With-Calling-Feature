import nodemailer from 'nodemailer';

let transporter = null;

const APP_NAME = process.env.APP_NAME || 'Velora';

function smtpConfig() {
  const host = (process.env.SMTP_HOST || '').trim();
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
  const from = (process.env.SMTP_FROM || user).trim();
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true';
  return { host, user, pass, from, port, secure };
}

function getTransporter() {
  if (transporter) return transporter;

  const { host, user, pass, port, secure } = smtpConfig();
  if (!host || !user || !pass) return null;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  return transporter;
}

export function isEmailConfigured() {
  const { host, user, pass } = smtpConfig();
  return Boolean(host && user && pass);
}

export async function verifySmtpConnection() {
  const mailer = getTransporter();
  if (!mailer) {
    throw new Error('SMTP not configured');
  }
  await mailer.verify();
  return true;
}

export async function sendPasswordResetEmail({ to, resetUrl, displayName }) {
  const mailer = getTransporter();
  const { from, user } = smtpConfig();

  if (!mailer) {
    const err = new Error('Email is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in backend/.env');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  const name = displayName || 'there';
  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#0a0e14;color:#f1f5f9;border-radius:18px;border:1px solid rgba(148,163,184,0.12)">
      <h2 style="margin:0 0 12px;color:#f8fafc;font-size:22px">Reset your ${APP_NAME} password</h2>
      <p style="color:#94a3b8;line-height:1.6;margin:0 0 12px">Hi ${name},</p>
      <p style="color:#94a3b8;line-height:1.6;margin:0 0 8px">We received a request to reset your password. Click the button below to choose a new password. For your security, this link expires in <strong style="color:#99f6e4">1 hour</strong>.</p>
      <p style="margin:28px 0">
        <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#0d9488,#14b8a6);color:#fff;text-decoration:none;padding:13px 24px;border-radius:12px;font-weight:600;box-shadow:0 8px 24px rgba(20,184,166,0.35)">
          Reset password
        </a>
      </p>
      <p style="color:#64748b;font-size:13px;line-height:1.55">If the button does not work, copy and paste this link into your browser:<br/>
        <a href="${resetUrl}" style="color:#5eead4;word-break:break-all">${resetUrl}</a>
      </p>
      <p style="color:#475569;font-size:12px;margin-top:24px;line-height:1.5">If you did not request a password reset, you can safely ignore this email. Your password will not change.</p>
    </div>
  `;

  await mailer.sendMail({
    from: from || user,
    to,
    subject: `${APP_NAME} — Reset your password`,
    text: `Hi ${name},\n\nReset your ${APP_NAME} password using this link (expires in 1 hour):\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
    html,
  });
}

export default { sendPasswordResetEmail, isEmailConfigured, verifySmtpConnection };
