import { createAuthClient } from '@neondatabase/neon-js/auth';

export const auth: ReturnType<typeof createAuthClient> = createAuthClient("http://localhost:3000");