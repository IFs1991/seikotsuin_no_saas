import type { Database } from '@/types/supabase';

export type AdminNotification =
  Database['public']['Tables']['notifications']['Row'];

export interface AdminNotificationsPayload {
  notifications: AdminNotification[];
  total: number;
  unreadCount: number;
}

export interface AdminNotificationsUpdatePayload {
  updatedIds: string[];
  updatedCount: number;
  unreadCount: number;
}

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  message?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

export function isAdminNotification(
  value: unknown
): value is AdminNotification {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    isNullableString(value.user_id) &&
    isNullableString(value.clinic_id) &&
    typeof value.title === 'string' &&
    typeof value.message === 'string' &&
    typeof value.type === 'string' &&
    typeof value.is_read === 'boolean' &&
    isNullableString(value.related_entity_type) &&
    isNullableString(value.related_entity_id) &&
    typeof value.created_at === 'string' &&
    isNullableString(value.read_at)
  );
}

export function isAdminNotificationsPayload(
  value: unknown
): value is AdminNotificationsPayload {
  if (!isRecord(value) || !Array.isArray(value.notifications)) {
    return false;
  }

  return (
    value.notifications.every(isAdminNotification) &&
    typeof value.total === 'number' &&
    typeof value.unreadCount === 'number'
  );
}

export function isApiSuccessEnvelope<T>(
  value: unknown,
  isData: (data: unknown) => data is T
): value is ApiSuccessEnvelope<T> {
  return (
    isRecord(value) &&
    value.success === true &&
    'data' in value &&
    isData(value.data)
  );
}
