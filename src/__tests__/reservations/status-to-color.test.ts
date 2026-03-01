import { statusToColor } from '@/app/reservations/hooks/statusToColor';

describe('statusToColor', () => {
  it('maps unconfirmed to orange', () => {
    expect(statusToColor('unconfirmed')).toBe('orange');
  });

  it('maps confirmed to blue', () => {
    expect(statusToColor('confirmed')).toBe('blue');
  });

  it('maps arrived to purple', () => {
    expect(statusToColor('arrived')).toBe('purple');
  });

  it('maps completed to purple', () => {
    expect(statusToColor('completed')).toBe('purple');
  });

  it('maps tentative to pink', () => {
    expect(statusToColor('tentative')).toBe('pink');
  });

  it('maps trial to pink', () => {
    expect(statusToColor('trial')).toBe('pink');
  });

  it('maps cancelled to grey', () => {
    expect(statusToColor('cancelled')).toBe('grey');
  });

  it('maps no_show to grey', () => {
    expect(statusToColor('no_show')).toBe('grey');
  });

  it('falls back to red', () => {
    expect(statusToColor(undefined)).toBe('red');
  });
});
