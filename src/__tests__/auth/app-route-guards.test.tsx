import React from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  createClient,
  getCurrentUser,
  getUserAccessContext,
} from '@/lib/supabase';
import AdminLayout from '@/app/(app)/admin/(protected)/layout';
import AppLayout from '@/app/(app)/layout';
import MultiStoreLayout from '@/app/(app)/multi-store/layout';
import ReservationsLayout from '@/app/(app)/reservations/layout';

jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  createClient: jest.fn(),
  getCurrentUser: jest.fn(),
  getUserAccessContext: jest.fn(),
  resolveScopedClinicIds: jest.fn(
    (permissions: {
      clinic_scope_ids?: string[];
      clinic_id: string | null;
    }) => {
      if (permissions.clinic_scope_ids?.length) {
        return permissions.clinic_scope_ids;
      }

      return permissions.clinic_id ? [permissions.clinic_id] : null;
    }
  ),
}));

const mockRedirect = redirect as jest.MockedFunction<typeof redirect>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<
  typeof getCurrentUser
>;
const mockGetUserAccessContext = getUserAccessContext as jest.MockedFunction<
  typeof getUserAccessContext
>;
const mockHeaders = headers as jest.MockedFunction<typeof headers>;
const mockAdminGetUser = jest.fn();

describe('App route guards', () => {
  const supabaseClient = {} as Awaited<ReturnType<typeof createClient>>;
  const adminSupabaseClient = {
    auth: {
      getUser: mockAdminGetUser,
    },
  } as Awaited<ReturnType<typeof createClient>>;
  const user = { id: 'user-1', email: 'staff@example.com' } as Awaited<
    ReturnType<typeof getCurrentUser>
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockResolvedValue(supabaseClient);
    mockAdminGetUser.mockResolvedValue({
      data: { user },
      error: null,
    });
    mockHeaders.mockResolvedValue(
      new Headers({ 'x-current-path': '/admin/users' })
    );
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

    test('clinic_admin は /unauthorized にリダイレクト', async () => {
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

    test('manager は担当Clinicスコープがあれば描画する', async () => {
      mockGetCurrentUser.mockResolvedValue(user);
      mockGetUserAccessContext.mockResolvedValue({
        permissions: {
          role: 'manager',
          clinic_id: 'clinic-1',
          clinic_scope_ids: ['clinic-1', 'clinic-2'],
        },
        role: 'manager',
        normalizedRole: 'manager',
        clinicId: 'clinic-1',
        isActive: true,
        isAdmin: false,
      });

      const rendered = await MultiStoreLayout({
        children: <div>multi-store</div>,
      });

      expect(rendered).toBeDefined();
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    test('manager は担当Clinicスコープがなければ /unauthorized にリダイレクト', async () => {
      mockGetCurrentUser.mockResolvedValue(user);
      mockGetUserAccessContext.mockResolvedValue({
        permissions: { role: 'manager', clinic_id: null },
        role: 'manager',
        normalizedRole: 'manager',
        clinicId: null,
        isActive: true,
        isAdmin: false,
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

  describe('AdminLayout', () => {
    test('未認証なら /admin/login にリダイレクト', async () => {
      mockCreateClient.mockResolvedValue(adminSupabaseClient);
      mockAdminGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      await expect(
        AdminLayout({ children: <div>admin</div> })
      ).rejects.toThrow('NEXT_REDIRECT:/admin/login');
      expect(mockRedirect).toHaveBeenCalledWith('/admin/login');
    });

    test('manager は /admin/users を描画できる', async () => {
      mockCreateClient.mockResolvedValue(adminSupabaseClient);
      mockHeaders.mockResolvedValue(
        new Headers({ 'x-current-path': '/admin/users' })
      );
      mockGetUserAccessContext.mockResolvedValue({
        permissions: { role: 'manager', clinic_id: 'clinic-1' },
        role: 'manager',
        normalizedRole: 'manager',
        clinicId: 'clinic-1',
        isActive: true,
        isAdmin: false,
      });

      const rendered = await AdminLayout({ children: <div>admin users</div> });

      expect(rendered).toBeDefined();
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    test('manager は /admin の担当エリア管理ホームを描画できる', async () => {
      mockCreateClient.mockResolvedValue(adminSupabaseClient);
      mockHeaders.mockResolvedValue(new Headers({ 'x-current-path': '/admin' }));
      mockGetUserAccessContext.mockResolvedValue({
        permissions: { role: 'manager', clinic_id: 'clinic-1' },
        role: 'manager',
        normalizedRole: 'manager',
        clinicId: 'clinic-1',
        isActive: true,
        isAdmin: false,
      });

      const rendered = await AdminLayout({ children: <div>admin home</div> });

      expect(rendered).toBeDefined();
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    test('manager は HQ-only の /admin/settings を開けない', async () => {
      mockCreateClient.mockResolvedValue(adminSupabaseClient);
      mockHeaders.mockResolvedValue(
        new Headers({ 'x-current-path': '/admin/settings' })
      );
      mockGetUserAccessContext.mockResolvedValue({
        permissions: { role: 'manager', clinic_id: 'clinic-1' },
        role: 'manager',
        normalizedRole: 'manager',
        clinicId: 'clinic-1',
        isActive: true,
        isAdmin: false,
      });

      await expect(
        AdminLayout({ children: <div>admin settings</div> })
      ).rejects.toThrow('NEXT_REDIRECT:/unauthorized');
      expect(mockRedirect).toHaveBeenCalledWith('/unauthorized');
    });

    test('clinic_admin の既存 admin UI アクセスは維持する', async () => {
      mockCreateClient.mockResolvedValue(adminSupabaseClient);
      mockHeaders.mockResolvedValue(
        new Headers({ 'x-current-path': '/admin/settings' })
      );
      mockGetUserAccessContext.mockResolvedValue({
        permissions: { role: 'clinic_admin', clinic_id: 'clinic-1' },
        role: 'clinic_admin',
        normalizedRole: 'clinic_admin',
        clinicId: 'clinic-1',
        isActive: true,
        isAdmin: true,
      });

      const rendered = await AdminLayout({
        children: <div>admin settings</div>,
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
