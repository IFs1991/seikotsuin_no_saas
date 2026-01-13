'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { useUserProfileContext } from '@/providers/user-profile-context';

type CustomerDetail = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  customAttributes?: Record<string, unknown>;
};

const customAttributeLabels: Record<string, string> = {
  symptom: '主な症状',
  visitReason: '来院目的',
  memo: '補足メモ',
};

export default function PatientDetailPage() {
  const params = useParams();
  const patientIdRaw = params?.id;
  const patientId = Array.isArray(patientIdRaw)
    ? patientIdRaw[0]
    : patientIdRaw;

  const {
    profile,
    loading: profileLoading,
    error: profileError,
  } = useUserProfileContext();
  const clinicId = profile?.clinicId ?? null;

  const [data, setData] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(clinicId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!clinicId || !patientId) {
      setLoading(false);
      return;
    }

    const fetchCustomer = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `/api/customers?clinic_id=${clinicId}&id=${patientId}`
        );
        const json = await res.json();

        if (!res.ok || !json?.success) {
          throw new Error(json?.error?.message || json?.error || '取得に失敗しました');
        }

        if (!cancelled) {
          setData(json.data as CustomerDetail);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : '患者情報の取得に失敗しました'
          );
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchCustomer();
    return () => {
      cancelled = true;
    };
  }, [clinicId, patientId]);

  const customAttributes = useMemo(() => {
    if (!data?.customAttributes) return [];
    return Object.entries(data.customAttributes).filter(([, value]) => value !== null && value !== undefined);
  }, [data]);

  if (profileError && !profileLoading) {
    return (
      <div className='p-6 bg-[#f9fafb] dark:bg-[#1a1a1a] min-h-screen'>
        <div className='max-w-[900px] mx-auto'>
          <Card className='bg-card'>
            <CardHeader>
              <CardTitle className='text-red-600'>
                プロフィール取得に失敗しました
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <p className='text-gray-700 dark:text-gray-300'>{profileError}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!clinicId && !profileLoading) {
    return (
      <div className='p-6 bg-[#f9fafb] dark:bg-[#1a1a1a] min-h-screen'>
        <div className='max-w-[900px] mx-auto'>
          <Card className='bg-card'>
            <CardHeader>
              <CardTitle>クリニック情報が見つかりません</CardTitle>
              <CardDescription>
                権限が付与されたクリニックが設定されていないため、患者詳細を表示できません。
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  if (loading || profileLoading) {
    return (
      <div className='p-6 bg-[#f9fafb] dark:bg-[#1a1a1a] min-h-screen flex items-center justify-center'>
        <div className='text-gray-500'>患者情報を読み込み中です...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='p-6 bg-[#f9fafb] dark:bg-[#1a1a1a] min-h-screen'>
        <div className='max-w-[900px] mx-auto'>
          <Card className='bg-card border border-red-200'>
            <CardHeader>
              <CardTitle className='text-red-600'>
                データ取得に失敗しました
              </CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className='p-6 bg-[#f9fafb] dark:bg-[#1a1a1a] min-h-screen flex items-center justify-center'>
        <div className='text-gray-500'>患者情報が見つかりません。</div>
      </div>
    );
  }

  return (
    <div className='p-6 bg-[#f9fafb] dark:bg-[#1a1a1a] min-h-screen'>
      <div className='max-w-[900px] mx-auto space-y-6'>
        <Card className='bg-card'>
          <CardHeader>
            <CardTitle>患者詳細</CardTitle>
            <CardDescription>基本情報とカスタム属性の確認</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div>
                <p className='text-sm text-gray-500'>氏名</p>
                <p className='font-semibold text-gray-900 dark:text-gray-100'>
                  {data.name}
                </p>
              </div>
              <div>
                <p className='text-sm text-gray-500'>電話番号</p>
                <p className='font-semibold text-gray-900 dark:text-gray-100'>
                  {data.phone}
                </p>
              </div>
              <div>
                <p className='text-sm text-gray-500'>メール</p>
                <p className='font-semibold text-gray-900 dark:text-gray-100'>
                  {data.email || '-'}
                </p>
              </div>
              <div>
                <p className='text-sm text-gray-500'>メモ</p>
                <p className='font-semibold text-gray-900 dark:text-gray-100'>
                  {data.notes || '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className='bg-card'>
          <CardHeader>
            <CardTitle>カスタム属性</CardTitle>
            <CardDescription>
              予約時に入力された追加情報を表示します。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {customAttributes.length === 0 ? (
              <div className='text-sm text-gray-500'>
                カスタム属性は登録されていません。
              </div>
            ) : (
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                {customAttributes.map(([key, value]) => (
                  <div
                    key={key}
                    className='border rounded-lg p-3 bg-white dark:bg-gray-800'
                  >
                    <p className='text-xs text-gray-500 uppercase tracking-wide'>
                      {customAttributeLabels[key] ?? key}
                    </p>
                    <p className='text-sm text-gray-900 dark:text-gray-100 mt-1'>
                      {String(value)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
