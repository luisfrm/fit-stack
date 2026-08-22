/**
 * Datos del propietario (Owner) de una sede recién creada.
 * Lo comparte `OrganizationForm` y el flujo que dispara la invitación.
 */
export interface OwnerData {
  firstName: string;
  lastName: string;
  email: string;
  sendInvite: boolean;
}
