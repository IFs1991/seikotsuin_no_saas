import React from 'react';
import { render, screen } from '@testing-library/react';
import { CommunicationSettings } from '@/components/admin/communication-settings';

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

describe('CommunicationSettings', () => {
  beforeEach(() => {
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
        channels: {
          emailEnabled: true,
          smsEnabled: false,
          lineEnabled: true,
          pushEnabled: true,
        },
        smtpSettings: {
          host: 'smtp.gmail.com',
          port: 587,
          username: 'noreply@seikotsuin.com',
          secure: true,
        },
        templates: [
          {
            id: '1',
            name: '予約確認メール',
            subject: 'subject-1',
            body: 'body-1',
            type: 'booking_confirmation',
          },
          {
            id: '2',
            name: 'リマインダーメール',
            subject: 'subject-2',
            body: 'body-2',
            type: 'reminder',
          },
        ],
      },
      updateData: jest.fn(),
      loadingState: {
        isLoading: false,
        error: null,
        savedMessage: '',
      },
      handleSave: jest.fn(),
      isInitialized: true,
    });
  });

  it('shows the pilot banner that email delivery is not active', () => {
    render(<CommunicationSettings />);

    expect(screen.getByTestId('communication-pilot-banner')).toHaveTextContent(
      'パイロット版ではメール送信は行われません。設定内容は保存されますが、実際の通知送信は今後のアップデートで対応予定です。'
    );
  });
});
