/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  buildMobileUiuxDisplayModeCookie,
  MOBILE_UIUX_DISPLAY_MODE_COOKIE,
  normalizeMobileUiuxDisplayMode,
} from '@/lib/mobile-uiux/display-mode';
import { DisplayModeLink } from '@/components/mobile-uiux/display-mode-link';

// エントリーUX（バナー / メニュー項目、context API ゲート）は
// src/__tests__/mobile-uiux/mobile-entry-prompt.test.tsx が正。
// ここでは display mode ヘルパーと DisplayModeLink のみを検証する。

describe('mobile-uiux display mode helpers', () => {
  it('falls back to system for unknown display mode values', () => {
    expect(normalizeMobileUiuxDisplayMode('broken')).toBe('system');
    expect(buildMobileUiuxDisplayModeCookie('broken')).toContain(
      `${MOBILE_UIUX_DISPLAY_MODE_COOKIE}=system`
    );
  });

  it.each(['desktop', 'mobile', 'system'] as const)(
    'keeps valid display mode %s',
    mode => {
      expect(normalizeMobileUiuxDisplayMode(mode)).toBe(mode);
      expect(buildMobileUiuxDisplayModeCookie(mode)).toContain(
        `${MOBILE_UIUX_DISPLAY_MODE_COOKIE}=${mode}`
      );
    }
  );
});

describe('DisplayModeLink', () => {
  beforeEach(() => {
    document.cookie = `${MOBILE_UIUX_DISPLAY_MODE_COOKIE}=; path=/; max-age=0`;
  });

  it('saves desktop mode when returning from mobile-uiux to the PC version', async () => {
    render(
      <DisplayModeLink
        href='/dashboard'
        mode='desktop'
        onClick={event => event.preventDefault()}
      >
        PC版に戻る
      </DisplayModeLink>
    );

    await userEvent.click(screen.getByText('PC版に戻る'));

    expect(document.cookie).toContain(
      `${MOBILE_UIUX_DISPLAY_MODE_COOKIE}=desktop`
    );
  });

  it('saves mobile mode when navigating into the mobile version', async () => {
    render(
      <DisplayModeLink
        href='/mobile-uiux/screens/home'
        mode='mobile'
        onClick={event => event.preventDefault()}
      >
        スマホ版で開く
      </DisplayModeLink>
    );

    await userEvent.click(screen.getByText('スマホ版で開く'));

    expect(document.cookie).toContain(
      `${MOBILE_UIUX_DISPLAY_MODE_COOKIE}=mobile`
    );
  });
});
