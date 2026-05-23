import {
  parseInsuranceFeeWarningCodes,
  type InsuranceFeeItemRecord,
  type InsuranceFeeScheduleRecord,
  type InsuranceFeeSourceSnapshotRecord,
  type InsuranceFeeWarningDefinitionRecord,
} from './types';

export type InsuranceFeeGoldenCaseScheduleExpectation = {
  caseName: string;
  expectedScheduleCode: string;
};

export type InsuranceFeeMasterValidationInput = {
  schedules: readonly InsuranceFeeScheduleRecord[];
  items: readonly InsuranceFeeItemRecord[];
  sourceSnapshots: readonly InsuranceFeeSourceSnapshotRecord[];
  warningDefinitions: readonly InsuranceFeeWarningDefinitionRecord[];
  goldenCases?: readonly InsuranceFeeGoldenCaseScheduleExpectation[];
};

export type InsuranceFeeMasterValidationIssueCode =
  | 'ACTIVE_SCHEDULE_OVERLAP'
  | 'ACTIVE_SCHEDULE_SNAPSHOT_REQUIRED'
  | 'ACTIVE_SCHEDULE_SNAPSHOT_NOT_FOUND'
  | 'GOLDEN_CASE_NON_ACTIVE_SCHEDULE'
  | 'GOLDEN_CASE_SCHEDULE_NOT_FOUND'
  | 'ITEM_DUPLICATE'
  | 'MANUAL_AMOUNT_SHAPE_INVALID'
  | 'TRAFFIC_ACCIDENT_AMOUNT_FORBIDDEN'
  | 'TRAFFIC_ACCIDENT_AUTO_CALCULATION_FORBIDDEN'
  | 'TRAFFIC_ACCIDENT_MANUAL_AMOUNT_REQUIRED'
  | 'WARNING_CODE_MALFORMED'
  | 'WARNING_CODE_NOT_DEFINED';

export type InsuranceFeeMasterValidationIssue = {
  code: InsuranceFeeMasterValidationIssueCode;
  message: string;
  scheduleCode?: string;
  itemCode?: string;
  warningCode?: string;
  caseName?: string;
};

export type InsuranceFeeMasterValidationResult = {
  issues: InsuranceFeeMasterValidationIssue[];
};

type ScheduleByCode = Map<string, InsuranceFeeScheduleRecord>;

function overlaps(
  left: InsuranceFeeScheduleRecord,
  right: InsuranceFeeScheduleRecord
): boolean {
  const leftEnd = left.effective_to ?? '9999-12-31';
  const rightEnd = right.effective_to ?? '9999-12-31';
  return left.effective_from <= rightEnd && right.effective_from <= leftEnd;
}

function snapshotKey(sourceId: string, contentHash: string): string {
  return `${sourceId}\u0000${contentHash}`;
}

function getScheduleByCode(
  schedules: readonly InsuranceFeeScheduleRecord[]
): Map<string, InsuranceFeeScheduleRecord> {
  const scheduleByCode = new Map<string, InsuranceFeeScheduleRecord>();
  for (const schedule of schedules) {
    scheduleByCode.set(schedule.schedule_code, schedule);
  }
  return scheduleByCode;
}

function pushIssue(
  issues: InsuranceFeeMasterValidationIssue[],
  issue: InsuranceFeeMasterValidationIssue
): void {
  issues.push(issue);
}

function validateActiveScheduleOverlap(
  schedules: readonly InsuranceFeeScheduleRecord[],
  issues: InsuranceFeeMasterValidationIssue[]
): void {
  const schedulesByResolverKey = new Map<
    string,
    InsuranceFeeScheduleRecord[]
  >();
  for (const schedule of schedules) {
    if (schedule.schedule_status !== 'active') {
      continue;
    }

    const resolverKey = `${schedule.profession_type}\u0000${schedule.payer_context_code}`;
    const groupedSchedules = schedulesByResolverKey.get(resolverKey);
    if (groupedSchedules) {
      groupedSchedules.push(schedule);
    } else {
      schedulesByResolverKey.set(resolverKey, [schedule]);
    }
  }

  for (const activeSchedules of schedulesByResolverKey.values()) {
    activeSchedules.sort((left, right) => {
      const startOrder = left.effective_from.localeCompare(
        right.effective_from
      );
      return startOrder === 0
        ? left.schedule_code.localeCompare(right.schedule_code)
        : startOrder;
    });

    for (let index = 1; index < activeSchedules.length; index += 1) {
      const previous = activeSchedules[index - 1];
      const current = activeSchedules[index];
      if (previous && current && overlaps(previous, current)) {
        pushIssue(issues, {
          code: 'ACTIVE_SCHEDULE_OVERLAP',
          message:
            'Active insurance fee schedules overlap for the same profession and payer context.',
          scheduleCode: previous.schedule_code,
        });
      }
    }
  }
}

function validateActiveScheduleSnapshots(
  schedules: readonly InsuranceFeeScheduleRecord[],
  sourceSnapshots: readonly InsuranceFeeSourceSnapshotRecord[],
  issues: InsuranceFeeMasterValidationIssue[]
): void {
  const snapshotKeys = new Set<string>();
  for (const snapshot of sourceSnapshots) {
    if (snapshot.content_hash !== null) {
      snapshotKeys.add(snapshotKey(snapshot.source_id, snapshot.content_hash));
    }
  }

  for (const schedule of schedules) {
    if (schedule.schedule_status !== 'active') {
      continue;
    }

    if (schedule.source_snapshot_hash === null) {
      pushIssue(issues, {
        code: 'ACTIVE_SCHEDULE_SNAPSHOT_REQUIRED',
        message: 'Active insurance fee schedule must retain a source snapshot.',
        scheduleCode: schedule.schedule_code,
      });
      continue;
    }

    if (
      !snapshotKeys.has(
        snapshotKey(schedule.source_id, schedule.source_snapshot_hash)
      )
    ) {
      pushIssue(issues, {
        code: 'ACTIVE_SCHEDULE_SNAPSHOT_NOT_FOUND',
        message:
          'Active insurance fee schedule references a missing source snapshot.',
        scheduleCode: schedule.schedule_code,
      });
    }
  }
}

function validateItems(
  scheduleByCode: ScheduleByCode,
  items: readonly InsuranceFeeItemRecord[],
  warningDefinitions: readonly InsuranceFeeWarningDefinitionRecord[],
  issues: InsuranceFeeMasterValidationIssue[]
): void {
  const itemKeys = new Set<string>();
  const warningCodes = new Set<string>();

  for (const definition of warningDefinitions) {
    if (definition.is_active !== false) {
      warningCodes.add(definition.warning_code);
    }
  }

  for (const item of items) {
    const itemKey = `${item.schedule_code}\u0000${item.item_code}`;
    if (itemKeys.has(itemKey)) {
      pushIssue(issues, {
        code: 'ITEM_DUPLICATE',
        message: 'Duplicate insurance fee item code within a schedule.',
        scheduleCode: item.schedule_code,
        itemCode: item.item_code,
      });
    }
    itemKeys.add(itemKey);

    if (
      item.manual_amount_required &&
      (item.amount_yen !== null || item.auto_calculation_allowed)
    ) {
      pushIssue(issues, {
        code: 'MANUAL_AMOUNT_SHAPE_INVALID',
        message:
          'Manual insurance fee item must not expose an amount or auto-calculation path.',
        scheduleCode: item.schedule_code,
        itemCode: item.item_code,
      });
    }

    const schedule = scheduleByCode.get(item.schedule_code);
    if (schedule?.payer_context_code === 'traffic_accident') {
      if (item.amount_yen !== null) {
        pushIssue(issues, {
          code: 'TRAFFIC_ACCIDENT_AMOUNT_FORBIDDEN',
          message:
            'Traffic accident item must not expose a master-derived amount.',
          scheduleCode: item.schedule_code,
          itemCode: item.item_code,
        });
      }

      if (!item.manual_amount_required) {
        pushIssue(issues, {
          code: 'TRAFFIC_ACCIDENT_MANUAL_AMOUNT_REQUIRED',
          message: 'Traffic accident item must require a manual amount.',
          scheduleCode: item.schedule_code,
          itemCode: item.item_code,
        });
      }

      if (item.auto_calculation_allowed) {
        pushIssue(issues, {
          code: 'TRAFFIC_ACCIDENT_AUTO_CALCULATION_FORBIDDEN',
          message: 'Traffic accident item must disable auto-calculation.',
          scheduleCode: item.schedule_code,
          itemCode: item.item_code,
        });
      }
    }

    const parsedWarningCodes = parseInsuranceFeeWarningCodes(
      item.warning_codes_json
    );
    if (parsedWarningCodes === null) {
      pushIssue(issues, {
        code: 'WARNING_CODE_MALFORMED',
        message: 'Item warning codes must be an array of strings.',
        scheduleCode: item.schedule_code,
        itemCode: item.item_code,
      });
      continue;
    }

    for (const warningCode of parsedWarningCodes) {
      if (!warningCodes.has(warningCode)) {
        pushIssue(issues, {
          code: 'WARNING_CODE_NOT_DEFINED',
          message: 'Item warning code is not defined in the warning master.',
          scheduleCode: item.schedule_code,
          itemCode: item.item_code,
          warningCode,
        });
      }
    }
  }
}

function validateGoldenCases(
  scheduleByCode: ScheduleByCode,
  goldenCases: readonly InsuranceFeeGoldenCaseScheduleExpectation[],
  issues: InsuranceFeeMasterValidationIssue[]
): void {
  for (const goldenCase of goldenCases) {
    const schedule = scheduleByCode.get(goldenCase.expectedScheduleCode);
    if (!schedule) {
      pushIssue(issues, {
        code: 'GOLDEN_CASE_SCHEDULE_NOT_FOUND',
        message: 'Golden case references a missing schedule.',
        scheduleCode: goldenCase.expectedScheduleCode,
        caseName: goldenCase.caseName,
      });
      continue;
    }

    if (schedule.schedule_status !== 'active') {
      pushIssue(issues, {
        code: 'GOLDEN_CASE_NON_ACTIVE_SCHEDULE',
        message: 'Golden case must not resolve to a non-active schedule.',
        scheduleCode: schedule.schedule_code,
        caseName: goldenCase.caseName,
      });
    }
  }
}

export function validateInsuranceFeeMaster({
  schedules,
  items,
  sourceSnapshots,
  warningDefinitions,
  goldenCases = [],
}: InsuranceFeeMasterValidationInput): InsuranceFeeMasterValidationResult {
  const issues: InsuranceFeeMasterValidationIssue[] = [];
  const scheduleByCode = getScheduleByCode(schedules);

  validateActiveScheduleOverlap(schedules, issues);
  validateActiveScheduleSnapshots(schedules, sourceSnapshots, issues);
  validateItems(scheduleByCode, items, warningDefinitions, issues);
  validateGoldenCases(scheduleByCode, goldenCases, issues);

  return { issues };
}
