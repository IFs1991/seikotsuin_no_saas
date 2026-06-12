/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ManagerShiftRequests } from '@/components/manager/manager-shift-requests';
import { useManagerShiftRequests } from '@/hooks/useManagerShiftRequests';
import type { UseManagerShiftRequestsResult } from '@/hooks/useManagerShiftRequests';

jest.mock('@/hooks/useManagerShiftRequests', () => ({
  useManagerShiftRequests: jest.fn(),
}));

const useManagerShiftRequestsMock = jest.mocked(useManagerShiftRequests);
const approveRequest = jest.fn().mockResolvedValue(undefined);
const rejectRequest = jest.fn().mockResolvedValue(undefined);
const convertSelectedRequests = jest.fn().mockResolvedValue(undefined);
const refetch = jest.fn().mockResolvedValue(undefined);
const setRejectionReason = jest.fn();
const setSelectedClinicId = jest.fn();
const setSelectedPeriodId = jest.fn();
const toggleRequestSelection = jest.fn();

function baseState(): UseManagerShiftRequestsResult {
  return {
    clinics: [{ id: 'clinic-a', name: '池袋院' }],
    staffNameById: new Map([['staff-a', '佐藤 太郎']]),
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
    requests: [
      {
        id: 'request-submitted',
        clinic_id: 'clinic-a',
        period_id: 'period-a',
        staff_id: 'staff-a',
        request_type: 'available',
        start_time: '2026-07-01T00:00:00.000Z',
        end_time: '2026-07-01T09:00:00.000Z',
        priority: 3,
        status: 'submitted',
        note: '午前希望',
        rejection_reason: null,
        converted_shift_id: null,
      },
      {
        id: 'request-approved',
        clinic_id: 'clinic-a',
        period_id: 'period-a',
        staff_id: 'staff-a',
        request_type: 'preferred',
        start_time: '2026-07-02T00:00:00.000Z',
        end_time: '2026-07-02T09:00:00.000Z',
        priority: 4,
        status: 'approved',
        note: null,
        rejection_reason: null,
        converted_shift_id: null,
      },
    ],
    selectedClinicId: 'clinic-a',
    selectedPeriodId: 'period-a',
    rejectionReasons: { 'request-submitted': '人数過多' },
    selectedRequestIds: ['request-approved'],
    loading: false,
    message: null,
    setSelectedClinicId,
    setSelectedPeriodId,
    setRejectionReason,
    toggleRequestSelection,
    approveRequest,
    rejectRequest,
    convertSelectedRequests,
    refetch,
  };
}

describe('ManagerShiftRequests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useManagerShiftRequestsMock.mockReturnValue(baseState());
  });

  it('renders review actions and no period creation UI', () => {
    render(<ManagerShiftRequests />);

    expect(screen.getByText('担当院希望シフト')).toBeInTheDocument();
    expect(screen.getAllByText('佐藤 太郎')).not.toHaveLength(0);
    expect(screen.getByText('勤務可能')).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('button', { name: /承認/ })
        .some(button => !button.hasAttribute('disabled'))
    ).toBe(true);
    expect(
      screen
        .getAllByRole('button', { name: /却下/ })
        .some(button => !button.hasAttribute('disabled'))
    ).toBe(true);
    expect(screen.getByRole('button', { name: /シフトに変換/ })).toBeEnabled();
    expect(screen.queryByText('提出期間作成')).not.toBeInTheDocument();
    expect(screen.queryByText('受付開始')).not.toBeInTheDocument();
    expect(screen.queryByText('締切')).not.toBeInTheDocument();
  });

  it('calls review and conversion handlers', () => {
    render(<ManagerShiftRequests />);

    const approveButton = screen
      .getAllByRole('button', { name: /承認/ })
      .find(button => !button.hasAttribute('disabled'));
    if (!approveButton) throw new Error('expected enabled approve button');
    fireEvent.click(approveButton);
    expect(approveRequest).toHaveBeenCalledWith('request-submitted');

    fireEvent.change(screen.getByLabelText('request-submitted の却下理由'), {
      target: { value: '別日に調整' },
    });
    expect(setRejectionReason).toHaveBeenCalledWith(
      'request-submitted',
      '別日に調整'
    );

    const rejectButton = screen
      .getAllByRole('button', { name: /却下/ })
      .find(button => !button.hasAttribute('disabled'));
    if (!rejectButton) throw new Error('expected enabled reject button');
    fireEvent.click(rejectButton);
    expect(rejectRequest).toHaveBeenCalledWith('request-submitted');

    fireEvent.click(screen.getByRole('button', { name: /シフトに変換/ }));
    expect(convertSelectedRequests).toHaveBeenCalledTimes(1);
  });
});
