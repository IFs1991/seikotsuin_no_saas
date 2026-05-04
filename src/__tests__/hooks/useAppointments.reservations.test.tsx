/** @jest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import { useAppointments } from '@/app/(app)/reservations/hooks/useAppointments';
import type { Appointment } from '@/app/(app)/reservations/types';
import * as reservationApi from '@/app/(app)/reservations/api';

jest.mock('@/app/(app)/reservations/api', () => ({
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

  it('ignores stale loadAppointments response that resolves after a newer call', async () => {
    type ReservationApiItem = Awaited<
      ReturnType<typeof reservationApi.fetchReservations>
    >[number];

    const oldRow: ReservationApiItem = {
      id: 'old-1',
      customerId: 'cust-old',
      customerName: '旧 太郎',
      menuId: 'menu-1',
      menuName: '整体',
      staffId: 'staff-1',
      staffName: '担当A',
      startTime: '2026-02-22T01:00:00.000Z',
      endTime: '2026-02-22T01:30:00.000Z',
      status: 'confirmed',
      channel: 'phone',
      selectedOptions: [],
    };
    const newRow: ReservationApiItem = {
      id: 'new-1',
      customerId: 'cust-new',
      customerName: '新 花子',
      menuId: 'menu-1',
      menuName: '整体',
      staffId: 'staff-1',
      staffName: '担当A',
      startTime: '2026-02-22T02:00:00.000Z',
      endTime: '2026-02-22T02:30:00.000Z',
      status: 'confirmed',
      channel: 'phone',
      selectedOptions: [],
    };

    let resolveOld: (rows: ReservationApiItem[]) => void = () => {};
    const oldPromise = new Promise<ReservationApiItem[]>(resolve => {
      resolveOld = resolve;
    });
    const newPromise = Promise.resolve([newRow]);

    mockApi.fetchReservations.mockReset();
    mockApi.fetchReservations
      .mockImplementationOnce(() => oldPromise)
      .mockImplementationOnce(() => newPromise);

    const { result } = renderHook(() => useAppointments('clinic-1'));

    await act(async () => {
      // 1) 古いリクエストを発行（まだ解決しない）
      const oldRun = result.current.loadAppointments(new Date('2026-02-22'));
      // 2) 新しいリクエストを発行して即解決
      await result.current.loadAppointments(new Date('2026-02-22'));
      // 3) その後で古いリクエストを解決させる
      resolveOld([oldRow]);
      await oldRun;
    });

    // 🔴 古い応答が後から来ても、新しい結果（new-1）が残っていること
    expect(result.current.appointments).toHaveLength(1);
    expect(result.current.appointments[0].id).toBe('new-1');
  });

  it('does not surface stale loadAppointments error after a newer success', async () => {
    type ReservationApiItem = Awaited<
      ReturnType<typeof reservationApi.fetchReservations>
    >[number];

    const newRow: ReservationApiItem = {
      id: 'new-2',
      customerId: 'cust-new',
      customerName: '新 花子',
      menuId: 'menu-1',
      menuName: '整体',
      staffId: 'staff-1',
      staffName: '担当A',
      startTime: '2026-02-22T02:00:00.000Z',
      endTime: '2026-02-22T02:30:00.000Z',
      status: 'confirmed',
      channel: 'phone',
      selectedOptions: [],
    };

    let rejectOld: (err: Error) => void = () => {};
    const oldPromise = new Promise<ReservationApiItem[]>((_, reject) => {
      rejectOld = reject;
    });
    const newPromise = Promise.resolve([newRow]);

    mockApi.fetchReservations.mockReset();
    mockApi.fetchReservations
      .mockImplementationOnce(() => oldPromise)
      .mockImplementationOnce(() => newPromise);

    const { result } = renderHook(() => useAppointments('clinic-1'));

    await act(async () => {
      const oldRun = result.current.loadAppointments(new Date('2026-02-22'));
      await result.current.loadAppointments(new Date('2026-02-22'));
      // 後から古いリクエストが失敗
      rejectOld(new Error('old request failed'));
      await oldRun.catch(() => {});
    });

    // 🔴 古いリクエストの失敗で新しい成功結果が消えてはいけない
    expect(result.current.error).toBeNull();
    expect(result.current.appointments).toHaveLength(1);
    expect(result.current.appointments[0].id).toBe('new-2');
    // ローディング状態も新しいリクエスト終了時の false が維持される
    expect(result.current.loading).toBe(false);
  });
});
