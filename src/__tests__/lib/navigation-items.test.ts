import {
  ADMIN_MENU_ITEMS,
  AREA_MANAGER_ADMIN_MENU_ITEMS,
  CLINIC_ADMIN_MENU_ITEMS,
  OPERATION_MENU_ITEMS,
  QUICK_ACCESS_ITEMS,
  canUseAdminNavigation,
  getCurrentNavigationItemId,
  getAdminMenuItemsForRole,
  getNavigationMode,
  getOperationMenuItemsForRole,
  getQuickAccessItemsForRole,
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

  it('clinic_admin の管理セクションは店舗管理に必要な導線に限定する', () => {
    expect(CLINIC_ADMIN_MENU_ITEMS.map(item => item.label)).toEqual([
      'スタッフ管理',
      '希望シフト確認',
      '患者管理',
      '施術メニュー',
    ]);
    expect(CLINIC_ADMIN_MENU_ITEMS.map(item => item.href)).toEqual([
      '/admin/users',
      '/staff/shift-requests/admin',
      '/patients/list',
      '/reservations/settings/menus',
    ]);
  });

  it('manager の管理セクションは担当エリア管理に必要な導線だけに限定する', () => {
    expect(canUseAdminNavigation('manager')).toBe(true);
    expect(AREA_MANAGER_ADMIN_MENU_ITEMS.map(item => item.label)).toEqual([
      '管理ホーム',
      'スタッフ管理',
      '希望シフト管理',
      'Clinic設定',
      '店舗比較分析',
    ]);
    expect(AREA_MANAGER_ADMIN_MENU_ITEMS.map(item => item.href)).toEqual([
      '/admin',
      '/admin/users',
      '/admin/shift-requests',
      '/admin/settings',
      '/multi-store',
    ]);
    expect(getAdminMenuItemsForRole('manager')).toBe(
      AREA_MANAGER_ADMIN_MENU_ITEMS
    );
  });

  it('マネージャー管理はHQ管理メニューだけに表示する', () => {
    expect(ADMIN_MENU_ITEMS.map(item => item.href)).toContain(
      '/admin/managers'
    );
    expect(CLINIC_ADMIN_MENU_ITEMS.map(item => item.href)).not.toContain(
      '/admin/managers'
    );
    expect(AREA_MANAGER_ADMIN_MENU_ITEMS.map(item => item.href)).not.toContain(
      '/admin/managers'
    );
  });

  it('manager は店舗運用メニューと限定管理メニューを表示対象にする', () => {
    const mode = getNavigationMode({
      role: 'manager',
      profileLoading: false,
    });
    const visibleItems = getVisibleNavigationItems(mode);

    expect(mode.isHqAdmin).toBe(false);
    expect(mode.canAccessAdminNavigation).toBe(true);
    expect(mode.showAdminMenus).toBe(true);
    expect(mode.showOperationMenus).toBe(true);
    expect(visibleItems.map(item => item.href)).toContain('/admin');
    expect(visibleItems.map(item => item.href)).toContain('/admin/users');
    expect(visibleItems.map(item => item.href)).toContain(
      '/admin/shift-requests'
    );
    expect(visibleItems.map(item => item.href)).toContain('/admin/settings');
    expect(visibleItems.map(item => item.href)).toContain('/multi-store');
    expect(visibleItems.map(item => item.href)).not.toContain('/admin/tenants');
  });

  it('manager の日報管理サブメニューには日報入力を表示しない', () => {
    const mode = getNavigationMode({
      role: 'manager',
      profileLoading: false,
    });
    const visibleItems = getVisibleNavigationItems(mode);
    const dailyReportsItem = visibleItems.find(
      item => item.id === 'daily-reports'
    );

    expect(dailyReportsItem?.subItems?.map(item => item.id)).toEqual([
      'daily-list',
    ]);
    expect(
      getCurrentNavigationItemId('/daily-reports/input', visibleItems)
    ).toBe('daily-reports');
    const defaultDailyReportsItem = OPERATION_MENU_ITEMS.find(
      item => item.id === 'daily-reports'
    );

    expect(
      defaultDailyReportsItem?.subItems?.map(item => item.id)
    ).toEqual(['daily-input', 'daily-list']);
  });

  it('manager の予約管理サブメニューは担当院タイムラインだけを表示する', () => {
    const managerOperationItems = getOperationMenuItemsForRole('manager');
    const reservationsItem = managerOperationItems.find(
      item => item.id === 'reservations'
    );

    expect(reservationsItem?.subItems).toEqual([
      {
        id: 'reservation-timeline',
        label: '担当院タイムライン',
        href: '/reservations?view=timeline',
      },
    ]);
    expect(
      reservationsItem?.subItems?.map(item => item.id)
    ).not.toContain('reservation-register');
    expect(
      reservationsItem?.subItems?.map(item => item.id)
    ).not.toContain('reservation-list');

    const defaultReservationsItem = OPERATION_MENU_ITEMS.find(
      item => item.id === 'reservations'
    );
    expect(defaultReservationsItem?.subItems?.map(item => item.id)).toEqual([
      'reservation-timeline',
      'reservation-register',
      'reservation-list',
    ]);
  });

  it('manager は管理セクション非表示時も manager 用の店舗運用メニューを使う', () => {
    const visibleItems = getVisibleNavigationItems({
      role: 'manager',
      isHqAdmin: false,
      showOperationMenus: true,
      showAdminMenus: false,
    });
    const reservationsItem = visibleItems.find(
      item => item.id === 'reservations'
    );

    expect(reservationsItem?.subItems?.map(item => item.id)).toEqual([
      'reservation-timeline',
    ]);
  });

  it('manager の quick access には新規予約導線を表示しない', () => {
    const managerQuickAccessItems = getQuickAccessItemsForRole('manager');

    expect(managerQuickAccessItems.map(item => item.id)).not.toContain(
      'quick-reservation'
    );
    expect(managerQuickAccessItems.map(item => item.href)).not.toContain(
      '/reservations?view=register'
    );
    expect(QUICK_ACCESS_ITEMS.map(item => item.id)).toContain(
      'quick-reservation'
    );
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

  it('clinic_admin の表示対象に患者管理を含める', () => {
    const mode = getNavigationMode({
      role: 'clinic_admin',
      profileLoading: false,
    });
    const visibleItems = getVisibleNavigationItems(mode);

    expect(getCurrentNavigationItemId('/patients/list', visibleItems)).toBe(
      'clinic-patients'
    );
    expect(visibleItems.map(item => item.label)).toContain('患者管理');
  });
});
