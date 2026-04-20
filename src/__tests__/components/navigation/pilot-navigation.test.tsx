/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Sidebar } from '@/components/navigation/sidebar';
import { MobileBottomNav } from '@/components/navigation/mobile-bottom-nav';

let mockPathname = '/dashboard';

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

describe('Pilot navigation gating', () => {
  const originalAiInsightsFlag = process.env.NEXT_PUBLIC_ENABLE_AI_INSIGHTS;

  beforeEach(() => {
    mockPathname = '/dashboard';
  });

  afterEach(() => {
    if (originalAiInsightsFlag === undefined) {
      delete process.env.NEXT_PUBLIC_ENABLE_AI_INSIGHTS;
      return;
    }

    process.env.NEXT_PUBLIC_ENABLE_AI_INSIGHTS = originalAiInsightsFlag;
  });

  it('NEXT_PUBLIC_ENABLE_AI_INSIGHTS=false のとき sidebar と mobile nav から AI分析を非表示にする', () => {
    process.env.NEXT_PUBLIC_ENABLE_AI_INSIGHTS = 'false';

    const { unmount } = render(
      <Sidebar
        isOpen
        onClose={jest.fn()}
        isAdmin={false}
        profileLoading={false}
      />
    );

    expect(screen.queryByText('トップ')).not.toBeInTheDocument();
    expect(screen.queryByText('AI分析')).not.toBeInTheDocument();

    unmount();
    render(<MobileBottomNav isAdmin={false} />);

    expect(screen.queryByText('AI')).not.toBeInTheDocument();
  });

  it('NEXT_PUBLIC_ENABLE_AI_INSIGHTS=true のとき AI分析導線を表示する', () => {
    process.env.NEXT_PUBLIC_ENABLE_AI_INSIGHTS = 'true';

    const { unmount } = render(
      <Sidebar
        isOpen
        onClose={jest.fn()}
        isAdmin={false}
        profileLoading={false}
      />
    );

    expect(screen.queryByText('トップ')).not.toBeInTheDocument();
    expect(screen.getByText('AI分析')).toBeInTheDocument();

    unmount();
    render(<MobileBottomNav isAdmin={false} />);

    expect(screen.getByText('AI')).toBeInTheDocument();
  });
});
