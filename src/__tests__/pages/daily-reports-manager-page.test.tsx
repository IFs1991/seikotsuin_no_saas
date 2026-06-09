/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DailyReportsPage from '@/app/(app)/daily-reports/page';
import { useAccessibleClinics } from '@/hooks/useAccessibleClinics';
import { useUserProfileContext } from '@/providers/user-profile-context';
import { api, isSuccessResponse } from '@/lib/api-client';

jest.mock('@/hooks/useAccessibleClinics', () => ({
  useAccessibleClinics: jest.fn(),
}));

jest.mock('@/providers/user-profile-context', () => ({
  useUserProfileContext: jest.fn(),
}));

jest.mock('@/lib/api-client', () => ({
  api: {
    clinics: {
      getAccessible: jest.fn(),
    },
    dailyReports: {
      get: jest.fn(),
    },
    managerDailyReports: {
      getOverview: jest.fn(),
    },
  },
  isSuccessResponse: jest.fn(),
  isErrorResponse: jest.fn(),
  handleApiError: jest.fn(),
}));

const useAccessibleClinicsMock = jest.mocked(useAccessibleClinics);
const useUserProfileContextMock = jest.mocked(useUserProfileContext);
const isSuccessResponseMock = jest.mocked(isSuccessResponse);
const getOverviewMock = jest.mocked(api.managerDailyReports.getOverview);
const getDailyReportsMock = jest.mocked(api.dailyReports.get);

const clinicA = '123e4567-e89b-12d3-a456-426614174000';
const clinicB = '123e4567-e89b-12d3-a456-426614174001';

function mockProfile(role: string) {
  useUserProfileContextMock.mockReturnValue({
    profile: {
      id: `${role}-user`,
      email: `${role}@example.com`,
      role,
      clinicId: role === 'manager' ? null : clinicA,
      clinicName: role === 'manager' ? null : '新宿院',
      isActive: true,
      isAdmin: role === 'admin',
    },
    loading: false,
    error: null,
  });
}

function mockAccessibleClinics(clinics: Array<{ id: string; name: string }>) {
  useAccessibleClinicsMock.mockReturnValue({
    clinics,
    currentClinicId: clinics[0]?.id ?? null,
    loading: false,
    error: null,
  });
}

function mockManagerOverview() {
  getOverviewMock.mockResolvedValue({
    success: true,
    data: {
      clinic: { id: clinicA, name: '新宿院' },
      period: { startDate: '2026-06-03', endDate: '2026-06-09' },
      summary: {
        totalRevenue: 100000,
        averageRevenue: 25000,
        patientCount: 20,
        averageRevenuePerPatient: 5000,
        missingReportDays: 1,
        needsReviewDays: 2,
      },
      timeline: [
        {
          date: '2026-06-09',
          totalRevenue: 100000,
          insuranceRevenue: 60000,
          privateRevenue: 40000,
          patientCount: 20,
          averageRevenuePerPatient: 5000,
        },
      ],
      reports: [
        {
          id: 'report-1',
          date: '2026-06-09',
          status: 'submitted',
          totalRevenue: 100000,
          patientCount: 20,
          averageRevenuePerPatient: 5000,
          updatedAt: '2026-06-09T09:00:00.000Z',
        },
      ],
    },
  });
  isSuccessResponseMock.mockImplementation(
    response => response.success === true
  );
}

describe('DailyReportsPage manager read-only mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfile('manager');
    mockAccessibleClinics([{ id: clinicA, name: '新宿院' }]);
    mockManagerOverview();
  });

  it('manager does not see daily report write actions', async () => {
    render(<DailyReportsPage />);

    await waitFor(() => {
      expect(
        screen.getByText('担当院の日報と売上推移を確認します。')
      ).toBeInTheDocument();
    });

    expect(screen.queryByText('日報を入力')).not.toBeInTheDocument();
    expect(screen.queryByText('編集')).not.toBeInTheDocument();
    expect(screen.queryByText('削除')).not.toBeInTheDocument();
  });

  it('manager with zero assigned clinics sees the empty state without overview request', () => {
    mockAccessibleClinics([]);

    render(<DailyReportsPage />);

    expect(
      screen.getByText(
        '担当院がまだ割り当てられていません。管理者に担当院の設定を依頼してください。'
      )
    ).toBeInTheDocument();
    expect(getOverviewMock).not.toHaveBeenCalled();
  });

  it('manager with one assigned clinic auto-selects it', async () => {
    render(<DailyReportsPage />);

    await waitFor(() => {
      expect(getOverviewMock).toHaveBeenCalledWith(
        expect.objectContaining({ clinicId: clinicA })
      );
    });
  });

  it('manager with multiple assigned clinics can select the target clinic', async () => {
    mockAccessibleClinics([
      { id: clinicA, name: '新宿院' },
      { id: clinicB, name: '横浜院' },
    ]);

    render(<DailyReportsPage />);

    const selector = screen.getByLabelText('担当院');
    fireEvent.change(selector, { target: { value: clinicB } });

    await waitFor(() => {
      expect(getOverviewMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ clinicId: clinicB })
      );
    });
  });

  it('manager can change status and period filters', async () => {
    render(<DailyReportsPage />);

    fireEvent.change(screen.getByLabelText('ステータス'), {
      target: { value: 'needs_review' },
    });
    fireEvent.change(screen.getByLabelText('期間'), {
      target: { value: 'today' },
    });

    await waitFor(() => {
      expect(getOverviewMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'needs_review',
        })
      );
    });
  });

  it('non-manager still sees the existing daily report input flow', async () => {
    mockProfile('staff');
    useAccessibleClinicsMock.mockReturnValue({
      clinics: [],
      currentClinicId: null,
      loading: false,
      error: null,
    });
    getDailyReportsMock.mockResolvedValue({
      success: true,
      data: {
        reports: [],
        summary: null,
        monthlyTrends: [],
      },
    });

    render(<DailyReportsPage />);

    expect(screen.getByText('日報を入力')).toBeInTheDocument();
    await waitFor(() => {
      expect(getDailyReportsMock).toHaveBeenCalledTimes(1);
    });
    expect(getOverviewMock).not.toHaveBeenCalled();
  });
});
