import { determineNotificationType } from './policy';
import { enqueueEmail } from './enqueue-email';
import type { EmailTemplateType, ReservationSnapshot } from './types';
import { logger } from '@/lib/logger';

type ReservationWithUpdatedAt = {
  id: string;
  clinic_id: string;
  customer_id: string;
  status: string;
  start_time: string;
  end_time: string;
  staff_id: string;
  menu_id?: string | null;
  updated_at: string;
};

type CustomerLookupResult = {
  customer: { email: string | null; name: string | null } | null;
  errorMessage: string | null;
};

type ReservationContext = {
  clinicName: string;
  staffName: string;
  menuName: string;
};

type ContextLookupResult = {
  context: ReservationContext;
  errorMessage: string | null;
};

async function insertEnqueueLookupFailureLog(
  supabase: any,
  input: {
    clinicId: string;
    reservationId: string;
    customerId: string;
    templateType: EmailTemplateType;
    stage: 'customer' | 'context';
    errorMessage: string;
    staffId: string;
    menuId?: string | null;
  }
): Promise<void> {
  try {
    const { error } = await supabase.from('email_logs').insert({
      clinic_id: input.clinicId,
      outbox_id: null,
      event_type: 'enqueue_lookup_failed',
      provider: 'resend',
      detail: {
        template_type: input.templateType,
        reservation_id: input.reservationId,
        customer_id: input.customerId,
        staff_id: input.staffId,
        menu_id: input.menuId ?? null,
        stage: input.stage,
        error: input.errorMessage,
      },
    });

    if (error) {
      logger.error('Failed to persist enqueue lookup failure log', {
        clinicId: input.clinicId,
        reservationId: input.reservationId,
        stage: input.stage,
        error: error.message,
      });
    }
  } catch (error) {
    logger.error('Failed to persist enqueue lookup failure log', {
      clinicId: input.clinicId,
      reservationId: input.reservationId,
      stage: input.stage,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 予約作成後に reservation_created をエンキューする。
 * 顧客のメールアドレスがない場合はスキップする。
 */
export async function enqueueReservationCreated(
  supabase: any,
  reservation: ReservationWithUpdatedAt
): Promise<void> {
  try {
    const [customerLookup, contextLookup] = await Promise.all([
      fetchCustomerEmail(
        supabase,
        reservation.clinic_id,
        reservation.customer_id
      ),
      fetchReservationContext(supabase, reservation),
    ]);

    if (customerLookup.errorMessage) {
      await insertEnqueueLookupFailureLog(supabase, {
        clinicId: reservation.clinic_id,
        reservationId: reservation.id,
        customerId: reservation.customer_id,
        templateType: 'reservation_created',
        stage: 'customer',
        errorMessage: customerLookup.errorMessage,
        staffId: reservation.staff_id,
        menuId: reservation.menu_id,
      });
      return;
    }

    if (contextLookup.errorMessage) {
      await insertEnqueueLookupFailureLog(supabase, {
        clinicId: reservation.clinic_id,
        reservationId: reservation.id,
        customerId: reservation.customer_id,
        templateType: 'reservation_created',
        stage: 'context',
        errorMessage: contextLookup.errorMessage,
        staffId: reservation.staff_id,
        menuId: reservation.menu_id,
      });
      return;
    }

    const customer = customerLookup.customer;
    if (!customer?.email) return;

    await enqueueEmail(
      supabase,
      {
        clinicId: reservation.clinic_id,
        reservationId: reservation.id,
        customerId: reservation.customer_id,
        templateType: 'reservation_created',
        toEmail: customer.email,
        payload: {
          customerName: customer.name ?? '',
          clinicName: contextLookup.context.clinicName,
          startTime: reservation.start_time,
          endTime: reservation.end_time,
          staffName: contextLookup.context.staffName,
          menuName: contextLookup.context.menuName,
        },
      },
      reservation.updated_at
    );
  } catch (err) {
    // enqueue 失敗は予約操作をブロックしない
    logger.error('Failed to enqueue reservation_created email', err);
  }
}

/**
 * 予約変更後に差分を検知して適切な通知をエンキューする。
 * - cancelled → reservation_cancelled
 * - start_time/end_time/staff_id/status 変更 → reservation_updated
 * - notes のみ → スキップ
 */
export async function enqueueReservationChange(
  supabase: any,
  before: ReservationSnapshot,
  after: ReservationSnapshot,
  updatedAt: string
): Promise<void> {
  try {
    const templateType = determineNotificationType({ before, after });
    if (!templateType) return;

    const [customerLookup, contextLookup] = await Promise.all([
      fetchCustomerEmail(supabase, after.clinic_id, after.customer_id),
      fetchReservationContext(supabase, after),
    ]);

    if (customerLookup.errorMessage) {
      await insertEnqueueLookupFailureLog(supabase, {
        clinicId: after.clinic_id,
        reservationId: after.id,
        customerId: after.customer_id,
        templateType,
        stage: 'customer',
        errorMessage: customerLookup.errorMessage,
        staffId: after.staff_id,
        menuId: after.menu_id,
      });
      return;
    }

    if (contextLookup.errorMessage) {
      await insertEnqueueLookupFailureLog(supabase, {
        clinicId: after.clinic_id,
        reservationId: after.id,
        customerId: after.customer_id,
        templateType,
        stage: 'context',
        errorMessage: contextLookup.errorMessage,
        staffId: after.staff_id,
        menuId: after.menu_id,
      });
      return;
    }

    const customer = customerLookup.customer;
    if (!customer?.email) return;

    await enqueueEmail(
      supabase,
      {
        clinicId: after.clinic_id,
        reservationId: after.id,
        customerId: after.customer_id,
        templateType,
        toEmail: customer.email,
        payload: {
          customerName: customer.name ?? '',
          clinicName: contextLookup.context.clinicName,
          startTime: after.start_time,
          endTime: after.end_time,
          staffName: contextLookup.context.staffName,
          menuName: contextLookup.context.menuName,
        },
      },
      updatedAt,
      { ignoreDuplicate: true }
    );
  } catch (err) {
    logger.error('Failed to enqueue reservation change email', err);
  }
}

async function fetchCustomerEmail(
  supabase: any,
  clinicId: string,
  customerId: string
): Promise<CustomerLookupResult> {
  const { data, error } = await supabase
    .from('customers')
    .select('id, email, name')
    .eq('id', customerId)
    .eq('clinic_id', clinicId)
    .maybeSingle();

  if (error) {
    return {
      customer: null,
      errorMessage: `customers lookup failed: ${error.message}`,
    };
  }

  if (!data) {
    return { customer: null, errorMessage: null };
  }

  return {
    customer: { email: data.email, name: data.name },
    errorMessage: null,
  };
}

async function fetchReservationContext(
  supabase: any,
  reservation: { clinic_id: string; staff_id: string; menu_id?: string | null }
): Promise<ContextLookupResult> {
  const context: ReservationContext = {
    clinicName: '',
    staffName: '',
    menuName: '',
  };

  const [clinicRes, staffRes, menuRes] = await Promise.all([
    supabase
      .from('clinics')
      .select('name')
      .eq('id', reservation.clinic_id)
      .maybeSingle(),
    supabase
      .from('staff')
      .select('name')
      .eq('id', reservation.staff_id)
      .eq('clinic_id', reservation.clinic_id)
      .maybeSingle(),
    reservation.menu_id
      ? supabase
          .from('menus')
          .select('name')
          .eq('id', reservation.menu_id)
          .eq('clinic_id', reservation.clinic_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const lookupErrors = [
    clinicRes.error
      ? `clinics lookup failed: ${clinicRes.error.message}`
      : null,
    staffRes.error ? `staff lookup failed: ${staffRes.error.message}` : null,
    menuRes.error ? `menus lookup failed: ${menuRes.error.message}` : null,
  ].filter(Boolean);

  if (lookupErrors.length > 0) {
    return {
      context,
      errorMessage: lookupErrors.join(' | '),
    };
  }

  if (clinicRes.data?.name) context.clinicName = clinicRes.data.name;
  if (staffRes.data?.name) context.staffName = staffRes.data.name;
  if (menuRes.data?.name) context.menuName = menuRes.data.name;

  return { context, errorMessage: null };
}
