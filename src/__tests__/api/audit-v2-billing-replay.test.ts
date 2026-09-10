import { NextRequest, NextResponse } from 'next/server';
import { POST } from '@/app/api/internal/billing/replay-webhook-event/route';
import { createAdminClient } from '@/lib/supabase';
import { claimStripeWebhookEvent } from '@/lib/billing/stripe-events';
import type { Database } from '@/types/supabase';

type EventRow = Database['public']['Tables']['stripe_webhook_events']['Row'];
type EventStatus = EventRow['processing_status'];
let mockStatus: EventStatus;
let mockAuthorized: boolean;
let mockMissing: boolean;
let mockClaimError: boolean;
let mockLoseClaim: boolean;
let mockPayload: EventRow['payload'];
const mockAudit = jest.fn();
const mockProcess = jest.fn();
const mockRequests: { method: string; url: URL; body: unknown }[] = [];

async function mockFetch(input: RequestInfo | URL, init?: RequestInit) {
  const request = new Request(input, init);
  const method = request.method;
  const url = new URL(request.url);
  const body: unknown = method === 'PATCH' ? await request.json() : null;
  mockRequests.push({ method, url, body });
  if (method === 'POST') {
    return Response.json(
      { code: '23505', message: 'duplicate' },
      { status: 409 }
    );
  }
  if (method === 'GET') {
    return Response.json(
      mockMissing
        ? null
        : {
            stripe_event_id: 'evt_replay',
            event_type: 'test.event',
            payload: mockPayload,
            processing_status: mockStatus,
            retryable: false,
          }
    );
  }
  if (method !== 'PATCH') throw new Error(`Unexpected request ${method}`);
  if (
    typeof body !== 'object' ||
    body === null ||
    !('processing_status' in body)
  )
    throw new Error('Expected status update');
  if (body.processing_status === 'processing') {
    if (mockClaimError)
      return Response.json({ message: 'claim unavailable' }, { status: 503 });
    if (mockLoseClaim) mockStatus = 'processing';
    const expected = url.searchParams.get('processing_status');
    if (expected !== `eq.${mockStatus}`) return Response.json(null);
    mockStatus = 'processing';
    return Response.json({ stripe_event_id: 'evt_replay' });
  }
  if (typeof body.processing_status === 'string') {
    mockStatus = body.processing_status;
  }
  return new Response(null, { status: 204 });
}

jest.mock('@/lib/supabase', () => ({
  createAdminClient: () => {
    const { createClient } = jest.requireActual<
      typeof import('@supabase/supabase-js')
    >('@supabase/supabase-js');
    return createClient<Database>('http://localhost:1', 'test', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: mockFetch },
    });
  },
}));
jest.mock('@/lib/billing/internal-auth', () => ({
  requireBillingInternalRequest: () =>
    mockAuthorized
      ? {
          success: true,
          actor: { internalActor: 'replay-test', requestId: 'r1' },
        }
      : { success: false, response: NextResponse.json({}, { status: 401 }) },
}));
jest.mock('@/lib/billing/audit', () => ({
  writeBillingAuditLog: (...args: unknown[]) => mockAudit(...args),
}));
jest.mock('@/lib/billing/stripe-events', () => ({
  ...jest.requireActual<typeof import('@/lib/billing/stripe-events')>(
    '@/lib/billing/stripe-events'
  ),
  processStripeEvent: (...args: unknown[]) => mockProcess(...args),
}));

function replay(force = false) {
  return POST(
    new NextRequest(
      'http://localhost/api/internal/billing/replay-webhook-event',
      {
        method: 'POST',
        body: JSON.stringify({
          stripe_event_id: 'evt_replay',
          force_processed: force,
        }),
      }
    )
  );
}

describe('AUDIT-V2 F18 internal replay claims before processing', () => {
  beforeEach(() => {
    mockStatus = 'failed';
    mockAuthorized = true;
    mockMissing = false;
    mockClaimError = false;
    mockLoseClaim = false;
    mockPayload = {
      id: 'evt_replay',
      type: 'test.event',
      created: 1,
      livemode: false,
      data: { object: {} },
    };
    mockRequests.length = 0;
    mockAudit.mockReset().mockResolvedValue(undefined);
    mockProcess.mockReset().mockResolvedValue('ignored');
  });

  it.each([false, true])('does not steal processing, force=%s', async force => {
    mockStatus = 'processing';
    expect((await replay(force)).status).toBe(409);
    expect(mockProcess).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
    expect(mockRequests.filter(r => r.method === 'PATCH')).toHaveLength(0);
  });

  it.each(['received', 'failed', 'ignored', 'processed'])(
    'claims %s by event ID and previous status before audit and processing',
    async status => {
      mockStatus = status;
      mockAudit.mockImplementation(async () => {
        expect(mockStatus).toBe('processing');
      });
      expect((await replay(status === 'processed')).status).toBe(200);
      const claim = mockRequests.find(r => r.method === 'PATCH');
      expect(claim?.url.searchParams.get('stripe_event_id')).toBe(
        'eq.evt_replay'
      );
      expect(claim?.url.searchParams.get('processing_status')).toBe(
        `eq.${status}`
      );
      expect(mockProcess).toHaveBeenCalledTimes(1);
      expect(mockStatus).toBe('ignored');
    }
  );

  it('preserves the explicit processed replay opt-in', async () => {
    mockStatus = 'processed';
    expect((await replay()).status).toBe(409);
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it('rejects a claim lost to another webhook or replay after the read', async () => {
    mockLoseClaim = true;
    expect((await replay()).status).toBe(409);
    expect(mockProcess).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
    expect(mockStatus).toBe('processing');
  });

  it('keeps another replay and a normal duplicate webhook out while work runs', async () => {
    let signalStarted: () => void = () => {};
    const started = new Promise<void>(resolve => {
      signalStarted = resolve;
    });
    let finish: (status: string) => void = () => {};
    const work = new Promise<string>(resolve => {
      finish = resolve;
    });
    mockProcess.mockImplementation(() => {
      signalStarted();
      return work;
    });
    const first = replay();
    await started;
    try {
      expect((await replay(true)).status).toBe(409);
      const normal = await claimStripeWebhookEvent({
        client: createAdminClient(),
        event: {
          id: 'evt_replay',
          type: 'test.event',
          created: 1,
          livemode: false,
          data: { object: {} },
        },
        payload: mockPayload,
      });
      expect(normal).toEqual({
        status: 'busy',
        processingStatus: 'processing',
      });
      expect(mockProcess).toHaveBeenCalledTimes(1);
    } finally {
      finish('ignored');
      await first;
    }
    expect(mockStatus).toBe('ignored');
  });

  it('does not process or mark another owner failed on a claim DB error', async () => {
    mockClaimError = true;
    await expect(replay()).rejects.toMatchObject({
      message: 'claim unavailable',
    });
    expect(mockProcess).not.toHaveBeenCalled();
    expect(mockRequests.filter(r => r.method === 'PATCH')).toHaveLength(1);
  });

  it('records a failed claim owner when audit fails, without processing', async () => {
    mockAudit.mockRejectedValue(new Error('audit unavailable'));
    await expect(replay()).rejects.toThrow('audit unavailable');
    expect(mockStatus).toBe('failed');
    expect(mockProcess).not.toHaveBeenCalled();
    expect(mockRequests.filter(r => r.method === 'PATCH')).toHaveLength(2);
  });

  it('records processing failure for later recovery', async () => {
    mockProcess.mockRejectedValue(new Error('processing unavailable'));
    await expect(replay()).rejects.toThrow('processing unavailable');
    expect(mockStatus).toBe('failed');
    expect(mockRequests.at(-1)?.body).toMatchObject({ retryable: true });
  });

  it('rejects malformed persisted data before claiming', async () => {
    mockPayload = null;
    expect((await replay()).status).toBe(422);
    expect(mockRequests.filter(r => r.method === 'PATCH')).toHaveLength(0);
  });

  it('rejects unknown persisted status', async () => {
    mockStatus = 'unexpected';
    expect((await replay()).status).toBe(409);
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it('preserves missing-event and internal authorization boundaries', async () => {
    mockMissing = true;
    expect((await replay()).status).toBe(404);
    mockRequests.length = 0;
    mockAuthorized = false;
    expect((await replay()).status).toBe(401);
    expect(mockRequests).toHaveLength(0);
  });
});
