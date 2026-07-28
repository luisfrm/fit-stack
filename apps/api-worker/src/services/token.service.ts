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
  };
}

export type TokenService = ReturnType<typeof createTokenService>;
