export {
  createClient,
  createAdminClient,
  getServerClient,
  getCurrentUser,
  getUserPermissions,
  getUserAccessContext,
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
  createScopedAdminContext,
  createPublicClinicContext,
  ScopeNotConfiguredError,
  ScopeAccessError,
  ClinicNotFoundError,
  ClinicInactiveError,
} from './scoped-admin';

export type {
  ScopedAdminContext,
  PublicClinicContext,
} from './scoped-admin';
