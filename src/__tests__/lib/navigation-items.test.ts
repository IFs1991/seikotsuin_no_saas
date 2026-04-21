import {
  ADMIN_MENU_ITEMS,
  OPERATION_MENU_ITEMS,
  getCurrentNavigationItemId,
  getNavigationMode,
} from '@/lib/navigation/items';

describe('navigation items', () => {
  it('HQ admin は管理メニューのみ表示対象にする', () => {
    const mode = getNavigationMode({
      role: 'admin',
      profileLoading: false,
    });

    expect(mode.isHqAdmin).toBe(true);
    expect(mode.canAccessAdminNavigation).toBe(true);
    expect(mode.showAdminMenus).toBe(true);
    expect(mode.showOperationMenus).toBe(false);
  });

  it('clinic_admin は店舗運用メニューと管理メニューを両方表示対象にする', () => {
    const mode = getNavigationMode({
      role: 'clinic_admin',
      profileLoading: false,
    });

    expect(mode.isHqAdmin).toBe(false);
    expect(mode.canAccessAdminNavigation).toBe(true);
    expect(mode.showAdminMenus).toBe(true);
    expect(mode.showOperationMenus).toBe(true);
  });

  it('staff は店舗運用メニューのみ表示対象にする', () => {
    const mode = getNavigationMode({
      role: 'staff',
      profileLoading: false,
    });

    expect(mode.isHqAdmin).toBe(false);
    expect(mode.canAccessAdminNavigation).toBe(false);
    expect(mode.showAdminMenus).toBe(false);
    expect(mode.showOperationMenus).toBe(true);
  });

  it('ロール取得中はメニュー表示対象を確定しない', () => {
    const mode = getNavigationMode({
      role: 'admin',
      profileLoading: true,
    });

    expect(mode.showAdminMenus).toBe(false);
    expect(mode.showOperationMenus).toBe(false);
  });

  it('現在パスに最も近いナビ項目を選択する', () => {
    expect(
      getCurrentNavigationItemId('/admin/tenants', ADMIN_MENU_ITEMS)
    ).toBe('admin-tenants');
    expect(
      getCurrentNavigationItemId('/daily-reports/input', OPERATION_MENU_ITEMS)
    ).toBe('daily-input');
  });
});
