import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  processApiRequest,
} from '@/lib/api-helpers';
import { normalizeSupabaseError } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { handleRouteError, processClinicScopedBody } from '@/lib/route-helpers';
import {
  createScopedAdminContext,
  type SupabaseServerClient,
} from '@/lib/supabase';
import type { Database } from '@/types/supabase';
import {
  reservationsQuerySchema,
  reservationInsertSchema,
  reservationUpdateSchema,
  mapReservationInsertToRow,
  mapReservationUpdateToRow,
  type ReservationPricingSnapshot,
} from './schema';
import { STAFF_ROLES } from '@/lib/constants/roles';
import {
  enqueueReservationCreated,
  enqueueReservationChange,
} from '@/lib/notifications/email/reservation-enqueue';
import type { ReservationSnapshot } from '@/lib/notifications/email/types';
import type { ReservationOptionSelection } from '@/types/reservation';
import {
  getPermissionCandidateName,
  isLegacyBookableStaffCandidate,
  isPermissionBookableStaffCandidate,
  isPermissionStaffResourceRole,
  PERMISSION_STAFF_RESOURCE_ROLES,
  type LegacyStaffCandidate,
  type PermissionStaffCandidate,
  type StaffProfileSummary,
} from '@/lib/reservations/staff-resource-candidates';
import {
  createReservationReadClient,
  mapSelectedOptions,
  mapReservationListViewRow,
  RESERVATION_LIST_SELECT,
} from '@/lib/reservations/read-model';
import { hasReservationConflict } from '@/lib/reservations/conflict';

const PATH = '/api/reservations';
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
type ReservationMenuPricingResult =
  | { ok: true; menuPrice: number }
  | { ok: false; error: string };
type ReservationReferenceValidationResult =
  | { ok: true; pricingInputs: ReservationPricingInputs }
  | { ok: false; error: string };
type ReservationStaffResourceResult =
  | { ok: true; resource: ReservationResourceGuardRow }
  | { ok: false; error: string };
type PostgresReservationError = {
  code?: string;
  message?: string;
};
const RESERVATION_INSERT_RETURN_SELECT =
  'id, clinic_id, customer_id, menu_id, status, start_time, end_time, staff_id, updated_at';
const MANAGER_RESERVATION_CREATE_DENIED_MESSAGE =
  'マネージャーは予約の作成はできません。';
const MANAGER_RESERVATION_UPDATE_DENIED_MESSAGE =
  'マネージャーは予約の変更はできません。';

function normalizePriceAmount(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function getSelectedOptionsPriceDelta(
  selectedOptions: ReservationOptionSelection[]
) {
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
  resource: ReservationResourceGuardRow | null
) {
  return (
    resource !== null &&
    resource.type === 'staff' &&
    resource.is_deleted === false &&
    resource.is_active === true &&
    resource.is_bookable === true
  );
}

function buildStaffResourceFromCandidate(
  row: LegacyStaffCandidate,
  clinicId: string,
  createdBy: string
): Database['public']['Tables']['resources']['Insert'] {
  return {
    id: row.id,
    clinic_id: clinicId,
    name: row.name,
    type: 'staff',
    staff_code: `staff-${row.id}`,
    email: row.email,
    max_concurrent: 1,
    is_active: true,
    is_bookable: isLegacyBookableStaffCandidate(row),
    is_deleted: false,
    created_by: createdBy,
  };
}

function buildStaffResourceFromPermissionCandidate(
  row: PermissionStaffCandidate & { staff_id: string },
  profile: Pick<StaffProfileSummary, 'email' | 'full_name'> | null,
  clinicId: string,
  createdBy: string
): Database['public']['Tables']['resources']['Insert'] {
  return {
    id: row.staff_id,
    clinic_id: clinicId,
    name: getPermissionCandidateName(row, profile),
    type: 'staff',
    staff_code: `${row.role}-${row.staff_id}`,
    email: profile?.email ?? row.username,
    max_concurrent: 1,
    is_active: true,
    is_bookable: isPermissionStaffResourceRole(row.role),
    is_deleted: false,
    created_by: createdBy,
  };
}

function createNotificationClient(
  permissions: Parameters<typeof createScopedAdminContext>[0],
  clinicId: string
) {
  try {
    const scopedAdmin = createScopedAdminContext(permissions);
    scopedAdmin.assertClinicInScope(clinicId);
    return scopedAdmin.client;
  } catch (error) {
    logger.warn(
      'Failed to create scoped notification client for reservation email',
      {
        clinicId,
        error: error instanceof Error ? error.message : String(error),
      }
    );
    return null;
  }
}

function createScopedReservationClient(
  permissions: Parameters<typeof createScopedAdminContext>[0],
  clinicId: string
) {
  const scopedAdmin = createScopedAdminContext(permissions);
  scopedAdmin.assertClinicInScope(clinicId);
  return scopedAdmin.client;
}

function getReservationConstraintErrorMessage(
  error: PostgresReservationError
): string | null {
  const message = error.message ?? '';

  if (error.code === '23503') {
    if (
      message.includes('reservations_customer_id_fkey') ||
      message.includes('customers.id not found')
    ) {
      return '予約に紐づく患者データが見つかりません';
    }
    if (
      message.includes('reservations_menu_id_fkey') ||
      message.includes('menus.id not found')
    ) {
      return '予約に紐づくメニューが見つかりません。メニュー管理で有効なメニューを登録してください';
    }
    if (
      message.includes('reservations_staff_id_fkey') ||
      message.includes('resources.id not found')
    ) {
      return '予約に紐づく施術者リソースが見つかりません';
    }
    if (message.includes('reservations_clinic_id_fkey')) {
      return '予約を登録する院データが見つかりません。院の選択を確認してください';
    }
    if (message.includes('reservations_created_by_fkey')) {
      return '予約を登録するユーザー情報が見つかりません。再ログインしてからお試しください';
    }

    return '予約登録に必要な関連データが見つかりません';
  }

  if (error.code === '23514') {
    if (message.includes('reservations.customer_id clinic mismatch')) {
      return '選択した患者データが現在の院に紐づいていません';
    }
    if (message.includes('reservations.menu_id clinic mismatch')) {
      return '選択したメニューが現在の院に紐づいていません';
    }
    if (message.includes('reservations.staff_id clinic mismatch')) {
      return '選択した施術者リソースが現在の院に紐づいていません';
    }
    if (message.includes('reservations.clinic_id is required')) {
      return '予約を登録する院データが指定されていません';
    }
  }

  return null;
}

async function validateReservationCustomerAndMenuPricing(
  supabase: SupabaseServerClient,
  params: {
    clinicId: string;
    customerId: string;
    menuId: string;
  }
): Promise<ReservationMenuPricingResult> {
  const [customerResult, menuPricing] = await Promise.all([
    supabase
      .from('customers')
      .select('id')
      .eq('clinic_id', params.clinicId)
      .eq('id', params.customerId)
      .eq('is_deleted', false)
      .maybeSingle(),
    getReservationMenuPricing(supabase, {
      clinicId: params.clinicId,
      menuId: params.menuId,
    }),
  ]);

  if (customerResult.error) {
    throw normalizeSupabaseError(customerResult.error, PATH);
  }

  if (!customerResult.data) {
    return { ok: false, error: '選択した顧客データが見つかりません' };
  }

  if (menuPricing.ok === false) {
    return menuPricing;
  }

  return menuPricing;
}

async function getReservationMenuPricing(
  supabase: SupabaseServerClient,
  params: {
    clinicId: string;
    menuId: string;
  }
): Promise<ReservationMenuPricingResult> {
  const { data, error } = await supabase
    .from('menus')
    .select('id, price')
    .eq('clinic_id', params.clinicId)
    .eq('id', params.menuId)
    .eq('is_deleted', false)
    .maybeSingle();

  if (error) {
    throw normalizeSupabaseError(error, PATH);
  }

  if (!data) {
    return {
      ok: false,
      error:
        '選択したメニューが見つかりません。メニュー管理で有効なメニューを登録してください',
    };
  }

  const menu = data as ReservationMenuPricingRow;
  return { ok: true, menuPrice: normalizePriceAmount(menu.price) };
}

async function findUsableReservationStaffResource(
  supabase: SupabaseServerClient,
  params: {
    clinicId: string;
    staffId: string;
  }
): Promise<ReservationResourceGuardRow | null> {
  const { data, error } = await supabase
    .from('resources')
    .select('id, type, is_deleted, is_active, is_bookable, nomination_fee')
    .eq('clinic_id', params.clinicId)
    .eq('id', params.staffId)
    .eq('type', 'staff')
    .eq('is_deleted', false)
    .eq('is_active', true)
    .eq('is_bookable', true)
    .maybeSingle();

  if (error) {
    throw normalizeSupabaseError(error, PATH);
  }

  return data ? (data as ReservationResourceGuardRow) : null;
}

async function getReservationPricingInputs(
  supabase: SupabaseServerClient,
  params: {
    clinicId: string;
    menuId: string;
    staffId: string;
    staffResource?: ReservationResourceGuardRow;
  }
): Promise<ReservationReferenceValidationResult> {
  const staffResourcePromise = params.staffResource
    ? Promise.resolve(params.staffResource)
    : findUsableReservationStaffResource(supabase, {
        clinicId: params.clinicId,
        staffId: params.staffId,
      });

  const [menuPricing, staffResource] = await Promise.all([
    getReservationMenuPricing(supabase, {
      clinicId: params.clinicId,
      menuId: params.menuId,
    }),
    staffResourcePromise,
  ]);

  if (menuPricing.ok === false) {
    return menuPricing;
  }

  if (!staffResource) {
    return {
      ok: false,
      error: '選択した施術者リソースは予約に使用できません',
    };
  }

  return {
    ok: true,
    pricingInputs: {
      menuPrice: menuPricing.menuPrice,
      staffNominationFee: normalizePriceAmount(staffResource.nomination_fee),
    },
  };
}

async function ensureReservationStaffResource(
  supabase: SupabaseServerClient,
  params: {
    clinicId: string;
    staffId: string;
    createdBy: string;
  }
): Promise<ReservationStaffResourceResult> {
  const { data: resource, error: resourceError } = await supabase
    .from('resources')
    .select('id, type, is_deleted, is_active, is_bookable, nomination_fee')
    .eq('clinic_id', params.clinicId)
    .eq('id', params.staffId)
    .maybeSingle();

  if (resourceError) {
    throw normalizeSupabaseError(resourceError, PATH);
  }
  if (resource) {
    if (isUsableReservationResource(resource)) {
      return {
        ok: true,
        resource: resource as ReservationResourceGuardRow,
      };
    }

    return {
      ok: false,
      error: '選択した施術者リソースは予約に使用できません',
    };
  }

  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, clinic_id, name, email, role, is_therapist')
    .eq('clinic_id', params.clinicId)
    .eq('id', params.staffId)
    .maybeSingle();

  if (staffError) {
    throw normalizeSupabaseError(staffError, PATH);
  }
  if (!staff) {
    const { data: permission, error: permissionError } = await supabase
      .from('user_permissions')
      .select('staff_id, clinic_id, role, username')
      .eq('clinic_id', params.clinicId)
      .eq('staff_id', params.staffId)
      .in('role', [...PERMISSION_STAFF_RESOURCE_ROLES])
      .maybeSingle();

    if (permissionError) {
      throw normalizeSupabaseError(permissionError, PATH);
    }

    if (!permission || !isPermissionBookableStaffCandidate(permission)) {
      return {
        ok: false,
        error: '担当スタッフのリソースが見つかりません',
      };
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, email, full_name')
      .eq('user_id', params.staffId)
      .maybeSingle();

    if (profileError) {
      throw normalizeSupabaseError(profileError, PATH);
    }

    const permissionResource = buildStaffResourceFromPermissionCandidate(
      permission,
      profile,
      params.clinicId,
      params.createdBy
    );
    const { data: upsertedPermissionResource, error: permissionUpsertError } =
      await supabase
        .from('resources')
        .upsert(permissionResource, { onConflict: 'id' })
        .select('id, type, is_deleted, is_active, is_bookable, nomination_fee')
        .single();

    if (permissionUpsertError) {
      throw normalizeSupabaseError(permissionUpsertError, PATH);
    }

    if (!isUsableReservationResource(upsertedPermissionResource)) {
      return {
        ok: false,
        error: '選択した施術者リソースは予約に使用できません',
      };
    }

    return {
      ok: true,
      resource: upsertedPermissionResource as ReservationResourceGuardRow,
    };
  }

  const staffResource = buildStaffResourceFromCandidate(
    staff,
    params.clinicId,
    params.createdBy
  );
  const { data: upsertedStaffResource, error: upsertError } = await supabase
    .from('resources')
    .upsert(staffResource, { onConflict: 'id' })
    .select('id, type, is_deleted, is_active, is_bookable, nomination_fee')
    .single();

  if (upsertError) {
    throw normalizeSupabaseError(upsertError, PATH);
  }

  if (!isUsableReservationResource(upsertedStaffResource)) {
    return {
      ok: false,
      error: '選択した施術者リソースは予約に使用できません',
    };
  }

  return {
    ok: true,
    resource: upsertedStaffResource as ReservationResourceGuardRow,
  };
}

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = reservationsQuerySchema.safeParse({
      clinic_id: request.nextUrl.searchParams.get('clinic_id'),
      id: request.nextUrl.searchParams.get('id') ?? undefined,
      start_date: request.nextUrl.searchParams.get('start_date') ?? undefined,
      end_date: request.nextUrl.searchParams.get('end_date') ?? undefined,
      staff_id: request.nextUrl.searchParams.get('staff_id') ?? undefined,
      customer_id: request.nextUrl.searchParams.get('customer_id') ?? undefined,
    });
    if (!parsedQuery.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedQuery.error.flatten()
      );
    }

    const { clinic_id, id, start_date, end_date, staff_id, customer_id } =
      parsedQuery.data;

    const auth = await processApiRequest(request, {
      clinicId: clinic_id,
      requireClinicMatch: true,
    });
    if (!auth.success) return auth.error;

    const supabase = createReservationReadClient(auth.permissions, clinic_id);

    const query = supabase
      .from('reservation_list_view')
      .select(RESERVATION_LIST_SELECT)
      .eq('clinic_id', clinic_id);

    if (id) {
      const { data, error } = await query.eq('id', id).maybeSingle();
      if (error) {
        throw normalizeSupabaseError(error, PATH);
      }
      if (!data) {
        return createErrorResponse('予約が見つかりません', 404);
      }

      return createSuccessResponse(mapReservationListViewRow(data));
    }

    if (start_date) query.gte('start_time', start_date);
    if (end_date) query.lte('start_time', end_date);
    if (staff_id) query.eq('staff_id', staff_id);
    if (customer_id) query.eq('customer_id', customer_id);

    const { data, error } = await query.order('start_time', {
      ascending: !customer_id,
    });

    if (error) {
      const constraintErrorMessage =
        getReservationConstraintErrorMessage(error);
      if (constraintErrorMessage) {
        return createErrorResponse(constraintErrorMessage, 400);
      }
      throw normalizeSupabaseError(error, PATH);
    }

    const mapped = (data ?? []).map(mapReservationListViewRow);

    return createSuccessResponse(mapped);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await processClinicScopedBody(
      request,
      reservationInsertSchema,
      {
        deniedRoles: ['manager'],
        deniedRoleMessage: MANAGER_RESERVATION_CREATE_DENIED_MESSAGE,
      }
    );
    if (!result.success) return result.error;

    const dto = result.dto;
    const reservationMutationClient = createScopedReservationClient(
      result.permissions,
      dto.clinic_id
    );
    const [staffResource, references] = await Promise.all([
      ensureReservationStaffResource(reservationMutationClient, {
        clinicId: dto.clinic_id,
        staffId: dto.staffId,
        createdBy: result.auth.id,
      }),
      validateReservationCustomerAndMenuPricing(reservationMutationClient, {
        clinicId: dto.clinic_id,
        customerId: dto.customerId,
        menuId: dto.menuId,
      }),
    ]);

    if (staffResource.ok === false) {
      return createErrorResponse(staffResource.error, 400);
    }

    if (references.ok === false) {
      return createErrorResponse(references.error, 400);
    }

    const conflict = await hasReservationConflict(reservationMutationClient, {
      clinicId: dto.clinic_id,
      staffId: dto.staffId,
      startTime: dto.startTime,
      endTime: dto.endTime,
      path: PATH,
    });
    if (conflict) {
      return createErrorResponse('同時間帯に既存予約があります', 409);
    }

    const pricing = buildReservationPricingSnapshot({
      isStaffRequested: dto.isStaffRequested ?? false,
      menuPrice: references.menuPrice,
      staffNominationFee: normalizePriceAmount(
        staffResource.resource.nomination_fee
      ),
      selectedOptions: normalizeDtoSelectedOptions(dto.selectedOptions),
    });
    const insertPayload = mapReservationInsertToRow(
      dto,
      result.auth.id,
      pricing
    );

    const { data, error } = await reservationMutationClient
      .from('reservations')
      .insert(insertPayload)
      .select(RESERVATION_INSERT_RETURN_SELECT)
      .single();

    if (error) {
      const constraintErrorMessage =
        getReservationConstraintErrorMessage(error);
      if (constraintErrorMessage) {
        return createErrorResponse(constraintErrorMessage, 400);
      }
      throw normalizeSupabaseError(error, PATH);
    }

    // GET と同じ view から再取得し shape を揃える。view から見えない場合は
    // INNER JOIN / is_deleted / clinic_id 不整合の可能性があるため 500 で落とす。
    const { data: viewRow, error: viewError } = await reservationMutationClient
      .from('reservation_list_view')
      .select(RESERVATION_LIST_SELECT)
      .eq('clinic_id', dto.clinic_id)
      .eq('id', data.id)
      .maybeSingle();

    if (viewError) {
      throw normalizeSupabaseError(viewError, PATH);
    }

    if (!viewRow) {
      logger.error(
        'Created reservation is not visible in reservation_list_view',
        {
          reservationId: data.id,
          clinicId: dto.clinic_id,
          customerId: dto.customerId,
          menuId: dto.menuId,
          staffId: dto.staffId,
        }
      );
      return createErrorResponse(
        '予約は作成されましたが、予約一覧への反映に失敗しました',
        500
      );
    }

    // メール通知エンキュー (失敗しても予約は成功扱い)
    const notificationSupabase = createNotificationClient(
      result.permissions,
      dto.clinic_id
    );
    if (notificationSupabase) {
      enqueueReservationCreated(notificationSupabase, {
        id: data.id,
        clinic_id: data.clinic_id,
        customer_id: data.customer_id,
        menu_id: data.menu_id,
        status: data.status,
        start_time: data.start_time,
        end_time: data.end_time,
        staff_id: data.staff_id,
        updated_at: data.updated_at ?? new Date().toISOString(),
      }).catch(error => {
        logger.error(
          'Failed to enqueue reservation_created email from reservations route',
          {
            reservationId: data.id,
            clinicId: dto.clinic_id,
            error: error instanceof Error ? error.message : String(error),
          }
        );
      });
    }

    return createSuccessResponse(mapReservationListViewRow(viewRow), 201);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

export async function PATCH(request: NextRequest) {
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
    if (!result.success) return result.error;

    const dto = result.dto;
    const reservationMutationClient = createScopedReservationClient(
      result.permissions,
      dto.clinic_id
    );

    // 更新前レコードを取得 (conflict check + メール通知差分検知に使用)
    const { data: existing, error: existingError } =
      await reservationMutationClient
        .from('reservations')
        .select(
          'id, clinic_id, customer_id, menu_id, status, staff_id, start_time, end_time, notes, selected_options, is_staff_requested'
        )
        .eq('id', dto.id)
        .eq('clinic_id', dto.clinic_id)
        .single();

    if (existingError) {
      throw normalizeSupabaseError(existingError, PATH);
    }

    let existingStaffResource: ReservationResourceGuardRow | undefined;

    if (dto.staffId || dto.startTime || dto.endTime) {
      const nextStaffId = dto.staffId ?? existing.staff_id;
      const nextStartTime = dto.startTime ?? existing.start_time;
      const nextEndTime = dto.endTime ?? existing.end_time;

      let staffResource: ReservationResourceGuardRow | undefined;
      if (dto.staffId) {
        const staffResourceResult = await ensureReservationStaffResource(
          reservationMutationClient,
          {
            clinicId: dto.clinic_id,
            staffId: dto.staffId,
            createdBy: result.auth.id,
          }
        );
        if (staffResourceResult.ok === false) {
          return createErrorResponse(staffResourceResult.error, 400);
        }
        staffResource = staffResourceResult.resource;
      }

      const conflict = await hasReservationConflict(reservationMutationClient, {
        clinicId: dto.clinic_id,
        staffId: nextStaffId,
        startTime: nextStartTime,
        endTime: nextEndTime,
        excludeId: dto.id,
        path: PATH,
      });
      if (conflict) {
        return createErrorResponse('同時間帯に既存予約があります', 409);
      }

      if (staffResource) {
        existingStaffResource = staffResource;
      }
    }

    let pricing: ReservationPricingSnapshot | undefined;
    const shouldReprice =
      dto.staffId !== undefined ||
      dto.selectedOptions !== undefined ||
      dto.isStaffRequested !== undefined;

    if (shouldReprice) {
      const nextStaffId = dto.staffId ?? existing.staff_id;
      const references = await getReservationPricingInputs(
        reservationMutationClient,
        {
          clinicId: dto.clinic_id,
          menuId: existing.menu_id,
          staffId: nextStaffId,
          staffResource: existingStaffResource,
        }
      );

      if (references.ok === false) {
        return createErrorResponse(references.error, 400);
      }

      pricing = buildReservationPricingSnapshot({
        isStaffRequested:
          dto.isStaffRequested ?? existing.is_staff_requested ?? false,
        menuPrice: references.pricingInputs.menuPrice,
        staffNominationFee: references.pricingInputs.staffNominationFee,
        selectedOptions:
          dto.selectedOptions !== undefined
            ? normalizeDtoSelectedOptions(dto.selectedOptions)
            : mapSelectedOptions(existing.selected_options),
      });
    }

    const updatePayload = mapReservationUpdateToRow(dto, pricing);

    const { data, error } = await reservationMutationClient
      .from('reservations')
      .update(updatePayload)
      .eq('id', dto.id)
      .eq('clinic_id', dto.clinic_id)
      .select()
      .single();

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    // メール通知エンキュー (差分検知ベース、失敗しても更新は成功扱い)
    const before: ReservationSnapshot = {
      id: existing.id,
      clinic_id: existing.clinic_id,
      customer_id: existing.customer_id,
      menu_id: existing.menu_id,
      status: existing.status,
      start_time: existing.start_time,
      end_time: existing.end_time,
      staff_id: existing.staff_id,
      notes: existing.notes,
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
    const notificationSupabase = createNotificationClient(
      result.permissions,
      dto.clinic_id
    );
    if (notificationSupabase) {
      enqueueReservationChange(
        notificationSupabase,
        before,
        after,
        data.updated_at ?? new Date().toISOString()
      ).catch(error => {
        logger.error(
          'Failed to enqueue reservation change email from reservations route',
          {
            reservationId: data.id,
            clinicId: dto.clinic_id,
            error: error instanceof Error ? error.message : String(error),
          }
        );
      });
    }

    return createSuccessResponse(data);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

export async function DELETE(_request: NextRequest) {
  return createErrorResponse(
    "予約の物理削除はサポートしていません。PATCH /api/reservations で status='cancelled' を指定してください。",
    405
  );
}
