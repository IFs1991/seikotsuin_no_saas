// パフォーマンス測定とWeb Vitals監視
import { logger } from '@/lib/logger';

export interface PerformanceMetrics {
  fcp?: number; // First Contentful Paint
  lcp?: number; // Largest Contentful Paint
  fid?: number; // First Input Delay
  cls?: number; // Cumulative Layout Shift
  ttfb?: number; // Time to First Byte
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics = {};
  private observer?: PerformanceObserver;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initializeObservers();
    }
  }

  private initializeObservers() {
    // Web Vitals監視
    if ('PerformanceObserver' in window) {
      try {
        // Largest Contentful Paint
        const lcpObserver = new PerformanceObserver(list => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1] as PerformanceEntry & {
            renderTime?: number;
            loadTime?: number;
          };
          this.metrics.lcp =
            lastEntry.renderTime || lastEntry.loadTime || lastEntry.startTime;
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

        // First Input Delay
        const fidObserver = new PerformanceObserver(list => {
          const firstInput = list.getEntries()[0] as PerformanceEntry & {
            processingStart?: number;
          };
          this.metrics.fid = firstInput.processingStart
            ? firstInput.processingStart - firstInput.startTime
            : 0;
        });
        fidObserver.observe({ entryTypes: ['first-input'] });

        // Cumulative Layout Shift
        let clsValue = 0;
        const clsObserver = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            const layoutShift = entry as PerformanceEntry & {
              value?: number;
              hadRecentInput?: boolean;
            };
            if (!layoutShift.hadRecentInput) {
              clsValue += layoutShift.value || 0;
            }
          }
          this.metrics.cls = clsValue;
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });
      } catch (e) {
        logger.warn(
          'Performance Observer not supported or failed to initialize'
        );
      }
    }

    // Navigation Timing API
    window.addEventListener('load', () => {
      setTimeout(() => {
        const navigation = performance.getEntriesByType(
          'navigation'
        )[0] as PerformanceNavigationTiming;
        if (navigation) {
          this.metrics.fcp = navigation.responseStart - navigation.requestStart;
          this.metrics.ttfb =
            navigation.responseStart - navigation.requestStart;
        }
      }, 0);
    });
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  // Core Web Vitals評価
  evaluateMetrics(): {
    lcp: 'good' | 'needs-improvement' | 'poor';
    fid: 'good' | 'needs-improvement' | 'poor';
    cls: 'good' | 'needs-improvement' | 'poor';
  } {
    return {
      lcp: this.metrics.lcp
        ? this.metrics.lcp <= 2500
          ? 'good'
          : this.metrics.lcp <= 4000
            ? 'needs-improvement'
            : 'poor'
        : 'good',
      fid: this.metrics.fid
        ? this.metrics.fid <= 100
          ? 'good'
          : this.metrics.fid <= 300
            ? 'needs-improvement'
            : 'poor'
        : 'good',
      cls: this.metrics.cls
        ? this.metrics.cls <= 0.1
          ? 'good'
          : this.metrics.cls <= 0.25
            ? 'needs-improvement'
            : 'poor'
        : 'good',
    };
  }

  // レポート送信（開発用）
  report() {
    const metrics = this.getMetrics();
    const evaluation = this.evaluateMetrics();

    logger.info('🚀 Performance Metrics');
    logger.log('Metrics:', metrics);
    logger.log('Evaluation:', evaluation);

    return { metrics, evaluation };
  }
}

// Bundle Size Analyzer（開発用）
export const analyzeBundleSize = () => {
  if (typeof window === 'undefined') return;

  const scripts = Array.from(document.querySelectorAll('script[src]'));
  const styles = Array.from(
    document.querySelectorAll('link[rel="stylesheet"]')
  );

  logger.info('📦 Bundle Analysis');
  logger.log('Scripts:', scripts.length);
  logger.log('Stylesheets:', styles.length);

  // リソースサイズを推定
  Promise.all([
    ...scripts.map(script =>
      fetch((script as HTMLScriptElement).src, { method: 'HEAD' })
        .then(res => ({
          url: (script as HTMLScriptElement).src,
          size: res.headers.get('content-length') || 'unknown',
        }))
        .catch(() => ({
          url: (script as HTMLScriptElement).src,
          size: 'error',
        }))
    ),
  ]).then(results => {
    logger.log('Bundle analysis results:', results);
  });
};

// レンダリングパフォーマンス測定
export const measureRenderTime = (componentName: string) => {
  return {
    start: () => performance.mark(`${componentName}-render-start`),
    end: () => {
      performance.mark(`${componentName}-render-end`);
      performance.measure(
        `${componentName}-render`,
        `${componentName}-render-start`,
        `${componentName}-render-end`
      );

      const measure = performance.getEntriesByName(
        `${componentName}-render`
      )[0];
      logger.log(
        `⚡ ${componentName} render time: ${measure.duration.toFixed(2)}ms`
      );

      return measure.duration;
    },
  };
};
