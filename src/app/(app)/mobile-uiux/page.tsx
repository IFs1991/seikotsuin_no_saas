import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';

import { resolveMobileUiuxPrincipal } from '@/lib/mobile-uiux/access';
import { resolveMobileUiuxRolloutWithEntitlements } from '@/lib/mobile-uiux/entitlements';
import { getMobileUiuxFlags } from '@/lib/mobile-uiux/flags';
import { filterMobileUiuxLauncherScreens } from '@/lib/mobile-uiux/launcher';
import { DisplayModeLink } from '@/components/mobile-uiux/display-mode-link';
import {
  createClient,
  getCurrentUser,
  getUserAccessContext,
} from '@/lib/supabase';

function MobileUiuxUnavailablePage({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <main className='min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8'>
      <div className='mx-auto flex max-w-3xl flex-col gap-6'>
        <DisplayModeLink
          mode='desktop'
          href='/dashboard'
          className='inline-flex w-fit items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted'
        >
          <ArrowLeft className='h-4 w-4' aria-hidden='true' />
          PC版ダッシュボードへ戻る
        </DisplayModeLink>
        <section className='rounded-md border border-border bg-card p-5 shadow-sm'>
          <div className='space-y-2'>
            <p className='text-sm font-medium text-muted-foreground'>
              Mobile UI/UX
            </p>
            <h1 className='text-2xl font-semibold tracking-normal text-foreground'>
              {title}
            </h1>
            <p className='text-sm leading-6 text-muted-foreground'>{message}</p>
          </div>
        </section>
      </div>
    </main>
  );
}

export default async function MobileUiuxPage() {
  const flags = getMobileUiuxFlags();

  if (!flags.enabled) {
    return (
      <MobileUiuxUnavailablePage
        title='モバイル UI/UX は現在無効です'
        message='本番 gate が閉じているため、この環境ではモバイル UI/UX を表示できません。'
      />
    );
  }

  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  if (!user) {
    redirect('/login?redirectTo=/mobile-uiux');
  }

  const accessContext = await getUserAccessContext(user.id, supabase, { user });
  const principalDecision = await resolveMobileUiuxPrincipal({
    userId: user.id,
    permissions: accessContext.permissions,
    flags,
  });

  if (principalDecision.allowed === false) {
    return (
      <MobileUiuxUnavailablePage
        title='モバイル UI/UX へのアクセス権限がありません'
        message='許可されたロールまたは clinic scope に含まれていないため表示できません。'
      />
    );
  }

  const rolloutDecision = await resolveMobileUiuxRolloutWithEntitlements({
    supabase,
    principal: principalDecision,
    flags,
  });

  if (rolloutDecision.allowed === false) {
    return (
      <MobileUiuxUnavailablePage
        title='モバイル UI/UX へのアクセス権限がありません'
        message='pilot clinic allowlist または feature entitlement が有効ではないため表示できません。'
      />
    );
  }

  const screens = filterMobileUiuxLauncherScreens(rolloutDecision.role);

  return (
    <main className='min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8'>
      <div className='mx-auto flex max-w-5xl flex-col gap-6'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <DisplayModeLink
            mode='desktop'
            href='/dashboard'
            className='inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted'
          >
            <ArrowLeft className='h-4 w-4' aria-hidden='true' />
            PC版ダッシュボードへ戻る
          </DisplayModeLink>
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
