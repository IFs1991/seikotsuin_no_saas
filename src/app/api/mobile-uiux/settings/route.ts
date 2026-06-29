import { NextRequest } from 'next/server';

import { processApiRequest } from '@/lib/api-helpers';
import { canReadAdminSettingsCategory } from '@/lib/admin-settings/access';
import {
  DEFAULT_SETTINGS,
  VALID_CATEGORIES,
  type SettingsCategory,
} from '@/lib/admin-settings/defaults';
import { normalizeCommunicationSettings } from '@/lib/admin-settings/normalize';
import { ADMIN_USER_ROLE_VALUES } from '@/lib/constants/roles';
import type { MobileUiuxSettingsResponse } from '@/lib/mobile-uiux/contracts';
import {
  areMobileUiuxWritesEnabled,
  getMobileUiuxFlags,
} from '@/lib/mobile-uiux/flags';
import {
  buildMobileUiuxFailure,
  buildMobileUiuxSuccess,
  getRequiredClinicId,
} from '@/lib/mobile-uiux/route-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MOBILE_UIUX_READ_ALLOWED_ROLES = ADMIN_USER_ROLE_VALUES;

type ClinicSettingsRow = {
  settings: Record<string, unknown> | null;
  updated_at: string | null;
  updated_by: string | null;
};

function isSettingsCategory(value: string): value is SettingsCategory {
  return VALID_CATEGORIES.some(category => category === value);
}

function isMissingRowError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'PGRST116'
  );
}

function normalizeSettings(
  category: SettingsCategory,
  settings: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (category === 'communication') {
    return normalizeCommunicationSettings(
      settings ?? DEFAULT_SETTINGS.communication
    );
  }

  return settings ?? DEFAULT_SETTINGS[category];
}

function buildWriteDisabledResponse() {
  return buildMobileUiuxFailure(
    403,
    'FORBIDDEN',
    'モバイル UI/UX の設定書き込みは無効です'
  );
}

export async function GET(request: NextRequest) {
  const flags = getMobileUiuxFlags();
  if (!flags.enabled || !flags.realDataEnabled) {
    return buildMobileUiuxFailure(
      403,
      'FORBIDDEN',
      'モバイル UI/UX の実データ参照は無効です'
    );
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

  const { data, error } = await guard.supabase
    .from('clinic_settings')
    .select('settings, updated_at, updated_by')
    .eq('clinic_id', clinicId)
    .eq('category', categoryParam)
    .single();

  if (error && !isMissingRowError(error)) {
    return buildMobileUiuxFailure(
      500,
      'INTERNAL_SERVER_ERROR',
      '設定の取得に失敗しました'
    );
  }

  const row = data as ClinicSettingsRow | null;
  const response: MobileUiuxSettingsResponse = {
    clinicId,
    category: categoryParam,
    settings: normalizeSettings(categoryParam, row?.settings),
    updatedAt: row?.updated_at ?? null,
    updatedBy: row?.updated_by ?? null,
  };

  return buildMobileUiuxSuccess(response);
}

export async function PUT(_request: NextRequest) {
  const flags = getMobileUiuxFlags();
  if (!areMobileUiuxWritesEnabled(flags, 'settings')) {
    return buildWriteDisabledResponse();
  }

  return buildWriteDisabledResponse();
}
