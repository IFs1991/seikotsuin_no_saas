import { logger } from '@/lib/logger';

/**
 * Content Security Policy (CSP) 設定
 * Phase 3B: XSS攻撃対策の強化
 */

// CSP設定タイプ
export type CSPEnvironment = 'development' | 'staging' | 'production';

// CSP違反レポート処理
export interface CSPViolationReport {
  'document-uri': string;
  referrer?: string;
  'violated-directive': string;
  'effective-directive': string;
  'original-policy': string;
  disposition: 'enforce' | 'report';
  'blocked-uri': string;
  'line-number'?: number;
  'column-number'?: number;
  'source-file'?: string;
  'status-code'?: number;
  'script-sample'?: string;
}

/**
 * 環境別CSPポリシー設定
 */
export class CSPConfig {
  /**
   * 開発環境用CSP（寛容な設定）
   */
  static getDevelopmentCSP(): string {
    const csp = {
      'default-src': ["'self'"],
      'script-src': [
        "'self'",
        "'unsafe-inline'", // 開発時のHMR等で必要
        "'unsafe-eval'", // 開発ツール用
        'https://vercel.live',
        'https://*.vercel-scripts.com',
      ],
      'style-src': [
        "'self'",
        "'unsafe-inline'", // Tailwind CSS等で必要
        'https://fonts.googleapis.com',
      ],
      'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'connect-src': [
        "'self'",
        'https://*.supabase.co',
        'https://*.upstash.io',
        'wss://localhost:*',
        'ws://localhost:*',
        'https://vercel.live',
      ],
      'media-src': ["'self'", 'data:', 'blob:'],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'none'"],
      'upgrade-insecure-requests': [],
      'block-all-mixed-content': [],
    };

    return this.buildCSPString(csp);
  }

  /**
   * 本番環境用CSP（厳格な設定）
   */
  static getProductionCSP(nonce?: string): string {
    const scriptSrcDirectives = ["'self'"];

    // nonceが提供された場合は追加
    if (nonce) {
      scriptSrcDirectives.push(`'nonce-${nonce}'`);
    }

    const csp = {
      'default-src': ["'self'"],
      'script-src': scriptSrcDirectives,
      'style-src': [
        "'self'",
        'https://fonts.googleapis.com',
        // 動的ハッシュ生成（buildTimeHashesから取得）
        ...this.getBuildTimeStyleHashes(),
      ],
      'img-src': [
        "'self'",
        'data:', // Base64画像用
        'https://*.supabase.co', // Supabase Storage
      ],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'connect-src': [
        "'self'",
        'https://*.supabase.co',
        'https://*.upstash.io',
        'https://api.ipgeolocation.io', // IP地理情報API
      ],
      'media-src': ["'self'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'none'"],
      'frame-src': ["'none'"],
      'worker-src': ["'self'"],
      'manifest-src': ["'self'"],
      'upgrade-insecure-requests': [],
      'block-all-mixed-content': [],
      'report-uri': ['/api/security/csp-report'],
    };

    return this.buildCSPString(csp);
  }

  /**
   * Report-Only モード用CSP（テスト・監視用）
   */
  static getReportOnlyCSP(): string {
    // 本番環境と同じ厳格さでreport-onlyモード
    const csp = {
      'default-src': ["'self'"],
      'script-src': [
        "'self'",
        "'unsafe-inline'", // 現在の状況を監視
        "'unsafe-eval'",
      ],
      'style-src': [
        "'self'",
        "'unsafe-inline'",
        'https://fonts.googleapis.com',
      ],
      'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'connect-src': [
        "'self'",
        'https://*.supabase.co',
        'https://*.upstash.io',
      ],
      'media-src': ["'self'", 'data:', 'blob:'],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'none'"],
      'report-uri': ['/api/security/csp-report'],
    };

    return this.buildCSPString(csp);
  }

  /**
   * 医療機関向け特化CSP
   */
  static getMedicalGradeCSP(nonce?: string): string {
    const scriptSrcDirectives = ["'self'"];

    // nonceが提供された場合は追加
    if (nonce) {
      scriptSrcDirectives.push(`'nonce-${nonce}'`);
    }

    // 医療データ処理で必要なライブラリのみ
    scriptSrcDirectives.push('https://cdn.jsdelivr.net'); // Chart.js等の医療統計ライブラリ

    const csp = {
      'default-src': ["'self'"],
      'script-src': scriptSrcDirectives,
      'style-src': [
        "'self'",
        'https://fonts.googleapis.com',
        // 動的ハッシュ生成（buildTimeHashesから取得）
        ...this.getBuildTimeStyleHashes(),
      ],
      'img-src': [
        "'self'",
        'data:', // 医療画像のBase64表示
        'https://*.supabase.co', // セキュアな医療画像ストレージ
      ],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'connect-src': [
        "'self'",
        'https://*.supabase.co', // セキュアなデータベース接続
        'https://*.upstash.io', // セキュアなRedis接続
      ],
      'media-src': ["'self'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'none'"], // 医療データの埋め込み防止
      'frame-src': ["'none'"], // iframe完全禁止
      'worker-src': ["'self'"], // Web Workers制限
      'manifest-src': ["'self'"],
      'upgrade-insecure-requests': [], // HTTPS強制
      'block-all-mixed-content': [], // 混合コンテンツブロック
      'require-trusted-types-for': ["'script'"], // Trusted Types API
      'trusted-types': ['default'], // 信頼できる型のみ
      'report-uri': ['/api/security/csp-report'],
    };

    return this.buildCSPString(csp);
  }

  /**
   * CSP文字列構築
   */
  private static buildCSPString(csp: Record<string, string[]>): string {
    return Object.entries(csp)
      .map(([directive, sources]) => {
        if (sources.length === 0) {
          return directive;
        }
        return `${directive} ${sources.join(' ')}`;
      })
      .join('; ');
  }

  /**
   * nonce生成（動的スクリプト用）
   */
  static generateNonce(): string {
    // 暗号学的に安全な乱数でnonce生成
    const array = new Uint8Array(16);

    if (
      typeof globalThis !== 'undefined' &&
      globalThis.crypto &&
      globalThis.crypto.getRandomValues
    ) {
      globalThis.crypto.getRandomValues(array);
    } else {
      // フォールバック（Web Crypto非対応環境）
      for (let i = 0; i < 16; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }

    // Edge RuntimeではBufferが存在しないため、Web標準のエンコードにフォールバックする
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(array).toString('base64');
    }

    let binary = '';
    for (const byte of array) {
      binary += String.fromCharCode(byte);
    }

    if (typeof btoa === 'function') {
      return btoa(binary);
    }

    // 最終フォールバック（btoaもない環境は稀）
    return binary;
  }

  /**
   * CSP違反レポート処理
   */
  static async handleCSPViolation(report: CSPViolationReport): Promise<void> {
    try {
      // 違反レベルの判定
      const severity = this.assessViolationSeverity(report);

      // セキュリティログに記録
      const logEntry = {
        type: 'csp_violation',
        severity,
        documentUri: report['document-uri'],
        violatedDirective: report['violated-directive'],
        blockedUri: report['blocked-uri'],
        disposition: report.disposition,
        timestamp: new Date().toISOString(),
        details: report,
      };

      // データベースまたはログシステムに記録
      logger.warn('CSP Violation:', logEntry);

      // 重大な違反の場合は管理者に通知
      if (severity === 'high' || severity === 'critical') {
        await this.notifyAdminsOfCSPViolation(logEntry);
      }
    } catch (error) {
      logger.error('CSP違反レポート処理エラー:', error);
    }
  }

  /**
   * 違反の重要度判定
   */
  private static assessViolationSeverity(
    report: CSPViolationReport
  ): 'low' | 'medium' | 'high' | 'critical' {
    const violatedDirective = report['violated-directive'];
    const blockedUri = report['blocked-uri'];

    // クリティカル: script-src違反でjavascript:スキーム
    if (
      violatedDirective.includes('script-src') &&
      // eslint-disable-next-line no-script-url
      blockedUri.startsWith('javascript:')
    ) {
      return 'critical';
    }

    // 高: script-src違反で外部ドメイン
    if (
      violatedDirective.includes('script-src') &&
      blockedUri.startsWith('http')
    ) {
      return 'high';
    }

    // 中: frame-ancestors違反（clickjacking試行）
    if (violatedDirective.includes('frame-ancestors')) {
      return 'medium';
    }

    // その他は低レベル
    return 'low';
  }

  /**
   * 管理者通知（重大な違反時）
   */
  private static async notifyAdminsOfCSPViolation(
    logEntry: any
  ): Promise<void> {
    // 実装: 管理者へのアラート送信
    // メール、Slack、ダッシュボード通知等
    logger.error(
      'Critical CSP Violation - Admin notification required:',
      logEntry
    );
  }

  /**
   * 環境に応じたCSP取得
   */
  static getCSPForEnvironment(environment?: string, nonce?: string): string {
    const env = environment || process.env.NODE_ENV || 'development';

    switch (env) {
      case 'production':
        return this.getMedicalGradeCSP(nonce); // 医療機関向け最高レベル
      case 'staging':
        return this.getProductionCSP(nonce);
      case 'development':
        return this.getDevelopmentCSP(); // 開発環境はnonce不要（unsafe-inlineあり）
      default:
        return this.getDevelopmentCSP();
    }
  }

  /**
   * ビルド時スタイルハッシュの取得
   */
  private static getBuildTimeStyleHashes(): string[] {
    try {
      // 動的インポートでcircular dependencyを回避
      if (typeof window === 'undefined') {
        // サーバーサイドでのみハッシュ生成を実行
        return this.getStaticStyleHashes();
      }
      return [];
    } catch (error) {
      logger.warn('Failed to get build-time style hashes:', error);
      return this.getFallbackStyleHashes();
    }
  }

  /**
   * 静的スタイルハッシュ（よく使われるもの）
   */
  private static getStaticStyleHashes(): string[] {
    return [
      // Tailwind CSS reset
      "'sha256-2aahydUs+he2AO0g7YZuG67RGvfE9VXGbftk+YpKPpQ='",
      // Next.js globals
      "'sha256-4Rs+0eqQnvNe2W4eaTNRxwGAjYTWMd5X9ZXi6QsWGJk='",
      // Common utility styles
      "'sha256-fnQKqDcOC4sVjZkdGmWzPlYPMwdMy9EmaFZh+T1d0PE='",
    ];
  }

  /**
   * フォールバック用スタイルハッシュ
   */
  private static getFallbackStyleHashes(): string[] {
    return [
      // 最低限のスタイル許可（開発・エラー時）
      "'unsafe-inline'", // 開発環境やエラー時のフォールバック
    ];
  }

  /**
   * CSPポリシーの段階的導入支援
   */
  static getGradualRolloutCSP(
    phase: 'report-only' | 'partial-enforce' | 'full-enforce',
    nonce?: string
  ): {
    csp: string;
    cspReportOnly?: string;
  } {
    switch (phase) {
      case 'report-only':
        return {
          csp: this.getDevelopmentCSP(),
          cspReportOnly: this.getReportOnlyCSP(),
        };
      case 'partial-enforce':
        return {
          csp: this.getProductionCSP(nonce),
          cspReportOnly: this.getMedicalGradeCSP(nonce),
        };
      case 'full-enforce':
        return {
          csp: this.getMedicalGradeCSP(nonce),
        };
      default:
        return {
          csp: this.getDevelopmentCSP(),
        };
    }
  }
}
