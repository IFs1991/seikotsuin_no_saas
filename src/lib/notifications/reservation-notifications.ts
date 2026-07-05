import { enqueueEmail } from '@/lib/notifications/email/enqueue-email';
import type {
  EmailTemplateType,
  PublicReservationReceivedPayload,
  ReservationEmailPayload,
} from '@/lib/notifications/email/types';
import { logger } from '@/lib/logger';
import type { SupabaseServerClient } from '@/lib/supabase';
import type { Database, Json } from '@/types/supabase';

export type ReservationNotificationType =
  | 'received'
  | 'confirmed'
  | 'cancelled'
  | 'reminder_day_before'
  | 'reminder_same_day';

export type ReservationNotificationChannel = 'email' | 'line' | 'none';

type ReservationNotificationStatus =
  | 'claimed'
  | 'enqueued'
  | 'skipped'
  | 'failed';

type ReservationNotificationInsert =
  Database['public']['Tables']['reservation_notifications']['Insert'];
type ReservationNotificationUpdate =
  Database['public']['Tables']['reservation_notifications']['Update'];

type NotificationSupabaseClient = Pick<SupabaseServerClient, 'from'>;

type ClaimParams = {
  clinicId: string;
  reservationId: string;
  notificationType: ReservationNotificationType;
  channel: ReservationNotificationChannel;
  status?: ReservationNotificationStatus;
  scheduledFor?: string | null;
  detail?: Json;
};

type ClaimResult =
  | {
      claimed: true;
      id: string;
    }
  | {
      claimed: false;
      id: null;
    };

export type PatientReservationEmailInput = {
  clinicId: string;
  reservationId: string;
  customerId: string;
  toEmail: string | null;
  notificationType: ReservationNotificationType;
  templateType: EmailTemplateType;
  payload: ReservationEmailPayload;
  dedupeTimestamp: string;
  scheduledFor?: string | null;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function claimReservationNotification(
  supabase: NotificationSupabaseClient,
  params: ClaimParams
): Promise<ClaimResult> {
  const insert: ReservationNotificationInsert = {
    clinic_id: params.clinicId,
    reservation_id: params.reservationId,
    notification_type: params.notificationType,
    channel: params.channel,
    status: params.status ?? 'claimed',
    scheduled_for: params.scheduledFor ?? null,
    detail: params.detail ?? {},
  };

  const { data, error } = await supabase
    .from('reservation_notifications')
    .upsert(insert, {
      onConflict: 'reservation_id,notification_type',
      ignoreDuplicates: true,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    if (isUniqueViolation(error)) {
      return { claimed: false, id: null };
    }
    throw new Error(error.message);
  }

  if (!data) {
    return { claimed: false, id: null };
  }

  return { claimed: true, id: data.id };
}

async function updateReservationNotification(
  supabase: NotificationSupabaseClient,
  id: string,
  update: ReservationNotificationUpdate
): Promise<void> {
  const { error } = await supabase
    .from('reservation_notifications')
    .update(update)
    .eq('id', id);

  if (error) {
    logger.warn('Failed to update reservation notification log', {
      notificationId: id,
      error: error.message,
    });
  }
}

export async function enqueuePatientReservationEmail(
  supabase: NotificationSupabaseClient,
  input: PatientReservationEmailInput
): Promise<'enqueued' | 'skipped' | 'duplicate'> {
  if (!input.toEmail) {
    const claim = await claimReservationNotification(supabase, {
      clinicId: input.clinicId,
      reservationId: input.reservationId,
      notificationType: input.notificationType,
      channel: 'none',
      status: 'skipped',
      scheduledFor: input.scheduledFor,
      detail: { reason: 'no_email_channel' },
    });
    return claim.claimed ? 'skipped' : 'duplicate';
  }

  const claim = await claimReservationNotification(supabase, {
    clinicId: input.clinicId,
    reservationId: input.reservationId,
    notificationType: input.notificationType,
    channel: 'email',
    scheduledFor: input.scheduledFor,
  });

  if (!claim.claimed) {
    return 'duplicate';
  }

  try {
    const outbox = await enqueueEmail(
      supabase,
      {
        clinicId: input.clinicId,
        reservationId: input.reservationId,
        customerId: input.customerId,
        templateType: input.templateType,
        toEmail: input.toEmail,
        payload: input.payload,
      },
      input.dedupeTimestamp,
      { ignoreDuplicate: true }
    );

    await updateReservationNotification(supabase, claim.id, {
      status: 'enqueued',
      email_outbox_id: outbox?.id ?? null,
      detail: { template_type: input.templateType },
    });
    return 'enqueued';
  } catch (error) {
    await updateReservationNotification(supabase, claim.id, {
      status: 'failed',
      detail: {
        template_type: input.templateType,
        error: getErrorMessage(error),
      },
    });
    throw error;
  }
}

export type PublicReservationNotificationInput = {
  clinicId: string;
  reservationId: string;
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  clinicName: string;
  menuName: string;
  resourceId: string;
  startTime: string;
  endTime: string;
  channel: string;
  intakeSummary: string[];
  updatedAt: string;
};

type ClinicBasicSettings = {
  email: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readClinicBasicSettings(value: unknown): ClinicBasicSettings {
  if (!isRecord(value)) {
    return { email: null };
  }

  return {
    email: typeof value.email === 'string' && value.email ? value.email : null,
  };
}

async function fetchClinicNotificationEmail(
  supabase: NotificationSupabaseClient,
  clinicId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('clinic_settings')
    .select('settings')
    .eq('clinic_id', clinicId)
    .eq('category', 'clinic_basic')
    .maybeSingle();

  if (error) {
    logger.warn('Failed to load clinic_basic email for public reservation', {
      clinicId,
      error: error.message,
    });
    return null;
  }

  const settings = readClinicBasicSettings(data?.settings);
  return settings.email;
}

async function fetchResourceName(
  supabase: NotificationSupabaseClient,
  clinicId: string,
  resourceId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('resources')
    .select('name')
    .eq('id', resourceId)
    .eq('clinic_id', clinicId)
    .maybeSingle();

  if (error) {
    logger.warn('Failed to load public reservation resource name', {
      clinicId,
      resourceId,
      error: error.message,
    });
    return '';
  }

  return typeof data?.name === 'string' ? data.name : '';
}

export async function enqueuePublicReservationNotifications(
  supabase: NotificationSupabaseClient,
  input: PublicReservationNotificationInput
): Promise<void> {
  const staffName = await fetchResourceName(
    supabase,
    input.clinicId,
    input.resourceId
  );

  const patientPayload: ReservationEmailPayload = {
    customerName: input.customerName,
    clinicName: input.clinicName,
    startTime: input.startTime,
    endTime: input.endTime,
    staffName,
    menuName: input.menuName,
  };

  await enqueuePatientReservationEmail(supabase, {
    clinicId: input.clinicId,
    reservationId: input.reservationId,
    customerId: input.customerId,
    toEmail: input.customerEmail,
    notificationType: 'received',
    templateType: 'reservation_created',
    payload: patientPayload,
    dedupeTimestamp: input.updatedAt,
  });

  const clinicEmail = await fetchClinicNotificationEmail(
    supabase,
    input.clinicId
  );
  if (!clinicEmail) {
    logger.warn('Clinic email is not configured; public reservation skipped', {
      clinicId: input.clinicId,
      reservationId: input.reservationId,
    });
    return;
  }

  const clinicPayload: PublicReservationReceivedPayload = {
    customerName: input.customerName,
    clinicName: input.clinicName,
    startTime: input.startTime,
    endTime: input.endTime,
    staffName,
    menuName: input.menuName,
    channel: input.channel,
    intakeSummary: input.intakeSummary,
  };

  await enqueueEmail(
    supabase,
    {
      clinicId: input.clinicId,
      reservationId: input.reservationId,
      customerId: input.customerId,
      templateType: 'public-reservation-received',
      toEmail: clinicEmail,
      payload: clinicPayload,
    },
    input.updatedAt,
    { ignoreDuplicate: true }
  );
}
