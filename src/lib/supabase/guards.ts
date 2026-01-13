import 'server-only';

import { AppError, ERROR_CODES } from '@/lib/error-handler';
import { AuditLogger, getRequestInfo } from '@/lib/audit-logger';
import {
  createClient,
  getCurrentUser,
  getUserPermissions,
  canAccessClinicScope,
  type SupabaseServerClient,
  type UserPermissions,
} from '@/lib/supabase';
import { canAccessCrossClinicWithCompat, normalizeRole } from '@/lib/constants/roles';

export interface ClinicAccessOptions {
  /**
   * Whether to enforce that the authenticated user's clinic matches the requested clinic.
   * Defaults to `true` when a clinicId is provided.
   */
  requireClinicMatch?: boolean;
  /**
   * Roles that are explicitly permitted for the requested operation in addition to admins.
   */
  allowedRoles?: string[];
}

export interface ClinicAccessContext {
  supabase: SupabaseServerClient;
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  permissions: UserPermissions;
}

export async function ensureClinicAccess(
  request: Request,
  path: string,
  clinicId: string | null,
  options: ClinicAccessOptions = {}
): Promise<ClinicAccessContext> {
  const { ipAddress, userAgent } = getRequestInfo(request);

  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  if (!user) {
    await AuditLogger.logUnauthorizedAccess(
      path,
      'Authentication required',
      null,
      null,
      ipAddress,
      userAgent
    );
    throw new AppError(ERROR_CODES.UNAUTHORIZED, undefined, 401);
  }

  const permissions = await getUserPermissions(user.id, supabase);
  if (!permissions) {
    await AuditLogger.logUnauthorizedAccess(
      path,
      'Permissions not found',
      user.id,
      user.email || '',
      ipAddress,
      userAgent
    );
    throw new AppError(ERROR_CODES.FORBIDDEN, undefined, 403);
  }

  const requireClinicMatch =
    options.requireClinicMatch ?? (clinicId !== null && clinicId !== undefined);
  const allowedRoles = new Set(options.allowedRoles ?? []);
  // 互換マッピング適用: clinic_manager → clinic_admin
  // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md (Option B-1)
  const normalizedRole = normalizeRole(permissions.role);
  const hasPrivilegedRole = canAccessCrossClinicWithCompat(permissions.role);

  // allowedRoles チェックも正規化されたロールを使用
  if (allowedRoles.size > 0 && !allowedRoles.has(normalizedRole ?? '')) {
    if (!hasPrivilegedRole) {
      await AuditLogger.logUnauthorizedAccess(
        path,
        'Forbidden role for requested operation',
        user.id,
        user.email || '',
        ipAddress,
        userAgent
      );
      throw new AppError(ERROR_CODES.FORBIDDEN, undefined, 403);
    }
  }

  if (requireClinicMatch) {
    if (!clinicId) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        'clinic_idは必須です',
        400
      );
    }

    // Parent-scope check: use clinic_scope_ids if available, else fallback to clinic_id
    // Admin bypass REMOVED: admin is also scoped to their parent organization
    // @see docs/stabilization/spec-rls-tenant-boundary-v0.1.md
    const hasClinicAccess = canAccessClinicScope(permissions, clinicId);

    if (!hasClinicAccess) {
      await AuditLogger.logUnauthorizedAccess(
        `${path}?clinic_id=${clinicId}`,
        'Forbidden clinic access (parent-scope violation)',
        user.id,
        user.email || '',
        ipAddress,
        userAgent
      );
      throw new AppError(ERROR_CODES.FORBIDDEN, undefined, 403);
    }
  }

  return {
    supabase,
    user,
    permissions,
  };
}
