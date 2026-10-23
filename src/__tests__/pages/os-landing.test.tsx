/** @jest-environment jsdom */
/**
 * Tiramisu OS LP（/os）— 旧 / のOS LPを移設
 * 仕様: Tiramisu共通サイト・LP統合 v2.0（A04, A12, A40, A41, A42）
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import OsLandingPage from '@/app/(public)/os/page';
import { planItems } from '@/components/public/lp-content';
import { LEGACY_OS_ANCHOR_IDS } from '@/components/public/marketing-links';
import { setupPublicSiteTestEnvironment } from './public-site-test-utils';

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

describe('OsLandingPage（/os）', () => {
  setupPublicSiteTestEnvironment();

  it('サービス名とサブコピーが表示される', () => {
    render(<OsLandingPage />);

    expect(
      screen.getByText(/5店舗以上の整骨院グループ向け本部管理OS/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/本部の集計・確認・報告作業を減らし/)
    ).toBeInTheDocument();
  });

  it('スタッフログインと管理者ログインの導線を維持する', () => {
    const { container } = render(<OsLandingPage />);

    expect(screen.getAllByText('スタッフログイン').length).toBeGreaterThan(0);
    expect(screen.getAllByText('管理者ログイン').length).toBeGreaterThan(0);
    expect(container.querySelector('a[href="/login"]')).toBeInTheDocument();
    expect(
      container.querySelector('a[href="/admin/login"]')
    ).toBeInTheDocument();
  });

  it('利用規約・プライバシーポリシー・運営者情報のリンクが表示される', () => {
    const { container } = render(<OsLandingPage />);

    expect(container.querySelector('a[href="/terms"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/privacy"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/legal"]')).toBeInTheDocument();
  });

  it('料金は planItems を正本として表示し、Works料金で上書きしない（A40）', () => {
    const { container } = render(<OsLandingPage />);

    for (const plan of planItems) {
      expect(screen.getByText(plan.name)).toBeInTheDocument();
      expect(screen.getByText(plan.monthlyPrice)).toBeInTheDocument();
      expect(screen.getAllByText(plan.initialCost).length).toBeGreaterThan(0);
    }
    expect(container.textContent).not.toMatch(/19,800|29,800|49,800/);
  });

  it('移設後も旧アンカーの移動先になるセクションIDを持つ（A25/A41）', () => {
    const { container } = render(<OsLandingPage />);

    for (const id of LEGACY_OS_ANCHOR_IDS) {
      expect(container.querySelector(`section#${id}`)).toBeInTheDocument();
    }
  });

  it('相談CTAは問い合わせページでOSとして区別され、外部フォームへ直接送らない（A27）', () => {
    const { container } = render(<OsLandingPage />);

    const demoLinks = screen.getAllByRole('link', { name: /デモ相談をする/ });
    expect(demoLinks.length).toBeGreaterThan(0);
    demoLinks.forEach(link =>
      expect(link).toHaveAttribute('href', '/contact?product=os&intent=sales')
    );
    expect(
      container.querySelector('a[href*="docs.google.com"]')
    ).not.toBeInTheDocument();
  });

  it('LP表記は Tiramisu OS で、手動の「製品を選ぶ」はあるが自動では開かない（A12/A42）', () => {
    render(<OsLandingPage />);

    expect(screen.getAllByText('Tiramisu OS').length).toBeGreaterThan(0);
    expect(screen.queryByText('Tiramisu AI')).toBeNull();
    expect(
      screen.getByRole('button', { name: '製品を選ぶ' })
    ).toBeInTheDocument();
    expect(document.querySelector('dialog')).toBeNull();
    expect(screen.getByText(/画面イメージ/)).toBeInTheDocument();
  });
});
