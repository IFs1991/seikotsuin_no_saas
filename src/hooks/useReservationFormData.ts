'use client';

import { useEffect, useState } from 'react';
import type { Customer, Menu, Resource } from '@/types/reservation';

export function useReservationFormData(clinicId: string | null) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clinicId) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [custRes, menuRes, resRes] = await Promise.all([
          fetch(`/api/customers?clinic_id=${clinicId}`),
          fetch(`/api/menus?clinic_id=${clinicId}`),
          fetch(`/api/resources?clinic_id=${clinicId}`),
        ]);
        const [custJson, menuJson, resJson] = await Promise.all([
          custRes.json(),
          menuRes.json(),
          resRes.json(),
        ]);
        if (!custRes.ok || !custJson.success) {
          throw new Error(custJson?.error || '顧客データの取得に失敗しました');
        }
        if (!menuRes.ok || !menuJson.success) {
          throw new Error(
            menuJson?.error || 'メニューデータの取得に失敗しました'
          );
        }
        if (!resRes.ok || !resJson.success) {
          throw new Error(
            resJson?.error || 'リソースデータの取得に失敗しました'
          );
        }

        setCustomers(custJson.data ?? []);
        setMenus(menuJson.data ?? []);
        setResources(resJson.data ?? []);
      } catch (e) {
        setCustomers([]);
        setMenus([]);
        setResources([]);
        setError(
          e instanceof Error
            ? e.message
            : '予約フォームデータの取得に失敗しました'
        );
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [clinicId]);

  return { customers, menus, resources, loading, error };
}
