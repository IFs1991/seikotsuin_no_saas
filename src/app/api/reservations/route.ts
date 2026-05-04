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

const PATH = '/api/reservations';
type ReservationListViewRow =
  Database['public']['Views']['reservation_list_view']['Row'];
type PostgresReservationError = {
  code?: string;
  message?: string;
};

function isReservationOptionSelection(
  value: unknown
): value is ReservationOptionSelection {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const option = value as Record<string, unknown>;
  return (
    typeof option.optionId === 'string' &&
    typeof option.name === 'string' &&
    typeof option.priceDelta === 'number' &&
    typeof option.durationDeltaMinutes === 'number'
  );
}

function mapSelectedOptions(value: ReservationListViewRow['selected_options']) {
  return Array.isArray(value) ? value.filter(isReservationOptionSelection) : [];
}

function mapReservationListViewRow(row: ReservationListViewRow) {
  return {
    id: row.id ?? '',
    customerId: row.customer_id ?? '',
    customerName: row.customer_name,
    menuId: row.menu_id ?? '',
    menuName: row.menu_name,
    staffId: row.staff_id ?? '',
    staffName: row.staff_name,
    startTime: row.start_time ?? '',
    endTime: row.end_time ?? '',
    status: row.status,
    channel: row.channel,
    notes: row.notes ?? undefined,
    selectedOptions: mapSelectedOptions(row.selected_options),
  };
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

async function hasReservationConflict(
  supabase: SupabaseServerClient,
  params: {
    clinicId: string;
    staffId: string;
    startTime: string;
    endTime: string;
    excludeId?: string;
  }
): Promise<boolean> {
  let query = supabase
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', params.clinicId)
    .eq('staff_id', params.staffId)
    .lt('start_time', params.endTime)
    .gt('end_time', params.startTime)
    .not('status', 'in', '("cancelled","no_show")');

  if (params.excludeId) {
    query = query.neq('id', params.excludeId);
  }

  const { count, error } = await query;
  if (error) {
    throw normalizeSupabaseError(error, PATH);
  }
  return (count ?? 0) > 0;
}

async function validateReservationReferences(
  supabase: SupabaseServerClient,
  params: {
    clinicId: string;
    customerId: string;
    menuId: string;
    staffId: string;
  }
): Promise<string | null> {
  const [customerResult, menuResult, resourceResult] = await Promise.all([
    supabase
      .from('customers')
      .select('id')
      .eq('clinic_id', params.clinicId)
      .eq('id', params.customerId)
      .eq('is_deleted', false)
      .maybeSingle(),
    supabase
      .from('menus')
      .select('id')
      .eq('clinic_id', params.clinicId)
      .eq('id', params.menuId)
      .eq('is_deleted', false)
      .maybeSingle(),
    supabase
      .from('resources')
      .select('id')
      .eq('clinic_id', params.clinicId)
      .eq('id', params.staffId)
      .maybeSingle(),
  ]);

  if (customerResult.error) {
    throw normalizeSupabaseError(customerResult.error, PATH);
  }
  if (menuResult.error) {
    throw normalizeSupabaseError(menuResult.error, PATH);
  }
  if (resourceResult.error) {
    throw normalizeSupabaseError(resourceResult.error, PATH);
  }

  if (!customerResult.data) {
    return '選択した顧客データが見つかりません';
  }
  if (!menuResult.data) {
    return '選択したメニューが見つかりません。メニュー管理で有効なメニューを登録してください';
  }
  if (!resourceResult.data) {
    return '選択した施術者リソースが見つかりません';
  }

  return null;
}

async function ensureReservationStaffResource(
  supabase: SupabaseServerClient,
  params: {
    clinicId: string;
    staffId: string;
    createdBy: string;
  }
) {
  const { data: resource, error: resourceError } = await supabase
    .from('resources')
    .select('id')
    .eq('clinic_id', params.clinicId)
    .eq('id', params.staffId)
    .maybeSingle();

  if (resourceError) {
    throw normalizeSupabaseError(resourceError, PATH);
  }
  if (resource) return { ok: true as const };

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
        ok: false as const,
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

    const { error: permissionUpsertError } = await supabase
      .from('resources')
      .upsert(
        buildStaffResourceFromPermissionCandidate(
          permission,
          profile,
          params.clinicId,
          params.createdBy
        ),
        { onConflict: 'id' }
      );

    if (permissionUpsertError) {
      throw normalizeSupabaseError(permissionUpsertError, PATH);
    }

    return { ok: true as const };
  }

  const { error: upsertError } = await supabase
    .from('resources')
    .upsert(
      buildStaffResourceFromCandidate(staff, params.clinicId, params.createdBy),
      { onConflict: 'id' }
    );

  if (upsertError) {
    throw normalizeSupabaseError(upsertError, PATH);
  }

  return { ok: true as const };
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

    const supabase = createScopedReservationClient(auth.permissions, clinic_id);

    const query = supabase
      .from('reservation_list_view')
      .select('*')
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
      reservationInsertSchema
    );
    if (!result.success) return result.error;

    const dto = result.dto;
    const reservationMutationClient = createScopedReservationClient(
      result.permissions,
      dto.clinic_id
    );
    const staffResource = await ensureReservationStaffResource(
      reservationMutationClient,
      {
        clinicId: dto.clinic_id,
        staffId: dto.staffId,
        createdBy: result.auth.id,
      }
    );
    if (!staffResource.ok) {
      return createErrorResponse(staffResource.error, 400);
    }

    const referenceError = await validateReservationReferences(
      reservationMutationClient,
      {
        clinicId: dto.clinic_id,
        customerId: dto.customerId,
        menuId: dto.menuId,
        staffId: dto.staffId,
      }
    );
    if (referenceError) {
      return createErrorResponse(referenceError, 400);
    }

    const conflict = await hasReservationConflict(reservationMutationClient, {
      clinicId: dto.clinic_id,
      staffId: dto.staffId,
      startTime: dto.startTime,
      endTime: dto.endTime,
    });
    if (conflict) {
      return createErrorResponse('同時間帯に既存予約があります', 409);
    }

    const insertPayload = mapReservationInsertToRow(dto, result.auth.id);

    const { data, error } = await reservationMutationClient
      .from('reservations')
      .insert(insertPayload)
      .select()
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
      .select('*')
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
      { allowedRoles: Array.from(STAFF_ROLES) }
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
          'id, clinic_id, customer_id, menu_id, status, staff_id, start_time, end_time, notes'
        )
        .eq('id', dto.id)
        .eq('clinic_id', dto.clinic_id)
        .single();

    if (existingError) {
      throw normalizeSupabaseError(existingError, PATH);
    }

    if (dto.staffId || dto.startTime || dto.endTime) {
      const nextStaffId = dto.staffId ?? existing.staff_id;
      const nextStartTime = dto.startTime ?? existing.start_time;
      const nextEndTime = dto.endTime ?? existing.end_time;

      if (dto.staffId) {
        const staffResource = await ensureReservationStaffResource(
          reservationMutationClient,
          {
            clinicId: dto.clinic_id,
            staffId: dto.staffId,
            createdBy: result.auth.id,
          }
        );
        if (!staffResource.ok) {
          return createErrorResponse(staffResource.error, 400);
        }
      }

      const conflict = await hasReservationConflict(reservationMutationClient, {
        clinicId: dto.clinic_id,
        staffId: nextStaffId,
        startTime: nextStartTime,
        endTime: nextEndTime,
        excludeId: dto.id,
      });
      if (conflict) {
        return createErrorResponse('同時間帯に既存予約があります', 409);
      }
    }

    const updatePayload = mapReservationUpdateToRow(dto);

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
