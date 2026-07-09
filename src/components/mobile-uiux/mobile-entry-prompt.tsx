'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { resolveMobileUiuxEntryPath } from '@/lib/mobile-uiux/navigation';

type DisplayMode = 'desktop' | 'mobile' | 'system';

type MobileUiuxAvailability = {
  ready: boolean;
  entryPath: string | null;
  displayMode?: DisplayMode;
};

type MobileUiuxEntryPromptVariant = 'auto' | 'menu-item';

type MobileUiuxEntryPromptProps = {
  variant?: MobileUiuxEntryPromptVariant;
  className?: string;
  onNavigate?: () => void;
  navigate?: (path: string) => void;
};

type MobileUiuxContextPayload = {
  success: true;
  role: {
    canonical: string | null;
  };
  displayMode?: DisplayMode;
};

const DISMISSED_STORAGE_KEY = 'mobile-uiux-entry-prompt-dismissed';
const MOBILE_VIEWPORT_MAX_WIDTH = 767;
const DISPLAY_MODE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const UNAVAILABLE_AVAILABILITY: MobileUiuxAvailability = {
  ready: true,
  entryPath: null,
};

let cachedAvailability: MobileUiuxAvailability | null = null;
let availabilityRequest: Promise<MobileUiuxAvailability> | null = null;

function isDisplayMode(value: unknown): value is DisplayMode {
  return value === 'desktop' || value === 'mobile' || value === 'system';
}

function isMobileUiuxContextPayload(
  value: unknown
): value is MobileUiuxContextPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as {
    success?: unknown;
    role?: { canonical?: unknown };
    displayMode?: unknown;
  };

  return (
    candidate.success === true &&
    typeof candidate.role === 'object' &&
    candidate.role !== null &&
    (typeof candidate.role.canonical === 'string' ||
      candidate.role.canonical === null) &&
    (candidate.displayMode === undefined ||
      isDisplayMode(candidate.displayMode))
  );
}

function readDismissedFlag(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return localStorage.getItem(DISMISSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeDismissedFlag(): void {
  try {
    localStorage.setItem(DISMISSED_STORAGE_KEY, 'true');
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
}

function writeDisplayModeCookie(displayMode: 'desktop' | 'mobile'): void {
  document.cookie = [
    `displayMode=${displayMode}`,
    'path=/',
    `max-age=${DISPLAY_MODE_COOKIE_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
  ].join('; ');
}

function defaultNavigate(path: string): void {
  window.location.assign(path);
}

async function requestMobileUiuxAvailability(): Promise<MobileUiuxAvailability> {
  const response = await fetch('/api/mobile-uiux/context', {
    cache: 'no-store',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return UNAVAILABLE_AVAILABILITY;
  }

  const payload: unknown = await response.json();
  if (!isMobileUiuxContextPayload(payload)) {
    return UNAVAILABLE_AVAILABILITY;
  }

  return {
    ready: true,
    entryPath: resolveMobileUiuxEntryPath(payload.role.canonical),
    displayMode: payload.displayMode,
  };
}

function loadMobileUiuxAvailability(): Promise<MobileUiuxAvailability> {
  if (cachedAvailability) {
    return Promise.resolve(cachedAvailability);
  }

  if (!availabilityRequest) {
    availabilityRequest = requestMobileUiuxAvailability()
      .then(
        availability => {
          cachedAvailability = availability;
          return availability;
        },
        () => UNAVAILABLE_AVAILABILITY
      )
      .finally(() => {
        availabilityRequest = null;
      });
  }

  return availabilityRequest;
}

export function resetMobileUiuxEntryPromptCacheForTests(): void {
  cachedAvailability = null;
  availabilityRequest = null;
}

function useIsMobileViewport(enabled: boolean): boolean {
  const [isMobileViewport, setIsMobileViewport] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) {
      setIsMobileViewport(false);
      return;
    }

    const update = () => {
      setIsMobileViewport(window.innerWidth <= MOBILE_VIEWPORT_MAX_WIDTH);
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [enabled]);

  return isMobileViewport;
}

function useMobileUiuxAvailability(enabled: boolean): MobileUiuxAvailability {
  const [availability, setAvailability] =
    React.useState<MobileUiuxAvailability>(() => {
      if (!enabled) {
        return UNAVAILABLE_AVAILABILITY;
      }

      return cachedAvailability ?? { ready: false, entryPath: null };
    });

  React.useEffect(() => {
    if (!enabled) {
      setAvailability(UNAVAILABLE_AVAILABILITY);
      return;
    }

    if (cachedAvailability) {
      setAvailability(cachedAvailability);
      return;
    }

    let active = true;
    setAvailability({ ready: false, entryPath: null });
    void loadMobileUiuxAvailability().then(nextAvailability => {
      if (active) {
        setAvailability(nextAvailability);
      }
    });

    return () => {
      active = false;
    };
  }, [enabled]);

  return availability;
}

export function MobileUiuxEntryPrompt({
  variant = 'auto',
  className,
  onNavigate,
  navigate = defaultNavigate,
}: MobileUiuxEntryPromptProps) {
  const pathname = usePathname();
  const isMobileViewport = useIsMobileViewport(variant === 'auto');
  const [dismissed, setDismissed] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const isMobileUiuxPath = pathname?.startsWith('/mobile-uiux') ?? false;
  const availability = useMobileUiuxAvailability(
    !isMobileUiuxPath && (variant === 'menu-item' || isMobileViewport)
  );
  const entryPath = availability.entryPath;

  React.useEffect(() => {
    if (variant === 'auto') {
      setDismissed(readDismissedFlag());
    }
  }, [variant]);

  React.useEffect(() => {
    if (
      variant !== 'auto' ||
      !availability.ready ||
      !entryPath ||
      !isMobileViewport ||
      isMobileUiuxPath ||
      dismissed
    ) {
      setOpen(false);
      return;
    }

    setOpen(true);
  }, [
    availability.ready,
    dismissed,
    entryPath,
    isMobileUiuxPath,
    isMobileViewport,
    variant,
  ]);

  const handleOpenMobile = React.useCallback(() => {
    if (!entryPath) {
      return;
    }

    writeDisplayModeCookie('mobile');
    onNavigate?.();
    navigate(entryPath);
  }, [entryPath, navigate, onNavigate]);

  const handleStayDesktop = React.useCallback(() => {
    writeDisplayModeCookie('desktop');
    writeDismissedFlag();
    setDismissed(true);
    setOpen(false);
  }, []);

  const handleClose = React.useCallback(() => {
    writeDismissedFlag();
    setDismissed(true);
    setOpen(false);
  }, []);

  if (variant === 'menu-item') {
    if (!availability.ready || !entryPath || isMobileUiuxPath) {
      return null;
    }

    return (
      <button
        type='button'
        className={cn(className)}
        onClick={handleOpenMobile}
      >
        スマホ版で開く
      </button>
    );
  }

  if (!open || !entryPath) {
    return null;
  }

  return (
    <div className='fixed inset-x-0 bottom-0 z-[70] md:hidden'>
      <div
        className='mx-auto max-w-md rounded-t-2xl border border-gray-200 bg-white p-5 text-gray-900 shadow-2xl'
        role='dialog'
        aria-modal='true'
        aria-labelledby='mobile-uiux-entry-title'
        aria-describedby='mobile-uiux-entry-description'
      >
        <div className='mb-3 flex items-start gap-3'>
          <div className='min-w-0 flex-1'>
            <h2
              id='mobile-uiux-entry-title'
              className='text-base font-semibold leading-6'
            >
              スマホ版で表示しますか？
            </h2>
            <p
              id='mobile-uiux-entry-description'
              className='mt-2 text-sm leading-6 text-gray-600'
            >
              この端末ではスマホ版の画面を利用できます。
              予約・日報・設定をスマホ幅に最適化した画面で確認できます。
            </p>
          </div>
          <button
            type='button'
            aria-label='閉じる'
            className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600'
            onClick={handleClose}
          >
            <X className='h-5 w-5' aria-hidden='true' />
          </button>
        </div>
        <div className='grid grid-cols-1 gap-2'>
          <Button
            type='button'
            variant='medical-primary'
            className='w-full'
            onClick={handleOpenMobile}
          >
            スマホ版で表示
          </Button>
          <Button
            type='button'
            variant='outline'
            className='w-full'
            onClick={handleStayDesktop}
          >
            PC版のまま使う
          </Button>
        </div>
      </div>
    </div>
  );
}
