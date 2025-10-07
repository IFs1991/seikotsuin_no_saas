import 'server-only';

import { AppError, ERROR_CODES } from '@/lib/error-handler';
import {
  AuditLogger,
  getRequestInfo,
} from '@/lib/audit-logger';
import {
  createClient,
  getCurrentUser,
  getUserPermissions,
  type SupabaseServerClient,
  type UserPermissions,
} from '@/lib/supabase';

const CROSS_CLINIC_ROLES = new Set(['admin', 'clinic_manager']);

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

  const supabase = createClient();
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
    options.requireClinicMatch ?? clinicId !== null && clinicId !== undefined;
  const allowedRoles = new Set(options.allowedRoles ?? []);
  const hasPrivilegedRole = CROSS_CLINIC_ROLES.has(permissions.role);

  if (allowedRoles.size > 0 && !allowedRoles.has(permissions.role)) {
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

    if (!hasPrivilegedRole && permissions.clinic_id !== clinicId) {
      await AuditLogger.logUnauthorizedAccess(
        `${path}?clinic_id=${clinicId}`,
        'Forbidden clinic access',
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
