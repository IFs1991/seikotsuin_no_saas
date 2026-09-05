/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';

import { AppShell } from '@/app/(app)/app-shell';
import type { UserProfile } from '@/types/user-profile';
import { useSelectedClinic } from '@/providers/selected-clinic-context';
import { useUserProfileContext } from '@/providers/user-profile-context';

const mockUseUserProfile = jest.fn();
const mockUseAccessibleClinics = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

jest.mock('@/hooks/useUserProfile', () => ({
  useUserProfile: () => mockUseUserProfile(),
}));

jest.mock('@/hooks/useAccessibleClinics', () => ({
  useAccessibleClinics: () => mockUseAccessibleClinics(),
}));

jest.mock('@/components/navigation/header', () => ({
  Header: ({
    profile,
    fallbackClinic,
  }: {
    profile: UserProfile | null;
    fallbackClinic: { id: string; name: string } | null;
  }) => (
    <>
      <div data-testid='header-role'>{profile?.role ?? 'none'}</div>
      <div data-testid='fallback-clinic'>{fallbackClinic?.id ?? 'none'}</div>
    </>
  ),
}));

jest.mock('@/components/navigation/sidebar', () => ({
  Sidebar: ({ role }: { role: string | null }) => (
    <div data-testid='sidebar-role'>{role ?? 'none'}</div>
  ),
}));

jest.mock('@/components/navigation/mobile-bottom-nav', () => ({
  MobileBottomNav: ({ role }: { role: string | null }) => (
    <div data-testid='mobile-role'>{role ?? 'none'}</div>
  ),
}));

jest.mock('@/components/legal/legal-footer-links', () => ({
  LegalFooterLinks: () => <div>legal</div>,
}));

jest.mock('@/components/mobile-uiux/mobile-entry-prompt', () => ({
  MobileUiuxEntryPrompt: () => null,
}));

const profile: UserProfile = {
  id: 'user-1',
  email: 'staff@example.com',
  role: 'staff',
  clinicId: 'clinic-1',
  clinicName: '本院',
  isActive: true,
  isAdmin: false,
};

const initialBootstrap = {
  profile,
  clinics: [{ id: 'clinic-1', name: '本院' }],
  currentClinicId: 'clinic-1',
  errors: { profile: null, clinics: null },
  generatedAt: '2026-08-31T00:00:00.000Z',
};

function SelectedClinicProbe() {
  const { selectedClinicId, clinicsError } = useSelectedClinic();
  return (
    <>
      <div data-testid='selected-clinic'>{selectedClinicId ?? 'none'}</div>
      <div data-testid='clinics-error'>{clinicsError ?? 'none'}</div>
    </>
  );
}

function ProfileProbe() {
  const { profile: contextProfile, error } = useUserProfileContext();
  return (
    <>
      <div data-testid='profile-id'>{contextProfile?.id ?? 'none'}</div>
      <div data-testid='profile-error'>{error ?? 'none'}</div>
    </>
  );
}

describe('AppShell SSR bootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseUserProfile.mockReturnValue({
      profile,
      loading: false,
      error: null,
    });
    mockUseAccessibleClinics.mockReturnValue({
      clinics: initialBootstrap.clinics,
      currentClinicId: initialBootstrap.currentClinicId,
      loading: false,
      error: null,
    });
  });

  it('SSR initialDataがある場合は旧profile/clinics hookを実行しない', () => {
    render(
      <AppShell initialBootstrap={initialBootstrap}>
        <div>protected content</div>
      </AppShell>
    );

    expect(mockUseUserProfile).not.toHaveBeenCalled();
    expect(mockUseAccessibleClinics).not.toHaveBeenCalled();
    expect(screen.getByTestId('header-role')).toHaveTextContent('staff');
    expect(screen.getByTestId('sidebar-role')).toHaveTextContent('staff');
    expect(screen.getByTestId('mobile-role')).toHaveTextContent('staff');
  });

  it('managerはbootstrapのcurrentClinicIdを選択しprofile clinicへfallbackしない', () => {
    const managerBootstrap = {
      ...initialBootstrap,
      profile: {
        ...profile,
        role: 'manager',
        clinicId: 'clinic-1',
        clinicName: '池袋院',
      },
      clinics: [
        { id: 'clinic-1', name: '池袋院' },
        { id: 'clinic-2', name: '渋谷院' },
      ],
      currentClinicId: 'clinic-2',
    };

    render(
      <AppShell initialBootstrap={managerBootstrap}>
        <SelectedClinicProbe />
      </AppShell>
    );

    expect(screen.getByTestId('header-role')).toHaveTextContent('manager');
    expect(screen.getByTestId('sidebar-role')).toHaveTextContent('manager');
    expect(screen.getByTestId('selected-clinic')).toHaveTextContent('clinic-2');
    expect(screen.getByTestId('fallback-clinic')).toHaveTextContent('none');
  });

  it('clinic取得失敗はclinic側だけへ伝播し、valid profileを失敗扱いにしない', () => {
    const clinicFailureBootstrap = {
      ...initialBootstrap,
      clinics: [],
      currentClinicId: null,
      errors: {
        profile: null,
        clinics: '利用可能なクリニック一覧の取得に失敗しました',
      },
    };

    render(
      <AppShell initialBootstrap={clinicFailureBootstrap}>
        <ProfileProbe />
        <SelectedClinicProbe />
      </AppShell>
    );

    expect(screen.getByTestId('profile-id')).toHaveTextContent('user-1');
    expect(screen.getByTestId('profile-error')).toHaveTextContent('none');
    expect(screen.getByTestId('clinics-error')).toHaveTextContent(
      '利用可能なクリニック一覧の取得に失敗しました'
    );
  });
});
