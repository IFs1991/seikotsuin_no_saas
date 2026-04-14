import React from 'react';
import { redirect } from 'next/navigation';
import {
  createClient,
  getCurrentUser,
  getUserAccessContext,
} from '@/lib/supabase';
import AppLayout from '@/app/(app)/layout';
import MultiStoreLayout from '@/app/(app)/multi-store/layout';
import ReservationsLayout from '@/app/(app)/reservations/layout';

jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

jest.mock('@/lib/supabase', () => ({
  createClient: jest.fn(),
  getCurrentUser: jest.fn(),
  getUserAccessContext: jest.fn(),
}));

const mockRedirect = redirect as jest.MockedFunction<typeof redirect>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<
  typeof getCurrentUser
>;
const mockGetUserAccessContext = getUserAccessContext as jest.MockedFunction<
  typeof getUserAccessContext
>;

describe('App route guards', () => {
  const supabaseClient = {} as Awaited<ReturnType<typeof createClient>>;
  const user = { id: 'user-1', email: 'staff@example.com' } as Awaited<
    ReturnType<typeof getCurrentUser>
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockResolvedValue(supabaseClient);
  });

  describe('AppLayout', () => {
    test('未認証なら /login にリダイレクト', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      await expect(
        AppLayout({ children: <div>protected</div> })
      ).rejects.toThrow('NEXT_REDIRECT:/login');
      expect(mockRedirect).toHaveBeenCalledWith('/login');
    });

    test('認証済みなら AppShell に委譲する', async () => {
      mockGetCurrentUser.mockResolvedValue(user);

      const rendered = await AppLayout({ children: <div>protected</div> });

      expect(rendered).toBeDefined();
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });

  describe('MultiStoreLayout', () => {
    test('未認証なら /login にリダイレクト', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      await expect(
        MultiStoreLayout({ children: <div>multi-store</div> })
      ).rejects.toThrow('NEXT_REDIRECT:/login');
      expect(mockRedirect).toHaveBeenCalledWith('/login');
    });

    test('HQ 権限がなければ /unauthorized にリダイレクト', async () => {
      mockGetCurrentUser.mockResolvedValue(user);
      mockGetUserAccessContext.mockResolvedValue({
        permissions: { role: 'clinic_admin', clinic_id: 'clinic-1' },
        role: 'clinic_admin',
        normalizedRole: 'clinic_admin',
        clinicId: 'clinic-1',
        isActive: true,
        isAdmin: true,
      });

      await expect(
        MultiStoreLayout({ children: <div>multi-store</div> })
      ).rejects.toThrow('NEXT_REDIRECT:/unauthorized');
      expect(mockRedirect).toHaveBeenCalledWith('/unauthorized');
    });

    test('HQ かつ active なら描画する', async () => {
      mockGetCurrentUser.mockResolvedValue(user);
      mockGetUserAccessContext.mockResolvedValue({
        permissions: { role: 'admin', clinic_id: null },
        role: 'admin',
        normalizedRole: 'admin',
        clinicId: null,
        isActive: true,
        isAdmin: true,
      });

      const rendered = await MultiStoreLayout({
        children: <div>multi-store</div>,
      });

      expect(rendered).toBeDefined();
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });

  describe('ReservationsLayout', () => {
    test('未認証なら /login にリダイレクト', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      await expect(
        ReservationsLayout({ children: <div>reservations</div> })
      ).rejects.toThrow('NEXT_REDIRECT:/login');
      expect(mockRedirect).toHaveBeenCalledWith('/login');
    });

    test('admin は /admin にリダイレクト', async () => {
      mockGetCurrentUser.mockResolvedValue(user);
      mockGetUserAccessContext.mockResolvedValue({
        permissions: { role: 'admin', clinic_id: null },
        role: 'admin',
        normalizedRole: 'admin',
        clinicId: null,
        isActive: true,
        isAdmin: true,
      });

      await expect(
        ReservationsLayout({ children: <div>reservations</div> })
      ).rejects.toThrow('NEXT_REDIRECT:/admin');
      expect(mockRedirect).toHaveBeenCalledWith('/admin');
    });

    test('院スタッフはそのまま描画する', async () => {
      mockGetCurrentUser.mockResolvedValue(user);
      mockGetUserAccessContext.mockResolvedValue({
        permissions: { role: 'staff', clinic_id: 'clinic-1' },
        role: 'staff',
        normalizedRole: 'staff',
        clinicId: 'clinic-1',
        isActive: true,
        isAdmin: false,
      });

      const rendered = await ReservationsLayout({
        children: <div>reservations</div>,
      });

      expect(rendered).toBeDefined();
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });
});
