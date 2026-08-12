import {
  normalizeIdentityText,
  normalizePhone,
} from '@/lib/services/patient-identity-service';

describe('patient identity normalization', () => {
  it('normalizes Japanese spacing and compatibility forms for matching', () => {
    expect(normalizeIdentityText(' 山田　太郎 ')).toBe('山田太郎');
    expect(normalizeIdentityText('ﾔﾏﾀﾞ ﾀﾛｳ')).toBe('やまだたろう');
  });

  it('normalizes domestic and +81 phone input consistently', () => {
    expect(normalizePhone('090-1234-5678')).toBe('09012345678');
    expect(normalizePhone('+81 90-1234-5678')).toBe('09012345678');
    expect(normalizePhone('')).toBeNull();
  });
});
