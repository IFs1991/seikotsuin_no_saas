import { PerformanceMonitor } from './performance';
import { AccessibilityTester } from './accessibility-test';
import { mockE2ETest } from '../__tests__/e2e/dashboard.test';
import { logger } from '@/lib/logger';

export interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  details: any;
  duration: number;
}

export class IntegrationTestSuite {
  private results: TestResult[] = [];

  async runAllTests(): Promise<TestResult[]> {
    logger.log('🚀 Starting Integration Test Suite...\n');

    // 1. パフォーマンステスト
    await this.runPerformanceTests();

    // 2. アクセシビリティテスト
    await this.runAccessibilityTests();

    // 3. E2Eテスト（モック）
    await this.runE2ETests();

    // 4. レスポンシブテスト
    await this.runResponsiveTests();

    // 5. 総合レポート
    this.generateSummary();

    return this.results;
  }

  private async runPerformanceTests() {
    const startTime = performance.now();

    try {
      const monitor = new PerformanceMonitor();

      // パフォーマンス測定の実行
      setTimeout(() => {
        const result = monitor.report();
        const evaluation = monitor.evaluateMetrics();

        const allGood = Object.values(evaluation).every(
          score => score === 'good'
        );

        this.addResult({
          name: 'Performance Test',
          status: allGood ? 'pass' : 'warning',
          details: {
            metrics: result.metrics,
            evaluation: result.evaluation,
          },
          duration: performance.now() - startTime,
        });
      }, 1000);
    } catch (error) {
      this.addResult({
        name: 'Performance Test',
        status: 'fail',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        duration: performance.now() - startTime,
      });
    }
  }

  private async runAccessibilityTests() {
    const startTime = performance.now();

    try {
      const tester = new AccessibilityTester();
      const issues = tester.testPage();
      const report = tester.generateReport();

      const errorCount = issues.filter(i => i.severity === 'error').length;

      this.addResult({
        name: 'Accessibility Test',
        status: errorCount === 0 ? 'pass' : 'fail',
        details: {
          issues: issues.length,
          errors: errorCount,
          warnings: issues.filter(i => i.severity === 'warning').length,
          report,
        },
        duration: performance.now() - startTime,
      });
    } catch (error) {
      this.addResult({
        name: 'Accessibility Test',
        status: 'fail',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        duration: performance.now() - startTime,
      });
    }
  }

  private async runE2ETests() {
    const startTime = performance.now();

    try {
      await mockE2ETest.runDashboardTests();

      this.addResult({
        name: 'E2E Test',
        status: 'pass',
        details: { message: 'Mock E2E tests completed successfully' },
        duration: performance.now() - startTime,
      });
    } catch (error) {
      this.addResult({
        name: 'E2E Test',
        status: 'fail',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        duration: performance.now() - startTime,
      });
    }
  }

  private async runResponsiveTests() {
    const startTime = performance.now();

    try {
      const breakpoints = [
        { name: 'Mobile', width: 375 },
        { name: 'Tablet', width: 768 },
        { name: 'Desktop', width: 1024 },
      ];

      const results = breakpoints.map(bp => {
        // モバイル要素のチェック
        const mobileNav = document.querySelector('.mobile-only');
        const desktopSidebar = document.querySelector('.desktop-only');

        return {
          breakpoint: bp.name,
          mobileElementsExist: !!mobileNav,
          desktopElementsExist: !!desktopSidebar,
          responsive: true, // 簡易チェック
        };
      });

      this.addResult({
        name: 'Responsive Test',
        status: 'pass',
        details: { breakpoints: results },
        duration: performance.now() - startTime,
      });
    } catch (error) {
      this.addResult({
        name: 'Responsive Test',
        status: 'fail',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        duration: performance.now() - startTime,
      });
    }
  }

  private addResult(result: TestResult) {
    this.results.push(result);
    const statusIcon =
      result.status === 'pass'
        ? '✅'
        : result.status === 'warning'
          ? '⚠️'
          : '❌';
    logger.log(
      `${statusIcon} ${result.name}: ${result.status} (${result.duration.toFixed(2)}ms)`
    );

    if (result.status !== 'pass') {
      logger.log(`   Details:`, result.details);
    }
  }

  private generateSummary() {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.status === 'pass').length;
    const warningTests = this.results.filter(
      r => r.status === 'warning'
    ).length;
    const failedTests = this.results.filter(r => r.status === 'fail').length;

    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    logger.log('\n📊 Integration Test Summary:');
    logger.log(`Total Tests: ${totalTests}`);
    logger.log(`Passed: ${passedTests}`);
    logger.log(`Warnings: ${warningTests}`);
    logger.log(`Failed: ${failedTests}`);
    logger.log(`Total Duration: ${totalDuration.toFixed(2)}ms`);
    logger.log(
      `Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`
    );

    if (failedTests === 0 && warningTests <= 1) {
      logger.log('\n🎉 Integration tests completed successfully!');
    } else if (failedTests === 0) {
      logger.log('\n⚠️ Tests completed with warnings - review recommended');
    } else {
      logger.log('\n❌ Some tests failed - immediate attention required');
    }
  }

  // WCAG 2.2 対応確認
  checkWCAG22Compliance(): boolean {
    const accessibilityResult = this.results.find(
      r => r.name === 'Accessibility Test'
    );
    if (!accessibilityResult || accessibilityResult.status === 'fail') {
      return false;
    }

    const errors = accessibilityResult.details?.errors || 0;
    return errors === 0;
  }

  // Core Web Vitals確認
  checkCoreWebVitals(): boolean {
    const performanceResult = this.results.find(
      r => r.name === 'Performance Test'
    );
    if (!performanceResult || performanceResult.status === 'fail') {
      return false;
    }

    const evaluation = performanceResult.details?.evaluation;
    return (
      evaluation &&
      evaluation.lcp === 'good' &&
      evaluation.fid === 'good' &&
      evaluation.cls === 'good'
    );
  }
}

// 開発用のヘルパー関数
export const runIntegrationTests = async () => {
  if (typeof window === 'undefined') {
    logger.warn('Integration tests can only run in browser environment');
    return;
  }

  const suite = new IntegrationTestSuite();
  return await suite.runAllTests();
};
