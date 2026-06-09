/** @jest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react';
import { useManagerAssignments } from '@/hooks/useManagerAssignments';
import { API_ENDPOINTS } from '@/lib/constants';
import type { ManagerListItem } from '@/lib/admin/manager-assignments';

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

const mockFetch = jest.fn<Promise<Response>, [FetchInput, FetchInit?]>();

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

const baseManager: ManagerListItem = {
  user_id: '11111111-1111-4111-8111-111111111111',
  email: 'manager@example.com',
  full_name: '山田 太郎',
  primary_clinic_id: 'primary-clinic',
  primary_clinic_name: '本院',
  assigned_clinic_count: 1,
  assigned_clinics: [
    {
      assignment_id: 'assignment-1',
      clinic_id: 'clinic-1',
      clinic_name: '新宿院',
      assigned_at: '2026-06-01T00:00:00.000Z',
    },
  ],
};

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch;
});

describe('useManagerAssignments', () => {
  it('マネージャー一覧を取得してstateに反映する', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        success: true,
        data: {
          managers: [baseManager],
          total: 1,
        },
      })
    );

    const { result } = renderHook(() => useManagerAssignments());

    await act(async () => {
      await result.current.fetchManagers();
    });

    await waitFor(() => {
      expect(result.current.managers).toEqual([baseManager]);
    });
    expect(mockFetch).toHaveBeenCalledWith(API_ENDPOINTS.ADMIN.MANAGERS, {
      signal: undefined,
    });
  });

  it('担当店舗の置換結果を一覧stateへ反映する', async () => {
    const nextAssignments = [
      ...baseManager.assigned_clinics,
      {
        assignment_id: 'assignment-2',
        clinic_id: 'clinic-2',
        clinic_name: '横浜院',
        assigned_at: '2026-06-02T00:00:00.000Z',
      },
    ];

    mockFetch
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: {
            managers: [baseManager],
            total: 1,
          },
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: {
            assignments: nextAssignments,
            primary_clinic_id: 'clinic-2',
            primary_clinic_name: '横浜院',
            total: nextAssignments.length,
          },
        })
      );

    const { result } = renderHook(() => useManagerAssignments());

    await act(async () => {
      await result.current.fetchManagers();
    });
    await act(async () => {
      await result.current.replaceManagerAssignments(baseManager.user_id, {
        clinic_ids: ['clinic-1', 'clinic-2'],
        primary_clinic_id: 'clinic-2',
        revoke_reason: '担当エリア変更',
      });
    });

    await waitFor(() => {
      expect(result.current.managers[0]?.assigned_clinic_count).toBe(2);
      expect(result.current.managers[0]?.primary_clinic_id).toBe('clinic-2');
      expect(result.current.managers[0]?.primary_clinic_name).toBe('横浜院');
    });

    const requestInit = mockFetch.mock.calls[1]?.[1];
    expect(mockFetch.mock.calls[1]?.[0]).toBe(
      `${API_ENDPOINTS.ADMIN.MANAGERS}/${baseManager.user_id}/clinics`
    );
    expect(requestInit?.method).toBe('PUT');
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      clinic_ids: ['clinic-1', 'clinic-2'],
      primary_clinic_id: 'clinic-2',
      revoke_reason: '担当エリア変更',
    });
  });
});
