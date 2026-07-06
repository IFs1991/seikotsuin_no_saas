/**
 * PublicReservationService
 *
 * Encapsulates the business logic for creating reservations via the public API.
 * Each step (booking check, menu/resource verify, slot conflict, customer, reservation)
 * is a separate method so that the route handler stays thin and the logic is testable
 * independently.
 *
 * @see docs/stabilization/plan-closed-mvp-refactoring-priority-v0.1.md (PR-06)
 * @see docs/stabilization/spec-rls-tenant-boundary-v0.1.md - Customer Access Model
 */

import type { SupabaseServerClient } from '@/lib/supabase';
import type { Database, Json } from '@/types/supabase';
import {
  hasReservationConflict,
  isReservationNoOverlapError,
  RESERVATION_CONFLICT_STATUS_FILTER,
} from '@/lib/reservations/conflict';
import { PublicAvailabilityService } from '@/lib/services/public-availability-service';
import {
  addJSTCalendarDays,
  parseJSTDateStart,
  toJSTDateString,
} from '@/lib/jst';
import {
  normalizeBookingFormSettings,
  validateBookingFormResponses,
  type BookingFormResponseValue,
  type BookingFormSettings,
  type BookingFormStandardFieldKey,
  type IntakeResponseSnapshot,
} from '@/lib/booking-form/settings';

type ReservationInsert = Database['public']['Tables']['reservations']['Insert'];
type CustomerInsert = Database['public']['Tables']['customers']['Insert'];
type CustomerUpdate = Database['public']['Tables']['customers']['Update'];

// ──────────────────────────────────────────────
// Error types
// ──────────────────────────────────────────────

export class BookingDisabledError extends Error {
  constructor(message = 'Online booking is disabled for this clinic') {
    super(message);
    this.name = 'BookingDisabledError';
  }
}

export class MenuNotFoundError extends Error {
  constructor(message = 'Menu not found or not available') {
    super(message);
    this.name = 'MenuNotFoundError';
  }
}

export class ResourceNotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'ResourceNotFoundError';
  }
}

export class SlotConflictError extends Error {
  constructor(message = 'Requested time slot is not available') {
    super(message);
    this.name = 'SlotConflictError';
  }
}

export class CustomerLookupError extends Error {
  constructor(message = 'Failed to lookup customer record') {
    super(message);
    this.name = 'CustomerLookupError';
  }
}

export class CustomerCreateError extends Error {
  constructor(message = 'Failed to create customer record') {
    super(message);
    this.name = 'CustomerCreateError';
  }
}

export class ReservationCreateError extends Error {
  constructor(message = 'Failed to create reservation') {
    super(message);
    this.name = 'ReservationCreateError';
  }
}

export class BookingFormValidationError extends Error {
  constructor(message = 'Booking form responses are invalid') {
    super(message);
    this.name = 'BookingFormValidationError';
  }
}

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface MenuInfo {
  id: string;
  name: string;
  duration_minutes: number | null;
  price: number | null;
}

export interface CustomerResult {
  customerId: string;
  created: boolean;
}

export interface VerifiedLineCustomerProfile {
  lineUserId: string;
  displayName: string | null;
}

export interface ReservationResult {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  updated_at: string;
}

export interface CreateReservationParams {
  customerId: string;
  menuId: string;
  resourceId: string;
  startIso: string;
  endIso: string;
  notes: string | null;
  channel: string;
  isStaffRequested?: boolean;
  intakeResponses?: IntakeResponseSnapshot[];
  campaignId?: string | null;
}

export interface ValidateBookingFormResponseParams {
  standardFields: Partial<Record<BookingFormStandardFieldKey, string>>;
  responses: { id: string; value: BookingFormResponseValue }[];
  consents: Record<string, boolean>;
}

export interface AutoAssignedStaff {
  resourceId: string;
}

type ResourceAssignmentCandidate = Pick<
  Database['public']['Tables']['resources']['Row'],
  'id' | 'display_order' | 'created_at'
>;

type ReservationStaffRow = Pick<
  Database['public']['Tables']['reservations']['Row'],
  'staff_id'
>;

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function isNoRowsError(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'PGRST116'
  );
}

function toJsonValue(value: BookingFormResponseValue): Json {
  if (Array.isArray(value)) {
    return value;
  }
  return value;
}

function toIntakeResponsesJson(
  responses: IntakeResponseSnapshot[]
): Json | null {
  if (responses.length === 0) {
    return null;
  }

  return responses.map(response => ({
    id: response.id,
    label: response.label,
    value: toJsonValue(response.value),
  }));
}

export function normalizeCustomerPhoneForMatch(
  phone: string | undefined
): string | null {
  const trimmed = phone?.trim() ?? '';
  if (!trimmed) {
    return null;
  }

  const compact = trimmed.replace(/[\s-]/g, '');
  if (compact.startsWith('+81')) {
    const domestic = `0${compact.slice(3)}`;
    return domestic.length > 1 ? domestic : null;
  }

  return compact.length > 0 ? compact : null;
}

// ──────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────

export class PublicReservationService {
  constructor(
    private readonly client: SupabaseServerClient,
    private readonly clinicId: string
  ) {}

  /**
   * Check that online booking is enabled for this clinic.
   * @throws BookingDisabledError
   */
  async checkBookingEnabled(): Promise<void> {
    const { data: record, error } = await this.client
      .from('clinic_settings')
      .select('settings')
      .eq('clinic_id', this.clinicId)
      .eq('category', 'booking_calendar')
      .single();

    const isMissing = error && isNoRowsError(error);

    if (error && !isMissing) {
      throw new Error('Failed to verify online booking settings');
    }

    const allowOnlineBooking =
      record?.settings &&
      typeof record.settings === 'object' &&
      'allowOnlineBooking' in record.settings
        ? record.settings.allowOnlineBooking === true
        : false;

    if (!allowOnlineBooking) {
      throw new BookingDisabledError();
    }
  }

  async getBookingFormSettings(): Promise<BookingFormSettings> {
    const { data: record, error } = await this.client
      .from('clinic_settings')
      .select('settings')
      .eq('clinic_id', this.clinicId)
      .eq('category', 'booking_form')
      .maybeSingle();

    if (error) {
      throw new Error('Failed to load booking form settings');
    }

    return normalizeBookingFormSettings(record?.settings);
  }

  async validateBookingFormResponses(
    params: ValidateBookingFormResponseParams
  ): Promise<IntakeResponseSnapshot[]> {
    const settings = await this.getBookingFormSettings();
    const result = validateBookingFormResponses({
      settings,
      standardFields: params.standardFields,
      responses: params.responses,
      consents: params.consents,
    });

    if (result.ok === false) {
      throw new BookingFormValidationError(result.message);
    }

    return result.snapshots;
  }

  /**
   * Verify that the menu exists, is active, belongs to the clinic.
   * @throws MenuNotFoundError
   */
  async verifyMenu(menuId: string): Promise<MenuInfo> {
    const { data: menu, error } = await this.client
      .from('menus')
      .select('id, name, duration_minutes, price')
      .eq('id', menuId)
      .eq('clinic_id', this.clinicId)
      .eq('is_active', true)
      .eq('is_public', true)
      .eq('is_deleted', false)
      .single();

    if (error || !menu) {
      throw new MenuNotFoundError();
    }

    return menu as MenuInfo;
  }

  /**
   * Verify that the resource exists and belongs to the clinic.
   * @throws ResourceNotFoundError
   */
  async verifyResource(resourceId: string): Promise<void> {
    const { data, error } = await this.client
      .from('resources')
      .select('id')
      .eq('id', resourceId)
      .eq('clinic_id', this.clinicId)
      .eq('type', 'staff')
      .eq('is_active', true)
      .eq('is_bookable', true)
      .eq('is_deleted', false)
      .single();

    if (error || !data) {
      throw new ResourceNotFoundError();
    }
  }

  /**
   * Select a bookable staff member for resource_id="any".
   * @throws SlotConflictError when no staff is available.
   */
  async selectStaffForAutoAssign(
    startIso: string,
    endIso: string,
    excludeResourceIds: string[] = []
  ): Promise<AutoAssignedStaff> {
    const { data: resources, error } = await this.client
      .from('resources')
      .select('id, display_order, created_at')
      .eq('clinic_id', this.clinicId)
      .eq('type', 'staff')
      .eq('is_active', true)
      .eq('is_bookable', true)
      .eq('is_deleted', false)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error('Failed to load bookable staff resources');
    }

    const candidates = (resources ?? [])
      .filter(
        (resource): resource is ResourceAssignmentCandidate =>
          typeof resource.id === 'string' &&
          !excludeResourceIds.includes(resource.id)
      )
      .sort(compareAssignmentCandidates);

    const availableCandidates: ResourceAssignmentCandidate[] = [];
    for (const candidate of candidates) {
      try {
        await this.checkSlotAvailability(candidate.id, startIso, endIso);
        availableCandidates.push(candidate);
      } catch (error) {
        if (!(error instanceof SlotConflictError)) {
          throw error;
        }
      }
    }

    if (availableCandidates.length === 0) {
      throw new SlotConflictError();
    }

    const assignmentCounts = await this.loadSameDayAssignmentCounts(
      startIso,
      availableCandidates.map(candidate => candidate.id)
    );

    availableCandidates.sort((left, right) => {
      const countDiff =
        (assignmentCounts.get(left.id) ?? 0) -
        (assignmentCounts.get(right.id) ?? 0);
      if (countDiff !== 0) return countDiff;
      return compareAssignmentCandidates(left, right);
    });

    return { resourceId: availableCandidates[0].id };
  }

  /**
   * Calculate start and end ISO strings from start_time and duration.
   */
  calculateTimeSlot(
    startTime: string,
    durationMinutes: number | null
  ): { startIso: string; endIso: string } {
    const startDate = new Date(startTime);
    const endDate = new Date(
      startDate.getTime() + (durationMinutes ?? 60) * 60 * 1000
    );
    return {
      startIso: startDate.toISOString(),
      endIso: endDate.toISOString(),
    };
  }

  async validateReservationTime(
    startIso: string,
    endIso: string
  ): Promise<void> {
    const availabilityService = new PublicAvailabilityService(
      this.client,
      this.clinicId
    );
    await availabilityService.validateReservationTime(startIso, endIso);
  }

  /**
   * Check that the time slot is available (no overlapping reservations or blocks).
   * @throws SlotConflictError
   */
  async checkSlotAvailability(
    resourceId: string,
    startIso: string,
    endIso: string
  ): Promise<void> {
    try {
      const hasConflict = await hasReservationConflict(this.client, {
        clinicId: this.clinicId,
        staffId: resourceId,
        startTime: startIso,
        endTime: endIso,
        excludeDeleted: true,
      });

      if (hasConflict) {
        throw new SlotConflictError();
      }
    } catch (error) {
      if (error instanceof SlotConflictError) {
        throw error;
      }

      throw new Error('Failed to validate reservation slot');
    }

    // Check overlapping blocks
    const { data: blocks, error: blockError } = await this.client
      .from('blocks')
      .select('id, reason')
      .eq('clinic_id', this.clinicId)
      .eq('resource_id', resourceId)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .lt('start_time', endIso)
      .gt('end_time', startIso);

    if (blockError) {
      throw new Error('Failed to validate reservation slot');
    }

    if (blocks && blocks.length > 0) {
      throw new SlotConflictError();
    }
  }

  /**
   * Find an existing customer by LINE user ID, normalized phone, email, or create a new one.
   * Verified LINE profiles must not be linked to phone/email matches without
   * extra proof, otherwise an attacker can bind their LINE account to a victim.
   * @throws CustomerLookupError
   * @throws CustomerCreateError
   */
  async findOrCreateCustomer(
    name: string,
    phone: string | undefined,
    email: string | undefined,
    lineProfile?: VerifiedLineCustomerProfile
  ): Promise<CustomerResult> {
    const normalizedPhone = normalizeCustomerPhoneForMatch(phone);
    const normalizedEmail = email?.trim() || undefined;

    const existingCustomerId = lineProfile
      ? await this.findCustomerIdByColumn(
          'line_user_id',
          lineProfile.lineUserId
        )
      : ((normalizedPhone
          ? await this.findCustomerIdByColumn(
              'normalized_phone',
              normalizedPhone
            )
          : null) ??
        (normalizedEmail
          ? await this.findCustomerIdByColumn('email', normalizedEmail)
          : null));

    if (existingCustomerId) {
      await this.updateCustomerLineProfile(existingCustomerId, lineProfile);
      return { customerId: existingCustomerId, created: false };
    }

    const insertData: CustomerInsert = {
      clinic_id: this.clinicId,
      name,
      phone: normalizedPhone ?? phone ?? '',
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      ...(lineProfile
        ? {
            line_user_id: lineProfile.lineUserId,
            line_display_name: lineProfile.displayName,
          }
        : {}),
    };

    const { data: newCustomer, error: createError } = await this.client
      .from('customers')
      .insert(insertData)
      .select('id')
      .single();

    if (createError || !newCustomer) {
      throw new CustomerCreateError();
    }

    return { customerId: newCustomer.id, created: true };
  }

  private async findCustomerIdByColumn(
    column: 'line_user_id' | 'normalized_phone' | 'email',
    value: string
  ): Promise<string | null> {
    const { data: existing, error } = await this.client
      .from('customers')
      .select('id')
      .eq('clinic_id', this.clinicId)
      .eq(column, value)
      .eq('is_deleted', false)
      .limit(1)
      .maybeSingle();

    if (error && !isNoRowsError(error)) {
      throw new CustomerLookupError();
    }

    return existing?.id ?? null;
  }

  private async updateCustomerLineProfile(
    customerId: string,
    lineProfile: VerifiedLineCustomerProfile | undefined
  ): Promise<void> {
    if (!lineProfile) {
      return;
    }

    const updateData: CustomerUpdate = {
      line_user_id: lineProfile.lineUserId,
      line_display_name: lineProfile.displayName,
    };

    const { error } = await this.client
      .from('customers')
      .update(updateData)
      .eq('id', customerId)
      .eq('clinic_id', this.clinicId)
      .eq('line_user_id', lineProfile.lineUserId)
      .eq('is_deleted', false);

    if (error) {
      throw new CustomerLookupError();
    }
  }

  /**
   * Create the reservation record.
   * @throws ReservationCreateError
   */
  async createReservation(
    params: CreateReservationParams
  ): Promise<ReservationResult> {
    const insert: ReservationInsert = {
      clinic_id: this.clinicId,
      customer_id: params.customerId,
      menu_id: params.menuId,
      staff_id: params.resourceId,
      start_time: params.startIso,
      end_time: params.endIso,
      status: 'unconfirmed',
      notes: params.notes,
      channel: params.channel,
      is_staff_requested: params.isStaffRequested ?? true,
      intake_responses: toIntakeResponsesJson(params.intakeResponses ?? []),
      campaign_id: params.campaignId ?? null,
    };

    const { data, error } = await this.client
      .from('reservations')
      .insert(insert)
      .select('id, start_time, end_time, status, updated_at')
      .single();

    if (error && isReservationNoOverlapError(error)) {
      throw new SlotConflictError();
    }

    if (error || !data) {
      throw new ReservationCreateError();
    }

    return data as ReservationResult;
  }

  private async loadSameDayAssignmentCounts(
    startIso: string,
    resourceIds: string[]
  ): Promise<Map<string, number>> {
    if (resourceIds.length === 0) return new Map();

    const jstDate = toJSTDateString(new Date(startIso));
    const dayStart = parseJSTDateStart(jstDate).toISOString();
    const dayEnd = parseJSTDateStart(
      addJSTCalendarDays(jstDate, 1)
    ).toISOString();

    const { data, error } = await this.client
      .from('reservations')
      .select('staff_id')
      .eq('clinic_id', this.clinicId)
      .in('staff_id', resourceIds)
      .eq('is_deleted', false)
      .gte('start_time', dayStart)
      .lt('start_time', dayEnd)
      .not('status', 'in', RESERVATION_CONFLICT_STATUS_FILTER);

    if (error) {
      throw new Error('Failed to count staff assignment reservations');
    }

    const counts = new Map<string, number>();
    for (const row of (data ?? []) as ReservationStaffRow[]) {
      counts.set(row.staff_id, (counts.get(row.staff_id) ?? 0) + 1);
    }
    return counts;
  }

  /**
   * Delete a newly created customer (rollback on reservation failure).
   */
  async rollbackCustomer(customerId: string): Promise<void> {
    const { error } = await this.client
      .from('customers')
      .delete()
      .eq('id', customerId)
      .eq('clinic_id', this.clinicId);

    if (error) {
      console.error('Customer rollback error:', error);
    }
  }
}

function compareAssignmentCandidates(
  left: ResourceAssignmentCandidate,
  right: ResourceAssignmentCandidate
): number {
  const leftOrder = left.display_order ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.display_order ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return left.created_at.localeCompare(right.created_at);
}
