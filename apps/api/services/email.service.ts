export const emailService = {
  /**
   * Sends an invitation email to the member.
   * Currently mocks the email by printing it to the console.
   */
  async sendRegistrationInvite(email: string, token: string) {
    const cmsUrl = process.env.FRONTEND_URL || "http://localhost:3001";
    const inviteLink = `${cmsUrl}/register?token=${token}`;

    console.log('\n-----------------------------------------------------------');
    console.log(`✉️  [MOCK EMAIL SEND] Destino: ${email}`);
    console.log(`Asunto: Invitación para registrarse en Gym CMS`);
    console.log(`\n¡Hola!\nHas sido invitado a unirte al sistema. Por favor entra al siguiente enlace para crear tu contraseña:\n\n${inviteLink}\n`);
    console.log(`(El token expirará en 48 horas)`);
    console.log('-----------------------------------------------------------\n');

    // Here we would use an Email provider like Resend or Sendgrid eventually
    return true;
  }
};
