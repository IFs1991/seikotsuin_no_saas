/**
 * @jest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { SelectedClinicProvider } from '@/providers/selected-clinic-context';
import { UserProfileProvider } from '@/providers/user-profile-context';

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
    expect(
      screen.getByText(
        'スタッフ招待・勤務管理・店舗ごとの運用設定は、店舗単位の管理画面で扱います。'
      )
    ).toBeInTheDocument();
    expect(
      within(nav).queryByRole('button', { name: 'スタッフ管理' })
    ).not.toBeInTheDocument();
    expect(
      within(nav).queryByRole('button', { name: 'スタッフ一覧・招待' })
    ).not.toBeInTheDocument();
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

    const { default: AdminSettingsFallbackPage } =
      await import('@/app/(app)/admin/(protected)/settings/page');

    render(<AdminSettingsFallbackPage />);

    expect(
      screen.getByText('パイロット版では提供しておりません')
    ).toBeInTheDocument();
    expect(
      screen.getByText('今後のアップデートで追加予定です。')
    ).toBeInTheDocument();
  });

  it('manager には担当Clinicの運用設定カテゴリだけを表示する', () => {
    render(
      <UserProfileProvider
        value={{
          profile: {
            id: 'manager-user',
            email: 'manager@example.com',
            role: 'manager',
            clinicId: 'parent-clinic',
            clinicName: '本部',
            isActive: true,
            isAdmin: false,
          },
          loading: false,
          error: null,
        }}
      >
        <SelectedClinicProvider
          initialClinicId='clinic-1'
          currentClinicId='clinic-1'
          clinics={[{ id: 'clinic-1', name: '担当Clinic' }]}
        >
          <AdminSettingsPage />
        </SelectedClinicProvider>
      </UserProfileProvider>
    );

    const nav = screen.getByTestId('admin-settings-nav');

    expect(
      within(nav).getByRole('button', { name: 'Clinic設定' })
    ).toBeInTheDocument();
    expect(
      within(nav).queryByRole('button', { name: 'システム設定' })
    ).not.toBeInTheDocument();
    expect(
      within(nav).queryByRole('button', { name: 'データ管理' })
    ).not.toBeInTheDocument();

    fireEvent.click(within(nav).getByRole('button', { name: 'Clinic設定' }));
    expect(
      within(nav).getByRole('button', { name: '基本情報' })
    ).toBeInTheDocument();
    expect(
      within(nav).getByRole('button', { name: '診療時間・休診日' })
    ).toBeInTheDocument();
    expect(
      screen.queryByText('店舗作成時の初期設定テンプレートです')
    ).not.toBeInTheDocument();
  });

  it('ロール読み込み中はmanager相当の狭い設定カテゴリに倒す', () => {
    render(
      <UserProfileProvider
        value={{
          profile: null,
          loading: true,
          error: null,
        }}
      >
        <SelectedClinicProvider
          initialClinicId='clinic-1'
          currentClinicId='clinic-1'
          clinics={[{ id: 'clinic-1', name: '担当Clinic' }]}
        >
          <AdminSettingsPage />
        </SelectedClinicProvider>
      </UserProfileProvider>
    );

    const nav = screen.getByTestId('admin-settings-nav');

    expect(
      within(nav).getByRole('button', { name: 'Clinic設定' })
    ).toBeInTheDocument();
    expect(
      within(nav).queryByRole('button', { name: 'システム設定' })
    ).not.toBeInTheDocument();
    expect(
      within(nav).queryByRole('button', { name: 'データ管理' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('店舗作成時の初期設定テンプレートです')
    ).not.toBeInTheDocument();
  });

  it('manager の担当Clinic読み込み中は設定コンポーネントを起動しない', () => {
    render(
      <UserProfileProvider
        value={{
          profile: {
            id: 'manager-user',
            email: 'manager@example.com',
            role: 'manager',
            clinicId: 'profile-clinic',
            clinicName: '本部',
            isActive: true,
            isAdmin: false,
          },
          loading: false,
          error: null,
        }}
      >
        <SelectedClinicProvider
          initialClinicId={null}
          currentClinicId={null}
          clinics={[]}
          clinicsLoading={true}
        >
          <AdminSettingsPage />
        </SelectedClinicProvider>
      </UserProfileProvider>
    );

    expect(screen.getByText('担当Clinicを読み込み中...')).toBeInTheDocument();
    expect(screen.queryByTestId('dynamic-settings-stub')).not.toBeInTheDocument();
  });
});
