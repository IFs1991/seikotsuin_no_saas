/**
 * セキュリティ関連の定数定義
 * アプリケーション全体のセキュリティ設定を一元管理
 */

/**
 * 許可されたリダイレクト先オリジンのリスト
 * Open Redirect攻撃を防ぐために使用
 */
export const ALLOWED_REDIRECT_ORIGINS = [
  // 本番環境のドメイン（実際の値に置き換える）
  'https://your-clinic-app.com',
  'https://seikotsuin-saas.com',

  // 開発・ステージング環境
  ...(process.env.NODE_ENV === 'development'
    ? ['http://localhost:3000', 'http://127.0.0.1:3000']
    : []),

  // 必要に応じて追加のドメインを指定
  // 'https://partner-domain.com',
];

/**
 * セキュアなリダイレクトパスのリスト
 * ユーザー権限に応じたデフォルトリダイレクト先
 */
export const SECURE_REDIRECT_PATHS = {
  admin: '/admin/settings',
  manager: '/dashboard',
  staff: '/dashboard',
  default: '/admin/settings',
} as const;

/**
 * セキュリティヘッダーの設定
 */
export const SECURITY_HEADERS = {
  // XSS対策
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',

  // CSRF対策（Supabase認証と併用）
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // セッション管理
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
} as const;

/**
 * パスワードポリシー設定
 */
export const PASSWORD_POLICY = {
  minLength: 8,
  requireLowercase: true,
  requireUppercase: true,
  requireNumber: true,
  requireSpecialChar: true,
  maxLength: 128,
} as const;

/**
 * レート制限設定
 */
export const RATE_LIMIT = {
  // ログイン試行回数制限
  loginAttempts: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15分
    blockDurationMs: 60 * 60 * 1000, // 1時間
  },

  // API呼び出し制限
  apiCalls: {
    maxRequests: 100,
    windowMs: 60 * 1000, // 1分
  },
} as const;

/**
 * セッション設定
 */
export const SESSION_CONFIG = {
  // セッションタイムアウト（8時間）
  timeoutMs: 8 * 60 * 60 * 1000,

  // リフレッシュトークンの有効期限（7日）
  refreshTokenExpiryMs: 7 * 24 * 60 * 60 * 1000,

  // セッション延長の閾値（残り1時間以下で延長）
  renewalThresholdMs: 60 * 60 * 1000,
} as const;

/**
 * ファイルアップロード制限
 */
export const FILE_UPLOAD = {
  // 最大ファイルサイズ（10MB）
  maxSizeBytes: 10 * 1024 * 1024,

  // 許可されるMIMEタイプ
  allowedTypes: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'text/plain',
  ],

  // 許可されるファイル拡張子
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.txt'],
} as const;

/**
 * 監査ログ設定
 */
export const AUDIT_LOG = {
  // ログ保持期間（90日）
  retentionDays: 90,

  // 記録対象イベント
  events: [
    'user_login',
    'user_logout',
    'password_change',
    'permission_change',
    'data_access',
    'data_modification',
    'security_violation',
  ] as const,
} as const;

/**
 * CSP（Content Security Policy）設定
 */
export const CONTENT_SECURITY_POLICY = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'https:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'", 'https://api.supabase.io', 'https://*.supabase.co'],
  'frame-ancestors': ["'none'"],
} as const;
