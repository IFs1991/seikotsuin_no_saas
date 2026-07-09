import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublicBookingForm } from '@/app/(public)/booking/[clinic_id]/page';
import type { PublicBookingFormSettings } from '@/lib/booking-form/settings';

const mockLiffIsInClient = jest.fn();
const mockLiffInit = jest.fn();
const mockLiffGetIDToken = jest.fn();
const mockLiffGetProfile = jest.fn();

jest.mock('@line/liff', () => ({
  __esModule: true,
  default: {
    isInClient: () => mockLiffIsInClient(),
    init: (options: unknown) => mockLiffInit(options),
    getIDToken: () => mockLiffGetIDToken(),
    getProfile: () => mockLiffGetProfile(),
  },
}));

const CLINIC_ID = '00000000-0000-0000-0000-000000000101';
const MENU_ID = '00000000-0000-0000-0000-000000000201';
const STAFF_ID = '00000000-0000-0000-0000-000000000301';
const RESERVATION_ID = '00000000-0000-0000-0000-000000000401';
const CAMPAIGN_ID = '00000000-0000-4000-8000-000000000501';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const defaultBookingFormData = (): PublicBookingFormSettings => ({
  fields: {
    nameKana: { enabled: false, required: false },
    phone: { enabled: true, required: true },
    email: { enabled: true, required: false },
    birthDate: { enabled: false, required: false },
    gender: { enabled: false, required: false },
    notes: { enabled: true, required: false },
  },
  staffSelection: 'optional',
  questions: [],
  consents: [],
  completionMessage: '',
});

describe('PublicBookingForm wizard', () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  let bookingFormData: PublicBookingFormSettings;
  let bookingFormStatus: number;
  let queuedReservationResponses: Response[];

  beforeEach(() => {
    bookingFormData = defaultBookingFormData();
    bookingFormStatus = 200;
    queuedReservationResponses = [];
    mockLiffIsInClient.mockReturnValue(true);
    mockLiffInit.mockResolvedValue(undefined);
    mockLiffGetIDToken.mockReturnValue(null);
    mockLiffGetProfile.mockResolvedValue({ displayName: 'LINE 太郎' });
    fetchMock = jest.spyOn(global, 'fetch');
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost');

      if (url.pathname === '/api/public/menus') {
        return jsonResponse({
          success: true,
          data: {
            clinic_name: 'テスト整骨院',
            menus: [
              {
                id: MENU_ID,
                name: '標準施術',
                description: '肩こりや腰痛の相談',
                price: 5000,
                duration_minutes: 60,
                category: 'treatment',
                is_insurance_applicable: false,
              },
            ],
          },
        });
      }

      if (url.pathname === '/api/public/resources') {
        return jsonResponse({
          success: true,
          data: {
            clinic_name: 'テスト整骨院',
            resources: [
              {
                id: STAFF_ID,
                name: '田中先生',
                type: 'staff',
                max_concurrent: 1,
              },
            ],
          },
        });
      }

      if (url.pathname === '/api/public/booking-form') {
        if (bookingFormStatus !== 200) {
          return jsonResponse(
            { success: false, error: 'Failed to load booking form settings' },
            bookingFormStatus
          );
        }

        return jsonResponse({
          success: true,
          data: bookingFormData,
        });
      }

      if (url.pathname === '/api/public/availability') {
        const date = url.searchParams.get('date_from') ?? '2026-07-05';
        return jsonResponse({
          success: true,
          data: {
            slot_minutes: 30,
            days: [
              {
                date,
                is_closed: false,
                slots: [
                  {
                    start: '10:00',
                    available: true,
                    resource_ids: [STAFF_ID],
                  },
                  {
                    start: '10:30',
                    available: false,
                    resource_ids: [],
                  },
                ],
              },
            ],
          },
        });
      }

      if (
        url.pathname === '/api/public/reservations' &&
        init?.method === 'POST'
      ) {
        const queuedResponse = queuedReservationResponses.shift();
        if (queuedResponse) {
          return queuedResponse;
        }

        return jsonResponse(
          {
            success: true,
            data: {
              reservation_id: RESERVATION_ID,
              clinic_name: 'テスト整骨院',
              menu_name: '標準施術',
              start_time: '2026-07-05T01:00:00.000Z',
              end_time: '2026-07-05T02:00:00.000Z',
              status: 'unconfirmed',
              resource_id: STAFF_ID,
              is_staff_requested: false,
            },
          },
          201
        );
      }

      return jsonResponse({ success: false, error: 'not found' }, 404);
    });
  });

  afterEach(() => {
    fetchMock.mockRestore();
    mockLiffIsInClient.mockReset();
    mockLiffInit.mockReset();
    mockLiffGetIDToken.mockReset();
    mockLiffGetProfile.mockReset();
    Reflect.deleteProperty(window, 'turnstile');
    document.getElementById('cloudflare-turnstile-api')?.remove();
  });

  it('Step 1から完了まで遷移し、指名なし予約を送信する', async () => {
    const user = userEvent.setup();

    render(<PublicBookingForm clinicId={CLINIC_ID} />);

    expect(await screen.findByText('メニューを選択')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /次へ/ }));

    expect(screen.getByText('担当者を選択')).toBeInTheDocument();
    expect(screen.getByText('指名なし')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /次へ/ }));

    expect(await screen.findByText('日時を選択')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: '10:00' }));
    await user.click(screen.getByRole('button', { name: /次へ/ }));

    expect(screen.getByText('患者情報を入力')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('山田 太郎'), '山田 太郎');
    await user.type(screen.getByPlaceholderText('09012345678'), '09012345678');
    await user.click(screen.getByRole('button', { name: /次へ/ }));

    expect(screen.getByRole('heading', { name: '確認' })).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: '予約リクエストを送信' })
    );

    expect(
      await screen.findByText('予約リクエストを受け付けました。')
    ).toBeInTheDocument();
    expect(screen.getByText(`予約番号: ${RESERVATION_ID}`)).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/public/reservations',
        expect.objectContaining({ method: 'POST' })
      );
    });

    const reservationCall = fetchMock.mock.calls.find(call => {
      const url = String(call[0]);
      const init = call[1];
      return url === '/api/public/reservations' && init?.method === 'POST';
    });

    expect(reservationCall).toBeDefined();
    const body = JSON.parse(String(reservationCall?.[1]?.body)) as {
      resource_id: string;
      start_time: string;
      line_id_token?: string;
    };
    expect(body.resource_id).toBe('any');
    expect(body.start_time).toContain('+09:00');
    expect(body.line_id_token).toBeUndefined();
  });

  it('Turnstile有効時は確認画面で取得したtokenを予約POSTに同梱する', async () => {
    bookingFormData = {
      ...defaultBookingFormData(),
      turnstile_site_key: 'turnstile-site-key',
    };
    const turnstile = installTurnstileMock('turnstile-token-001');
    const user = userEvent.setup();

    render(<PublicBookingForm clinicId={CLINIC_ID} />);

    expect(await screen.findByText('メニューを選択')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /次へ/ }));
    await user.click(screen.getByRole('button', { name: /次へ/ }));
    await user.click(await screen.findByRole('button', { name: '10:00' }));
    await user.click(screen.getByRole('button', { name: /次へ/ }));
    await user.type(screen.getByPlaceholderText('山田 太郎'), '山田 太郎');
    await user.type(screen.getByPlaceholderText('09012345678'), '09012345678');
    await user.click(screen.getByRole('button', { name: /次へ/ }));

    expect(await screen.findByText('Turnstile widget')).toBeInTheDocument();
    await waitFor(() => {
      expect(turnstile.render).toHaveBeenCalledTimes(1);
    });
    await user.click(
      screen.getByRole('button', { name: '予約リクエストを送信' })
    );

    expect(
      await screen.findByText('予約リクエストを受け付けました。')
    ).toBeInTheDocument();

    const reservationCall = fetchMock.mock.calls.find(call => {
      const url = String(call[0]);
      const init = call[1];
      return url === '/api/public/reservations' && init?.method === 'POST';
    });
    const body = JSON.parse(String(reservationCall?.[1]?.body)) as {
      turnstile_token?: string;
    };
    expect(body.turnstile_token).toBe('turnstile-token-001');
  });

  it('booking-form API 500時はフォーム本体を表示しない', async () => {
    bookingFormStatus = 500;

    render(<PublicBookingForm clinicId={CLINIC_ID} />);

    expect(
      await screen.findByRole('heading', {
        name: '予約情報を表示できません',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText('予約フォーム設定の取得に失敗しました')
    ).toBeInTheDocument();
    expect(screen.queryByText('メニューを選択')).not.toBeInTheDocument();
  });

  it('previewModeではbookingFormOverrideを優先しbooking-form API失敗に依存しない', async () => {
    bookingFormStatus = 500;

    render(
      <PublicBookingForm
        clinicId={CLINIC_ID}
        previewMode
        bookingFormOverride={defaultBookingFormData()}
      />
    );

    expect(await screen.findByText('メニューを選択')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(call => {
        const url = new URL(String(call[0]), 'http://localhost');
        return url.pathname === '/api/public/booking-form';
      })
    ).toBe(false);
  });

  it('CAPTCHA_FAILED後は入力値を保持してTurnstile付きで再送できる', async () => {
    bookingFormData = {
      ...defaultBookingFormData(),
      liff_id: '2000000000-AbCdEfGh',
      turnstile_site_key: 'turnstile-site-key',
    };
    mockLiffGetIDToken.mockReturnValue('line-id-token-001');
    queuedReservationResponses = [
      jsonResponse(
        {
          success: false,
          error: 'CAPTCHA verification failed',
          code: 'CAPTCHA_FAILED',
        },
        400
      ),
    ];
    const turnstile = installTurnstileMock('turnstile-token-002');
    const user = userEvent.setup();

    render(<PublicBookingForm clinicId={CLINIC_ID} />);

    await moveToConfirmation(user);
    expect(screen.queryByText('Turnstile widget')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: '予約リクエストを送信' })
    );

    expect(
      await screen.findByText('本人確認を追加で行ってください')
    ).toBeInTheDocument();
    expect(screen.getByText('山田 太郎')).toBeInTheDocument();
    expect(await screen.findByText('Turnstile widget')).toBeInTheDocument();
    await waitFor(() => {
      expect(turnstile.render).toHaveBeenCalledTimes(1);
    });

    await user.click(
      screen.getByRole('button', { name: '予約リクエストを送信' })
    );
    expect(
      await screen.findByText('予約リクエストを受け付けました。')
    ).toBeInTheDocument();

    const reservationCalls = getReservationPostCalls(fetchMock);
    expect(reservationCalls).toHaveLength(2);
    const firstBody = parseReservationBody(reservationCalls[0]);
    const secondBody = parseReservationBody(reservationCalls[1]);
    expect(firstBody.line_id_token).toBe('line-id-token-001');
    expect(firstBody.turnstile_token).toBeUndefined();
    expect(secondBody.line_id_token).toBe('line-id-token-001');
    expect(secondBody.turnstile_token).toBe('turnstile-token-002');
  });

  it('campaign_id付き導線では予約POSTにcampaign_idを同梱する', async () => {
    const user = userEvent.setup();

    render(<PublicBookingForm clinicId={CLINIC_ID} campaignId={CAMPAIGN_ID} />);

    expect(await screen.findByText('メニューを選択')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /次へ/ }));
    await user.click(screen.getByRole('button', { name: /次へ/ }));
    await user.click(await screen.findByRole('button', { name: '10:00' }));
    await user.click(screen.getByRole('button', { name: /次へ/ }));
    await user.type(screen.getByPlaceholderText('山田 太郎'), '山田 太郎');
    await user.type(screen.getByPlaceholderText('09012345678'), '09012345678');
    await user.click(screen.getByRole('button', { name: /次へ/ }));
    await user.click(
      screen.getByRole('button', { name: '予約リクエストを送信' })
    );

    expect(
      await screen.findByText('予約リクエストを受け付けました。')
    ).toBeInTheDocument();

    const reservationCall = fetchMock.mock.calls.find(call => {
      const url = String(call[0]);
      const init = call[1];
      return url === '/api/public/reservations' && init?.method === 'POST';
    });
    const body = JSON.parse(String(reservationCall?.[1]?.body)) as {
      campaign_id?: string;
    };
    expect(body.campaign_id).toBe(CAMPAIGN_ID);
  });

  it('LIFF初期化成功時はIDトークンを同梱し、表示名を氏名初期値に使う', async () => {
    bookingFormData = {
      ...defaultBookingFormData(),
      liff_id: '2000000000-AbCdEfGh',
      oa_basic_id: '@testclinic',
    };
    mockLiffGetIDToken.mockReturnValue('line-id-token-001');
    const user = userEvent.setup();

    render(<PublicBookingForm clinicId={CLINIC_ID} />);

    expect(await screen.findByText('メニューを選択')).toBeInTheDocument();
    await waitFor(() => {
      expect(mockLiffInit).toHaveBeenCalledWith({
        liffId: '2000000000-AbCdEfGh',
      });
    });
    await user.click(screen.getByRole('button', { name: /次へ/ }));
    await user.click(screen.getByRole('button', { name: /次へ/ }));
    await user.click(await screen.findByRole('button', { name: '10:00' }));
    await user.click(screen.getByRole('button', { name: /次へ/ }));

    expect(await screen.findByDisplayValue('LINE 太郎')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('09012345678'), '09012345678');
    await user.click(screen.getByRole('button', { name: /次へ/ }));
    await user.click(
      screen.getByRole('button', { name: '予約リクエストを送信' })
    );

    expect(
      await screen.findByText('予約リクエストを受け付けました。')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'LINEで友だち追加' })
    ).toHaveAttribute('href', 'https://line.me/R/ti/p/%40testclinic');

    const reservationCall = fetchMock.mock.calls.find(call => {
      const url = String(call[0]);
      const init = call[1];
      return url === '/api/public/reservations' && init?.method === 'POST';
    });
    const body = JSON.parse(String(reservationCall?.[1]?.body)) as {
      customer_name: string;
      line_id_token?: string;
    };
    expect(body.customer_name).toBe('LINE 太郎');
    expect(body.line_id_token).toBe('line-id-token-001');
  });

  it('LIFF初期化失敗時もWeb予約として完了できる', async () => {
    bookingFormData = {
      ...defaultBookingFormData(),
      liff_id: '2000000000-AbCdEfGh',
    };
    mockLiffInit.mockRejectedValue(new Error('LIFF init failed'));
    const user = userEvent.setup();

    render(<PublicBookingForm clinicId={CLINIC_ID} />);

    expect(await screen.findByText('メニューを選択')).toBeInTheDocument();
    await waitFor(() => expect(mockLiffInit).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /次へ/ }));
    await user.click(screen.getByRole('button', { name: /次へ/ }));
    await user.click(await screen.findByRole('button', { name: '10:00' }));
    await user.click(screen.getByRole('button', { name: /次へ/ }));
    await user.type(screen.getByPlaceholderText('山田 太郎'), '山田 太郎');
    await user.type(screen.getByPlaceholderText('09012345678'), '09012345678');
    await user.click(screen.getByRole('button', { name: /次へ/ }));
    await user.click(
      screen.getByRole('button', { name: '予約リクエストを送信' })
    );

    expect(
      await screen.findByText('予約リクエストを受け付けました。')
    ).toBeInTheDocument();

    const reservationCall = fetchMock.mock.calls.find(call => {
      const url = String(call[0]);
      const init = call[1];
      return url === '/api/public/reservations' && init?.method === 'POST';
    });
    const body = JSON.parse(String(reservationCall?.[1]?.body)) as {
      line_id_token?: string;
    };
    expect(body.line_id_token).toBeUndefined();
  });
});

type TurnstileRenderOptions = Parameters<
  NonNullable<Window['turnstile']>['render']
>[1];

type User = ReturnType<typeof userEvent.setup>;
type FetchCall = jest.SpiedFunction<typeof fetch>['mock']['calls'][number];

async function moveToConfirmation(user: User): Promise<void> {
  expect(await screen.findByText('メニューを選択')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /次へ/ }));
  await user.click(screen.getByRole('button', { name: /次へ/ }));
  await user.click(await screen.findByRole('button', { name: '10:00' }));
  await user.click(screen.getByRole('button', { name: /次へ/ }));
  const nameInput = screen.getByPlaceholderText('山田 太郎');
  await user.clear(nameInput);
  await user.type(nameInput, '山田 太郎');
  const phoneInput = screen.getByPlaceholderText('09012345678');
  await user.clear(phoneInput);
  await user.type(phoneInput, '09012345678');
  await user.click(screen.getByRole('button', { name: /次へ/ }));
  expect(screen.getByRole('heading', { name: '確認' })).toBeInTheDocument();
}

function getReservationPostCalls(
  mock: jest.SpiedFunction<typeof fetch>
): FetchCall[] {
  return mock.mock.calls.filter(call => {
    const url = String(call[0]);
    const init = call[1];
    return url === '/api/public/reservations' && init?.method === 'POST';
  });
}

function parseReservationBody(call: FetchCall): Record<string, unknown> {
  return JSON.parse(String(call[1]?.body)) as Record<string, unknown>;
}

function installTurnstileMock(token: string) {
  const render = jest.fn(
    (container: HTMLElement, options: TurnstileRenderOptions) => {
      const marker = document.createElement('div');
      marker.textContent = 'Turnstile widget';
      container.appendChild(marker);
      options.callback(token);
      return 'turnstile-widget-001';
    }
  );
  const reset = jest.fn();
  const remove = jest.fn();
  Object.defineProperty(window, 'turnstile', {
    configurable: true,
    value: { render, reset, remove },
  });

  return { render, reset, remove };
}
