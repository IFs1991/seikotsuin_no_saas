/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ManagerClinicComparison } from '@/components/manager/manager-clinic-comparison';
import { useManagerClinicComparison } from '@/hooks/useManagerClinicComparison';
import type { UseManagerClinicComparisonResult } from '@/hooks/useManagerClinicComparison';

jest.mock('@/hooks/useManagerClinicComparison', () => ({
  useManagerClinicComparison: jest.fn(),
}));

const useManagerClinicComparisonMock = jest.mocked(useManagerClinicComparison);
const refetch = jest.fn().mockResolvedValue(undefined);
const setPeriod = jest.fn();
const setStartDate = jest.fn();
const setEndDate = jest.fn();
const setCompare = jest.fn();

function createHookState(
  overrides: Partial<UseManagerClinicComparisonResult> = {}
): UseManagerClinicComparisonResult {
  return {
    data: {
      generatedAt: '2026-06-13T00:00:00.000Z',
      period: {
        preset: 'custom',
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        bucket: 'daily',
        compare: 'previous_period',
      },
      clinics: [
        { id: 'clinic-a', name: '池袋院' },
        { id: 'clinic-b', name: '横浜院' },
      ],
      rows: [
        {
          clinicId: 'clinic-a',
          clinicName: '池袋院',
          totalRevenue: 150000,
          reservationCount: 12,
          completedReservationCount: 9,
          cancellationRate: 8.33,
          revenueChangeRate: 25,
          reservationChangeRate: -10,
        },
      ],
      disclaimers: ['売上は日報入力に基づく経営分析用の集計です。'],
    },
    loading: false,
    error: null,
    period: 'custom',
    setPeriod,
    startDate: '2026-06-01',
    setStartDate,
    endDate: '2026-06-30',
    setEndDate,
    compare: 'previous_period',
    setCompare,
    refetch,
    ...overrides,
  };
}

describe('ManagerClinicComparison', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useManagerClinicComparisonMock.mockReturnValue(createHookState());
  });

  it('renders read-only clinic comparison metrics', () => {
    render(<ManagerClinicComparison />);

    expect(screen.getByText('担当院比較分析')).toBeInTheDocument();
    expect(screen.getAllByText('池袋院')).not.toHaveLength(0);
    expect(screen.getAllByText('￥150,000')).not.toHaveLength(0);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('+25.00%')).toBeInTheDocument();
    expect(screen.queryByText('編集')).not.toBeInTheDocument();
    expect(screen.queryByText('削除')).not.toBeInTheDocument();
    expect(screen.queryByText('保存')).not.toBeInTheDocument();
  });

  it('updates filters and shows empty assignment state', () => {
    const { rerender } = render(<ManagerClinicComparison />);

    fireEvent.change(screen.getByLabelText('期間'), {
      target: { value: 'year' },
    });
    fireEvent.change(screen.getByLabelText('比較'), {
      target: { value: 'none' },
    });

    expect(setPeriod).toHaveBeenCalledWith('year');
    expect(setCompare).toHaveBeenCalledWith('none');

    useManagerClinicComparisonMock.mockReturnValue(
      createHookState({
        data: {
          generatedAt: '2026-06-13T00:00:00.000Z',
          period: {
            preset: 'month',
            startDate: '2026-06-01',
            endDate: '2026-06-30',
            bucket: 'daily',
            compare: 'previous_period',
          },
          clinics: [],
          rows: [],
          disclaimers: [],
        },
      })
    );
    rerender(<ManagerClinicComparison />);

    expect(
      screen.getByText('担当院がまだ設定されていません。')
    ).toBeInTheDocument();
  });
});
