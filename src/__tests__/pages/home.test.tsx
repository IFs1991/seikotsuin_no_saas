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
      screen.getByText('整骨院・治療院向け業務管理SaaS')
    ).toBeInTheDocument();
    expect(
      screen.getByText('予約・患者・運営管理を一元化し、現場と管理をつなぐ')
    ).toBeInTheDocument();
  });

  it('スタッフログインと管理者ログインのCTAが表示される', () => {
    const { container } = render(<LandingPage />);

    expect(screen.getByText('スタッフログイン')).toBeInTheDocument();
    expect(screen.getByText('管理者ログイン')).toBeInTheDocument();
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
