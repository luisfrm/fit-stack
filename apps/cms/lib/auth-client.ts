import { createAuthClient } from '@neondatabase/neon-js/auth';

const auth: any = createAuthClient(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/auth`);

interface SignInParams {
  email: string;
  password: string;
}

export const signIn = async (params: SignInParams) => {
  try {
    const result = await auth.signIn.email(params);
    return { data: result?.data || null, error: result?.error || null };
  } catch (err: any) {
    return { data: null, error: err };
  }
};

interface SignUpParams {
  email: string;
  password: string;
  name: string;
}

export const signUp = async (params: SignUpParams) => {
  try {
    const result = await auth.signUp.email(params);
    return { data: result?.data || null, error: result?.error || null };
  } catch (err: any) {
    return { data: null, error: err };
  }
};

/**
 * Sign out the current user
 */
export const signOut = async (options?: any) => {
  try {
    const result = await auth.signOut(options);
    return { data: result?.data || true, error: result?.error || null };
  } catch (err: any) {
    return { data: null, error: err };
  }
};

/**
 * Get the current session
 */
export const getSession = async (options?: any) => {
  try {
    const result = await auth.getSession(options);
    return { data: result?.data || null, error: result?.error || null };
  } catch (err: any) {
    return { data: null, error: err };
  }
};