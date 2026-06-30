import type { MobileUiuxDisplayMode } from '@/lib/mobile-uiux/contracts';

export const MOBILE_UIUX_DISPLAY_MODE_COOKIE = 'mobile_uiux_display_mode';
export const MOBILE_UIUX_DISMISSED_STORAGE_KEY = 'mobile_uiux_entry_dismissed';

export function normalizeMobileUiuxDisplayMode(
  mode: string | null | undefined
): MobileUiuxDisplayMode {
  if (mode === 'desktop' || mode === 'mobile' || mode === 'system') {
    return mode;
  }

  return 'system';
}

export function buildMobileUiuxDisplayModeCookie(
  mode: string | null | undefined
): string {
  const normalized = normalizeMobileUiuxDisplayMode(mode);
  return `${MOBILE_UIUX_DISPLAY_MODE_COOKIE}=${normalized}; path=/; max-age=31536000; samesite=lax`;
}
