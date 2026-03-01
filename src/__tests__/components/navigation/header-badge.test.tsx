/**
 * @jest-environment jsdom
 *
 * Header 通知バッジ動的化テスト
 * 仕様: docs/ハードコーディング解消_実装プラン_v1.0.md Task A
 *
 * TODOリスト:
 * [x] notificationCount が 0 のときバッジを表示しない
 * [x] notificationCount が未指定のときバッジを表示しない
 * [x] notificationCount が 5 のときバッジに 5 を表示する
 * [x] notificationCount が 1 のときバッジに 1 を表示する（三角測量）
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Header } from '@/components/navigation/header';
import { SelectedClinicProvider } from '@/providers/selected-clinic-context';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

function renderHeader(
  props: Partial<React.ComponentProps<typeof Header>> = {}
) {
  const defaults: React.ComponentProps<typeof Header> = {
    onToggleSidebar: jest.fn(),
    onToggleDarkMode: jest.fn(),
    isDarkMode: false,
    clinics: [],
    clinicsLoading: false,
    notificationCount: 0,
  };
  return render(
    <SelectedClinicProvider initialClinicId={null}>
      <Header {...defaults} {...props} />
    </SelectedClinicProvider>
  );
}

describe('Header 通知バッジ', () => {
  // 🔴 Red: 現在の Header はバッジを常に「3」と表示するため失敗する

  it('notificationCount が 0 のときバッジを表示しない', () => {
    renderHeader({ notificationCount: 0 });
    // ハードコードされた "3" が消えていること
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  it('notificationCount が未指定のときバッジを表示しない', () => {
    renderHeader({ notificationCount: undefined });
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  it('notificationCount が 5 のときデスクトップバッジに 5 を表示する', () => {
    renderHeader({ notificationCount: 5 });
    // デスクトップ・モバイル両方に表示される場合があるため getAllByText
    expect(screen.getAllByText('5').length).toBeGreaterThan(0);
  });

  // 三角測量: 別の値でも正しく動作する
  it('notificationCount が 1 のときバッジに 1 を表示する', () => {
    renderHeader({ notificationCount: 1 });
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });

  it('notificationCount が 100 のときバッジに 99+ を表示する', () => {
    renderHeader({ notificationCount: 100 });
    expect(screen.getAllByText('99+').length).toBeGreaterThan(0);
  });
});
