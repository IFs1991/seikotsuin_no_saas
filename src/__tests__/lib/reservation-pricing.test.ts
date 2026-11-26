import {
  buildReservationPricingSnapshot,
  normalizeDtoSelectedOptions,
  normalizePriceAmount,
} from '@/lib/reservations/pricing';

describe('reservation pricing', () => {
  it.each([
    [null, 0],
    [undefined, 0],
    [NaN, 0],
    [Infinity, 0],
    [-Infinity, 0],
    [0, 0],
    [-12.75, -12.75],
    [1.125, 1.125],
  ] as const)('normalizes a stored amount %p to %p', (amount, expected) => {
    expect(normalizePriceAmount(amount)).toBe(expected);
  });

  it('fills only missing DTO fields and keeps option order', () => {
    expect(normalizeDtoSelectedOptions(undefined)).toEqual([]);
    expect(
      normalizeDtoSelectedOptions([
        {},
        { name: '延長', priceDelta: -1.25, durationDeltaMinutes: 5 },
      ])
    ).toEqual([
      { optionId: '', name: '', priceDelta: 0, durationDeltaMinutes: 0 },
      {
        optionId: '',
        name: '延長',
        priceDelta: -1.25,
        durationDeltaMinutes: 5,
      },
    ]);
  });

  it.each([
    {
      requested: false,
      menu: 800,
      fee: 100,
      deltas: [],
      savedFee: 0,
      price: 800,
    },
    {
      requested: true,
      menu: 800,
      fee: 100,
      deltas: [],
      savedFee: 100,
      price: 900,
    },
    {
      requested: true,
      menu: -10.5,
      fee: -2.25,
      deltas: [1.25, -2.75],
      savedFee: -2.25,
      price: -14.25,
    },
    {
      requested: false,
      menu: 1.125,
      fee: 300,
      deltas: [NaN, 2.5, Infinity, -Infinity],
      savedFee: 0,
      price: 3.625,
    },
    {
      requested: true,
      menu: Infinity,
      fee: NaN,
      deltas: [-2.5],
      savedFee: 0,
      price: -2.5,
    },
  ])(
    'saves price $price and nomination fee $savedFee',
    ({ requested, menu, fee, deltas, savedFee, price }) => {
      const selectedOptions = normalizeDtoSelectedOptions(
        deltas.map(priceDelta => ({ priceDelta }))
      );
      expect(
        buildReservationPricingSnapshot({
          isStaffRequested: requested,
          menuPrice: menu,
          staffNominationFee: fee,
          selectedOptions,
        })
      ).toEqual({
        isStaffRequested: requested,
        staffNominationFee: savedFee,
        price,
      });
    }
  );
});
