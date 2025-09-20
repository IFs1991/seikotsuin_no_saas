/** @type {import('next').NextConfig} */

// CSP設定をインポート（Jest等の環境では存在しない可能性に配慮）
let CSPConfig;
try {
  // NodeのCJS環境でTSファイルを直接requireできないケースに備えてtry-catch
  CSPConfig = require('./src/lib/security/csp-config').CSPConfig;
} catch (e) {
  // フォールバック: テスト環境等では空の実装を使用
  CSPConfig = {
    getCSPForEnvironment: () => "default-src 'self'",
    getGradualRolloutCSP: () => ({ csp: "default-src 'self'" }),
  };
}

// セキュリティヘッダー生成関数
async function getSecurityHeaders() {
  // 環境に応じたCSP取得
  const environment = process.env.NODE_ENV;
  const cspPolicy =
    CSPConfig?.getCSPForEnvironment?.(environment) || "default-src 'self'";

  // CSP段階的導入設定
  const rolloutPhase = process.env.CSP_ROLLOUT_PHASE || 'report-only';
  const cspConfig = CSPConfig?.getGradualRolloutCSP?.(rolloutPhase) || {
    csp: cspPolicy,
  };

  const securityHeaders = [
    // フレーミング防止
    {
      key: 'X-Frame-Options',
      value: 'DENY',
    },
    // MIME タイプスニッフィング防止
    {
      key: 'X-Content-Type-Options',
      value: 'nosniff',
    },
    // XSS保護
    {
      key: 'X-XSS-Protection',
      value: '1; mode=block',
    },
    // リファラーポリシー
    {
      key: 'Referrer-Policy',
      value: 'strict-origin-when-cross-origin',
    },
    // HTTPS強制（本番環境）
    ...(environment === 'production'
      ? [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ]
      : []),
    // Permissions Policy
    {
      key: 'Permissions-Policy',
      value:
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    },
    // Content Security Policy（動的nonce対応）
    {
      key: 'Content-Security-Policy',
      value: cspConfig.csp,
    },
    // CSP Report-Only（段階的導入時）
    ...(cspConfig.cspReportOnly
      ? [
          {
            key: 'Content-Security-Policy-Report-Only',
            value: cspConfig.cspReportOnly,
          },
        ]
      : []),
  ];

  return securityHeaders;
}

const nextConfig = {
  // パフォーマンス最適化設定（Supabaseを除外）
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },

  // バンドル分析と最適化
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            priority: 10,
            reuseExistingChunk: true,
          },
          common: {
            name: 'common',
            minChunks: 2,
            priority: 5,
            reuseExistingChunk: true,
          },
        },
      };
    }
    return config;
  },

  // 画像最適化設定
  images: {
    unoptimized: false,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
    formats: ['image/webp', 'image/avif'],
  },

  // ESLint設定
  eslint: {
    ignoreDuringBuilds: false,
  },

  // TypeScript設定
  typescript: {
    ignoreBuildErrors: false,
  },

  // Phase 3B: 強化されたセキュリティヘッダー（CSP含む）
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: await getSecurityHeaders(),
      },
      // API エンドポイント用の追加セキュリティ
      {
        source: '/api/(.*)',
        headers: [
          ...(await getSecurityHeaders()),
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate',
          },
        ],
      },
    ];
  },

  // リダイレクト設定
  async redirects() {
    return [
      {
        source: '/home',
        destination: '/dashboard',
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
