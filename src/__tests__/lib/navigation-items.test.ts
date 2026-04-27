import {
  ADMIN_MENU_ITEMS,
  CLINIC_ADMIN_MENU_ITEMS,
  OPERATION_MENU_ITEMS,
  getCurrentNavigationItemId,
  getNavigationMode,
  getVisibleNavigationItems,
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

  it('clinic_admin の管理セクションはスタッフ管理と施術メニューに限定する', () => {
    expect(CLINIC_ADMIN_MENU_ITEMS.map(item => item.label)).toEqual([
      'スタッフ管理',
      '施術メニュー',
    ]);
    expect(CLINIC_ADMIN_MENU_ITEMS.map(item => item.href)).toEqual([
      '/admin/users',
      '/reservations/settings/menus',
    ]);
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
    expect(getCurrentNavigationItemId('/admin/tenants', ADMIN_MENU_ITEMS)).toBe(
      'admin-tenants'
    );
    expect(getCurrentNavigationItemId('/admin/chat', ADMIN_MENU_ITEMS)).toBe(
      'admin-chat'
    );
    expect(
      getCurrentNavigationItemId('/daily-reports/input', OPERATION_MENU_ITEMS)
    ).toBe('daily-input');
  });

  it('clinic_admin の表示対象に院別メニュー設定を含める', () => {
    const mode = getNavigationMode({
      role: 'clinic_admin',
      profileLoading: false,
    });
    const visibleItems = getVisibleNavigationItems(mode);

    expect(
      getCurrentNavigationItemId('/reservations/settings/menus', visibleItems)
    ).toBe('clinic-menu-settings');
    expect(visibleItems.map(item => item.label)).toContain('施術メニュー');
  });
});
