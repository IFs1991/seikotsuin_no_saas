import {
  canRoleAccessMobileUiuxScreen,
  canRoleNavigateToMobileUiuxTarget,
  resolveMobileUiuxEntryPath,
} from '@/lib/mobile-uiux/navigation';

describe('mobile-uiux role navigation contract', () => {
  it.each([
    ['admin', '/mobile-uiux/screens/home'],
    ['clinic_admin', '/mobile-uiux/screens/home'],
    ['manager', '/mobile-uiux/screens/home'],
    ['therapist', '/mobile-uiux/screens/reservations'],
    ['staff', '/mobile-uiux/screens/reservations'],
    ['customer', null],
    ['unknown', null],
    [null, null],
  ])('resolves entry path for %s', (role, expectedPath) => {
    expect(resolveMobileUiuxEntryPath(role)).toBe(expectedPath);
  });

  it.each(['admin', 'clinic_admin', 'manager'])(
    'allows %s to access home and settings-detail',
    role => {
      expect(canRoleAccessMobileUiuxScreen(role, 'home')).toBe(true);
      expect(canRoleAccessMobileUiuxScreen(role, 'settings-detail')).toBe(true);
      expect(canRoleNavigateToMobileUiuxTarget(role, 'home')).toBe(true);
    }
  );

  it.each(['therapist', 'staff'])(
    'keeps %s out of home and settings-detail while allowing operational nav targets',
    role => {
      expect(canRoleAccessMobileUiuxScreen(role, 'home')).toBe(false);
      expect(canRoleAccessMobileUiuxScreen(role, 'settings-detail')).toBe(
        false
      );
      expect(canRoleNavigateToMobileUiuxTarget(role, 'home')).toBe(false);
      expect(canRoleNavigateToMobileUiuxTarget(role, 'reservations')).toBe(
        true
      );
      expect(canRoleNavigateToMobileUiuxTarget(role, 'patients')).toBe(true);
      expect(canRoleNavigateToMobileUiuxTarget(role, 'daily-reports')).toBe(
        true
      );
      expect(canRoleNavigateToMobileUiuxTarget(role, 'settings')).toBe(true);
    }
  );

  it.each(['customer', 'unknown', null])('denies all targets for %s', role => {
    expect(resolveMobileUiuxEntryPath(role)).toBeNull();
    expect(canRoleAccessMobileUiuxScreen(role, 'reservations')).toBe(false);
    expect(canRoleNavigateToMobileUiuxTarget(role, 'reservations')).toBe(false);
  });
});
