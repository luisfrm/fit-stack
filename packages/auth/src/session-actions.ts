import type { IAuthError } from "@workspace/shared";
import type { AuthClient, SignInParams, SignUpParams } from "./client";

/** Payload returned by Better Auth's email sign-in flow. */
type SignInData = Awaited<ReturnType<AuthClient["signIn"]["email"]>>["data"];
/** Payload returned by Better Auth's email sign-up flow. */
type SignUpData = Awaited<ReturnType<AuthClient["signUp"]["email"]>>["data"];

/**
 * Normalizes a thrown value into the `IAuthError` contract (no `any`).
 * Values that already carry a string `code` pass through; anything else
 * becomes a generic auth error with a readable message.
 */
export function toAuthError(error: unknown): IAuthError {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    return error as IAuthError;
  }
  if (error instanceof Error) {
    return { code: "AUTH_UNKNOWN_ERROR", message: error.message };
  }
  return { code: "AUTH_UNKNOWN_ERROR", message: String(error) };
}

/**
 * Session actions (sign in, sign up, sign out, active organization), shared by
 * the Panel, the Console and the member portal.
 *
 * The client is injected so this module stays framework-agnostic: each entry of
 * the package builds the same actions over its own `authClient`.
 */
export function createSessionActions(client: AuthClient) {
  return {
    async signIn(params: SignInParams): Promise<{ data: SignInData | null; error: IAuthError | null }> {
      try {
        const result = await client.signIn.email(params);
        return { data: result?.data || null, error: (result?.error as IAuthError) || null };
      } catch (err: unknown) {
        return { data: null, error: toAuthError(err) };
      }
    },

    async signUp(params: SignUpParams): Promise<{ data: SignUpData | null; error: IAuthError | null }> {
      try {
        const result = await client.signUp.email(params);
        return { data: result?.data || null, error: (result?.error as IAuthError) || null };
      } catch (err: unknown) {
        return { data: null, error: toAuthError(err) };
      }
    },

    async signOut(onSuccess?: () => void) {
      try {
        const result = await client.signOut({
          fetchOptions: {
            onSuccess: () => {
              if (onSuccess) onSuccess();
            }
          }
        });
        return { data: result?.data || true, error: (result?.error as IAuthError) || null };
      } catch (err: unknown) {
        return { data: null, error: toAuthError(err) };
      }
    },

    async setActiveOrganization(organizationId: string | null) {
      try {
        const result = await client.organization.setActive({
          organizationId: organizationId || null,
        });
        return { data: result?.data || null, error: (result?.error as IAuthError) || null };
      } catch (err: unknown) {
        return { data: null, error: toAuthError(err) };
      }
    },
  };
}
