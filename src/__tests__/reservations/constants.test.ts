import { COLORS_LEFT_BORDER } from '@/app/reservations/constants';

describe('COLORS_LEFT_BORDER', () => {
  const colorKeys = ['red', 'pink', 'blue', 'orange', 'purple', 'grey'];

  it.each(colorKeys)('%s includes left border class', color => {
    expect(COLORS_LEFT_BORDER[color]).toContain('border-l-4');
  });

  it('returns undefined for unknown key', () => {
    expect(COLORS_LEFT_BORDER.unknown).toBeUndefined();
  });
});
