'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AdminAiInsights {
  summary?: string | null;
  insights?: AdminAiInsightItem[] | null;
  anomalies?: AdminAiAnomalyItem[] | null;
  scope?: Record<string, unknown> | null;
  kpi?: Record<string, unknown> | null;
}

export type AdminAiInsightsStatus = 'idle' | 'loading' | 'success' | 'error';

export interface AdminAiInsightItem {
  title: string;
  why: string;
  action: string;
  impact?: string;
}

export interface AdminAiAnomalyItem {
  title: string;
  evidence: string;
  action: string;
}

interface AdminAiInsightsState {
  data: AdminAiInsights | null;
  status: AdminAiInsightsStatus;
  error: string | null;
}

interface UseAdminAiInsightsOptions {
  periodDays?: number;
}

const DEFAULT_PERIOD_DAYS = 30;
const ADMIN_AI_INSIGHTS_ERROR = 'AI分析の取得に失敗しました';

export function useAdminAiInsights({
  periodDays = DEFAULT_PERIOD_DAYS,
}: UseAdminAiInsightsOptions = {}) {
  const abortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<AdminAiInsightsState>({
    data: null,
    status: 'idle',
    error: null,
  });

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const fetchInsights = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setState(prev => ({
        ...prev,
        status: 'loading',
        error: null,
      }));

      const response = await fetch(buildAdminAiInsightsUrl(periodDays), {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });
      const payload = (await response.json()) as unknown;

      if (!response.ok) {
        const message =
          isRecord(payload) && typeof payload.error === 'string'
            ? payload.error
            : ADMIN_AI_INSIGHTS_ERROR;
        throw new Error(message);
      }

      setState({
        data: parseAdminAiInsights(payload),
        status: 'success',
        error: null,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      setState({
        data: null,
        status: 'error',
        error: err instanceof Error ? err.message : ADMIN_AI_INSIGHTS_ERROR,
      });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [periodDays]);

  return {
    data: state.data,
    status: state.status,
    error: state.error,
    fetchInsights,
  };
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');

const isAdminAiInsightItem = (value: unknown): value is AdminAiInsightItem =>
  isRecord(value) &&
  typeof value.title === 'string' &&
  typeof value.why === 'string' &&
  typeof value.action === 'string';

const isAdminAiAnomalyItem = (value: unknown): value is AdminAiAnomalyItem =>
  isRecord(value) &&
  typeof value.title === 'string' &&
  typeof value.evidence === 'string' &&
  typeof value.action === 'string';

export const parseInsightItems = (value: unknown): AdminAiInsightItem[] => {
  if (isStringArray(value)) {
    return value.map(item => ({
      title: item,
      why: item,
      action: '詳細を確認してください',
    }));
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isAdminAiInsightItem);
};

export const parseAnomalyItems = (value: unknown): AdminAiAnomalyItem[] => {
  if (isStringArray(value)) {
    return value.map(item => ({
      title: item,
      evidence: item,
      action: '詳細を確認してください',
    }));
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isAdminAiAnomalyItem);
};

export const parseAdminAiInsights = (payload: unknown): AdminAiInsights => {
  const source =
    isRecord(payload) && isRecord(payload.data) ? payload.data : payload;

  if (!isRecord(source)) {
    return {};
  }

  return {
    summary: typeof source.summary === 'string' ? source.summary : null,
    insights: parseInsightItems(source.insights),
    anomalies: parseAnomalyItems(source.anomalies),
    scope: isRecord(source.scope) ? source.scope : null,
    kpi: isRecord(source.kpi) ? source.kpi : null,
  };
};

function buildAdminAiInsightsUrl(periodDays: number) {
  const params = new URLSearchParams({
    period_days: String(periodDays),
  });

  return `/api/admin/ai-insights?${params.toString()}`;
}
