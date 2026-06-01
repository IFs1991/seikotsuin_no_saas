import {
  AREA_MANAGER_SETTINGS_CATEGORIES,
  canManageAdminSettingsCategory,
} from '@/lib/admin-settings/access';

describe('admin settings access helpers', () => {
  it('allows manager to manage only clinic-operational setting categories', () => {
    expect(canManageAdminSettingsCategory('manager', 'clinic_basic')).toBe(
      true
    );
    expect(canManageAdminSettingsCategory('manager', 'clinic_hours')).toBe(
      true
    );
    expect(canManageAdminSettingsCategory('manager', 'booking_calendar')).toBe(
      true
    );
    expect(canManageAdminSettingsCategory('manager', 'services_pricing')).toBe(
      true
    );
    expect(canManageAdminSettingsCategory('manager', 'insurance_billing')).toBe(
      true
    );
    expect(canManageAdminSettingsCategory('manager', 'communication')).toBe(
      true
    );

    expect(canManageAdminSettingsCategory('manager', 'system_security')).toBe(
      false
    );
    expect(canManageAdminSettingsCategory('manager', 'system_backup')).toBe(
      false
    );
    expect(canManageAdminSettingsCategory('manager', 'data_management')).toBe(
      false
    );
  });

  it('keeps existing admin and clinic_admin setting category behavior', () => {
    expect(canManageAdminSettingsCategory('admin', 'system_security')).toBe(
      true
    );
    expect(
      canManageAdminSettingsCategory('clinic_admin', 'system_security')
    ).toBe(true);
  });

  it('exports the manager category allowlist without HQ/global categories', () => {
    expect(AREA_MANAGER_SETTINGS_CATEGORIES).toEqual([
      'clinic_basic',
      'clinic_hours',
      'booking_calendar',
      'communication',
      'services_pricing',
      'insurance_billing',
    ]);
  });
});
