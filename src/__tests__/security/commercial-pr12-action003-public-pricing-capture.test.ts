/** @jest-environment node */

import * as path from 'node:path';

interface PricingCaptureModule {
  validateOfficialPricingSourceBytesForTest(input: {
    sourceId: 'COMPUTE_AND_DISK' | 'COMPUTE_USAGE' | 'PRICING';
    contentType: string;
    bytes: Uint8Array;
  }): void;
}

const repoRoot = path.resolve(__dirname, '../../..');
const modulePath = path.join(
  repoRoot,
  'scripts/commercial-hardening/capture-pr12-action003-public-pricing.mjs'
);
let subject: PricingCaptureModule;

beforeAll(async () => {
  subject = (await import(modulePath)) as PricingCaptureModule;
});

function bytes(value: string): Uint8Array {
  return Buffer.from(value, 'utf8');
}

describe('PR12 ACTION-003 public pricing source authenticity', () => {
  test.each([
    [
      'COMPUTE_AND_DISK' as const,
      '<html><body>Large compute $0.1517 per hour</body></html>',
    ],
    [
      'COMPUTE_USAGE' as const,
      '<html><body>Partial compute hours are rounded up to a full hour.</body></html>',
    ],
    ['PRICING' as const, '<html><body>Pro plan compute pricing</body></html>'],
  ])('accepts the required semantic anchors for %s', (sourceId, body) => {
    expect(() =>
      subject.validateOfficialPricingSourceBytesForTest({
        sourceId,
        contentType: 'text/html; charset=utf-8',
        bytes: bytes(body),
      })
    ).not.toThrow();
  });

  test.each([
    ['wrong MIME', 'application/json', '<html>Large $0.1517 per hour</html>'],
    ['challenge page', 'text/html', '<html>Just a moment...</html>'],
    ['changed rate', 'text/html', '<html>Large $0.2000 per hour</html>'],
  ])('rejects %s', (_label, contentType, body) => {
    expect(() =>
      subject.validateOfficialPricingSourceBytesForTest({
        sourceId: 'COMPUTE_AND_DISK',
        contentType,
        bytes: bytes(body),
      })
    ).toThrow('PRICING_SOURCE_SEMANTICS_INVALID');
  });

  test('rejects unrelated same-page anchors that do not bind Large to its hourly rate', () => {
    expect(() =>
      subject.validateOfficialPricingSourceBytesForTest({
        sourceId: 'COMPUTE_AND_DISK',
        contentType: 'text/html',
        bytes: bytes(
          `<html><body>Large ${'unrelated '.repeat(
            80
          )} 0.1517 per hour</body></html>`
        ),
      })
    ).toThrow('PRICING_SOURCE_SEMANTICS_INVALID');
  });
});
