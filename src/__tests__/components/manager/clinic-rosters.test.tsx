/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ClinicRosters } from '@/components/manager/clinic-rosters';
import { useClinicRosters } from '@/hooks/useClinicRosters';
import type { UseClinicRostersResult } from '@/hooks/useClinicRosters';

jest.mock('@/hooks/useClinicRosters', () => ({
  useClinicRosters: jest.fn(),
}));

const useClinicRostersMock = jest.mocked(useClinicRosters);
const setSelectedClinicId = jest.fn();
const setSelectedMonth = jest.fn();
const setSelectedDate = jest.fn();
const assignCandidate = jest.fn().mockResolvedValue(undefined);
const refetch = jest.fn().mockResolvedValue(undefined);

function baseState(): UseClinicRostersResult {
  return {
    clinics: [{ id: 'clinic-a', name: '池袋院' }],
    selectedClinicId: 'clinic-a',
    selectedMonth: '2026-07',
    selectedDate: '2026-07-01',
    candidates: [
      {
        candidate_id: 'request-a',
        staff_id: 'staff-b',
        staff_name: '田中 花子',
        clinic_id: 'clinic-a',
        clinic_name: '池袋院',
        source_shift_request_id: 'request-a',
        request_type: 'preferred',
        priority: 5,
        start_time: '2026-07-01T06:00:00.000Z',
        end_time: '2026-07-01T13:30:00.000Z',
        note: '午後希望',
        conflict_messages: [],
      },
    ],
    blockedCandidateCount: 1,
    days: [
      {
        date: '2026-07-01',
        shifts: [
          {
            shift_id: 'shift-a',
            staff_id: 'staff-a',
            staff_profile_id: null,
            staff_name: '佐藤 太郎',
            home_clinic_id: 'clinic-a',
            home_clinic_name: '池袋院',
            work_clinic_id: 'clinic-a',
            work_clinic_name: '池袋院',
            assignment_type: 'regular',
            time_preset: null,
            start_time: '2026-07-01T01:45:00.000Z',
            end_time: '2026-07-01T13:30:00.000Z',
            status: 'confirmed',
            notes: '終日',
          },
        ],
      },
      {
        date: '2026-07-02',
        shifts: [],
      },
    ],
    matrixRows: [
      {
        staffId: 'staff-a',
        staffName: '佐藤 太郎',
        cells: [
          {
            date: '2026-07-01',
            label: '10:45',
            shifts: [],
          },
          {
            date: '2026-07-02',
            label: '',
            shifts: [],
          },
        ],
      },
    ],
    totalShifts: 1,
    loading: false,
    candidateLoading: false,
    assigningCandidateId: null,
    message: null,
    setSelectedClinicId,
    setSelectedMonth,
    setSelectedDate,
    assignCandidate,
    refetch,
  };
}

describe('ClinicRosters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useClinicRostersMock.mockReturnValue(baseState());
  });

  it('renders read-only roster days and staff matrix', () => {
    render(<ClinicRosters />);

    expect(screen.getByText('院別日別ロスター')).toBeInTheDocument();
    expect(screen.getAllByText('佐藤 太郎')).not.toHaveLength(0);
    expect(screen.getByText('10:45-22:30')).toBeInTheDocument();
    expect(screen.getByText('1名確定')).toBeInTheDocument();
    expect(screen.getByText('未配置')).toBeInTheDocument();
    expect(screen.getByText('スタッフ別マトリクス')).toBeInTheDocument();
    expect(screen.getByText('候補パネル')).toBeInTheDocument();
    expect(screen.getByText('田中 花子')).toBeInTheDocument();
    expect(screen.getByText('優先希望')).toBeInTheDocument();
    expect(screen.getByText(/1件は休み希望/)).toBeInTheDocument();
  });

  it('calls filter and refresh handlers', () => {
    render(<ClinicRosters />);

    fireEvent.change(screen.getByLabelText('対象月'), {
      target: { value: '2026-08' },
    });
    expect(setSelectedMonth).toHaveBeenCalledWith('2026-08');

    fireEvent.click(screen.getByRole('button', { name: /再読み込み/ }));
    expect(refetch).toHaveBeenCalledTimes(1);

    const selectCandidateButtons = screen.getAllByRole('button', {
      name: '候補',
    });
    fireEvent.click(selectCandidateButtons[1]);
    expect(setSelectedDate).toHaveBeenCalledWith('2026-07-02');
  });

  it('assigns a same-clinic candidate with an afternoon preset', () => {
    render(<ClinicRosters />);

    fireEvent.click(screen.getByRole('button', { name: '午後から' }));

    expect(assignCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ candidate_id: 'request-a' }),
      'afternoon'
    );
  });
});
