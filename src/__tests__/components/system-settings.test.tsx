import React from 'react';
import { render, screen } from '@testing-library/react';
import { SystemSettings } from '@/components/admin/system-settings';

jest.mock('@/hooks/useUserProfile', () => ({
  useUserProfile: jest.fn(),
}));

jest.mock('@/hooks/useAdminSettings', () => ({
  useAdminSettings: jest.fn(),
}));

const useUserProfileMock = jest.requireMock('@/hooks/useUserProfile')
  .useUserProfile as jest.Mock;
const useAdminSettingsMock = jest.requireMock('@/hooks/useAdminSettings')
  .useAdminSettings as jest.Mock;

describe('SystemSettings', () => {
  const originalAppVersion = process.env.NEXT_PUBLIC_APP_VERSION;
  const originalBuildDate = process.env.NEXT_PUBLIC_BUILD_DATE;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_VERSION = originalAppVersion;
    process.env.NEXT_PUBLIC_BUILD_DATE = originalBuildDate;

    useUserProfileMock.mockReturnValue({
      profile: {
        id: 'user-1',
        email: 'admin@example.com',
        role: 'admin',
        clinicId: 'clinic-1',
        isActive: true,
        isAdmin: true,
      },
      loading: false,
      error: null,
    });

    useAdminSettingsMock.mockReturnValue({
      data: {
        passwordPolicy: {
          minLength: 8,
          requireUppercase: true,
          requireNumbers: true,
          requireSymbols: false,
          expiryDays: 90,
        },
        twoFactorEnabled: false,
        sessionTimeout: 480,
        loginAttempts: 5,
        lockoutDuration: 30,
      },
      updateData: jest.fn(),
      loadingState: {
        isLoading: false,
        error: null,
        savedMessage: null,
      },
      handleSave: jest.fn(),
      isInitialized: true,
    });
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_APP_VERSION = originalAppVersion;
    process.env.NEXT_PUBLIC_BUILD_DATE = originalBuildDate;
  });

  it('disables backup actions and shows Supabase guidance in pilot mode', () => {
    render(<SystemSettings />);

    expect(
      screen.getByText(/Supabase ダッシュボードで管理してください/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '今すぐバックアップ' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'バックアップから復元' })
    ).toBeDisabled();
  });

  it('renders system info from public build environment variables', () => {
    process.env.NEXT_PUBLIC_APP_VERSION = '0.1.0-pilot';
    process.env.NEXT_PUBLIC_BUILD_DATE = '2026-03-18';

    render(<SystemSettings />);

    expect(screen.getByText('0.1.0-pilot')).toBeInTheDocument();
    expect(screen.getByText('2026-03-18')).toBeInTheDocument();
    expect(screen.queryByText('2.1.0')).not.toBeInTheDocument();
    expect(screen.queryByText('2024-08-10')).not.toBeInTheDocument();
  });
});
