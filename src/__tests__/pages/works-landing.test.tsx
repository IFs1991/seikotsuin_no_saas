/** @jest-environment jsdom */
/**
 * Tiramisu Works LP（/works）
 * 仕様: Tiramisu共通サイト・LP統合 v2.0（A03, A12, A35〜A39）
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import WorksLandingPage from '@/app/(public)/works/page';
import { worksFaqItems } from '@/components/public/works-content';
import {
  hasSeenProductSelector,
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

function getPlanCard(name: string) {
  const heading = screen.getByRole('heading', { level: 3, name });
  const card = heading.closest('article');
  if (!card) throw new Error(`${name} のカードが見つかりません`);
  return card;
}

describe('WorksLandingPage（/works）', () => {
  setupPublicSiteTestEnvironment();

  it('ヒーローに対象・ツールを活かすこと・相談CTAがある（A03）', () => {
    render(<WorksLandingPage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      '今のツールはそのまま。業務の依頼を、承認と記録まで。'
    );
    const salesLinks = screen.getAllByRole('link', {
      name: /導入について相談する/,
    });
    expect(salesLinks.length).toBeGreaterThan(0);
    salesLinks.forEach(link =>
      expect(link).toHaveAttribute(
        'href',
        '/contact?product=works&intent=sales'
      )
    );
    expect(
      screen.getByRole('link', { name: /できることを見る/ })
    ).toHaveAttribute('href', '#capabilities');
  });

  it('直接アクセスでは製品選択モーダルを自動表示しない（A12）', () => {
    render(<WorksLandingPage />);

    expect(document.querySelector('dialog')).toBeNull();
    expect(hasSeenProductSelector()).toBe(false);
    expect(
      screen.getByRole('button', { name: '製品を選ぶ' })
    ).toBeInTheDocument();
  });

  it.each([
    ['Light', '19,800円', '49,800円', 'plan=light'],
    ['Standard', '29,800円', '100,000円', 'plan=standard'],
    ['Pro', '49,800円', '150,000円', 'plan=pro'],
  ])(
    '%s の月額・初期費用（税別）と相談先が正本どおり（A35/A28）',
    (name, monthly, initial, planQuery) => {
      render(<WorksLandingPage />);
      const card = getPlanCard(name);
      const values = within(card).getAllByRole('definition');
      expect(values[0]).toHaveTextContent(`${monthly}（税別）`);
      expect(values[1]).toHaveTextContent(`${initial}（税別）`);
      expect(within(card).getByRole('link')).toHaveAttribute(
        'href',
        `/contact?product=works&intent=sales&${planQuery}`
      );
    }
  );

  it('Standard だけを主力として示し、根拠のない人気表示をしない（A36）', () => {
    const { container } = render(<WorksLandingPage />);

    expect(
      within(getPlanCard('Standard')).getByText('主力プラン')
    ).toBeVisible();
    expect(within(getPlanCard('Light')).queryByText('主力プラン')).toBeNull();
    expect(within(getPlanCard('Pro')).queryByText('主力プラン')).toBeNull();
    expect(container.textContent).not.toMatch(/人気|No\.1|最多/);
    expect(
      screen.getByText('暫定価格（税別）／個別契約前に正式条件を案内')
    ).toBeInTheDocument();
  });

  it('利用枠・SLA・無制限・旧PoCを表示せず、個別見積もりは別枠にする（A37/A38）', () => {
    const { container } = render(<WorksLandingPage />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/無制限|SLA|24時間|[0-9,]+件|90日|30万円/);
    expect(
      screen.getByRole('link', { name: /個別に相談する/ })
    ).toHaveAttribute(
      'href',
      '/contact?product=works&intent=sales&plan=custom'
    );
    expect(
      screen.queryByRole('heading', { level: 3, name: '個別見積もり' })
    ).not.toBeNull();
    expect(screen.queryByText(/お申し込み|購入する|今すぐ申し込む/)).toBeNull();
  });

  it('Instagramは対応中、会計・Google マップ等は未提供として示す（A39）', () => {
    render(<WorksLandingPage />);

    const instagram = screen.getByText('Instagram').closest('li');
    expect(instagram).not.toBeNull();
    expect(within(instagram as HTMLElement).getByText('対応中')).toBeVisible();
    expect(
      within(instagram as HTMLElement).getByText(/現在は提供していません/)
    ).toBeVisible();

    const notProvided = screen
      .getByRole('heading', { level: 3, name: '現在提供していないもの' })
      .closest('div');
    expect(notProvided).toHaveTextContent('会計・売上データの参照');
    expect(notProvided).toHaveTextContent(
      'Google マップ・Google ビジネス プロフィールとの連携'
    );
  });

  it('OSとの違いと /os へのリンク、FAQを持つ（A41/A42）', () => {
    render(<WorksLandingPage />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Tiramisu OSとの違い' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Tiramisu OSを見る/ })
    ).toHaveAttribute('href', '/os');
    for (const item of worksFaqItems) {
      expect(screen.getByText(item.question)).toBeInTheDocument();
    }
  });
});
