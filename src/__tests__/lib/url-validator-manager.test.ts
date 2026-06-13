import { getDefaultRedirect } from '@/lib/url-validator';

describe('getDefaultRedirect manager routing', () => {
  it('routes manager users to the manager home', () => {
    expect(getDefaultRedirect('manager')).toBe('/manager');
  });
});
