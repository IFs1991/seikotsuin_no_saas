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
import type { Database } from '@/types/supabase';
import {
  hasReservationConflict,
  isReservationNoOverlapError,
} from '@/lib/reservations/conflict';

type ReservationInsert = Database['public']['Tables']['reservations']['Insert'];
type CustomerInsert = Database['public']['Tables']['customers']['Insert'];

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

export interface ReservationResult {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
}

export interface CreateReservationParams {
  customerId: string;
  menuId: string;
  resourceId: string;
  startIso: string;
  endIso: string;
  notes: string | null;
  channel: string;
}

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
   * Find an existing customer by email, or create a new one.
   * @throws CustomerLookupError
   * @throws CustomerCreateError
   */
  async findOrCreateCustomer(
    name: string,
    phone: string | undefined,
    email: string | undefined
  ): Promise<CustomerResult> {
    if (email) {
      const { data: existing, error: lookupError } = await this.client
        .from('customers')
        .select('id')
        .eq('clinic_id', this.clinicId)
        .eq('email', email)
        .eq('is_deleted', false)
        .single();

      if (lookupError && !isNoRowsError(lookupError)) {
        throw new CustomerLookupError();
      }

      if (existing) {
        return { customerId: existing.id, created: false };
      }
    }

    // Create new customer (with or without email)
    const insertData: CustomerInsert = {
      clinic_id: this.clinicId,
      name,
      phone,
      ...(email ? { email } : {}),
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
    };

    const { data, error } = await this.client
      .from('reservations')
      .insert(insert)
      .select('id, start_time, end_time, status')
      .single();

    if (error && isReservationNoOverlapError(error)) {
      throw new SlotConflictError();
    }

    if (error || !data) {
      throw new ReservationCreateError();
    }

    return data as ReservationResult;
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
