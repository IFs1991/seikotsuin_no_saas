import boundaryCase from '../../../fixtures/insurance-fee-cases/judo_hi_202606_boundary.json';
import longTermCase from '../../../fixtures/insurance-fee-cases/judo_hi_202410_long_term.json';
import trafficAccidentCase from '../../../fixtures/insurance-fee-cases/traffic_accident_manual_required.json';
import { resolveInsuranceFeeItems } from '@/lib/insurance-fees/resolve-items';
import { resolveInsuranceFeeSchedule } from '@/lib/insurance-fees/resolve-schedule';
import {
  assertInsuranceFeePayerContextCode,
  assertInsuranceFeeProfessionType,
} from '@/lib/insurance-fees/types';

const goldenCases = [boundaryCase, longTermCase, trafficAccidentCase];

describe('insurance fee golden cases', () => {
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
