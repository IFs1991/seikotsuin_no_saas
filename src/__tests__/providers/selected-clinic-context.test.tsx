/**
 * @jest-environment jsdom
 *
 * SelectedClinicContext テスト
 * 仕様: docs/ハードコーディング解消_実装プラン_v1.0.md Task B
 *
 * TODOリスト:
 * [x] initialClinicId を提供する
 * [x] setSelectedClinicId で更新できる
 * [x] initialClinicId が null のとき null を返す
 * [x] Provider 外で使うとエラーをスローする
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  SelectedClinicProvider,
  useSelectedClinic,
} from '@/providers/selected-clinic-context';

function TestConsumer() {
  const { selectedClinicId, setSelectedClinicId, clinics, clinicsLoading } =
    useSelectedClinic();
  return (
    <div>
      <span data-testid='clinic-id'>{selectedClinicId ?? 'null'}</span>
      <span data-testid='clinic-count'>{clinics.length}</span>
      <span data-testid='clinics-loading'>{String(clinicsLoading)}</span>
      <button onClick={() => setSelectedClinicId('clinic-new')}>Change</button>
    </div>
  );
}

describe('SelectedClinicContext', () => {
  // 🔴 Red: ファイルが存在しないためすべて失敗する

  it('initialClinicId を提供する', () => {
    render(
      <SelectedClinicProvider initialClinicId='clinic-1'>
        <TestConsumer />
      </SelectedClinicProvider>
    );
    expect(screen.getByTestId('clinic-id').textContent).toBe('clinic-1');
  });

  // 三角測量: 別の ID でも正しく初期化される
  it('別の initialClinicId でも正しく提供する', () => {
    render(
      <SelectedClinicProvider initialClinicId='clinic-xyz'>
        <TestConsumer />
      </SelectedClinicProvider>
    );
    expect(screen.getByTestId('clinic-id').textContent).toBe('clinic-xyz');
  });

  it('setSelectedClinicId で選択クリニックを更新できる', () => {
    render(
      <SelectedClinicProvider initialClinicId='clinic-1'>
        <TestConsumer />
      </SelectedClinicProvider>
    );
    expect(screen.getByTestId('clinic-id').textContent).toBe('clinic-1');
    fireEvent.click(screen.getByText('Change'));
    expect(screen.getByTestId('clinic-id').textContent).toBe('clinic-new');
  });

  it('initialClinicId が null のとき null を提供する', () => {
    render(
      <SelectedClinicProvider initialClinicId={null}>
        <TestConsumer />
      </SelectedClinicProvider>
    );
    expect(screen.getByTestId('clinic-id').textContent).toBe('null');
  });

  it('利用可能クリニック一覧の状態を提供する', () => {
    render(
      <SelectedClinicProvider
        initialClinicId='clinic-1'
        clinics={[{ id: 'clinic-1', name: '本院' }]}
        currentClinicId='clinic-1'
        clinicsLoading={true}
      >
        <TestConsumer />
      </SelectedClinicProvider>
    );

    expect(screen.getByTestId('clinic-count').textContent).toBe('1');
    expect(screen.getByTestId('clinics-loading').textContent).toBe('true');
  });

  it('非同期に initialClinicId が入ったとき未選択 state を同期する', () => {
    const { rerender } = render(
      <SelectedClinicProvider initialClinicId={null}>
        <TestConsumer />
      </SelectedClinicProvider>
    );

    expect(screen.getByTestId('clinic-id').textContent).toBe('null');

    rerender(
      <SelectedClinicProvider initialClinicId='clinic-late'>
        <TestConsumer />
      </SelectedClinicProvider>
    );

    expect(screen.getByTestId('clinic-id').textContent).toBe('clinic-late');
  });

  it('Provider 外で useSelectedClinic を使うとエラーをスローする', () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    expect(() => {
      render(<TestConsumer />);
    }).toThrow('useSelectedClinic must be used within SelectedClinicProvider');
    consoleSpy.mockRestore();
  });
});
