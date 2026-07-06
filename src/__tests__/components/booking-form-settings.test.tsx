import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookingFormSettings } from '@/components/admin/booking-form-settings';
import { useAdminSettings } from '@/hooks/useAdminSettings';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  DEFAULT_BOOKING_FORM_SETTINGS,
  type BookingFormSettings as BookingFormSettingsData,
} from '@/lib/booking-form/settings';

jest.mock('next/dynamic', () => {
  const ReactModule = jest.requireActual<typeof React>('react');
  return () =>
    function DynamicPreviewMock() {
      return ReactModule.createElement('div', {
        'data-testid': 'booking-form-preview',
      });
    };
});

jest.mock('@/hooks/useUserProfile');
jest.mock('@/hooks/useAdminSettings');

const useUserProfileMock = jest.mocked(useUserProfile);
const useAdminSettingsMock = jest.mocked(useAdminSettings);

describe('BookingFormSettings', () => {
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
  });

  it('http同意URLを含む場合は対象同意欄を示して保存しない', async () => {
    const handleSave = jest.fn();
    const settings: BookingFormSettingsData = {
      ...DEFAULT_BOOKING_FORM_SETTINGS,
      consents: [
        {
          id: 'c_privacy',
          label: 'プライバシーポリシー',
          required: true,
          linkUrl: 'http://example.com/privacy',
        },
      ],
    };
    useAdminSettingsMock.mockReturnValue({
      data: settings,
      setData: jest.fn(),
      updateData: jest.fn(),
      loadingState: {
        isLoading: false,
        error: null,
        savedMessage: '',
      },
      handleSave,
      handleSaveData: jest.fn(),
      handleAction: jest.fn(),
      clearMessages: jest.fn(),
      reload: jest.fn(),
      isInitialized: true,
    });
    const user = userEvent.setup();

    render(<BookingFormSettings clinicId='clinic-1' />);
    await user.click(screen.getByRole('button', { name: '設定を保存' }));

    expect(screen.getByTestId('error-message')).toHaveTextContent(
      '同意欄URLは相対パスまたはhttps URLで入力してください: プライバシーポリシー'
    );
    expect(handleSave).not.toHaveBeenCalled();
  });
});
