import { NextRequest } from 'next/server';

import { processApiRequest } from '@/lib/api-helpers';
import {
  canManageAdminSettingsCategory,
  canReadAdminSettingsCategory,
} from '@/lib/admin-settings/access';
import {
  VALID_CATEGORIES,
  type SettingsCategory,
} from '@/lib/admin-settings/defaults';
import { ADMIN_USER_ROLE_VALUES } from '@/lib/constants/roles';
import type {
  MobileUiuxSettingsResponse,
  MobileUiuxSettingsWriteResponse,
} from '@/lib/mobile-uiux/contracts';
import { fetchMobileUiuxClinicEntitlement } from '@/lib/mobile-uiux/entitlements';
import {
  areMobileUiuxRealDataReadsEnabled,
  areMobileUiuxWritesEnabled,
  getMobileUiuxFlags,
} from '@/lib/mobile-uiux/flags';
import {
  buildMobileUiuxFailure,
  buildMobileUiuxSuccess,
  getRequiredClinicId,
} from '@/lib/mobile-uiux/route-utils';
import {
  ADMIN_SETTINGS_MUTATION_ROLES,
  fetchAdminSettingsReadModel,
  isSettingsCategory,
  logAdminSettingsMutation,
  readClinicIdFromAdminSettingsBody,
  upsertAdminSettings,
  validateAdminSettingsMutationBody,
  validateAdminSettingsMutationSettings,
} from '@/lib/admin-settings/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MOBILE_UIUX_READ_ALLOWED_ROLES = ADMIN_USER_ROLE_VALUES;
const MOBILE_UIUX_SETTINGS_WRITE_CATEGORIES = [
  'clinic_hours',
  'booking_calendar',
  'communication',
] as const satisfies readonly SettingsCategory[];
const MOBILE_UIUX_SETTINGS_WRITE_CATEGORY_SET: ReadonlySet<SettingsCategory> =
  new Set(MOBILE_UIUX_SETTINGS_WRITE_CATEGORIES);

function buildWriteDisabledResponse() {
  return buildMobileUiuxFailure(
    403,
    'FORBIDDEN',
    'モバイル UI/UX の設定書き込みは無効です'
  );
}

function buildRealDataDisabledResponse() {
  return buildMobileUiuxFailure(
    403,
    'FORBIDDEN',
    'モバイル UI/UX の実データ参照は無効です'
  );
}

function buildAuthFailureResponse(status: number) {
  return buildMobileUiuxFailure(
    status,
    status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
    '対象クリニックへのアクセス権がありません'
  );
}

async function readClinicIdPreview(
  request: NextRequest
): Promise<string | null> {
  try {
    const previewBody: unknown = await request.clone().json();
    return readClinicIdFromAdminSettingsBody(previewBody);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const flags = getMobileUiuxFlags();
  if (!flags.enabled || !flags.realDataEnabled) {
    return buildRealDataDisabledResponse();
  }

  const clinicId = getRequiredClinicId(
    request.nextUrl.searchParams.get('clinic_id')
  );
  if (!clinicId) {
    return buildMobileUiuxFailure(
      400,
      'BAD_REQUEST',
      'clinic_id はUUID形式で指定してください'
    );
  }

  const categoryParam = request.nextUrl.searchParams.get('category');
  if (!categoryParam) {
    return buildMobileUiuxFailure(400, 'BAD_REQUEST', 'category は必須です');
  }

  if (!isSettingsCategory(categoryParam)) {
    return buildMobileUiuxFailure(
      400,
      'BAD_REQUEST',
      `不正なcategoryです。有効な値: ${VALID_CATEGORIES.join(', ')}`
    );
  }

  const guard = await processApiRequest(request, {
    allowedRoles: Array.from(MOBILE_UIUX_READ_ALLOWED_ROLES),
    clinicId,
    requireClinicMatch: true,
  });
  if (!guard.success) {
    return buildMobileUiuxFailure(
      guard.error.status,
      guard.error.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
      '対象クリニックへのアクセス権がありません'
    );
  }

  if (!canReadAdminSettingsCategory(guard.permissions.role, categoryParam)) {
    return buildMobileUiuxFailure(
      403,
      'FORBIDDEN',
      'この設定カテゴリへのアクセス権がありません'
    );
  }

  const entitlement = await fetchMobileUiuxClinicEntitlement({
    supabase: guard.supabase,
    flags,
    clinicId,
  });
  if (!areMobileUiuxRealDataReadsEnabled(flags, entitlement)) {
    return buildRealDataDisabledResponse();
  }

  const readResult = await fetchAdminSettingsReadModel(
    guard.supabase,
    clinicId,
    categoryParam
  );
  if (!readResult.success) {
    return buildMobileUiuxFailure(500, 'INTERNAL', '設定の取得に失敗しました');
  }

  const response: MobileUiuxSettingsResponse = {
    clinicId,
    category: categoryParam,
    settings: readResult.data.settings,
    updatedAt: readResult.data.updated_at,
    updatedBy: readResult.data.updated_by,
  };

  return buildMobileUiuxSuccess(response);
}

export async function PUT(request: NextRequest) {
  const flags = getMobileUiuxFlags();
  if (
    !flags.enabled ||
    !flags.realDataEnabled ||
    !areMobileUiuxWritesEnabled(flags, 'settings')
  ) {
    return buildWriteDisabledResponse();
  }

  const clinicIdForAuth = await readClinicIdPreview(request);
  const guard = await processApiRequest(request, {
    requireBody: true,
    allowedRoles: Array.from(ADMIN_SETTINGS_MUTATION_ROLES),
    clinicId: clinicIdForAuth,
  });

  if (!guard.success) {
    return buildAuthFailureResponse(guard.error.status);
  }

  const envelopeValidation = validateAdminSettingsMutationBody(guard.body);
  if (envelopeValidation.success === false) {
    return buildMobileUiuxFailure(
      envelopeValidation.status,
      'BAD_REQUEST',
      envelopeValidation.message
    );
  }

  const envelope = envelopeValidation.payload;

  const entitlement = await fetchMobileUiuxClinicEntitlement({
    supabase: guard.supabase,
    flags,
    clinicId: envelope.clinic_id,
  });
  if (!areMobileUiuxWritesEnabled(flags, 'settings', entitlement)) {
    return buildWriteDisabledResponse();
  }

  if (
    !canReadAdminSettingsCategory(guard.permissions.role, envelope.category)
  ) {
    return buildMobileUiuxFailure(
      403,
      'FORBIDDEN',
      'この設定カテゴリへのアクセス権がありません'
    );
  }

  if (
    !canManageAdminSettingsCategory(guard.permissions.role, envelope.category)
  ) {
    return buildMobileUiuxFailure(
      403,
      'FORBIDDEN',
      'この設定カテゴリへのアクセス権がありません'
    );
  }

  if (!MOBILE_UIUX_SETTINGS_WRITE_CATEGORY_SET.has(envelope.category)) {
    return buildMobileUiuxFailure(
      403,
      'FORBIDDEN',
      'この設定カテゴリはモバイル初回ロールアウトでは更新できません'
    );
  }

  const settingsValidation = validateAdminSettingsMutationSettings(envelope);
  if (settingsValidation.success === false) {
    return buildMobileUiuxFailure(
      settingsValidation.status,
      'BAD_REQUEST',
      settingsValidation.message
    );
  }

  const { payload } = settingsValidation;
  const writeResult = await upsertAdminSettings(
    guard.supabase,
    payload,
    guard.auth.id
  );
  if (writeResult.success === false) {
    return buildMobileUiuxFailure(500, 'INTERNAL', writeResult.message);
  }

  logAdminSettingsMutation({
    userId: guard.auth.id,
    userEmail: guard.auth.email,
    role: guard.permissions.role,
    clinicId: payload.clinic_id,
    category: payload.category,
  });

  const readResult = await fetchAdminSettingsReadModel(
    guard.supabase,
    payload.clinic_id,
    payload.category
  );
  if (!readResult.success) {
    return buildMobileUiuxFailure(500, 'INTERNAL', '設定の確認に失敗しました');
  }

  const response: MobileUiuxSettingsWriteResponse = {
    clinicId: payload.clinic_id,
    category: payload.category,
    settings: readResult.data.settings,
    updatedAt: readResult.data.updated_at,
    message: '設定を保存しました',
  };

  return buildMobileUiuxSuccess(response);
}
