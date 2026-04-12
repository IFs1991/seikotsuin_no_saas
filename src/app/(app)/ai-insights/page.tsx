'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useUserProfileContext } from '@/providers/user-profile-context';
import type { AiInsightsResponse } from '@/api/gemini/ai-analysis-service';

const impactMeta: Record<
  'high' | 'mid' | 'low',
  { label: string; className: string }
> = {
  high: { label: '高', className: 'bg-red-100 text-red-700' },
  mid: { label: '中', className: 'bg-yellow-100 text-yellow-800' },
  low: { label: '低', className: 'bg-green-100 text-green-700' },
};

const AiInsightsPage: React.FC = () => {
  const {
    profile,
    loading: profileLoading,
    error: profileError,
  } = useUserProfileContext();
  const clinicId = profile?.clinicId ?? null;

  const [data, setData] = useState<AiInsightsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(clinicId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!clinicId) {
      setData(null);
      setLoading(false);
      return;
    }

    const fetchInsights = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `/api/ai-insights?clinic_id=${clinicId}&period_days=30`
        );
        const json = await res.json();
        if (!res.ok || !json?.success) {
          throw new Error(
            json?.error?.message ||
              json?.error ||
              'AIインサイトの取得に失敗しました'
          );
        }
        const insights = json.data as AiInsightsResponse;
        if (!cancelled) {
          setData(insights);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'AIインサイトの取得に失敗しました'
          );
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchInsights();
    return () => {
      cancelled = true;
    };
  }, [clinicId]);

  const isLoading = profileLoading || loading;

  const anomalies = useMemo(() => data?.anomalies ?? [], [data]);

  if (profileError && !profileLoading) {
    return (
      <div className='p-6 bg-[#f9fafb] dark:bg-[#1a1a1a] min-h-screen'>
        <div className='max-w-[900px] mx-auto'>
          <Card className='bg-card'>
            <CardHeader>
              <CardTitle className='text-red-600'>
                プロフィール取得に失敗しました
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <p className='text-gray-700 dark:text-gray-300'>{profileError}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!clinicId && !profileLoading) {
    return (
      <div className='p-6 bg-[#f9fafb] dark:bg-[#1a1a1a] min-h-screen'>
        <div className='max-w-[900px] mx-auto'>
          <Card className='bg-card'>
            <CardHeader>
              <CardTitle>クリニック情報が見つかりません</CardTitle>
              <CardDescription>
                権限が付与されたクリニックが設定されていないため、AIインサイトを表示できません。
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className='p-6 bg-[#f9fafb] dark:bg-[#1a1a1a] min-h-screen flex items-center justify-center'>
        <div className='text-gray-500'>AIインサイトを読み込み中です...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='p-6 bg-[#f9fafb] dark:bg-[#1a1a1a] min-h-screen'>
        <div className='max-w-[900px] mx-auto'>
          <Card className='bg-card border border-red-200'>
            <CardHeader>
              <CardTitle className='text-red-600'>
                データ取得に失敗しました
              </CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className='p-6 bg-[#f9fafb] dark:bg-[#1a1a1a] min-h-screen flex items-center justify-center'>
        <div className='text-gray-500'>
          表示できるAIインサイトがありません。
        </div>
      </div>
    );
  }

  return (
    <div className='p-6 bg-[#f9fafb] dark:bg-[#1a1a1a] min-h-screen'>
      <div className='max-w-[900px] mx-auto space-y-6'>
        <Card className='bg-card'>
          <CardHeader>
            <CardTitle>AIインサイト</CardTitle>
            <CardDescription>
              直近30日分の集計テーブルをもとにした経営サマリです。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='bg-white dark:bg-gray-800 rounded-lg border p-4 text-gray-800 dark:text-gray-100'>
              {data.summary}
            </div>
          </CardContent>
        </Card>

        <Card className='bg-card'>
          <CardHeader>
            <CardTitle>主要インサイト</CardTitle>
            <CardDescription>実行すべき優先度と背景を整理</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {data.insights.map((insight, index) => (
              <div
                key={`${insight.title}-${index}`}
                className='border rounded-lg p-4 bg-white dark:bg-gray-800'
              >
                <div className='flex items-center justify-between gap-3'>
                  <div className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
                    {insight.title}
                  </div>
                  <span
                    className={`px-2 py-1 text-xs rounded ${impactMeta[insight.impact].className}`}
                  >
                    影響度: {impactMeta[insight.impact].label}
                  </span>
                </div>
                <p className='text-sm text-gray-600 dark:text-gray-300 mt-2'>
                  {insight.why}
                </p>
                <div className='mt-3 flex items-start gap-2'>
                  <Badge variant='secondary'>推奨</Badge>
                  <p className='text-sm text-gray-700 dark:text-gray-200'>
                    {insight.action}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className='bg-card'>
          <CardHeader>
            <CardTitle>異常検知</CardTitle>
            <CardDescription>
              目立った変動が検知された場合に表示されます。
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {anomalies.length === 0 ? (
              <div className='text-sm text-gray-500'>
                現時点で大きな異常は検知されていません。
              </div>
            ) : (
              anomalies.map((item, index) => (
                <div
                  key={`${item.title}-${index}`}
                  className='border rounded-lg p-4 bg-white dark:bg-gray-800'
                >
                  <p className='font-semibold text-gray-900 dark:text-gray-100'>
                    {item.title}
                  </p>
                  <p className='text-sm text-gray-600 dark:text-gray-300 mt-2'>
                    {item.evidence}
                  </p>
                  <p className='text-sm text-gray-700 dark:text-gray-200 mt-2'>
                    推奨: {item.action}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AiInsightsPage;
