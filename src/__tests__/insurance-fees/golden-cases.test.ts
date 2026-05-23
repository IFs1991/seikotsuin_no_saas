import boundaryCase from '../../../fixtures/insurance-fee-cases/judo_hi_202606_boundary.json';
import longTermCase from '../../../fixtures/insurance-fee-cases/judo_hi_202410_long_term.json';
import currentOfficialCase from '../../../fixtures/insurance-fee-cases/judo_hi_r6_current_official.json';
import trafficAccidentCase from '../../../fixtures/insurance-fee-cases/traffic_accident_manual_required.json';
import { resolveInsuranceFeeItems } from '@/lib/insurance-fees/resolve-items';
import { resolveInsuranceFeeSchedule } from '@/lib/insurance-fees/resolve-schedule';
import {
  assertInsuranceFeePayerContextCode,
  assertInsuranceFeeProfessionType,
} from '@/lib/insurance-fees/types';

const goldenCases = [
  currentOfficialCase,
  boundaryCase,
  longTermCase,
  trafficAccidentCase,
];

describe('insurance fee golden cases', () => {
  test('does not retain the rejected 2026-06 active boundary assumption', () => {
    const boundaryCaseJson = JSON.stringify(boundaryCase);

    expect(boundaryCaseJson).not.toContain('JUDO_HI_202606');
    expect(boundaryCaseJson).not.toContain('"effective_from":"2026-06-01"');
    expect(boundaryCaseJson).not.toContain('"amount_yen":1600');
    expect(boundaryCase.expected.scheduleCode).toBe(
      'JUDO_HI_R6_202410_ACTIVE'
    );
  });

  test.each(goldenCases)('$caseName', goldenCase => {
    const professionType = assertInsuranceFeeProfessionType(
      goldenCase.professionType
    );
    const payerContextCode = assertInsuranceFeePayerContextCode(
      goldenCase.payerContextCode
    );
    const schedule = resolveInsuranceFeeSchedule({
      schedules: goldenCase.schedules,
      professionType,
      payerContextCode,
      treatmentDate: goldenCase.treatmentDate,
    });
    const items = resolveInsuranceFeeItems({
      schedule,
      items: goldenCase.items,
    });

    expect(schedule.scheduleCode).toBe(goldenCase.expected.scheduleCode);
    expect(
      items.map(item => ({
        itemCode: item.itemCode,
        amountYen: item.amountYen,
      }))
    ).toEqual(goldenCase.expected.items);
    expect(items.flatMap(item => item.warningCodes)).toEqual(
      goldenCase.expected.warningCodes
    );
  });
});
