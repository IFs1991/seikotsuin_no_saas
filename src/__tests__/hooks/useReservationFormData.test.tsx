/** @jest-environment jsdom */

import { renderHook, waitFor } from '@testing-library/react';
import { useReservationFormData } from '@/hooks/useReservationFormData';

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

describe('useReservationFormData', () => {
  let fetchSpy: jest.SpyInstance<
    ReturnType<typeof fetch>,
    Parameters<typeof fetch>
  >;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(input => {
      const url = String(input);

      if (url.startsWith('/api/customers')) {
        return jsonResponse({
          success: true,
          data: {
            items: [
              {
                id: 'customer-1',
                name: '山田 太郎',
                phone: '090',
                consentMarketing: false,
                consentReminder: true,
                createdAt: '2026-07-10T00:00:00.000Z',
                updatedAt: '2026-07-10T00:00:00.000Z',
              },
            ],
            nextCursor: null,
          },
        });
      }

      if (url.startsWith('/api/menus')) {
        return jsonResponse({
          success: true,
          data: [{ id: 'menu-1', name: '整体', isActive: true }],
        });
      }

      if (url.startsWith('/api/resources')) {
        return jsonResponse({
          success: true,
          data: [{ id: 'staff-1', name: '田中先生', isActive: true }],
        });
      }

      return jsonResponse({ success: false, error: 'unexpected request' }, 404);
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('includeCustomers=false のとき患者一覧を取得しない', async () => {
    const { result } = renderHook(() =>
      useReservationFormData('clinic-1', { includeCustomers: false })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.menus).toHaveLength(1);
      expect(result.current.resources).toHaveLength(1);
    });

    const requestedUrls = fetchSpy.mock.calls.map(([input]) => String(input));
    expect(requestedUrls).toEqual([
      '/api/menus?clinic_id=clinic-1',
      '/api/resources?clinic_id=clinic-1',
    ]);
    expect(result.current.customers).toEqual([]);
  });

  it('デフォルトでは患者・メニュー・リソースを取得する', async () => {
    const { result } = renderHook(() => useReservationFormData('clinic-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.customers).toHaveLength(1);
      expect(result.current.menus).toHaveLength(1);
      expect(result.current.resources).toHaveLength(1);
    });

    const requestedUrls = fetchSpy.mock.calls.map(([input]) => String(input));
    expect(requestedUrls).toEqual([
      '/api/customers?clinic_id=clinic-1&limit=100',
      '/api/menus?clinic_id=clinic-1',
      '/api/resources?clinic_id=clinic-1',
    ]);
  });
});
