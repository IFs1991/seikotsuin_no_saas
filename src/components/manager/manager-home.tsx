'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  Loader2,
  RefreshCw,
  Stethoscope,
  Users,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useManagerAssignedClinics } from '@/hooks/useManagerAssignedClinics';

const EMPTY_ASSIGNMENT_TITLE = '担当院がまだ設定されていません。';
const EMPTY_ASSIGNMENT_DESCRIPTION =
  '管理者にマネージャー管理から担当店舗の設定を依頼してください。';

const featureCards = [
  {
    id: 'manager-staff-analysis',
    title: '担当院スタッフ分析',
    description: '担当院のスタッフ稼働、予約、売上状況を確認します。',
    href: '/manager/staff-analysis',
    icon: Stethoscope,
  },
  {
    id: 'manager-staff-list',
    title: '担当院スタッフ一覧',
    description: '担当院に所属する staff resource を確認します。',
    href: '/manager/staff',
    icon: Users,
  },
  {
    id: 'manager-shift-requests',
    title: '担当院希望シフト',
    description: '担当院の希望シフトを確認し、承認・却下・変換します。',
    href: '/manager/shift-requests',
    icon: CalendarClock,
  },
  {
    id: 'manager-clinic-comparison',
    title: '担当院比較分析',
    description: '担当院のみを対象に、売上と予約の指標を比較します。',
    href: '/manager/clinic-comparison',
    icon: BarChart3,
  },
] as const;

function LoadingState() {
  return (
    <main className='min-h-screen bg-white p-4 pt-8 text-gray-900 dark:bg-gray-800 dark:text-gray-100'>
      <div className='flex min-h-[50vh] items-center justify-center gap-2 text-gray-600 dark:text-gray-300'>
        <Loader2 className='h-5 w-5 animate-spin text-blue-600' />
        <span>管理ホームを読み込み中...</span>
      </div>
    </main>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <main className='min-h-screen bg-white p-4 pt-8 text-gray-900 dark:bg-gray-800 dark:text-gray-100'>
      <div className='mx-auto flex min-h-[50vh] max-w-md items-center'>
        <Card className='w-full'>
          <CardHeader>
            <CardTitle className='text-red-600'>エラーが発生しました</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={onRetry} className='w-full' variant='outline'>
              <RefreshCw className='mr-2 h-4 w-4' />
              再読み込み
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function EmptyAssignments() {
  return (
    <Alert className='bg-white dark:bg-gray-900'>
      <AlertTriangle className='h-4 w-4' />
      <AlertTitle>{EMPTY_ASSIGNMENT_TITLE}</AlertTitle>
      <AlertDescription>{EMPTY_ASSIGNMENT_DESCRIPTION}</AlertDescription>
    </Alert>
  );
}

export function ManagerHome() {
  const { data, loading, error, refetch } = useManagerAssignedClinics();

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={() => void refetch()} />;
  }

  const clinics = data?.clinics ?? [];

  return (
    <main className='min-h-screen bg-white p-4 pt-8 text-gray-900 dark:bg-gray-800 dark:text-gray-100'>
      <div className='mx-auto max-w-6xl space-y-6'>
        <header>
          <h1 className='text-3xl font-bold'>管理ホーム</h1>
          <p className='mt-2 text-sm text-gray-600 dark:text-gray-300'>
            担当院の管理機能の入口です。
          </p>
        </header>

        <section className='space-y-3' aria-labelledby='assigned-clinics-title'>
          <div>
            <h2
              id='assigned-clinics-title'
              className='text-xl font-bold text-gray-900 dark:text-gray-100'
            >
              担当院一覧
            </h2>
            <p className='mt-1 text-sm text-gray-600 dark:text-gray-300'>
              active なマネージャー担当院のみを表示します。
            </p>
          </div>

          {clinics.length === 0 ? (
            <EmptyAssignments />
          ) : (
            <ul className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
              {clinics.map(clinic => (
                <li key={clinic.id}>
                  <Card className='h-full bg-card'>
                    <CardContent className='p-4'>
                      <p className='font-semibold text-gray-900 dark:text-gray-100'>
                        {clinic.name}
                      </p>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className='space-y-3' aria-labelledby='manager-features-title'>
          <div>
            <h2
              id='manager-features-title'
              className='text-xl font-bold text-gray-900 dark:text-gray-100'
            >
              管理機能
            </h2>
            <p className='mt-1 text-sm text-gray-600 dark:text-gray-300'>
              現在利用できる manager 専用画面です。
            </p>
          </div>

          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            {featureCards.map(feature => {
              const Icon = feature.icon;
              return (
                <Link
                  key={feature.id}
                  href={feature.href}
                  className='group block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2'
                >
                  <Card className='h-full bg-card transition-shadow group-hover:shadow-medical-lg'>
                    <CardHeader>
                      <div className='flex items-center gap-3'>
                        <span className='rounded-md bg-blue-50 p-2 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200'>
                          <Icon className='h-5 w-5' />
                        </span>
                        <CardTitle className='text-lg'>
                          {feature.title}
                        </CardTitle>
                      </div>
                      <CardDescription>{feature.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
