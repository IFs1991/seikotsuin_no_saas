import { NextRequest } from 'next/server';

import { processApiRequest } from '@/lib/api-helpers';
import { ADMIN_USER_ROLE_VALUES } from '@/lib/constants/roles';
import {
  areMobileUiuxWritesEnabled,
  getMobileUiuxFlags,
} from '@/lib/mobile-uiux/flags';
import type { MobileUiuxReservationsResponse } from '@/lib/mobile-uiux/contracts';
import {
  buildMobileUiuxFailure,
  buildMobileUiuxSuccess,
  isValidDateKey,
} from '@/lib/mobile-uiux/route-utils';
import { getJstDateUtcRange, toJstDateKey } from '@/lib/manager-dashboard';
import {
  createReservationReadClient,
  mapReservationListViewRow,
  RESERVATION_LIST_SELECT,
} from '@/lib/reservations/read-model';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const JST_TIMEZONE = 'Asia/Tokyo' as const;
const MOBILE_UIUX_READ_ALLOWED_ROLES = ADMIN_USER_ROLE_VALUES;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveDateKey(value: string | null): string | null {
  if (value === null) {
    return toJstDateKey(new Date());
  }

  return isValidDateKey(value) ? value : null;
}

function validateUuid(value: string | null, field: string): string | null {
  if (!value) {
    return `${field} は必須です`;
  }

  if (!UUID_PATTERN.test(value)) {
    return `${field} はUUID形式で指定してください`;
  }

  return null;
}

function validateOptionalUuid(
  value: string | null,
  field: string
): string | null {
  if (value === null) {
    return null;
  }

  if (!UUID_PATTERN.test(value)) {
    return `${field} はUUID形式で指定してください`;
  }

  return null;
}

function buildWriteDisabledResponse() {
  return buildMobileUiuxFailure(
    403,
    'FORBIDDEN',
    'モバイル UI/UX の予約書き込みは無効です'
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

  const clinicId = request.nextUrl.searchParams.get('clinic_id');
  const staffId = request.nextUrl.searchParams.get('staff_id');
  const clinicIdError = validateUuid(clinicId, 'clinic_id');
  if (clinicIdError) {
    return buildMobileUiuxFailure(400, 'BAD_REQUEST', clinicIdError);
  }

  const staffIdError = validateOptionalUuid(staffId, 'staff_id');
  if (staffIdError) {
    return buildMobileUiuxFailure(400, 'BAD_REQUEST', staffIdError);
  }

  const date = resolveDateKey(request.nextUrl.searchParams.get('date'));
  if (!date) {
    return buildMobileUiuxFailure(
      400,
      'BAD_REQUEST',
      'date は YYYY-MM-DD 形式で指定してください'
    );
  }

  const auth = await processApiRequest(request, {
    clinicId,
    requireClinicMatch: true,
    allowedRoles: Array.from(MOBILE_UIUX_READ_ALLOWED_ROLES),
  });
  if (!auth.success) {
    return buildMobileUiuxFailure(
      auth.error.status,
      auth.error.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
      '対象クリニックへのアクセス権がありません'
    );
  }

  const readClient = createReservationReadClient(auth.permissions, clinicId);
  const range = getJstDateUtcRange(date);
  let query = readClient
    .from('reservation_list_view')
    .select(RESERVATION_LIST_SELECT)
    .eq('clinic_id', clinicId)
    .gte('start_time', range.startIso)
    .lt('start_time', range.endIso);

  if (staffId) {
    query = query.eq('staff_id', staffId);
  }

  const { data, error } = await query.order('start_time', {
    ascending: true,
  });

  if (error) {
    return buildMobileUiuxFailure(
      500,
      'INTERNAL_SERVER_ERROR',
      '予約一覧の取得に失敗しました'
    );
  }

  const response: MobileUiuxReservationsResponse = {
    clinicId,
    date,
    timezone: JST_TIMEZONE,
    reservations: (data ?? []).map(mapReservationListViewRow),
  };

  return buildMobileUiuxSuccess(response);
}

export async function POST(_request: NextRequest) {
  const flags = getMobileUiuxFlags();
  if (!areMobileUiuxWritesEnabled(flags, 'reservation')) {
    return buildWriteDisabledResponse();
  }

  return buildWriteDisabledResponse();
}

export async function PATCH(_request: NextRequest) {
  const flags = getMobileUiuxFlags();
  if (!areMobileUiuxWritesEnabled(flags, 'reservation')) {
    return buildWriteDisabledResponse();
  }

  return buildWriteDisabledResponse();
}
