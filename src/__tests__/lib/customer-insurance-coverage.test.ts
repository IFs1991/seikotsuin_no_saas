import {
  resolveCurrentCustomerInsuranceCoverage,
  type CustomerInsuranceCoverageRecord,
} from '@/lib/customer-insurance-coverage';

const baseCoverage: CustomerInsuranceCoverageRecord = {
  id: 'coverage-1',
  clinicId: 'clinic-1',
  customerId: 'customer-1',
  patientBurdenRate: 30,
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  verificationStatus: 'confirmed',
  verifiedAt: '2026-01-01T00:00:00.000Z',
};

describe('resolveCurrentCustomerInsuranceCoverage', () => {
  test('returns the confirmed coverage active on the treatment date', () => {
    const result = resolveCurrentCustomerInsuranceCoverage(
      [baseCoverage],
      '2026-05-25'
    );

    expect(result).toMatchObject({
      status: 'resolved',
      source: 'customer_default',
      patientBurdenRate: 30,
      coverage: { id: 'coverage-1' },
    });
  });

  test('does not use expired coverage as the current default', () => {
    const result = resolveCurrentCustomerInsuranceCoverage(
      [{ ...baseCoverage, effectiveTo: '2026-03-31' }],
      '2026-05-25'
    );

    expect(result).toMatchObject({
      status: 'needs_review',
      source: 'missing',
      previous: [{ id: 'coverage-1' }],
    });
  });

  test('does not use needs_review coverage as the current default', () => {
    const result = resolveCurrentCustomerInsuranceCoverage(
      [{ ...baseCoverage, verificationStatus: 'needs_review' }],
      '2026-05-25'
    );

    expect(result).toMatchObject({
      status: 'needs_review',
      source: 'missing',
    });
  });

  test('flags overlapping confirmed current coverage as ambiguous', () => {
    const result = resolveCurrentCustomerInsuranceCoverage(
      [
        baseCoverage,
        {
          ...baseCoverage,
          id: 'coverage-2',
          patientBurdenRate: 10,
          effectiveFrom: '2026-04-01',
        },
      ],
      '2026-05-25'
    );

    expect(result).toMatchObject({
      status: 'needs_review',
      source: 'ambiguous',
      previous: [{ id: 'coverage-2' }, { id: 'coverage-1' }],
    });
  });
});
