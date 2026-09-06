import type {
  BillingEmailTemplateType,
  EmailProvider,
  PublicReservationCancelledPayload,
  PublicReservationReceivedPayload,
  ReservationEmailPayload,
} from './types';
import { renderReservationCreatedEmail } from './templates/reservation-created';
import { renderReservationConfirmedEmail } from './templates/reservation-confirmed';
import { renderReservationUpdatedEmail } from './templates/reservation-updated';
import { renderReservationCancelledEmail } from './templates/reservation-cancelled';
import { renderReminderDayBeforeEmail } from './templates/reminder-day-before';
import { renderReminderSameDayEmail } from './templates/reminder-same-day';
import { renderPublicReservationReceivedEmail } from './templates/public-reservation-received';
import { renderPublicReservationCancelledEmail } from './templates/public-reservation-cancelled';
import { renderBillingLifecycleEmail } from './templates/billing-lifecycle';
import type { SupabaseServerClient } from '@/lib/supabase';
import type { Database, Json } from '@/types/supabase';

/** retry 間隔 (分) */
const RETRY_DELAYS = [5, 15, 60];
const MAX_SEND_ATTEMPTS = RETRY_DELAYS.length + 1;
const CLAIM_LEASE_MS = 5 * 60 * 1000;
// Resend の保持期間（24時間）を越えた曖昧な送信は自動再送しない。
const IDEMPOTENCY_RECOVERY_WINDOW_MS = 23 * 60 * 60 * 1000;

type EmailSupabaseClient = Pick<SupabaseServerClient, 'from'>;
type EmailOutboxUpdate = Database['public']['Tables']['email_outbox']['Update'];
type EmailLogInsert = Database['public']['Tables']['email_logs']['Insert'];

export type ProcessorOptions = {
  batchSize?: number;
};

export type ProcessorResult = {
  processed: number;
  succeeded: number;
  failed: number;
};

function renderTemplate(
  templateType: string,
  payload: Json
): { subject: string; html: string; text: string } {
  switch (templateType) {
    case 'reservation_created':
      return renderReservationCreatedEmail(payload as ReservationEmailPayload);
    case 'reservation_confirmed':
      return renderReservationConfirmedEmail(
        payload as ReservationEmailPayload
      );
    case 'reservation_updated':
      return renderReservationUpdatedEmail(payload as ReservationEmailPayload);
    case 'reservation_cancelled':
      return renderReservationCancelledEmail(
        payload as ReservationEmailPayload
      );
    case 'reminder_day_before':
      return renderReminderDayBeforeEmail(payload as ReservationEmailPayload);
    case 'reminder_same_day':
      return renderReminderSameDayEmail(payload as ReservationEmailPayload);
    case 'public-reservation-received':
      return renderPublicReservationReceivedEmail(
        payload as PublicReservationReceivedPayload
      );
    case 'public-reservation-cancelled':
      return renderPublicReservationCancelledEmail(
        payload as PublicReservationCancelledPayload
      );
    case 'billing_payment_failed':
    case 'billing_payment_recovered':
    case 'billing_trial_will_end':
    case 'billing_access_locked':
      return renderBillingLifecycleEmail(
        templateType satisfies BillingEmailTemplateType,
        payload
      );
    default:
      throw new Error(`Unknown template type: ${templateType}`);
  }
}

function getNextAttemptAt(attempts: number): string {
  const delayMinutes = RETRY_DELAYS[attempts] ?? 60;
  const next = new Date(Date.now() + delayMinutes * 60 * 1000);
  return next.toISOString();
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function updateOutboxStatus(
  supabase: EmailSupabaseClient,
  jobId: string,
  expectedStatus: string,
  expectedUpdatedAt: string,
  values: EmailOutboxUpdate
): Promise<{
  applied: boolean;
  updatedAt: string | null;
  errorMessage: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from('email_outbox')
      .update(values)
      .eq('id', jobId)
      .eq('status', expectedStatus)
      .eq('updated_at', expectedUpdatedAt)
      .select('id, updated_at')
      .maybeSingle();

    if (error) {
      return {
        applied: false,
        updatedAt: null,
        errorMessage: getErrorMessage(error),
      };
    }

    return {
      applied: Boolean(data),
      updatedAt: data?.updated_at ?? null,
      errorMessage: null,
    };
  } catch (error) {
    return {
      applied: false,
      updatedAt: null,
      errorMessage: getErrorMessage(error),
    };
  }
}

async function insertEmailLog(
  supabase: EmailSupabaseClient,
  payload: EmailLogInsert
): Promise<{ ok: boolean; errorMessage: string | null }> {
  try {
    const { error } = await supabase.from('email_logs').insert(payload);
    if (error) {
      return { ok: false, errorMessage: getErrorMessage(error) };
    }
    return { ok: true, errorMessage: null };
  } catch (error) {
    return { ok: false, errorMessage: getErrorMessage(error) };
  }
}

function getFailureTransition(attempts: number): {
  attempts: number;
  nextAttemptAt: string;
  status: 'pending' | 'failed';
  retryable: boolean;
} {
  const retryable = attempts < MAX_SEND_ATTEMPTS;

  return {
    attempts,
    nextAttemptAt: retryable
      ? getNextAttemptAt(attempts - 1)
      : new Date().toISOString(),
    status: retryable ? 'pending' : 'failed',
    retryable,
  };
}

async function recoverExpiredClaims(
  supabase: EmailSupabaseClient,
  batchSize: number
): Promise<void> {
  const now = new Date();
  const { data: expired, error } = await supabase
    .from('email_outbox')
    .select('*')
    .eq('status', 'processing')
    .lte('updated_at', new Date(now.getTime() - CLAIM_LEASE_MS).toISOString())
    .order('updated_at', { ascending: true })
    .limit(batchSize);
  if (error || !expired)
    throw new Error(error?.message ?? 'Failed to read expired email claims');

  for (const job of expired) {
    const exhausted = job.attempts >= MAX_SEND_ATTEMPTS;
    const unsafeToReplay =
      Boolean(job.provider_message_id || job.sent_at) ||
      Date.parse(job.created_at) <=
        now.getTime() - IDEMPOTENCY_RECOVERY_WINDOW_MS;
    const recovered = await updateOutboxStatus(
      supabase,
      job.id,
      'processing',
      job.updated_at,
      {
        status: exhausted || unsafeToReplay ? 'failed' : 'pending',
        next_attempt_at: now.toISOString(),
        last_error: exhausted
          ? 'claim_lease_expired_max_attempts'
          : unsafeToReplay
            ? 'claim_lease_expired_manual_delivery_review'
            : 'claim_lease_expired',
      }
    );
    if (recovered.errorMessage)
      throw new Error(`Email claim recovery failed: ${recovered.errorMessage}`);
  }
}

/**
 * email_outbox の pending ジョブを取得し、テンプレート描画 → 送信 → ステータス更新を行う。
 */
export async function processEmailOutbox(
  supabase: EmailSupabaseClient,
  provider: EmailProvider,
  options: ProcessorOptions = {}
): Promise<ProcessorResult> {
  const batchSize = options.batchSize ?? 20;
  await recoverExpiredClaims(supabase, batchSize);

  // 1. pending jobs を取得
  const { data: jobs, error: fetchError } = await supabase
    .from('email_outbox')
    .select('*')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (fetchError || !jobs) {
    throw new Error(fetchError?.message ?? 'Failed to read pending email jobs');
  }

  let succeeded = 0;
  let failed = 0;

  for (const pendingJob of jobs) {
    let job = pendingJob;
    try {
      if (
        job.attempts >= MAX_SEND_ATTEMPTS ||
        (job.attempts > 0 &&
          Date.parse(job.created_at) <=
            Date.now() - IDEMPOTENCY_RECOVERY_WINDOW_MS)
      ) {
        const terminal = await updateOutboxStatus(
          supabase,
          job.id,
          'pending',
          job.updated_at,
          {
            status: 'failed',
            last_error:
              job.attempts >= MAX_SEND_ATTEMPTS
                ? 'max_send_attempts_exhausted'
                : 'idempotency_window_manual_delivery_review',
          }
        );
        if (terminal.errorMessage)
          console.error('Failed to persist exhausted email job', {
            jobId: job.id,
          });
        failed++;
        continue;
      }
      // 2. processing に更新
      const processingWrite = await updateOutboxStatus(
        supabase,
        job.id,
        'pending',
        job.updated_at,
        {
          status: 'processing',
          attempts: job.attempts + 1,
        }
      );
      if (!processingWrite.applied || !processingWrite.updatedAt) {
        if (processingWrite.errorMessage) {
          console.error('Failed to persist email_outbox processing state', {
            jobId: job.id,
            error: processingWrite.errorMessage,
          });
          failed++;
        }
        continue;
      }

      // DB が発行した revision を保存し、以後はこの所有権でのみ更新する。
      job = {
        ...job,
        attempts: job.attempts + 1,
        updated_at: processingWrite.updatedAt,
      };

      try {
        // テンプレート不正も送信失敗と同じ有限回の再試行へ戻す。
        const rendered = renderTemplate(job.template_type, job.payload);
        // 4. 送信
        const result = await provider.send({
          to: job.to_email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          from: job.from_email ?? undefined,
          idempotencyKey: job.resend_idempotency_key,
          tags: [{ name: 'template', value: job.template_type }],
        });

        const sentAt = new Date().toISOString();

        // 5. sent に更新
        const sentWrite = await updateOutboxStatus(
          supabase,
          job.id,
          'processing',
          job.updated_at,
          {
            status: 'sent',
            provider_message_id: result.messageId,
            sent_at: sentAt,
            attempts: job.attempts,
            last_error: null,
            next_attempt_at: sentAt,
          }
        );

        if (!sentWrite.applied) {
          console.error('Failed to persist sent state for email_outbox', {
            jobId: job.id,
            error: sentWrite.errorMessage ?? 'unknown error',
          });

          const terminalWrite = await updateOutboxStatus(
            supabase,
            job.id,
            'processing',
            job.updated_at,
            {
              status: 'failed',
              provider_message_id: result.messageId,
              sent_at: sentAt,
              attempts: job.attempts,
              last_error: `Sent message but failed to persist sent state: ${
                sentWrite.errorMessage ?? 'unknown error'
              }`,
              next_attempt_at: sentAt,
            }
          );

          if (!terminalWrite.applied && terminalWrite.errorMessage) {
            console.error(
              'Failed to persist terminal failure state after sent-state error',
              {
                jobId: job.id,
                error: terminalWrite.errorMessage,
              }
            );
          }

          const logResult = await insertEmailLog(supabase, {
            outbox_id: job.id,
            clinic_id: job.clinic_id,
            event_type: 'outbox_state_update_failed',
            provider: 'resend',
            provider_message_id: result.messageId,
            detail: {
              stage: 'sent',
              template_type: job.template_type,
              error: sentWrite.errorMessage ?? 'unknown error',
            },
          });

          if (!logResult.ok && logResult.errorMessage) {
            console.error('Failed to write email log after sent-state error', {
              jobId: job.id,
              error: logResult.errorMessage,
            });
          }

          failed++;
          continue;
        }

        // email_logs に記録
        const logResult = await insertEmailLog(supabase, {
          outbox_id: job.id,
          clinic_id: job.clinic_id,
          event_type: 'sent',
          provider: 'resend',
          provider_message_id: result.messageId,
          detail: { template_type: job.template_type },
        });

        if (!logResult.ok && logResult.errorMessage) {
          console.error('Failed to write email log for sent message', {
            jobId: job.id,
            error: logResult.errorMessage,
          });
        }

        succeeded++;
      } catch (err) {
        const errorMessage = getErrorMessage(err);
        const failureTransition = getFailureTransition(job.attempts);

        const failureWrite = await updateOutboxStatus(
          supabase,
          job.id,
          'processing',
          job.updated_at,
          {
            status: failureTransition.status,
            attempts: failureTransition.attempts,
            last_error: errorMessage,
            next_attempt_at: failureTransition.nextAttemptAt,
          }
        );

        if (!failureWrite.applied && failureWrite.errorMessage) {
          console.error('Failed to persist failed state for email_outbox', {
            jobId: job.id,
            error: failureWrite.errorMessage,
          });
        }

        const logResult = await insertEmailLog(supabase, {
          outbox_id: job.id,
          clinic_id: job.clinic_id,
          event_type: 'send_failed',
          provider: 'resend',
          detail: {
            error: errorMessage,
            attempts: failureTransition.attempts,
            retryable: failureTransition.retryable,
          },
        });

        if (!logResult.ok && logResult.errorMessage) {
          console.error('Failed to write email log for failed send', {
            jobId: job.id,
            error: logResult.errorMessage,
          });
        }

        failed++;
      }
    } catch (err) {
      console.error('Unexpected email processor error', {
        jobId: job.id,
        error: getErrorMessage(err),
      });
      failed++;
    }
  }

  return {
    processed: jobs.length,
    succeeded,
    failed,
  };
}
