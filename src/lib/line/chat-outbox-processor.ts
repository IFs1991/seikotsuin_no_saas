import 'server-only';

import type { LineIntegrationClient } from '@/lib/line/integration-db';
import { getLineChannelAccessToken } from '@/lib/line/token-manager';
import { createLogger } from '@/lib/logger';

const LINE_PUSH_ENDPOINT = 'https://api.line.me/v2/bot/message/push';
const LINE_REQUEST_TIMEOUT_MS = 30_000;
const CLAIM_SIZE = 1;

type LineFetch = (input: string, init: RequestInit) => Promise<Response>;
type AccessTokenResolver = typeof getLineChannelAccessToken;

export type LineChatOutboxResult = {
  claimed: number;
  failed: number;
  retried: number;
  sent: number;
};

export type LineChatOutboxOptions = {
  accessTokenResolver?: AccessTokenResolver;
  fetcher?: LineFetch;
  now?: Date;
};

type ClaimedChatMessage = {
  claim_token: string;
  line_user_id: string;
  outbox_id: string;
  text_content: string;
};

type RenewedChatMessage = Pick<
  ClaimedChatMessage,
  'line_user_id' | 'text_content'
> & { credential_generation_id: string };

type PushResult =
  | { ok: true; lineMessageId: string }
  | { ok: false; errorCode: string };

const log = createLogger('LineChatOutboxProcessor');

export async function processLineChatOutbox(
  client: LineIntegrationClient,
  options: LineChatOutboxOptions = {}
): Promise<LineChatOutboxResult> {
  const result: LineChatOutboxResult = {
    claimed: 0,
    failed: 0,
    retried: 0,
    sent: 0,
  };
  const fetcher = options.fetcher ?? fetch;
  const tokenResolver =
    options.accessTokenResolver ?? getLineChannelAccessToken;
  const clinicIds = await listQueuedClinicIds(client);

  for (const clinicId of clinicIds) {
    const { data: claimed, error: claimError } = await client.rpc(
      'claim_line_chat_outbox',
      {
        p_clinic_id: clinicId,
        p_limit: CLAIM_SIZE,
      }
    );
    if (claimError) {
      log.warn('Failed to claim LINE chat outbox', {
        clinicId,
        errorCode: claimError.code,
      });
      continue;
    }

    const jobs: ClaimedChatMessage[] = claimed ?? [];
    result.claimed += jobs.length;
    if (jobs.length === 0) continue;

    for (const claimedJob of jobs) {
      const firstRenewal = await renewChatOutboxClaim(
        client,
        clinicId,
        claimedJob
      );
      if (!firstRenewal) {
        result.failed += 1;
        continue;
      }

      const token = await tokenResolver({
        clinicId,
        credentialGenerationId: firstRenewal.credential_generation_id,
        fetcher: createTimeoutFetcher(fetcher),
        now: options.now,
        supabase: client,
      });
      if (token.ok === false) {
        const terminal = await finalizeFailure(
          client,
          clinicId,
          claimedJob,
          `access_token_${token.reason}`
        );
        result[terminal ? 'failed' : 'retried'] += 1;
        continue;
      }

      const finalRenewal = await renewChatOutboxClaim(
        client,
        clinicId,
        claimedJob
      );
      if (!finalRenewal) {
        result.failed += 1;
        continue;
      }
      const job: ClaimedChatMessage = {
        ...claimedJob,
        line_user_id: finalRenewal.line_user_id,
        text_content: finalRenewal.text_content,
      };
      const push = await sendLineChatPush({
        accessToken: token.accessToken,
        fetcher,
        job,
      });
      if (push.ok === true) {
        await finalizeChatOutbox(client, {
          clinicId,
          errorCode: null,
          job,
          lineMessageId: push.lineMessageId,
          succeeded: true,
        });
        result.sent += 1;
      } else {
        const terminal = await finalizeFailure(
          client,
          clinicId,
          job,
          push.errorCode
        );
        result[terminal ? 'failed' : 'retried'] += 1;
      }
    }
  }

  return result;
}

async function renewChatOutboxClaim(
  client: LineIntegrationClient,
  clinicId: string,
  job: ClaimedChatMessage
): Promise<RenewedChatMessage | null> {
  const { data, error } = await client.rpc('renew_line_chat_outbox_claim', {
    p_claim_token: job.claim_token,
    p_clinic_id: clinicId,
    p_outbox_id: job.outbox_id,
  });
  if (error) throw error;
  return data?.[0] ?? null;
}

async function listQueuedClinicIds(
  client: LineIntegrationClient
): Promise<string[]> {
  const { data, error } = await client.rpc('list_line_chat_delivery_clinics', {
    p_limit: 100,
  });
  if (error) throw error;
  return (data ?? []).map(row => row.clinic_id);
}

export async function sendLineChatPush(params: {
  accessToken: string;
  fetcher: LineFetch;
  job: ClaimedChatMessage;
}): Promise<PushResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    LINE_REQUEST_TIMEOUT_MS
  );
  try {
    const response = await params.fetcher(LINE_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${params.accessToken}`,
        'content-type': 'application/json',
        'x-line-retry-key': params.job.outbox_id,
      },
      body: JSON.stringify({
        to: params.job.line_user_id,
        messages: [{ type: 'text', text: params.job.text_content }],
      }),
      signal: controller.signal,
    });

    if (response.status === 409) {
      const acceptedRequestId = response.headers.get(
        'x-line-accepted-request-id'
      );
      return acceptedRequestId
        ? { ok: true, lineMessageId: `accepted:${acceptedRequestId}` }
        : { ok: false, errorCode: 'http_409_without_accepted_request' };
    }
    if (!response.ok) {
      return { ok: false, errorCode: `http_${response.status}` };
    }

    const payload: unknown = await response.json().catch(() => null);
    const lineMessageId = readSentMessageId(payload);
    return lineMessageId
      ? { ok: true, lineMessageId }
      : { ok: false, errorCode: 'response_message_id_missing' };
  } catch (error) {
    return {
      ok: false,
      errorCode:
        error instanceof Error && error.name === 'AbortError'
          ? 'request_timeout'
          : 'request_failed',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function finalizeFailure(
  client: LineIntegrationClient,
  clinicId: string,
  job: ClaimedChatMessage,
  errorCode: string
): Promise<boolean> {
  await finalizeChatOutbox(client, {
    clinicId,
    errorCode,
    job,
    lineMessageId: null,
    succeeded: false,
  });
  const { data, error } = await client
    .from('line_chat_outbox')
    .select('status')
    .eq('id', job.outbox_id)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  if (error) throw error;
  return data?.status === 'failed';
}

async function finalizeChatOutbox(
  client: LineIntegrationClient,
  params: {
    clinicId: string;
    errorCode: string | null;
    job: ClaimedChatMessage;
    lineMessageId: string | null;
    succeeded: boolean;
  }
): Promise<void> {
  const { error } = await client.rpc('finalize_line_chat_outbox', {
    p_claim_token: params.job.claim_token,
    p_clinic_id: params.clinicId,
    p_error_code: params.errorCode,
    p_line_message_id: params.lineMessageId,
    p_outbox_id: params.job.outbox_id,
    p_succeeded: params.succeeded,
  });
  if (error) throw error;
}

function createTimeoutFetcher(fetcher: LineFetch): LineFetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      LINE_REQUEST_TIMEOUT_MS
    );
    try {
      return await fetcher(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  };
}

function readSentMessageId(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.sentMessages)) return null;
  const first = value.sentMessages[0];
  return isRecord(first) && typeof first.id === 'string' && first.id.length > 0
    ? first.id
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
