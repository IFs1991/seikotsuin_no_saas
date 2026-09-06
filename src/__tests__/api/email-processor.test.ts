import { processEmailOutbox } from '@/lib/notifications/email/processor';
import type { EmailProvider } from '@/lib/notifications/email/types';

type MockJob = {
  id: string;
  clinic_id: string;
  template_type: string;
  resend_idempotency_key: string;
  to_email: string;
  payload: Record<string, unknown>;
  attempts: number;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled';
  next_attempt_at: string;
  from_email: string | null;
  provider_message_id: string | null;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

type MockSupabaseOptions = {
  failProcessingUpdateIds?: string[];
  failSentUpdateIds?: string[];
  failFailedUpdateIds?: string[];
  failLogInsert?: boolean;
};

function createMockProvider(
  overrides: Partial<EmailProvider> = {}
): EmailProvider {
  return {
    send: jest
      .fn()
      .mockResolvedValue({ provider: 'resend', messageId: 'msg-001' }),
    ...overrides,
  };
}

function createJob(overrides: Partial<MockJob>): MockJob {
  return {
    id: 'job-1',
    clinic_id: 'clinic-1',
    template_type: 'reservation_created',
    resend_idempotency_key: 'idmp-abc',
    to_email: 'test@example.com',
    payload: {
      customerName: '田中',
      clinicName: 'テスト院',
      startTime: '2026-04-15T10:00:00Z',
      endTime: '2026-04-15T11:00:00Z',
      staffName: '山田',
      menuName: '施術A',
    },
    attempts: 0,
    status: 'pending',
    next_attempt_at: new Date(Date.now() - 60_000).toISOString(),
    from_email: null,
    provider_message_id: null,
    last_error: null,
    sent_at: null,
    created_at: new Date(Date.now() - 60_000).toISOString(),
    updated_at: new Date(Date.now() - 60_000).toISOString(),
    ...overrides,
  };
}

function createMockSupabase(
  pendingJobs: MockJob[] = [],
  options: MockSupabaseOptions = {}
) {
  const jobs = pendingJobs;
  const logInsert = jest.fn().mockImplementation(async () => {
    if (options.failLogInsert) {
      return { data: null, error: { message: 'log insert failed' } };
    }
    return { data: { id: 'log-1' }, error: null };
  });

  const select = jest.fn().mockImplementation(() => {
    const filters: {
      status?: string;
      nextAttemptAt?: string;
      updatedAt?: string;
    } = {};

    return {
      eq(field: string, value: string) {
        if (field === 'status') {
          filters.status = value;
        }
        return this;
      },
      lte(field: string, value: string) {
        if (field === 'next_attempt_at') {
          filters.nextAttemptAt = value;
        }
        if (field === 'updated_at') filters.updatedAt = value;
        return this;
      },
      order() {
        return this;
      },
      limit: jest.fn().mockImplementation(async (batchSize: number) => {
        const data = jobs
          .filter(job => {
            if (filters.status && job.status !== filters.status) {
              return false;
            }
            if (
              filters.nextAttemptAt &&
              job.next_attempt_at > filters.nextAttemptAt
            ) {
              return false;
            }
            if (filters.updatedAt && job.updated_at > filters.updatedAt)
              return false;
            return true;
          })
          .slice(0, batchSize)
          .map(job => ({ ...job }));

        return { data, error: null };
      }),
    };
  });

  const update = jest
    .fn()
    .mockImplementation((values: Record<string, unknown>) => {
      const state: {
        jobId?: string;
        expectedStatus?: string;
        updatedAt?: string;
      } = {};

      return {
        eq(field: string, value: string) {
          if (field === 'id') {
            state.jobId = value;
          }
          if (field === 'status') {
            state.expectedStatus = value;
          }
          if (field === 'updated_at') state.updatedAt = value;
          return this;
        },
        select() {
          return this;
        },
        maybeSingle: jest.fn().mockImplementation(async () => {
          const job = jobs.find(candidate => candidate.id === state.jobId);
          if (
            !job ||
            (state.expectedStatus && job.status !== state.expectedStatus) ||
            (state.updatedAt && job.updated_at !== state.updatedAt)
          ) {
            return { data: null, error: null };
          }

          const nextStatus = values.status as MockJob['status'] | undefined;
          if (
            nextStatus === 'processing' &&
            options.failProcessingUpdateIds?.includes(job.id)
          ) {
            return {
              data: null,
              error: { message: 'processing update failed' },
            };
          }
          if (
            nextStatus === 'sent' &&
            options.failSentUpdateIds?.includes(job.id)
          ) {
            return { data: null, error: { message: 'sent update failed' } };
          }
          if (
            nextStatus === 'failed' &&
            options.failFailedUpdateIds?.includes(job.id)
          ) {
            return { data: null, error: { message: 'failed update failed' } };
          }

          Object.assign(job, values);
          job.updated_at = new Date(
            Math.max(Date.now(), Date.parse(job.updated_at) + 1)
          ).toISOString();
          return {
            data: { id: job.id, updated_at: job.updated_at },
            error: null,
          };
        }),
      };
    });

  const from = jest.fn().mockImplementation((table: string) => {
    if (table === 'email_logs') {
      return { insert: logInsert };
    }
    return { select, update };
  });

  return {
    from: from as Parameters<typeof processEmailOutbox>[0]['from'],
    _state: { jobs },
    _mocks: { select, update, logInsert },
  };
}

describe('processEmailOutbox', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('reclaims an expired processing lease and counts the new attempt', async () => {
    const job = createJob({
      status: 'processing',
      attempts: 1,
      updated_at: new Date(Date.now() - 6 * 60_000).toISOString(),
    });
    const provider = createMockProvider();
    const result = await processEmailOutbox(
      createMockSupabase([job]),
      provider
    );
    expect(result.succeeded).toBe(1);
    expect(job.status).toBe('sent');
    expect(job.attempts).toBe(2);
    expect(provider.send).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'idmp-abc' })
    );
  });

  it('leaves a fresh processing lease alone', async () => {
    const job = createJob({
      status: 'processing',
      attempts: 1,
      updated_at: new Date().toISOString(),
    });
    const provider = createMockProvider();
    await processEmailOutbox(createMockSupabase([job]), provider);
    expect(provider.send).not.toHaveBeenCalled();
    expect(job.status).toBe('processing');
  });

  it.each([
    { created_at: new Date(Date.now() - 24 * 60 * 60_000).toISOString() },
    { provider_message_id: 'provider-already-accepted' },
    { sent_at: new Date().toISOString() },
  ])(
    'requires delivery review instead of replaying an ambiguous expired lease: %j',
    async overrides => {
      const job = createJob({
        status: 'processing',
        attempts: 1,
        updated_at: new Date(Date.now() - 6 * 60_000).toISOString(),
        ...overrides,
      });
      const provider = createMockProvider();
      await processEmailOutbox(createMockSupabase([job]), provider);
      expect(provider.send).not.toHaveBeenCalled();
      expect(job.status).toBe('failed');
      expect(job.last_error).toBe('claim_lease_expired_manual_delivery_review');
    }
  );

  it('does not retry a pending attempted job after the provider idempotency window', async () => {
    const job = createJob({
      attempts: 1,
      created_at: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
    });
    const provider = createMockProvider();
    await processEmailOutbox(createMockSupabase([job]), provider);
    expect(provider.send).not.toHaveBeenCalled();
    expect(job.status).toBe('failed');
    expect(job.last_error).toBe('idempotency_window_manual_delivery_review');
  });

  it('reports a database read failure instead of claiming an empty successful batch', async () => {
    const supabase = createMockSupabase();
    supabase._mocks.select.mockReturnValue({
      eq: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest
        .fn()
        .mockResolvedValue({
          data: null,
          error: { message: 'database unavailable' },
        }),
    });
    await expect(
      processEmailOutbox(supabase, createMockProvider())
    ).rejects.toThrow('database unavailable');
  });

  it('terminally fails an expired lease after four claims without sending', async () => {
    const job = createJob({
      status: 'processing',
      attempts: 4,
      updated_at: new Date(Date.now() - 6 * 60_000).toISOString(),
    });
    const provider = createMockProvider();
    await processEmailOutbox(createMockSupabase([job]), provider);
    expect(provider.send).not.toHaveBeenCalled();
    expect(job.status).toBe('failed');
    expect(job.last_error).toBe('claim_lease_expired_max_attempts');
  });

  it('does not let an old worker complete a job owned by a newer lease', async () => {
    const job = createJob({});
    const provider = createMockProvider({
      send: jest.fn(async () => {
        job.updated_at = new Date(
          Date.parse(job.updated_at) + 1000
        ).toISOString();
        return { provider: 'resend', messageId: 'old-worker-message' };
      }),
    });
    const result = await processEmailOutbox(
      createMockSupabase([job]),
      provider
    );
    expect(result.succeeded).toBe(0);
    expect(job.status).toBe('processing');
    expect(job.provider_message_id).toBeNull();
  });

  it('returns malformed templates to bounded retry instead of leaving processing stuck', async () => {
    const job = createJob({ template_type: 'unknown_template' });
    const provider = createMockProvider();
    await processEmailOutbox(createMockSupabase([job]), provider);
    expect(provider.send).not.toHaveBeenCalled();
    expect(job.status).toBe('pending');
    expect(job.attempts).toBe(1);
    expect(job.last_error).toContain('Unknown template type');
  });

  it('retries failed jobs by returning them to pending until retry budget is exhausted', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-14T00:00:00.000Z'));

    const job = createJob({
      id: 'job-retry',
      attempts: 0,
      next_attempt_at: '2026-04-13T23:59:00.000Z',
    });

    const provider = createMockProvider({
      send: jest
        .fn()
        .mockRejectedValueOnce(new Error('API rate limit'))
        .mockResolvedValue({ provider: 'resend', messageId: 'msg-002' }),
    });
    const supabase = createMockSupabase([job]);

    const firstResult = await processEmailOutbox(supabase, provider);

    expect(firstResult.processed).toBe(1);
    expect(firstResult.succeeded).toBe(0);
    expect(firstResult.failed).toBe(1);
    expect(job.status).toBe('pending');
    expect(job.attempts).toBe(1);
    expect(job.last_error).toBe('API rate limit');
    expect(job.next_attempt_at).toBe('2026-04-14T00:05:00.000Z');

    jest.setSystemTime(new Date('2026-04-14T00:06:00.000Z'));

    const secondResult = await processEmailOutbox(supabase, provider);

    expect(secondResult.processed).toBe(1);
    expect(secondResult.succeeded).toBe(1);
    expect(secondResult.failed).toBe(0);
    expect(provider.send).toHaveBeenCalledTimes(2);
    expect(job.status).toBe('sent');
    expect(job.attempts).toBe(2);
    expect(job.provider_message_id).toBe('msg-002');
  });

  it('continues processing later jobs when sent-state persistence fails', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const job1 = createJob({ id: 'job-1' });
    const job2 = createJob({ id: 'job-2', resend_idempotency_key: 'idmp-def' });

    const provider = createMockProvider({
      send: jest
        .fn()
        .mockResolvedValueOnce({ provider: 'resend', messageId: 'msg-001' })
        .mockResolvedValueOnce({ provider: 'resend', messageId: 'msg-002' }),
    });
    const supabase = createMockSupabase([job1, job2], {
      failSentUpdateIds: ['job-1'],
    });

    const result = await processEmailOutbox(supabase, provider);

    expect(result.processed).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(provider.send).toHaveBeenCalledTimes(2);
    expect(job1.status).toBe('failed');
    expect(job1.provider_message_id).toBe('msg-001');
    expect(job1.attempts).toBe(1);
    expect(job2.status).toBe('sent');
    expect(consoleError).toHaveBeenCalled();
  });

  it('does not send a job when claiming processing state fails', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const job1 = createJob({ id: 'job-1' });
    const job2 = createJob({ id: 'job-2', resend_idempotency_key: 'idmp-def' });

    const provider = createMockProvider({
      send: jest
        .fn()
        .mockResolvedValue({ provider: 'resend', messageId: 'msg-002' }),
    });
    const supabase = createMockSupabase([job1, job2], {
      failProcessingUpdateIds: ['job-1'],
    });

    const result = await processEmailOutbox(supabase, provider);

    expect(result.processed).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(job1.status).toBe('pending');
    expect(job1.attempts).toBe(0);
    expect(job2.status).toBe('sent');
    expect(consoleError).toHaveBeenCalled();
  });

  it('continues processing later jobs when failed-state persistence fails', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const job1 = createJob({ id: 'job-1', attempts: 3 });
    const job2 = createJob({ id: 'job-2', resend_idempotency_key: 'idmp-def' });

    const provider = createMockProvider({
      send: jest
        .fn()
        .mockRejectedValueOnce(new Error('API rate limit'))
        .mockResolvedValueOnce({ provider: 'resend', messageId: 'msg-002' }),
    });
    const supabase = createMockSupabase([job1, job2], {
      failFailedUpdateIds: ['job-1'],
    });

    const result = await processEmailOutbox(supabase, provider);

    expect(result.processed).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(provider.send).toHaveBeenCalledTimes(2);
    expect(job1.status).toBe('processing');
    expect(job1.last_error).toBeNull();
    expect(job2.status).toBe('sent');
    expect(consoleError).toHaveBeenCalled();
  });

  it('returns zero counts when no pending jobs exist', async () => {
    const provider = createMockProvider();
    const supabase = createMockSupabase([]);

    const result = await processEmailOutbox(supabase, provider);

    expect(result.processed).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    expect(provider.send).not.toHaveBeenCalled();
  });
});
