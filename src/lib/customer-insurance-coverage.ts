export const PATIENT_BURDEN_RATES = [0, 10, 20, 30] as const;

export type PatientBurdenRate = (typeof PATIENT_BURDEN_RATES)[number];

export type CoverageVerificationStatus =
  | 'confirmed'
  | 'needs_review'
  | 'expired'
  | 'inactive';

export type CustomerInsuranceCoverageRecord = {
  id: string;
  clinicId: string;
  customerId: string;
  patientBurdenRate: PatientBurdenRate;
  effectiveFrom: string;
  effectiveTo: string | null;
  verificationStatus: CoverageVerificationStatus;
  verifiedAt: string | null;
};

export type CustomerInsuranceCoverageResolution =
  | {
      status: 'resolved';
      source: 'customer_default';
      coverage: CustomerInsuranceCoverageRecord;
      patientBurdenRate: PatientBurdenRate;
    }
  | {
      status: 'needs_review';
      source: 'missing' | 'ambiguous';
      message: string;
      previous: CustomerInsuranceCoverageRecord[];
    };

function isDateWithinRange(
  treatmentDate: string,
  effectiveFrom: string,
  effectiveTo: string | null
): boolean {
  return (
    effectiveFrom <= treatmentDate &&
    (effectiveTo === null || effectiveTo >= treatmentDate)
  );
}

export function isPatientBurdenRate(value: number): value is PatientBurdenRate {
  return PATIENT_BURDEN_RATES.some(rate => rate === value);
}

export function isCoverageVerificationStatus(
  value: string
): value is CoverageVerificationStatus {
  return (
    value === 'confirmed' ||
    value === 'needs_review' ||
    value === 'expired' ||
    value === 'inactive'
  );
}

export function resolveCurrentCustomerInsuranceCoverage(
  coverages: readonly CustomerInsuranceCoverageRecord[],
  treatmentDate: string
): CustomerInsuranceCoverageResolution {
  const confirmedCurrent = coverages
    .filter(
      coverage =>
        coverage.verificationStatus === 'confirmed' &&
        isDateWithinRange(
          treatmentDate,
          coverage.effectiveFrom,
          coverage.effectiveTo
        )
    )
    .sort((left, right) =>
      right.effectiveFrom.localeCompare(left.effectiveFrom)
    );

  if (confirmedCurrent.length === 1) {
    const coverage = confirmedCurrent[0];
    return {
      status: 'resolved',
      source: 'customer_default',
      coverage,
      patientBurdenRate: coverage.patientBurdenRate,
    };
  }

  if (confirmedCurrent.length > 1) {
    return {
      status: 'needs_review',
      source: 'ambiguous',
      message: '同日に有効な確認済み保険設定が複数あります',
      previous: confirmedCurrent,
    };
  }

  const previous = coverages
    .filter(coverage => coverage.effectiveFrom <= treatmentDate)
    .sort((left, right) =>
      right.effectiveFrom.localeCompare(left.effectiveFrom)
    );

  return {
    status: 'needs_review',
    source: 'missing',
    message: '有効な確認済み保険設定がありません',
    previous,
  };
}
