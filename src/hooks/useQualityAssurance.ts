import { useEffect, useState } from 'react';
import { runIntegrationTests, TestResult } from '@/lib/integration-tests';

interface QualityMetrics {
  performanceScore?: number;
  accessibilityScore?: number;
  wcag22Compliant?: boolean;
  coreWebVitalsPass?: boolean;
  lastTestRun?: Date;
}

export const useQualityAssurance = (autoRun: boolean = false) => {
  const [metrics, setMetrics] = useState<QualityMetrics>({});
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);

  const runTests = async () => {
    if (typeof window === 'undefined') return;

    setIsRunning(true);

    try {
      const testResults = await runIntegrationTests();
      setResults(testResults);

      // メトリクス計算
      const newMetrics: QualityMetrics = {
        performanceScore: calculatePerformanceScore(testResults),
        accessibilityScore: calculateAccessibilityScore(testResults),
        wcag22Compliant: checkWCAG22Compliance(testResults),
        coreWebVitalsPass: checkCoreWebVitals(testResults),
        lastTestRun: new Date(),
      };

      setMetrics(newMetrics);
    } catch (error) {
      console.error('Quality assurance tests failed:', error);
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    if (autoRun && process.env.NODE_ENV === 'development') {
      // 開発環境でのみ自動実行
      const timer = setTimeout(runTests, 2000);
      return () => clearTimeout(timer);
    }
  }, [autoRun]);

  return {
    metrics,
    results,
    isRunning,
    runTests,
    // 品質スコアの総合評価
    overallQuality: calculateOverallQuality(metrics),
  };
};

function calculatePerformanceScore(results: TestResult[]): number {
  const perfResult = results.find(r => r.name === 'Performance Test');
  if (!perfResult || perfResult.status === 'fail') return 0;

  const evaluation = perfResult.details?.evaluation;
  if (!evaluation) return 50;

  let score = 0;
  if (evaluation.lcp === 'good') score += 35;
  else if (evaluation.lcp === 'needs-improvement') score += 20;

  if (evaluation.fid === 'good') score += 30;
  else if (evaluation.fid === 'needs-improvement') score += 15;

  if (evaluation.cls === 'good') score += 35;
  else if (evaluation.cls === 'needs-improvement') score += 20;

  return Math.min(score, 100);
}

function calculateAccessibilityScore(results: TestResult[]): number {
  const a11yResult = results.find(r => r.name === 'Accessibility Test');
  if (!a11yResult) return 0;

  const { errors = 0, warnings = 0 } = a11yResult.details || {};

  if (errors === 0 && warnings === 0) return 100;
  if (errors === 0) return 85; // 警告のみ
  if (errors <= 2) return 70; // 軽微なエラー
  if (errors <= 5) return 50; // 中程度のエラー
  return 25; // 重大なエラー
}

function checkWCAG22Compliance(results: TestResult[]): boolean {
  const a11yResult = results.find(r => r.name === 'Accessibility Test');
  return a11yResult?.details?.errors === 0;
}

function checkCoreWebVitals(results: TestResult[]): boolean {
  const perfResult = results.find(r => r.name === 'Performance Test');
  if (!perfResult) return false;

  const evaluation = perfResult.details?.evaluation;
  return (
    evaluation?.lcp === 'good' &&
    evaluation?.fid === 'good' &&
    evaluation?.cls === 'good'
  );
}

function calculateOverallQuality(metrics: QualityMetrics): {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
} {
  const {
    performanceScore = 0,
    accessibilityScore = 0,
    wcag22Compliant = false,
    coreWebVitalsPass = false,
  } = metrics;

  let score = (performanceScore + accessibilityScore) / 2;

  // ボーナス点
  if (wcag22Compliant) score += 5;
  if (coreWebVitalsPass) score += 5;

  score = Math.min(score, 100);

  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  let status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';

  if (score >= 90) {
    grade = 'A';
    status = 'excellent';
  } else if (score >= 80) {
    grade = 'B';
    status = 'good';
  } else if (score >= 70) {
    grade = 'C';
    status = 'fair';
  } else if (score >= 60) {
    grade = 'D';
    status = 'poor';
  } else {
    grade = 'F';
    status = 'critical';
  }

  return { score, grade, status };
}

// 品質保証ダッシュボード用のHook
export const useQualityDashboard = () => {
  const qa = useQualityAssurance(true);
  const [history, setHistory] = useState<QualityMetrics[]>([]);

  useEffect(() => {
    if (qa.metrics.lastTestRun) {
      setHistory(prev => [...prev, qa.metrics].slice(-10)); // 最新10件を保持
    }
  }, [qa.metrics]);

  const trend = useMemo(() => {
    if (history.length < 2) return 'stable';

    const current = qa.overallQuality.score;
    const previous = history[history.length - 2];
    const prevScore = calculateOverallQuality(previous).score;

    if (current > prevScore + 5) return 'improving';
    if (current < prevScore - 5) return 'declining';
    return 'stable';
  }, [history, qa.overallQuality.score]);

  return {
    ...qa,
    history,
    trend,
    recommendations: generateRecommendations(qa.results, qa.overallQuality),
  };
};

function generateRecommendations(
  results: TestResult[],
  quality: ReturnType<typeof calculateOverallQuality>
): string[] {
  const recommendations: string[] = [];

  if (quality.status === 'excellent') {
    recommendations.push(
      '品質は excellent です！現在の水準を維持してください。'
    );
    return recommendations;
  }

  const perfResult = results.find(r => r.name === 'Performance Test');
  if (perfResult?.status !== 'pass') {
    recommendations.push(
      'パフォーマンスの改善が必要です。バンドルサイズの最適化や画像の最適化を検討してください。'
    );
  }

  const a11yResult = results.find(r => r.name === 'Accessibility Test');
  if (a11yResult?.details?.errors > 0) {
    recommendations.push(
      'アクセシビリティエラーを修正してください。WCAG 2.2ガイドラインを参照してください。'
    );
  }

  if (quality.score < 70) {
    recommendations.push(
      '全体的な品質改善が急務です。開発チームでの品質向上の取り組みを強化してください。'
    );
  }

  return recommendations;
}

import { useMemo } from 'react';
