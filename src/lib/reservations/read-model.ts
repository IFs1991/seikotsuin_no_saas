import { normalizeRole } from '@/lib/constants/roles';
import {
  createAdminClient,
  createScopedAdminContext,
  type UserPermissions,
} from '@/lib/supabase';
import type { Database } from '@/types/supabase';
import type { ReservationOptionSelection } from '@/types/reservation';
import type {
  BookingFormResponseValue,
  IntakeResponseSnapshot,
} from '@/lib/booking-form/settings';

type ReservationListViewRow =
  Database['public']['Views']['reservation_list_view']['Row'];

export type ReservationListApiRow = Pick<
  ReservationListViewRow,
  | 'id'
  | 'customer_id'
  | 'customer_name'
  | 'menu_id'
  | 'menu_name'
  | 'staff_id'
  | 'staff_name'
  | 'start_time'
  | 'end_time'
  | 'status'
  | 'channel'
  | 'notes'
  | 'selected_options'
  | 'intake_responses'
  | 'is_staff_requested'
  | 'staff_nomination_fee'
>;

export type ReservationListItem = {
  id: string;
  customerId: string;
  customerName: string | null;
  menuId: string;
  menuName: string | null;
  staffId: string;
  staffName: string | null;
  startTime: string;
  endTime: string;
  status: ReservationListApiRow['status'];
  channel: ReservationListApiRow['channel'];
  notes?: string;
  selectedOptions: ReservationOptionSelection[];
  intakeResponses: IntakeResponseSnapshot[];
  isStaffRequested: boolean;
  staffNominationFee: number;
};

export const RESERVATION_LIST_SELECT =
  'id, customer_id, customer_name, menu_id, menu_name, staff_id, staff_name, start_time, end_time, status, channel, notes, selected_options, intake_responses, is_staff_requested, staff_nomination_fee';

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

export function mapSelectedOptions(
  value: unknown
): ReservationOptionSelection[] {
  return Array.isArray(value) ? value.filter(isReservationOptionSelection) : [];
}

function isBookingFormResponseValue(
  value: unknown
): value is BookingFormResponseValue {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (Array.isArray(value) && value.every(item => typeof item === 'string'))
  );
}

function isIntakeResponseSnapshot(
  value: unknown
): value is IntakeResponseSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const response = value as Record<string, unknown>;
  return (
    typeof response.id === 'string' &&
    typeof response.label === 'string' &&
    isBookingFormResponseValue(response.value)
  );
}

export function mapIntakeResponses(value: unknown): IntakeResponseSnapshot[] {
  return Array.isArray(value) ? value.filter(isIntakeResponseSnapshot) : [];
}

export function mapReservationListViewRow(
  row: ReservationListApiRow
): ReservationListItem {
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
    intakeResponses: mapIntakeResponses(row.intake_responses),
    isStaffRequested: row.is_staff_requested ?? false,
    staffNominationFee: row.staff_nomination_fee ?? 0,
  };
}

export function createReservationReadClient(
  permissions: UserPermissions,
  clinicId: string
) {
  if (normalizeRole(permissions.role) === 'manager') {
    return createAdminClient();
  }

  const scopedAdmin = createScopedAdminContext(permissions);
  scopedAdmin.assertClinicInScope(clinicId);
  return scopedAdmin.client;
}
