/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ManagerStaffList } from '@/components/manager/manager-staff-list';
import { useManagerStaffList } from '@/hooks/useManagerStaffList';
import type { ManagerStaffListResponse } from '@/types/manager-staff-list';

jest.mock('@/hooks/useManagerStaffList', () => ({
  useManagerStaffList: jest.fn(),
}));

const useManagerStaffListMock = jest.mocked(useManagerStaffList);
const refetch = jest.fn().mockResolvedValue(undefined);
const setSelectedClinicId = jest.fn();

const data: ManagerStaffListResponse = {
  generatedAt: '2026-06-12T03:00:00.000Z',
  clinics: [{ id: 'clinic-a', name: '池袋院' }],
  staff: [
    {
      staffId: 'staff-a',
      staffName: '佐藤 太郎',
      clinicId: 'clinic-a',
      clinicName: '池袋院',
      isActive: true,
      isBookable: false,
    },
  ],
};

describe('ManagerStaffList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useManagerStaffListMock.mockReturnValue({
      data,
      loading: false,
      error: null,
      selectedClinicId: '',
      setSelectedClinicId,
      refetch,
    });
  });

  it('renders read-only staff list without personal contacts or write actions', () => {
    render(<ManagerStaffList />);

    expect(screen.getByText('担当院スタッフ一覧')).toBeInTheDocument();
    expect(screen.getByText('佐藤 太郎')).toBeInTheDocument();
    expect(screen.getAllByText('池袋院')).not.toHaveLength(0);
    expect(screen.queryByText('email')).not.toBeInTheDocument();
    expect(screen.queryByText('phone')).not.toBeInTheDocument();
    expect(screen.queryByText('編集')).not.toBeInTheDocument();
    expect(screen.queryByText('招待')).not.toBeInTheDocument();
    expect(screen.queryByText('無効化')).not.toBeInTheDocument();
  });

  it('changes clinic filter and shows empty assignment state', () => {
    const { rerender } = render(<ManagerStaffList />);

    fireEvent.change(screen.getByLabelText('院'), {
      target: { value: 'clinic-a' },
    });
    expect(setSelectedClinicId).toHaveBeenCalledWith('clinic-a');

    useManagerStaffListMock.mockReturnValue({
      data: { ...data, clinics: [], staff: [] },
      loading: false,
      error: null,
      selectedClinicId: '',
      setSelectedClinicId,
      refetch,
    });
    rerender(<ManagerStaffList />);

    expect(
      screen.getByText('担当院がまだ設定されていません。')
    ).toBeInTheDocument();
  });
});
