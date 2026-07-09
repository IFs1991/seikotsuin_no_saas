'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Smartphone, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  buildMobileUiuxDisplayModeCookie,
  MOBILE_UIUX_DISMISSED_STORAGE_KEY,
} from '@/lib/mobile-uiux/display-mode';
import { resolveMobileUiuxEntryPath } from '@/lib/mobile-uiux/navigation';
import { cn } from '@/lib/utils';

type MobileUiuxDisplayMode = 'desktop' | 'mobile' | 'system';

type MobileUiuxAvailability = {
  ready: boolean;
  entryPath: string | null;
  displayMode?: MobileUiuxDisplayMode;
};

type MobileUiuxEntryPromptVariant = 'banner' | 'auto' | 'menu-item';

type MobileUiuxEntryPromptProps = {
  variant?: MobileUiuxEntryPromptVariant;
  role?: string | null;
  className?: string;
  onNavigate?: () => void;
  navigate?: (path: string) => void;
};

type MobileUiuxContextPayload = {
  success: true;
  data: {
    role: {
      canonical: string | null;
    };
    displayMode?: MobileUiuxDisplayMode;
  };
};

const MOBILE_VIEWPORT_MAX_WIDTH = 767;
const UNAVAILABLE_AVAILABILITY: MobileUiuxAvailability = {
  ready: true,
  entryPath: null,
};

let cachedAvailability: MobileUiuxAvailability | null = null;
let availabilityRequest: Promise<MobileUiuxAvailability> | null = null;

function isDisplayMode(value: unknown): value is MobileUiuxDisplayMode {
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
    data?: {
      role?: { canonical?: unknown };
      displayMode?: unknown;
    };
  };

  return (
    candidate.success === true &&
    typeof candidate.data === 'object' &&
    candidate.data !== null &&
    typeof candidate.data.role === 'object' &&
    candidate.data.role !== null &&
    (typeof candidate.data.role.canonical === 'string' ||
      candidate.data.role.canonical === null) &&
    (candidate.data.displayMode === undefined ||
      isDisplayMode(candidate.data.displayMode))
  );
}

function readDismissedFlag(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return localStorage.getItem(MOBILE_UIUX_DISMISSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeDismissedFlag(): void {
  try {
    localStorage.setItem(MOBILE_UIUX_DISMISSED_STORAGE_KEY, 'true');
  } catch {
    return;
  }
}

function writeDisplayModeCookie(displayMode: 'desktop' | 'mobile'): void {
  document.cookie = buildMobileUiuxDisplayModeCookie(displayMode);
}

function defaultNavigate(path: string): void {
  window.location.assign(path);
}

async function requestMobileUiuxAvailability(
  fallbackRole: string | null | undefined
): Promise<MobileUiuxAvailability> {
  const response = await fetch('/api/mobile-uiux/context', {
    cache: 'no-store',
    credentials: 'same-origin',
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

  const canonicalRole = payload.data.role.canonical ?? fallbackRole ?? null;

  return {
    ready: true,
    entryPath: resolveMobileUiuxEntryPath(canonicalRole),
    displayMode: payload.data.displayMode,
  };
}

function loadMobileUiuxAvailability(
  fallbackRole: string | null | undefined
): Promise<MobileUiuxAvailability> {
  if (cachedAvailability) {
    return Promise.resolve(cachedAvailability);
  }

  if (!availabilityRequest) {
    availabilityRequest = requestMobileUiuxAvailability(fallbackRole)
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

function useMobileUiuxAvailability(
  enabled: boolean,
  fallbackRole: string | null | undefined
): MobileUiuxAvailability {
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
    void loadMobileUiuxAvailability(fallbackRole).then(nextAvailability => {
      if (active) {
        setAvailability(nextAvailability);
      }
    });

    return () => {
      active = false;
    };
  }, [enabled, fallbackRole]);

  return availability;
}

export function MobileUiuxEntryPrompt({
  variant = 'banner',
  role = null,
  className,
  onNavigate,
  navigate = defaultNavigate,
}: MobileUiuxEntryPromptProps) {
  const normalizedVariant = variant === 'auto' ? 'banner' : variant;
  const pathname = usePathname();
  const isMobileUiuxPath = pathname?.startsWith('/mobile-uiux') ?? false;
  const isMobileViewport = useIsMobileViewport(normalizedVariant === 'banner');
  const availability = useMobileUiuxAvailability(
    !isMobileUiuxPath &&
      (normalizedVariant === 'menu-item' || isMobileViewport),
    role
  );
  const [dismissed, setDismissed] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const entryPath = availability.entryPath;

  React.useEffect(() => {
    if (normalizedVariant === 'banner') {
      setDismissed(readDismissedFlag());
    }
  }, [normalizedVariant]);

  React.useEffect(() => {
    if (
      normalizedVariant !== 'banner' ||
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
    normalizedVariant,
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

  if (normalizedVariant === 'menu-item') {
    if (!availability.ready || !entryPath || isMobileUiuxPath) {
      return null;
    }

    return (
      <button
        type='button'
        className={cn(
          'block w-full px-4 py-2 text-left text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none',
          className
        )}
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
    <div className='fixed inset-x-3 bottom-4 z-50 md:hidden'>
      <div
        className='rounded-md border border-border bg-card p-3 text-foreground shadow-lg'
        role='dialog'
        aria-modal='true'
        aria-labelledby='mobile-uiux-entry-title'
        aria-describedby='mobile-uiux-entry-description'
      >
        <div className='flex items-start gap-3'>
          <span className='mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'>
            <Smartphone className='h-5 w-5' aria-hidden='true' />
          </span>
          <div className='min-w-0 flex-1 space-y-2'>
            <div className='space-y-1'>
              <h2
                id='mobile-uiux-entry-title'
                className='text-sm font-semibold'
              >
                スマホ版で表示しますか？
              </h2>
              <p
                id='mobile-uiux-entry-description'
                className='text-xs leading-5 text-muted-foreground'
              >
                この端末ではスマホ版の画面を利用できます。
                予約・日報・設定をスマホ幅に最適化した画面で確認できます。
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Button type='button' size='sm' onClick={handleOpenMobile}>
                スマホ版で表示
              </Button>
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={handleStayDesktop}
              >
                PC版のまま使う
              </Button>
            </div>
          </div>
          <button
            type='button'
            className='inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground'
            aria-label='閉じる'
            onClick={handleClose}
          >
            <X className='h-4 w-4' aria-hidden='true' />
          </button>
        </div>
      </div>
    </div>
  );
}
