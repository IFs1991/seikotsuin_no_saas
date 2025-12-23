'use client';

import { useEffect, useState } from 'react';
import type { Reservation } from '@/types/reservation';

export interface ReservationListItem extends Reservation {
  customerName?: string;
  menuName?: string;
  staffName?: string;
}

export function useReservations(clinicId: string | null, date: Date) {
  const [reservations, setReservations] = useState<ReservationListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clinicId) return;
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/reservations?clinic_id=${clinicId}&start_date=${start.toISOString()}&end_date=${end.toISOString()}`
        );
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || '予約の取得に失敗しました');
        }
        const mapped: ReservationListItem[] = (json.data ?? []).map((r: any) => ({
          ...r,
          startTime: new Date(r.startTime),
          endTime: new Date(r.endTime),
          createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
          updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
        }));
        setReservations(mapped);
      } catch (e) {
        setReservations([]);
        setError(e instanceof Error ? e.message : '予約の取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [clinicId, date]);

  return { reservations, loading, error };
}
