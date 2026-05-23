import {
  InsuranceFeeScheduleResolutionError,
  resolveInsuranceFeeSchedule,
} from '@/lib/insurance-fees/resolve-schedule';
import { resolveInsuranceFeeItems } from '@/lib/insurance-fees/resolve-items';
import type {
  InsuranceFeeItemRecord,
  InsuranceFeeScheduleRecord,
} from '@/lib/insurance-fees/types';

const scheduleBase = {
  profession_type: 'judo',
  payer_context_code: 'insurance',
  schedule_name: 'Judo health insurance schedule',
  schedule_status: 'active',
  source_id: 'judo-hi-source',
  source_snapshot_hash: 'snapshot-judo-hi',
} satisfies Omit<
  InsuranceFeeScheduleRecord,
  'schedule_code' | 'effective_from' | 'effective_to'
>;

const itemBase = {
  id: 'item-id',
  schedule_code: 'JUDO_HI_202606',
  item_name: 'Initial visit',
  official_label: 'Initial visit',
  category: 'visit',
  amount_yen: 1600,
  unit: 'visit',
  billing_scope: 'treatment_day',
  manual_amount_required: false,
  auto_calculation_allowed: true,
  source_id: 'judo-hi-source',
  source_snapshot_hash: 'snapshot-judo-hi',
  sort_order: 10,
  warning_codes_json: [],
} satisfies Omit<InsuranceFeeItemRecord, 'item_code'>;

describe('resolveInsuranceFeeSchedule', () => {
  test('uses treatment date boundaries for historical and current active schedules', () => {
    const schedules: InsuranceFeeScheduleRecord[] = [
      {
        ...scheduleBase,
        schedule_code: 'JUDO_HI_202410',
        effective_from: '2024-10-01',
        effective_to: '2026-05-31',
      },
      {
        ...scheduleBase,
        schedule_code: 'JUDO_HI_202606',
        effective_from: '2026-06-01',
        effective_to: null,
      },
    ];

    expect(
      resolveInsuranceFeeSchedule({
        schedules,
        professionType: 'judo',
        payerContextCode: 'insurance',
        treatmentDate: '2026-05-31',
      }).scheduleCode
    ).toBe('JUDO_HI_202410');
    expect(
      resolveInsuranceFeeSchedule({
        schedules,
        professionType: 'judo',
        payerContextCode: 'insurance',
        treatmentDate: '2026-06-01',
      }).scheduleCode
    ).toBe('JUDO_HI_202606');
  });

  test('ignores non-active schedules for production resolution', () => {
    expect(() =>
      resolveInsuranceFeeSchedule({
        schedules: [
          {
            ...scheduleBase,
            schedule_code: 'JUDO_HI_DRAFT',
            schedule_status: 'draft',
            effective_from: '2026-06-01',
            effective_to: null,
          },
        ],
        professionType: 'judo',
        payerContextCode: 'insurance',
        treatmentDate: '2026-06-01',
      })
    ).toThrow(
      expect.objectContaining({
        code: 'SCHEDULE_NOT_FOUND',
      })
    );
  });

  test('throws a typed not found error when no active schedule matches', () => {
    expect(() =>
      resolveInsuranceFeeSchedule({
        schedules: [],
        professionType: 'judo',
        payerContextCode: 'insurance',
        treatmentDate: '2026-06-01',
      })
    ).toThrow(InsuranceFeeScheduleResolutionError);
  });

  test('throws when more than one active schedule overlaps', () => {
    expect(() =>
      resolveInsuranceFeeSchedule({
        schedules: [
          {
            ...scheduleBase,
            schedule_code: 'JUDO_HI_202606_A',
            effective_from: '2026-06-01',
            effective_to: null,
          },
          {
            ...scheduleBase,
            schedule_code: 'JUDO_HI_202606_B',
            effective_from: '2026-06-01',
            effective_to: null,
          },
        ],
        professionType: 'judo',
        payerContextCode: 'insurance',
        treatmentDate: '2026-06-01',
      })
    ).toThrow(
      expect.objectContaining({
        code: 'SCHEDULE_OVERLAP_DETECTED',
      })
    );
  });
});

describe('resolveInsuranceFeeItems', () => {
  test('keeps traffic accident items manual and never exposes automatic amounts', () => {
    const schedule = resolveInsuranceFeeSchedule({
      schedules: [
        {
          ...scheduleBase,
          schedule_code: 'TRAFFIC_ACCIDENT_JUDO_202606',
          payer_context_code: 'traffic_accident',
          effective_from: '2026-06-01',
          effective_to: null,
        },
      ],
      professionType: 'judo',
      payerContextCode: 'traffic_accident',
      treatmentDate: '2026-06-01',
    });

    const items = resolveInsuranceFeeItems({
      schedule,
      items: [
        {
          ...itemBase,
          schedule_code: schedule.scheduleCode,
          item_code: 'TRAFFIC_MANUAL',
          amount_yen: null,
          manual_amount_required: true,
          auto_calculation_allowed: false,
        },
        {
          ...itemBase,
          id: 'invalid-auto-item',
          schedule_code: schedule.scheduleCode,
          item_code: 'TRAFFIC_AUTO_FORBIDDEN',
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      itemCode: 'TRAFFIC_MANUAL',
      amountYen: null,
      manualAmountRequired: true,
      autoCalculationAllowed: false,
    });
  });
});
