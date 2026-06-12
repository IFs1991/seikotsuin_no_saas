/** @jest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react';
import { useManagerShiftRequests } from '@/hooks/useManagerShiftRequests';
import { useManagerAssignedClinics } from '@/hooks/useManagerAssignedClinics';
import { api, isErrorResponse, isSuccessResponse } from '@/lib/api-client';

jest.mock('@/hooks/useManagerAssignedClinics', () => ({
  useManagerAssignedClinics: jest.fn(),
}));

jest.mock('@/lib/api-client', () => ({
  api: {
    managerStaff: {
      get: jest.fn(),
    },
  },
  handleApiError: jest.fn((error: { message: string }, fallback: string) =>
    error.message ? error.message : fallback
  ),
  isErrorResponse: jest.fn(),
  isSuccessResponse: jest.fn(),
}));

const useManagerAssignedClinicsMock = jest.mocked(useManagerAssignedClinics);
const managerStaffGetMock = jest.mocked(api.managerStaff.get);
const isSuccessResponseMock = jest.mocked(isSuccessResponse);
const isErrorResponseMock = jest.mocked(isErrorResponse);
const fetchMock = jest.fn<
  Promise<Response>,
  [RequestInfo | URL, RequestInit?]
>();

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useManagerShiftRequests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    useManagerAssignedClinicsMock.mockReturnValue({
      data: {
        generatedAt: '2026-06-12T03:00:00.000Z',
        clinics: [{ id: 'clinic-a', name: '池袋院' }],
      },
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
    managerStaffGetMock.mockResolvedValue({
      success: true,
      data: {
        generatedAt: '2026-06-12T03:00:00.000Z',
        clinics: [{ id: 'clinic-a', name: '池袋院' }],
        staff: [
          {
            staffId: 'staff-a',
            staffName: '佐藤 太郎',
            clinicId: 'clinic-a',
            clinicName: '池袋院',
            isActive: true,
            isBookable: true,
          },
        ],
      },
    });
    isSuccessResponseMock.mockImplementation(response => response.success);
    isErrorResponseMock.mockImplementation(response => !response.success);
    fetchMock.mockImplementation(input => {
      const url = String(input);
      if (url.startsWith('/api/staff/shift-request-periods')) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: {
              periods: [
                {
                  id: 'period-a',
                  clinic_id: 'clinic-a',
                  title: '7月前半',
                  period_start: '2026-07-01',
                  period_end: '2026-07-15',
                  submission_deadline: '2026-06-25T09:00:00.000Z',
                  status: 'open',
                },
                {
                  id: 'period-b',
                  clinic_id: 'clinic-a',
                  title: '7月後半',
                  period_start: '2026-07-16',
                  period_end: '2026-07-31',
                  submission_deadline: '2026-07-10T09:00:00.000Z',
                  status: 'draft',
                },
              ],
              total: 2,
            },
          })
        );
      }

      if (url.startsWith('/api/staff/shift-requests')) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: {
              requests: [],
              total: 0,
            },
          })
        );
      }

      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
  });

  it('applies PATCH result locally on approve without refetching the request list', async () => {
    const submittedRequest = {
      id: 'request-a',
      clinic_id: 'clinic-a',
      period_id: 'period-a',
      staff_id: 'staff-a',
      request_type: 'available',
      start_time: '2026-07-01T00:00:00.000Z',
      end_time: '2026-07-01T09:00:00.000Z',
      priority: 1,
      status: 'submitted',
      note: null,
      rejection_reason: null,
      converted_shift_id: null,
    };
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url.startsWith('/api/staff/shift-request-periods')) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: {
              periods: [
                {
                  id: 'period-a',
                  clinic_id: 'clinic-a',
                  title: '7月前半',
                  period_start: '2026-07-01',
                  period_end: '2026-07-15',
                  submission_deadline: '2026-06-25T09:00:00.000Z',
                  status: 'open',
                },
              ],
              total: 1,
            },
          })
        );
      }

      if (url === '/api/staff/shift-requests/request-a') {
        expect(init?.method).toBe('PATCH');
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: { ...submittedRequest, status: 'approved' },
          })
        );
      }

      if (url.startsWith('/api/staff/shift-requests?')) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: { requests: [submittedRequest], total: 1 },
          })
        );
      }

      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    const { result } = renderHook(() => useManagerShiftRequests());

    await waitFor(() => {
      expect(result.current.requests).toHaveLength(1);
    });

    fetchMock.mockClear();

    await act(async () => {
      await result.current.approveRequest('request-a');
    });

    expect(result.current.requests[0]?.status).toBe('approved');
    expect(result.current.message).toEqual({
      type: 'success',
      text: '承認しました。',
    });
    // 書き込み後は PATCH レスポンスで局所更新し、一覧の再取得を行わない
    expect(
      fetchMock.mock.calls.some(call =>
        String(call[0]).startsWith('/api/staff/shift-requests?')
      )
    ).toBe(false);
  });

  it('loads selected-clinic staff once and reloads only requests when period changes', async () => {
    const { result } = renderHook(() => useManagerShiftRequests());

    await waitFor(() => {
      expect(result.current.selectedPeriodId).toBe('period-a');
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(
          '/api/staff/shift-requests?clinic_id=clinic-a&period_id=period-a'
        ),
        undefined
      );
    });

    expect(managerStaffGetMock).toHaveBeenCalledWith({ clinicId: 'clinic-a' });
    expect(result.current.staffNameById.get('staff-a')).toBe('佐藤 太郎');

    fetchMock.mockClear();
    managerStaffGetMock.mockClear();

    act(() => {
      result.current.setSelectedPeriodId('period-b');
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(
          '/api/staff/shift-requests?clinic_id=clinic-a&period_id=period-b'
        ),
        undefined
      );
    });
    expect(
      fetchMock.mock.calls.some(call =>
        String(call[0]).startsWith('/api/staff/shift-request-periods')
      )
    ).toBe(false);
    expect(managerStaffGetMock).not.toHaveBeenCalled();

    fetchMock.mockClear();
    managerStaffGetMock.mockClear();

    await act(async () => {
      await result.current.refetch();
    });

    expect(managerStaffGetMock).toHaveBeenCalledWith({ clinicId: 'clinic-a' });
    expect(
      fetchMock.mock.calls.some(call =>
        String(call[0]).startsWith('/api/staff/shift-request-periods')
      )
    ).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        '/api/staff/shift-requests?clinic_id=clinic-a&period_id=period-b'
      ),
      undefined
    );
  });
});
