/** @jest-environment jsdom */

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminTenantsPage from '@/app/(app)/admin/(protected)/tenants/page';

const mockFetch = jest.fn();

function createJsonResponse(payload: unknown) {
  return {
    json: async () => payload,
  };
}

beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
  Element.prototype.hasPointerCapture =
    Element.prototype.hasPointerCapture ?? (() => false);
  Element.prototype.setPointerCapture =
    Element.prototype.setPointerCapture ?? (() => {});
  Element.prototype.releasePointerCapture =
    Element.prototype.releasePointerCapture ?? (() => {});
  Element.prototype.scrollIntoView =
    Element.prototype.scrollIntoView ?? (() => {});
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
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const hqClinic = {
      id: '11111111-1111-4111-8111-111111111111',
      name: '本部',
      address: '東京都千代田区',
      phone_number: '03-1111-2222',
      is_active: true,
      created_at: '2026-04-01T00:00:00.000Z',
      parent_id: null,
      parent_name: null,
      clinic_type: 'hq',
      child_count: 0,
    };
    const createdClinic = {
      id: 'clinic-new',
      name: '新宿西口院',
      address: '東京都新宿区',
      phone_number: '03-9999-0000',
      is_active: true,
      created_at: '2026-04-20T00:00:00.000Z',
      parent_id: hqClinic.id,
      parent_name: hqClinic.name,
      clinic_type: 'child',
      child_count: 0,
      admin_account: {
        email: 'clinic-admin@example.com',
        role: 'clinic_admin',
      },
    };

    mockFetch
      .mockResolvedValueOnce(
        createJsonResponse({ success: true, data: { items: [hqClinic] } })
      )
      .mockResolvedValueOnce(
        createJsonResponse({ success: true, data: { items: [] } })
      )
      .mockResolvedValueOnce(
        createJsonResponse({ success: true, data: createdClinic })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: { items: [hqClinic, createdClinic] },
        })
      );

    render(<AdminTenantsPage />);

    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
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
    await user.click(screen.getByLabelText('親テナント'));
    await user.click(
      await screen.findByText(hqClinic.name, { selector: 'span' })
    );
    await user.click(screen.getByRole('radio', { name: /新規管理者を作成/ }));
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
      expect(
        screen.getByRole('cell', { name: createdClinic.name })
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        '子テナントと店舗管理者アカウントを作成しました（親: 本部 / ID: clinic-admin@example.com）'
      )
    ).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(mockFetch).toHaveBeenNthCalledWith(1, '/api/admin/tenants');
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      '/api/admin/tenants?is_active=true'
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      '/api/admin/tenants',
      expect.objectContaining({
        method: 'POST',
      })
    );
    expect(mockFetch).toHaveBeenNthCalledWith(4, '/api/admin/tenants');

    const requestInit = mockFetch.mock.calls[2][1] as RequestInit;
    expect(JSON.parse(String(requestInit.body))).toEqual(
      expect.objectContaining({
        name: createdClinic.name,
        address: createdClinic.address,
        phone_number: createdClinic.phone_number,
        is_active: true,
        parent_id: hqClinic.id,
        login_email: createdClinic.admin_account.email,
        login_password: 'StorePass1!',
      })
    );
  });

  it('運用中フィルタで停止したクリニックを一覧から外す', async () => {
    const activeClinic = {
      id: 'clinic-1',
      name: '本院',
      address: '東京都千代田区',
      phone_number: '03-1111-2222',
      is_active: true,
      created_at: '2026-04-01T00:00:00.000Z',
      parent_id: null,
      parent_name: null,
      clinic_type: 'hq',
      child_count: 0,
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
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: {
            items: [
              {
                ...activeClinic,
                is_active: false,
              },
            ],
          },
        })
      );

    render(<AdminTenantsPage />);

    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    await waitFor(() => {
      expect(
        screen.getByRole('cell', { name: activeClinic.name })
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '運用を停止' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('cell', { name: activeClinic.name })
      ).not.toBeInTheDocument();
    });

    expect(
      screen.getByText('テナントの運用を停止しました')
    ).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      `/api/admin/tenants/${activeClinic.id}`,
      expect.objectContaining({
        method: 'PATCH',
      })
    );
  });
});
