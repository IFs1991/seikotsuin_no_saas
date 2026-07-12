import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Settings,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { canRoleAccessMobileUiuxScreen } from '@/lib/mobile-uiux/navigation';
import type { MobileUiuxScreenResource } from '@/lib/mobile-uiux/bridge-manifest';

export type MobileUiuxLauncherScreen = {
  screen: MobileUiuxScreenResource;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

export const MOBILE_UIUX_LAUNCHER_SCREENS = [
  {
    screen: 'home',
    title: 'ホーム / ダッシュボード',
    description: '本日の予約、KPI、日報状況を確認するモバイル画面です。',
    href: '/mobile-uiux/screens/home',
    icon: BarChart3,
  },
  {
    screen: 'reservations',
    title: '予約',
    description: '予約タイムライン、担当者、予約詳細を確認する画面です。',
    href: '/mobile-uiux/screens/reservations',
    icon: CalendarDays,
  },
  {
    screen: 'patients',
    title: '患者分析',
    description: '患者セグメント、来院傾向、フォロー対象を確認する画面です。',
    href: '/mobile-uiux/screens/patients',
    icon: Users,
  },
  {
    screen: 'daily-reports',
    title: '日報',
    description: '日報、売上、提出状況を確認する画面です。',
    href: '/mobile-uiux/screens/daily-reports',
    icon: ClipboardList,
  },
  {
    screen: 'settings',
    title: '設定',
    description: 'アカウント設定、申請、ヘルプ勤務を確認する画面です。',
    href: '/mobile-uiux/screens/settings',
    icon: Settings,
  },
  {
    screen: 'settings-detail',
    title: '設定詳細',
    description: '院情報、施術メニュー、保険設定を確認する画面です。',
    href: '/mobile-uiux/screens/settings-detail',
    icon: SlidersHorizontal,
  },
] as const satisfies readonly MobileUiuxLauncherScreen[];

export function filterMobileUiuxLauncherScreens(
  role: string | null | undefined
): MobileUiuxLauncherScreen[] {
  return MOBILE_UIUX_LAUNCHER_SCREENS.filter(entry =>
    canRoleAccessMobileUiuxScreen(role, entry.screen)
  );
}
