import 'server-only';

import { AuditLogger, getRequestInfo } from '@/lib/audit-logger';
import {
  createAdminClient,
  createClient,
  getCurrentUser,
  getUserAccessContext,
  type UserPermissions,
} from '@/lib/supabase';
import {
  resolveEffectiveClinicScope,
  type EffectiveClinicScope,
} from '@/lib/auth/manager-scope';
import { logger } from '@/lib/logger';
import { normalizeRole } from '@/lib/constants/roles';
import { getMobileUiuxFlags } from '@/lib/mobile-uiux/flags';
import { canRoleAccessMobileUiuxScreen } from '@/lib/mobile-uiux/navigation';

export type MobileUiuxAccessReasonCode =
  | 'unauthenticated'
  | 'permissions_not_found'
  | 'profile_inactive'
  | 'feature_flag_disabled'
  | 'role_not_allowed'
  | 'screen_not_allowed'
  | 'clinic_scope_missing'
  | 'clinic_scope_not_allowed'
  | 'clinic_scope_resolution_failed';

export interface MobileUiuxAccessLogDetails {
  reasonCode: MobileUiuxAccessReasonCode;
  role: string | null;
  scopedClinicCount: number;
  allowedClinicCount: number;
  featureFlagEnabled: boolean;
  resource: string;
  status: 401 | 403 | 404;
}

export interface MobileUiuxAccessAllowed {
  allowed: true;
  role: string;
  scopedClinicCount: number;
  allowedClinicCount: number;
  featureFlagEnabled: boolean;
}

export interface MobileUiuxAccessDenied {
  allowed: false;
  status: 401 | 403 | 404;
  reasonCode: MobileUiuxAccessReasonCode;
  message: string;
  logDetails: MobileUiuxAccessLogDetails;
}

export type MobileUiuxAccessResult =
  | MobileUiuxAccessAllowed
  | MobileUiuxAccessDenied;

type MobileUiuxUser = {
  id: string;
  email?: string | null;
};

function buildDeniedResult(input: {
  status: 401 | 403 | 404;
  reasonCode: MobileUiuxAccessReasonCode;
  message: string;
  role: string | null;
  scopedClinicCount: number;
  allowedClinicCount: number;
  featureFlagEnabled: boolean;
  resource: string;
}): MobileUiuxAccessDenied {
  return {
    allowed: false,
    status: input.status,
    reasonCode: input.reasonCode,
    message: input.message,
    logDetails: {
      reasonCode: input.reasonCode,
      role: input.role,
      scopedClinicCount: input.scopedClinicCount,
      allowedClinicCount: input.allowedClinicCount,
      featureFlagEnabled: input.featureFlagEnabled,
      resource: input.resource,
      status: input.status,
    },
  };
}

async function logDeniedAccess(
  request: Request,
  user: MobileUiuxUser | null,
  denied: MobileUiuxAccessDenied
): Promise<void> {
  const { ipAddress, userAgent } = getRequestInfo(request);
  const path = new URL(request.url).pathname;

  logger.warn('Mobile UIUX access denied', denied.logDetails);

  await AuditLogger.logUnauthorizedAccess(
    path,
    denied.reasonCode,
    user?.id ?? null,
    user?.email ?? null,
    ipAddress,
    userAgent,
    { ...denied.logDetails }
  );
}

function resolveDirectClinicScope(
  permissions: UserPermissions
): EffectiveClinicScope {
  if (permissions.clinic_scope_ids && permissions.clinic_scope_ids.length > 0) {
    return {
      source: 'clinic_scope_ids',
      clinicIds: permissions.clinic_scope_ids,
    };
  }

  if (permissions.clinic_id) {
    return {
      source: 'clinic_id',
      clinicIds: [permissions.clinic_id],
    };
  }

  return {
    source: 'clinic_id',
    clinicIds: [],
  };
}

async function resolveMobileUiuxClinicScope(input: {
  userId: string;
  role: string;
  permissions: UserPermissions;
}): Promise<EffectiveClinicScope> {
  if (input.role === 'manager') {
    return await resolveEffectiveClinicScope({
      adminClient: createAdminClient(),
      userId: input.userId,
      permissions: input.permissions,
    });
  }

  return resolveDirectClinicScope(input.permissions);
}

function hasAllowedClinicScope(
  scopedClinicIds: readonly string[],
  allowedClinicIds: readonly string[]
): boolean {
  const allowedClinicIdSet = new Set(allowedClinicIds);
  return scopedClinicIds.some(clinicId => allowedClinicIdSet.has(clinicId));
}

function normalizeScreenResource(resource: string): string | null {
  const normalizedResource = resource
    .replace(/\.dc\.html$/i, '')
    .replace(/\.html$/i, '')
    .trim();

  if (
    normalizedResource === 'home' ||
    normalizedResource === 'reservations' ||
    normalizedResource === 'patients' ||
    normalizedResource === 'daily-reports' ||
    normalizedResource === 'settings' ||
    normalizedResource === 'settings-detail'
  ) {
    return normalizedResource;
  }

  return null;
}

async function deny(input: {
  request: Request;
  user: MobileUiuxUser | null;
  status: 401 | 403 | 404;
  reasonCode: MobileUiuxAccessReasonCode;
  message: string;
  role: string | null;
  scopedClinicCount: number;
  allowedClinicCount: number;
  featureFlagEnabled: boolean;
  resource: string;
}): Promise<MobileUiuxAccessDenied> {
  const result = buildDeniedResult(input);
  await logDeniedAccess(input.request, input.user, result);
  return result;
}

export async function checkMobileUiuxAccess(
  request: Request,
  resource: string
): Promise<MobileUiuxAccessResult> {
  const flags = getMobileUiuxFlags();
  const baseLogCounts = {
    allowedClinicCount: flags.allowedClinicIds.length,
    featureFlagEnabled: flags.enabled,
  };
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  if (!user) {
    return await deny({
      request,
      user: null,
      status: 401,
      reasonCode: 'unauthenticated',
      message: 'ログインが必要です',
      role: null,
      scopedClinicCount: 0,
      resource,
      ...baseLogCounts,
    });
  }

  const accessContext = await getUserAccessContext(user.id, supabase, { user });
  const permissions = accessContext.permissions;
  const role = normalizeRole(permissions?.role ?? accessContext.role);

  if (!permissions || !role) {
    return await deny({
      request,
      user,
      status: 403,
      reasonCode: 'permissions_not_found',
      message: 'ユーザー権限が見つかりません',
      role,
      scopedClinicCount: 0,
      resource,
      ...baseLogCounts,
    });
  }

  let scope: EffectiveClinicScope;
  try {
    scope = await resolveMobileUiuxClinicScope({
      userId: user.id,
      role,
      permissions,
    });
  } catch (error) {
    logger.warn('Mobile UIUX clinic scope resolution failed', {
      role,
      errorName: error instanceof Error ? error.name : null,
    });

    return await deny({
      request,
      user,
      status: 403,
      reasonCode: 'clinic_scope_resolution_failed',
      message: '店舗スコープを確認できません',
      role,
      scopedClinicCount: 0,
      resource,
      ...baseLogCounts,
    });
  }

  const scopedClinicCount = scope.clinicIds.length;

  if (!accessContext.isActive) {
    return await deny({
      request,
      user,
      status: 403,
      reasonCode: 'profile_inactive',
      message: 'アカウントが無効です',
      role,
      scopedClinicCount,
      resource,
      ...baseLogCounts,
    });
  }

  if (!flags.enabled) {
    return await deny({
      request,
      user,
      status: 404,
      reasonCode: 'feature_flag_disabled',
      message: 'モバイル画面は現在利用できません',
      role,
      scopedClinicCount,
      resource,
      ...baseLogCounts,
    });
  }

  if (!flags.allowedRoles.includes(role)) {
    return await deny({
      request,
      user,
      status: 403,
      reasonCode: 'role_not_allowed',
      message: 'モバイル画面を表示する権限がありません',
      role,
      scopedClinicCount,
      resource,
      ...baseLogCounts,
    });
  }

  if (scope.clinicIds.length === 0) {
    return await deny({
      request,
      user,
      status: 403,
      reasonCode: 'clinic_scope_missing',
      message: '店舗スコープが設定されていません',
      role,
      scopedClinicCount,
      resource,
      ...baseLogCounts,
    });
  }

  const screenResource = normalizeScreenResource(resource);
  if (screenResource && !canRoleAccessMobileUiuxScreen(role, screenResource)) {
    return await deny({
      request,
      user,
      status: 403,
      reasonCode: 'screen_not_allowed',
      message: 'この画面を表示する権限がありません',
      role,
      scopedClinicCount,
      resource,
      ...baseLogCounts,
    });
  }

  if (
    flags.allowedClinicIds.length > 0 &&
    !hasAllowedClinicScope(scope.clinicIds, flags.allowedClinicIds)
  ) {
    return await deny({
      request,
      user,
      status: 403,
      reasonCode: 'clinic_scope_not_allowed',
      message: 'この店舗ではモバイル画面を利用できません',
      role,
      scopedClinicCount,
      resource,
      ...baseLogCounts,
    });
  }

  return {
    allowed: true,
    role,
    scopedClinicCount,
    ...baseLogCounts,
  };
}
