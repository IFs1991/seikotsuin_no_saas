/**
 * @jest-environment jsdom
 *
 * Header クリニック選択ドロップダウン動的化テスト
 * 仕様: docs/ハードコーディング解消_実装プラン_v1.0.md Task B
 *
 * TODOリスト:
 * [x] clinics プロップから動的にオプションを描画する
 * [x] clinicsLoading=true のとき「読み込み中...」を表示する
 * [x] ハードコードされた店舗名が表示されない
 * [x] 選択変更で Context の setSelectedClinicId が呼ばれる（統合）
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from '@/components/navigation/header';
import {
  SelectedClinicProvider,
  useSelectedClinic,
} from '@/providers/selected-clinic-context';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const mockClinics = [
  { id: 'clinic-1', name: '本院' },
  { id: 'clinic-2', name: '新宿院' },
];

function renderWithProvider(
  props: Partial<React.ComponentProps<typeof Header>> = {},
  initialClinicId = 'clinic-1'
) {
  const defaults: React.ComponentProps<typeof Header> = {
    onToggleSidebar: jest.fn(),
    onToggleDarkMode: jest.fn(),
    isDarkMode: false,
    clinics: mockClinics,
    clinicsLoading: false,
    notificationCount: 0,
  };
  return render(
    <SelectedClinicProvider initialClinicId={initialClinicId}>
      <Header {...defaults} {...props} />
    </SelectedClinicProvider>
  );
}

describe('Header クリニック選択', () => {
  // 🔴 Red: Header が clinics プロップを受け付けないため失敗する

  it('clinics プロップから動的にオプションを描画する', () => {
    renderWithProvider();
    // デスクトップとモバイル両方にセレクトがある
    expect(
      screen.getAllByRole('option', { name: '本院' }).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('option', { name: '新宿院' }).length
    ).toBeGreaterThan(0);
  });

  it('clinicsLoading=true のとき「読み込み中...」を表示する', () => {
    renderWithProvider({ clinicsLoading: true, clinics: [] });
    expect(screen.getAllByText('読み込み中...').length).toBeGreaterThan(0);
  });

  it('clinicsLoading=true のときセレクトが disabled になる', () => {
    const { container } = renderWithProvider({
      clinicsLoading: true,
      clinics: [],
    });
    // デスクトップセレクト
    const selects = container.querySelectorAll('select');
    selects.forEach(select => {
      expect(select).toBeDisabled();
    });
  });

  it('ハードコードされた店舗名（本店・新宿店等）が表示されない', () => {
    renderWithProvider({ clinics: [] });
    expect(screen.queryByText('本店')).not.toBeInTheDocument();
    expect(screen.queryByText('新宿店')).not.toBeInTheDocument();
    expect(screen.queryByText('渋谷店')).not.toBeInTheDocument();
    expect(screen.queryByText('池袋店')).not.toBeInTheDocument();
    expect(screen.queryByText('横浜店')).not.toBeInTheDocument();
  });

  it('ContextのinitialClinicIdがセレクトの初期値になる', () => {
    renderWithProvider({ clinics: mockClinics }, 'clinic-2');
    // デスクトップの最初のセレクト（hidden md:flex 内）を探す
    const selects = screen.getAllByRole('combobox');
    // 少なくとも1つのセレクトが clinic-2 の value を持つ
    const selectedValues = Array.from(selects).map(
      s => (s as HTMLSelectElement).value
    );
    expect(selectedValues.some(v => v === 'clinic-2')).toBe(true);
  });

  // Context 統合: 選択変更でコンテキストが更新される（子コンポーネントで確認）
  it('セレクト変更で selectedClinicId が更新される', () => {
    function ContextDisplay() {
      const { selectedClinicId } = useSelectedClinic();
      return <span data-testid='selected'>{selectedClinicId}</span>;
    }

    render(
      <SelectedClinicProvider initialClinicId='clinic-1'>
        <Header
          onToggleSidebar={jest.fn()}
          onToggleDarkMode={jest.fn()}
          isDarkMode={false}
          clinics={mockClinics}
          clinicsLoading={false}
          notificationCount={0}
        />
        <ContextDisplay />
      </SelectedClinicProvider>
    );

    // デスクトップセレクトの最初の要素を取得
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'clinic-2' } });

    expect(screen.getByTestId('selected').textContent).toBe('clinic-2');
  });
});
