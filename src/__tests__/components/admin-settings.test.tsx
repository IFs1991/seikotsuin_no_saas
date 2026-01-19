import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClinicBasicSettings } from '@/components/admin/clinic-basic-settings';

jest.mock('@/hooks/useUserProfile', () => ({
  useUserProfile: jest.fn(),
}));

const useUserProfileMock = jest.requireMock('@/hooks/useUserProfile')
  .useUserProfile as jest.Mock;

const buildResponse = (payload: unknown, ok: boolean = true) => ({
  ok,
  json: async () => payload,
});

describe('ClinicBasicSettings', () => {
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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads saved settings on mount', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        buildResponse({
          success: true,
          data: {
            settings: {
              name: 'Test Clinic',
              phone: '03-1111-2222',
            },
          },
        })
      );

    const { container } = render(<ClinicBasicSettings />);

    expect(await screen.findByDisplayValue('Test Clinic')).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/settings?clinic_id=clinic-1&category=clinic_basic'
      );
    });
  });

  it('calls PUT on save', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    fetchMock
      .mockResolvedValueOnce(
        buildResponse({
          success: true,
          data: {
            settings: {
              name: 'Test Clinic',
              phone: '03-1111-2222',
            },
          },
        })
      )
      .mockResolvedValueOnce(
        buildResponse({
          success: true,
          data: { message: 'Saved' },
        })
      );

    const { container } = render(<ClinicBasicSettings />);

    await screen.findByDisplayValue('Test Clinic');

    const saveIcon = container.querySelector('svg[data-lucide="save"]');
    expect(saveIcon).not.toBeNull();
    const saveButton = saveIcon?.closest('button');
    expect(saveButton).not.toBeNull();
    await userEvent.click(saveButton as HTMLElement);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const request = fetchMock.mock.calls[1];
    const requestBody = JSON.parse((request[1] as RequestInit).body as string);

    expect(request[0]).toBe('/api/admin/settings');
    expect((request[1] as RequestInit).method).toBe('PUT');
    expect(requestBody).toMatchObject({
      clinic_id: 'clinic-1',
      category: 'clinic_basic',
    });
  });

  it('shows an error banner when load fails', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(buildResponse({ success: false }, false));

    const { container } = render(<ClinicBasicSettings />);

    await waitFor(() => {
      expect(container.querySelector('.bg-red-50')).not.toBeNull();
    });
  });
});
