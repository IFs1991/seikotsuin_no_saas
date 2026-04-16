import React from 'react';
import { render, screen } from '@testing-library/react';

const mockGetUser = jest.fn();
const mockLogAdminAction = jest.fn().mockResolvedValue(undefined);
const mockReadPasswordRecoveryIntent = jest.fn();
const mockValidatePasswordRecoveryIntent = jest.fn();

jest.mock('@/lib/supabase', () => ({
  getServerClient: jest.fn(() =>
    Promise.resolve({
      auth: {
        getUser: mockGetUser,
      },
    })
  ),
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => new Map()),
}));

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
  },
  getRequestInfoFromHeaders: jest.fn(() => ({
    ipAddress: '127.0.0.1',
    userAgent: 'jest-test',
  })),
}));

jest.mock('@/lib/auth/password-recovery-intent', () => ({
  PASSWORD_RECOVERY_INTENT_COOKIE: 'password_recovery_intent',
  readPasswordRecoveryIntent: (...args: unknown[]) =>
    mockReadPasswordRecoveryIntent(...args),
  validatePasswordRecoveryIntent: (...args: unknown[]) =>
    mockValidatePasswordRecoveryIntent(...args),
}));

jest.mock('@/app/(public)/reset-password/[source]/reset-password-form', () => ({
  ResetPasswordForm: ({ source }: { source: 'admin' | 'clinic' }) => (
    <div data-testid='reset-password-form'>{source}</div>
  ),
}));

describe('/reset-password/[source] page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadPasswordRecoveryIntent.mockResolvedValue('signed-recovery-token');
    mockValidatePasswordRecoveryIntent.mockReturnValue(true);
  });

  test('recovery セッションが有効ならフォームを表示する', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    const { default: ResetPasswordPage } =
      await import('@/app/(public)/reset-password/[source]/page');

    const element = await ResetPasswordPage({
      params: Promise.resolve({ source: 'admin' }),
    });

    render(element);

    expect(screen.getByTestId('reset-password-form')).toHaveTextContent(
      'admin'
    );
  });

  test('通常ログイン済みセッションのみではフォームを表示しない', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mockValidatePasswordRecoveryIntent.mockReturnValue(false);

    const { default: ResetPasswordPage } =
      await import('@/app/(public)/reset-password/[source]/page');

    const element = await ResetPasswordPage({
      params: Promise.resolve({ source: 'admin' }),
    });

    render(element);

    expect(screen.getByText('リンクが無効です')).toBeInTheDocument();
    expect(screen.queryByTestId('reset-password-form')).not.toBeInTheDocument();
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      'anonymous',
      'anonymous',
      'password_reset_invalid_link',
      undefined,
      expect.objectContaining({
        source: 'admin',
        userAgent: 'jest-test',
      }),
      '127.0.0.1'
    );
  });

  test('recovery セッションが無効なら無効状態 UI を表示する', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const { default: ResetPasswordPage } =
      await import('@/app/(public)/reset-password/[source]/page');

    const element = await ResetPasswordPage({
      params: Promise.resolve({ source: 'clinic' }),
    });

    render(element);

    expect(screen.getByText('リンクが無効です')).toBeInTheDocument();
    expect(
      document.querySelector('a[href="/forgot-password?source=clinic"]')
    ).toBeTruthy();
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      'anonymous',
      'anonymous',
      'password_reset_invalid_link',
      undefined,
      expect.objectContaining({
        source: 'clinic',
        userAgent: 'jest-test',
      }),
      '127.0.0.1'
    );
  });
});
