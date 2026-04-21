/**
 * @jest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => {
    return function DynamicStub() {
      return <div data-testid='dynamic-settings-stub'>loaded</div>;
    };
  },
}));

import AdminSettingsPage from '@/app/(app)/admin/(protected)/settings/page';

describe('Admin settings navigation alignment', () => {
  it('準備中に落ちる設定項目をナビゲーションに表示しない', () => {
    render(<AdminSettingsPage />);

    const nav = screen.getByTestId('admin-settings-nav');

    fireEvent.click(
      within(nav).getByRole('button', { name: '設定テンプレート' })
    );
    expect(
      within(nav).getByRole('button', { name: '基本情報テンプレート' })
    ).toBeInTheDocument();
    expect(
      within(nav).getByRole('button', {
        name: '診療時間・休診日テンプレート',
      })
    ).toBeInTheDocument();
    expect(
      within(nav).queryByRole('button', { name: '設備・ベッドテンプレート' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('店舗作成時の初期設定テンプレートです')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'この画面の変更は、既存店舗の設定を自動的に上書きしません。'
      )
    ).toBeInTheDocument();

    fireEvent.click(within(nav).getByRole('button', { name: 'スタッフ管理' }));
    expect(
      within(nav).getByRole('button', { name: 'スタッフ一覧・招待' })
    ).toBeInTheDocument();
    expect(
      within(nav).queryByRole('button', { name: 'ロール・権限' })
    ).not.toBeInTheDocument();
    expect(
      within(nav).queryByRole('button', { name: 'シフト管理' })
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(nav).getByRole('button', { name: '患者コミュニケーション' })
    );
    expect(
      within(nav).getByRole('button', { name: '自動通知メール' })
    ).toBeInTheDocument();
    expect(
      within(nav).queryByRole('button', { name: 'お知らせ' })
    ).not.toBeInTheDocument();
    expect(
      within(nav).queryByRole('button', { name: '満足度調査' })
    ).not.toBeInTheDocument();

    expect(
      within(nav).queryByRole('button', { name: 'データ管理' })
    ).not.toBeInTheDocument();
    expect(
      within(nav).queryByRole('button', { name: 'データインポート' })
    ).not.toBeInTheDocument();
  });

  it('未実装コンポーネント時はパイロット向け文言を表示する', async () => {
    jest.resetModules();
    jest.doMock('react', () => React);
    jest.doMock('next/navigation', () => ({
      useRouter: () => ({ push: jest.fn() }),
    }));
    jest.doMock('next/dynamic', () => ({
      __esModule: true,
      default: () => null,
    }));

    const { default: AdminSettingsFallbackPage } = await import(
      '@/app/(app)/admin/(protected)/settings/page'
    );

    render(<AdminSettingsFallbackPage />);

    expect(
      screen.getByText('パイロット版では提供しておりません')
    ).toBeInTheDocument();
    expect(
      screen.getByText('今後のアップデートで追加予定です。')
    ).toBeInTheDocument();
  });
});
