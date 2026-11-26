import type { ReservationOptionSelection } from '@/types/reservation';

export type ReservationPricingSnapshot = {
  isStaffRequested: boolean;
  staffNominationFee: number;
  price: number;
};

export function normalizePriceAmount(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function getSelectedOptionsPriceDelta(
  selectedOptions: readonly ReservationOptionSelection[]
): number {
  return selectedOptions.reduce(
    (sum, option) => sum + normalizePriceAmount(option.priceDelta),
    0
  );
}

export function normalizeDtoSelectedOptions(
  selectedOptions: readonly Partial<ReservationOptionSelection>[] | undefined
): ReservationOptionSelection[] {
  return (selectedOptions ?? []).map(option => ({
    optionId: option.optionId ?? '',
    name: option.name ?? '',
    priceDelta: option.priceDelta ?? 0,
    durationDeltaMinutes: option.durationDeltaMinutes ?? 0,
  }));
}

export function buildReservationPricingSnapshot(params: {
  isStaffRequested: boolean;
  menuPrice: number;
  staffNominationFee: number;
  selectedOptions: readonly ReservationOptionSelection[];
}): ReservationPricingSnapshot {
  const staffNominationFee = params.isStaffRequested
    ? normalizePriceAmount(params.staffNominationFee)
    : 0;

  return {
    isStaffRequested: params.isStaffRequested,
    staffNominationFee,
    price:
      normalizePriceAmount(params.menuPrice) +
      getSelectedOptionsPriceDelta(params.selectedOptions) +
      staffNominationFee,
  };
}
