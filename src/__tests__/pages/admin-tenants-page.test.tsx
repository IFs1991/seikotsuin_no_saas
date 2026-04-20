/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminTenantsPage from '@/app/(app)/admin/(protected)/tenants/page';

const mockFetch = jest.fn();

function createJsonResponse(payload: unknown) {
  return {
    json: async () => payload,
  };
}

beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});

describe('AdminTenantsPage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockFetch.mockReset();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('作成したクリニックを一覧再取得なしで反映する', async () => {
    const createdClinic = {
      id: 'clinic-new',
      name: '新宿西口院',
      address: '東京都新宿区',
      phone_number: '03-9999-0000',
      is_active: true,
      created_at: '2026-04-20T00:00:00.000Z',
      admin_account: {
        email: 'clinic-admin@example.com',
        role: 'clinic_admin',
      },
    };

    mockFetch
      .mockResolvedValueOnce(
        createJsonResponse({ success: true, data: { items: [] } })
      )
      .mockResolvedValueOnce(
        createJsonResponse({ success: true, data: createdClinic })
      );

    render(<AdminTenantsPage />);

    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByPlaceholderText('例: 本院'), {
      target: { value: createdClinic.name },
    });
    fireEvent.change(screen.getByPlaceholderText('例: 東京都千代田区'), {
      target: { value: createdClinic.address },
    });
    fireEvent.change(screen.getByPlaceholderText('例: 03-1234-5678'), {
      target: { value: createdClinic.phone_number },
    });
    fireEvent.change(
      screen.getByPlaceholderText('例: clinic-admin@example.com'),
      {
        target: { value: createdClinic.admin_account.email },
      }
    );
    fireEvent.change(screen.getByPlaceholderText('初期パスワードを設定'), {
      target: { value: 'StorePass1!' },
    });

    fireEvent.click(screen.getByRole('button', { name: '作成する' }));

    await waitFor(() => {
      expect(screen.getByText(createdClinic.name)).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        'クリニックと店舗管理者アカウントを作成しました（ID: clinic-admin@example.com）'
      )
    ).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      '/api/admin/tenants?is_active=true'
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      '/api/admin/tenants',
      expect.objectContaining({
        method: 'POST',
      })
    );

    const requestInit = mockFetch.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(requestInit.body))).toEqual(
      expect.objectContaining({
        name: createdClinic.name,
        address: createdClinic.address,
        phone_number: createdClinic.phone_number,
        is_active: true,
        login_email: createdClinic.admin_account.email,
        login_password: 'StorePass1!',
      })
    );
  });

  it('active フィルタで無効化したクリニックを一覧から外す', async () => {
    const activeClinic = {
      id: 'clinic-1',
      name: '本院',
      address: '東京都千代田区',
      phone_number: '03-1111-2222',
      is_active: true,
      created_at: '2026-04-01T00:00:00.000Z',
    };

    mockFetch
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: { items: [activeClinic] },
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: {
            ...activeClinic,
            is_active: false,
          },
        })
      );

    render(<AdminTenantsPage />);

    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    await waitFor(() => {
      expect(screen.getByText(activeClinic.name)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '無効化' }));

    await waitFor(() => {
      expect(screen.queryByText(activeClinic.name)).not.toBeInTheDocument();
    });

    expect(screen.getByText('クリニックを無効化しました')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      `/api/admin/tenants/${activeClinic.id}`,
      expect.objectContaining({
        method: 'PATCH',
      })
    );
  });
});
