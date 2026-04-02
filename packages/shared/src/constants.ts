/**
 * Immutable Role IDs for the Fit-Stack RBAC system.
 * Always compare by these IDs, never by role names or strings.
 */
export enum ROLE_IDS {
  ADMIN = 1,
  MANAGER = 2,
  TRAINER = 3,
  CLIENT = 4,
}

/**
 * Mapping of Role Names (for display/initialization)
 */
export const ROLE_NAMES = {
  [ROLE_IDS.ADMIN]: "Admin",
  [ROLE_IDS.MANAGER]: "Manager",
  [ROLE_IDS.TRAINER]: "Trainer",
  [ROLE_IDS.CLIENT]: "Cliente",
};
