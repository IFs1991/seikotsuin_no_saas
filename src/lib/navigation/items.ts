import {
  canAccessAdminUIWithCompat,
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
  { id: 'staff', label: 'スタッフ管理', href: '/staff' },
  { id: 'ai-insights', label: 'AI分析', href: '/ai-insights' },
];

export const ADMIN_MENU_ITEMS: readonly NavigationItem[] = [
  { id: 'admin', label: '管理ダッシュボード', href: '/admin' },
  { id: 'admin-tenants', label: 'クリニック管理', href: '/admin/tenants' },
  { id: 'admin-users', label: 'ユーザー権限', href: '/admin/users' },
  { id: 'admin-settings', label: 'システム設定', href: '/admin/settings' },
  { id: 'multi-store', label: '多店舗分析', href: '/multi-store' },
];

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
  return OPERATION_MENU_ITEMS.filter(
    item => isAiInsightsEnabled() || item.href !== '/ai-insights'
  );
}

export function canUseAdminNavigation(
  role: string | null | undefined
): boolean {
  return canAccessAdminUIWithCompat(role);
}

export function isHqAdminRole(role: string | null | undefined): boolean {
  return isHQRole(normalizeRole(role));
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
  const candidates = items
    .flatMap(item => [item, ...(item.subItems ?? [])])
    .sort(
      (a, b) => getPathFromHref(b.href).length - getPathFromHref(a.href).length
    );

  return (
    candidates.find(item => isNavigationItemActive(pathname, item.href))?.id ??
    ''
  );
}
