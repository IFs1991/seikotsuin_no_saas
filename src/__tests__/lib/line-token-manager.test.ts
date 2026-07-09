import { generateKeyPairSync, type JsonWebKey } from 'node:crypto';

const TEST_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const CLINIC_ID = '11111111-1111-4111-8111-111111111111';

type TokenCredentialRow = {
  clinic_id: string;
  is_active: boolean;
  messaging_channel_id: string;
  assertion_private_key_encrypted: string;
  assertion_kid: string;
  access_token_encrypted: string | null;
  token_expires_at: string | null;
};

type TableUpdatePayload = {
  access_token_encrypted: string;
  token_expires_at: string;
};

type TestFetch = (input: string, init: RequestInit) => Promise<Response>;

function createPrivateJwk(): JsonWebKey {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  return privateKey.export({ format: 'jwk' });
}

async function createCredentialRow(
  overrides: Partial<TokenCredentialRow> = {}
): Promise<TokenCredentialRow> {
  const { encryptLineCredential } = await import('@/lib/line/crypto');
  return {
    clinic_id: CLINIC_ID,
    is_active: true,
    messaging_channel_id: '2000000000',
    assertion_private_key_encrypted: encryptLineCredential(
      JSON.stringify(createPrivateJwk())
    ),
    assertion_kid: 'assertion-key-id',
    access_token_encrypted: null,
    token_expires_at: null,
    ...overrides,
  };
}

function createTokenClientFixture(row: TokenCredentialRow) {
  const maybeSingle = jest.fn(async () => ({ data: row, error: null }));
  const returns = jest.fn(() => ({ maybeSingle }));
  const eqSelect = jest.fn(() => ({ returns }));
  const select = jest.fn(() => ({ eq: eqSelect }));
  const eqUpdate = jest.fn(async () => ({ error: null }));
  const update = jest.fn((_payload: TableUpdatePayload) => ({ eq: eqUpdate }));
  const from = jest.fn((tableName: string) => {
    if (tableName !== 'clinic_line_credentials') {
      throw new Error(`Unexpected table: ${tableName}`);
    }
    return { select, update };
  });

  return {
    client: { from },
    assertions: { from, select, update, eqUpdate },
  };
}

describe('LINE token manager', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      LINE_CREDENTIALS_ENCRYPTION_KEY: TEST_KEY,
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses the cached token while at least seven days remain', async () => {
    const { encryptLineCredential } = await import('@/lib/line/crypto');
    const { getLineChannelAccessToken } =
      await import('@/lib/line/token-manager');
    const row = await createCredentialRow({
      access_token_encrypted: encryptLineCredential('cached-token'),
      token_expires_at: '2026-08-01T00:00:00.000Z',
    });
    const fixture = createTokenClientFixture(row);
    const fetcher: jest.MockedFunction<TestFetch> = jest.fn(async () => {
      throw new Error('Token endpoint should not be called');
    });

    const result = await getLineChannelAccessToken({
      supabase: fixture.client,
      clinicId: CLINIC_ID,
      now: new Date('2026-07-05T00:00:00.000Z'),
      fetcher,
    });

    expect(result).toEqual({
      ok: true,
      accessToken: 'cached-token',
      expiresAt: '2026-08-01T00:00:00.000Z',
      refreshed: false,
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(fixture.assertions.update).not.toHaveBeenCalled();
  });

  it('refreshes and encrypts a v2.1 access token when fewer than seven days remain', async () => {
    const { decryptLineCredential } = await import('@/lib/line/crypto');
    const { getLineChannelAccessToken } =
      await import('@/lib/line/token-manager');
    const row = await createCredentialRow({
      token_expires_at: '2026-07-07T00:00:00.000Z',
    });
    const fixture = createTokenClientFixture(row);
    const fetcher: jest.MockedFunction<TestFetch> = jest.fn(
      async (_input, init) => {
        expect(init.method).toBe('POST');
        expect(String(init.body)).toContain('client_assertion=');
        return new Response(
          JSON.stringify({
            access_token: 'fresh-token',
            expires_in: 2_592_000,
            token_type: 'Bearer',
          }),
          { status: 200 }
        );
      }
    );

    const result = await getLineChannelAccessToken({
      supabase: fixture.client,
      clinicId: CLINIC_ID,
      now: new Date('2026-07-05T00:00:00.000Z'),
      fetcher,
    });

    expect(result).toEqual({
      ok: true,
      accessToken: 'fresh-token',
      expiresAt: '2026-08-04T00:00:00.000Z',
      refreshed: true,
    });
    expect(fixture.assertions.update).toHaveBeenCalledTimes(1);
    const updatePayload = fixture.assertions.update.mock.calls[0][0];
    expect(decryptLineCredential(updatePayload.access_token_encrypted)).toBe(
      'fresh-token'
    );
    expect(updatePayload.token_expires_at).toBe('2026-08-04T00:00:00.000Z');
  });

  it('fails closed without throwing when the LINE token endpoint fails', async () => {
    const { getLineChannelAccessToken } =
      await import('@/lib/line/token-manager');
    const row = await createCredentialRow();
    const fixture = createTokenClientFixture(row);
    const fetcher: jest.MockedFunction<TestFetch> = jest.fn(async () => {
      return new Response(JSON.stringify({ message: 'failed' }), {
        status: 500,
      });
    });

    const result = await getLineChannelAccessToken({
      supabase: fixture.client,
      clinicId: CLINIC_ID,
      now: new Date('2026-07-05T00:00:00.000Z'),
      fetcher,
    });

    expect(result).toEqual({ ok: false, reason: 'token_issue_failed' });
    expect(fixture.assertions.update).not.toHaveBeenCalled();
  });
});
