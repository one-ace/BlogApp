const nodemailer = require('nodemailer');

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user, pass },
    });
  }

  return null;
}

async function sendPasswordResetEmail({ to, resetUrl, fullName }) {
  const from = process.env.SMTP_FROM || '"Blog App" <no-reply@blogapp.io>';
  const recipientName = fullName || 'Reader';
  const transporter = getTransporter();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #fcfbf9; margin: 0; padding: 20px; color: #18181b; }
        .container { max-width: 520px; margin: 20px auto; background: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 32px 28px; box-shadow: 0 4px 12px rgba(0,0,0,0.03); }
        .brand { font-size: 1.25rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 24px; color: #18181b; }
        h1 { font-size: 1.4rem; font-weight: 600; margin-bottom: 12px; color: #18181b; }
        p { font-size: 0.95rem; line-height: 1.6; color: #52525b; margin-bottom: 20px; }
        .btn { display: inline-block; background-color: #18181b; color: #ffffff !important; text-decoration: none; font-weight: 600; font-size: 0.95rem; padding: 12px 24px; border-radius: 8px; margin: 12px 0 24px 0; }
        .btn:hover { background-color: #27272a; }
        .footer { font-size: 0.8rem; color: #a1a1aa; border-top: 1px solid #f4f4f5; padding-top: 18px; margin-top: 24px; }
        .break-link { word-break: break-all; color: #71717a; font-size: 0.85rem; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="brand">Blog App</div>
        <h1>Reset Your Password</h1>
        <p>Hello ${recipientName},</p>
        <p>We received a request to reset the password for your Blog App account. Click the button below to set a new password. This link will expire in <strong>1 hour</strong>.</p>
        <div>
          <a href="${resetUrl}" class="btn" target="_blank">Reset Password</a>
        </div>
        <p>If you did not request a password reset, you can safely ignore this email — your account remains secure.</p>
        <div class="footer">
          <p style="margin-bottom: 8px;">If the button above doesn't work, copy and paste this link into your browser:</p>
          <a href="${resetUrl}" class="break-link">${resetUrl}</a>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
Hello ${recipientName},

We received a request to reset the password for your Blog App account.

Please visit the link below to set a new password (link expires in 1 hour):
${resetUrl}

If you did not request a password reset, you can safely ignore this message.
`;

  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from,
        to,
        subject: 'Reset your Blog App password',
        text: textContent,
        html: htmlContent,
      });
      return { success: true, messageId: info.messageId, simulated: false };
    } catch (err) {
      console.error('[EmailService] SMTP error sending password reset:', err);
      // Fallback to console log in case of SMTP failure
      console.log(`[EmailService Fallback] Reset URL for ${to}: ${resetUrl}`);
      return { success: false, error: err.message, resetUrl, simulated: true };
    }
  } else {
    // Development / Local mode without SMTP
    console.log('\n======================================================');
    console.log(`[EmailService] Password Reset requested for: ${to}`);
    console.log(`Reset URL: ${resetUrl}`);
    console.log('======================================================\n');
    return { success: true, simulated: true, resetUrl };
  }
}

module.exports = {
  sendPasswordResetEmail,
};
