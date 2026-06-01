import {
  canAccessAdminUIWithCompat,
  isAreaManagerRole,
  isHQRole,
  normalizeRole,
} from '@/lib/constants/roles';

export interface NavigationItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly subItems?: readonly NavigationItem[];
}

export interface NavigationModeInput {
  readonly role: string | null | undefined;
  readonly profileLoading?: boolean;
  readonly canAccessAdminNavigation?: boolean;
}

export interface NavigationMode {
  readonly role: string | null;
  readonly isHqAdmin: boolean;
  readonly canAccessAdminNavigation: boolean;
  readonly showOperationMenus: boolean;
  readonly showAdminMenus: boolean;
}

export const OPERATION_MENU_ITEMS: readonly NavigationItem[] = [
  { id: 'dashboard', label: 'ダッシュボード', href: '/dashboard' },
  {
    id: 'daily-reports',
    label: '日報管理',
    href: '/daily-reports',
    subItems: [
      { id: 'daily-input', label: '日報入力', href: '/daily-reports/input' },
      { id: 'daily-list', label: '日報一覧', href: '/daily-reports' },
    ],
  },
  {
    id: 'reservations',
    label: '予約管理',
    href: '/reservations',
    subItems: [
      {
        id: 'reservation-timeline',
        label: 'タイムライン',
        href: '/reservations',
      },
      {
        id: 'reservation-register',
        label: '新規予約',
        href: '/reservations?view=register',
      },
      {
        id: 'reservation-list',
        label: '予約一覧',
        href: '/reservations?view=list',
      },
    ],
  },
  { id: 'patients', label: '患者分析', href: '/patients' },
  { id: 'revenue', label: '収益分析', href: '/revenue' },
  { id: 'staff', label: 'スタッフ分析', href: '/staff' },
  { id: 'ai-insights', label: 'AI分析', href: '/ai-insights' },
];

const AI_INSIGHTS_HREF = '/ai-insights';

const OPERATION_MENU_ITEMS_WITHOUT_AI: readonly NavigationItem[] =
  OPERATION_MENU_ITEMS.filter(item => item.href !== AI_INSIGHTS_HREF);

export const ADMIN_MENU_ITEMS: readonly NavigationItem[] = [
  { id: 'admin', label: '管理ホーム', href: '/admin' },
  { id: 'admin-tenants', label: 'クリニック管理', href: '/admin/tenants' },
  { id: 'admin-users', label: 'スタッフ管理', href: '/admin/users' },
  { id: 'admin-settings', label: 'システム設定', href: '/admin/settings' },
  { id: 'multi-store', label: '店舗比較分析', href: '/multi-store' },
  { id: 'admin-chat', label: 'AIチャット', href: '/admin/chat' },
];

export const CLINIC_ADMIN_MENU_ITEMS: readonly NavigationItem[] = [
  { id: 'admin-users', label: 'スタッフ管理', href: '/admin/users' },
  { id: 'clinic-patients', label: '患者管理', href: '/patients/list' },
  {
    id: 'clinic-menu-settings',
    label: '施術メニュー',
    href: '/reservations/settings/menus',
  },
];

export const AREA_MANAGER_ADMIN_MENU_ITEMS: readonly NavigationItem[] = [
  { id: 'admin', label: '管理ホーム', href: '/admin' },
  { id: 'admin-users', label: 'スタッフ管理', href: '/admin/users' },
  { id: 'admin-settings', label: 'Clinic設定', href: '/admin/settings' },
  { id: 'multi-store', label: '店舗比較分析', href: '/multi-store' },
];

const EMPTY_NAVIGATION_ITEMS: readonly NavigationItem[] = [];
const OPERATION_AND_ADMIN_MENU_ITEMS: readonly NavigationItem[] = [
  ...OPERATION_MENU_ITEMS,
  ...ADMIN_MENU_ITEMS,
];
const OPERATION_WITHOUT_AI_AND_ADMIN_MENU_ITEMS: readonly NavigationItem[] = [
  ...OPERATION_MENU_ITEMS_WITHOUT_AI,
  ...ADMIN_MENU_ITEMS,
];
const OPERATION_AND_CLINIC_ADMIN_MENU_ITEMS: readonly NavigationItem[] = [
  ...OPERATION_MENU_ITEMS,
  ...CLINIC_ADMIN_MENU_ITEMS,
];
const OPERATION_WITHOUT_AI_AND_CLINIC_ADMIN_MENU_ITEMS: readonly NavigationItem[] =
  [...OPERATION_MENU_ITEMS_WITHOUT_AI, ...CLINIC_ADMIN_MENU_ITEMS];
const OPERATION_AND_AREA_MANAGER_MENU_ITEMS: readonly NavigationItem[] = [
  ...OPERATION_MENU_ITEMS,
  ...AREA_MANAGER_ADMIN_MENU_ITEMS,
];
const OPERATION_WITHOUT_AI_AND_AREA_MANAGER_MENU_ITEMS: readonly NavigationItem[] =
  [...OPERATION_MENU_ITEMS_WITHOUT_AI, ...AREA_MANAGER_ADMIN_MENU_ITEMS];

const OPERATION_MENU_ITEMS_BY_AI_FLAG = {
  enabled: OPERATION_MENU_ITEMS,
  disabled: OPERATION_MENU_ITEMS_WITHOUT_AI,
} as const;

const OPERATION_AND_HQ_ADMIN_MENU_ITEMS_BY_AI_FLAG = {
  enabled: OPERATION_AND_ADMIN_MENU_ITEMS,
  disabled: OPERATION_WITHOUT_AI_AND_ADMIN_MENU_ITEMS,
} as const;

const OPERATION_AND_CLINIC_ADMIN_MENU_ITEMS_BY_AI_FLAG = {
  enabled: OPERATION_AND_CLINIC_ADMIN_MENU_ITEMS,
  disabled: OPERATION_WITHOUT_AI_AND_CLINIC_ADMIN_MENU_ITEMS,
} as const;

const OPERATION_AND_AREA_MANAGER_MENU_ITEMS_BY_AI_FLAG = {
  enabled: OPERATION_AND_AREA_MANAGER_MENU_ITEMS,
  disabled: OPERATION_WITHOUT_AI_AND_AREA_MANAGER_MENU_ITEMS,
} as const;

export const QUICK_ACCESS_ITEMS: readonly NavigationItem[] = [
  { id: 'quick-daily-input', label: '日報入力', href: '/daily-reports/input' },
  {
    id: 'quick-reservation',
    label: '新規予約',
    href: '/reservations?view=register',
  },
  { id: 'quick-patient', label: '患者検索', href: '/patients' },
  { id: 'quick-revenue', label: '収益レポート', href: '/revenue' },
];

export function isAiInsightsEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_AI_INSIGHTS === 'true';
}

export function getOperationMenuItems() {
  return isAiInsightsEnabled()
    ? OPERATION_MENU_ITEMS_BY_AI_FLAG.enabled
    : OPERATION_MENU_ITEMS_BY_AI_FLAG.disabled;
}

export function getVisibleNavigationItems({
  role,
  isHqAdmin,
  showOperationMenus,
  showAdminMenus,
}: Pick<
  NavigationMode,
  'role' | 'isHqAdmin' | 'showOperationMenus' | 'showAdminMenus'
>): readonly NavigationItem[] {
  if (!showOperationMenus) {
    return showAdminMenus
      ? getAdminMenuItemsForRole(role)
      : EMPTY_NAVIGATION_ITEMS;
  }

  const aiInsightsEnabled = isAiInsightsEnabled();
  const aiFlag = aiInsightsEnabled ? 'enabled' : 'disabled';

  if (!showAdminMenus) {
    return OPERATION_MENU_ITEMS_BY_AI_FLAG[aiFlag];
  }

  if (isAreaManagerRole(role)) {
    return OPERATION_AND_AREA_MANAGER_MENU_ITEMS_BY_AI_FLAG[aiFlag];
  }

  if (!isHqAdmin) {
    return OPERATION_AND_CLINIC_ADMIN_MENU_ITEMS_BY_AI_FLAG[aiFlag];
  }

  return OPERATION_AND_HQ_ADMIN_MENU_ITEMS_BY_AI_FLAG[aiFlag];
}

export function canUseAdminNavigation(
  role: string | null | undefined
): boolean {
  return canAccessAdminUIWithCompat(role) || isAreaManagerRole(role);
}

export function isHqAdminRole(role: string | null | undefined): boolean {
  return isHQRole(normalizeRole(role));
}

export function getAdminMenuItemsForRole(
  role: string | null | undefined
): readonly NavigationItem[] {
  const normalizedRole = normalizeRole(role);
  if (isHQRole(normalizedRole)) {
    return ADMIN_MENU_ITEMS;
  }
  if (isAreaManagerRole(normalizedRole)) {
    return AREA_MANAGER_ADMIN_MENU_ITEMS;
  }
  if (canAccessAdminUIWithCompat(normalizedRole)) {
    return CLINIC_ADMIN_MENU_ITEMS;
  }
  return EMPTY_NAVIGATION_ITEMS;
}

export function getAdminNavigationHrefForRole(
  _role: string | null | undefined
): string {
  return '/admin';
}

export function getNavigationMode({
  role,
  profileLoading = false,
  canAccessAdminNavigation = false,
}: NavigationModeInput): NavigationMode {
  const normalizedRole = normalizeRole(role);
  const resolvedCanAccessAdminNavigation =
    canAccessAdminNavigation || canUseAdminNavigation(normalizedRole);
  const isHqAdmin = isHQRole(normalizedRole);

  return {
    role: normalizedRole,
    isHqAdmin,
    canAccessAdminNavigation: resolvedCanAccessAdminNavigation,
    showOperationMenus: !profileLoading && !isHqAdmin,
    showAdminMenus: !profileLoading && resolvedCanAccessAdminNavigation,
  };
}

function getPathFromHref(href: string) {
  return href.split('?')[0];
}

export function isNavigationItemActive(pathname: string, href: string) {
  const itemPath = getPathFromHref(href);
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

export function getCurrentNavigationItemId(
  pathname: string,
  items: readonly NavigationItem[]
) {
  let currentItemId = '';
  let currentPathLength = -1;

  const visitItems = (navigationItems: readonly NavigationItem[]) => {
    for (const item of navigationItems) {
      const itemPathLength = getPathFromHref(item.href).length;

      if (
        itemPathLength > currentPathLength &&
        isNavigationItemActive(pathname, item.href)
      ) {
        currentItemId = item.id;
        currentPathLength = itemPathLength;
      }

      if (item.subItems?.length) {
        visitItems(item.subItems);
      }
    }
  };

  visitItems(items);
  return currentItemId;
}
