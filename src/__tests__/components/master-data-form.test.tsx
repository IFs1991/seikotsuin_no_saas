import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MasterDataForm } from '@/components/master/master-data-form';

jest.mock('@/hooks/useUserProfile', () => ({
  useUserProfile: jest.fn(),
}));

const useUserProfileMock = jest.requireMock('@/hooks/useUserProfile')
  .useUserProfile as jest.Mock;

const buildResponse = (payload: unknown) => ({
  ok: true,
  json: async () => payload,
});

describe('MasterDataForm', () => {
  beforeEach(() => {
    useUserProfileMock.mockReturnValue({
      profile: {
        id: 'user-1',
        email: 'admin@example.com',
        role: 'admin',
        clinicId: null,
        isActive: true,
        isAdmin: true,
      },
      loading: false,
      error: null,
    });
    if (!window.alert) {
      Object.defineProperty(window, 'alert', {
        value: jest.fn(),
        writable: true,
      });
    }
    jest.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads menu items from master data', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      buildResponse({
        success: true,
        data: {
          items: [
            {
              id: 'setting-1',
              clinic_id: null,
              name: 'menu_items',
              category: 'menu',
              value: [
                {
                  id: 'item-1',
                  name: 'カスタム施術',
                  price: 4200,
                  duration: 45,
                  category: '一般',
                  isActive: true,
                },
              ],
              data_type: 'array',
              is_editable: true,
              is_public: false,
              updated_at: new Date().toISOString(),
            },
          ],
          total: 1,
        },
      })
    );

    render(<MasterDataForm />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/master-data?category=menu&clinic_id=global',
        expect.objectContaining({ method: 'GET' })
      );
    });

    expect(await screen.findByDisplayValue('カスタム施術')).toBeInTheDocument();
  });

  it('creates a new master data entry when none exists', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    fetchMock
      .mockResolvedValueOnce(
        buildResponse({
          success: true,
          data: { items: [], total: 0 },
        })
      )
      .mockResolvedValueOnce(
        buildResponse({
          success: true,
          data: {
            id: 'setting-2',
            clinic_id: null,
            name: 'menu_items',
            category: 'menu',
            value: [],
            data_type: 'array',
            is_editable: true,
            is_public: false,
            updated_at: new Date().toISOString(),
          },
        })
      );

    render(<MasterDataForm />);

    const saveButton = await screen.findByRole('button', { name: '保存' });
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const request = fetchMock.mock.calls[1];
    const requestBody = JSON.parse((request[1] as RequestInit).body as string);

    expect(request[0]).toBe('/api/admin/master-data');
    expect((request[1] as RequestInit).method).toBe('POST');
    expect(requestBody).toMatchObject({
      clinic_id: null,
      name: 'menu_items',
      category: 'menu',
      data_type: 'array',
      is_editable: true,
      is_public: false,
    });
  });

  it('updates the existing master data entry on save', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    fetchMock
      .mockResolvedValueOnce(
        buildResponse({
          success: true,
          data: {
            items: [
              {
                id: 'setting-3',
                clinic_id: null,
                name: 'menu_items',
                category: 'menu',
                value: [
                  {
                    id: 'item-9',
                    name: 'メニューA',
                    price: 2000,
                    duration: 30,
                    category: '一般',
                    isActive: true,
                  },
                ],
                data_type: 'array',
                is_editable: true,
                is_public: false,
                updated_at: new Date().toISOString(),
              },
            ],
            total: 1,
          },
        })
      )
      .mockResolvedValueOnce(
        buildResponse({
          success: true,
          data: {
            id: 'setting-3',
            clinic_id: null,
            name: 'menu_items',
            category: 'menu',
            value: [],
            data_type: 'array',
            is_editable: true,
            is_public: false,
            updated_at: new Date().toISOString(),
          },
        })
      );

    render(<MasterDataForm />);

    const saveButton = await screen.findByRole('button', { name: '保存' });
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const request = fetchMock.mock.calls[1];
    const requestBody = JSON.parse((request[1] as RequestInit).body as string);

    expect(request[0]).toBe('/api/admin/master-data');
    expect((request[1] as RequestInit).method).toBe('PUT');
    expect(requestBody).toMatchObject({
      id: 'setting-3',
      data_type: 'array',
      is_editable: true,
      is_public: false,
    });
  });
});
