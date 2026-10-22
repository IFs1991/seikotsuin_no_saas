/** @jest-environment jsdom */
/**
 * 製品選択モーダル（初回限定の自動表示・storage失敗・旧アンカー・フォーカス）
 * 仕様: Tiramisu共通サイト・LP統合 v2.0（A02, A05〜A12, A19, A25, A26）
 * 実ブラウザでのEsc・背景操作の制限・Tab循環・JavaScript無効時のSSR（A11）は
 * Playwright（public-site.spec.ts）で確認する。
 */
import React, { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  claimProductSelectorAutoOpen,
  PRODUCT_SELECTOR_SEEN_KEY,
  ProductSelector,
} from '@/components/public/product-selector';

jest.mock('next/link', () => {
  const MockLink = ({
    href,
    children,
    prefetch: _prefetch,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    prefetch?: boolean;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement('a', { href, ...rest }, children);
  MockLink.displayName = 'Link';
  return MockLink;
});

const TITLE = 'お店の運営に、どちらのTiramisuを。';

function Cards() {
  return (
    <div>
      <a href='/works'>Tiramisu Worksを見る</a>
      <a href='/os'>Tiramisu OSを見る</a>
    </div>
  );
}

function renderSelector(
  props: Partial<React.ComponentProps<typeof ProductSelector>> = {}
) {
  return render(
    <ProductSelector
      title={TITLE}
      description='今のツールを活かすか、店舗の情報をまとめるか。目的に合わせて選べます。'
      {...props}
    >
      <Cards />
    </ProductSelector>
  );
}

const queryDialog = () => document.querySelector('dialog');

// jsdom 20 は <dialog> の showModal/close を実装していないため、仕様どおりの最小限を補う。
const showModalMock = jest.fn(function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
});
const closeMock = jest.fn(function (this: HTMLDialogElement) {
  if (!this.hasAttribute('open')) return;
  this.removeAttribute('open');
  this.dispatchEvent(new Event('close'));
});

const originalLocation = window.location;

// jest.setup.after.js の sessionStorage は値を保持しない jest.fn() のため、テストでは
// 同じモックに in-memory の実装を与えて、実際の読み書きと失敗を再現する。
const sessionStore = new Map<string, string>();
const sessionStorageMock = window.sessionStorage as unknown as {
  getItem: jest.Mock;
  setItem: jest.Mock;
  removeItem: jest.Mock;
  clear: jest.Mock;
};

function mockLocationHash(hash: string) {
  const replace = jest.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, hash, replace },
  });
  return replace;
}

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: showModalMock,
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: closeMock,
  });
});

beforeEach(() => {
  sessionStore.clear();
  sessionStorageMock.getItem.mockImplementation(
    (key: string) => sessionStore.get(key) ?? null
  );
  sessionStorageMock.setItem.mockImplementation(
    (key: string, value: string) => {
      sessionStore.set(key, String(value));
    }
  );
  sessionStorageMock.removeItem.mockImplementation((key: string) => {
    sessionStore.delete(key);
  });
  sessionStorageMock.clear.mockImplementation(() => sessionStore.clear());
  showModalMock.mockClear();
  closeMock.mockClear();
  document.documentElement.classList.remove('lp-scroll-locked');
});

afterEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: originalLocation,
  });
});

describe('claimProductSelectorAutoOpen', () => {
  it('未表示なら表示済みの固定値を記録して true、記録済みなら false', () => {
    expect(claimProductSelectorAutoOpen()).toBe(true);
    expect(window.sessionStorage.getItem(PRODUCT_SELECTOR_SEEN_KEY)).toBe('1');
    expect(claimProductSelectorAutoOpen()).toBe(false);
  });

  it('storage の取得・読取・書込の失敗では例外を出さず false（A08/A09）', () => {
    expect(
      claimProductSelectorAutoOpen(() => {
        throw new Error('SecurityError');
      })
    ).toBe(false);
    const readFails = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: jest.fn(),
    } as unknown as Storage;
    expect(claimProductSelectorAutoOpen(() => readFails)).toBe(false);
    const writeFails = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    } as unknown as Storage;
    expect(claimProductSelectorAutoOpen(() => writeFails)).toBe(false);
  });
});

describe('ProductSelector', () => {
  it('初回は1回だけ自動で開き、背景スクロールを止める（A02）', () => {
    renderSelector({ autoOpenOnFirstVisit: true });

    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument();
    expect(showModalMock).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(PRODUCT_SELECTOR_SEEN_KEY)).toBe('1');
    expect(document.documentElement).toHaveClass('lp-scroll-locked');
    // 初期フォーカスは見出し（どちらの製品にも偏らない）
    expect(screen.getByRole('heading', { name: TITLE })).toHaveFocus();
  });

  it('同じセッションで表示済みなら自動で開かない（A06）', () => {
    window.sessionStorage.setItem(PRODUCT_SELECTOR_SEEN_KEY, '1');
    renderSelector({ autoOpenOnFirstVisit: true });
    expect(queryDialog()).toBeNull();
  });

  it('自動表示を許可していないページでは開かず、storage にも書かない（A12）', () => {
    renderSelector();
    expect(queryDialog()).toBeNull();
    expect(window.sessionStorage.getItem(PRODUCT_SELECTOR_SEEN_KEY)).toBeNull();
  });

  it('Strict Mode の二重effectでも二重に開かない（A10）', () => {
    render(
      <StrictMode>
        <ProductSelector title={TITLE} description='説明' autoOpenOnFirstVisit>
          <Cards />
        </ProductSelector>
      </StrictMode>
    );
    expect(document.querySelectorAll('dialog')).toHaveLength(1);
    expect(showModalMock).toHaveBeenCalledTimes(1);
  });

  it('storage の読取が拒否されてもクラッシュせず、手動では開ける（A08）', async () => {
    sessionStorageMock.getItem.mockImplementation(() => {
      throw new Error('SecurityError');
    });
    renderSelector({ autoOpenOnFirstVisit: true });
    expect(queryDialog()).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '製品を選ぶ' }));
    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument();
  });

  it('storage の書込に失敗した場合は自動表示を省略する（A09）', async () => {
    sessionStorageMock.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    renderSelector({ autoOpenOnFirstVisit: true });
    expect(queryDialog()).toBeNull();

    // 表示済みを記録できなくても、手動の「製品を選ぶ」は使える
    await userEvent.click(screen.getByRole('button', { name: '製品を選ぶ' }));
    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument();
  });

  it('表示済みでも「製品を選ぶ」で開き、閉じると起動元へフォーカスを戻す（A07）', async () => {
    window.sessionStorage.setItem(PRODUCT_SELECTOR_SEEN_KEY, '1');
    renderSelector({ autoOpenOnFirstVisit: true });
    const trigger = screen.getByRole('button', { name: '製品を選ぶ' });

    await userEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'あとで選ぶ' }));
    expect(queryDialog()).toBeNull();
    expect(trigger).toHaveFocus();
    expect(document.documentElement).not.toHaveClass('lp-scroll-locked');
  });

  it('×・背景・Esc相当のclose で閉じる（A05）', async () => {
    renderSelector({ autoOpenOnFirstVisit: true });
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(queryDialog()).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '製品を選ぶ' }));
    const dialog = screen.getByRole('dialog', { name: TITLE });
    fireEvent.pointerDown(dialog);
    fireEvent.click(dialog);
    expect(queryDialog()).toBeNull();

    // 内側から背景へドラッグしただけでは閉じない
    await userEvent.click(screen.getByRole('button', { name: '製品を選ぶ' }));
    const reopened = screen.getByRole('dialog', { name: TITLE });
    fireEvent.pointerDown(screen.getByRole('heading', { name: TITLE }));
    fireEvent.click(reopened);
    expect(queryDialog()).not.toBeNull();

    // ブラウザがEscで閉じたときの close イベント
    act(() => {
      reopened.removeAttribute('open');
      reopened.dispatchEvent(new Event('close'));
    });
    expect(queryDialog()).toBeNull();
    expect(screen.getByRole('button', { name: '製品を選ぶ' })).toHaveFocus();
  });

  it('製品リンクは実hrefを持ち、同じタブの遷移では閉じて起動元へ戻さない（A03/A04/A18/A19）', async () => {
    renderSelector({ autoOpenOnFirstVisit: true });
    const dialog = screen.getByRole('dialog', { name: TITLE });
    expect(
      screen.getByRole('link', { name: 'Tiramisu Worksを見る' })
    ).toHaveAttribute('href', '/works');
    expect(
      screen.getByRole('link', { name: 'Tiramisu OSを見る' })
    ).toHaveAttribute('href', '/os');
    expect(dialog.querySelector('a a, a button, button a')).toBeNull();

    const preventNavigation = (event: Event) => event.preventDefault();
    document.addEventListener('click', preventNavigation);
    const trigger = screen.getByRole('button', { name: '製品を選ぶ' });
    await userEvent.click(
      screen.getByRole('link', { name: 'Tiramisu OSを見る' })
    );
    document.removeEventListener('click', preventNavigation);

    expect(queryDialog()).toBeNull();
    expect(trigger).not.toHaveFocus();
    expect(document.documentElement).not.toHaveClass('lp-scroll-locked');
  });

  it('修飾キー付きクリック（新しいタブ）ではモーダルを残す', async () => {
    renderSelector({ autoOpenOnFirstVisit: true });
    const preventNavigation = (event: Event) => event.preventDefault();
    document.addEventListener('click', preventNavigation);
    fireEvent.click(screen.getByRole('link', { name: 'Tiramisu OSを見る' }), {
      ctrlKey: true,
    });
    document.removeEventListener('click', preventNavigation);
    expect(queryDialog()).not.toBeNull();
  });

  it('<dialog> のモーダル表示に未対応のブラウザでは自動表示せず、手動では製品カードへ案内する', async () => {
    const replace = mockLocationHash('');
    const assign = jest.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign, replace },
    });
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLDialogElement.prototype,
      'showModal'
    );
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: undefined,
    });
    try {
      renderSelector({ autoOpenOnFirstVisit: true });
      expect(queryDialog()).toBeNull();
      expect(sessionStore.has(PRODUCT_SELECTOR_SEEN_KEY)).toBe(false);
      await userEvent.click(screen.getByRole('button', { name: '製品を選ぶ' }));
      expect(assign).toHaveBeenCalledWith('/#products');
      expect(queryDialog()).toBeNull();
    } finally {
      if (descriptor) {
        Object.defineProperty(
          HTMLDialogElement.prototype,
          'showModal',
          descriptor
        );
      }
    }
  });

  it('既知の旧OSアンカーは /os#... へ置換し、モーダルを出さない（A25）', () => {
    const replace = mockLocationHash('#pricing');
    renderSelector({
      autoOpenOnFirstVisit: true,
      redirectLegacyOsAnchors: true,
    });
    expect(replace).toHaveBeenCalledWith('/os#pricing');
    expect(queryDialog()).toBeNull();
    expect(window.sessionStorage.getItem(PRODUCT_SELECTOR_SEEN_KEY)).toBeNull();
  });

  it('未知のhashや悪意ある値では遷移せず、共通トップに留まる（A26）', () => {
    const replace = mockLocationHash('#https://evil.example/');
    renderSelector({
      autoOpenOnFirstVisit: true,
      redirectLegacyOsAnchors: true,
    });
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument();
  });
});
