import { NextRequest } from 'next/server';

import { processApiRequest } from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import { createScopedAdminContext } from '@/lib/supabase/scoped-admin';

jest.mock('@/lib/api-helpers', () => {
  const actual =
    jest.requireActual<typeof import('@/lib/api-helpers')>('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
    logError: jest.fn(),
  };
});

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logAdminAction: jest.fn(),
  },
}));

jest.mock('@/lib/supabase/scoped-admin', () => {
  const actual = jest.requireActual<
    typeof import('@/lib/supabase/scoped-admin')
  >('@/lib/supabase/scoped-admin');
  return {
    ...actual,
    createScopedAdminContext: jest.fn(),
  };
});

const processApiRequestMock = jest.mocked(processApiRequest);
const createScopedAdminContextMock = jest.mocked(createScopedAdminContext);
const logAdminActionMock = jest.mocked(AuditLogger.logAdminAction);

const TEST_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const CLINIC_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_USER_ID = '33333333-3333-4333-8333-333333333333';

type LineCredentialsRow = {
  access_token_encrypted: string | null;
  assertion_kid: string;
  assertion_private_key_encrypted: string;
  channel_secret_encrypted: string;
  clinic_id: string;
  created_at: string;
  is_active: boolean;
  liff_id: string | null;
  login_channel_id: string | null;
  messaging_channel_id: string;
  oa_basic_id: string | null;
  token_expires_at: string | null;
  updated_at: string;
  updated_by: string | null;
};

type LineCredentialsInsert = Omit<
  LineCredentialsRow,
  'created_at' | 'updated_at'
>;

type FeatureFlagInsert = {
  clinic_id: string;
  line_booking_enabled?: boolean;
  updated_by?: string | null;
};

type ProcessApiSuccessMock = {
  success: true;
  auth: { id: string; email: string; role: string };
  permissions: {
    role: string;
    clinic_id: string | null;
    clinic_scope_ids: string[];
  };
  supabase: object;
  body?: unknown;
};

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    clinic_id: CLINIC_ID,
    liff_id: '2000000000-AbCdEfGh',
    login_channel_id: '2000000001',
    messaging_channel_id: '2000000002',
    channel_secret: 'plain-channel-secret',
    assertion_private_key: '{"kty":"RSA","d":"private-key"}',
    assertion_kid: 'assertion-key-id',
    access_token: 'plain-access-token',
    token_expires_at: '2026-08-01T00:00:00.000Z',
    oa_basic_id: '@clinic',
    is_active: true,
    line_booking_enabled: true,
    ...overrides,
  };
}

async function buildLineRow(
  overrides: Partial<LineCredentialsRow> = {}
): Promise<LineCredentialsRow> {
  const { encryptLineCredential } = await import('@/lib/line/crypto');
  return {
    clinic_id: CLINIC_ID,
    liff_id: '2000000000-AbCdEfGh',
    login_channel_id: '2000000001',
    messaging_channel_id: '2000000002',
    channel_secret_encrypted: encryptLineCredential('plain-channel-secret'),
    assertion_private_key_encrypted: encryptLineCredential(
      '{"kty":"RSA","d":"private-key"}'
    ),
    assertion_kid: 'assertion-key-id',
    access_token_encrypted: encryptLineCredential('plain-access-token'),
    token_expires_at: '2026-08-01T00:00:00.000Z',
    oa_basic_id: '@clinic',
    is_active: true,
    created_at: '2026-07-05T00:00:00.000Z',
    updated_at: '2026-07-05T00:00:00.000Z',
    updated_by: null,
    ...overrides,
  };
}

function toProcessApiSuccess(
  params: { role?: string; body?: unknown } = {}
): ProcessApiSuccessMock {
  const role = params.role ?? 'admin';
  return {
    success: true,
    auth: {
      id: ADMIN_USER_ID,
      email: 'admin@example.com',
      role,
    },
    permissions: {
      role,
      clinic_id: CLINIC_ID,
      clinic_scope_ids: [CLINIC_ID],
    },
    supabase: {},
    body: params.body,
  };
}

function mockProcessSuccess(params: { role?: string; body?: unknown } = {}) {
  processApiRequestMock.mockResolvedValue(toProcessApiSuccess(params));
}

function createAdminClientFixture(params: {
  lineRows: Map<string, LineCredentialsRow>;
  featureFlags: Map<string, boolean>;
}) {
  let requestedLineClinicId = CLINIC_ID;
  const lineMaybeSingle = jest.fn(async () => ({
    data: params.lineRows.get(requestedLineClinicId) ?? null,
    error: null,
  }));
  const lineReturns = jest.fn(() => ({ maybeSingle: lineMaybeSingle }));
  const lineEq = jest.fn((_column: string, clinicId: string) => {
    requestedLineClinicId = clinicId;
    return { returns: lineReturns };
  });
  const lineSelect = jest.fn(() => ({ eq: lineEq }));
  const lineUpsert = jest.fn(async (payload: LineCredentialsInsert) => {
    const existing = params.lineRows.get(payload.clinic_id);
    params.lineRows.set(payload.clinic_id, {
      ...payload,
      created_at: existing?.created_at ?? '2026-07-05T00:00:00.000Z',
      updated_at: '2026-07-05T01:00:00.000Z',
    });
    return { error: null };
  });

  let requestedFeatureClinicId = CLINIC_ID;
  const featureMaybeSingle = jest.fn(async () => ({
    data: {
      line_booking_enabled:
        params.featureFlags.get(requestedFeatureClinicId) ?? false,
    },
    error: null,
  }));
  const featureReturns = jest.fn(() => ({ maybeSingle: featureMaybeSingle }));
  const featureEq = jest.fn((_column: string, clinicId: string) => {
    requestedFeatureClinicId = clinicId;
    return { returns: featureReturns };
  });
  const featureSelect = jest.fn(() => ({ eq: featureEq }));
  const featureUpsert = jest.fn(async (payload: FeatureFlagInsert) => {
    params.featureFlags.set(
      payload.clinic_id,
      payload.line_booking_enabled === true
    );
    return { error: null };
  });

  const from = jest.fn((tableName: string) => {
    if (tableName === 'clinic_line_credentials') {
      return { select: lineSelect, upsert: lineUpsert };
    }
    if (tableName === 'clinic_feature_flags') {
      return { select: featureSelect, upsert: featureUpsert };
    }
    throw new Error(`Unexpected table: ${tableName}`);
  });

  return {
    client: { from },
    assertions: {
      lineUpsert,
      featureUpsert,
      lineEq,
      featureEq,
    },
  };
}

function mockScopedAdminContext(
  fixture: ReturnType<typeof createAdminClientFixture>
) {
  const assertClinicInScope = jest.fn((clinicId: string) => {
    if (clinicId !== CLINIC_ID) {
      throw new Error('対象クリニックへのアクセス権がありません');
    }
  });
  createScopedAdminContextMock.mockReturnValue({
    client: fixture.client,
    scopedClinicIds: [CLINIC_ID],
    assertClinicInScope,
  });
  return assertClinicInScope;
}

function buildRequest(method: 'GET' | 'PUT', url: string) {
  return new NextRequest(url, {
    method,
    headers: {
      origin: 'http://localhost',
    },
  });
}

describe('/api/admin/line-credentials', () => {
  const originalEnv = process.env;
  const lineRows = new Map<string, LineCredentialsRow>();
  const featureFlags = new Map<string, boolean>();

  beforeEach(async () => {
    jest.clearAllMocks();
    lineRows.clear();
    featureFlags.clear();
    process.env = {
      ...originalEnv,
      LINE_CREDENTIALS_ENCRYPTION_KEY: TEST_KEY,
      NEXT_PUBLIC_ENABLE_LIFF_BOOKING: 'true',
    };
    lineRows.set(CLINIC_ID, await buildLineRow());
    featureFlags.set(CLINIC_ID, true);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns masked credentials without plaintext or encrypted secret values', async () => {
    mockProcessSuccess();
    const fixture = createAdminClientFixture({ lineRows, featureFlags });
    const assertClinicInScope = mockScopedAdminContext(fixture);

    const { GET } = await import('@/app/api/admin/line-credentials/route');
    const response = await GET(
      buildRequest(
        'GET',
        `http://localhost/api/admin/line-credentials?clinic_id=${CLINIC_ID}`
      )
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);
    const row = lineRows.get(CLINIC_ID);

    expect(response.status).toBe(200);
    expect(body.data.credentials.secrets.channel_secret).toEqual({
      configured: true,
      masked: '****cret',
    });
    expect(body.data.credentials.secrets.access_token).toEqual({
      configured: true,
      masked: '****oken',
    });
    expect(body.data.line_booking_enabled).toBe(true);
    expect(body.data.gate.enabled).toBe(true);
    expect(serialized).not.toContain('plain-channel-secret');
    expect(serialized).not.toContain('plain-access-token');
    expect(serialized).not.toContain(row?.channel_secret_encrypted);
    expect(assertClinicInScope).toHaveBeenCalledWith(CLINIC_ID);
  });

  it('encrypts credential secrets and writes the rollout flag on PUT', async () => {
    lineRows.clear();
    featureFlags.set(CLINIC_ID, false);
    const payload = basePayload();
    mockProcessSuccess({ body: payload });
    const fixture = createAdminClientFixture({ lineRows, featureFlags });
    mockScopedAdminContext(fixture);

    const { decryptLineCredential } = await import('@/lib/line/crypto');
    const { PUT } = await import('@/app/api/admin/line-credentials/route');
    const response = await PUT(
      buildRequest('PUT', 'http://localhost/api/admin/line-credentials')
    );
    const body = await response.json();
    const upsertPayload = fixture.assertions.lineUpsert.mock.calls[0][0];
    const serializedAudit = JSON.stringify(logAdminActionMock.mock.calls);

    expect(response.status).toBe(200);
    expect(decryptLineCredential(upsertPayload.channel_secret_encrypted)).toBe(
      'plain-channel-secret'
    );
    expect(
      decryptLineCredential(upsertPayload.assertion_private_key_encrypted)
    ).toBe('{"kty":"RSA","d":"private-key"}');
    expect(
      decryptLineCredential(upsertPayload.access_token_encrypted ?? '')
    ).toBe('plain-access-token');
    expect(fixture.assertions.featureUpsert).toHaveBeenCalledWith(
      {
        clinic_id: CLINIC_ID,
        line_booking_enabled: true,
        updated_by: ADMIN_USER_ID,
      },
      { onConflict: 'clinic_id' }
    );
    expect(body.data.credentials.secrets.channel_secret.masked).toBe(
      '****cret'
    );
    expect(serializedAudit).not.toContain('plain-channel-secret');
    expect(serializedAudit).not.toContain('plain-access-token');
  });

  it('rejects clinic_admin attempts to change the rollout flag', async () => {
    mockProcessSuccess({
      role: 'clinic_admin',
      body: basePayload({ line_booking_enabled: true }),
    });

    const { PUT } = await import('@/app/api/admin/line-credentials/route');
    const response = await PUT(
      buildRequest('PUT', 'http://localhost/api/admin/line-credentials')
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      success: false,
      error: 'LINE予約のロールアウト制御はadminのみ実行できます',
    });
    expect(createScopedAdminContextMock).not.toHaveBeenCalled();
  });

  it('requires secrets when creating a new credential row', async () => {
    lineRows.clear();
    mockProcessSuccess({
      body: basePayload({
        channel_secret: undefined,
        assertion_private_key: undefined,
        line_booking_enabled: undefined,
      }),
    });
    const fixture = createAdminClientFixture({ lineRows, featureFlags });
    mockScopedAdminContext(fixture);

    const { PUT } = await import('@/app/api/admin/line-credentials/route');
    const response = await PUT(
      buildRequest('PUT', 'http://localhost/api/admin/line-credentials')
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: 'channel_secretを入力してください',
    });
    expect(fixture.assertions.lineUpsert).not.toHaveBeenCalled();
  });
});
