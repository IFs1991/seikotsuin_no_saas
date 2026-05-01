import {
  apiRateLimit,
  getPathRateLimit,
  loginRateLimit,
  mfaRateLimit,
  sessionCreationRateLimit,
} from '@/lib/rate-limiting/middleware';
import { RATE_LIMIT_CONFIG } from '@/lib/rate-limiting/rate-limiter';

describe('getPathRateLimit', () => {
  it('applies public API rate limits only to public endpoints', () => {
    expect(getPathRateLimit('/api/public/reservations')).toEqual([apiRateLimit]);
    expect(getPathRateLimit('/api/public/menus')).toEqual([apiRateLimit]);
    expect(getPathRateLimit('/api/admin/dashboard')).toEqual([]);
    expect(getPathRateLimit('/api/health')).toEqual([]);
  });

  it('applies auth entry point rate limits to login and signup surfaces only', () => {
    expect(getPathRateLimit('/login')).toEqual([loginRateLimit]);
    expect(getPathRateLimit('/admin/login')).toEqual([loginRateLimit]);
    expect(getPathRateLimit('/register')).toEqual([loginRateLimit]);
    expect(getPathRateLimit('/invite')).toEqual([loginRateLimit]);
    expect(getPathRateLimit('/forgot-password')).toEqual([loginRateLimit]);
    expect(getPathRateLimit('/reset-password/admin')).toEqual([loginRateLimit]);
    expect(getPathRateLimit('/reset-password/clinic')).toEqual([loginRateLimit]);
    expect(getPathRateLimit('/api/auth/profile')).toEqual([]);
  });

  it('applies session and MFA rate limits to dedicated security endpoints only', () => {
    expect(getPathRateLimit('/api/admin/security/sessions')).toEqual([
      sessionCreationRateLimit,
    ]);
    expect(
      getPathRateLimit('/api/admin/security/sessions/terminate')
    ).toEqual([sessionCreationRateLimit]);
    expect(getPathRateLimit('/api/mfa/verify')).toEqual([mfaRateLimit]);
    expect(getPathRateLimit('/api/mfa/setup/initiate')).toEqual([
      mfaRateLimit,
    ]);
    expect(getPathRateLimit('/api/admin/security/events')).toEqual([]);
  });

  it('login attempts are limited to 3 with at least a 5 minute initial block', () => {
    expect(RATE_LIMIT_CONFIG.LOGIN_ATTEMPTS.MAX_ATTEMPTS).toBe(3);
    expect(
      RATE_LIMIT_CONFIG.LOGIN_ATTEMPTS.BLOCK_DURATION[0]
    ).toBeGreaterThanOrEqual(300);
  });
});
