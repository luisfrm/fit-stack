export { authClient, useSession, organization } from './client';
export type { User, Session, SignInParams, SignUpParams } from './client';

export { sessionService } from './service';
export type { IAuthError } from '@workspace/shared';

export { useAuth } from './hooks';
export { usePermissions } from './permissions';
export {
  ORG_ROLES,
  PERMISSION_MODULES,
  PERMISSION_ACTIONS,
  can,
  canAssignRole,
} from '@workspace/shared';