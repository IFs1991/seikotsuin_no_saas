import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublicBookingMyPage } from '@/app/(public)/booking/[clinic_id]/my/page';

const mockLiffIsInClient = jest.fn();
const mockLiffInit = jest.fn();
const mockLiffGetIDToken = jest.fn();

jest.mock('@line/liff', () => ({
  __esModule: true,
  default: {
    isInClient: () => mockLiffIsInClient(),
    init: (options: unknown) => mockLiffInit(options),
    getIDToken: () => mockLiffGetIDToken(),
  },
}));

const CLINIC_ID = '00000000-0000-0000-0000-000000000101';
const RESERVATION_ID = '00000000-0000-0000-0000-000000000301';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function getRequestHeaders(init: RequestInit | undefined): Headers {
  return new Headers(init?.headers);
}

describe('PublicBookingMyPage', () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    mockLiffIsInClient.mockReturnValue(true);
    mockLiffInit.mockResolvedValue(undefined);
    mockLiffGetIDToken.mockReturnValue('line-id-token-001');
    fetchMock = jest.spyOn(global, 'fetch');
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost');

      if (url.pathname === '/api/public/booking-form') {
        return jsonResponse({
          success: true,
          data: { liff_id: '2000000000-AbCdEfGh' },
        });
      }

      if (
        url.pathname === '/api/public/my-reservations' &&
        (!init?.method || init.method === 'GET')
      ) {
        return jsonResponse({
          success: true,
          data: {
            customer: {
              name: 'LINE 太郎',
              consent_marketing: true,
            },
            reservations: [
              {
                id: RESERVATION_ID,
                start_time: '2026-07-10T01:00:00.000Z',
                end_time: '2026-07-10T02:00:00.000Z',
                status: 'confirmed',
                menu_name: '標準施術',
                staff_name: '田中先生',
                can_cancel: true,
                cancellation_deadline_at: '2026-07-09T01:00:00.000Z',
              },
            ],
          },
        });
      }

      if (
        url.pathname === '/api/public/my-reservations' &&
        init?.method === 'PATCH'
      ) {
        return jsonResponse({
          success: true,
          data: { consent_marketing: false },
        });
      }

      if (
        url.pathname ===
          `/api/public/reservations/${RESERVATION_ID}/cancel` &&
        init?.method === 'POST'
      ) {
        return jsonResponse({
          success: true,
          data: {
            reservation_id: RESERVATION_ID,
            status: 'cancelled',
          },
        });
      }

      return jsonResponse({ success: false, error: 'not found' }, 404);
    });
  });

  afterEach(() => {
    fetchMock.mockRestore();
    mockLiffIsInClient.mockReset();
    mockLiffInit.mockReset();
    mockLiffGetIDToken.mockReset();
  });

  it('LIFF外ではLINEアプリ案内を表示し予約APIを呼ばない', async () => {
    mockLiffIsInClient.mockReturnValue(false);

    render(<PublicBookingMyPage clinicId={CLINIC_ID} />);

    expect(
      await screen.findByRole('heading', {
        name: 'LINEアプリから開いてください',
      })
    ).toBeInTheDocument();

    const bookingFormCall = fetchMock.mock.calls.find(
      call => String(call[0]) === `/api/public/booking-form?clinic_id=${CLINIC_ID}`
    );
    expect(bookingFormCall).toBeDefined();
    expect(getRequestHeaders(bookingFormCall?.[1]).get('Accept')).toBe(
      'application/json'
    );
    expect(
      fetchMock.mock.calls.some(call =>
        String(call[0]).startsWith('/api/public/my-reservations')
      )
    ).toBe(false);
  });

  it('LIFF内で将来予約を表示しキャンセルPOSTにBearer tokenを付ける', async () => {
    const user = userEvent.setup();

    render(<PublicBookingMyPage clinicId={CLINIC_ID} />);

    expect(await screen.findByText('LINE 太郎 様')).toBeInTheDocument();
    expect(screen.getByText('標準施術')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'キャンセルする' }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(call => {
          const url = String(call[0]);
          const init = call[1];
          return (
            url === `/api/public/reservations/${RESERVATION_ID}/cancel` &&
            init?.method === 'POST'
          );
        })
      ).toBe(true);
    });

    const cancelCall = fetchMock.mock.calls.find(call => {
      const url = String(call[0]);
      const init = call[1];
      return (
        url === `/api/public/reservations/${RESERVATION_ID}/cancel` &&
        init?.method === 'POST'
      );
    });
    expect(getRequestHeaders(cancelCall?.[1]).get('Authorization')).toBe(
      'Bearer line-id-token-001'
    );
    expect(
      await screen.findByText(
        '予約をキャンセルしました。必要に応じて再予約してください。'
      )
    ).toBeInTheDocument();
  });

  it('お知らせ配信トグルでconsent_marketingを更新する', async () => {
    const user = userEvent.setup();

    render(<PublicBookingMyPage clinicId={CLINIC_ID} />);

    const switchControl = await screen.findByRole('switch', {
      name: 'お知らせ配信を受け取る',
    });
    await user.click(switchControl);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(call => {
          const url = String(call[0]);
          const init = call[1];
          return (
            url === '/api/public/my-reservations' && init?.method === 'PATCH'
          );
        })
      ).toBe(true);
    });

    const patchCall = fetchMock.mock.calls.find(call => {
      const url = String(call[0]);
      const init = call[1];
      return url === '/api/public/my-reservations' && init?.method === 'PATCH';
    });
    expect(getRequestHeaders(patchCall?.[1]).get('Authorization')).toBe(
      'Bearer line-id-token-001'
    );
    expect(String(patchCall?.[1]?.body)).toContain(
      '"consent_marketing":false'
    );
  });
});
