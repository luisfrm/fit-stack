/**
 * Shells base de HTML para todos los emails de Fit-Stack.
 *
 * Dos temas:
 *  - `dark`: fondo negro, botón blanco — invitaciones (panel/console/org).
 *  - `light`: estilo comprobante con header amarillo — recibos de pago.
 *
 * Los templates (`send-invitation.ts`, `org-invite.ts`, `payment-receipt.ts`,
 * `org-payment-received.ts`) solo componen contenido; aquí vive el markup
 * compartido. Handler = transporte, template = HTML, nunca al revés.
 */

export interface DarkShellData {
  title: string;
  /** Párrafos del cuerpo (HTML simple permitido: <strong>, <br>). */
  paragraphs: string[];
  buttonLabel: string;
  buttonUrl: string;
  /** Nota pequeña bajo el botón (p. ej. validez del enlace). */
  note?: string;
}

export interface LightShellData {
  headerTitle: string;
  headerSubtitle: string;
  /** HTML del cuerpo (filas de items, totales, etc.) — lo compone el template. */
  bodyHtml: string;
  /** Nombre en el footer (p. ej. nombre del gym o Fit-Stack). */
  footerName: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Escapa texto interpolado en templates — export para uso puntual. */
export { escapeHtml };

const BASE_STYLES = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  margin: 0;
  padding: 20px;
`;

const YEAR = () => new Date().getFullYear();

export function renderDarkShell(data: DarkShellData): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body { ${BASE_STYLES} background-color: #050505; color: #ffffff; }
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
            <h1 class="title">${data.title}</h1>
            ${data.paragraphs.map((p) => `<p class="text">${p}</p>`).join('\n            ')}
            <a href="${data.buttonUrl}" class="button">${data.buttonLabel}</a>
            ${data.note ? `<p class="text" style="margin-top: 32px; font-size: 13px;">${data.note}</p>` : ''}
        </div>
        <div class="footer">
            &copy; ${YEAR()} Fit-Stack Engine.
        </div>
    </body>
    </html>
  `;
}

export function renderLightShell(data: LightShellData): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body { ${BASE_STYLES} background-color: #f4f4f5; color: #18181b; }
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
            .footer { padding: 20px; text-align: center; font-size: 11px; color: #a1a1aa; border-top: 1px solid #f4f4f5; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>${data.headerTitle}</h1>
                <p>${data.headerSubtitle}</p>
            </div>
            <div class="content">
                ${data.bodyHtml}
            </div>
            <div class="footer">
                &copy; ${YEAR()} ${data.footerName}.
            </div>
        </div>
    </body>
    </html>
  `;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}
