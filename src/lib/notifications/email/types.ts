// =================================================================
// メール通知基盤 - 型定義
// =================================================================

import type { Json } from '@/types/supabase';

/** 送信テンプレート種別 */
export type EmailTemplateType =
  | 'reservation_created'
  | 'reservation_confirmed'
  | 'reservation_updated'
  | 'reservation_cancelled'
  | 'reminder_day_before'
  | 'reminder_same_day'
  | 'public-reservation-received'
  | BillingEmailTemplateType;

export type BillingEmailTemplateType =
  | 'billing_payment_failed'
  | 'billing_payment_recovered'
  | 'billing_trial_will_end'
  | 'billing_access_locked';

/** outbox ステータス */
export type EmailOutboxStatus =
  | 'pending'
  | 'processing'
  | 'sent'
  | 'failed'
  | 'cancelled';

/** メール送信入力 */
export type SendEmailInput = {
  from?: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
  idempotencyKey?: string;
};

/** メール送信結果 */
export type SendEmailResult = {
  provider: 'resend';
  messageId: string;
};

/** Provider 抽象インターフェース */
export interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

/** outbox レコード */
export type EmailOutboxRecord = {
  id: string;
  clinic_id: string;
  reservation_id: string | null;
  customer_id: string | null;
  template_type: EmailTemplateType;
  dedupe_key: string;
  resend_idempotency_key: string;
  to_email: string;
  from_email: string | null;
  subject: string | null;
  payload: Record<string, unknown>;
  status: EmailOutboxStatus;
  attempts: number;
  provider: string;
  provider_message_id: string | null;
  next_attempt_at: string;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

/** enqueue 入力 */
export type EnqueueEmailInput = {
  clinicId: string;
  reservationId?: string;
  customerId?: string;
  templateType: EmailTemplateType;
  toEmail: string;
  payload: Json;
};

/** 通知ポリシー判定用の予約差分 */
export type ReservationChange = {
  before: ReservationSnapshot;
  after: ReservationSnapshot;
};

/** 予約スナップショット */
export type ReservationSnapshot = {
  id: string;
  clinic_id: string;
  customer_id: string;
  menu_id?: string | null;
  status: string;
  start_time: string;
  end_time: string;
  staff_id: string;
  notes?: string | null;
};

/** テンプレート描画に渡すペイロード */
export type ReservationEmailPayload = {
  customerName: string;
  clinicName: string;
  startTime: string;
  endTime: string;
  staffName: string;
  menuName: string;
  myPageUrl?: string;
  /** updated テンプレート用 */
  changes?: {
    field: string;
    before: string;
    after: string;
  }[];
};

export type PublicReservationReceivedPayload = ReservationEmailPayload & {
  channel: string;
  intakeSummary: string[];
};

export type BillingEmailPayload = {
  clinicName: string;
  billingState?: string;
  graceUntil?: string | null;
  trialEnd?: string | null;
  currentPeriodEnd?: string | null;
};

/** Webhook イベント種別 */
export type ResendWebhookEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.complained'
  | 'email.bounced'
  | 'email.opened'
  | 'email.clicked';
