/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { api } from '@/lib/api-client';
import { useRevenue } from '@/hooks/useRevenue';
import type { ApiResponse, RevenueAnalysisData } from '@/types/api';

type Response = ApiResponse<RevenueAnalysisData>;
function deferred() {
  let resolve: (value: Response) => void = () => {
    throw new Error('not initialized');
  };
  let reject: (reason: Error) => void = () => {
    throw new Error('not initialized');
  };
  const promise = new Promise<Response>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function success(amount: number): Response {
  return {
    success: true,
    data: {
      dailyRevenue: amount,
      weeklyRevenue: amount,
      monthlyRevenue: amount,
      insuranceRevenue: 0,
      selfPayRevenue: amount,
      trafficAccidentRevenue: 0,
      workersCompRevenue: 0,
      productRevenue: 0,
      ticketRevenue: 0,
      patientCopayEstimated: 0,
      insurerReceivableEstimated: 0,
      privateRevenueEstimated: amount,
      trafficAccidentEstimated: 0,
      workersCompEstimated: 0,
      menuRanking: [],
      hourlyRevenue: [],
      revenueForecast: 0,
      growthRate: '0%',
      revenueTrends: [],
      costAnalysis: '',
      staffRevenueContribution: [],
      revenueContextSummary: [],
      revenueBreakdownSummary: [],
      careEpisodeMetrics: {
        totalEpisodes: 0,
        secondVisitReachedCount: 0,
        fifthVisitReachedCount: 0,
        secondVisitReachRate: 0,
        fifthVisitReachRate: 0,
        episodeContinuationRate: 0,
        averageRevenuePerEpisode: 0,
        averageVisitsPerEpisode: 0,
      },
      revenueEstimateSummary: {
        estimatedTotal: amount,
        estimateCount: 1,
        calculatedCount: 1,
        needsReviewCount: 0,
        blockedCount: 0,
        overriddenCount: 0,
        warningCount: 0,
        disclaimer: 'test',
      },
    },
  };
}

type Pending = ReturnType<typeof deferred>;
async function finish(
  request: Pending,
  outcome: 'success' | 'error' | 'reject',
  amount = 100
) {
  await act(async () => {
    if (outcome === 'reject') request.reject(new Error('late rejection'));
    else if (outcome === 'error')
      request.resolve({
        success: false,
        error: { code: 'TEST', message: 'late API error' },
      });
    else request.resolve(success(amount));
  });
}
function focus() {
  act(() => window.dispatchEvent(new Event('focus')));
}

describe('AUDIT-V2 F09 request identity in the real useRevenue hook', () => {
  let requests: Pending[];
  beforeEach(() => {
    requests = [];
    jest.spyOn(api.revenue, 'getAnalysis').mockImplementation(() => {
      const request = deferred();
      requests.push(request);
      return request.promise;
    });
  });
  afterEach(() => jest.restoreAllMocks());
  function request(index: number): Pending {
    const value = requests[index];
    if (!value) throw new Error(`Missing request ${index}`);
    return value;
  }
  function mount(clinicId = 'A', enabled = true) {
    return renderHook(
      props => useRevenue(props.clinicId, { enabled: props.enabled }),
      { initialProps: { clinicId, enabled } }
    );
  }

  it.each(['success', 'error', 'reject'] as const)(
    'ignores old A %s after B succeeds',
    async outcome => {
      const { result, rerender } = mount();
      rerender({ clinicId: 'B', enabled: true });
      await finish(request(1), 'success', 200);
      await finish(request(0), outcome);
      expect(result.current).toMatchObject({
        dailyRevenue: 200,
        loading: false,
        error: null,
      });
    }
  );

  it.each(['success', 'error', 'reject'] as const)(
    'old A %s cannot finish B loading or clear its in-flight deduplication',
    async outcome => {
      const { result, rerender } = mount();
      rerender({ clinicId: 'B', enabled: true });
      await finish(request(0), outcome);
      expect(result.current).toMatchObject({
        dailyRevenue: 0,
        loading: true,
        error: null,
      });
      focus();
      expect(api.revenue.getAnalysis).toHaveBeenCalledTimes(2);
      await finish(request(1), 'success', 200);
      expect(result.current.dailyRevenue).toBe(200);
    }
  );

  it('A→B→A accepts only the latest A even though the clinic ID repeats', async () => {
    const { result, rerender } = mount();
    rerender({ clinicId: 'B', enabled: true });
    rerender({ clinicId: 'A', enabled: true });
    await finish(request(2), 'success', 300);
    await finish(request(1), 'success', 200);
    await finish(request(0), 'success', 100);
    expect(result.current).toMatchObject({
      dailyRevenue: 300,
      loading: false,
      error: null,
    });
  });

  it.each(['success', 'error', 'reject'] as const)(
    'disabled state stays cleared after late %s and re-enabling starts a new request',
    async outcome => {
      const { result, rerender } = mount();
      rerender({ clinicId: 'A', enabled: false });
      await finish(request(0), outcome);
      expect(result.current).toMatchObject({
        dailyRevenue: 0,
        loading: false,
        error: null,
      });
      rerender({ clinicId: 'A', enabled: true });
      expect(api.revenue.getAnalysis).toHaveBeenCalledTimes(2);
      await finish(request(1), 'success', 200);
      expect(result.current.dailyRevenue).toBe(200);
    }
  );

  it('logout (empty clinic) invalidates the previous clinic response', async () => {
    const { result, rerender } = mount();
    rerender({ clinicId: '', enabled: true });
    await finish(request(0), 'success');
    expect(result.current).toMatchObject({
      dailyRevenue: 0,
      loading: false,
      error: 'clinic_idは必須です',
    });
  });

  it('keeps loaded values during a same-clinic background refresh, deduplicates focus and allows later refresh', async () => {
    const { result } = mount();
    await finish(request(0), 'success', 100);
    focus();
    focus();
    expect(api.revenue.getAnalysis).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({ dailyRevenue: 100, loading: false });
    await finish(request(1), 'reject');
    expect(result.current).toMatchObject({
      dailyRevenue: 100,
      error: null,
      loading: false,
    });
    focus();
    await finish(request(2), 'success', 300);
    expect(result.current.dailyRevenue).toBe(300);
  });

  it('unmount removes refresh listeners and late responses cannot affect a new hook', async () => {
    const previous = mount();
    previous.unmount();
    focus();
    expect(api.revenue.getAnalysis).toHaveBeenCalledTimes(1);
    const next = mount('B');
    await finish(request(0), 'reject');
    expect(next.result.current).toMatchObject({
      loading: true,
      error: null,
      dailyRevenue: 0,
    });
    await finish(request(1), 'success', 200);
    expect(next.result.current.dailyRevenue).toBe(200);
  });

  it('a stale background response cannot restore the previous clinic while B is pending', async () => {
    const { result, rerender } = mount();
    await finish(request(0), 'success', 100);
    focus();
    rerender({ clinicId: 'B', enabled: true });
    await finish(request(1), 'success', 150);
    expect(result.current).toMatchObject({
      dailyRevenue: 0,
      loading: true,
      error: null,
    });
    focus();
    expect(api.revenue.getAnalysis).toHaveBeenCalledTimes(3);
    await finish(request(2), 'success', 200);
    expect(result.current.dailyRevenue).toBe(200);
  });

  it('a synchronous transport throw cannot retain a finished in-flight request', async () => {
    jest.mocked(api.revenue.getAnalysis).mockImplementationOnce(() => {
      throw new Error('synchronous transport error');
    });
    const { result } = mount();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('収益データの取得に失敗しました');
    focus();
    expect(api.revenue.getAnalysis).toHaveBeenCalledTimes(2);
    await finish(request(0), 'success', 200);
    expect(result.current).toMatchObject({
      dailyRevenue: 200,
      loading: false,
      error: null,
    });
  });

  it('StrictMode cleanup invalidates the first request without leaving loading stuck', async () => {
    const { result } = renderHook(() => useRevenue('A'), {
      reactStrictMode: true,
    });
    expect(api.revenue.getAnalysis).toHaveBeenCalledTimes(2);
    await finish(request(0), 'success', 100);
    expect(result.current).toMatchObject({ loading: true, dailyRevenue: 0 });
    await finish(request(1), 'success', 200);
    expect(result.current).toMatchObject({ loading: false, dailyRevenue: 200 });
  });
});
