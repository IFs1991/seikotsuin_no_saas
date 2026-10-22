/**
 * 公開サイトのページテスト用の補助。
 * - jsdom 20 は <dialog> の showModal/close を実装していないため最小限を補う。
 * - jest.setup.after.js の sessionStorage は値を保持しない jest.fn() のため in-memory 実装を与える。
 */
import { PRODUCT_SELECTOR_SEEN_KEY } from '@/components/public/product-selector';

const sessionStore = new Map<string, string>();

function getSessionStorageMock() {
  return window.sessionStorage as unknown as {
    getItem: jest.Mock;
    setItem: jest.Mock;
    removeItem: jest.Mock;
    clear: jest.Mock;
  };
}

export function setupPublicSiteTestEnvironment() {
  beforeAll(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value(this: HTMLDialogElement) {
        if (!this.hasAttribute('open')) return;
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close'));
      },
    });
  });

  beforeEach(() => {
    sessionStore.clear();
    const storage = getSessionStorageMock();
    storage.getItem.mockImplementation(
      (key: string) => sessionStore.get(key) ?? null
    );
    storage.setItem.mockImplementation((key: string, value: string) => {
      sessionStore.set(key, String(value));
    });
    storage.removeItem.mockImplementation((key: string) => {
      sessionStore.delete(key);
    });
    storage.clear.mockImplementation(() => sessionStore.clear());
    document.documentElement.classList.remove('lp-scroll-locked');
  });
}

export function markProductSelectorSeen() {
  sessionStore.set(PRODUCT_SELECTOR_SEEN_KEY, '1');
}

export function hasSeenProductSelector() {
  return sessionStore.has(PRODUCT_SELECTOR_SEEN_KEY);
}
