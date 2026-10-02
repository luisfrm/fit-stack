import { renderDarkShell, escapeHtml, type RenderedEmail } from './layout';

export interface RegistrationInviteData {
  email: string;
  token: string;
  target?: 'panel' | 'console';
  role?: string;
  /** Base URLs resueltas por el handler (env.PANEL_URL / env.CONSOLE_URL). */
  baseUrl: string;
}

/**
 * Invitación a registrarse (panel o console): el destinatario activa su
 * cuenta y configura contraseña vía token.
 */
export function renderRegistrationInvite(data: RegistrationInviteData): RenderedEmail {
  const target = data.target === 'console' ? 'console' : 'panel';
  // `baseUrl` (env) y `token` (server) se escapan antes de componer el link:
  // el resultado viaja en el `href`.
  const inviteLink = `${escapeHtml(data.baseUrl)}/register?token=${escapeHtml(data.token)}`;

  const appName = target === 'console' ? 'FitStack Console' : 'FitStack Panel';
  const title = target === 'console' ? 'Invitación de Administración' : 'Invitación al Equipo';
  const description =
    target === 'console'
      ? 'Has sido invitado a unirte al equipo de administración de la plataforma SaaS Fit-Stack. Haz clic en el botón de abajo para activar tu cuenta y configurar tu contraseña.'
      : 'Has sido invitado a unirte al panel de gestión de tu gimnasio. Haz clic en el botón de abajo para activar tu cuenta y configurar tu contraseña.';

  return {
    subject: `Invitación para registrarse en ${appName}`,
    html: renderDarkShell({
      title,
      paragraphs: [description],
      buttonLabel: `Activar mi cuenta en ${appName}`,
      buttonUrl: inviteLink,
      note: 'Este enlace es válido por 48 horas.',
    }),
  };
}
