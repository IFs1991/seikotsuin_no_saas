import type { ReservationOptionSelection } from '@/types/reservation';
import type { IntakeResponseSnapshot } from '@/lib/booking-form/settings';

export interface ReservationApiItem {
  id: string;
  customerId: string;
  customerName?: string;
  menuId: string;
  menuName?: string;
  staffId: string;
  staffName?: string;
  startTime: string;
  endTime: string;
  status?:
    | 'tentative'
    | 'confirmed'
    | 'arrived'
    | 'completed'
    | 'cancelled'
    | 'no_show'
    | 'unconfirmed'
    | 'trial';
  channel?: 'line' | 'web' | 'phone' | 'walk_in';
  notes?: string;
  selectedOptions?: ReservationOptionSelection[];
  intakeResponses?: IntakeResponseSnapshot[];
  isStaffRequested?: boolean;
  staffNominationFee?: number;
}

export interface CustomerApiItem {
  id: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  customAttributes?: Record<string, unknown>;
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface ApiEnvelope {
  success?: unknown;
  error?: unknown;
  data?: unknown;
}

interface FetchReservationsOptions {
  signal?: AbortSignal;
}

const isApiEnvelope = (value: unknown): value is ApiEnvelope =>
  typeof value === 'object' && value !== null;

const getApiEnvelopeError = (json: unknown) =>
  isApiEnvelope(json) && typeof json.error === 'string'
    ? json.error
    : 'Request failed';

const handleJson = async <T>(res: Response): Promise<T> => {
  const json: unknown = await res.json();
  if (!isApiEnvelope(json) || !res.ok || json.success !== true) {
    const message = getApiEnvelopeError(json);
    throw new ApiError(message, res.status);
  }
  return json.data as T;
};

export const fetchReservations = async (
  clinicId: string,
  startDate: Date,
  endDate: Date,
  staffId?: string,
  options: FetchReservationsOptions = {}
): Promise<ReservationApiItem[]> => {
  const params = new URLSearchParams({
    clinic_id: clinicId,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
  });
  if (staffId) params.set('staff_id', staffId);

  const res = await fetch(`/api/reservations?${params.toString()}`, {
    signal: options.signal,
  });
  return handleJson<ReservationApiItem[]>(res);
};

export const fetchCustomerReservations = async (
  clinicId: string,
  customerId: string
): Promise<ReservationApiItem[]> => {
  const params = new URLSearchParams({
    clinic_id: clinicId,
    customer_id: customerId,
  });

  const res = await fetch(`/api/reservations?${params.toString()}`);
  return handleJson<ReservationApiItem[]>(res);
};

export const fetchCustomers = async (
  clinicId: string,
  query: string
): Promise<CustomerApiItem[]> => {
  const params = new URLSearchParams({
    clinic_id: clinicId,
    q: query,
  });
  const res = await fetch(`/api/customers?${params.toString()}`);
  return handleJson<CustomerApiItem[]>(res);
};

export const createCustomer = async (payload: {
  clinicId: string;
  name: string;
  phone: string;
  email?: string;
  customAttributes?: Record<string, unknown>;
}): Promise<{ id: string; name: string }> => {
  const res = await fetch('/api/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clinic_id: payload.clinicId,
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      customAttributes: payload.customAttributes,
    }),
  });
  return handleJson<{ id: string; name: string }>(res);
};

export const createReservation = async (payload: {
  clinicId: string;
  customerId: string;
  menuId: string;
  staffId: string;
  startTime: Date;
  endTime: Date;
  channel: 'line' | 'web' | 'phone' | 'walk_in';
  notes?: string;
  selectedOptions?: ReservationOptionSelection[];
  isStaffRequested?: boolean;
}): Promise<ReservationApiItem> => {
  const res = await fetch('/api/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clinic_id: payload.clinicId,
      customerId: payload.customerId,
      menuId: payload.menuId,
      staffId: payload.staffId,
      startTime: payload.startTime.toISOString(),
      endTime: payload.endTime.toISOString(),
      channel: payload.channel,
      notes: payload.notes,
      selectedOptions: payload.selectedOptions,
      isStaffRequested: payload.isStaffRequested,
    }),
  });
  return handleJson<ReservationApiItem>(res);
};

export const updateReservation = async (payload: {
  clinicId: string;
  id: string;
  staffId?: string;
  startTime?: Date;
  endTime?: Date;
  status?: ReservationApiItem['status'];
  notes?: string;
  selectedOptions?: ReservationOptionSelection[];
  isStaffRequested?: boolean;
}): Promise<ReservationApiItem> => {
  const res = await fetch('/api/reservations', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clinic_id: payload.clinicId,
      id: payload.id,
      staffId: payload.staffId,
      startTime: payload.startTime?.toISOString(),
      endTime: payload.endTime?.toISOString(),
      status: payload.status,
      notes: payload.notes,
      selectedOptions: payload.selectedOptions,
      isStaffRequested: payload.isStaffRequested,
    }),
  });
  return handleJson<ReservationApiItem>(res);
};

export const cancelReservation = async (payload: {
  clinicId: string;
  id: string;
}): Promise<ReservationApiItem> => {
  return updateReservation({
    clinicId: payload.clinicId,
    id: payload.id,
    status: 'cancelled',
  });
};
