import { validateInsuranceFeeMaster } from '@/lib/insurance-fees/validate-master';
import type {
  InsuranceFeeItemRecord,
  InsuranceFeeScheduleRecord,
} from '@/lib/insurance-fees/types';

const activeSchedule = {
  schedule_code: 'JUDO_HI_202606',
  profession_type: 'judo',
  payer_context_code: 'insurance',
  schedule_name: 'Judo health insurance schedule',
  effective_from: '2026-06-01',
  effective_to: null,
  schedule_status: 'active',
  source_id: 'judo-hi-source',
  source_snapshot_hash: 'snapshot-judo-hi',
} satisfies InsuranceFeeScheduleRecord;

const activeItem = {
  id: 'judo-init',
  schedule_code: activeSchedule.schedule_code,
  item_code: 'JUDO_INIT',
  item_name: 'Initial visit',
  official_label: 'Initial visit',
  category: 'visit',
  amount_yen: 1600,
  unit: 'visit',
  billing_scope: 'treatment_day',
  manual_amount_required: false,
  auto_calculation_allowed: true,
  source_id: activeSchedule.source_id,
  source_snapshot_hash: activeSchedule.source_snapshot_hash,
  sort_order: 10,
  warning_codes_json: ['FREQUENT_VISIT_REVIEW'],
} satisfies InsuranceFeeItemRecord;

describe('validateInsuranceFeeMaster', () => {
  test('accepts active schedules with snapshots, warning definitions, and active golden cases', () => {
    const result = validateInsuranceFeeMaster({
      schedules: [activeSchedule],
      items: [activeItem],
      sourceSnapshots: [
        {
          source_id: activeSchedule.source_id,
          content_hash: activeSchedule.source_snapshot_hash,
        },
      ],
      warningDefinitions: [{ warning_code: 'FREQUENT_VISIT_REVIEW' }],
      goldenCases: [
        {
          caseName: 'judo initial visit',
          expectedScheduleCode: activeSchedule.schedule_code,
        },
      ],
    });

    expect(result).toEqual({ issues: [] });
  });

  test('reports corrupt active master data before it reaches estimation flows', () => {
    const trafficSchedule: InsuranceFeeScheduleRecord = {
      ...activeSchedule,
      schedule_code: 'TRAFFIC_ACCIDENT_JUDO_202606',
      payer_context_code: 'traffic_accident',
      source_snapshot_hash: null,
    };
    const duplicateSchedule: InsuranceFeeScheduleRecord = {
      ...activeSchedule,
      schedule_code: 'JUDO_HI_202606_OVERLAP',
    };
    const draftSchedule: InsuranceFeeScheduleRecord = {
      ...activeSchedule,
      schedule_code: 'JUDO_HI_DRAFT',
      schedule_status: 'draft',
    };
    const result = validateInsuranceFeeMaster({
      schedules: [
        activeSchedule,
        duplicateSchedule,
        trafficSchedule,
        draftSchedule,
      ],
      items: [
        activeItem,
        {
          ...activeItem,
          id: 'traffic-auto',
          schedule_code: trafficSchedule.schedule_code,
          item_code: 'TRAFFIC_AUTO',
          warning_codes_json: ['MISSING_WARNING'],
        },
      ],
      sourceSnapshots: [],
      warningDefinitions: [],
      goldenCases: [
        {
          caseName: 'draft fixture',
          expectedScheduleCode: draftSchedule.schedule_code,
        },
      ],
    });

    expect(result.issues.map(issue => issue.code)).toEqual(
      expect.arrayContaining([
        'ACTIVE_SCHEDULE_OVERLAP',
        'ACTIVE_SCHEDULE_SNAPSHOT_REQUIRED',
        'ACTIVE_SCHEDULE_SNAPSHOT_NOT_FOUND',
        'TRAFFIC_ACCIDENT_AMOUNT_FORBIDDEN',
        'TRAFFIC_ACCIDENT_MANUAL_AMOUNT_REQUIRED',
        'TRAFFIC_ACCIDENT_AUTO_CALCULATION_FORBIDDEN',
        'WARNING_CODE_NOT_DEFINED',
        'GOLDEN_CASE_NON_ACTIVE_SCHEDULE',
      ])
    );
  });
});
