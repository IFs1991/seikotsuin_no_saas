import { resolveStaffDisplayName } from '@/lib/mobile-uiux/identity';

function buildSupabase(result: { data: unknown; error: unknown } | (() => never)) {
  const maybeSingle =
    typeof result === 'function'
      ? jest.fn(result)
      : jest.fn(async () => result);

  const builder = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    maybeSingle,
  };

  return {
    from: jest.fn(() => builder),
    builder,
  };
}

describe('resolveStaffDisplayName', () => {
  it('returns the display name when a row is found', async () => {
    const supabase = buildSupabase({
      data: { display_name: 'Yamada Taro', is_active: true },
      error: null,
    });

    const result = await resolveStaffDisplayName(supabase as any, 'user-1');

    expect(result).toBe('Yamada Taro');
    expect(supabase.from).toHaveBeenCalledWith('staff_profiles');
  });

  it('returns null when no row is found', async () => {
    const supabase = buildSupabase({ data: null, error: null });

    const result = await resolveStaffDisplayName(supabase as any, 'user-1');

    expect(result).toBeNull();
  });

  it('returns null when the query errors (fail-closed)', async () => {
    const supabase = buildSupabase({
      data: null,
      error: { code: 'PGRST500' },
    });

    const result = await resolveStaffDisplayName(supabase as any, 'user-1');

    expect(result).toBeNull();
  });

  it('returns null when an exception is thrown (fail-closed)', async () => {
    const supabase = buildSupabase(() => {
      throw new Error('boom');
    });

    const result = await resolveStaffDisplayName(supabase as any, 'user-1');

    expect(result).toBeNull();
  });
});
