/**
 * 公開サイトの問い合わせquery許可一覧・旧OSアンカー互換・フォームURL解決
 * 仕様: Tiramisu共通サイト・LP統合 v2.0（A25〜A30）
 */
import {
  createContactCtaLink,
  createContactHref,
  LEGACY_OS_ANCHOR_IDS,
  normalizeContactSelection,
  resolveLegacyOsAnchor,
} from '@/components/public/marketing-links';
import {
  createCtaLink,
  isSafeExternalFormUrl,
  resolveLpFormLink,
} from '@/components/public/lp-links';

const DEFAULT_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSdDWLJGheg_Qgaxz7p2X45GumchuLIqabYjAmcBV-4h82HQag/viewform?usp=publish-editor';

describe('normalizeContactSelection（A27/A28/A26）', () => {
  it('許可された product / intent / plan を採用する', () => {
    expect(
      normalizeContactSelection({
        product: 'works',
        intent: 'sales',
        plan: 'standard',
      })
    ).toEqual({ product: 'works', intent: 'sales', plan: 'standard' });
    expect(
      normalizeContactSelection({ intent: 'operator-disclosure' })
    ).toEqual({ product: null, intent: 'operator-disclosure', plan: null });
  });

  it.each(['light', 'standard', 'pro', 'custom'])(
    'Worksの導入相談では plan=%s を採用する',
    plan => {
      expect(
        normalizeContactSelection({ product: 'works', intent: 'sales', plan })
          .plan
      ).toBe(plan);
    }
  );

  it.each([
    { product: 'os', intent: 'sales' },
    { product: 'both', intent: 'sales' },
    { product: 'works', intent: 'support' },
    { product: 'works' },
    { intent: 'sales' },
  ])('Works×導入相談以外では plan を採用しない: %o', params => {
    expect(
      normalizeContactSelection({ ...params, plan: 'standard' }).plan
    ).toBeNull();
  });

  it('未知の値・大文字違い・重複指定は未選択に戻す', () => {
    expect(
      normalizeContactSelection({
        product: 'Works',
        intent: 'refund',
        plan: 'enterprise',
      })
    ).toEqual({ product: null, intent: null, plan: null });
    expect(
      normalizeContactSelection({
        product: ['works', 'os'],
        intent: ['sales', 'sales'],
      })
    ).toEqual({ product: null, intent: null, plan: null });
  });

  it('HTMLやURLを含む値は採用しない', () => {
    expect(
      normalizeContactSelection({
        product: '<script>alert(1)</script>',
        intent: 'https://evil.example/',
        plan: 'javascript:alert(1)',
      })
    ).toEqual({ product: null, intent: null, plan: null });
  });
});

describe('createContactHref / createContactCtaLink', () => {
  it('固定の順序で /contact のqueryを組み立てる', () => {
    expect(createContactHref()).toBe('/contact');
    expect(createContactHref({ product: 'os', intent: 'sales' })).toBe(
      '/contact?product=os&intent=sales'
    );
    expect(
      createContactHref({ product: 'works', intent: 'sales', plan: 'custom' })
    ).toBe('/contact?product=works&intent=sales&plan=custom');
    expect(createContactHref({ intent: 'operator-disclosure' })).toBe(
      '/contact?intent=operator-disclosure'
    );
  });

  it('Works×導入相談以外では plan を付けない', () => {
    expect(
      createContactHref({ product: 'os', intent: 'sales', plan: 'pro' })
    ).toBe('/contact?product=os&intent=sales');
  });

  it('製品LPのCTAは内部の問い合わせページを指す', () => {
    expect(
      createContactCtaLink('デモ相談をする', 'demo', {
        product: 'os',
        intent: 'sales',
      })
    ).toEqual({
      label: 'デモ相談をする',
      kind: 'demo',
      href: '/contact?product=os&intent=sales',
      external: false,
    });
  });
});

describe('resolveLegacyOsAnchor（A25/A26）', () => {
  it('移設前のOS LPに実在した全アンカーを /os#... へ移す', () => {
    expect(LEGACY_OS_ANCHOR_IDS).toEqual([
      'problems',
      'features',
      'ai',
      'roi',
      'pricing',
      'faq',
      'contact',
    ]);
    for (const id of LEGACY_OS_ANCHOR_IDS) {
      expect(resolveLegacyOsAnchor(`#${id}`)).toBe(`/os#${id}`);
    }
  });

  it('URLエンコードされた旧アンカーも許可一覧で照合する', () => {
    expect(resolveLegacyOsAnchor('#%70ricing')).toBe('/os#pricing');
  });

  it.each([
    '',
    '#',
    '#products',
    '#Pricing',
    '#pricing/extra',
    '#%E0%A4%A',
    '#https://evil.example',
    '#javascript:alert(1)',
    'pricing',
  ])('未知・不正なhash %p は遷移先にしない', hash => {
    expect(resolveLegacyOsAnchor(hash)).toBeNull();
  });
});

describe('resolveLpFormLink（A29/A30）', () => {
  it('未設定・空・空白だけなら既定のGoogleフォーム', () => {
    for (const raw of [undefined, '', '   ']) {
      expect(resolveLpFormLink(raw)).toEqual({
        status: 'ready',
        href: DEFAULT_FORM_URL,
        source: 'default',
      });
    }
  });

  it('httpsのURLが設定されていればそれを優先する（前後の空白は除く）', () => {
    expect(resolveLpFormLink('  https://forms.gle/example  ')).toEqual({
      status: 'ready',
      href: 'https://forms.gle/example',
      source: 'env',
    });
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://docs.google.com/forms/x',
    'https://user:pass@docs.google.com/forms/x',
    'not a url',
    '//docs.google.com/forms/x',
  ])('不正な設定値 %p は既定URLへ黙って戻さず invalid にする', raw => {
    expect(resolveLpFormLink(raw)).toEqual({
      status: 'invalid',
      source: 'env',
    });
    expect(isSafeExternalFormUrl(raw)).toBe(false);
  });
});

describe('LP_FORM_URL / createCtaLink の既存契約', () => {
  const original = process.env.NEXT_PUBLIC_LP_FORM_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_LP_FORM_URL;
    } else {
      process.env.NEXT_PUBLIC_LP_FORM_URL = original;
    }
  });

  function loadLinks() {
    let loaded: typeof import('@/components/public/lp-links') | undefined;
    jest.isolateModules(() => {
      loaded = require('@/components/public/lp-links');
    });
    if (!loaded) throw new Error('lp-links could not be loaded');
    return loaded;
  }

  it('環境変数あり・空・未設定で従来の優先順位を維持する', () => {
    process.env.NEXT_PUBLIC_LP_FORM_URL = ' https://forms.gle/custom ';
    expect(loadLinks().LP_FORM_URL).toBe('https://forms.gle/custom');

    process.env.NEXT_PUBLIC_LP_FORM_URL = '';
    expect(loadLinks().LP_FORM_URL).toBe(DEFAULT_FORM_URL);

    delete process.env.NEXT_PUBLIC_LP_FORM_URL;
    expect(loadLinks().LP_FORM_URL).toBe(DEFAULT_FORM_URL);
  });

  it('createCtaLink は外部フォームへのリンクを返す契約のまま', () => {
    expect(createCtaLink('問い合わせる', 'contact')).toEqual({
      label: '問い合わせる',
      kind: 'contact',
      href: expect.stringMatching(/^https:\/\//),
      external: true,
    });
  });
});
