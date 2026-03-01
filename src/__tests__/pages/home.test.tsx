/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import HomePage from '@/app/page';

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

const useSystemStatusMock = jest.fn();

jest.mock('@/hooks/useSystemStatus', () => ({
  useSystemStatus: () => useSystemStatusMock(),
}));

describe('HomePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('システム状態を動的に表示する', () => {
    useSystemStatusMock.mockReturnValue({
      status: {
        activeClinicCount: 7,
        systemStatus: 'degraded',
        aiAnalysisStatus: 'active',
        lastUpdated: '2026-02-27T00:00:00Z',
      },
      loading: false,
      error: null,
    });

    render(<HomePage />);

    expect(screen.getByText(/7店舗展開/)).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('一部障害')).toBeInTheDocument();
    expect(screen.getByText('AI稼働中')).toBeInTheDocument();
  });

  it('ロード中はプレースホルダを表示する', () => {
    useSystemStatusMock.mockReturnValue({
      status: null,
      loading: true,
      error: null,
    });

    render(<HomePage />);

    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('ナビゲーションリンクが描画される', () => {
    useSystemStatusMock.mockReturnValue({
      status: {
        activeClinicCount: 1,
        systemStatus: 'operational',
        aiAnalysisStatus: 'inactive',
        lastUpdated: '2026-02-27T00:00:00Z',
      },
      loading: false,
      error: null,
    });

    const { container } = render(<HomePage />);

    expect(container.querySelector('a[href="/dashboard"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/admin/login"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/chat"]')).toBeInTheDocument();
  });
});
