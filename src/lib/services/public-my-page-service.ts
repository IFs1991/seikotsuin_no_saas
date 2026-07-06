import { DEFAULT_SETTINGS } from '@/lib/admin-settings/defaults';
import { RESERVATION_CONFLICT_STATUS_FILTER } from '@/lib/reservations/conflict';
import type { SupabaseServerClient } from '@/lib/supabase';
import type { Database } from '@/types/supabase';

type PublicMyPageClient = Pick<SupabaseServerClient, 'from'>;

type BookingCalendarCancellationSettings = {
  allowCancellation: boolean;
  cancellationDeadlineHours: number;
};

type MyPageCustomerRow = Pick<
  Database['public']['Tables']['customers']['Row'],
  'id' | 'name' | 'email' | 'consent_marketing'
>;

type MyPageReservationRow = Pick<
  Database['public']['Tables']['reservations']['Row'],
  | 'id'
  | 'clinic_id'
  | 'customer_id'
  | 'menu_id'
  | 'staff_id'
  | 'start_time'
  | 'end_time'
  | 'status'
  | 'channel'
  | 'updated_at'
>;

type NameRow = {
  id: string;
  name: string;
};

export type PublicMyReservation = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  menu_name: string;
  staff_name: string;
  can_cancel: boolean;
  cancellation_deadline_at: string | null;
};

export type PublicMyReservationsResult = {
  customer: {
    name: string;
    consent_marketing: boolean;
  } | null;
  reservations: PublicMyReservation[];
};

export type PublicMyPageCancellationResult = {
  reservation: MyPageReservationRow;
  customer: MyPageCustomerRow;
};

export class PublicMyPageAuthError extends Error {
  constructor(message = 'LINE authentication is required') {
    super(message);
    this.name = 'PublicMyPageAuthError';
  }
}

export class PublicMyPageReservationNotFoundError extends Error {
  constructor(message = 'Reservation not found') {
    super(message);
    this.name = 'PublicMyPageReservationNotFoundError';
  }
}

export class PublicMyPageCancellationNotAllowedError extends Error {
  constructor(message = 'This reservation cannot be cancelled online') {
    super(message);
    this.name = 'PublicMyPageCancellationNotAllowedError';
  }
}

export class PublicMyPageCancellationDeadlineError extends Error {
  constructor(message = 'The cancellation deadline has passed') {
    super(message);
    this.name = 'PublicMyPageCancellationDeadlineError';
  }
}

export class PublicMyPageCustomerNotFoundError extends Error {
  constructor(message = 'Customer not found') {
    super(message);
    this.name = 'PublicMyPageCustomerNotFoundError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBoolean(
  source: Record<string, unknown>,
  key: string,
  fallback: boolean
): boolean {
  return typeof source[key] === 'boolean' ? source[key] : fallback;
}

function readDeadlineHours(
  source: Record<string, unknown>,
  fallback: number
): number {
  const value = source.cancellationDeadlineHours;
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 168
    ? value
    : fallback;
}

function normalizeCancellationSettings(
  value: unknown
): BookingCalendarCancellationSettings {
  const defaults = DEFAULT_SETTINGS.booking_calendar;
  const defaultRecord = defaults as Record<string, unknown>;
  const source = isRecord(value) ? value : defaultRecord;

  return {
    allowCancellation: readBoolean(
      source,
      'allowCancellation',
      readBoolean(defaultRecord, 'allowCancellation', true)
    ),
    cancellationDeadlineHours: readDeadlineHours(
      source,
      typeof defaultRecord.cancellationDeadlineHours === 'number'
        ? defaultRecord.cancellationDeadlineHours
        : 24
    ),
  };
}

function getCancellationDeadline(
  startTime: string,
  settings: BookingCalendarCancellationSettings
): string | null {
  if (!settings.allowCancellation) {
    return null;
  }

  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) {
    return null;
  }

  return new Date(
    start.getTime() - settings.cancellationDeadlineHours * 60 * 60 * 1000
  ).toISOString();
}

function isTerminalReservationStatus(status: string): boolean {
  return (
    status === 'cancelled' || status === 'no_show' || status === 'completed'
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export class PublicMyPageService {
  constructor(
    private readonly client: PublicMyPageClient,
    private readonly clinicId: string,
    private readonly now: () => Date = () => new Date()
  ) {}

  async getMyReservations(
    lineUserId: string
  ): Promise<PublicMyReservationsResult> {
    const customer = await this.findCustomerByLineUserId(lineUserId);
    if (!customer) {
      return { customer: null, reservations: [] };
    }

    const [settings, reservations] = await Promise.all([
      this.loadCancellationSettings(),
      this.loadFutureReservations(customer.id),
    ]);
    const [menus, resources] = await Promise.all([
      this.loadNameMap(
        'menus',
        reservations.map(row => row.menu_id)
      ),
      this.loadNameMap(
        'resources',
        reservations.map(row => row.staff_id)
      ),
    ]);

    return {
      customer: {
        name: customer.name,
        consent_marketing: customer.consent_marketing === true,
      },
      reservations: reservations.map(row =>
        this.mapReservation(row, settings, menus, resources)
      ),
    };
  }

  async updateMarketingConsent(
    lineUserId: string,
    consentMarketing: boolean
  ): Promise<{ consent_marketing: boolean }> {
    const customer = await this.findCustomerByLineUserId(lineUserId);
    if (!customer) {
      throw new PublicMyPageCustomerNotFoundError();
    }

    const { data, error } = await this.client
      .from('customers')
      .update({
        consent_marketing: consentMarketing,
        updated_at: this.now().toISOString(),
      })
      .eq('id', customer.id)
      .eq('clinic_id', this.clinicId)
      .eq('line_user_id', lineUserId)
      .eq('is_deleted', false)
      .select('consent_marketing')
      .maybeSingle();

    if (error) {
      throw new Error('Failed to update marketing consent');
    }

    if (!data) {
      throw new PublicMyPageCustomerNotFoundError();
    }

    return { consent_marketing: data.consent_marketing === true };
  }

  async cancelReservation(
    reservationId: string,
    lineUserId: string
  ): Promise<PublicMyPageCancellationResult> {
    const reservation = await this.findReservation(reservationId);
    if (!reservation) {
      throw new PublicMyPageReservationNotFoundError();
    }

    const customer = await this.findCustomerByIdAndLineUserId(
      reservation.customer_id,
      lineUserId
    );
    if (!customer) {
      throw new PublicMyPageReservationNotFoundError();
    }

    if (isTerminalReservationStatus(reservation.status)) {
      throw new PublicMyPageCancellationNotAllowedError();
    }

    const settings = await this.loadCancellationSettings();
    if (!settings.allowCancellation) {
      throw new PublicMyPageCancellationNotAllowedError();
    }

    const deadlineAt = getCancellationDeadline(
      reservation.start_time,
      settings
    );
    if (!deadlineAt || this.now().getTime() > new Date(deadlineAt).getTime()) {
      throw new PublicMyPageCancellationDeadlineError();
    }

    const updatedAt = this.now().toISOString();
    const { data, error } = await this.client
      .from('reservations')
      .update({
        status: 'cancelled',
        cancellation_reason: 'line_mypage',
        updated_at: updatedAt,
      })
      .eq('id', reservation.id)
      .eq('clinic_id', this.clinicId)
      .eq('customer_id', reservation.customer_id)
      .eq('is_deleted', false)
      .select(
        'id, clinic_id, customer_id, menu_id, staff_id, start_time, end_time, status, channel, updated_at'
      )
      .maybeSingle();

    if (error) {
      throw new Error('Failed to cancel reservation');
    }

    if (!data) {
      throw new PublicMyPageReservationNotFoundError();
    }

    return {
      reservation: data as MyPageReservationRow,
      customer,
    };
  }

  private async findCustomerByLineUserId(
    lineUserId: string
  ): Promise<MyPageCustomerRow | null> {
    const { data, error } = await this.client
      .from('customers')
      .select('id, name, email, consent_marketing')
      .eq('clinic_id', this.clinicId)
      .eq('line_user_id', lineUserId)
      .eq('is_deleted', false)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error('Failed to load LINE customer');
    }

    return data as MyPageCustomerRow | null;
  }

  private async findCustomerByIdAndLineUserId(
    customerId: string,
    lineUserId: string
  ): Promise<MyPageCustomerRow | null> {
    const { data, error } = await this.client
      .from('customers')
      .select('id, name, email, consent_marketing')
      .eq('id', customerId)
      .eq('clinic_id', this.clinicId)
      .eq('line_user_id', lineUserId)
      .eq('is_deleted', false)
      .maybeSingle();

    if (error) {
      throw new Error('Failed to load LINE customer');
    }

    return data as MyPageCustomerRow | null;
  }

  private async findReservation(
    reservationId: string
  ): Promise<MyPageReservationRow | null> {
    const { data, error } = await this.client
      .from('reservations')
      .select(
        'id, clinic_id, customer_id, menu_id, staff_id, start_time, end_time, status, channel, updated_at'
      )
      .eq('id', reservationId)
      .eq('clinic_id', this.clinicId)
      .eq('is_deleted', false)
      .maybeSingle();

    if (error) {
      throw new Error('Failed to load reservation');
    }

    return data as MyPageReservationRow | null;
  }

  private async loadFutureReservations(
    customerId: string
  ): Promise<MyPageReservationRow[]> {
    const { data, error } = await this.client
      .from('reservations')
      .select(
        'id, clinic_id, customer_id, menu_id, staff_id, start_time, end_time, status, channel, updated_at'
      )
      .eq('clinic_id', this.clinicId)
      .eq('customer_id', customerId)
      .eq('is_deleted', false)
      .gte('start_time', this.now().toISOString())
      .not('status', 'in', RESERVATION_CONFLICT_STATUS_FILTER)
      .order('start_time', { ascending: true });

    if (error) {
      throw new Error('Failed to load future reservations');
    }

    return (data ?? []) as MyPageReservationRow[];
  }

  private async loadCancellationSettings(): Promise<BookingCalendarCancellationSettings> {
    const { data, error } = await this.client
      .from('clinic_settings')
      .select('settings')
      .eq('clinic_id', this.clinicId)
      .eq('category', 'booking_calendar')
      .maybeSingle();

    if (error) {
      throw new Error('Failed to load booking calendar settings');
    }

    return normalizeCancellationSettings(data?.settings);
  }

  private async loadNameMap(
    table: 'menus' | 'resources',
    ids: string[]
  ): Promise<Map<string, string>> {
    const targetIds = unique(ids);
    if (targetIds.length === 0) {
      return new Map();
    }

    const { data, error } = await this.client
      .from(table)
      .select('id, name')
      .eq('clinic_id', this.clinicId)
      .in('id', targetIds);

    if (error) {
      throw new Error(`Failed to load ${table} names`);
    }

    const rows = (data ?? []) as NameRow[];
    return new Map(rows.map(row => [row.id, row.name]));
  }

  private mapReservation(
    row: MyPageReservationRow,
    settings: BookingCalendarCancellationSettings,
    menus: Map<string, string>,
    resources: Map<string, string>
  ): PublicMyReservation {
    const deadlineAt = getCancellationDeadline(row.start_time, settings);
    const canCancel =
      Boolean(deadlineAt) &&
      !isTerminalReservationStatus(row.status) &&
      this.now().getTime() <= new Date(deadlineAt).getTime();

    return {
      id: row.id,
      start_time: row.start_time,
      end_time: row.end_time,
      status: row.status,
      menu_name: menus.get(row.menu_id) ?? '',
      staff_name: resources.get(row.staff_id) ?? '',
      can_cancel: canCancel,
      cancellation_deadline_at: deadlineAt,
    };
  }
}
