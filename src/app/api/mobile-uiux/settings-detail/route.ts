import { NextRequest } from 'next/server';

import { processApiRequest } from '@/lib/api-helpers';
import { mapMenuRowToApi, type MenuRow } from '@/app/api/menus/schema';
import { ADMIN_USER_ROLE_VALUES } from '@/lib/constants/roles';
import { fetchMobileUiuxClinicEntitlement } from '@/lib/mobile-uiux/entitlements';
import {
  areMobileUiuxRealDataReadsEnabled,
  getMobileUiuxFlags,
} from '@/lib/mobile-uiux/flags';
import type {
  MobileUiuxSettingsDetailResource,
  MobileUiuxSettingsDetailResponse,
} from '@/lib/mobile-uiux/contracts';
import {
  buildMobileUiuxFailure,
  buildMobileUiuxSuccess,
  getRequiredClinicId,
} from '@/lib/mobile-uiux/route-utils';
import type { Json } from '@/types/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MOBILE_UIUX_READ_ALLOWED_ROLES = ADMIN_USER_ROLE_VALUES;
const MENU_RESPONSE_COLUMNS =
  'id, clinic_id, name, duration_minutes, price, description, category, is_insurance_applicable, is_active, options';
const RESOURCE_LIST_SELECT =
  'id, name, type, working_hours, supported_menus, max_concurrent, nomination_fee, is_active, is_bookable, display_order';

type ClinicDetailRow = {
  id: string;
  name: string;
  address: string | null;
  phone_number: string | null;
};

type ResourceListRow = {
  id: string;
  name: string;
  type: string;
  working_hours: Json | null;
  supported_menus: string[] | null;
  max_concurrent: number | null;
  nomination_fee: number | null;
  is_active: boolean | null;
  is_bookable: boolean | null;
};

function isJsonRecord(
  value: Json | null
): value is Record<string, Json | undefined> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mapResourceListRow(
  row: ResourceListRow
): MobileUiuxSettingsDetailResource {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    workingHours: isJsonRecord(row.working_hours) ? row.working_hours : {},
    supportedMenus: row.supported_menus ?? [],
    maxConcurrent: row.max_concurrent ?? 1,
    nominationFee: row.nomination_fee ?? 0,
    isActive: row.is_active !== false,
    isBookable: row.is_bookable !== false,
  };
}

function buildRealDataDisabledResponse() {
  return buildMobileUiuxFailure(
    403,
    'FORBIDDEN',
    'モバイル UI/UX の実データ参照は無効です'
  );
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

  const entitlement = await fetchMobileUiuxClinicEntitlement({
    supabase: guard.supabase,
    flags,
    clinicId,
  });
  if (!areMobileUiuxRealDataReadsEnabled(flags, entitlement)) {
    return buildRealDataDisabledResponse();
  }

  const [clinicResult, menusResult, resourcesResult] = await Promise.all([
    guard.supabase
      .from('clinics')
      .select('id, name, address, phone_number')
      .eq('id', clinicId)
      .maybeSingle(),
    guard.supabase
      .from('menus')
      .select(MENU_RESPONSE_COLUMNS)
      .eq('clinic_id', clinicId)
      .eq('is_deleted', false)
      .order('display_order', { ascending: true }),
    guard.supabase
      .from('resources')
      .select(RESOURCE_LIST_SELECT)
      .eq('clinic_id', clinicId)
      .eq('is_deleted', false)
      .order('display_order', { ascending: true }),
  ]);

  if (clinicResult.error || menusResult.error || resourcesResult.error) {
    return buildMobileUiuxFailure(
      500,
      'INTERNAL',
      '設定詳細の取得に失敗しました'
    );
  }

  const clinic = clinicResult.data as ClinicDetailRow | null;
  const menuRows = (menusResult.data ?? []) as MenuRow[];
  const resourceRows = (resourcesResult.data ?? []) as ResourceListRow[];
  const response: MobileUiuxSettingsDetailResponse = {
    clinicId,
    clinic: clinic
      ? {
          id: clinic.id,
          name: clinic.name,
          address: clinic.address,
          phoneNumber: clinic.phone_number,
        }
      : null,
    menus: menuRows.map(mapMenuRowToApi),
    resources: resourceRows.map(mapResourceListRow),
  };

  return buildMobileUiuxSuccess(response);
}
