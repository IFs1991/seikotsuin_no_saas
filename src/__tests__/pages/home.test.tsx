/** @jest-environment jsdom */
/**
 * Tiramisu共通トップ（/）
 * 仕様: Tiramisu共通サイト・LP統合 v2.0（A01, A02, A14, A42）
 * 既存OS LPの検証は os-landing.test.tsx へ移設した。
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import BrandTopPage from '@/app/(public)/page';
import { LEGACY_OS_ANCHOR_IDS } from '@/components/public/marketing-links';
import {
  hasSeenProductSelector,
  markProductSelectorSeen,
  setupPublicSiteTestEnvironment,
} from './public-site-test-utils';

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

const SELECTOR_TITLE = 'お店の運営に、どちらのTiramisuを。';

describe('BrandTopPage（共通トップ）', () => {
  setupPublicSiteTestEnvironment();

  it('モーダルがなくても2製品の通常リンク・説明・法務導線がある（A01）', () => {
    markProductSelectorSeen();
    const { container } = render(<BrandTopPage />);

    expect(document.querySelector('dialog')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'お店の可能性を、もっと自由に。'
    );
    expect(
      screen.getByText(
        '今のツールを活かす業務支援と、店舗の情報をまとめる経営管理。目的に合わせて選べる、2つのTiramisu。'
      )
    ).toBeInTheDocument();

    const main = screen.getByRole('main');
    const worksLinks = within(main).getAllByRole('link', {
      name: /Tiramisu Worksを見る/,
    });
    const osLinks = within(main).getAllByRole('link', {
      name: /Tiramisu OSを見る/,
    });
    expect(worksLinks.length).toBeGreaterThan(0);
    expect(osLinks.length).toBe(worksLinks.length);
    worksLinks.forEach(link => expect(link).toHaveAttribute('href', '/works'));
    osLinks.forEach(link => expect(link).toHaveAttribute('href', '/os'));

    expect(
      container.querySelector(
        'a[href="/contact?product=undecided&intent=sales"]'
      )
    ).toBeInTheDocument();
    for (const href of ['/terms', '/privacy', '/legal', '/contact']) {
      expect(container.querySelector(`a[href="${href}"]`)).toBeInTheDocument();
    }
  });

  it('ヘッダーは製品・問い合わせ・OSログインだけを持ち、架空の導線を追加しない（A14/A42）', () => {
    markProductSelectorSeen();
    const { container } = render(<BrandTopPage />);

    expect(container.querySelector('a[href="/login"]')).toHaveTextContent(
      'OSログイン'
    );
    expect(screen.getAllByRole('button', { name: '製品を選ぶ' })).toHaveLength(
      1
    );
    expect(screen.queryByText(/導入事例|お知らせ一覧|資料請求/)).toBeNull();
    expect(container.innerHTML).not.toMatch(/tiramisu\.jp/);
    expect(container.textContent).not.toMatch(/飲食/);
  });

  it('新しいアンカーは旧OS LPのIDと衝突しない（A25）', () => {
    markProductSelectorSeen();
    const { container } = render(<BrandTopPage />);

    expect(container.querySelector('#products')).toBeInTheDocument();
    for (const id of LEGACY_OS_ANCHOR_IDS) {
      expect(container.querySelector(`#${id}`)).toBeNull();
    }
  });

  it('初回は製品選択モーダルが開き、2製品を同じ重みで選べる（A02）', () => {
    render(<BrandTopPage />);

    const dialog = screen.getByRole('dialog', { name: SELECTOR_TITLE });
    expect(hasSeenProductSelector()).toBe(true);
    expect(
      within(dialog).getByRole('link', { name: /Tiramisu Worksを見る/ })
    ).toHaveAttribute('href', '/works');
    expect(
      within(dialog).getByRole('link', { name: /Tiramisu OSを見る/ })
    ).toHaveAttribute('href', '/os');
    expect(
      within(dialog).getByText('既存ツールを活かす業務支援')
    ).toBeInTheDocument();
    expect(within(dialog).getByText('店舗・本部管理')).toBeInTheDocument();
    expect(within(dialog).queryByText(/おすすめ|人気/)).toBeNull();
    // Instagram は対応中のため、モーダルでは対応済みのように列挙しない
    expect(dialog.textContent).not.toMatch(/Instagram/);
    expect(
      within(dialog).getByRole('button', { name: 'あとで選ぶ' })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: '閉じる' })
    ).toBeInTheDocument();
  });
});
