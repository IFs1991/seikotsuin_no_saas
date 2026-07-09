import { enqueueEmail } from '@/lib/notifications/email/enqueue-email';
import { normalizeCommunicationSettings } from '@/lib/admin-settings/normalize';
import { resolveLineBookingGate } from '@/lib/line/gate';
import {
  enqueueLineMessage,
  type LineEmailFallbackPayload,
  type LineMessagePayload,
} from '@/lib/notifications/line-outbox';
import type {
  EmailTemplateType,
  PublicReservationCancelledPayload,
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
type PublicReservationCancellationReservation = Pick<
  Database['public']['Tables']['reservations']['Row'],
  | 'id'
  | 'customer_id'
  | 'menu_id'
  | 'staff_id'
  | 'start_time'
  | 'end_time'
  | 'channel'
  | 'updated_at'
>;
type PublicReservationCancellationCustomer = Pick<
  Database['public']['Tables']['customers']['Row'],
  'id' | 'name' | 'email'
>;

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

export type PatientReservationNotificationInput =
  PatientReservationEmailInput & {
    lineUserId?: string | null;
  };

type CustomerNotificationProfile = {
  email: string | null;
  lineUserId: string | null;
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

async function shouldUseLineNotification(
  supabase: NotificationSupabaseClient,
  params: { clinicId: string; lineUserId?: string | null }
): Promise<{ enabled: true } | { enabled: false; reasons: string[] }> {
  if (!params.lineUserId) {
    return { enabled: false, reasons: ['no_line_user_id'] };
  }

  const [communicationLineEnabled, gate] = await Promise.all([
    fetchClinicCommunicationLineEnabled(supabase, params.clinicId),
    resolveLineBookingGate({ supabase, clinicId: params.clinicId }),
  ]);
  const reasons = [
    ...(communicationLineEnabled ? [] : ['communication_line_disabled']),
    ...gate.disabledReasons,
  ];

  return reasons.length === 0 ? { enabled: true } : { enabled: false, reasons };
}

export function buildPublicMyPageUrl(clinicId: string): string | undefined {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
  return baseUrl ? `${baseUrl}/booking/${clinicId}/my` : undefined;
}

function getLineNotificationHeading(
  notificationType: ReservationNotificationType
): string {
  switch (notificationType) {
    case 'received':
      return '予約を受け付けました。';
    case 'confirmed':
      return '予約が確定しました。';
    case 'cancelled':
      return '予約がキャンセルされました。';
    case 'reminder_day_before':
      return '明日のご予約のリマインドです。';
    case 'reminder_same_day':
      return '本日のご予約のリマインドです。';
  }
}

function createLineEmailFallback(
  input: PatientReservationNotificationInput
): { fallbackEmail: LineEmailFallbackPayload } | Record<string, never> {
  if (!input.toEmail) {
    return {};
  }

  return {
    fallbackEmail: {
      clinicId: input.clinicId,
      reservationId: input.reservationId,
      customerId: input.customerId,
      toEmail: input.toEmail,
      notificationType: input.notificationType,
      templateType: input.templateType,
      payload: input.payload,
      dedupeTimestamp: input.dedupeTimestamp,
    },
  };
}

function buildReservationLinePayload(
  input: PatientReservationNotificationInput
): LineMessagePayload {
  const confirmationUrl =
    input.payload.myPageUrl ?? buildPublicMyPageUrl(input.clinicId);
  const lines = [
    `${input.payload.customerName}様`,
    `${input.payload.clinicName}です。`,
    getLineNotificationHeading(input.notificationType),
    `日時: ${input.payload.startTime}`,
    `メニュー: ${input.payload.menuName}`,
    input.payload.staffName ? `担当: ${input.payload.staffName}` : null,
    confirmationUrl ? `確認URL: ${confirmationUrl}` : null,
  ].filter((line): line is string => typeof line === 'string');

  return {
    text: lines.join('\n'),
    ...(confirmationUrl ? { confirmationUrl } : {}),
    ...createLineEmailFallback(input),
  };
}

export async function enqueuePatientReservationNotification(
  supabase: NotificationSupabaseClient,
  input: PatientReservationNotificationInput
): Promise<'enqueued' | 'skipped' | 'duplicate'> {
  const lineDecision = await shouldUseLineNotification(supabase, {
    clinicId: input.clinicId,
    lineUserId: input.lineUserId,
  });
  const lineUserId = input.lineUserId;

  if (!lineDecision.enabled || !lineUserId) {
    return enqueuePatientReservationEmail(supabase, input);
  }

  const claim = await claimReservationNotification(supabase, {
    clinicId: input.clinicId,
    reservationId: input.reservationId,
    notificationType: input.notificationType,
    channel: 'line',
    scheduledFor: input.scheduledFor,
  });

  if (!claim.claimed) {
    return 'duplicate';
  }

  try {
    const outbox = await enqueueLineMessage(supabase, {
      clinicId: input.clinicId,
      lineUserId,
      messageType: input.notificationType,
      payload: buildReservationLinePayload(input),
    });

    await updateReservationNotification(supabase, claim.id, {
      status: 'enqueued',
      detail: {
        line_outbox_id: outbox.id,
        message_type: input.notificationType,
        fallback_email: Boolean(input.toEmail),
      },
    });
    return 'enqueued';
  } catch (error) {
    await updateReservationNotification(supabase, claim.id, {
      status: 'failed',
      detail: {
        message_type: input.notificationType,
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

async function fetchClinicCommunicationLineEnabled(
  supabase: NotificationSupabaseClient,
  clinicId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('clinic_settings')
    .select('settings')
    .eq('clinic_id', clinicId)
    .eq('category', 'communication')
    .maybeSingle();

  if (error) {
    logger.warn('Failed to load communication settings for LINE notification', {
      clinicId,
      error: error.message,
    });
    return false;
  }

  return normalizeCommunicationSettings(data?.settings).channels.lineEnabled;
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

async function fetchMenuName(
  supabase: NotificationSupabaseClient,
  clinicId: string,
  menuId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('menus')
    .select('name')
    .eq('id', menuId)
    .eq('clinic_id', clinicId)
    .maybeSingle();

  if (error) {
    logger.warn('Failed to load public reservation menu name', {
      clinicId,
      menuId,
      error: error.message,
    });
    return '';
  }

  return typeof data?.name === 'string' ? data.name : '';
}

async function fetchCustomerNotificationProfile(
  supabase: NotificationSupabaseClient,
  clinicId: string,
  customerId: string
): Promise<CustomerNotificationProfile | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('email, line_user_id')
    .eq('id', customerId)
    .eq('clinic_id', clinicId)
    .eq('is_deleted', false)
    .maybeSingle();

  if (error) {
    logger.warn('Failed to load customer notification profile', {
      clinicId,
      customerId,
      error: error.message,
    });
    return null;
  }

  return {
    email: typeof data?.email === 'string' ? data.email : null,
    lineUserId:
      typeof data?.line_user_id === 'string' ? data.line_user_id : null,
  };
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
  const notificationProfile = await fetchCustomerNotificationProfile(
    supabase,
    input.clinicId,
    input.customerId
  );

  const patientPayload: ReservationEmailPayload = {
    customerName: input.customerName,
    clinicName: input.clinicName,
    startTime: input.startTime,
    endTime: input.endTime,
    staffName,
    menuName: input.menuName,
  };

  await enqueuePatientReservationNotification(supabase, {
    clinicId: input.clinicId,
    reservationId: input.reservationId,
    customerId: input.customerId,
    toEmail: notificationProfile?.email ?? input.customerEmail,
    lineUserId: notificationProfile?.lineUserId ?? null,
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

export type PublicReservationCancellationNotificationInput = {
  clinicId: string;
  clinicName: string;
  reservation: PublicReservationCancellationReservation;
  customer: PublicReservationCancellationCustomer;
};

export async function enqueuePublicReservationCancellationNotification(
  supabase: NotificationSupabaseClient,
  input: PublicReservationCancellationNotificationInput
): Promise<'enqueued' | 'skipped'> {
  const clinicEmail = await fetchClinicNotificationEmail(
    supabase,
    input.clinicId
  );
  if (!clinicEmail) {
    logger.warn('Clinic email is not configured; cancellation notice skipped', {
      clinicId: input.clinicId,
      reservationId: input.reservation.id,
    });
    return 'skipped';
  }

  const [staffName, menuName] = await Promise.all([
    fetchResourceName(supabase, input.clinicId, input.reservation.staff_id),
    fetchMenuName(supabase, input.clinicId, input.reservation.menu_id),
  ]);

  const payload: PublicReservationCancelledPayload = {
    customerName: input.customer.name,
    clinicName: input.clinicName,
    startTime: input.reservation.start_time,
    endTime: input.reservation.end_time,
    staffName,
    menuName,
    channel: input.reservation.channel,
  };

  await enqueueEmail(
    supabase,
    {
      clinicId: input.clinicId,
      reservationId: input.reservation.id,
      customerId: input.customer.id,
      templateType: 'public-reservation-cancelled',
      toEmail: clinicEmail,
      payload,
    },
    input.reservation.updated_at,
    { ignoreDuplicate: true }
  );

  return 'enqueued';
}
