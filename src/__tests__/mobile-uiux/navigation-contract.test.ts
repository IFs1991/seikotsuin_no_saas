import { MOBILE_UIUX_BOTTOM_NAV_TARGETS_BY_ROLE as BRIDGE_NAV_TARGETS_BY_ROLE } from '@/lib/mobile-uiux/bridge-manifest';
import {
  canRoleAccessMobileUiuxScreen,
  canRoleNavigateToMobileUiuxTarget,
  MOBILE_UIUX_BOTTOM_NAV_TARGETS_BY_ROLE,
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

  // navigation.ts と bridge-manifest.ts のロール別ナビ表は手動で複製されている。
  // ズレるとサーバー判定とクライアント表示(ナビ非表示CSS/タップ判定)が食い違う。
  it('keeps navigation.ts and bridge-manifest.ts nav-target tables in sync', () => {
    expect(BRIDGE_NAV_TARGETS_BY_ROLE).toEqual(
      MOBILE_UIUX_BOTTOM_NAV_TARGETS_BY_ROLE
    );
  });
});
