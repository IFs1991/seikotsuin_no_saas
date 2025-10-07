'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { useUserProfileContext } from '@/providers/user-profile-context';

interface DailyReportData {
  id: string;
  reportDate: string;
  staffName: string;
  totalPatients: number;
  newPatients: number;
  totalRevenue: number;
  insuranceRevenue: number;
  privateRevenue: number;
  reportText: string | null;
}

export default function DailyReportEditPage() {
  const router = useRouter();
  const params = useParams();
  const reportId = params?.id as string;

  const {
    profile,
    loading: profileLoading,
    error: profileError,
  } = useUserProfileContext();
  const clinicId = profile?.clinicId ?? null;

  const [reportData, setReportData] = useState<DailyReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [date, setDate] = useState('');
  const [staffName, setStaffName] = useState('');
  const [totalPatients, setTotalPatients] = useState(0);
  const [newPatients, setNewPatients] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [insuranceRevenue, setInsuranceRevenue] = useState(0);
  const [privateRevenue, setPrivateRevenue] = useState(0);
  const [reportText, setReportText] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 日報データ取得
  useEffect(() => {
    const fetchReport = async () => {
      if (!clinicId || !reportId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
        const res = await fetch(
          `/api/daily-reports?clinic_id=${clinicId}&id=${reportId}`
        );

        if (!res.ok) {
          throw new Error('日報の取得に失敗しました');
        }

        const json = await res.json();
        if (json.success && json.data) {
          const data = json.data;
          setReportData(data);
          setDate(data.reportDate);
          setStaffName(data.staffName || '');
          setTotalPatients(data.totalPatients || 0);
          setNewPatients(data.newPatients || 0);
          setTotalRevenue(data.totalRevenue || 0);
          setInsuranceRevenue(data.insuranceRevenue || 0);
          setPrivateRevenue(data.privateRevenue || 0);
          setReportText(data.reportText || '');
        } else {
          throw new Error('日報データの取得に失敗しました');
        }
      } catch (e: any) {
        console.error(e);
        setLoadError(e?.message || '日報の取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    if (clinicId && reportId) {
      fetchReport();
    }
  }, [clinicId, reportId]);

  const handleSubmit = async () => {
    if (!clinicId) {
      alert('アクセス可能なクリニックが確認できません');
      return;
    }

    if (!staffName) {
      setFieldErrors({ staffName: ['スタッフ名を入力してください'] });
      setFormError('スタッフ名を入力してください');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const payload = {
        clinic_id: clinicId,
        report_date: date,
        total_patients: totalPatients,
        new_patients: newPatients,
        total_revenue: totalRevenue,
        insurance_revenue: insuranceRevenue,
        private_revenue: privateRevenue,
        report_text: reportText || null,
      };

      const res = await fetch('/api/daily-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let errorMessage = '保存に失敗しました';
        try {
          const errorJson = await res.json();
          if (errorJson?.error?.message) {
            errorMessage = errorJson.error.message;
          }
          if (errorJson?.error?.fieldErrors) {
            setFieldErrors(errorJson.error.fieldErrors as Record<string, string[]>);
          }
        } catch (parseError) {
          const text = await res.text();
          if (text) {
            errorMessage = text;
          }
        }
        setFormError(errorMessage);
        return;
      }

      alert('日報を更新しました');
      router.push('/daily-reports');
    } catch (e: any) {
      console.error(e);
      const fallbackMessage = e?.message || String(e) || '保存に失敗しました';
      setFormError(fallbackMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoading = profileLoading || loading;
  const hasClinic = Boolean(clinicId);
  const errorMessage = profileError || loadError;

  if (isLoading) {
    return (
      <div className='min-h-screen bg-white dark:bg-gray-800 flex items-center justify-center'>
        <div className='flex items-center space-x-2'>
          <Loader2 className='h-6 w-6 animate-spin text-blue-600' />
          <span className='text-gray-500'>日報データを読み込み中です...</span>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className='min-h-screen bg-white dark:bg-gray-800 flex items-center justify-center'>
        <Card className='max-w-md w-full mx-4'>
          <CardHeader>
            <CardTitle className='text-red-600'>エラーが発生しました</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <p className='text-gray-700 dark:text-gray-300'>{errorMessage}</p>
            <div className='flex space-x-2'>
              <Button onClick={() => router.back()} className='flex-1'>
                戻る
              </Button>
              <Button onClick={() => window.location.reload()} className='flex-1'>
                再読み込み
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasClinic) {
    return (
      <div className='min-h-screen bg-white dark:bg-gray-800 flex items-center justify-center'>
        <Card className='max-w-md w-full mx-4'>
          <CardHeader>
            <CardTitle>クリニック情報が見つかりません</CardTitle>
            <CardDescription>
              権限が付与されたクリニックが設定されていないため、日報を編集できません。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-gray-700 dark:text-gray-300'>管理者にお問い合わせください。</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className='min-h-screen bg-white dark:bg-gray-800 flex items-center justify-center'>
        <Card className='max-w-md w-full mx-4'>
          <CardHeader>
            <CardTitle>日報が見つかりません</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/daily-reports')} className='w-full'>
              一覧に戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-white dark:bg-gray-800 p-4'>
      <div className='max-w-4xl mx-auto space-y-6'>
        {formError && (
          <Card className='border-red-200 bg-red-50 dark:bg-red-950/40'>
            <CardContent className='py-4'>
              <p className='text-red-700 dark:text-red-300 font-medium'>
                {formError}
              </p>
              {Object.entries(fieldErrors).length > 0 && (
                <ul className='mt-3 list-disc pl-5 text-sm text-red-600 dark:text-red-300 space-y-1'>
                  {Object.entries(fieldErrors).map(([field, errors]) =>
                    errors?.map((message, index) => (
                      <li key={`${field}-${index}`}>
                        {field}: {message}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        <div className='flex items-center justify-between'>
          <div className='flex items-center space-x-4'>
            <Link href='/daily-reports'>
              <Button variant='outline' size='sm'>
                <ArrowLeft className='h-4 w-4 mr-2' />
                戻る
              </Button>
            </Link>
            <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100'>
              日報編集
            </h1>
          </div>
          <Button
            onClick={handleSubmit}
            className='bg-blue-600 text-white'
            disabled={isSubmitting}
          >
            <Save className='h-4 w-4 mr-2' />
            {isSubmitting ? '保存中...' : '保存'}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
            <CardDescription>日報の基本情報を編集してください</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div className='space-y-2'>
                <Label htmlFor='date'>日付</Label>
                <Input
                  id='date'
                  type='date'
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  disabled
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='staffName'>担当スタッフ</Label>
                <Input
                  id='staffName'
                  placeholder='山田太郎'
                  value={staffName}
                  onChange={e => setStaffName(e.target.value)}
                />
                {fieldErrors.staffName?.map((message, index) => (
                  <p
                    key={`staffName-error-${index}`}
                    className='text-sm text-red-600 dark:text-red-300'
                  >
                    {message}
                  </p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>患者・売上情報</CardTitle>
            <CardDescription>日報の数値データを編集してください</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div className='space-y-2'>
                <Label htmlFor='totalPatients'>総患者数</Label>
                <Input
                  id='totalPatients'
                  type='number'
                  value={totalPatients}
                  onChange={e => setTotalPatients(Number(e.target.value))}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='newPatients'>新規患者数</Label>
                <Input
                  id='newPatients'
                  type='number'
                  value={newPatients}
                  onChange={e => setNewPatients(Number(e.target.value))}
                />
              </div>
            </div>

            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
              <div className='space-y-2'>
                <Label htmlFor='totalRevenue'>総売上（円）</Label>
                <Input
                  id='totalRevenue'
                  type='number'
                  value={totalRevenue}
                  onChange={e => setTotalRevenue(Number(e.target.value))}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='insuranceRevenue'>保険診療（円）</Label>
                <Input
                  id='insuranceRevenue'
                  type='number'
                  value={insuranceRevenue}
                  onChange={e => setInsuranceRevenue(Number(e.target.value))}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='privateRevenue'>自費診療（円）</Label>
                <Input
                  id='privateRevenue'
                  type='number'
                  value={privateRevenue}
                  onChange={e => setPrivateRevenue(Number(e.target.value))}
                />
              </div>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='reportText'>備考</Label>
              <textarea
                id='reportText'
                className='w-full p-2 border rounded min-h-[100px]'
                placeholder='その他の特記事項を入力してください'
                value={reportText}
                onChange={e => setReportText(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className='bg-blue-50 border-blue-200'>
          <CardContent className='pt-6'>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4 text-center'>
              <div>
                <p className='text-2xl font-bold text-blue-600'>{totalPatients}</p>
                <p className='text-sm text-blue-800'>総患者数</p>
              </div>
              <div>
                <p className='text-2xl font-bold text-blue-600'>
                  ¥{totalRevenue.toLocaleString()}
                </p>
                <p className='text-sm text-blue-800'>総売上</p>
              </div>
              <div>
                <p className='text-2xl font-bold text-blue-600'>
                  ¥
                  {totalPatients > 0
                    ? Math.round(totalRevenue / totalPatients).toLocaleString()
                    : 0}
                </p>
                <p className='text-sm text-blue-800'>平均単価</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
