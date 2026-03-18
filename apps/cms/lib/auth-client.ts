import { createAuthClient } from '@neondatabase/neon-js/auth';

type NeonAuthClient = ReturnType<typeof createAuthClient>;

export const auth: any = createAuthClient(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/auth`);