'use client';
import { useEffect, useState } from 'react';
import {
  fetchReservations,
  type ReservationApiItem,
} from '@/app/(app)/reservations/api';
import {
  addJSTCalendarDays,
  parseJSTDateStart,
  toJSTDateString,
} from '@/lib/jst';

export type ReservationListItem = Omit<
  ReservationApiItem,
  'startTime' | 'endTime'
> & { startTime: Date; endTime: Date };

export function useReservations(clinicId: string | null, date: Date) {
  const [reservations, setReservations] = useState<ReservationListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dateKey = toJSTDateString(date);
  useEffect(() => {
    const controller = new AbortController();
    setReservations([]);
    setError(null);
    setLoading(Boolean(clinicId));
    if (!clinicId) return () => controller.abort();
    const start = parseJSTDateStart(dateKey);
    const end = new Date(
      parseJSTDateStart(addJSTCalendarDays(dateKey, 1)).getTime() - 1
    );
    const load = async () => {
      try {
        const rows = await fetchReservations(clinicId, start, end, undefined, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted)
          setReservations(
            rows.map(row => ({
              ...row,
              startTime: new Date(row.startTime),
              endTime: new Date(row.endTime),
            }))
          );
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : '予約の取得に失敗しました'
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [clinicId, dateKey]);
  return { reservations, loading, error };
}
