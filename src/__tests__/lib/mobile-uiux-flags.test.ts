import {
  areMobileUiuxWritesEnabled,
  getMobileUiuxFlags,
} from '@/lib/mobile-uiux/flags';

describe('mobile-uiux flags', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.MOBILE_UIUX_ENABLED;
    delete process.env.MOBILE_UIUX_REAL_DATA_ENABLED;
    delete process.env.MOBILE_UIUX_WRITE_ENABLED;
    delete process.env.MOBILE_UIUX_RESERVATION_WRITE_ENABLED;
    delete process.env.MOBILE_UIUX_DAILY_REPORT_WRITE_ENABLED;
    delete process.env.MOBILE_UIUX_SETTINGS_WRITE_ENABLED;
    delete process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS;
    delete process.env.MOBILE_UIUX_ALLOWED_ROLES;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('defaults closed when env is unset', () => {
    expect(getMobileUiuxFlags()).toEqual({
      enabled: false,
      realDataEnabled: false,
      writeEnabled: false,
      reservationWriteEnabled: false,
      dailyReportWriteEnabled: false,
      settingsWriteEnabled: false,
      allowedClinicIds: [],
      allowedRoles: ['admin', 'clinic_admin', 'manager', 'therapist', 'staff'],
    });
  });

  it('parses true values and comma separated allowlists', () => {
    process.env.MOBILE_UIUX_ENABLED = 'true';
    process.env.MOBILE_UIUX_REAL_DATA_ENABLED = 'true';
    process.env.MOBILE_UIUX_WRITE_ENABLED = 'true';
    process.env.MOBILE_UIUX_RESERVATION_WRITE_ENABLED = 'true';
    process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = ' clinic-1,clinic-2 ';
    process.env.MOBILE_UIUX_ALLOWED_ROLES = 'admin, manager, customer';

    expect(getMobileUiuxFlags()).toMatchObject({
      enabled: true,
      realDataEnabled: true,
      writeEnabled: true,
      reservationWriteEnabled: true,
      allowedClinicIds: ['clinic-1', 'clinic-2'],
      allowedRoles: ['admin', 'manager'],
    });
  });

  it('requires both global and screen write flags for mutations', () => {
    process.env.MOBILE_UIUX_WRITE_ENABLED = 'true';
    process.env.MOBILE_UIUX_DAILY_REPORT_WRITE_ENABLED = 'true';

    const flags = getMobileUiuxFlags();

    expect(areMobileUiuxWritesEnabled(flags, 'dailyReport')).toBe(true);
    expect(areMobileUiuxWritesEnabled(flags, 'reservation')).toBe(false);
    expect(areMobileUiuxWritesEnabled(flags, 'settings')).toBe(false);
  });
});
