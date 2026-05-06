import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  processApiRequest,
} from '@/lib/api-helpers';
import { normalizeSupabaseError } from '@/lib/error-handler';
import { handleRouteError, processClinicScopedBody } from '@/lib/route-helpers';
import {
  createScopedAdminContext,
  type SupabaseServerClient,
} from '@/lib/supabase';
import { CLINIC_ADMIN_ROLES, STAFF_ROLES } from '@/lib/constants/roles';
import type { Database } from '@/types/supabase';

const PATH = '/api/daily-reports/items';
const ITEM_SELECT =
  'id, clinic_id, daily_report_id, report_date, reservation_id, customer_id, menu_id, staff_resource_id, patient_name, treatment_name, duration_minutes, fee, billing_type, payment_method_id, next_reservation_start_time, next_reservation_end_time, next_reservation_id, source, notes, created_at, updated_at, created_by, updated_by';
const PAYMENT_METHOD_SELECT = 'id, name, is_active';

type DailyReportItemRow =
  Database['public']['Tables']['daily_report_items']['Row'];
type DailyReportItemInsert =
  Database['public']['Tables']['daily_report_items']['Insert'];
type DailyReportItemUpdate =
  Database['public']['Tables']['daily_report_items']['Update'];
type DailyReportInsert =
  Database['public']['Tables']['daily_reports']['Insert'];
type PaymentMethodRow = Pick<
  Database['public']['Tables']['master_payment_methods']['Row'],
  'id' | 'name' | 'is_active'
>;
type ReservationInsert = Database['public']['Tables']['reservations']['Insert'];
type ReservationUpdate = Database['public']['Tables']['reservations']['Update'];
type BillingType = 'insurance' | 'private';
type DailyReportItemApi = {
  id: string;
  clinicId: string;
  dailyReportId: string;
  reportDate: string;
  reservationId: string | null;
  customerId: string | null;
  menuId: string | null;
  staffResourceId: string | null;
  patientName: string;
  treatmentName: string;
  durationMinutes: number;
  fee: number;
  billingType: BillingType;
  paymentMethodId: string | null;
  nextReservationStartTime: string | null;
  nextReservationEndTime: string | null;
  nextReservationId: string | null;
  source: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

const billingTypeSchema = z.enum(['insurance', 'private']);
const isoDateSchema = z
  .string()
  .regex(/\d{4}-\d{2}-\d{2}/, 'report_dateはYYYY-MM-DD形式で指定してください');
const nullableUuidSchema = z.string().uuid().nullable().optional();
const nextReservationStartSchema = z
  .string()
  .datetime({ offset: true })
  .nullable()
  .optional();

const itemsQuerySchema = z.object({
  clinic_id: z.string().uuid('clinic_id はUUID形式で指定してください'),
  report_date: isoDateSchema,
});

const itemCreateSchema = z
  .object({
    clinic_id: z.string().uuid(),
    report_date: isoDateSchema,
    reservationId: nullableUuidSchema,
    customerId: nullableUuidSchema,
    menuId: nullableUuidSchema,
    staffResourceId: nullableUuidSchema,
    patientName: z.string().trim().min(1).max(255),
    treatmentName: z.string().trim().min(1).max(255),
    durationMinutes: z.number().int().min(0).default(0),
    fee: z.number().min(0).default(0),
    billingType: billingTypeSchema.default('private'),
    paymentMethodId: nullableUuidSchema,
    nextReservationStartTime: nextReservationStartSchema,
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict();

const itemUpdateSchema = z
  .object({
    clinic_id: z.string().uuid(),
    id: z.string().uuid(),
    patientName: z.string().trim().min(1).max(255).optional(),
    treatmentName: z.string().trim().min(1).max(255).optional(),
    durationMinutes: z.number().int().min(0).optional(),
    fee: z.number().min(0).optional(),
    billingType: billingTypeSchema.optional(),
    paymentMethodId: nullableUuidSchema,
    nextReservationStartTime: nextReservationStartSchema,
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict();

const itemDeleteQuerySchema = z.object({
  clinic_id: z.string().uuid('clinic_id はUUID形式で指定してください'),
  id: z.string().uuid('id はUUID形式で指定してください'),
});

function createScopedDailyReportClient(
  permissions: Parameters<typeof createScopedAdminContext>[0],
  clinicId: string
) {
  const scopedAdmin = createScopedAdminContext(permissions);
  scopedAdmin.assertClinicInScope(clinicId);
  return scopedAdmin.client;
}

function normalizeBillingType(value: string): BillingType {
  return value === 'insurance' ? 'insurance' : 'private';
}

function mapDailyReportItem(row: DailyReportItemRow): DailyReportItemApi {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    dailyReportId: row.daily_report_id,
    reportDate: row.report_date,
    reservationId: row.reservation_id,
    customerId: row.customer_id,
    menuId: row.menu_id,
    staffResourceId: row.staff_resource_id,
    patientName: row.patient_name,
    treatmentName: row.treatment_name,
    durationMinutes: row.duration_minutes,
    fee: Number(row.fee),
    billingType: normalizeBillingType(row.billing_type),
    paymentMethodId: row.payment_method_id,
    nextReservationStartTime: row.next_reservation_start_time,
    nextReservationEndTime: row.next_reservation_end_time,
    nextReservationId: row.next_reservation_id,
    source: row.source,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPaymentMethod(row: PaymentMethodRow) {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active ?? true,
  };
}

function getConstraintErrorMessage(error: { code?: string; message?: string }) {
  const message = error.message ?? '';

  if (error.code === '23505') {
    if (message.includes('daily_report_items_clinic_reservation_unique')) {
      return 'この予約の日報明細は既に登録されています';
    }
    return '日報明細が重複しています';
  }

  if (error.code === '23503') {
    if (message.includes('daily_report_items_payment_method_id_fkey')) {
      return '選択した決済方法が見つかりません';
    }
    if (message.includes('daily_report_items_next_reservation_id_fkey')) {
      return '次回予約の作成に失敗しました';
    }
    return '日報明細に紐づくデータが見つかりません';
  }

  if (error.code === '23514') {
    return '日報明細に紐づくデータが現在の院に属していません';
  }

  return null;
}

async function ensureDailyReport(
  supabase: SupabaseServerClient,
  params: {
    clinicId: string;
    reportDate: string;
  }
): Promise<string> {
  const { data: existing, error: existingError } = await supabase
    .from('daily_reports')
    .select('id')
    .eq('clinic_id', params.clinicId)
    .eq('report_date', params.reportDate)
    .maybeSingle();

  if (existingError) {
    throw normalizeSupabaseError(existingError, PATH);
  }
  if (existing) {
    return existing.id;
  }

  const insertPayload: DailyReportInsert = {
    clinic_id: params.clinicId,
    report_date: params.reportDate,
    total_patients: 0,
    new_patients: 0,
    total_revenue: 0,
    insurance_revenue: 0,
    private_revenue: 0,
    report_text: '明細行から自動作成',
  };

  const { data, error } = await supabase
    .from('daily_reports')
    .insert(insertPayload)
    .select('id')
    .single();

  if (!error && data) {
    return data.id;
  }

  if (error?.code === '23505') {
    const { data: raced, error: racedError } = await supabase
      .from('daily_reports')
      .select('id')
      .eq('clinic_id', params.clinicId)
      .eq('report_date', params.reportDate)
      .single();

    if (racedError) {
      throw normalizeSupabaseError(racedError, PATH);
    }
    return raced.id;
  }

  throw normalizeSupabaseError(error, PATH);
}

async function validatePaymentMethod(
  supabase: SupabaseServerClient,
  paymentMethodId: string | null | undefined
): Promise<string | null> {
  if (!paymentMethodId) {
    return null;
  }

  const { data, error } = await supabase
    .from('master_payment_methods')
    .select('id')
    .eq('id', paymentMethodId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw normalizeSupabaseError(error, PATH);
  }

  return data ? null : '選択した決済方法が見つかりません';
}

async function fetchItem(
  supabase: SupabaseServerClient,
  params: {
    clinicId: string;
    id: string;
  }
) {
  const { data, error } = await supabase
    .from('daily_report_items')
    .select(ITEM_SELECT)
    .eq('clinic_id', params.clinicId)
    .eq('id', params.id)
    .maybeSingle();

  if (error) {
    throw normalizeSupabaseError(error, PATH);
  }

  return data;
}

function buildReservationWindow(
  startIso: string,
  durationMinutes: number
): { startTime: string; endTime: string } | null {
  if (durationMinutes <= 0) {
    return null;
  }

  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) {
    return null;
  }

  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
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

type NextReservationRefs = {
  customerId: string;
  menuId: string;
  staffResourceId: string;
};

function resolveNextReservationRefs(
  row: Pick<DailyReportItemRow, 'customer_id' | 'menu_id' | 'staff_resource_id'>
): NextReservationRefs | null {
  if (!row.customer_id || !row.menu_id || !row.staff_resource_id) {
    return null;
  }

  return {
    customerId: row.customer_id,
    menuId: row.menu_id,
    staffResourceId: row.staff_resource_id,
  };
}

async function createNextReservation(
  supabase: SupabaseServerClient,
  params: {
    clinicId: string;
    refs: NextReservationRefs;
    window: { startTime: string; endTime: string };
    userId: string;
  }
): Promise<string | null> {
  const conflict = await hasReservationConflict(supabase, {
    clinicId: params.clinicId,
    staffId: params.refs.staffResourceId,
    startTime: params.window.startTime,
    endTime: params.window.endTime,
  });

  if (conflict) {
    return null;
  }

  const insertPayload: ReservationInsert = {
    clinic_id: params.clinicId,
    customer_id: params.refs.customerId,
    menu_id: params.refs.menuId,
    staff_id: params.refs.staffResourceId,
    start_time: params.window.startTime,
    end_time: params.window.endTime,
    status: 'unconfirmed',
    channel: 'walk_in',
    notes: '日報明細から作成された次回予約',
    selected_options: [],
    created_by: params.userId,
  };

  const { data, error } = await supabase
    .from('reservations')
    .insert(insertPayload)
    .select('id')
    .single();

  if (error) {
    throw normalizeSupabaseError(error, PATH);
  }

  return data.id;
}

type NextReservationSyncResult =
  | { ok: true; patch: DailyReportItemUpdate }
  | { ok: false; status: number; message: string };

async function syncNextReservationForUpdate(
  supabase: SupabaseServerClient,
  params: {
    clinicId: string;
    item: DailyReportItemRow;
    nextReservationStartTime: string | null | undefined;
    durationMinutes: number;
    durationChanged: boolean;
    userId: string;
  }
): Promise<NextReservationSyncResult> {
  const nextStartProvided = params.nextReservationStartTime !== undefined;
  const shouldResyncExisting =
    !nextStartProvided &&
    params.durationChanged &&
    params.item.next_reservation_start_time !== null;

  if (!nextStartProvided && !shouldResyncExisting) {
    return { ok: true, patch: {} };
  }

  if (params.nextReservationStartTime === null) {
    if (params.item.next_reservation_id) {
      const cancelPayload: ReservationUpdate = {
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('reservations')
        .update(cancelPayload)
        .eq('clinic_id', params.clinicId)
        .eq('id', params.item.next_reservation_id);

      if (error) {
        throw normalizeSupabaseError(error, PATH);
      }
    }

    return {
      ok: true,
      patch: {
        next_reservation_start_time: null,
        next_reservation_end_time: null,
        next_reservation_id: null,
      },
    };
  }

  const startIso =
    params.nextReservationStartTime ?? params.item.next_reservation_start_time;
  if (!startIso) {
    return { ok: true, patch: {} };
  }

  const refs = resolveNextReservationRefs(params.item);
  if (!refs) {
    return {
      ok: false,
      status: 400,
      message:
        '次回予約を作成するには患者・メニュー・担当スタッフの紐づきが必要です',
    };
  }

  const window = buildReservationWindow(startIso, params.durationMinutes);
  if (!window) {
    return {
      ok: false,
      status: 400,
      message: '次回予約を作成するには施術時間を1分以上で入力してください',
    };
  }

  const conflict = await hasReservationConflict(supabase, {
    clinicId: params.clinicId,
    staffId: refs.staffResourceId,
    startTime: window.startTime,
    endTime: window.endTime,
    excludeId: params.item.next_reservation_id ?? undefined,
  });

  if (conflict) {
    return {
      ok: false,
      status: 409,
      message: '次回予約の時間帯に既存予約があります',
    };
  }

  if (params.item.next_reservation_id) {
    const updatePayload: ReservationUpdate = {
      start_time: window.startTime,
      end_time: window.endTime,
      status: 'unconfirmed',
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('reservations')
      .update(updatePayload)
      .eq('clinic_id', params.clinicId)
      .eq('id', params.item.next_reservation_id)
      .select('id')
      .single();

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    return {
      ok: true,
      patch: {
        next_reservation_start_time: window.startTime,
        next_reservation_end_time: window.endTime,
        next_reservation_id: data.id,
      },
    };
  }

  const nextReservationId = await createNextReservation(supabase, {
    clinicId: params.clinicId,
    refs,
    window,
    userId: params.userId,
  });

  if (!nextReservationId) {
    return {
      ok: false,
      status: 409,
      message: '次回予約の時間帯に既存予約があります',
    };
  }

  return {
    ok: true,
    patch: {
      next_reservation_start_time: window.startTime,
      next_reservation_end_time: window.endTime,
      next_reservation_id: nextReservationId,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = itemsQuerySchema.safeParse({
      clinic_id: request.nextUrl.searchParams.get('clinic_id'),
      report_date: request.nextUrl.searchParams.get('report_date'),
    });

    if (!parsedQuery.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedQuery.error.flatten()
      );
    }

    const { clinic_id, report_date } = parsedQuery.data;
    const auth = await processApiRequest(request, {
      clinicId: clinic_id,
      requireClinicMatch: true,
    });
    if (!auth.success) return auth.error;

    const supabase = createScopedDailyReportClient(auth.permissions, clinic_id);

    const [itemsResult, paymentMethodsResult] = await Promise.all([
      supabase
        .from('daily_report_items')
        .select(ITEM_SELECT)
        .eq('clinic_id', clinic_id)
        .eq('report_date', report_date)
        .order('created_at', { ascending: true }),
      supabase
        .from('master_payment_methods')
        .select(PAYMENT_METHOD_SELECT)
        .eq('is_active', true)
        .order('name', { ascending: true }),
    ]);

    if (itemsResult.error) {
      throw normalizeSupabaseError(itemsResult.error, PATH);
    }
    if (paymentMethodsResult.error) {
      throw normalizeSupabaseError(paymentMethodsResult.error, PATH);
    }

    return createSuccessResponse({
      items: (itemsResult.data ?? []).map(mapDailyReportItem),
      paymentMethods: (paymentMethodsResult.data ?? []).map(mapPaymentMethod),
    });
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await processClinicScopedBody(request, itemCreateSchema, {
      allowedRoles: Array.from(STAFF_ROLES),
    });
    if (!result.success) return result.error;

    const dto = result.dto;
    const supabase = createScopedDailyReportClient(
      result.permissions,
      dto.clinic_id
    );

    const paymentError = await validatePaymentMethod(
      supabase,
      dto.paymentMethodId
    );
    if (paymentError) {
      return createErrorResponse(paymentError, 400);
    }

    const dailyReportId = await ensureDailyReport(supabase, {
      clinicId: dto.clinic_id,
      reportDate: dto.report_date,
    });

    const insertPayload: DailyReportItemInsert = {
      clinic_id: dto.clinic_id,
      daily_report_id: dailyReportId,
      report_date: dto.report_date,
      reservation_id: dto.reservationId ?? null,
      customer_id: dto.customerId ?? null,
      menu_id: dto.menuId ?? null,
      staff_resource_id: dto.staffResourceId ?? null,
      patient_name: dto.patientName,
      treatment_name: dto.treatmentName,
      duration_minutes: dto.durationMinutes,
      fee: dto.fee,
      billing_type: dto.billingType,
      payment_method_id: dto.paymentMethodId ?? null,
      source: dto.reservationId ? 'reservation' : 'manual',
      notes: dto.notes ?? null,
      created_by: result.auth.id,
      updated_by: result.auth.id,
    };

    if (dto.nextReservationStartTime) {
      const refs = resolveNextReservationRefs({
        customer_id: insertPayload.customer_id ?? null,
        menu_id: insertPayload.menu_id ?? null,
        staff_resource_id: insertPayload.staff_resource_id ?? null,
      });
      if (!refs) {
        return createErrorResponse(
          '次回予約を作成するには患者・メニュー・担当スタッフの紐づきが必要です',
          400
        );
      }

      const window = buildReservationWindow(
        dto.nextReservationStartTime,
        dto.durationMinutes
      );
      if (!window) {
        return createErrorResponse(
          '次回予約を作成するには施術時間を1分以上で入力してください',
          400
        );
      }

      const nextReservationId = await createNextReservation(supabase, {
        clinicId: dto.clinic_id,
        refs,
        window,
        userId: result.auth.id,
      });

      if (!nextReservationId) {
        return createErrorResponse('次回予約の時間帯に既存予約があります', 409);
      }

      insertPayload.next_reservation_start_time = window.startTime;
      insertPayload.next_reservation_end_time = window.endTime;
      insertPayload.next_reservation_id = nextReservationId;
    }

    const { data, error } = await supabase
      .from('daily_report_items')
      .insert(insertPayload)
      .select(ITEM_SELECT)
      .single();

    if (error) {
      const message = getConstraintErrorMessage(error);
      if (message) {
        return createErrorResponse(message, 400);
      }
      throw normalizeSupabaseError(error, PATH);
    }

    return createSuccessResponse(mapDailyReportItem(data), 201);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const result = await processClinicScopedBody(request, itemUpdateSchema, {
      allowedRoles: Array.from(STAFF_ROLES),
    });
    if (!result.success) return result.error;

    const dto = result.dto;
    const supabase = createScopedDailyReportClient(
      result.permissions,
      dto.clinic_id
    );

    const existing = await fetchItem(supabase, {
      clinicId: dto.clinic_id,
      id: dto.id,
    });
    if (!existing) {
      return createErrorResponse('日報明細が見つかりません', 404);
    }

    const paymentError = await validatePaymentMethod(
      supabase,
      dto.paymentMethodId
    );
    if (paymentError) {
      return createErrorResponse(paymentError, 400);
    }

    const nextSync = await syncNextReservationForUpdate(supabase, {
      clinicId: dto.clinic_id,
      item: existing,
      nextReservationStartTime: dto.nextReservationStartTime,
      durationMinutes: dto.durationMinutes ?? existing.duration_minutes,
      durationChanged: dto.durationMinutes !== undefined,
      userId: result.auth.id,
    });
    if (nextSync.ok === false) {
      return createErrorResponse(nextSync.message, nextSync.status);
    }

    const updatePayload: DailyReportItemUpdate = {
      ...nextSync.patch,
      updated_by: result.auth.id,
    };

    if (dto.patientName !== undefined) {
      updatePayload.patient_name = dto.patientName;
    }
    if (dto.treatmentName !== undefined) {
      updatePayload.treatment_name = dto.treatmentName;
    }
    if (dto.durationMinutes !== undefined) {
      updatePayload.duration_minutes = dto.durationMinutes;
    }
    if (dto.fee !== undefined) {
      updatePayload.fee = dto.fee;
    }
    if (dto.billingType !== undefined) {
      updatePayload.billing_type = dto.billingType;
    }
    if (dto.paymentMethodId !== undefined) {
      updatePayload.payment_method_id = dto.paymentMethodId;
    }
    if (dto.notes !== undefined) {
      updatePayload.notes = dto.notes;
    }

    const { data, error } = await supabase
      .from('daily_report_items')
      .update(updatePayload)
      .eq('clinic_id', dto.clinic_id)
      .eq('id', dto.id)
      .select(ITEM_SELECT)
      .single();

    if (error) {
      const message = getConstraintErrorMessage(error);
      if (message) {
        return createErrorResponse(message, 400);
      }
      throw normalizeSupabaseError(error, PATH);
    }

    return createSuccessResponse(mapDailyReportItem(data));
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const parsedQuery = itemDeleteQuerySchema.safeParse({
      clinic_id: request.nextUrl.searchParams.get('clinic_id'),
      id: request.nextUrl.searchParams.get('id'),
    });

    if (!parsedQuery.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedQuery.error.flatten()
      );
    }

    const { clinic_id, id } = parsedQuery.data;
    const auth = await processApiRequest(request, {
      clinicId: clinic_id,
      requireClinicMatch: true,
      allowedRoles: Array.from(CLINIC_ADMIN_ROLES),
    });
    if (!auth.success) return auth.error;

    const supabase = createScopedDailyReportClient(auth.permissions, clinic_id);
    const existing = await fetchItem(supabase, { clinicId: clinic_id, id });
    if (!existing) {
      return createErrorResponse('日報明細が見つかりません', 404);
    }

    if (existing.next_reservation_id) {
      const cancelPayload: ReservationUpdate = {
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      };
      const { error: cancelError } = await supabase
        .from('reservations')
        .update(cancelPayload)
        .eq('clinic_id', clinic_id)
        .eq('id', existing.next_reservation_id);

      if (cancelError) {
        throw normalizeSupabaseError(cancelError, PATH);
      }
    }

    const { error } = await supabase
      .from('daily_report_items')
      .delete()
      .eq('clinic_id', clinic_id)
      .eq('id', id);

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    return createSuccessResponse({ deleted: true });
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
