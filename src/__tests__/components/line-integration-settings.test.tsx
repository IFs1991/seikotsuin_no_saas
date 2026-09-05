import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { LineIntegrationSettings } from '@/components/admin/line-integration-settings';

const CLINIC_ID = '11111111-1111-4111-8111-111111111111';
const setupState = {
  credentials: null,
  encryption_ready: true,
  features: {
    line_booking_enabled: false,
    line_chat_enabled: false,
    line_notification_enabled: false,
  },
  setup: null,
};
const chatState = {
  auto_reply_enabled: false,
  auto_reply_message: 'お問い合わせありがとうございます。',
  line_chat_enabled: false,
  retention_days: 90,
  webhook_verified: false,
};

describe('LineIntegrationSettings', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    fetchMock.mockImplementation(async input => {
      const url = String(input);
      if (url.startsWith('/api/admin/line-setup')) {
        return Response.json({ data: setupState, success: true });
      }
      return Response.json({ data: chatState, success: true });
    });
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('shows the four setup steps and starts feature choices off', async () => {
    render(<LineIntegrationSettings clinicId={CLINIC_ID} />);

    expect(await screen.findByText('1. 準備')).toBeInTheDocument();
    expect(screen.getByText('2. LINE Console設定')).toBeInTheDocument();
    expect(screen.getByText('3. 接続確認')).toBeInTheDocument();
    expect(screen.getByText('4. 有効化')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '接続準備を始める' })
    ).toBeEnabled();
  });

  it('prepares clinic-scoped key material without selecting paid features', async () => {
    const preparedState = {
      ...setupState,
      setup: {
        endpointUrl: `https://example.test/booking/${CLINIC_ID}`,
        expires_at: '2026-08-15T00:00:00.000Z',
        id: '22222222-2222-4222-8222-222222222222',
        public_jwk: {
          alg: 'RS256',
          e: 'AQAB',
          kty: 'RSA',
          n: 'fixture',
          use: 'sig',
        },
        public_key_kid: null,
        provider_identity_verified: false,
        redirectUrl: `https://example.test/booking/${CLINIC_ID}`,
        status: 'prepared',
        webhookUrl: `https://example.test/api/webhooks/line/${CLINIC_ID}`,
      },
    };
    fetchMock.mockImplementation(async (input, init) => {
      if (
        String(input) === '/api/admin/line-setup' &&
        init?.method === 'POST'
      ) {
        return Response.json({ data: preparedState, success: true });
      }
      if (String(input).startsWith('/api/admin/line-setup')) {
        return Response.json({ data: setupState, success: true });
      }
      return Response.json({ data: chatState, success: true });
    });
    render(<LineIntegrationSettings clinicId={CLINIC_ID} />);

    fireEvent.click(
      await screen.findByRole('button', { name: '接続準備を始める' })
    );

    expect(
      await screen.findByText('2. LINE Consoleで登録')
    ).toBeInTheDocument();
    const postCall = fetchMock.mock.calls.find(
      call => String(call[0]) === '/api/admin/line-setup'
    );
    expect(postCall?.[1]?.body).toBe(JSON.stringify({ clinic_id: CLINIC_ID }));
    expect(screen.getByText(/LINE user IDの同一性/)).toBeInTheDocument();
    expect(screen.getByText('予約画面の実行用LIFF ID')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Messaging API Channel ID'), {
      target: { value: 'messaging-channel' },
    });
    fireEvent.change(screen.getByLabelText('公開鍵KID'), {
      target: { value: 'public-key-kid' },
    });
    fireEvent.change(screen.getByLabelText('Channel secret'), {
      target: { value: 'channel-secret' },
    });
    fireEvent.change(
      screen.getByLabelText('LINE Login / MINI App Channel ID'),
      { target: { value: 'login-channel' } }
    );
    fireEvent.change(screen.getByLabelText('MINI App Endpoint ID'), {
      target: { value: 'endpoint-id' },
    });
    fireEvent.click(screen.getByLabelText('Provider構成を確認しました'));
    const verifyButton = screen.getByRole('button', {
      name: 'Messaging APIを確認',
    });
    expect(verifyButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('予約画面の実行用LIFF ID'), {
      target: { value: '2000000000-AbCdEfGh' },
    });
    expect(verifyButton).toBeEnabled();
  });

  it('keeps chat disabled when webhook verification is incomplete', async () => {
    const connectedState = {
      ...setupState,
      credentials: {
        app_type: 'mini_app',
        bot_display_name: 'Clinic Bot',
        bot_picture_url: null,
        is_active: true,
        messaging_channel_id: 'messaging',
        oa_basic_id: '@clinic',
        provider_identity_verified_at: null,
        setup_completed_at: '2026-08-14T00:00:00.000Z',
        webhook_verified_at: null,
      },
    };
    fetchMock.mockImplementation(async input =>
      Response.json({
        data: String(input).startsWith('/api/admin/line-setup')
          ? connectedState
          : chatState,
        success: true,
      })
    );
    render(<LineIntegrationSettings clinicId={CLINIC_ID} />);

    const chatSwitch = await screen.findByRole('switch', {
      name: 'LINEチャット',
    });
    await waitFor(() => expect(chatSwitch).toBeDisabled());
    expect(screen.getByText(/Webhookの受信確認後/)).toBeInTheDocument();
  });

  it('discards a bound setup session before changing the push recipient', async () => {
    const preparedState = {
      ...setupState,
      setup: {
        endpointUrl: `https://example.test/booking/${CLINIC_ID}`,
        expires_at: '2026-08-15T00:00:00.000Z',
        id: '22222222-2222-4222-8222-222222222222',
        provider_identity_verified: false,
        public_jwk: {},
        public_key_kid: null,
        redirectUrl: `https://example.test/booking/${CLINIC_ID}`,
        status: 'prepared' as const,
        webhookUrl: `https://example.test/api/webhooks/line/${CLINIC_ID}`,
      },
    };
    fetchMock.mockImplementation(async (input, init) => {
      if (
        String(input) === '/api/admin/line-setup' &&
        init?.method === 'DELETE'
      ) {
        return Response.json({ data: setupState, success: true });
      }
      return Response.json({
        data: String(input).startsWith('/api/admin/line-setup')
          ? preparedState
          : chatState,
        success: true,
      });
    });
    render(<LineIntegrationSettings clinicId={CLINIC_ID} />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: '接続確認を破棄してやり直す',
      })
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/line-setup',
        expect.objectContaining({
          body: JSON.stringify({
            clinic_id: CLINIC_ID,
            setup_session_id: preparedState.setup.id,
          }),
          method: 'DELETE',
        })
      )
    );
    expect(
      await screen.findByRole('button', { name: '接続準備を始める' })
    ).toBeEnabled();
  });

  it('resets feature choices to OFF during provider reconnection', async () => {
    const reconnectState = {
      ...setupState,
      credentials: {
        app_type: 'mini_app' as const,
        bot_display_name: 'Existing Bot',
        bot_picture_url: null,
        is_active: true,
        messaging_channel_id: 'existing',
        oa_basic_id: '@existing',
        provider_identity_verified_at: '2026-08-13T00:00:00.000Z',
        setup_completed_at: '2026-08-13T00:00:00.000Z',
        webhook_verified_at: '2026-08-13T00:00:00.000Z',
      },
      features: {
        line_booking_enabled: true,
        line_chat_enabled: true,
        line_notification_enabled: true,
      },
      setup: {
        endpointUrl: `https://example.test/booking/${CLINIC_ID}`,
        expires_at: '2026-08-15T00:00:00.000Z',
        id: '33333333-3333-4333-8333-333333333333',
        provider_identity_verified: false,
        public_jwk: {},
        public_key_kid: 'kid',
        redirectUrl: `https://example.test/booking/${CLINIC_ID}`,
        status: 'verified' as const,
        webhookUrl: `https://example.test/api/webhooks/line/${CLINIC_ID}`,
      },
    };
    const connectedAfterDiscard = {
      ...reconnectState,
      setup: null,
    };
    fetchMock.mockImplementation(async (input, init) =>
      Response.json({
        data: String(input).startsWith('/api/admin/line-setup')
          ? init?.method === 'DELETE'
            ? connectedAfterDiscard
            : reconnectState
          : chatState,
        success: true,
      })
    );
    render(<LineIntegrationSettings clinicId={CLINIC_ID} />);

    const booking = await screen.findByRole('switch', { name: 'LINE予約' });
    const notifications = screen.getByRole('switch', { name: 'LINE通知' });
    expect(booking).not.toBeChecked();
    expect(booking).toBeDisabled();
    expect(notifications).not.toBeChecked();
    expect(
      screen.getByText(/ID tokenとテスト送信先の同一性確認後/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '検証結果を破棄してやり直す' })
    ).toBeEnabled();

    fireEvent.click(
      screen.getByRole('button', { name: '検証結果を破棄してやり直す' })
    );
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'LINE予約' })).toBeChecked()
    );
    expect(screen.getByRole('switch', { name: 'LINE通知' })).toBeChecked();
  });
});
