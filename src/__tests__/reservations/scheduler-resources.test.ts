import {
  buildAppointmentResourceIds,
  buildSchedulerResources,
  type ReservationFormResource,
} from '@/app/(app)/reservations/utils/scheduler-resources';
import type { Appointment } from '@/app/(app)/reservations/types';

const baseResource = {
  maxConcurrent: 1,
  nominationFee: 0,
  isActive: true,
  isBookable: true,
} satisfies Pick<
  ReservationFormResource,
  'maxConcurrent' | 'nominationFee' | 'isActive' | 'isBookable'
>;

describe('buildSchedulerResources', () => {
  it('confirmed shift staff and facilities are shown', () => {
    const resources = buildSchedulerResources(
      [
        { ...baseResource, id: 'staff-1', name: '勤務スタッフ', type: 'staff' },
        {
          ...baseResource,
          id: 'staff-2',
          name: '非勤務スタッフ',
          type: 'staff',
        },
        { ...baseResource, id: 'bed-1', name: 'ベッド1', type: 'bed' },
      ],
      {
        scheduledStaffIds: new Set(['staff-1']),
        appointmentResourceIds: new Set(),
      }
    );

    expect(resources.map(resource => resource.id)).toEqual([
      'staff-1',
      'bed-1',
    ]);
  });

  it('keeps staff with existing appointments even without a shift', () => {
    const appointments: Appointment[] = [
      {
        id: 'appointment-1',
        resourceId: 'staff-2',
        date: '2026-05-14',
        startHour: 10,
        startMinute: 0,
        endHour: 10,
        endMinute: 30,
        title: '既存予約',
        type: 'normal',
        color: 'blue',
      },
    ];

    const resources = buildSchedulerResources(
      [
        { ...baseResource, id: 'staff-1', name: '勤務スタッフ', type: 'staff' },
        {
          ...baseResource,
          id: 'staff-2',
          name: '予約ありスタッフ',
          type: 'staff',
        },
      ],
      {
        scheduledStaffIds: new Set(['staff-1']),
        appointmentResourceIds: buildAppointmentResourceIds(appointments),
      }
    );

    expect(resources.map(resource => resource.id)).toEqual([
      'staff-1',
      'staff-2',
    ]);
    expect(
      resources.find(resource => resource.id === 'staff-2')?.subLabel
    ).toBe('シフト未設定');
  });
});
