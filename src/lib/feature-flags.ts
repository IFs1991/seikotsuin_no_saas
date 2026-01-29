export function isMockEnabled(): boolean {
  if (typeof process === 'undefined') return false;
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.NEXT_PUBLIC_ENABLE_MOCKS === 'true';
}
