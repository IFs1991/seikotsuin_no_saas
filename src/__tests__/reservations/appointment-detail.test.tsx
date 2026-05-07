import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AppointmentDetail } from '@/app/(app)/reservations/components/AppointmentDetail';
import type { Appointment } from '@/app/(app)/reservations/types';
import { fetchCustomerReservations } from '@/app/(app)/reservations/api';

jest.mock('@/app/(app)/reservations/api', () => ({
  fetchCustomerReservations: jest.fn(),
}));

const fetchCustomerReservationsMock = fetchCustomerReservations as jest.Mock;

const appointment: Appointment = {
  id: 'reservation-1',
  resourceId: 'staff-1',
  date: '2026-04-27',
  startHour: 10,
  startMinute: 0,
  endHour: 10,
  endMinute: 30,
  title: '山田 太郎',
  lastName: '山田',
  firstName: '太郎',
  menuId: 'menu-1',
  subTitle: '整体',
  type: 'normal',
  color: 'blue',
  status: 'confirmed',
  customerId: 'customer-1',
};

const defaultProps = {
  clinicId: 'clinic-1',
  appointment,
  resources: [{ id: 'staff-1', name: '田中先生', type: 'staff' as const }],
  menus: [{ id: 'menu-1', name: '整体', durationMinutes: 30, price: 3000 }],
  options: [],
  onClose: jest.fn(),
  onUpdate: jest.fn().mockResolvedValue({ ok: true }),
};

describe('AppointmentDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('予約詳細から来院済み・来院なし・キャンセルへステータス更新できる', async () => {
    const onUpdate = jest.fn().mockResolvedValue({ ok: true });

    render(<AppointmentDetail {...defaultProps} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: '来院済み' }));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'arrived', color: 'purple' })
      )
    );

    fireEvent.click(screen.getByRole('button', { name: '来院なし' }));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'no_show', color: 'grey' })
      )
    );

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'cancelled', color: 'grey' })
      )
    );
  });

  it('現在のステータスと同じステータスボタンは無効化される', () => {
    render(
      <AppointmentDetail
        {...defaultProps}
        appointment={{ ...appointment, status: 'arrived', color: 'purple' }}
      />
    );

    expect(screen.getByRole('button', { name: '来院済み' })).toBeDisabled();
  });

  it('予約詳細から患者の予約履歴を開ける', async () => {
    fetchCustomerReservationsMock.mockResolvedValueOnce([
      {
        id: 'reservation-old',
        customerId: 'customer-1',
        customerName: '山田 太郎',
        menuId: 'menu-1',
        menuName: '整体',
        staffId: 'staff-1',
        staffName: '田中先生',
        startTime: '2026-04-20T10:00:00.000Z',
        endTime: '2026-04-20T10:30:00.000Z',
        status: 'no_show',
        channel: 'phone',
        selectedOptions: [],
      },
    ]);

    render(<AppointmentDetail {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: '予約履歴' }));

    await waitFor(() => {
      expect(fetchCustomerReservationsMock).toHaveBeenCalledWith(
        'clinic-1',
        'customer-1'
      );
    });
    await waitFor(() => {
      expect(screen.getAllByText('整体').length).toBeGreaterThan(1);
    });
    expect(screen.getAllByText('来院なし').length).toBeGreaterThan(1);
    expect(screen.getAllByText('田中先生').length).toBeGreaterThan(1);
  });

  it('指名予約の場合は詳細に指名状態と指名料を表示する', () => {
    render(
      <AppointmentDetail
        {...defaultProps}
        appointment={{
          ...appointment,
          isStaffRequested: true,
          staffNominationFee: 1200,
        }}
      />
    );

    expect(screen.getByText('指名')).toBeInTheDocument();
    expect(screen.getByText('指名料 1,200円')).toBeInTheDocument();
  });

  it('閲覧専用では編集・ステータス更新・患者詳細への遷移を出さない', () => {
    render(<AppointmentDetail {...defaultProps} readOnly />);

    expect(screen.getByText('他院の予約は閲覧専用です。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '来院済み' })).toBeNull();
    expect(screen.queryByRole('button', { name: '編集' })).toBeNull();
    expect(screen.queryByRole('link', { name: '患者詳細' })).toBeNull();
  });
});
