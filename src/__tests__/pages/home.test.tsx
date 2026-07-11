/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import LandingPage from '@/app/(public)/page';

jest.mock('next/link', () => {
  const MockLink = ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => React.createElement('a', { href, className }, children);
  MockLink.displayName = 'Link';
  return MockLink;
});

describe('LandingPage', () => {
  it('サービス名とサブコピーが表示される', () => {
    render(<LandingPage />);

    expect(
      screen.getByText(/5店舗以上の整骨院グループ向け本部管理OS/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/本部の集計・確認・報告作業を減らし/)
    ).toBeInTheDocument();
  });

  it('スタッフログインと管理者ログインのCTAが表示される', () => {
    const { container } = render(<LandingPage />);

    expect(screen.getAllByText('スタッフログイン').length).toBeGreaterThan(0);
    expect(screen.getAllByText('管理者ログイン').length).toBeGreaterThan(0);
    expect(container.querySelector('a[href="/login"]')).toBeInTheDocument();
    expect(
      container.querySelector('a[href="/admin/login"]')
    ).toBeInTheDocument();
  });

  it('利用規約とプライバシーポリシーのリンクが表示される', () => {
    const { container } = render(<LandingPage />);

    expect(container.querySelector('a[href="/terms"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/privacy"]')).toBeInTheDocument();
  });
});
