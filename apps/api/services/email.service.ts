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
  },

  /**
   * Sends a Slack-style invitation email for existing users.
   */
  async sendOrganizationInvite(email: string, orgName: string, inviterName: string, inviteLink: string) {
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
              <h1 class="title">Nueva Invitación</h1>
              <p class="text"><strong>${inviterName}</strong> te ha invitado a unirte al equipo de <strong>${orgName}</strong>.</p>
              <a href="${inviteLink}" class="button">Unirme a ${orgName}</a>
              <p class="text" style="margin-top: 32px; font-size: 13px;">Haz clic en el botón para aceptar la invitación y acceder al panel de la sede.</p>
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
          subject: `Invitación para unirte a ${orgName}`,
          html: htmlContent,
        });
        return true;
      }

      if (provider === 'gmail' && process.env.SMTP_USER && process.env.SMTP_PASS) {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });

        await transporter.sendMail({
          from: `"Fit-Stack" <${process.env.SMTP_USER}>`,
          to: email,
          subject: `Invitación para unirte a ${orgName}`,
          html: htmlContent,
        });
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ Error enviando email de invitación de organización:', error);
      return false;
    }
  },

  /**
   * Sends a payment receipt email to the member.
   */
  async sendPaymentReceipt(email: string, data: any, attachments?: any[]) {
    const provider = process.env.EMAIL_PROVIDER || 'gmail';
    const dateStr = new Date(data.paymentDate).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    const receiptTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; color: #18181b; margin: 0; padding: 20px; }
              .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e4e4e7; }
              .header { background: #facc15; padding: 40px; text-align: center; }
              .header h1 { margin: 0; font-size: 24px; font-weight: 800; color: #000000; text-transform: uppercase; letter-spacing: 0.1em; }
              .header p { margin: 8px 0 0; font-size: 12px; font-weight: 700; color: rgba(0,0,0,0.5); font-family: monospace; }
              .content { padding: 40px; }
              .client-info { display: table; width: 100%; margin-bottom: 40px; }
              .info-col { display: table-cell; width: 50%; }
              .info-label { font-size: 10px; font-weight: 700; color: #71717a; text-transform: uppercase; margin-bottom: 4px; }
              .info-value { font-size: 15px; font-weight: 700; color: #000000; }
              .item-row { display: table; width: 100%; padding: 16px 0; border-bottom: 1px solid #f4f4f5; }
              .item-desc { display: table-cell; width: 70%; font-size: 14px; color: #18181b; font-weight: 600; }
              .item-price { display: table-cell; width: 30%; text-align: right; font-size: 16px; font-weight: 800; color: #000000; }
              .total-box { margin-top: 40px; background: #fafafa; padding: 24px; border-radius: 8px; border: 1px dashed #e4e4e7; }
              .total-row { display: table; width: 100%; }
              .total-label { display: table-cell; vertical-align: middle; }
              .total-label-text { font-size: 10px; font-weight: 800; color: #eab308; text-transform: uppercase; letter-spacing: 0.1em; }
              .total-value { display: table-cell; text-align: right; font-size: 24px; font-weight: 800; color: #eab308; }
              .details { margin-top: 32px; padding-top: 24px; border-top: 1px solid #f4f4f5; font-size: 12px; color: #71717a; }
              .footer { padding: 20px; text-align: center; font-size: 11px; color: #a1a1aa; border-top: 1px solid #f4f4f5; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>Comprobante de Pago</h1>
                  <p>Operación #${data.paymentId || '---'}</p>
              </div>
              <div class="content">
                  <div class="client-info">
                      <div class="info-col">
                          <div class="info-label">Cliente</div>
                          <div class="info-value">${data.memberName}</div>
                      </div>
                      <div class="info-col" style="text-align: right;">
                          <div class="info-label">Fecha de Emisión</div>
                          <div class="info-value">${dateStr}</div>
                      </div>
                  </div>
                  
                  <div class="item-row">
                      <div class="item-desc">Membresía: ${data.planName}</div>
                      <div class="item-price">${data.amountPaidFormatted}</div>
                  </div>

                  <div class="total-box">
                      <div class="total-row">
                          <div class="total-label">
                              <div class="total-label-text">Total Recibido</div>
                              <div style="font-size: 11px; color: #71717a; margin-top: 4px;">Vía ${data.paymentMethod}</div>
                          </div>
                          <div class="total-value">${data.amountPaidFormatted}</div>
                      </div>
                  </div>

                  <p style="font-size: 12px; color: #71717a; margin-top: 24px; font-style: italic;">
                    Se adjunta a este correo una copia digital del comprobante para sus registros personales.
                  </p>

                  ${data.reference ? `
                  <div class="details">
                      <strong>Referencia de Operación:</strong> ${data.reference}
                  </div>` : ''}
              </div>
              <div class="footer">
                  &copy; ${new Date().getFullYear()} Fit-Stack Global Registry. Este es un comprobante de soporte administrativo.
              </div>
          </div>
      </body>
      </html>
    `;

    try {
      const subject = `Recibo de Pago - ${data.planName}`;

      if (provider === 'resend' && process.env.RESEND_API_KEY) {
        const resend = new Resend(process.env.RESEND_API_KEY);
        // @ts-ignore - type discrepancy between resend versions
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
          to: email,
          subject,
          html: receiptTemplate,
          attachments: attachments?.map(a => ({
            filename: a.filename,
            content: a.content
          }))
        });
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
          subject,
          html: receiptTemplate,
          attachments: attachments?.map(a => ({
            filename: a.filename,
            content: a.content
          }))
        });
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ Error enviando email de recibo con adjuntos:', error);
      return false;
    }
  }
};
