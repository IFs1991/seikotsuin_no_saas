import type { MenuItem, MenuOptionItem } from '../types';

/**
 * メニューに紐づくオプションを一意化して `AppointmentDetail` 等で使う形に整形する。
 * 先頭に「なし」項目を追加する。
 */
export const buildMenuOptions = (menus: MenuItem[]): MenuOptionItem[] => {
  const map = new Map<string, MenuOptionItem>();

  for (const menu of menus) {
    for (const option of (menu.options ?? []).filter(item => item.isActive)) {
      if (!map.has(option.id)) {
        map.set(option.id, {
          id: option.id,
          name: option.name,
          priceDelta: option.priceDelta,
          durationDeltaMinutes: option.durationDeltaMinutes,
        });
      }
    }
  }

  return [
    {
      id: 'none',
      name: 'なし',
      priceDelta: 0,
      durationDeltaMinutes: 0,
    },
    ...Array.from(map.values()),
  ];
};
