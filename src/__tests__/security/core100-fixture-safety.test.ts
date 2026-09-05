import { assertCore100LocalEnvironment } from '../e2e-playwright/helpers/core100-seed';

describe('core100 fixture target safety', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CORE100_E2E_ENABLED: 'true',
      NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3000',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    };
  });
  afterAll(() => {
    process.env = originalEnv;
  });

  it('rejects an effective remote Playwright baseURL before seed or login', () => {
    expect(() =>
      assertCore100LocalEnvironment('https://remote.example.invalid')
    ).toThrow();
    expect(() => assertCore100LocalEnvironment('')).toThrow();
    expect(() =>
      assertCore100LocalEnvironment('http://user:secret@127.0.0.1:3000')
    ).toThrow();
    expect(() =>
      assertCore100LocalEnvironment('http://127.0.0.1:3000')
    ).not.toThrow();
  });

  it('requires explicit opt-in and a loopback database even with a local app', () => {
    process.env.CORE100_E2E_ENABLED = 'false';
    expect(() => assertCore100LocalEnvironment()).toThrow();
    process.env.CORE100_E2E_ENABLED = 'true';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://remote.supabase.co';
    expect(() => assertCore100LocalEnvironment()).toThrow();
  });
});
