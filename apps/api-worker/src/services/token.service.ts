import { SignJWT, jwtVerify } from 'jose';

export function createTokenService(jwtSecret: string) {
  const secretKey = new TextEncoder().encode(jwtSecret);

  return {
    async signInviteToken(organizationId: string, memberId: number, email: string): Promise<string> {
      return await new SignJWT({ organizationId, memberId, email })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('48h')
        .sign(secretKey);
    },

    async verifyInviteToken(token: string) {
      try {
        const { payload } = await jwtVerify(token, secretKey);
        return payload as { organizationId: string; memberId: number; email: string };
      } catch (error) {
        throw new Error('Token inválido o expirado', { cause: error });
      }
    },

    /**
     * JWT for console (SaaS staff) registration invites.
     * Carries the platform role to assign once the user registers.
     */
    async signConsoleInviteToken(email: string, role: string): Promise<string> {
      return await new SignJWT({ email, role, scope: 'console' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('48h')
        .sign(secretKey);
    },

    async verifyConsoleInviteToken(token: string) {
      try {
        const { payload } = await jwtVerify(token, secretKey);
        if (payload.scope !== 'console') {
          throw new Error('Token inválido o expirado');
        }
        return payload as { email: string; role: string; scope: string };
      } catch (error) {
        throw new Error('Token inválido o expirado', { cause: error });
      }
    },
  };
}

export type TokenService = ReturnType<typeof createTokenService>;
