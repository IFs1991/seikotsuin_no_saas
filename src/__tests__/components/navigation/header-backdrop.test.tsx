/**
 * @jest-environment jsdom
 *
 * Header モバイルメニュー backdrop + ESC テスト
 * 仕様: docs/ハードコーディング解消_実装プラン_v1.0.md Task E
 *
 * TODOリスト:
 * [x] モバイルメニューを開くと backdrop が表示される
 * [x] backdrop クリックでメニューが閉じる
 * [x] ESC キーでメニューが閉じる
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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

describe('Header モバイルメニュー', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // 🔴 Red: 現在の Header に backdrop がないため失敗する

  it('モバイルメニューを開くと backdrop (aria-hidden) が表示される', () => {
    const { container } = renderHeader();

    fireEvent.click(screen.getByText('メニュー'));

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).toBeInTheDocument();
  });

  it('backdrop クリックでモバイルメニューが閉じる', () => {
    const { container } = renderHeader();

    fireEvent.click(screen.getByText('メニュー'));
    // jsdom では md:hidden が効かないためデスクトップ+モバイル両方のボタンが存在する
    expect(screen.getAllByText('ログアウト').length).toBeGreaterThan(0);

    const backdrop = container.querySelector(
      '[aria-hidden="true"]'
    ) as HTMLElement;
    fireEvent.click(backdrop);

    // メニューが閉じると両方消える
    expect(screen.queryAllByText('ログアウト').length).toBe(0);
  });

  it('ESC キーでメニューが閉じる', () => {
    renderHeader();

    fireEvent.click(screen.getByText('メニュー'));
    expect(screen.getAllByText('ログアウト').length).toBeGreaterThan(0);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryAllByText('ログアウト').length).toBe(0);
  });

  it('メニューを閉じた後 backdrop が DOM に存在しない', () => {
    const { container } = renderHeader();

    fireEvent.click(screen.getByText('メニュー'));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
  });
});
