import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AppointmentDetail } from '@/app/(app)/reservations/components/AppointmentDetail';
import type { Appointment } from '@/app/(app)/reservations/types';

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
});
