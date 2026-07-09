/** @jest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MobileUiuxEntryPrompt,
  resetMobileUiuxEntryPromptCacheForTests,
} from '@/components/mobile-uiux/mobile-entry-prompt';

let pathnameMock = '/dashboard';

jest.mock('next/navigation', () => ({
  usePathname: () => pathnameMock,
}));

const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
const originalFetch = global.fetch;

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    value: width,
    configurable: true,
  });
  window.dispatchEvent(new Event('resize'));
}

function mockContextResponse(role: string | null, status = 200): void {
  if (status !== 200) {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: 'forbidden',
          reasonCode: 'role_not_allowed',
        }),
        {
          status,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    return;
  }

  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        success: true,
        role: { canonical: role },
        displayMode: 'system',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  );
}

describe('MobileUiuxEntryPrompt', () => {
  beforeEach(() => {
    resetMobileUiuxEntryPromptCacheForTests();
    pathnameMock = '/dashboard';
    global.fetch = fetchMock;
    fetchMock.mockReset();
    Object.defineProperty(window, 'localStorage', {
      value: createMemoryStorage(),
      configurable: true,
    });
    localStorage.clear();
    document.cookie = 'displayMode=; path=/; max-age=0';
    setViewportWidth(390);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it.each([
    ['admin', '/mobile-uiux/screens/home'],
    ['clinic_admin', '/mobile-uiux/screens/home'],
    ['manager', '/mobile-uiux/screens/home'],
    ['therapist', '/mobile-uiux/screens/reservations'],
    ['staff', '/mobile-uiux/screens/reservations'],
  ])('opens role entry path for %s from mobile prompt', async (role, path) => {
    const navigate = jest.fn();
    mockContextResponse(role);

    render(<MobileUiuxEntryPrompt navigate={navigate} />);

    expect(
      await screen.findByRole('dialog', { name: 'スマホ版で表示しますか？' })
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'スマホ版で表示' })
    );

    expect(document.cookie).toContain('displayMode=mobile');
    expect(navigate).toHaveBeenCalledWith(path);
  });

  it('does not show auto prompt on context 403', async () => {
    mockContextResponse(null, 403);

    render(<MobileUiuxEntryPrompt />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not show auto prompt for customer role', async () => {
    mockContextResponse('customer');

    render(<MobileUiuxEntryPrompt />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not show auto prompt when dismissed flag is already set', async () => {
    localStorage.setItem('mobile-uiux-entry-prompt-dismissed', 'true');
    mockContextResponse('admin');

    render(<MobileUiuxEntryPrompt />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps menu item visible after dismissed when context succeeds', async () => {
    localStorage.setItem('mobile-uiux-entry-prompt-dismissed', 'true');
    mockContextResponse('staff');

    render(<MobileUiuxEntryPrompt variant='menu-item' />);

    expect(
      await screen.findByRole('button', { name: 'スマホ版で開く' })
    ).toBeInTheDocument();
  });

  it('hides menu item on context 403', async () => {
    mockContextResponse(null, 403);

    render(<MobileUiuxEntryPrompt variant='menu-item' />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(
      screen.queryByRole('button', { name: 'スマホ版で開く' })
    ).not.toBeInTheDocument();
  });

  it('stores desktop cookie and dismissed flag on secondary action', async () => {
    mockContextResponse('admin');

    render(<MobileUiuxEntryPrompt />);

    await screen.findByRole('dialog', { name: 'スマホ版で表示しますか？' });
    await userEvent.click(
      screen.getByRole('button', { name: 'PC版のまま使う' })
    );

    expect(document.cookie).toContain('displayMode=desktop');
    expect(localStorage.getItem('mobile-uiux-entry-prompt-dismissed')).toBe(
      'true'
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stores dismissed flag on close', async () => {
    mockContextResponse('admin');

    render(<MobileUiuxEntryPrompt />);

    await screen.findByRole('dialog', { name: 'スマホ版で表示しますか？' });
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }));

    expect(localStorage.getItem('mobile-uiux-entry-prompt-dismissed')).toBe(
      'true'
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not show auto prompt on desktop width', async () => {
    mockContextResponse('admin');
    setViewportWidth(1024);

    render(<MobileUiuxEntryPrompt />);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not show auto prompt inside mobile-uiux path', async () => {
    mockContextResponse('admin');
    pathnameMock = '/mobile-uiux/screens/home';
    setViewportWidth(390);

    render(<MobileUiuxEntryPrompt />);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shares the context request between auto prompt and menu item', async () => {
    mockContextResponse('admin');

    render(
      <>
        <MobileUiuxEntryPrompt />
        <MobileUiuxEntryPrompt variant='menu-item' />
      </>
    );

    expect(
      await screen.findByRole('button', { name: 'スマホ版で開く' })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('dialog', { name: 'スマホ版で表示しますか？' })
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
