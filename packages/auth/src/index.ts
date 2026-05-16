export { authClient, useSession, useActiveOrganization, organization } from './client';
export type { User, Session, SignInParams, SignUpParams } from './client';

export { sessionService } from './service';
export type { IAuthError } from '@workspace/shared';

export { useAuth } from './hooks';
export { GLOBAL_ROLES, ORG_ROLES } from '@workspace/shared';