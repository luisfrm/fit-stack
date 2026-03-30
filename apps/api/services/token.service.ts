import { SignJWT, jwtVerify } from 'jose';
import { env } from '@/config/envs';

const SECRET_KEY = new TextEncoder().encode(env.jwtSecret);

export const tokenService = {
  /**
   * Generates a secure JWT token containing member details
   */
  async signInviteToken(memberId: number, email: string): Promise<string> {
    return await new SignJWT({ memberId, email })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('48h') // Token expires in 48 hours
      .sign(SECRET_KEY);
  },

  /**
   * Verifies an invite token and returns the payload
   */
  async verifyInviteToken(token: string) {
    try {
      const { payload } = await jwtVerify(token, SECRET_KEY);
      return payload as { memberId: number; email: string };
    } catch (error) {
      throw new Error('Token inválido o expirado', { cause: error });
    }
  }
};
