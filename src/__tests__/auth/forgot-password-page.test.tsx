import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

const mockGet = jest.fn();

jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => ({
    get: mockGet,
  })),
}));

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useActionState: jest.fn((action: unknown, initialState: unknown) => [
    initialState,
    action,
    false,
  ]),
}));

describe('/forgot-password page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockReturnValue(null);
  });

  test('source=admin の場合は管理者向け文言と戻り先が表示される', async () => {
    mockGet.mockImplementation((key: string) =>
      key === 'source' ? 'admin' : null
    );

    const { default: ForgotPasswordPage } = await import(
      '@/app/(public)/forgot-password/page'
    );

    render(<ForgotPasswordPage />);

    expect(
      screen.getByText('管理者向けパスワード再設定')
    ).toBeInTheDocument();
    expect(
      document.querySelector('a[href="/admin/login"]')
    ).toBeTruthy();
  });

  test('source=clinic の場合はスタッフ向け文言と戻り先が表示される', async () => {
    mockGet.mockImplementation((key: string) =>
      key === 'source' ? 'clinic' : null
    );

    const { default: ForgotPasswordPage } = await import(
      '@/app/(public)/forgot-password/page'
    );

    render(<ForgotPasswordPage />);

    expect(
      screen.getByText('スタッフ向けパスワード再設定')
    ).toBeInTheDocument();
    expect(document.querySelector('a[href="/login"]')).toBeTruthy();
  });

  test('不正な source は clinic 扱いにフォールバックする', async () => {
    mockGet.mockImplementation((key: string) =>
      key === 'source' ? 'invalid' : null
    );

    const { default: ForgotPasswordPage } = await import(
      '@/app/(public)/forgot-password/page'
    );

    render(<ForgotPasswordPage />);

    expect(
      screen.getByText('スタッフ向けパスワード再設定')
    ).toBeInTheDocument();
  });

  test('不正なメールアドレスではクライアント側バリデーションエラーを表示する', async () => {
    const { default: ForgotPasswordPage } = await import(
      '@/app/(public)/forgot-password/page'
    );

    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText(/メールアドレス/i), {
      target: { value: 'invalid-email' },
    });
    fireEvent.submit(
      screen
        .getByRole('button', { name: '再設定メールを送信する' })
        .closest('form') as HTMLFormElement
    );

    expect(
      screen.getByText('正しいメールアドレスを入力してください')
    ).toBeInTheDocument();
  });
});
