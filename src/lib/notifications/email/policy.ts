import type { ReservationChange, EmailTemplateType } from './types';

/** 通知対象フィールド (notes 以外の業務的に意味のある変更) */
const NOTIFY_FIELDS: (keyof ReservationChange['before'])[] = [
  'start_time',
  'end_time',
  'staff_id',
  'status',
];

/**
 * 予約の変更差分から通知テンプレート種別を判定する。
 * - status -> cancelled なら reservation_cancelled
 * - status -> confirmed なら reservation_confirmed
 * - start_time / end_time / staff_id / status(非cancel) が変わったら reservation_updated
 * - notes のみ変更や差分なしは null (通知不要)
 */
export function determineNotificationType(
  change: ReservationChange
): EmailTemplateType | null {
  const { before, after } = change;

  // cancelled は最優先
  if (before.status !== 'cancelled' && after.status === 'cancelled') {
    return 'reservation_cancelled';
  }

  if (before.status !== 'confirmed' && after.status === 'confirmed') {
    return 'reservation_confirmed';
  }

  // 通知対象フィールドのいずれかが変更されたか
  const hasNotifiableChange = NOTIFY_FIELDS.some(
    field => before[field] !== after[field]
  );

  if (hasNotifiableChange) {
    return 'reservation_updated';
  }

  return null;
}

/** 有効な通知テンプレート種別 */
const VALID_TYPES: Set<string> = new Set<string>([
  'reservation_created',
  'reservation_confirmed',
  'reservation_updated',
  'reservation_cancelled',
  'reminder_day_before',
  'reminder_same_day',
  'public-reservation-received',
]);

/**
 * 指定されたテンプレート種別が通知対象かどうかを判定する。
 */
export function shouldNotify(templateType: EmailTemplateType): boolean {
  return VALID_TYPES.has(templateType);
}
