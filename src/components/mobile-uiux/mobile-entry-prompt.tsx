'use client';

import React from 'react';
import { Smartphone, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  buildMobileUiuxDisplayModeCookie,
  MOBILE_UIUX_DISMISSED_STORAGE_KEY,
} from '@/lib/mobile-uiux/display-mode';
import { normalizeRole } from '@/lib/constants/roles';

type MobileUiuxEntryPromptVariant = 'banner' | 'menu-item';

type MobileUiuxEntryPromptProps = {
  variant?: MobileUiuxEntryPromptVariant;
  role?: string | null;
};

type MobileUiuxContextPayload = {
  success: boolean;
  data?: {
    displayMode?: string;
  };
};

const MOBILE_WIDTH_QUERY = '(max-width: 767px)';
const MOBILE_UIUX_ADMIN_ENTRY_PATH = '/mobile-uiux/screens/home';
const MOBILE_UIUX_STAFF_ENTRY_PATH = '/mobile-uiux/screens/reservations';

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (typeof window.innerWidth === 'number') {
    return window.innerWidth < 768;
  }

  if (typeof window.matchMedia === 'function') {
    return window.matchMedia(MOBILE_WIDTH_QUERY).matches;
  }

  return false;
}

function hasDismissedPrompt(): boolean {
  try {
    return localStorage.getItem(MOBILE_UIUX_DISMISSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function dismissPrompt() {
  try {
    localStorage.setItem(MOBILE_UIUX_DISMISSED_STORAGE_KEY, 'true');
  } catch {
    return;
  }
}

function setDisplayMode(mode: 'desktop' | 'mobile' | 'system') {
  document.cookie = buildMobileUiuxDisplayModeCookie(mode);
}

function isContextSuccess(
  payload: unknown
): payload is MobileUiuxContextPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'success' in payload &&
    payload.success === true
  );
}

export function MobileUiuxEntryPrompt({
  variant = 'banner',
  role = null,
}: MobileUiuxEntryPromptProps) {
  if (variant === 'menu-item') {
    return <MobileUiuxMenuItemEntry role={role} />;
  }

  return <MobileUiuxBannerEntry role={role} />;
}

function resolveMobileUiuxEntryPath(role: string | null | undefined): string {
  const normalizedRole = normalizeRole(role);

  if (
    normalizedRole === 'admin' ||
    normalizedRole === 'clinic_admin' ||
    normalizedRole === 'manager'
  ) {
    return MOBILE_UIUX_ADMIN_ENTRY_PATH;
  }

  return MOBILE_UIUX_STAFF_ENTRY_PATH;
}

function openMobileUiux(role: string | null | undefined) {
  setDisplayMode('mobile');
  window.location.assign(resolveMobileUiuxEntryPath(role));
}

function MobileUiuxMenuItemEntry({ role }: { role: string | null }) {
  return (
    <button
      type='button'
      className='block w-full px-4 py-2 text-left text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none'
      onClick={() => openMobileUiux(role)}
    >
      スマホ版で開く
    </button>
  );
}

function MobileUiuxBannerEntry({ role }: { role: string | null }) {
  const [canUseMobileUiux, setCanUseMobileUiux] = React.useState(false);
  const [isDismissed, setIsDismissed] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    const loadContext = async () => {
      setIsMobile(isMobileViewport());
      if (hasDismissedPrompt()) {
        setIsDismissed(true);
      }

      try {
        const response = await fetch('/api/mobile-uiux/context', {
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
          },
        });
        if (!response.ok) {
          return;
        }

        const payload: unknown = await response.json();
        if (!cancelled && isContextSuccess(payload)) {
          setCanUseMobileUiux(true);
        }
      } catch {
        return;
      }
    };

    void loadContext();

    return () => {
      cancelled = true;
    };
  }, []);

  const openMobile = React.useCallback(() => {
    openMobileUiux(role);
  }, [role]);

  const stayDesktop = React.useCallback(() => {
    setDisplayMode('desktop');
    dismissPrompt();
    setIsDismissed(true);
  }, []);

  const hideBanner = React.useCallback(() => {
    dismissPrompt();
    setIsDismissed(true);
  }, []);

  if (!canUseMobileUiux) {
    return null;
  }

  if (!isMobile || isDismissed) {
    return null;
  }

  return (
    <div className='fixed inset-x-3 bottom-4 z-50 rounded-md border border-border bg-card p-3 text-foreground shadow-lg md:hidden'>
      <div className='flex items-start gap-3'>
        <span className='mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'>
          <Smartphone className='h-5 w-5' aria-hidden='true' />
        </span>
        <div className='min-w-0 flex-1 space-y-2'>
          <div className='space-y-1'>
            <p className='text-sm font-semibold'>スマホ版を利用できます</p>
            <p className='text-xs leading-5 text-muted-foreground'>
              予約、日報、設定をスマホ幅に合わせた画面で確認できます。
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button type='button' size='sm' onClick={openMobile}>
              スマホ版で開く
            </Button>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={stayDesktop}
            >
              PC版のまま使う
            </Button>
          </div>
        </div>
        <button
          type='button'
          className='inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground'
          aria-label='表示しない'
          onClick={hideBanner}
        >
          <X className='h-4 w-4' aria-hidden='true' />
        </button>
      </div>
    </div>
  );
}
