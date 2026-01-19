export {
  createClient,
  createAdminClient,
  getServerClient,
  getCurrentUser,
  getUserPermissions,
  requireAuth,
  requireAdminAuth,
  setSupabaseClientFactory,
  resetSupabaseClientFactory,
  canAccessClinicScope,
} from './server';

export type { SupabaseServerClient, UserPermissions } from './server';
