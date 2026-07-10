import { NextRequest } from 'next/server';

const ensureClinicAccessMock = jest.fn();

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: ensureClinicAccessMock,
}));

describe('GET /api/ai-insights feature flag', () => {
  const originalFlag = process.env.NEXT_PUBLIC_ENABLE_AI_INSIGHTS;

  afterEach(() => {
    ensureClinicAccessMock.mockReset();
    if (originalFlag === undefined) {
      delete process.env.NEXT_PUBLIC_ENABLE_AI_INSIGHTS;
    } else {
      process.env.NEXT_PUBLIC_ENABLE_AI_INSIGHTS = originalFlag;
    }
  });

  it('flag が無効なら認証や集計処理を開始せず404を返す', async () => {
    process.env.NEXT_PUBLIC_ENABLE_AI_INSIGHTS = 'false';
    const { GET } = await import('@/app/api/ai-insights/route');

    const response = await GET(
      new NextRequest(
        'http://localhost/api/ai-insights?clinic_id=clinic-1&period_days=30'
      )
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      error: 'AIインサイトは現在利用できません',
    });
    expect(ensureClinicAccessMock).not.toHaveBeenCalled();
  });
});
