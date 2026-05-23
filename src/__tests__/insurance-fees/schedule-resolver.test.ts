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
  schedule_name: 'Judo health insurance R6 active schedule',
  schedule_status: 'active',
  source_id: 'MHLW_JUDO_HI_R6_FINAL_20240529',
  source_snapshot_hash:
    'c2797b42b9ec4558ddc4969a795fbd6e4622e45d1182ad2c02378f788a67ddd3',
} satisfies Omit<
  InsuranceFeeScheduleRecord,
  'schedule_code' | 'effective_from' | 'effective_to'
>;

const itemBase = {
  id: 'item-id',
  schedule_code: 'JUDO_HI_R6_202410_ACTIVE',
  item_name: '初検料',
  official_label: '初検料',
  category: 'visit_base',
  amount_yen: 1550,
  unit: 'visit',
  billing_scope: 'treatment_day',
  manual_amount_required: false,
  auto_calculation_allowed: true,
  source_id: 'MHLW_JUDO_HI_R6_FINAL_20240529',
  source_snapshot_hash:
    'c2797b42b9ec4558ddc4969a795fbd6e4622e45d1182ad2c02378f788a67ddd3',
  sort_order: 10,
  warning_codes_json: [],
} satisfies Omit<InsuranceFeeItemRecord, 'item_code'>;

describe('resolveInsuranceFeeSchedule', () => {
  test('uses treatment date boundaries for historical and current active schedules', () => {
    const schedules: InsuranceFeeScheduleRecord[] = [
      {
        ...scheduleBase,
        schedule_code: 'JUDO_HI_R5_202304_ACTIVE',
        effective_from: '2023-04-01',
        effective_to: '2024-09-30',
      },
      {
        ...scheduleBase,
        schedule_code: 'JUDO_HI_R6_202410_ACTIVE',
        effective_from: '2024-10-01',
        effective_to: null,
      },
    ];

    expect(
      resolveInsuranceFeeSchedule({
        schedules,
        professionType: 'judo',
        payerContextCode: 'insurance',
        treatmentDate: '2024-09-30',
      }).scheduleCode
    ).toBe('JUDO_HI_R5_202304_ACTIVE');
    expect(
      resolveInsuranceFeeSchedule({
        schedules,
        professionType: 'judo',
        payerContextCode: 'insurance',
        treatmentDate: '2024-10-01',
      }).scheduleCode
    ).toBe('JUDO_HI_R6_202410_ACTIVE');
  });

  test('ignores non-active schedules for production resolution', () => {
    expect(() =>
      resolveInsuranceFeeSchedule({
        schedules: [
          {
            ...scheduleBase,
            schedule_code: 'JUDO_HI_R8_202607_DRAFT',
            schedule_status: 'draft',
            effective_from: '2026-07-01',
            effective_to: null,
          },
        ],
        professionType: 'judo',
        payerContextCode: 'insurance',
        treatmentDate: '2026-07-01',
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
            schedule_code: 'JUDO_HI_R6_202410_ACTIVE_A',
            effective_from: '2024-10-01',
            effective_to: null,
          },
          {
            ...scheduleBase,
            schedule_code: 'JUDO_HI_R6_202410_ACTIVE_B',
            effective_from: '2024-10-01',
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
