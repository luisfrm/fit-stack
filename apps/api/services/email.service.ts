import nodemailer from 'nodemailer';
import { Resend } from 'resend';

export const emailService = {
  /**
   * Sends an invitation email to the member.
   */
  async sendRegistrationInvite(email: string, token: string) {
    const cmsUrl = process.env.FRONTEND_URL || "http://localhost:3001";
    const inviteLink = `${cmsUrl}/register?token=${token}`;
    const provider = process.env.EMAIL_PROVIDER || 'gmail';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #050505; color: #ffffff; margin: 0; padding: 20px; }
              .container { max-width: 500px; margin: 40px auto; background: #0f0f0f; border: 1px solid #1f1f1f; border-radius: 16px; padding: 40px; text-align: center; }
              .logo { font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; margin-bottom: 32px; display: block; text-decoration: none; text-transform: uppercase; }
              .title { font-size: 24px; font-weight: 700; margin-bottom: 16px; color: #ffffff; }
              .text { font-size: 15px; line-height: 1.6; color: #a1a1aa; margin-bottom: 32px; }
              .button { display: inline-block; background: #ffffff; color: #000000; padding: 14px 28px; border-radius: 8px; font-weight: 600; text-decoration: none; font-size: 15px; }
              .footer { margin-top: 48px; font-size: 12px; color: #52525b; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="logo">FIT-STACK</div>
              <h1 class="title">Invitación al Equipo</h1>
              <p class="text">Has sido invitado a unirte a la plataforma de gestión. Haz clic en el botón de abajo para activar tu cuenta y configurar tu contraseña.</p>
              <a href="${inviteLink}" class="button">Activar mi cuenta</a>
              <p class="text" style="margin-top: 32px; font-size: 13px;">Este enlace es válido por 48 horas.</p>
          </div>
          <div class="footer">
              &copy; ${new Date().getFullYear()} Fit-Stack Engine PD.
          </div>
      </body>
      </html>
    `;

    try {
      if (provider === 'resend' && process.env.RESEND_API_KEY) {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
          to: email,
          subject: 'Invitación para registrarse en Gym CMS',
          html: htmlContent,
        });
        console.log(`✉️  [RESEND] Email enviado a ${email}`);
        return true;
      }

      if (provider === 'gmail' && process.env.SMTP_USER && process.env.SMTP_PASS) {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        await transporter.sendMail({
          from: `"Fit-Stack" <${process.env.SMTP_USER}>`,
          to: email,
          subject: 'Invitación para registrarse en Gym CMS',
          html: htmlContent,
        });
        console.log(`✉️  [GMAIL SMTP] Email enviado a ${email}`);
        return true;
      }

      throw new Error(`Configuración de email incompleta para el proveedor: ${provider}`);
    } catch (error) {
      console.error('❌ Error enviando email:', error);
      return false;
    }
  }
};
