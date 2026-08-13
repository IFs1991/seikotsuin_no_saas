import {
  parseRetryAfterSeconds,
  processLineOutbox,
  type ProcessLineOutboxOptions,
} from '@/lib/notifications/line-processor';
import type { LineNotificationOutboxRow } from '@/lib/line/integration-db';
import type { Json } from '@/types/supabase';

type LineProcessorClient = Parameters<typeof processLineOutbox>[0];
type LineOutboxRow = LineNotificationOutboxRow;

const NOW = new Date('2026-07-05T00:00:00.000Z');

function createLineJob(overrides: Partial<LineOutboxRow> = {}): LineOutboxRow {
  return {
    id: 'line-job-001',
    claimed_at: null,
    claim_token: null,
    clinic_id: 'clinic-001',
    credential_generation_id: 'generation-001',
    customer_id: 'customer-001',
    line_user_id: 'U1234567890',
    message_type: 'received',
    payload: {
      text: '予約を受け付けました。\n確認URL: https://example.com/booking/clinic-001',
      fallbackEmail: {
        clinicId: 'clinic-001',
        reservationId: 'reservation-001',
        customerId: 'customer-001',
        toEmail: 'patient@example.com',
        notificationType: 'received',
        templateType: 'reservation_created',
        payload: {
          customerName: '田中太郎',
          clinicName: 'テスト整骨院',
          startTime: '2026-07-10T01:00:00.000Z',
          endTime: '2026-07-10T02:00:00.000Z',
          staffName: '山田先生',
          menuName: '標準施術',
        },
        dedupeTimestamp: '2026-07-05T00:00:00.000Z',
      },
    } satisfies Json,
    status: 'pending',
    attempts: 0,
    last_error: null,
    next_attempt_at: NOW.toISOString(),
    created_at: NOW.toISOString(),
    sent_at: null,
    ...overrides,
  };
}

function createProcessorClient(jobs: LineOutboxRow[]) {
  const lineUpdates: Json[] = [];
  const rpc = jest.fn((name: string, args: Record<string, unknown>) => {
    if (name === 'claim_line_notification_outbox') {
      return Promise.resolve({ data: 'claim-token-001', error: null });
    }
    if (name === 'renew_line_notification_claim') {
      return Promise.resolve({ data: true, error: null });
    }
    if (name === 'finalize_line_notification_outbox') {
      lineUpdates.push(args as Json);
      return Promise.resolve({ data: null, error: null });
    }
    return Promise.resolve({
      data: null,
      error: { message: 'unexpected rpc' },
    });
  });
  const emailInsert = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      single: jest.fn().mockResolvedValue({
        data: { id: 'email-outbox-001' },
        error: null,
      }),
    }),
  });
  const notificationUpdate = jest.fn((value: Json) => {
    const secondEq = jest.fn().mockResolvedValue({ error: null });
    return {
      eq: jest.fn().mockReturnValue({ eq: secondEq }),
    };
  });
  const fetchQuery = {
    eq: jest.fn(() => fetchQuery),
    lte: jest.fn(() => fetchQuery),
    order: jest.fn(() => fetchQuery),
    limit: jest.fn().mockResolvedValue({ data: jobs, error: null }),
  };
  const from = jest.fn((table: string) => {
    if (table === 'line_message_outbox') {
      return {
        select: jest.fn().mockReturnValue(fetchQuery),
      };
    }
    if (table === 'email_outbox') {
      return { insert: emailInsert };
    }
    if (table === 'reservation_notifications') {
      return { update: notificationUpdate };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    client: {
      from: from as LineProcessorClient['from'],
      rpc: rpc as LineProcessorClient['rpc'],
    },
    rpc,
    lineUpdates,
    emailInsert,
    notificationUpdate,
  };
}

function createAccessTokenResolver(): NonNullable<
  ProcessLineOutboxOptions['accessTokenResolver']
> {
  return jest.fn(async () => ({
    ok: true,
    accessToken: 'line-access-token',
    expiresAt: '2026-08-01T00:00:00.000Z',
    refreshed: false,
  }));
}

function createUnavailableAccessTokenResolver(): NonNullable<
  ProcessLineOutboxOptions['accessTokenResolver']
> {
  return jest.fn(async () => ({
    ok: false,
    reason: 'token_issue_failed',
  }));
}

describe('LINE outbox processor', () => {
  it('sends pending LINE push jobs and marks them sent', async () => {
    const fixture = createProcessorClient([createLineJob()]);
    const fetcher = jest.fn(async (_input: string, _init: RequestInit) =>
      Promise.resolve(new Response('', { status: 200 }))
    );

    const result = await processLineOutbox(fixture.client, {
      now: NOW,
      fetcher,
      accessTokenResolver: createAccessTokenResolver(),
    });

    expect(result).toEqual({
      processed: 1,
      sent: 1,
      retried: 0,
      failed: 0,
      fallbackEnqueued: 0,
      skipped: 0,
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.line.me/v2/bot/message/push',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer line-access-token',
          'content-type': 'application/json',
          'x-line-retry-key': 'line-job-001',
        }),
        signal: expect.any(AbortSignal),
      })
    );
    expect(fixture.lineUpdates).toEqual(
      expect.arrayContaining([expect.objectContaining({ p_status: 'sent' })])
    );
  });

  it('空き枠通知もclaim token付きの共通RPCで原子的に更新する', async () => {
    const fixture = createProcessorClient([
      createLineJob({
        message_type: 'staff_availability',
        payload: {
          text: '空き枠のお知らせ',
          availability: {
            eventId: 'event-001',
            notificationId: 'notification-001',
            customerId: 'customer-001',
          },
        },
      }),
    ]);
    await processLineOutbox(fixture.client, {
      now: NOW,
      fetcher: jest.fn(async () => new Response('', { status: 200 })),
      accessTokenResolver: createAccessTokenResolver(),
    });

    expect(fixture.rpc).toHaveBeenCalledWith(
      'finalize_line_notification_outbox',
      expect.objectContaining({
        p_clinic_id: 'clinic-001',
        p_outbox_id: 'line-job-001',
        p_claim_token: 'claim-token-001',
        p_status: 'sent',
      })
    );
  });

  it('finalizes outreach success through the atomic delivery RPC', async () => {
    const fixture = createProcessorClient([
      createLineJob({
        message_type: 'outreach',
        payload: {
          text: '休眠 太郎さん、ご予約をお待ちしています。',
          confirmationUrl:
            'https://example.com/booking/clinic-001?c=campaign-001',
          outreach: {
            campaignId: 'campaign-001',
            recipientId: 'recipient-001',
            customerId: 'customer-001',
          },
        } satisfies Json,
      }),
    ]);
    const fetcher = jest.fn(async (_input: string, _init: RequestInit) =>
      Promise.resolve(new Response('', { status: 200 }))
    );

    const result = await processLineOutbox(fixture.client, {
      now: NOW,
      fetcher,
      accessTokenResolver: createAccessTokenResolver(),
    });

    expect(result.sent).toBe(1);
    expect(fixture.rpc).toHaveBeenCalledWith(
      'finalize_line_notification_outbox',
      expect.objectContaining({
        p_status: 'sent',
        p_sent_at: expect.any(String),
      })
    );
  });

  it('keeps failed jobs pending until max attempts', async () => {
    const fixture = createProcessorClient([createLineJob()]);
    const fetcher = jest.fn(async (_input: string, _init: RequestInit) =>
      Promise.resolve(new Response('server error', { status: 500 }))
    );

    const result = await processLineOutbox(fixture.client, {
      now: NOW,
      fetcher,
      accessTokenResolver: createAccessTokenResolver(),
    });

    expect(result.retried).toBe(1);
    expect(fixture.lineUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          p_status: 'pending',
          p_last_error: expect.stringContaining('status 500'),
          p_next_attempt_at: '2026-07-05T00:05:00.000Z',
        }),
      ])
    );
    expect(fixture.emailInsert).not.toHaveBeenCalled();
  });

  it('retries rejected LINE push requests through the normal failure path', async () => {
    const fixture = createProcessorClient([createLineJob()]);
    const fetcher = jest.fn(async (_input: string, _init: RequestInit) => {
      throw new Error('network down');
    });

    const result = await processLineOutbox(fixture.client, {
      now: NOW,
      fetcher,
      accessTokenResolver: createAccessTokenResolver(),
    });

    expect(result.retried).toBe(1);
    expect(fixture.lineUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          p_status: 'pending',
          p_last_error: 'LINE push request failed: network down',
          p_next_attempt_at: '2026-07-05T00:05:00.000Z',
        }),
      ])
    );
  });

  it('respects Retry-After for 429 responses', async () => {
    const fixture = createProcessorClient([createLineJob()]);
    const fetcher = jest.fn(async (_input: string, _init: RequestInit) =>
      Promise.resolve(
        new Response('rate limited', {
          status: 429,
          headers: { 'Retry-After': '120' },
        })
      )
    );

    await processLineOutbox(fixture.client, {
      now: NOW,
      fetcher,
      accessTokenResolver: createAccessTokenResolver(),
    });

    expect(fixture.lineUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          p_status: 'pending',
          p_next_attempt_at: '2026-07-05T00:02:00.000Z',
        }),
      ])
    );
  });

  it('falls back to email after the third LINE failure', async () => {
    const fixture = createProcessorClient([createLineJob({ attempts: 2 })]);
    const fetcher = jest.fn(async (_input: string, _init: RequestInit) =>
      Promise.resolve(new Response('server error', { status: 500 }))
    );

    const result = await processLineOutbox(fixture.client, {
      now: NOW,
      fetcher,
      accessTokenResolver: createAccessTokenResolver(),
    });

    expect(result.failed).toBe(1);
    expect(result.fallbackEnqueued).toBe(1);
    expect(fixture.lineUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          p_status: 'failed',
          p_last_error: expect.stringContaining('status 500'),
        }),
      ])
    );
    expect(fixture.emailInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        clinic_id: 'clinic-001',
        reservation_id: 'reservation-001',
        customer_id: 'customer-001',
        template_type: 'reservation_created',
        to_email: 'patient@example.com',
        status: 'pending',
      })
    );
    expect(fixture.notificationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'enqueued',
        detail: expect.objectContaining({
          fallback_channel: 'email',
          line_outbox_id: 'line-job-001',
        }),
      })
    );
  });

  it('finalizes outreach terminal failure through the atomic delivery RPC', async () => {
    const fixture = createProcessorClient([
      createLineJob({
        attempts: 2,
        message_type: 'outreach',
        payload: {
          text: '休眠 太郎さん、ご予約をお待ちしています。',
          outreach: {
            campaignId: 'campaign-001',
            recipientId: 'recipient-001',
            customerId: 'customer-001',
          },
        } satisfies Json,
      }),
    ]);
    const fetcher = jest.fn(async (_input: string, _init: RequestInit) =>
      Promise.resolve(new Response('server error', { status: 500 }))
    );

    const result = await processLineOutbox(fixture.client, {
      now: NOW,
      fetcher,
      accessTokenResolver: createAccessTokenResolver(),
    });

    expect(result.failed).toBe(1);
    expect(fixture.rpc).toHaveBeenCalledWith(
      'finalize_line_notification_outbox',
      expect.objectContaining({
        p_status: 'failed',
      })
    );
  });

  it('falls back to email after repeated token-manager failures', async () => {
    const fixture = createProcessorClient([createLineJob({ attempts: 2 })]);
    const fetcher = jest.fn();

    const result = await processLineOutbox(fixture.client, {
      now: NOW,
      fetcher,
      accessTokenResolver: createUnavailableAccessTokenResolver(),
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
    expect(result.fallbackEnqueued).toBe(1);
    expect(fixture.lineUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          p_status: 'failed',
          p_last_error: 'line_access_token_unavailable:token_issue_failed',
        }),
      ])
    );
    expect(fixture.emailInsert).toHaveBeenCalledTimes(1);
  });

  it('parses HTTP-date Retry-After values', () => {
    const retryAt = new Date(NOW.getTime() + 90_000).toUTCString();
    expect(parseRetryAfterSeconds(retryAt, NOW)).toBe(90);
  });
});
