'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useManagerStaffList } from '@/hooks/useManagerStaffList';

function formatBoolean(value: boolean | null): string {
  if (value === null) {
    return '未設定';
  }
  return value ? '可' : '不可';
}

export function ManagerStaffList() {
  const {
    data,
    loading,
    error,
    selectedClinicId,
    setSelectedClinicId,
    refetch,
  } = useManagerStaffList();
  const clinics = data?.clinics ?? [];
  const staff = data?.staff ?? [];

  return (
    <main className='min-h-screen bg-white p-4 pt-8 text-gray-900 dark:bg-gray-800 dark:text-gray-100'>
      <div className='mx-auto max-w-6xl space-y-6'>
        <header className='flex flex-col gap-4 md:flex-row md:items-start md:justify-between'>
          <div>
            <h1 className='text-3xl font-bold'>担当院スタッフ一覧</h1>
            <p className='mt-2 text-sm text-gray-600 dark:text-gray-300'>
              担当院の staff resource を read-only で確認します。
            </p>
          </div>
          <Button
            type='button'
            variant='outline'
            onClick={() => void refetch()}
            disabled={loading}
          >
            <RefreshCw className='mr-2 h-4 w-4' />
            再読み込み
          </Button>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>フィルター</CardTitle>
            <CardDescription>担当院のみ選択できます。</CardDescription>
          </CardHeader>
          <CardContent>
            <label className='block max-w-sm space-y-1 text-sm'>
              <span className='font-medium'>院</span>
              <select
                aria-label='院'
                className='h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm'
                value={selectedClinicId}
                onChange={event => setSelectedClinicId(event.target.value)}
                disabled={loading || clinics.length === 0}
              >
                <option value=''>全担当院</option>
                {clinics.map(clinic => (
                  <option key={clinic.id} value={clinic.id}>
                    {clinic.name}
                  </option>
                ))}
              </select>
            </label>
          </CardContent>
        </Card>

        {error && (
          <Card>
            <CardContent className='p-4 text-sm text-red-700'>
              {error}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>スタッフ名簿</CardTitle>
            <CardDescription>{staff.length}件</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className='text-sm text-gray-500'>読み込み中...</p>
            ) : clinics.length === 0 ? (
              <p className='text-sm text-gray-600'>
                担当院がまだ設定されていません。
              </p>
            ) : staff.length === 0 ? (
              <p className='text-sm text-gray-600'>
                表示できるスタッフがいません。
              </p>
            ) : (
              <div className='overflow-x-auto'>
                <table className='w-full min-w-[640px] text-sm'>
                  <thead>
                    <tr className='border-b text-left text-gray-500'>
                      <th className='py-2'>スタッフ名</th>
                      <th className='py-2'>所属院</th>
                      <th className='py-2'>有効</th>
                      <th className='py-2'>予約受付可</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map(row => (
                      <tr key={row.staffId} className='border-b'>
                        <td className='py-3 font-medium'>{row.staffName}</td>
                        <td className='py-3'>{row.clinicName}</td>
                        <td className='py-3'>{formatBoolean(row.isActive)}</td>
                        <td className='py-3'>
                          {formatBoolean(row.isBookable)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
