import {
  fetchReservations,
  fetchCustomerReservations,
} from '@/app/(app)/reservations/api';

const start = new Date('2026-09-05T00:00:00Z');
const end = new Date('2026-09-05T23:59:59.999Z');
const row = (id: number) => ({
  id: String(id),
  customerId: 'patient',
  menuId: 'menu',
  staffId: 'staff',
  startTime: start.toISOString(),
  endTime: end.toISOString(),
});
const response = (ids: number[], cursor: string | null) =>
  Response.json({
    success: true,
    data: ids.map(row),
    pagination: { has_more: cursor !== null, next_cursor: cursor },
  });

describe('reservation page callers', () => {
  afterEach(() => jest.restoreAllMocks());
  it.each([0, 1, 999, 1000, 1001, 1550])(
    'only resolves a complete calendar with %i records',
    async count => {
      const expected = Array.from({ length: count }, (_, index) => index);
      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockImplementation(async input => {
          const url = new URL(String(input), 'http://localhost');
          const offset = Number(url.searchParams.get('cursor') ?? '0');
          const ids = expected.slice(offset, offset + 100);
          return response(
            ids,
            offset + ids.length < count ? String(offset + ids.length) : null
          );
        });
      const rows = await fetchReservations('clinic', start, end, 'staff');
      expect(rows.map(item => item.id)).toEqual(expected.map(String));
      for (const [url] of fetchMock.mock.calls)
        expect(String(url)).toContain('staff_id=staff');
    }
  );
  it('rejects after a middle page fails without returning partial rows', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response([1], 'next'))
      .mockResolvedValueOnce(
        Response.json({ success: false, error: 'offline' }, { status: 503 })
      );
    await expect(fetchReservations('clinic', start, end)).rejects.toThrow(
      'offline'
    );
  });
  it('rejects legacy incomplete envelopes and looping cursors', async () => {
    const mock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(Response.json({ success: true, data: [] }));
    await expect(fetchReservations('clinic', start, end)).rejects.toThrow();
    mock
      .mockResolvedValueOnce(response([1], 'next'))
      .mockResolvedValueOnce(response([2], 'next'));
    await expect(fetchReservations('clinic', start, end)).rejects.toThrow();
  });
  it('loads only one patient page and forwards its cursor and abort signal', async () => {
    const controller = new AbortController();
    const mock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response([1], 'next'));
    const result = await fetchCustomerReservations('clinic', 'patient', {
      cursor: 'previous',
      signal: controller.signal,
    });
    expect(result.nextCursor).toBe('next');
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock).toHaveBeenCalledWith(
      expect.stringContaining('cursor=previous'),
      { signal: controller.signal }
    );
  });
  it('does not continue a cancelled calendar request', async () => {
    const controller = new AbortController();
    const mock = jest.spyOn(global, 'fetch').mockImplementation(async () => {
      controller.abort();
      return response([1], 'next');
    });
    await expect(
      fetchReservations('clinic', start, end, undefined, {
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
