describe('GET /api/live', () => {
  it('reports process liveness without checking dependencies', async () => {
    const { GET } = await import('@/app/api/live/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      status: 'alive',
      timestamp: expect.any(String),
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
