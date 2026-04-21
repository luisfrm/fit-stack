import type { Session as AuthSession, User as AuthUser } from "./config/auth";

declare module "better-auth" {
    interface Session extends AuthSession["session"] {}
    interface User extends AuthUser {}
}
