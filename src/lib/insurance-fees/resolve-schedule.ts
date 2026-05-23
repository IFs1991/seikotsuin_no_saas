import type {
  InsuranceFeePayerContextCode,
  InsuranceFeeProfessionType,
  InsuranceFeeScheduleRecord,
} from './types';

export type InsuranceFeeScheduleResolutionErrorCode =
  | 'INVALID_TREATMENT_DATE'
  | 'INVALID_SCHEDULE_DATE'
  | 'SCHEDULE_NOT_FOUND'
  | 'SCHEDULE_OVERLAP_DETECTED';

export class InsuranceFeeScheduleResolutionError extends Error {
  readonly code: InsuranceFeeScheduleResolutionErrorCode;
  readonly details: Record<string, string | number | null>;

  constructor(
    code: InsuranceFeeScheduleResolutionErrorCode,
    message: string,
    details: Record<string, string | number | null> = {}
  ) {
    super(message);
    this.name = 'InsuranceFeeScheduleResolutionError';
    this.code = code;
    this.details = details;
  }
}

export type ResolveInsuranceFeeScheduleInput = {
  schedules: readonly InsuranceFeeScheduleRecord[];
  professionType: InsuranceFeeProfessionType;
  payerContextCode: InsuranceFeePayerContextCode;
  treatmentDate: string;
};

export type ResolvedInsuranceFeeSchedule = {
  scheduleCode: string;
  professionType: InsuranceFeeProfessionType;
  payerContextCode: InsuranceFeePayerContextCode;
  effectiveFrom: string;
  effectiveTo: string | null;
  scheduleStatus: 'active';
  sourceId: string;
  sourceSnapshotHash: string | null;
};

function isValidDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function assertDateOnly(
  value: string,
  code: 'INVALID_TREATMENT_DATE' | 'INVALID_SCHEDULE_DATE',
  fieldName: string
): void {
  if (!isValidDateOnly(value)) {
    throw new InsuranceFeeScheduleResolutionError(
      code,
      `${fieldName} must be a valid YYYY-MM-DD date`,
      { fieldName, value }
    );
  }
}

function isDateWithinSchedule(
  schedule: InsuranceFeeScheduleRecord,
  treatmentDate: string
): boolean {
  assertDateOnly(
    schedule.effective_from,
    'INVALID_SCHEDULE_DATE',
    'effective_from'
  );
  if (schedule.effective_to !== null) {
    assertDateOnly(
      schedule.effective_to,
      'INVALID_SCHEDULE_DATE',
      'effective_to'
    );
  }

  return (
    schedule.effective_from <= treatmentDate &&
    (schedule.effective_to === null || treatmentDate <= schedule.effective_to)
  );
}

function toResolvedSchedule(
  schedule: InsuranceFeeScheduleRecord
): ResolvedInsuranceFeeSchedule {
  return {
    scheduleCode: schedule.schedule_code,
    professionType: schedule.profession_type,
    payerContextCode: schedule.payer_context_code,
    effectiveFrom: schedule.effective_from,
    effectiveTo: schedule.effective_to,
    scheduleStatus: 'active',
    sourceId: schedule.source_id,
    sourceSnapshotHash: schedule.source_snapshot_hash,
  };
}

export function resolveInsuranceFeeSchedule({
  schedules,
  professionType,
  payerContextCode,
  treatmentDate,
}: ResolveInsuranceFeeScheduleInput): ResolvedInsuranceFeeSchedule {
  assertDateOnly(treatmentDate, 'INVALID_TREATMENT_DATE', 'treatmentDate');

  let match: InsuranceFeeScheduleRecord | null = null;
  let matchCount = 0;

  for (const schedule of schedules) {
    if (
      schedule.schedule_status !== 'active' ||
      schedule.profession_type !== professionType ||
      schedule.payer_context_code !== payerContextCode ||
      !isDateWithinSchedule(schedule, treatmentDate)
    ) {
      continue;
    }

    match = schedule;
    matchCount += 1;

    if (matchCount > 1) {
      throw new InsuranceFeeScheduleResolutionError(
        'SCHEDULE_OVERLAP_DETECTED',
        'Multiple active insurance fee schedules match the treatment date',
        {
          professionType,
          payerContextCode,
          treatmentDate,
          matchCount,
        }
      );
    }
  }

  if (!match) {
    throw new InsuranceFeeScheduleResolutionError(
      'SCHEDULE_NOT_FOUND',
      'No active insurance fee schedule matches the treatment date',
      { professionType, payerContextCode, treatmentDate }
    );
  }

  return toResolvedSchedule(match);
}
