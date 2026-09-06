import { renderDarkShell, type RenderedEmail } from './layout';

export interface OrgInviteData {
  email: string;
  orgName: string;
  inviterName: string;
  inviteLink: string;
}

/** Invitación a un miembro con cuenta a una organización (hook Better Auth). */
export function renderOrgInvite(data: OrgInviteData): RenderedEmail {
  return {
    subject: `Invitación para unirte a ${data.orgName}`,
    html: renderDarkShell({
      title: 'Nueva Invitación',
      paragraphs: [
        `<strong>${data.inviterName}</strong> te ha invitado a unirte al equipo de <strong>${data.orgName}</strong>.`,
      ],
      buttonLabel: `Unirme a ${data.orgName}`,
      buttonUrl: data.inviteLink,
      note: 'Haz clic en el botón para aceptar la invitación y acceder al panel de la sede.',
    }),
  };
}
