import { getLineChannelAccessToken } from '@/lib/line/token-manager';
import { createLogger } from '@/lib/logger';
import { enqueueEmail } from '@/lib/notifications/email/enqueue-email';
import type { EmailTemplateType } from '@/lib/notifications/email/types';
import type {
  LineEmailFallbackPayload,
  LineMessagePayload,
} from '@/lib/notifications/line-outbox';
import type { ReservationNotificationType } from '@/lib/notifications/reservation-notifications';
import type {
  LineIntegrationClient,
  LineNotificationOutboxRow,
  LineNotificationOutboxUpdate,
} from '@/lib/line/integration-db';
import type { Json } from '@/types/supabase';

const LINE_PUSH_ENDPOINT = 'https://api.line.me/v2/bot/message/push';
const MAX_LINE_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAYS_MS = [5 * 60 * 1000, 15 * 60 * 1000];
const TOKEN_RETRY_DELAY_MS = 15 * 60 * 1000;
const LINE_PUSH_TIMEOUT_MS = 30 * 1000;

type LineProcessorClient = LineIntegrationClient;
type LineOutboxRow = LineNotificationOutboxRow;
type LineOutboxUpdate = LineNotificationOutboxUpdate;
type LineFetch = (input: string, init: RequestInit) => Promise<Response>;
type AccessTokenResolver = typeof getLineChannelAccessToken;

export type ProcessLineOutboxOptions = {
  batchSize?: number;
  now?: Date;
  fetcher?: LineFetch;
  accessTokenResolver?: AccessTokenResolver;
};

export type ProcessLineOutboxResult = {
  processed: number;
  sent: number;
  retried: number;
  failed: number;
  fallbackEnqueued: number;
  skipped: number;
};

type LinePushResult =
  | { ok: true }
  | {
      ok: false;
      status: number;
      retryAfterSeconds: number | null;
      errorMessage: string;
    };

const log = createLogger('LineOutboxProcessor');

export async function processLineOutbox(
  supabase: LineProcessorClient,
  options: ProcessLineOutboxOptions = {}
): Promise<ProcessLineOutboxResult> {
  const now = options.now ?? new Date();
  const fetcher = options.fetcher ?? fetch;
  const accessTokenResolver =
    options.accessTokenResolver ?? getLineChannelAccessToken;
  const jobs = await fetchPendingLineJobs(
    supabase,
    now,
    options.batchSize ?? 20
  );

  const result: ProcessLineOutboxResult = {
    processed: jobs.length,
    sent: 0,
    retried: 0,
    failed: 0,
    fallbackEnqueued: 0,
    skipped: 0,
  };

  for (const job of jobs) {
    const claimed = await claimLineJob(supabase, job, now);
    if (!claimed) {
      result.skipped += 1;
      continue;
    }

    const claimToken = job.claim_token;
    if (!claimToken || !job.credential_generation_id || !job.customer_id) {
      result.skipped += 1;
      continue;
    }

    const payload = readLineMessagePayload(job.payload);
    if (!payload) {
      await updateLineJob(supabase, job, {
        status: 'failed',
        last_error: 'Invalid LINE message payload',
        next_attempt_at: now.toISOString(),
      });
      result.failed += 1;
      continue;
    }

    const token = await accessTokenResolver({
      supabase,
      clinicId: job.clinic_id,
      credentialGenerationId: job.credential_generation_id,
      now,
    });
    if (token.ok === false) {
      const failure = await handleLineDeliveryFailure(supabase, {
        job,
        payload,
        attempts: job.attempts,
        now,
        errorMessage: `line_access_token_unavailable:${token.reason}`,
        retryAfterSeconds: Math.ceil(TOKEN_RETRY_DELAY_MS / 1000),
      });
      result[resolveFailureResultKey(failure)] += 1;
      if (failure.fallbackEnqueued) {
        result.fallbackEnqueued += 1;
      }
      continue;
    }

    if (!(await renewLineJobClaim(supabase, job))) {
      result.skipped += 1;
      continue;
    }

    const pushResult = await sendLinePushMessage({
      fetcher,
      accessToken: token.accessToken,
      lineUserId: job.line_user_id,
      payload,
      retryKey: job.id,
      now,
    });

    if (pushResult.ok === true) {
      const sentAt = new Date().toISOString();
      await finalizeLineDelivery(supabase, {
        job,
        payload,
        status: 'sent',
        sentAt,
        lastError: null,
      });
      result.sent += 1;
      continue;
    }

    const failure = await handleLineDeliveryFailure(supabase, {
      job,
      payload,
      attempts: job.attempts,
      now,
      errorMessage: pushResult.errorMessage,
      retryAfterSeconds: pushResult.retryAfterSeconds,
    });
    result[resolveFailureResultKey(failure)] += 1;
    if (failure.fallbackEnqueued) {
      result.fallbackEnqueued += 1;
    }
  }

  return result;
}

export async function sendLinePushMessage(params: {
  fetcher: LineFetch;
  accessToken: string;
  lineUserId: string;
  payload: LineMessagePayload;
  retryKey: string;
  now: Date;
}): Promise<LinePushResult> {
  const body = {
    to: params.lineUserId,
    messages: [
      {
        type: 'text',
        text: params.payload.text,
      },
    ],
  };

  let response: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LINE_PUSH_TIMEOUT_MS);
  try {
    response = await params.fetcher(LINE_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${params.accessToken}`,
        'content-type': 'application/json',
        'x-line-retry-key': params.retryKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      retryAfterSeconds: null,
      errorMessage: `LINE push request failed: ${getErrorMessage(error)}`,
    };
  } finally {
    clearTimeout(timeoutId);
  }

  // LINE returns 409 when this retry key was already accepted. Treat it as
  // success so a worker restart finalizes the durable outbox without resending.
  if (response.ok || response.status === 409) {
    return { ok: true };
  }

  const retryAfterSeconds =
    response.status === 429
      ? parseRetryAfterSeconds(response.headers.get('retry-after'), params.now)
      : null;
  const responseText = await safeReadResponseText(response);
  return {
    ok: false,
    status: response.status,
    retryAfterSeconds,
    errorMessage: formatLinePushError(response.status, responseText),
  };
}

export function parseRetryAfterSeconds(
  value: string | null,
  now: Date
): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.ceil(seconds);
  }

  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) {
    return null;
  }

  const diffSeconds = Math.ceil((retryAt - now.getTime()) / 1000);
  return diffSeconds > 0 ? diffSeconds : null;
}

async function fetchPendingLineJobs(
  supabase: LineProcessorClient,
  now: Date,
  batchSize: number
): Promise<LineOutboxRow[]> {
  const { data, error } = await supabase
    .from('line_message_outbox')
    .select('*')
    .eq('status', 'pending')
    .lte('next_attempt_at', now.toISOString())
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (error) {
    log.warn('Failed to fetch pending LINE outbox jobs', {
      error: error.message,
    });
    return [];
  }

  return data ?? [];
}

async function claimLineJob(
  supabase: LineProcessorClient,
  job: LineOutboxRow,
  now: Date
): Promise<boolean> {
  const { data, error } = await supabase.rpc('claim_line_notification_outbox', {
    p_clinic_id: job.clinic_id,
    p_outbox_id: job.id,
    p_expected_attempts: job.attempts,
  });

  if (error) {
    log.warn('Failed to claim LINE outbox job', {
      jobId: job.id,
      error: error.message,
    });
    return false;
  }

  if (typeof data !== 'string' || data.length === 0) {
    return false;
  }

  job.claim_token = data;
  job.claimed_at = now.toISOString();
  job.attempts += 1;
  return true;
}

async function renewLineJobClaim(
  supabase: LineProcessorClient,
  job: LineOutboxRow
): Promise<boolean> {
  const { data, error } = await supabase.rpc('renew_line_notification_claim', {
    p_clinic_id: job.clinic_id,
    p_outbox_id: job.id,
    p_claim_token: inferRequiredString(job.claim_token, 'claim_token'),
  });

  if (error || data !== true) {
    log.warn('LINE outbox claim expired before delivery', {
      jobId: job.id,
      error: error?.message,
    });
    return false;
  }

  return true;
}

async function updateLineJob(
  supabase: LineProcessorClient,
  job: LineOutboxRow,
  update: LineOutboxUpdate
): Promise<void> {
  if (
    update.status !== 'pending' &&
    update.status !== 'sent' &&
    update.status !== 'failed'
  ) {
    throw new Error('Invalid LINE outbox final status');
  }

  const { error } = await supabase.rpc('finalize_line_notification_outbox', {
    p_clinic_id: job.clinic_id,
    p_outbox_id: job.id,
    p_claim_token: inferRequiredString(job.claim_token, 'claim_token'),
    p_status: update.status,
    p_sent_at: update.sent_at ?? new Date().toISOString(),
    p_last_error: update.last_error ?? '',
    p_next_attempt_at: inferRequiredString(
      update.next_attempt_at,
      'next_attempt_at'
    ),
  });

  if (error) {
    log.warn('Failed to update LINE outbox job', {
      jobId: job.id,
      error: error.message,
    });
    throw new Error(error.message);
  }
}

function inferRequiredString(
  value: string | null | undefined,
  fieldName: string
): string {
  if (!value) {
    throw new Error(`Missing LINE outbox ${fieldName}`);
  }
  return value;
}

type FailureOutcome =
  | { kind: 'retried'; fallbackEnqueued: false }
  | { kind: 'failed'; fallbackEnqueued: boolean };

async function handleLineDeliveryFailure(
  supabase: LineProcessorClient,
  params: {
    job: LineOutboxRow;
    payload: LineMessagePayload;
    attempts: number;
    now: Date;
    errorMessage: string;
    retryAfterSeconds: number | null;
  }
): Promise<FailureOutcome> {
  if (params.attempts >= MAX_LINE_ATTEMPTS) {
    await finalizeLineDelivery(supabase, {
      job: params.job,
      payload: params.payload,
      status: 'failed',
      sentAt: null,
      lastError: params.errorMessage,
    });
    const fallback = await enqueueEmailFallback(
      supabase,
      params.job,
      params.payload
    );
    return { kind: 'failed', fallbackEnqueued: fallback === 'enqueued' };
  }

  await updateLineJob(supabase, params.job, {
    status: 'pending',
    last_error: params.errorMessage,
    next_attempt_at: getNextAttemptAt(
      params.attempts,
      params.now,
      params.retryAfterSeconds
    ).toISOString(),
  });
  return { kind: 'retried', fallbackEnqueued: false };
}

function resolveFailureResultKey(
  outcome: FailureOutcome
): 'retried' | 'failed' {
  return outcome.kind;
}

function getNextAttemptAt(
  attempts: number,
  now: Date,
  retryAfterSeconds: number | null
): Date {
  if (retryAfterSeconds !== null) {
    return new Date(now.getTime() + retryAfterSeconds * 1000);
  }

  const delay = DEFAULT_RETRY_DELAYS_MS[attempts - 1] ?? 60 * 60 * 1000;
  return new Date(now.getTime() + delay);
}

async function enqueueEmailFallback(
  supabase: LineProcessorClient,
  job: LineOutboxRow,
  payload: LineMessagePayload
): Promise<'enqueued' | 'skipped'> {
  const fallback = payload.fallbackEmail;
  if (!fallback?.toEmail) {
    log.warn('LINE message exhausted retries without email fallback', {
      clinicId: job.clinic_id,
      jobId: job.id,
      messageType: job.message_type,
    });
    return 'skipped';
  }

  const outbox = await enqueueEmail(
    supabase,
    {
      clinicId: fallback.clinicId,
      reservationId: fallback.reservationId,
      customerId: fallback.customerId,
      templateType: fallback.templateType,
      toEmail: fallback.toEmail,
      payload: fallback.payload,
    },
    fallback.dedupeTimestamp,
    { ignoreDuplicate: true }
  );

  await updateReservationNotificationFallbackDetail(supabase, {
    reservationId: fallback.reservationId,
    notificationType: fallback.notificationType,
    lineOutboxId: job.id,
    emailOutboxId: outbox?.id ?? null,
  });

  return 'enqueued';
}

async function updateReservationNotificationFallbackDetail(
  supabase: LineProcessorClient,
  params: {
    reservationId: string;
    notificationType: ReservationNotificationType;
    lineOutboxId: string;
    emailOutboxId: string | null;
  }
): Promise<void> {
  const { error } = await supabase
    .from('reservation_notifications')
    .update({
      status: 'enqueued',
      detail: {
        line_outbox_id: params.lineOutboxId,
        fallback_channel: 'email',
        email_outbox_id: params.emailOutboxId,
      },
    })
    .eq('reservation_id', params.reservationId)
    .eq('notification_type', params.notificationType);

  if (error) {
    log.warn('Failed to update notification fallback detail', {
      reservationId: params.reservationId,
      notificationType: params.notificationType,
      error: error.message,
    });
  }
}

function readLineMessagePayload(value: Json): LineMessagePayload | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.text !== 'string' || value.text.trim().length === 0) {
    return null;
  }

  const fallbackEmail = readLineEmailFallback(value.fallbackEmail);
  const outreach = readOutreachPayload(value.outreach);
  const availability = readAvailabilityPayload(value.availability);

  return {
    text: value.text,
    ...(typeof value.confirmationUrl === 'string'
      ? { confirmationUrl: value.confirmationUrl }
      : {}),
    ...(fallbackEmail ? { fallbackEmail } : {}),
    ...(outreach ? { outreach } : {}),
    ...(availability ? { availability } : {}),
  };
}

function readAvailabilityPayload(
  value: unknown
): LineMessagePayload['availability'] | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.eventId !== 'string' ||
    typeof value.notificationId !== 'string' ||
    typeof value.customerId !== 'string'
  ) {
    return undefined;
  }
  return {
    eventId: value.eventId,
    notificationId: value.notificationId,
    customerId: value.customerId,
  };
}

async function finalizeLineDelivery(
  supabase: LineProcessorClient,
  params: {
    job: LineOutboxRow;
    payload: LineMessagePayload;
    status: 'sent' | 'failed';
    sentAt: string | null;
    lastError: string | null;
  }
): Promise<void> {
  const completedAt = params.sentAt ?? new Date().toISOString();
  await updateLineJob(supabase, params.job, {
    status: params.status,
    sent_at: params.status === 'sent' ? completedAt : null,
    last_error: params.status === 'failed' ? params.lastError : null,
    next_attempt_at: completedAt,
  });
}

function readOutreachPayload(
  value: unknown
): LineMessagePayload['outreach'] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    typeof value.campaignId !== 'string' ||
    typeof value.recipientId !== 'string' ||
    typeof value.customerId !== 'string'
  ) {
    return undefined;
  }

  return {
    campaignId: value.campaignId,
    recipientId: value.recipientId,
    customerId: value.customerId,
  };
}

function readLineEmailFallback(
  value: unknown
): LineEmailFallbackPayload | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    typeof value.clinicId !== 'string' ||
    typeof value.reservationId !== 'string' ||
    typeof value.customerId !== 'string' ||
    typeof value.toEmail !== 'string' ||
    typeof value.dedupeTimestamp !== 'string' ||
    !isReservationNotificationType(value.notificationType) ||
    !isEmailTemplateType(value.templateType) ||
    !isJsonValue(value.payload)
  ) {
    return undefined;
  }

  return {
    clinicId: value.clinicId,
    reservationId: value.reservationId,
    customerId: value.customerId,
    toEmail: value.toEmail,
    notificationType: value.notificationType,
    templateType: value.templateType,
    payload: value.payload,
    dedupeTimestamp: value.dedupeTimestamp,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is Json {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (isRecord(value)) {
    return Object.values(value).every(
      item => item === undefined || isJsonValue(item)
    );
  }

  return false;
}

const RESERVATION_NOTIFICATION_TYPES = [
  'received',
  'confirmed',
  'cancelled',
  'reminder_day_before',
  'reminder_same_day',
] as const;

function isReservationNotificationType(
  value: unknown
): value is ReservationNotificationType {
  return (
    typeof value === 'string' &&
    RESERVATION_NOTIFICATION_TYPES.some(item => item === value)
  );
}

const EMAIL_TEMPLATE_TYPES = [
  'reservation_created',
  'reservation_confirmed',
  'reservation_updated',
  'reservation_cancelled',
  'reminder_day_before',
  'reminder_same_day',
  'public-reservation-received',
  'public-reservation-cancelled',
] as const;

function isEmailTemplateType(value: unknown): value is EmailTemplateType {
  return (
    typeof value === 'string' &&
    EMAIL_TEMPLATE_TYPES.some(item => item === value)
  );
}

async function safeReadResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatLinePushError(status: number, responseText: string): string {
  const sanitized = responseText.trim().slice(0, 200);
  return sanitized
    ? `LINE push failed with status ${status}: ${sanitized}`
    : `LINE push failed with status ${status}`;
}
