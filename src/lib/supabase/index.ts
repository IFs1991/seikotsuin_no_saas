export {
  createClient,
  createAdminClient,
  createAdminClientForDatabase,
  getServerClient,
  getCurrentUser,
  getUserPermissions,
  getUserAccessContext,
  getUserAccessContextForVerifiedSubject,
  requireAuth,
  requireAdminAuth,
  setSupabaseClientFactory,
  resetSupabaseClientFactory,
  canAccessClinicScope,
  resolveScopedClinicIds,
} from './server';

export type {
  SupabaseServerClient,
  UserPermissions,
  UserAccessContext,
} from './server';

export {
  resolveVerifiedSubject,
  logVerifiedSubjectTiming,
  getVerifiedSubjectServerTiming,
} from './request-auth-context';

export type { VerifiedSubject } from './request-auth-context';

export {
  createScopedAdminContext,
  createPublicClinicContext,
  ScopeNotConfiguredError,
  ScopeAccessError,
  ClinicNotFoundError,
  ClinicInactiveError,
} from './scoped-admin';

export type { ScopedAdminContext, PublicClinicContext } from './scoped-admin';
