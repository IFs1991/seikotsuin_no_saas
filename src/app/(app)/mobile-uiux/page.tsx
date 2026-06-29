import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  ClipboardList,
  ExternalLink,
  Settings,
  SlidersHorizontal,
  Users,
} from 'lucide-react';

const screens = [
  {
    title: 'ホーム / ダッシュボード',
    description: '本日の予約、KPI、日報状況を確認するモバイル画面です。',
    href: '/mobile-uiux/screens/home',
    icon: BarChart3,
  },
  {
    title: '予約',
    description: '予約タイムライン、担当者、予約詳細を確認する画面です。',
    href: '/mobile-uiux/screens/reservations',
    icon: CalendarDays,
  },
  {
    title: '患者分析',
    description: '患者セグメント、来院傾向、フォロー対象を確認する画面です。',
    href: '/mobile-uiux/screens/patients',
    icon: Users,
  },
  {
    title: '日報',
    description: '日報、売上、提出状況を確認する画面です。',
    href: '/mobile-uiux/screens/daily-reports',
    icon: ClipboardList,
  },
  {
    title: '設定',
    description: 'アカウント設定、申請、ヘルプ勤務を確認する画面です。',
    href: '/mobile-uiux/screens/settings',
    icon: Settings,
  },
  {
    title: '設定詳細',
    description: '院情報、施術メニュー、保険設定を確認する画面です。',
    href: '/mobile-uiux/screens/settings-detail',
    icon: SlidersHorizontal,
  },
] as const;

export default function MobileUiuxPage() {
  return (
    <main className='min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8'>
      <div className='mx-auto flex max-w-5xl flex-col gap-6'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <Link
            href='/dashboard'
            className='inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted'
          >
            <ArrowLeft className='h-4 w-4' aria-hidden='true' />
            PC版ダッシュボードへ戻る
          </Link>
        </div>

        <section className='rounded-md border border-border bg-card p-5 shadow-sm'>
          <div className='space-y-2'>
            <p className='text-sm font-medium text-muted-foreground'>
              Mobile UI/UX static integration
            </p>
            <h1 className='text-2xl font-semibold tracking-normal text-foreground'>
              モバイル UI/UX 確認
            </h1>
            <p className='max-w-3xl text-sm leading-6 text-muted-foreground'>
              この画面は認証済みユーザー向けの静的 UI 確認ルートです。添付された
              Design Component
              画面を非改変で配信しており、現時点では実データ更新や DB
              書き込みは行いません。
            </p>
          </div>
        </section>

        <section className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
          {screens.map(screen => {
            const Icon = screen.icon;
            return (
              <Link
                key={screen.href}
                href={screen.href}
                className='group flex min-h-36 flex-col justify-between rounded-md border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary hover:bg-muted/60'
              >
                <div className='space-y-3'>
                  <div className='flex items-center justify-between gap-3'>
                    <span className='inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary'>
                      <Icon className='h-5 w-5' aria-hidden='true' />
                    </span>
                    <ExternalLink
                      className='h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary'
                      aria-hidden='true'
                    />
                  </div>
                  <div className='space-y-1'>
                    <h2 className='text-base font-semibold tracking-normal text-foreground'>
                      {screen.title}
                    </h2>
                    <p className='text-sm leading-6 text-muted-foreground'>
                      {screen.description}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}
