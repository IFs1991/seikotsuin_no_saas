import { renderHook } from '@testing-library/react';
import { usePatientAnalysis } from '@/hooks/usePatientAnalysis';

// Mock API calls
jest.mock('@/lib/api-client');

describe('usePatientAnalysis', () => {
  test('should return initial data structure', async () => {
    const { result } = renderHook(() => usePatientAnalysis());

    expect(result.current).toEqual({
      conversionData: expect.any(Object),
      visitCounts: expect.any(Object),
      riskScores: expect.any(Array),
      ltvRanking: expect.any(Array),
      segmentData: expect.any(Object),
      reservations: expect.any(Array),
      satisfactionCorrelation: expect.any(Object),
      followUpList: expect.any(Array)
    });
  });

  test('should provide conversion funnel data', () => {
    const { result } = renderHook(() => usePatientAnalysis());

    expect(result.current.conversionData.stages).toBeDefined();
    expect(Array.isArray(result.current.conversionData.stages)).toBe(true);
  });

  test('should provide visit counts with monthly change', () => {
    const { result } = renderHook(() => usePatientAnalysis());

    expect(result.current.visitCounts.average).toBeDefined();
    expect(result.current.visitCounts.monthlyChange).toBeDefined();
    expect(typeof result.current.visitCounts.average).toBe('number');
    expect(typeof result.current.visitCounts.monthlyChange).toBe('number');
  });

  test('should provide risk scores array', () => {
    const { result } = renderHook(() => usePatientAnalysis());

    expect(Array.isArray(result.current.riskScores)).toBe(true);
  });

  test('should provide LTV ranking array', () => {
    const { result } = renderHook(() => usePatientAnalysis());

    expect(Array.isArray(result.current.ltvRanking)).toBe(true);
  });

  test('should provide segment data object', () => {
    const { result } = renderHook(() => usePatientAnalysis());

    expect(result.current.segmentData).toBeDefined();
    expect(typeof result.current.segmentData).toBe('object');
  });

  test('should provide follow up list array', () => {
    const { result } = renderHook(() => usePatientAnalysis());

    expect(Array.isArray(result.current.followUpList)).toBe(true);
  });
});