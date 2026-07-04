/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  buildMobileUiuxDisplayModeCookie,
  normalizeMobileUiuxDisplayMode,
} from '@/lib/mobile-uiux/display-mode';
import { DisplayModeLink } from '@/components/mobile-uiux/display-mode-link';

describe('mobile-uiux display mode helpers', () => {
  it('falls back to system for unknown display mode values', () => {
    expect(normalizeMobileUiuxDisplayMode('broken')).toBe('system');
    expect(buildMobileUiuxDisplayModeCookie('broken')).toContain(
      'mobile_uiux_display_mode=system'
    );
  });
});

describe('mobile-uiux entry UX', () => {
  const originalFetch = global.fetch;
  const originalLocation = window.location;
  let assignMock: jest.Mock<void, [string]>;

  function setViewportWidth(width: number) {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: width,
    });
  }

  beforeEach(() => {
    localStorage.clear();
    assignMock = jest.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        assign: assignMock,
      },
    });
    setViewportWidth(390);
    global.fetch = jest.fn(async () =>
      Response.json({
        success: true,
        data: {
          displayMode: 'system',
        },
        generatedAt: '2026-07-01T00:00:00.000Z',
      })
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('lets mobile viewport users stay on the PC version', async () => {
    const { MobileUiuxEntryPrompt } = await import(
      '@/components/mobile-uiux/mobile-entry-prompt'
    );

    render(<MobileUiuxEntryPrompt />);

    expect(assignMock).not.toHaveBeenCalled();
    expect(await screen.findByText('スマホ版で開く')).toBeInTheDocument();

    await userEvent.click(screen.getByText('PC版のまま使う'));

    expect(document.cookie).toContain('mobile_uiux_display_mode=desktop');
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('lets desktop admin users open the mobile home version intentionally', async () => {
    setViewportWidth(1280);
    const { MobileUiuxEntryPrompt } = await import(
      '@/components/mobile-uiux/mobile-entry-prompt'
    );

    render(<MobileUiuxEntryPrompt variant='menu-item' role='admin' />);

    await userEvent.click(await screen.findByText('スマホ版で開く'));

    expect(document.cookie).toContain('mobile_uiux_display_mode=mobile');
    expect(assignMock).toHaveBeenCalledWith('/mobile-uiux/screens/home');
  });

  it.each(['clinic_admin', 'manager'] as const)(
    'opens the mobile home version for %s users',
    async role => {
      const { MobileUiuxEntryPrompt } = await import(
        '@/components/mobile-uiux/mobile-entry-prompt'
      );

      render(<MobileUiuxEntryPrompt variant='menu-item' role={role} />);

      await userEvent.click(screen.getByText('スマホ版で開く'));

      expect(assignMock).toHaveBeenCalledWith('/mobile-uiux/screens/home');
    }
  );

  it.each(['therapist', 'staff'] as const)(
    'opens the mobile reservations version for %s users',
    async role => {
      const { MobileUiuxEntryPrompt } = await import(
        '@/components/mobile-uiux/mobile-entry-prompt'
      );

      render(<MobileUiuxEntryPrompt variant='menu-item' role={role} />);

      await userEvent.click(screen.getByText('スマホ版で開く'));

      expect(document.cookie).toContain('mobile_uiux_display_mode=mobile');
      expect(assignMock).toHaveBeenCalledWith(
        '/mobile-uiux/screens/reservations'
      );
    }
  );

  it('falls back to mobile reservations while the user role is not loaded', async () => {
    const { MobileUiuxEntryPrompt } = await import(
      '@/components/mobile-uiux/mobile-entry-prompt'
    );

    render(<MobileUiuxEntryPrompt variant='menu-item' />);

    await userEvent.click(screen.getByText('スマホ版で開く'));

    expect(assignMock).toHaveBeenCalledWith(
      '/mobile-uiux/screens/reservations'
    );
  });

  it('does not repeat the mobile viewport banner after dismiss', async () => {
    const { MobileUiuxEntryPrompt } = await import(
      '@/components/mobile-uiux/mobile-entry-prompt'
    );
    const { rerender } = render(<MobileUiuxEntryPrompt />);

    await userEvent.click(await screen.findByLabelText('表示しない'));
    rerender(<MobileUiuxEntryPrompt />);

    await waitFor(() => {
      expect(screen.queryByText('スマホ版で開く')).not.toBeInTheDocument();
    });
  });

  it('does not show the mobile viewport banner when the mobile context is forbidden', async () => {
    global.fetch = jest.fn(async () =>
      Response.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'forbidden',
          },
        },
        { status: 403 }
      )
    );
    const { MobileUiuxEntryPrompt } = await import(
      '@/components/mobile-uiux/mobile-entry-prompt'
    );

    render(<MobileUiuxEntryPrompt />);

    await waitFor(() => {
      expect(screen.queryByText('スマホ版で開く')).not.toBeInTheDocument();
    });
  });

  it('keeps the header menu entry visible when the mobile context is forbidden', async () => {
    global.fetch = jest.fn(async () =>
      Response.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'forbidden',
          },
        },
        { status: 403 }
      )
    );
    const { MobileUiuxEntryPrompt } = await import(
      '@/components/mobile-uiux/mobile-entry-prompt'
    );

    render(<MobileUiuxEntryPrompt variant='menu-item' role='therapist' />);

    await userEvent.click(screen.getByText('スマホ版で開く'));

    expect(document.cookie).toContain('mobile_uiux_display_mode=mobile');
    expect(assignMock).toHaveBeenCalledWith(
      '/mobile-uiux/screens/reservations'
    );
    expect(global.fetch).not.toHaveBeenCalled();
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

    expect(document.cookie).toContain('mobile_uiux_display_mode=desktop');
  });
});
