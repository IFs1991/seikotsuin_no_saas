/** @jest-environment jsdom */

import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useStaffAnalysis } from '@/hooks/useStaffAnalysis';
import { SelectedClinicProvider } from '@/providers/selected-clinic-context';
import { UserProfileProvider } from '@/providers/user-profile-context';

const mockFetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

beforeAll(() => {
  global.fetch = mockFetch;
});

beforeEach(() => {
  mockFetch.mockReset();
});

function createSuccessResponse() {
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        staffMetrics: {
          dailyPatients: 0,
          totalRevenue: 0,
          averageSatisfaction: 0,
        },
        revenueRanking: [],
        satisfactionCorrelation: [],
        performanceTrends: {},
        shiftAnalysis: undefined,
        totalStaff: 0,
        activeStaff: 0,
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

describe('useStaffAnalysis', () => {
  it('Clinicセレクタ読み込み中はprofile clinicへフォールバックして取得しない', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <UserProfileProvider
        value={{
          profile: {
            id: 'manager-user',
            email: 'manager@example.com',
            role: 'manager',
            clinicId: 'profile-clinic',
            isActive: true,
            isAdmin: false,
          },
          loading: false,
          error: null,
        }}
      >
        <SelectedClinicProvider
          initialClinicId={null}
          currentClinicId={null}
          clinics={[]}
          clinicsLoading={true}
        >
          {children}
        </SelectedClinicProvider>
      </UserProfileProvider>
    );

    const { result } = renderHook(() => useStaffAnalysis(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('Clinicセレクタがある場合は選択Clinicでスタッフ分析を取得する', async () => {
    const selectedClinicId = 'selected-clinic';
    mockFetch.mockResolvedValueOnce(createSuccessResponse());

    const wrapper = ({ children }: { children: ReactNode }) => (
      <UserProfileProvider
        value={{
          profile: {
            id: 'manager-user',
            email: 'manager@example.com',
            role: 'manager',
            clinicId: 'profile-clinic',
            isActive: true,
            isAdmin: false,
          },
          loading: false,
          error: null,
        }}
      >
        <SelectedClinicProvider
          initialClinicId={selectedClinicId}
          currentClinicId={selectedClinicId}
          clinics={[{ id: selectedClinicId, name: '担当Clinic' }]}
        >
          {children}
        </SelectedClinicProvider>
      </UserProfileProvider>
    );

    const { result } = renderHook(() => useStaffAnalysis(), { wrapper });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/staff?clinic_id=${selectedClinicId}`
      );
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });
});
