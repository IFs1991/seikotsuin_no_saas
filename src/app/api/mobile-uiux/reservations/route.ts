import { NextRequest } from 'next/server';

import { processApiRequest } from '@/lib/api-helpers';
import {
  reservationInsertSchema,
  reservationUpdateSchema,
  mapReservationInsertToRow,
  mapReservationUpdateToRow,
  type ReservationPricingSnapshot,
} from '@/app/api/reservations/schema';
import { ADMIN_USER_ROLE_VALUES, STAFF_ROLES } from '@/lib/constants/roles';
import {
  enqueueReservationChange,
  enqueueReservationCreated,
} from '@/lib/notifications/email/reservation-enqueue';
import type { ReservationSnapshot } from '@/lib/notifications/email/types';
import { processClinicScopedBody } from '@/lib/route-helpers';
import {
  areMobileUiuxWritesEnabled,
  areMobileUiuxRealDataReadsEnabled,
  getMobileUiuxFlags,
  type MobileUiuxFlags,
} from '@/lib/mobile-uiux/flags';
import { fetchMobileUiuxClinicEntitlement } from '@/lib/mobile-uiux/entitlements';
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
  mapSelectedOptions,
  type ReservationListApiRow,
  type ReservationListItem,
  RESERVATION_LIST_SELECT,
} from '@/lib/reservations/read-model';
import { hasReservationConflict } from '@/lib/reservations/conflict';
import type { SupabaseServerClient } from '@/lib/supabase';
import type { Database } from '@/types/supabase';
import type { ReservationOptionSelection } from '@/types/reservation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const JST_TIMEZONE = 'Asia/Tokyo' as const;
const PATH = '/api/mobile-uiux/reservations';
const MOBILE_UIUX_READ_ALLOWED_ROLES = ADMIN_USER_ROLE_VALUES;
const RESERVATION_INSERT_RETURN_SELECT =
  'id, clinic_id, customer_id, menu_id, status, start_time, end_time, staff_id, updated_at';
const RESERVATION_UPDATE_RETURN_SELECT =
  'id, clinic_id, customer_id, menu_id, status, start_time, end_time, staff_id, notes, selected_options, is_staff_requested, updated_at';
const MANAGER_RESERVATION_CREATE_DENIED_MESSAGE =
  'マネージャーは予約の作成はできません。';
const MANAGER_RESERVATION_UPDATE_DENIED_MESSAGE =
  'マネージャーは予約の変更はできません。';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ReservationTableRow = Database['public']['Tables']['reservations']['Row'];

type ReservationResourceGuardRow = Pick<
  Database['public']['Tables']['resources']['Row'],
  'id' | 'type' | 'is_deleted' | 'is_active' | 'is_bookable' | 'nomination_fee'
>;

type ReservationMenuPricingRow = Pick<
  Database['public']['Tables']['menus']['Row'],
  'id' | 'price'
>;

type ReservationPricingInputs = {
  menuPrice: number;
  staffNominationFee: number;
};

type MobileUiuxReservationMutationResponse = {
  clinicId: string;
  reservation: ReservationListItem;
};

type ScopedReferenceResult =
  | {
      ok: true;
      pricingInputs: ReservationPricingInputs;
      staffResource: ReservationResourceGuardRow;
    }
  | { ok: false; status: number; message: string };

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

function canUseWriteRoutes(flags: MobileUiuxFlags): boolean {
  return (
    flags.enabled &&
    flags.realDataEnabled &&
    areMobileUiuxWritesEnabled(flags, 'reservation')
  );
}

function buildRealDataDisabledResponse() {
  return buildMobileUiuxFailure(
    403,
    'FORBIDDEN',
    'モバイル UI/UX の実データ参照は無効です'
  );
}

function normalizePriceAmount(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function getSelectedOptionsPriceDelta(
  selectedOptions: ReservationOptionSelection[]
): number {
  return selectedOptions.reduce(
    (sum, option) => sum + normalizePriceAmount(option.priceDelta),
    0
  );
}

function normalizeDtoSelectedOptions(
  selectedOptions:
    | {
        optionId?: string;
        name?: string;
        priceDelta?: number;
        durationDeltaMinutes?: number;
      }[]
    | undefined
): ReservationOptionSelection[] {
  return (selectedOptions ?? []).map(option => ({
    optionId: option.optionId ?? '',
    name: option.name ?? '',
    priceDelta: option.priceDelta ?? 0,
    durationDeltaMinutes: option.durationDeltaMinutes ?? 0,
  }));
}

function buildReservationPricingSnapshot(params: {
  isStaffRequested: boolean;
  menuPrice: number;
  staffNominationFee: number;
  selectedOptions: ReservationOptionSelection[];
}): ReservationPricingSnapshot {
  const staffNominationFee = params.isStaffRequested
    ? normalizePriceAmount(params.staffNominationFee)
    : 0;

  return {
    isStaffRequested: params.isStaffRequested,
    staffNominationFee,
    price:
      normalizePriceAmount(params.menuPrice) +
      getSelectedOptionsPriceDelta(params.selectedOptions) +
      staffNominationFee,
  };
}

function isUsableReservationResource(
  row: ReservationResourceGuardRow | null
): row is ReservationResourceGuardRow {
  return (
    row !== null &&
    row.type === 'staff' &&
    row.is_deleted === false &&
    row.is_active === true &&
    row.is_bookable === true
  );
}

async function getScopedReservationReferences(
  supabase: SupabaseServerClient,
  params: {
    clinicId: string;
    customerId?: string;
    menuId: string;
    staffId: string;
  }
): Promise<ScopedReferenceResult> {
  const customerPromise = params.customerId
    ? supabase
        .from('customers')
        .select('id')
        .eq('clinic_id', params.clinicId)
        .eq('id', params.customerId)
        .eq('is_deleted', false)
        .maybeSingle()
    : Promise.resolve({ data: { id: '' }, error: null });
  const menuPromise = supabase
    .from('menus')
    .select('id, price')
    .eq('clinic_id', params.clinicId)
    .eq('id', params.menuId)
    .eq('is_deleted', false)
    .maybeSingle();
  const staffPromise = supabase
    .from('resources')
    .select('id, type, is_deleted, is_active, is_bookable, nomination_fee')
    .eq('clinic_id', params.clinicId)
    .eq('id', params.staffId)
    .eq('type', 'staff')
    .eq('is_deleted', false)
    .eq('is_active', true)
    .eq('is_bookable', true)
    .maybeSingle();
  const [customerResult, menuResult, staffResult] = await Promise.all([
    customerPromise,
    menuPromise,
    staffPromise,
  ]);

  if (customerResult.error || menuResult.error || staffResult.error) {
    return {
      ok: false,
      status: 500,
      message: '予約参照データの検証に失敗しました',
    };
  }

  if (!customerResult.data || !menuResult.data || !staffResult.data) {
    return {
      ok: false,
      status: 403,
      message: '予約に必要な参照データへのアクセス権がありません',
    };
  }

  if (!isUsableReservationResource(staffResult.data)) {
    return {
      ok: false,
      status: 403,
      message: '予約に必要な参照データへのアクセス権がありません',
    };
  }

  return {
    ok: true,
    pricingInputs: {
      menuPrice: normalizePriceAmount(menuResult.data.price),
      staffNominationFee: normalizePriceAmount(staffResult.data.nomination_fee),
    },
    staffResource: staffResult.data,
  };
}

async function fetchReservationListItem(
  supabase: SupabaseServerClient,
  clinicId: string,
  reservationId: string
): Promise<ReservationListItem | null> {
  const { data, error } = await supabase
    .from('reservation_list_view')
    .select(RESERVATION_LIST_SELECT)
    .eq('clinic_id', clinicId)
    .eq('id', reservationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapReservationListViewRow(data as ReservationListApiRow) : null;
}

function enqueueCreatedWithoutBlocking(
  supabase: SupabaseServerClient,
  row: {
    id: string;
    clinic_id: string;
    customer_id: string;
    menu_id: string;
    status: string | null;
    start_time: string;
    end_time: string;
    staff_id: string;
    updated_at: string | null;
  }
): void {
  enqueueReservationCreated(supabase, {
    id: row.id,
    clinic_id: row.clinic_id,
    customer_id: row.customer_id,
    menu_id: row.menu_id,
    status: row.status,
    start_time: row.start_time,
    end_time: row.end_time,
    staff_id: row.staff_id,
    updated_at: row.updated_at ?? new Date().toISOString(),
  }).catch(() => undefined);
}

function enqueueChangeWithoutBlocking(
  supabase: SupabaseServerClient,
  before: ReservationSnapshot,
  after: ReservationSnapshot,
  updatedAt: string
): void {
  enqueueReservationChange(supabase, before, after, updatedAt).catch(
    () => undefined
  );
}

export async function GET(request: NextRequest) {
  const flags = getMobileUiuxFlags();
  if (!flags.enabled || !flags.realDataEnabled) {
    return buildRealDataDisabledResponse();
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

  const entitlement = await fetchMobileUiuxClinicEntitlement({
    supabase: auth.supabase,
    flags,
    clinicId,
  });
  if (!areMobileUiuxRealDataReadsEnabled(flags, entitlement)) {
    return buildRealDataDisabledResponse();
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

export async function POST(request: NextRequest) {
  const flags = getMobileUiuxFlags();
  if (!canUseWriteRoutes(flags)) {
    return buildWriteDisabledResponse();
  }

  try {
    const result = await processClinicScopedBody(
      request,
      reservationInsertSchema,
      {
        deniedRoles: ['manager'],
        deniedRoleMessage: MANAGER_RESERVATION_CREATE_DENIED_MESSAGE,
      }
    );
    if (!result.success) {
      return result.error;
    }

    const dto = result.dto;
    const entitlement = await fetchMobileUiuxClinicEntitlement({
      supabase: result.supabase,
      flags,
      clinicId: dto.clinic_id,
    });
    if (!areMobileUiuxWritesEnabled(flags, 'reservation', entitlement)) {
      return buildWriteDisabledResponse();
    }

    const references = await getScopedReservationReferences(result.supabase, {
      clinicId: dto.clinic_id,
      customerId: dto.customerId,
      menuId: dto.menuId,
      staffId: dto.staffId,
    });
    if (references.ok === false) {
      return buildMobileUiuxFailure(
        references.status,
        references.status === 403 ? 'FORBIDDEN' : 'INTERNAL_SERVER_ERROR',
        references.message
      );
    }

    const conflict = await hasReservationConflict(result.supabase, {
      clinicId: dto.clinic_id,
      staffId: dto.staffId,
      startTime: dto.startTime,
      endTime: dto.endTime,
      path: PATH,
    });
    if (conflict) {
      return buildMobileUiuxFailure(
        409,
        'CONFLICT',
        '同時間帯に既存予約があります'
      );
    }

    const pricing = buildReservationPricingSnapshot({
      isStaffRequested: dto.isStaffRequested ?? false,
      menuPrice: references.pricingInputs.menuPrice,
      staffNominationFee: references.pricingInputs.staffNominationFee,
      selectedOptions: normalizeDtoSelectedOptions(dto.selectedOptions),
    });
    const insertPayload = mapReservationInsertToRow(
      dto,
      result.auth.id,
      pricing
    );

    const { data, error } = await result.supabase
      .from('reservations')
      .insert(insertPayload)
      .select(RESERVATION_INSERT_RETURN_SELECT)
      .single();

    if (error || !data) {
      return buildMobileUiuxFailure(
        500,
        'INTERNAL_SERVER_ERROR',
        '予約の作成に失敗しました'
      );
    }

    const reservation = await fetchReservationListItem(
      result.supabase,
      dto.clinic_id,
      data.id
    );
    if (!reservation) {
      return buildMobileUiuxFailure(
        500,
        'INTERNAL_SERVER_ERROR',
        '予約は作成されましたが、予約一覧への反映に失敗しました'
      );
    }

    enqueueCreatedWithoutBlocking(result.supabase, data);

    const response: MobileUiuxReservationMutationResponse = {
      clinicId: dto.clinic_id,
      reservation,
    };

    return buildMobileUiuxSuccess(response, 201);
  } catch {
    return buildMobileUiuxFailure(
      500,
      'INTERNAL_SERVER_ERROR',
      '予約の作成に失敗しました'
    );
  }
}

export async function PATCH(request: NextRequest) {
  const flags = getMobileUiuxFlags();
  if (!canUseWriteRoutes(flags)) {
    return buildWriteDisabledResponse();
  }

  try {
    const result = await processClinicScopedBody(
      request,
      reservationUpdateSchema,
      {
        allowedRoles: Array.from(STAFF_ROLES),
        deniedRoles: ['manager'],
        deniedRoleMessage: MANAGER_RESERVATION_UPDATE_DENIED_MESSAGE,
      }
    );
    if (!result.success) {
      return result.error;
    }

    const dto = result.dto;
    const entitlement = await fetchMobileUiuxClinicEntitlement({
      supabase: result.supabase,
      flags,
      clinicId: dto.clinic_id,
    });
    if (!areMobileUiuxWritesEnabled(flags, 'reservation', entitlement)) {
      return buildWriteDisabledResponse();
    }

    const { data: existing, error: existingError } = await result.supabase
      .from('reservations')
      .select(
        'id, clinic_id, customer_id, menu_id, status, staff_id, start_time, end_time, notes, selected_options, is_staff_requested'
      )
      .eq('id', dto.id)
      .eq('clinic_id', dto.clinic_id)
      .single();

    if (existingError || !existing) {
      return buildMobileUiuxFailure(
        403,
        'FORBIDDEN',
        '予約へのアクセス権がありません'
      );
    }

    const existingRow = existing as Pick<
      ReservationTableRow,
      | 'id'
      | 'clinic_id'
      | 'customer_id'
      | 'menu_id'
      | 'status'
      | 'staff_id'
      | 'start_time'
      | 'end_time'
      | 'notes'
      | 'selected_options'
      | 'is_staff_requested'
    >;

    let references: ScopedReferenceResult | null = null;
    if (
      dto.staffId !== undefined ||
      dto.selectedOptions !== undefined ||
      dto.isStaffRequested !== undefined
    ) {
      references = await getScopedReservationReferences(result.supabase, {
        clinicId: dto.clinic_id,
        menuId: existingRow.menu_id,
        staffId: dto.staffId ?? existingRow.staff_id,
      });
      if (references.ok === false) {
        return buildMobileUiuxFailure(
          references.status,
          references.status === 403 ? 'FORBIDDEN' : 'INTERNAL_SERVER_ERROR',
          references.message
        );
      }
    }

    if (dto.staffId || dto.startTime || dto.endTime) {
      const conflict = await hasReservationConflict(result.supabase, {
        clinicId: dto.clinic_id,
        staffId: dto.staffId ?? existingRow.staff_id,
        startTime: dto.startTime ?? existingRow.start_time,
        endTime: dto.endTime ?? existingRow.end_time,
        excludeId: dto.id,
        path: PATH,
      });
      if (conflict) {
        return buildMobileUiuxFailure(
          409,
          'CONFLICT',
          '同時間帯に既存予約があります'
        );
      }
    }

    const pricing =
      references?.ok === true
        ? buildReservationPricingSnapshot({
            isStaffRequested:
              dto.isStaffRequested ?? existingRow.is_staff_requested ?? false,
            menuPrice: references.pricingInputs.menuPrice,
            staffNominationFee: references.pricingInputs.staffNominationFee,
            selectedOptions:
              dto.selectedOptions !== undefined
                ? normalizeDtoSelectedOptions(dto.selectedOptions)
                : mapSelectedOptions(existingRow.selected_options),
          })
        : undefined;
    const updatePayload = mapReservationUpdateToRow(dto, pricing);

    const { data, error } = await result.supabase
      .from('reservations')
      .update(updatePayload)
      .eq('id', dto.id)
      .eq('clinic_id', dto.clinic_id)
      .select(RESERVATION_UPDATE_RETURN_SELECT)
      .single();

    if (error || !data) {
      return buildMobileUiuxFailure(
        500,
        'INTERNAL_SERVER_ERROR',
        '予約の更新に失敗しました'
      );
    }

    const reservation = await fetchReservationListItem(
      result.supabase,
      dto.clinic_id,
      dto.id
    );
    if (!reservation) {
      return buildMobileUiuxFailure(
        500,
        'INTERNAL_SERVER_ERROR',
        '予約は更新されましたが、予約一覧への反映に失敗しました'
      );
    }

    const before: ReservationSnapshot = {
      id: existingRow.id,
      clinic_id: existingRow.clinic_id,
      customer_id: existingRow.customer_id,
      menu_id: existingRow.menu_id,
      status: existingRow.status,
      start_time: existingRow.start_time,
      end_time: existingRow.end_time,
      staff_id: existingRow.staff_id,
      notes: existingRow.notes,
    };
    const after: ReservationSnapshot = {
      id: data.id,
      clinic_id: data.clinic_id,
      customer_id: data.customer_id,
      menu_id: data.menu_id,
      status: data.status,
      start_time: data.start_time,
      end_time: data.end_time,
      staff_id: data.staff_id,
      notes: data.notes,
    };
    enqueueChangeWithoutBlocking(
      result.supabase,
      before,
      after,
      data.updated_at ?? new Date().toISOString()
    );

    const response: MobileUiuxReservationMutationResponse = {
      clinicId: dto.clinic_id,
      reservation,
    };

    return buildMobileUiuxSuccess(response);
  } catch {
    return buildMobileUiuxFailure(
      500,
      'INTERNAL_SERVER_ERROR',
      '予約の更新に失敗しました'
    );
  }
}
