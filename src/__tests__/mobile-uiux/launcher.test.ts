import {
  filterMobileUiuxLauncherScreens,
  MOBILE_UIUX_LAUNCHER_SCREENS,
} from '@/lib/mobile-uiux/launcher';
import { MOBILE_UIUX_NAV_PATH_BY_TARGET } from '@/lib/mobile-uiux/navigation';

describe('mobile-uiux launcher screen filtering', () => {
  const screenIds = (role: string | null) =>
    filterMobileUiuxLauncherScreens(role).map(entry => entry.screen);

  it.each(['admin', 'clinic_admin', 'manager'])(
    'shows all six screens to %s',
    role => {
      expect(screenIds(role)).toEqual([
        'home',
        'reservations',
        'patients',
        'daily-reports',
        'settings',
        'settings-detail',
      ]);
    }
  );

  it.each(['therapist', 'staff'])(
    'hides home and settings-detail from %s',
    role => {
      expect(screenIds(role)).toEqual([
        'reservations',
        'patients',
        'daily-reports',
        'settings',
      ]);
    }
  );

  it.each(['customer', 'unknown', null])(
    'fails closed to no screens for %s',
    role => {
      expect(screenIds(role)).toEqual([]);
    }
  );

  it('normalizes legacy clinic_manager to clinic_admin', () => {
    expect(screenIds('clinic_manager')).toEqual(screenIds('clinic_admin'));
  });

  it('keeps hrefs aligned with the screen route paths', () => {
    for (const entry of MOBILE_UIUX_LAUNCHER_SCREENS) {
      expect(entry.href).toBe(`/mobile-uiux/screens/${entry.screen}`);
    }
    for (const [target, path] of Object.entries(
      MOBILE_UIUX_NAV_PATH_BY_TARGET
    )) {
      const entry = MOBILE_UIUX_LAUNCHER_SCREENS.find(
        item => item.screen === target
      );
      expect(entry?.href).toBe(path);
    }
  });
});
