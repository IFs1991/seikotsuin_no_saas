import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => ({ get: jest.fn(() => null) })),
}));

jest.mock('@/app/(public)/login/actions', () => ({
  clinicLogin: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useActionState: jest.fn((action: unknown, initialState: unknown) => [
    initialState,
    action,
    false,
  ]),
}));

describe('/login forgot-password link', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('forgot-password への導線が存在する', async () => {
    const { default: ClinicLoginPage } = await import('@/app/(public)/login/page');
    render(<ClinicLoginPage />);

    expect(
      document.querySelector('a[href="/forgot-password?source=clinic"]')
    ).toBeTruthy();
    expect(screen.getByText(/パスワードを忘れた方はこちら/i)).toBeTruthy();
  });
});
