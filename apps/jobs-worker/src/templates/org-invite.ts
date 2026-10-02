import { renderDarkShell, escapeHtml, type RenderedEmail } from './layout';

export interface OrgInviteData {
  email: string;
  orgName: string;
  inviterName: string;
  inviteLink: string;
}

/**
 * Invitación a un miembro con cuenta a una organización (hook Better Auth).
 * `orgName`/`inviterName` son input de operador y `inviteLink` viaja en el
 * `href`: todo se escapa.
 */
export function renderOrgInvite(data: OrgInviteData): RenderedEmail {
  const orgName = escapeHtml(data.orgName);
  const inviterName = escapeHtml(data.inviterName);

  return {
    subject: `Invitación para unirte a ${orgName}`,
    html: renderDarkShell({
      title: 'Nueva Invitación',
      paragraphs: [
        `<strong>${inviterName}</strong> te ha invitado a unirte al equipo de <strong>${orgName}</strong>.`,
      ],
      buttonLabel: `Unirme a ${orgName}`,
      buttonUrl: escapeHtml(data.inviteLink),
      note: 'Haz clic en el botón para aceptar la invitación y acceder al panel de la sede.',
    }),
  };
}
