import {
  formatAppointmentTime,
  getAppointmentStatusLabel,
  groupAppointmentsByResource,
  summarizeAppointments,
} from '@/app/(app)/reservations/utils/view';
import type { Appointment } from '@/app/(app)/reservations/types';

const appointment = (overrides: Partial<Appointment>): Appointment => ({
  id: overrides.id ?? 'reservation-1',
  resourceId: overrides.resourceId ?? 'staff-1',
  date: '2026-04-26',
  startHour: overrides.startHour ?? 9,
  startMinute: overrides.startMinute ?? 0,
  endHour: overrides.endHour ?? 10,
  endMinute: overrides.endMinute ?? 0,
  title: overrides.title ?? '山田 太郎',
  type: overrides.type ?? 'normal',
  color: overrides.color ?? 'blue',
  status: overrides.status,
});

describe('reservation view utils', () => {
  it('既存ステータスから画面表示ラベルを返す', () => {
    expect(
      getAppointmentStatusLabel(appointment({ status: 'unconfirmed' }))
    ).toBe('未確定');
    expect(getAppointmentStatusLabel(appointment({ status: 'arrived' }))).toBe(
      '来院済み'
    );
    expect(getAppointmentStatusLabel(appointment({ type: 'blocked' }))).toBe(
      'ブロック'
    );
  });

  it('予約時間を一覧とカードで使える表記に整形する', () => {
    expect(
      formatAppointmentTime(
        appointment({
          startHour: 9,
          startMinute: 5,
          endHour: 10,
          endMinute: 30,
        })
      )
    ).toBe('09:05-10:30');
  });

  it('リソース別に予約をまとめる', () => {
    const grouped = groupAppointmentsByResource([
      appointment({ id: 'a', resourceId: 'staff-1' }),
      appointment({ id: 'b', resourceId: 'staff-2' }),
      appointment({ id: 'c', resourceId: 'staff-1' }),
    ]);

    expect(grouped.get('staff-1')).toHaveLength(2);
    expect(grouped.get('staff-2')).toHaveLength(1);
  });

  it('DB追加なしで当日サマリに必要な件数を集計する', () => {
    expect(
      summarizeAppointments([
        appointment({ id: 'a', status: 'confirmed', resourceId: 'staff-1' }),
        appointment({ id: 'b', status: 'unconfirmed', resourceId: 'staff-1' }),
        appointment({ id: 'c', status: 'tentative', resourceId: 'staff-2' }),
        appointment({ id: 'd', status: 'arrived', resourceId: 'staff-2' }),
        appointment({ id: 'e', status: 'completed', resourceId: 'staff-3' }),
        appointment({ id: 'f', status: 'cancelled', resourceId: 'staff-3' }),
        appointment({ id: 'g', status: 'no_show', resourceId: 'staff-4' }),
      ])
    ).toEqual({
      total: 7,
      active: 5,
      unconfirmed: 2,
      arrived: 1,
      completed: 1,
      cancelled: 2,
      assignedResources: 4,
    });
  });
});
