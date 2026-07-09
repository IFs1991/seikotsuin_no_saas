import { CSPConfig } from '@/lib/security/csp-config';

const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

function getDirective(csp: string, directive: string): string {
  return (
    csp
      .split(';')
      .map(part => part.trim())
      .find(part => part.startsWith(`${directive} `)) ?? ''
  );
}

describe('CSP Turnstile allowlist', () => {
  it.each([
    ['development', CSPConfig.getDevelopmentCSP()],
    ['production', CSPConfig.getProductionCSP('nonce-001')],
    ['report-only', CSPConfig.getReportOnlyCSP()],
    ['medical', CSPConfig.getMedicalGradeCSP('nonce-001')],
    ['mobile-uiux', CSPConfig.getMobileUiuxCSP().csp],
  ])('%s CSP allows Turnstile script and frame origins', (_name, csp) => {
    expect(getDirective(csp, 'script-src')).toContain(TURNSTILE_ORIGIN);
    expect(getDirective(csp, 'frame-src')).toContain(TURNSTILE_ORIGIN);
  });
});
