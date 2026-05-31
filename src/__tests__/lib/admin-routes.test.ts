import {
  canAccessAdminRouteWithCompat,
  shouldRedirectAreaManagerAdminHome,
} from '@/lib/admin/routes';

describe('admin route access helpers', () => {
  it('allows existing admin UI roles to access admin routes', () => {
    expect(
      canAccessAdminRouteWithCompat({
        role: 'admin',
        pathname: '/admin/settings',
      })
    ).toBe(true);
    expect(
      canAccessAdminRouteWithCompat({
        role: 'clinic_admin',
        pathname: '/admin/users',
      })
    ).toBe(true);
  });

  it('allows manager only for the admin users page subtree', () => {
    expect(
      canAccessAdminRouteWithCompat({
        role: 'manager',
        pathname: '/admin/users',
      })
    ).toBe(true);
    expect(
      canAccessAdminRouteWithCompat({
        role: 'manager',
        pathname: '/admin/users/permission-1',
      })
    ).toBe(true);
    expect(
      canAccessAdminRouteWithCompat({
        role: 'manager',
        pathname: '/admin/settings',
      })
    ).toBe(false);
    expect(
      canAccessAdminRouteWithCompat({
        role: 'manager',
        pathname: '/admin/tenants',
      })
    ).toBe(false);
  });

  it('does not allow manager admin routes when the pathname is unavailable', () => {
    expect(
      canAccessAdminRouteWithCompat({
        role: 'manager',
        pathname: null,
      })
    ).toBe(false);
  });

  it('redirects manager admin home to the scoped users page', () => {
    expect(
      shouldRedirectAreaManagerAdminHome({
        role: 'manager',
        pathname: '/admin',
      })
    ).toBe(true);
    expect(
      shouldRedirectAreaManagerAdminHome({
        role: 'manager',
        pathname: '/admin/users',
      })
    ).toBe(false);
    expect(
      shouldRedirectAreaManagerAdminHome({
        role: 'clinic_admin',
        pathname: '/admin',
      })
    ).toBe(false);
  });
});
