import { env } from '@/lib/env';
import type {
  CrmSupabaseClient,
  StaffAvailabilityEventRow,
} from '@/lib/crm-line/db';
import { addJSTCalendarDays, toJSTDateString } from '@/lib/jst';
import type { Json } from '@/types/supabase';

type PreferenceCustomerRow = { customer_id: string };

type CustomerLineRow = {
  id: string;
  name: string;
  line_user_id: string | null;
  email: string | null;
  is_deleted: boolean | null;
};

type ReservationHistoryRow = { customer_id: string };
type StaffNameRow = { id: string; name: string };
type RewardType = StaffAvailabilityEventRow['reward_type'];
type NotificationStatus = 'pending' | 'sent' | 'failed' | 'booked';

type AvailabilityNotificationLookupRow = {
  customer_id: string;
  line_user_id: string;
  status: NotificationStatus;
};

type AvailabilityEventLookupRow = Pick<
  StaffAvailabilityEventRow,
  'id' | 'staff_id' | 'available_datetime' | 'status'
>;

const VISITED_STATUSES = ['completed', 'arrived'] as const;

export class StaffAvailabilityStaffNotFoundError extends Error {
  constructor() {
    super('スタッフが見つかりません');
    this.name = 'StaffAvailabilityStaffNotFoundError';
  }
}

export class StaffAvailabilityTimeRangeError extends Error {
  constructor() {
    super('空き枠は未来かつJST基準の公開予約14日範囲内で指定してください');
    this.name = 'StaffAvailabilityTimeRangeError';
  }
}

export class StaffAvailabilityNotFoundError extends Error {
  constructor() {
    super('本人向けの空き枠通知が見つかりません');
    this.name = 'StaffAvailabilityNotFoundError';
  }
}

export class StaffAvailabilityUnavailableError extends Error {
  constructor(message = 'この空き枠は予約済み、取消済み、または期限切れです') {
    super(message);
    this.name = 'StaffAvailabilityUnavailableError';
  }
}

export class StaffAvailabilityClaimConflictError extends Error {
  constructor() {
    super('通知された担当者・開始日時と一致しないか、空き枠は既に予約済みです');
    this.name = 'StaffAvailabilityClaimConflictError';
  }
}

function assertEventTimeInRange(value: string, now = new Date()): void {
  const eventDate = new Date(value);
  const today = toJSTDateString(now);
  const latestExclusive = addJSTCalendarDays(today, 14);
  const eventJstDate = toJSTDateString(eventDate);
  if (
    Number.isNaN(eventDate.getTime()) ||
    eventDate.getTime() <= now.getTime() ||
    eventJstDate < today ||
    eventJstDate >= latestExclusive
  ) {
    throw new StaffAvailabilityTimeRangeError();
  }
}

function mapRpcError(error: { message: string }): Error {
  if (error.message.includes('STAFF_AVAILABILITY_STAFF_NOT_FOUND')) {
    return new StaffAvailabilityStaffNotFoundError();
  }
  if (error.message.includes('STAFF_AVAILABILITY_TIME_OUT_OF_RANGE')) {
    return new StaffAvailabilityTimeRangeError();
  }
  if (error.message.includes('STAFF_AVAILABILITY_NOT_FOUND')) {
    return new StaffAvailabilityNotFoundError();
  }
  if (
    error.message.includes('STAFF_AVAILABILITY_CLAIM_CONFLICT') ||
    error.message.includes('STAFF_AVAILABILITY_NOTIFICATION_NOT_FOUND') ||
    error.message.includes('reservations_no_overlap')
  ) {
    return new StaffAvailabilityClaimConflictError();
  }
  return new Error(error.message);
}

function buildBookingUrl(clinicId: string, eventId: string): string {
  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/+$/u, '');
  return `${baseUrl}/booking/${clinicId}?availability_event_id=${encodeURIComponent(eventId)}`;
}

function formatAvailableDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function buildNotificationText(params: {
  customerName: string;
  staffName: string;
  availableDatetime: string;
  bookingUrl: string;
}): string {
  return [
    `${params.customerName}様`,
    `${params.staffName}さんの空き枠が出ました。`,
    `日時: ${formatAvailableDateTime(params.availableDatetime)}`,
    'ご希望の場合は、下の予約ページからお申し込みください。',
    params.bookingUrl,
  ].join('\n');
}

async function fetchEligibleCustomers(
  client: CrmSupabaseClient,
  params: { clinicId: string; staffId: string }
): Promise<CustomerLineRow[]> {
  const { data: preferences, error: preferenceError } = await client
    .from('patient_staff_preferences')
    .select('customer_id')
    .eq('clinic_id', params.clinicId)
    .eq('staff_id', params.staffId)
    .eq('notification_enabled', true)
    .returns<PreferenceCustomerRow[]>();
  if (preferenceError) throw preferenceError;

  const customerIds = Array.from(
    new Set((preferences ?? []).map(row => row.customer_id))
  );
  if (customerIds.length === 0) return [];

  const [customerResult, historyResult] = await Promise.all([
    client
      .from('customers')
      .select('id, name, line_user_id, email, is_deleted')
      .eq('clinic_id', params.clinicId)
      .in('id', customerIds)
      .eq('is_deleted', false)
      .returns<CustomerLineRow[]>(),
    client
      .from('reservations')
      .select('customer_id')
      .eq('clinic_id', params.clinicId)
      .eq('staff_id', params.staffId)
      .in('customer_id', customerIds)
      .in('status', [...VISITED_STATUSES])
      .eq('is_deleted', false)
      .returns<ReservationHistoryRow[]>(),
  ]);
  if (customerResult.error) throw customerResult.error;
  if (historyResult.error) throw historyResult.error;

  const relatedCustomerIds = new Set(
    (historyResult.data ?? []).map(row => row.customer_id)
  );
  return (customerResult.data ?? []).filter(
    customer =>
      Boolean(customer.line_user_id) && relatedCustomerIds.has(customer.id)
  );
}

async function fetchStaffName(
  client: CrmSupabaseClient,
  clinicId: string,
  staffId: string
): Promise<string> {
  const { data, error } = await client
    .from('resources')
    .select('id, name')
    .eq('clinic_id', clinicId)
    .eq('id', staffId)
    .eq('type', 'staff')
    .eq('is_active', true)
    .eq('is_bookable', true)
    .eq('is_deleted', false)
    .maybeSingle<StaffNameRow>();
  if (error || !data) throw new StaffAvailabilityStaffNotFoundError();
  return data.name;
}

export async function createAndNotifyStaffAvailabilityEvent(
  client: CrmSupabaseClient,
  input: {
    clinicId: string;
    staffId: string;
    availableDatetime: string;
    rewardType: RewardType;
    createdBy: string;
  }
): Promise<{ event: StaffAvailabilityEventRow; recipientCount: number }> {
  assertEventTimeInRange(input.availableDatetime);
  const [staffName, customers] = await Promise.all([
    fetchStaffName(client, input.clinicId, input.staffId),
    fetchEligibleCustomers(client, {
      clinicId: input.clinicId,
      staffId: input.staffId,
    }),
  ]);

  const eventId = crypto.randomUUID();
  const bookingUrl = buildBookingUrl(input.clinicId, eventId);
  const recipients: Json = customers.flatMap(customer => {
    if (!customer.line_user_id) return [];
    return [
      {
        customerId: customer.id,
        lineUserId: customer.line_user_id,
        text: buildNotificationText({
          customerName: customer.name,
          staffName,
          availableDatetime: input.availableDatetime,
          bookingUrl,
        }),
        bookingUrl,
      },
    ];
  });

  const { data, error } = await client
    .rpc('create_staff_availability_event', {
      p_event_id: eventId,
      p_clinic_id: input.clinicId,
      p_staff_id: input.staffId,
      p_available_datetime: input.availableDatetime,
      p_reward_type: input.rewardType,
      p_created_by: input.createdBy,
      p_recipients: recipients,
    })
    .single();
  if (error || !data) {
    throw error
      ? mapRpcError(error)
      : new Error('空き枠イベントを登録できませんでした');
  }

  const { recipient_count: recipientCount, ...event } = data;
  return { event, recipientCount };
}

export async function updateStaffAvailabilityNotificationDelivery(
  client: CrmSupabaseClient,
  params: {
    notificationId: string;
    outboxId: string;
    clinicId: string;
    status: 'sent' | 'failed';
    sentAt: string | null;
    lastError: string | null;
  }
): Promise<void> {
  const { error } = await client.rpc('finalize_staff_availability_delivery', {
    p_notification_id: params.notificationId,
    p_outbox_id: params.outboxId,
    p_clinic_id: params.clinicId,
    p_status: params.status,
    p_sent_at: params.sentAt,
    p_last_error: params.lastError,
  });
  if (error) throw mapRpcError(error);
}

export type PublicStaffAvailabilityEvent = {
  eventId: string;
  staffId: string;
  staffName: string;
  availableDatetime: string;
};

export async function getPublicStaffAvailabilityEvent(
  client: CrmSupabaseClient,
  params: { clinicId: string; eventId: string; lineUserId: string }
): Promise<PublicStaffAvailabilityEvent> {
  const { data: notification, error: notificationError } = await client
    .from('staff_availability_notifications')
    .select('customer_id, line_user_id, status')
    .eq('clinic_id', params.clinicId)
    .eq('availability_event_id', params.eventId)
    .eq('line_user_id', params.lineUserId)
    .maybeSingle<AvailabilityNotificationLookupRow>();
  if (notificationError) throw notificationError;
  if (!notification) throw new StaffAvailabilityNotFoundError();
  if (!['pending', 'sent'].includes(notification.status)) {
    throw new StaffAvailabilityUnavailableError();
  }

  const { data: event, error: eventError } = await client
    .from('staff_availability_events')
    .select('id, staff_id, available_datetime, status')
    .eq('id', params.eventId)
    .eq('clinic_id', params.clinicId)
    .maybeSingle<AvailabilityEventLookupRow>();
  if (eventError) throw eventError;
  if (!event) throw new StaffAvailabilityNotFoundError();
  if (!['open', 'notified'].includes(event.status)) {
    throw new StaffAvailabilityUnavailableError();
  }
  try {
    assertEventTimeInRange(event.available_datetime);
  } catch (error) {
    if (error instanceof StaffAvailabilityTimeRangeError) {
      throw new StaffAvailabilityUnavailableError();
    }
    throw error;
  }

  return {
    eventId: event.id,
    staffId: event.staff_id,
    staffName: await fetchStaffName(client, params.clinicId, event.staff_id),
    availableDatetime: event.available_datetime,
  };
}

export async function createStaffAvailabilityReservation(
  client: CrmSupabaseClient,
  params: {
    clinicId: string;
    eventId: string;
    customerId: string;
    lineUserId: string;
    menuId: string;
    staffId: string;
    startTime: string;
    endTime: string;
    notes: string | null;
    intakeResponses: Json;
    campaignId: string | null;
  }
): Promise<{
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  updated_at: string;
}> {
  const { data, error } = await client
    .rpc('create_staff_availability_reservation', {
      p_clinic_id: params.clinicId,
      p_event_id: params.eventId,
      p_customer_id: params.customerId,
      p_line_user_id: params.lineUserId,
      p_menu_id: params.menuId,
      p_staff_id: params.staffId,
      p_start_time: params.startTime,
      p_end_time: params.endTime,
      p_notes: params.notes,
      p_channel: 'line',
      p_is_staff_requested: true,
      p_intake_responses: params.intakeResponses,
      p_campaign_id: params.campaignId,
    })
    .single();
  if (error || !data) {
    throw error
      ? mapRpcError(error)
      : new StaffAvailabilityClaimConflictError();
  }
  return data;
}
