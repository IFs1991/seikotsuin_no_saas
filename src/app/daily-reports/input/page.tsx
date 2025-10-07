'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';
import { useUserProfileContext } from '@/providers/user-profile-context';

interface Patient {
  id: string;
  name: string;
  age: number;
  treatment: string;
  duration: number;
  fee: number;
  insurance: boolean;
}

export default function DailyReportInputPage() {
  const router = useRouter();
  const {
    profile,
    loading: profileLoading,
    error: profileError,
  } = useUserProfileContext();
  const clinicId = profile?.clinicId ?? null;

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [staffName, setStaffName] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [newPatient, setNewPatient] = useState<Omit<Patient, 'id'>>({
    name: '',
    age: 0,
    treatment: '',
    duration: 0,
    fee: 0,
    insurance: true,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLoading = profileLoading;
  const hasClinic = Boolean(clinicId);
  const errorMessage = profileError;

  const addPatient = () => {
    if (!newPatient.name || !newPatient.treatment) {
      alert('患者名と施術内容を入力してください');
      return;
    }

    const patient: Patient = {
      ...newPatient,
      id: Date.now().toString(),
    };

    setPatients(prev => [...prev, patient]);
    setNewPatient({
      name: '',
      age: 0,
      treatment: '',
      duration: 0,
      fee: 0,
      insurance: true,
    });
    setFieldErrors({});
    setFormError(null);
  };

  const removePatient = (id: string) => {
    setPatients(prev => prev.filter(p => p.id !== id));
  };

  const updatePatient = (id: string, partial: Partial<Patient>) => {
    setPatients(prev =>
      prev.map(patient =>
        patient.id === id ? { ...patient, ...partial } : patient
      )
    );
  };

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

    if (patients.length === 0) {
      setFieldErrors({ patients: ['最低1名の患者情報を入力してください'] });
      setFormError('最低1名の患者情報を入力してください');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const totalPatients = patients.length;
      const totalRevenue = patients.reduce((sum, p) => sum + (p.fee || 0), 0);
      const insuranceRevenue = patients
        .filter(p => p.insurance)
        .reduce((sum, p) => sum + (p.fee || 0), 0);
      const privateRevenue = totalRevenue - insuranceRevenue;

      const payload = {
        clinic_id: clinicId,
        report_date: date,
        // staff_id は未連携のため省略（将来の認証連携で補完）
        total_patients: totalPatients,
        new_patients: 0,
        total_revenue: totalRevenue,
        insurance_revenue: insuranceRevenue,
        private_revenue: privateRevenue,
        report_text: `担当: ${staffName}、入力件数: ${patients.length}`,
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

      alert('日報を保存しました');
      router.push('/daily-reports');
    } catch (e: any) {
      console.error(e);
      const fallbackMessage = e?.message || String(e) || '保存に失敗しました';
      setFormError(fallbackMessage);
      return;
    } finally {
      setIsSubmitting(false);
    }

    setPatients([]);
    setStaffName('');
    setFieldErrors({});
    setFormError(null);
  };

  const totalRevenue = patients.reduce((sum, patient) => sum + patient.fee, 0);
  const totalPatients = patients.length;

  const isSubmitDisabled = useMemo(() => {
    if (!hasClinic || isLoading || isSubmitting || errorMessage) return true;
    return patients.length === 0 || !staffName;
  }, [
    hasClinic,
    isLoading,
    isSubmitting,
    errorMessage,
    patients.length,
    staffName,
  ]);

  if (isLoading) {
    return (
      <div className='min-h-screen bg-white dark:bg-gray-800 flex items-center justify-center'>
        <div className='text-gray-500'>プロフィール情報を読み込み中です...</div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className='min-h-screen bg-white dark:bg-gray-800 flex items-center justify-center'>
        <Card className='max-w-md w-full mx-4'>
          <CardHeader>
            <CardTitle className='text-red-600'>プロフィール取得に失敗しました</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <p className='text-gray-700 dark:text-gray-300'>{errorMessage}</p>
            <Button onClick={() => window.location.reload()} className='bg-blue-600 text-white'>
              再読み込み
            </Button>
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
              権限が付与されたクリニックが設定されていないため、日報を登録できません。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-gray-700 dark:text-gray-300'>管理者にお問い合わせください。</p>
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
              日報入力
            </h1>
          </div>
          <Button
            onClick={handleSubmit}
            className='bg-blue-600 text-white'
            disabled={isSubmitDisabled}
          >
            <Save className='h-4 w-4 mr-2' />
            {isSubmitting ? '保存中...' : '保存'}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
            <CardDescription>日報の基本情報を入力してください</CardDescription>
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
            <CardTitle>患者追加</CardTitle>
            <CardDescription>
              新しい患者の施術記録を追加してください
            </CardDescription>
            {fieldErrors.patients?.map((message, index) => (
              <p
                key={`patients-error-${index}`}
                className='text-sm text-red-600 dark:text-red-300 mt-2'
              >
                {message}
              </p>
            ))}
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
              <div className='space-y-2'>
                <Label htmlFor='patientName'>患者名</Label>
                <Input
                  id='patientName'
                  placeholder='田中花子'
                  value={newPatient.name}
                  onChange={e =>
                    setNewPatient({ ...newPatient, name: e.target.value })
                  }
                  disabled={isLoading}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='patientAge'>年齢</Label>
                <Input
                  id='patientAge'
                  type='number'
                  placeholder='35'
                  value={newPatient.age || ''}
                  onChange={e =>
                    setNewPatient({
                      ...newPatient,
                      age: Number(e.target.value),
                    })
                  }
                  disabled={isLoading}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='treatment'>施術内容</Label>
                <Input
                  id='treatment'
                  placeholder='整体、マッサージ'
                  value={newPatient.treatment}
                  onChange={e =>
                    setNewPatient({
                      ...newPatient,
                      treatment: e.target.value,
                    })
                  }
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
              <div className='space-y-2'>
                <Label htmlFor='duration'>施術時間（分）</Label>
                <Input
                  id='duration'
                  type='number'
                  placeholder='60'
                  value={newPatient.duration || ''}
                  onChange={e =>
                    setNewPatient({
                      ...newPatient,
                      duration: Number(e.target.value),
                    })
                  }
                  disabled={isLoading}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='fee'>料金（円）</Label>
                <Input
                  id='fee'
                  type='number'
                  placeholder='5000'
                  value={newPatient.fee || ''}
                  onChange={e =>
                    setNewPatient({
                      ...newPatient,
                      fee: Number(e.target.value),
                    })
                  }
                  disabled={isLoading}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='insurance'>保険診療</Label>
                <select
                  id='insurance'
                  className='w-full p-2 border rounded'
                  value={newPatient.insurance ? 'true' : 'false'}
                  onChange={e =>
                    setNewPatient({
                      ...newPatient,
                      insurance: e.target.value === 'true',
                    })
                  }
                  disabled={isLoading}
                >
                  <option value='true'>保険診療</option>
                  <option value='false'>自費診療</option>
                </select>
              </div>
              <div className='flex items-end'>
                <Button
                  onClick={addPatient}
                  className='w-full'
                  disabled={isLoading}
                >
                  <Plus className='h-4 w-4 mr-2' />
                  追加
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>施術記録一覧</CardTitle>
            <CardDescription>
              本日の患者数: {totalPatients}名 | 合計売上: ¥{totalRevenue.toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {patients.length === 0 ? (
              <div className='text-center py-8 text-gray-500'>まだ患者が登録されていません</div>
            ) : (
              <div className='space-y-3'>
                {patients.map(patient => (
                  <div
                    key={patient.id}
                    className='flex items-center justify-between p-4 border rounded-lg'
                  >
                    <div className='grid grid-cols-1 md:grid-cols-5 gap-4 flex-1'>
                      <div>
                        <p className='font-medium'>{patient.name}</p>
                        <p className='text-sm text-gray-500'>{patient.age}歳</p>
                      </div>
                      <div>
                        <p className='text-sm text-gray-500'>施術内容</p>
                        <p>{patient.treatment}</p>
                      </div>
                      <div>
                        <p className='text-sm text-gray-500'>時間</p>
                        <Input
                          type='number'
                          value={patient.duration}
                          onChange={e =>
                            updatePatient(patient.id, {
                              duration: Number(e.target.value),
                            })
                          }
                          disabled={isLoading}
                        />
                      </div>
                      <div>
                        <p className='text-sm text-gray-500'>料金</p>
                        <Input
                          type='number'
                          value={patient.fee}
                          onChange={e =>
                            updatePatient(patient.id, {
                              fee: Number(e.target.value),
                            })
                          }
                          disabled={isLoading}
                        />
                      </div>
                      <div>
                        <p className='text-sm text-gray-500'>区分</p>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            patient.insurance
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {patient.insurance ? '保険診療' : '自費診療'}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => removePatient(patient.id)}
                      className='text-red-600 hover:text-red-800'
                      disabled={isLoading}
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {patients.length > 0 && (
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
        )}
      </div>
    </div>
  );
}
