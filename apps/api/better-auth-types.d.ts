import type { Session as AuthSession, User as AuthUser } from "./config/auth";

// Extraemos los tipos a alias simples para que TypeScript pueda usarlos en 'extends'
type BetterAuthSession = AuthSession["session"];
type BetterAuthUser = AuthUser;

declare module "better-auth" {
    interface Session extends BetterAuthSession {}
    interface User extends BetterAuthUser {}
}
