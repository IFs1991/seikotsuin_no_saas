import { fetchClinicNames } from '@/lib/mobile-uiux/clinic-names';

function buildSupabase(result: { data: unknown; error: unknown } | (() => never)) {
  const resolved = typeof result === 'function' ? null : result;

  const builder = {
    select: jest.fn(() => builder),
    in: typeof result === 'function' ? jest.fn(result) : jest.fn(() => builder),
    eq: jest.fn(() => builder),
    then: (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(resolved).then(onFulfilled, onRejected),
  };

  return {
    from: jest.fn(() => builder),
    builder,
  };
}

describe('fetchClinicNames', () => {
  it('returns [] immediately without calling supabase when ids is empty', async () => {
    const supabase = buildSupabase({ data: [], error: null });

    const result = await fetchClinicNames(supabase as any, []);

    expect(result).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('returns clinic names preserving the order of clinicIds', async () => {
    const supabase = buildSupabase({
      data: [
        { id: 'clinic-2', name: 'Clinic Two' },
        { id: 'clinic-1', name: 'Clinic One' },
      ],
      error: null,
    });

    const result = await fetchClinicNames(supabase as any, [
      'clinic-1',
      'clinic-2',
    ]);

    expect(result).toEqual([
      { id: 'clinic-1', name: 'Clinic One' },
      { id: 'clinic-2', name: 'Clinic Two' },
    ]);
  });

  it('omits ids with no matching row', async () => {
    const supabase = buildSupabase({
      data: [{ id: 'clinic-1', name: 'Clinic One' }],
      error: null,
    });

    const result = await fetchClinicNames(supabase as any, [
      'clinic-1',
      'clinic-missing',
    ]);

    expect(result).toEqual([{ id: 'clinic-1', name: 'Clinic One' }]);
  });

  it('filters to active clinics like the PC accessible-clinics endpoint', async () => {
    const supabase = buildSupabase({
      data: [{ id: 'clinic-1', name: 'Clinic One' }],
      error: null,
    });

    await fetchClinicNames(supabase as any, ['clinic-1']);

    expect(supabase.builder.eq).toHaveBeenCalledWith('is_active', true);
  });

  it('returns [] on query error (fail-closed)', async () => {
    const supabase = buildSupabase({
      data: null,
      error: { code: 'PGRST500' },
    });

    const result = await fetchClinicNames(supabase as any, ['clinic-1']);

    expect(result).toEqual([]);
  });

  it('returns [] when an exception is thrown (fail-closed)', async () => {
    const supabase = buildSupabase(() => {
      throw new Error('boom');
    });

    const result = await fetchClinicNames(supabase as any, ['clinic-1']);

    expect(result).toEqual([]);
  });
});
