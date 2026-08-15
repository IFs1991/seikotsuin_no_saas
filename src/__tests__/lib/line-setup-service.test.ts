const TEST_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('LINE setup service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      LINE_CREDENTIALS_ENCRYPTION_KEY: TEST_KEY,
      NEXT_PUBLIC_APP_URL: 'https://example.test',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('generates a LINE-compatible RSA public JWK without exposing private material', async () => {
    const { generateLineSetupKeyMaterial } =
      await import('@/lib/line/setup-service');
    const material = generateLineSetupKeyMaterial();

    expect(material.publicJwk).toMatchObject({
      alg: 'RS256',
      kty: 'RSA',
      use: 'sig',
    });
    expect(material.publicJwk).not.toHaveProperty('d');
    expect(material.encryptedPrivateJwk).toMatch(/^v1:/);
    expect(material.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('recovers a provider-bound push test already accepted under the stable retry key', async () => {
    const { generateLineSetupKeyMaterial, verifyLineSetupInput } =
      await import('@/lib/line/setup-service');
    const material = generateLineSetupKeyMaterial();
    const beforePushTest = jest.fn().mockResolvedValue(undefined);
    const fetcher = jest.fn(
      async (input: string, init: RequestInit): Promise<Response> => {
        if (input.endsWith('/oauth2/v2.1/token')) {
          expect(init.body).toBeInstanceOf(URLSearchParams);
          return Response.json({
            access_token: 'verified-access-token',
            expires_in: 3600,
            key_id: 'token-key-id',
          });
        }
        if (input.endsWith('/v2/bot/info')) {
          expect(init.headers).toMatchObject({
            authorization: 'Bearer verified-access-token',
          });
          return Response.json({
            basicId: '@clinic',
            displayName: 'Clinic Bot',
            pictureUrl: 'https://example.test/bot.png',
            userId: 'U00000000000000000000000000000000',
          });
        }
        if (input.endsWith('/oauth2/v2.1/verify')) {
          expect(init.body).toBeInstanceOf(URLSearchParams);
          return Response.json({
            aud: 'login-channel',
            sub: 'U11111111111111111111111111111111',
          });
        }
        if (input.endsWith('/v2/bot/message/push')) {
          expect(init.headers).toMatchObject({
            'x-line-retry-key': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          });
          return new Response(null, {
            headers: { 'x-line-accepted-request-id': 'accepted-request-id' },
            status: 409,
          });
        }
        return new Response(null, { status: 404 });
      }
    );

    const result = await verifyLineSetupInput({
      encryptedPrivateJwk: material.encryptedPrivateJwk,
      fetcher,
      input: {
        appEndpointId: 'endpoint-id',
        appType: 'mini_app',
        channelSecret: 'channel-secret',
        liffId: '2000000000-AbCdEfGh',
        loginChannelId: 'login-channel',
        messagingChannelId: 'messaging-channel',
        providerConfigurationConfirmed: true,
        publicKeyKid: 'public-key-kid',
        testIdToken: 'provider-bound-id-token',
        testLineUserId: 'U11111111111111111111111111111111',
      },
      now: new Date('2026-08-14T00:00:00.000Z'),
      pushTestRetryKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      beforePushTest,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pushTestSent).toBe(true);
      expect(result.draft).toMatchObject({
        accessToken: 'verified-access-token',
        accessTokenKeyId: 'token-key-id',
        botDisplayName: 'Clinic Bot',
        oaBasicId: '@clinic',
        providerIdentityVerified: true,
        tokenExpiresAt: '2026-08-14T01:00:00.000Z',
      });
    }
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(beforePushTest).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f]{64}$/)
    );
  });

  it('binds the retry key to the exact provider identity, recipient, and message', async () => {
    const { createLineSetupPushRequestDigest } =
      await import('@/lib/line/setup-service');
    const request = {
      botUserId: 'U00000000000000000000000000000000',
      lineUserId: 'U11111111111111111111111111111111',
      loginChannelId: 'login-channel',
      messagingChannelId: 'messaging-channel',
      publicKeyKid: 'public-key-kid',
    };
    const first = createLineSetupPushRequestDigest(request);
    const sameRequest = createLineSetupPushRequestDigest(request);

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(sameRequest).toBe(first);
    for (const changed of [
      {
        ...request,
        lineUserId: 'U22222222222222222222222222222222',
      },
      { ...request, messagingChannelId: 'messaging-channel-2' },
      { ...request, loginChannelId: 'login-channel-2' },
      { ...request, publicKeyKid: 'public-key-kid-2' },
      { ...request, botUserId: 'U99999999999999999999999999999999' },
    ]) {
      expect(createLineSetupPushRequestDigest(changed)).not.toBe(first);
    }
  });

  it('encrypts the verified draft and builds clinic-scoped console URLs', async () => {
    const {
      buildLineSetupUrls,
      decryptLineSetupVerificationDraft,
      encryptLineSetupVerificationDraft,
    } = await import('@/lib/line/setup-service');
    const draft = {
      accessToken: 'secret-token',
      accessTokenKeyId: null,
      appEndpointId: 'endpoint',
      appType: 'mini_app' as const,
      botDisplayName: 'Bot',
      botPictureUrl: null,
      botUserId: 'U00000000000000000000000000000000',
      channelSecret: 'secret-channel',
      liffId: '2000000000-AbCdEfGh',
      loginChannelId: 'login',
      messagingChannelId: 'messaging',
      oaBasicId: '@bot',
      providerIdentityVerified: true,
      tokenExpiresAt: '2026-08-15T00:00:00.000Z',
    };
    const encrypted = encryptLineSetupVerificationDraft(draft);

    expect(encrypted).not.toContain('secret-token');
    expect(decryptLineSetupVerificationDraft(encrypted)).toEqual(draft);
    expect(buildLineSetupUrls('clinic-a')).toEqual({
      endpointUrl: 'https://example.test/booking/clinic-a',
      redirectUrl: 'https://example.test/booking/clinic-a',
      webhookUrl: 'https://example.test/api/webhooks/line/clinic-a',
    });
  });
});
