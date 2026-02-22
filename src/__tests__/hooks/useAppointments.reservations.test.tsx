/** @jest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import { useAppointments } from '@/app/reservations/hooks/useAppointments';
import type { Appointment } from '@/app/reservations/types';
import * as reservationApi from '@/app/reservations/api';

jest.mock('@/app/reservations/api', () => ({
  fetchReservations: jest.fn().mockResolvedValue([]),
  updateReservation: jest.fn().mockResolvedValue({ id: 'appt-1' }),
  cancelReservation: jest.fn().mockResolvedValue({
    id: 'appt-1',
    status: 'cancelled',
  }),
}));

const mockApi = reservationApi as jest.Mocked<typeof reservationApi>;

const baseAppointment: Appointment = {
  id: 'appt-1',
  resourceId: 'staff-1',
  date: '2026-02-22',
  startHour: 10,
  startMinute: 0,
  endHour: 11,
  endMinute: 0,
  title: '山田 太郎',
  menuId: 'menu-1',
  type: 'normal',
  color: 'blue',
  memo: '初回メモ',
  status: 'confirmed',
  selectedOptions: [],
};

describe('useAppointments reservation behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps notes in PATCH payload when moving appointment', async () => {
    const { result } = renderHook(() => useAppointments('clinic-1'));

    act(() => {
      result.current.addAppointment(baseAppointment);
    });

    await act(async () => {
      await result.current.moveAppointment('appt-1', 'staff-2', 9, 30);
    });

    expect(mockApi.updateReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: 'clinic-1',
        id: 'appt-1',
        notes: '初回メモ',
      })
    );
  });

  it('passes selectedOptions to updateReservation when moving appointment', async () => {
    const apptWithOptions: Appointment = {
      ...baseAppointment,
      id: 'appt-opts',
      selectedOptions: [
        {
          optionId: 'opt-1',
          name: '延長30分',
          priceDelta: 1000,
          durationDeltaMinutes: 30,
        },
      ],
    };
    const { result } = renderHook(() => useAppointments('clinic-1'));

    act(() => {
      result.current.addAppointment(apptWithOptions);
    });

    await act(async () => {
      await result.current.moveAppointment('appt-opts', 'staff-2', 9, 30);
    });

    expect(mockApi.updateReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedOptions: apptWithOptions.selectedOptions,
      })
    );
  });

  it('uses cancelReservation API for cancellation', async () => {
    const { result } = renderHook(() => useAppointments('clinic-1'));

    act(() => {
      result.current.addAppointment(baseAppointment);
    });

    await act(async () => {
      await result.current.cancelAppointment('appt-1');
    });

    expect(mockApi.cancelReservation).toHaveBeenCalledWith({
      clinicId: 'clinic-1',
      id: 'appt-1',
    });
  });

  it('does not call cancelReservation when appointment status is no_show', async () => {
    const noShowAppointment: Appointment = {
      ...baseAppointment,
      id: 'appt-noshow',
      status: 'no_show',
    };
    const { result } = renderHook(() => useAppointments('clinic-1'));

    act(() => {
      result.current.addAppointment(noShowAppointment);
    });

    await act(async () => {
      const res = await result.current.cancelAppointment('appt-noshow');
      expect(res.ok).toBe(true);
    });

    // 🔴 no_show は取消済み扱い — API を呼んではいけない
    expect(mockApi.cancelReservation).not.toHaveBeenCalled();
  });
});
