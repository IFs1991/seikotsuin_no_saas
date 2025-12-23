import React, { useState, useEffect } from 'react';
import { TrendingUp, Users, Award, Brain } from 'lucide-react';
import {
  generateAnalysisReport,
  fetchAnalysisData,
} from '@/api/gemini/ai-analysis-service';
import { clsx } from 'clsx';

interface AnalysisResult {
  salesAnalysis: {
    total: number;
    trend: string;
    anomalies: string[];
  };
  patientMetrics: {
    total: number;
    newPatients: number;
    returnRate: number;
  };
  therapistPerformance: {
    topPerformer: string;
    metrics: Record<string, number>;
  };
  aiInsights: {
    summary: string;
    recommendations: string[];
    nextDayPlan: string[];
  };
}

interface AIAnalysisProps {
  className?: string;
}

export function AIAnalysis({ className }: AIAnalysisProps) {
  const [analysisData, setAnalysisData] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAnalysisData = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await fetchAnalysisData();
        const analysisResult = generateAnalysisReport(data);

        setAnalysisData(analysisResult);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'データの読み込みに失敗しました'
        );
      } finally {
        setLoading(false);
      }
    };

    loadAnalysisData();
  }, []);

  if (loading) {
    return (
      <div
        className={clsx(
          'flex justify-center items-center min-h-[400px]',
          className
        )}
      >
        <div className='animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent' />
      </div>
    );
  }

  if (error) {
    return (
      <div className={clsx('medical-card p-6', className)}>
        <div className='text-center text-red-600'>
          <p className='font-medium'>エラーが発生しました</p>
          <p className='text-sm text-gray-500 mt-1'>{error}</p>
        </div>
      </div>
    );
  }

  if (!analysisData) {
    return (
      <div className={clsx('medical-card p-6', className)}>
        <div className='text-center text-gray-500'>
          <p>分析データが見つかりません</p>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('space-y-6', className)}>
      <div className='medical-card p-6'>
        <div className='flex items-center space-x-3 mb-6'>
          <Brain className='h-6 w-6 text-primary-600' />
          <h2 className='text-xl font-semibold text-gray-900'>
            AI分析レポート
          </h2>
        </div>

        <div className='grid gap-6 md:grid-cols-2 lg:grid-cols-3'>
          {/* 売上分析 */}
          <div className='bg-gray-50 rounded-medical p-4'>
            <div className='flex items-center space-x-2 mb-3'>
              <TrendingUp className='h-5 w-5 text-accent-600' />
              <h3 className='font-medium text-gray-900'>売上分析</h3>
            </div>
            <p className='text-2xl font-bold text-gray-900 mb-1'>
              {analysisData.salesAnalysis.total.toLocaleString()}
            </p>
            <p className='text-sm text-gray-600'>
              トレンド: {analysisData.salesAnalysis.trend}
            </p>
            {analysisData.salesAnalysis.anomalies.length > 0 && (
              <div className='mt-2 text-xs text-yellow-600'>
                {analysisData.salesAnalysis.anomalies[0]}
              </div>
            )}
          </div>

          {/* 患者メトリクス */}
          <div className='bg-gray-50 rounded-medical p-4'>
            <div className='flex items-center space-x-2 mb-3'>
              <Users className='h-5 w-5 text-blue-600' />
              <h3 className='font-medium text-gray-900'>患者メトリクス</h3>
            </div>
            <p className='text-2xl font-bold text-gray-900 mb-1'>
              {analysisData.patientMetrics.total}名
            </p>
            <div className='text-sm text-gray-600 space-y-1'>
              <p>新規: {analysisData.patientMetrics.newPatients}名</p>
              <p>リピート率: {analysisData.patientMetrics.returnRate}%</p>
            </div>
          </div>

          {/* スタッフパフォーマンス */}
          <div className='bg-gray-50 rounded-medical p-4'>
            <div className='flex items-center space-x-2 mb-3'>
              <Award className='h-5 w-5 text-yellow-600' />
              <h3 className='font-medium text-gray-900'>トップパフォーマー</h3>
            </div>
            <p className='text-lg font-semibold text-gray-900 mb-1'>
              {analysisData.therapistPerformance.topPerformer || '未設定'}
            </p>
            <p className='text-sm text-gray-600'>本日の最優秀施術者</p>
          </div>
        </div>
      </div>

      {/* AIインサイト */}
      <div className='medical-card p-6'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4'>
          AIインサイト
        </h3>

        <div className='bg-primary-50 rounded-medical p-4 mb-4'>
          <p className='text-gray-800 leading-relaxed'>
            {analysisData.aiInsights.summary}
          </p>
        </div>

        <div className='grid gap-4 md:grid-cols-2'>
          <div>
            <h4 className='font-medium text-gray-900 mb-3'>推奨アクション</h4>
            <ul className='space-y-2'>
              {analysisData.aiInsights.recommendations.map((rec, index) => (
                <li key={index} className='flex items-start space-x-2'>
                  <div className='flex-shrink-0 w-2 h-2 bg-accent-500 rounded-full mt-2' />
                  <span className='text-sm text-gray-700'>{rec}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className='font-medium text-gray-900 mb-3'>明日への計画</h4>
            <ul className='space-y-2'>
              {analysisData.aiInsights.nextDayPlan.map((plan, index) => (
                <li key={index} className='flex items-start space-x-2'>
                  <div className='flex-shrink-0 w-2 h-2 bg-primary-500 rounded-full mt-2' />
                  <span className='text-sm text-gray-700'>{plan}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
