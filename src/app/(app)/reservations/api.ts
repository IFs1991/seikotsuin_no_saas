import { z } from 'zod';
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

interface CustomerApiPage {
  items: CustomerApiItem[];
  nextCursor: string | null;
}

export interface PatientIdentityCandidate {
  customerId: string;
  displayName: string;
  phoneticName: string | null;
  score: number;
  scoreBreakdown: {
    lineUserId: number;
    phone: number;
    name: number;
    alias: number;
    staffHistory: number;
    menuHistory: number;
  };
  visitCount: number;
  lastVisitAt: string | null;
  averageVisitIntervalDays: number | null;
  staffHistory: Array<{ staffId: string; staffName: string | null }>;
  menuHistory: Array<{ menuId: string; menuName: string | null }>;
}

interface PatientIdentityCandidateResponse {
  candidates: PatientIdentityCandidate[];
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
export interface ReservationApiPage {
  items: ReservationApiItem[];
  nextCursor: string | null;
  hasMore: boolean;
}
const reservationPageSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      id: z.string(),
      customerId: z.string(),
      menuId: z.string(),
      staffId: z.string(),
      customerName: z
        .string()
        .nullish()
        .transform(value => value ?? undefined),
      menuName: z
        .string()
        .nullish()
        .transform(value => value ?? undefined),
      staffName: z
        .string()
        .nullish()
        .transform(value => value ?? undefined),
      startTime: z.string().datetime({ offset: true }),
      endTime: z.string().datetime({ offset: true }),
      status: z
        .enum([
          'tentative',
          'confirmed',
          'arrived',
          'completed',
          'cancelled',
          'no_show',
          'unconfirmed',
          'trial',
        ])
        .optional(),
      channel: z.enum(['line', 'web', 'phone', 'walk_in']).optional(),
      notes: z.string().optional(),
      selectedOptions: z
        .array(
          z.object({
            optionId: z.string(),
            name: z.string(),
            priceDelta: z.number(),
            durationDeltaMinutes: z.number(),
          })
        )
        .optional(),
      intakeResponses: z
        .array(
          z.object({
            id: z.string(),
            label: z.string(),
            value: z.union([z.string(), z.boolean(), z.array(z.string())]),
          })
        )
        .optional(),
      isStaffRequested: z.boolean().optional(),
      staffNominationFee: z.number().optional(),
    })
  ),
  pagination: z
    .object({
      has_more: z.boolean(),
      next_cursor: z.string().min(1).max(2048).nullable(),
    })
    .refine(value => value.has_more === (value.next_cursor !== null)),
});

async function fetchReservationPage(
  params: URLSearchParams,
  options: FetchReservationsOptions
): Promise<ReservationApiPage> {
  const response = await fetch('/api/reservations?' + params.toString(), {
    signal: options.signal,
  });
  const json: unknown = await response.json();
  if (!response.ok)
    throw new ApiError(getApiEnvelopeError(json), response.status);
  const parsed = reservationPageSchema.safeParse(json);
  if (
    !parsed.success ||
    (parsed.data.pagination.has_more && parsed.data.data.length === 0)
  ) {
    throw new ApiError(
      '予約一覧の取得が完了しませんでした。再試行してください',
      502
    );
  }
  return {
    items: parsed.data.data.map(item => ({
      ...item,
      id: item.id,
      customerId: item.customerId,
      menuId: item.menuId,
      staffId: item.staffId,
      startTime: item.startTime,
      endTime: item.endTime,
      selectedOptions: item.selectedOptions?.map(option => ({
        optionId: option.optionId,
        name: option.name,
        priceDelta: option.priceDelta,
        durationDeltaMinutes: option.durationDeltaMinutes,
      })),
      intakeResponses: item.intakeResponses?.map(response => ({
        id: response.id,
        label: response.label,
        value: response.value,
      })),
    })),
    hasMore: parsed.data.pagination.has_more,
    nextCursor: parsed.data.pagination.next_cursor,
  };
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

  const rows: ReservationApiItem[] = [];
  const seenCursors = new Set<string>();
  const seenIds = new Set<string>();
  while (true) {
    if (options.signal?.aborted)
      throw new DOMException('Aborted', 'AbortError');
    const page = await fetchReservationPage(params, options);
    for (const row of page.items) {
      if (seenIds.has(row.id))
        throw new ApiError('予約が更新されました。再取得してください', 409);
      seenIds.add(row.id);
      rows.push(row);
    }
    if (!page.hasMore) return rows;
    if (!page.nextCursor || seenCursors.has(page.nextCursor))
      throw new ApiError(
        '予約一覧の取得が完了しませんでした。再試行してください',
        502
      );
    seenCursors.add(page.nextCursor);
    params.set('cursor', page.nextCursor);
  }
};

export const fetchCustomerReservations = async (
  clinicId: string,
  customerId: string,
  options: FetchReservationsOptions & { cursor?: string } = {}
): Promise<ReservationApiPage> => {
  const params = new URLSearchParams({
    clinic_id: clinicId,
    customer_id: customerId,
  });

  if (options.cursor) params.set('cursor', options.cursor);
  return fetchReservationPage(params, options);
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
  const page = await handleJson<CustomerApiPage>(res);
  return page.items;
};

export const fetchPatientIdentityCandidates = async (params: {
  clinicId: string;
  name: string;
  phone: string;
  staffId: string;
  menuId: string;
}): Promise<PatientIdentityCandidate[]> => {
  const query = new URLSearchParams({
    clinic_id: params.clinicId,
    name: params.name,
    phone: params.phone,
    staff_id: params.staffId,
    menu_id: params.menuId,
  });
  const response = await fetch(
    `/api/customers/identity-candidates?${query.toString()}`
  );
  const data = await handleJson<PatientIdentityCandidateResponse>(response);
  return data.candidates;
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
