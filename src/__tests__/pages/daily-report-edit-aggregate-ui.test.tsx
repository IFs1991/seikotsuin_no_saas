/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import DailyReportEditPage from '@/app/(app)/daily-reports/edit/[id]/page';

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const reportId = '123e4567-e89b-12d3-a456-426614174010';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => ({ id: '123e4567-e89b-12d3-a456-426614174010' }),
}));

jest.mock('@/providers/user-profile-context', () => ({
  useUserProfileContext: () => ({
    profile: { clinicId: '123e4567-e89b-12d3-a456-426614174000' },
    loading: false,
    error: null,
  }),
}));

jest.mock('@/hooks/useActiveClinicId', () => ({
  useActiveClinicId: () => ({
    activeClinicId: '123e4567-e89b-12d3-a456-426614174000',
    activeClinicLoading: false,
  }),
}));

function mockReport(aggregateSource: 'manual' | 'items') {
  global.fetch = jest.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        success: true,
        data: {
          id: reportId,
          reportDate: '2026-06-30',
          staffName: '佐藤',
          totalPatients: 2,
          newPatients: 1,
          totalRevenue: 5000,
          insuranceRevenue: 3000,
          privateRevenue: 2000,
          reportText: null,
          aggregateSource,
          createdAt: '2026-06-30T09:00:00.000Z',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  ) as unknown as typeof fetch;
}

const aggregateFields = [
  '総患者数',
  '総売上（円）',
  '保険診療（円）',
  '自費診療（円）',
];

describe('DailyReportEditPage aggregate fields', () => {
  it('shows item-derived totals as read-only with an explanation', async () => {
    mockReport('items');
    render(<DailyReportEditPage />);

    const totalPatients = await screen.findByLabelText('総患者数');
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/daily-reports?clinic_id=${clinicId}&id=${reportId}`
    );
    for (const label of aggregateFields) {
      const input = screen.getByLabelText(label);
      expect(input).toBeDisabled();
      expect(input).toHaveAttribute(
        'aria-describedby',
        'aggregate-source-note'
      );
    }
    expect(totalPatients).toHaveValue(2);
    expect(screen.getByLabelText('新規患者数')).toBeEnabled();
    expect(
      screen.getByText(/日報明細から自動集計されるため、ここでは編集できません/)
    ).toBeInTheDocument();
  });

  it('keeps hand-entered totals editable for legacy manual reports', async () => {
    mockReport('manual');
    render(<DailyReportEditPage />);

    await screen.findByLabelText('総患者数');
    for (const label of aggregateFields) {
      const input = screen.getByLabelText(label);
      expect(input).toBeEnabled();
      expect(input).not.toHaveAttribute('aria-describedby');
    }
    expect(
      screen.getByText('日報の数値データを編集してください')
    ).toBeInTheDocument();
  });
});
