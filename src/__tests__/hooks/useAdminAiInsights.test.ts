/** @jest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react';
import {
  parseAdminAiInsights,
  useAdminAiInsights,
} from '@/hooks/useAdminAiInsights';

const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

const createJsonResponse = (payload: unknown, ok = true): Response =>
  ({
    ok,
    json: async () => payload,
  }) as unknown as Response;

describe('useAdminAiInsights', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  it('does not fetch until requested', () => {
    const { result } = renderHook(() => useAdminAiInsights());

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('fetches admin insights with period_days and stores parsed data', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        success: true,
        data: {
          summary: '横断分析です',
          insights: [
            {
              title: '売上',
              why: '伸長しています',
              action: '横展開してください',
            },
          ],
          anomalies: [],
          scope: { clinic_count: 2 },
          kpi: { total_revenue: 1000 },
        },
      })
    );

    const { result } = renderHook(() => useAdminAiInsights({ periodDays: 14 }));

    await act(async () => {
      await result.current.fetchInsights();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/admin/ai-insights?period_days=14',
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
    );
    expect(result.current.status).toBe('success');
    expect(result.current.data?.summary).toBe('横断分析です');
    expect(result.current.data?.insights?.[0]?.title).toBe('売上');
  });

  it('stores API error message on failure', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({ error: 'AI分析を利用できません' }, false)
    );

    const { result } = renderHook(() => useAdminAiInsights());

    await act(async () => {
      await result.current.fetchInsights();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.error).toBe('AI分析を利用できません');
    expect(result.current.data).toBeNull();
  });

  it('parses legacy string arrays into displayable insight items', () => {
    const parsed = parseAdminAiInsights({
      summary: 'summary',
      insights: ['売上が増加'],
      anomalies: ['患者数0の店舗があります'],
    });

    expect(parsed.insights).toEqual([
      {
        title: '売上が増加',
        why: '売上が増加',
        action: '詳細を確認してください',
      },
    ]);
    expect(parsed.anomalies).toEqual([
      {
        title: '患者数0の店舗があります',
        evidence: '患者数0の店舗があります',
        action: '詳細を確認してください',
      },
    ]);
  });
});
