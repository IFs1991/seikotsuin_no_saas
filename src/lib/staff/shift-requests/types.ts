import type { Database, Json } from '@/types/supabase';

export const SHIFT_REQUEST_PERIOD_STATUSES = [
  'draft',
  'open',
  'closed',
  'finalized',
  'cancelled',
] as const;

export const SHIFT_REQUEST_TYPES = [
  'available',
  'preferred',
  'unavailable',
  'day_off',
] as const;

export const SHIFT_REQUEST_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'withdrawn',
  'converted',
] as const;

export const SHIFT_REQUEST_SUBMITTED_FOR_ROLES = [
  'clinic_admin',
  'therapist',
  'staff',
] as const;

export type ShiftRequestPeriodStatus =
  (typeof SHIFT_REQUEST_PERIOD_STATUSES)[number];
export type ShiftRequestType = (typeof SHIFT_REQUEST_TYPES)[number];
export type ShiftRequestStatus = (typeof SHIFT_REQUEST_STATUSES)[number];
export type ShiftRequestSubmittedForRole =
  (typeof SHIFT_REQUEST_SUBMITTED_FOR_ROLES)[number];

export type ShiftRequestPeriodRow =
  Database['public']['Tables']['shift_request_periods']['Row'];
export type ShiftRequestPeriodInsert =
  Database['public']['Tables']['shift_request_periods']['Insert'];
export type ShiftRequestPeriodUpdate =
  Database['public']['Tables']['shift_request_periods']['Update'];
export type ShiftRequestRow =
  Database['public']['Tables']['shift_requests']['Row'];
export type ShiftRequestInsert =
  Database['public']['Tables']['shift_requests']['Insert'];
export type ShiftRequestUpdate =
  Database['public']['Tables']['shift_requests']['Update'];
export type ShiftRequestAuditLogInsert =
  Database['public']['Tables']['shift_request_audit_logs']['Insert'];

export interface ShiftRequestAuditLogInput {
  clinicId: string;
  periodId?: string | null;
  requestId?: string | null;
  actorUserId: string;
  actorRole: string;
  action: string;
  beforeData?: Json | null;
  afterData?: Json | null;
}
