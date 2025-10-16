/**
 * セキュリティ・セッション管理用の型定義統一
 * 型安全性向上とコード保守性強化
 */

// ================================================================
// 基本セキュリティ型定義
// ================================================================

export type ThreatSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ThreatType =
  | 'brute_force_attack'
  | 'session_hijacking'
  | 'location_anomaly'
  | 'device_anomaly'
  | 'multi_device_access'
  | 'suspicious_activity'
  | 'rate_limit_exceeded'
  | 'automated_attack'
  | 'privilege_escalation'
  | 'data_breach_attempt';

export type SecurityEventType =
  | 'login_success'
  | 'login_failed'
  | 'session_created'
  | 'session_expired'
  | 'session_revoked'
  | 'unauthorized_access'
  | 'admin_access'
  | 'password_changed'
  | 'profile_updated'
  | 'security_violation'
  | 'system_error';

export type UserRole =
  | 'admin'
  | 'clinic_admin'
  | 'manager'
  | 'staff'
  | 'viewer'
  | 'patient';

// ================================================================
// セッション管理型定義
// ================================================================

export interface DeviceFingerprint {
  browser: string;
  browserVersion?: string;
  os: string;
  osVersion?: string;
  device: 'Desktop' | 'Mobile' | 'Tablet' | 'Unknown';
  screenResolution?: string;
  timezone?: string;
  language?: string;
  userAgent: string;
  isMobile: boolean;
  isBot?: boolean;
}

export interface GeolocationInfo {
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  isp?: string;
  organization?: string;
  isVpn?: boolean;
  isTor?: boolean;
}

export interface SessionMetadata {
  id: string;
  userId: string;
  clinicId: string;
  sessionToken: string;
  deviceFingerprint: DeviceFingerprint;
  ipAddress: string;
  geolocation?: GeolocationInfo;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  idleTimeoutAt?: Date;
  absoluteTimeoutAt: Date;
  isActive: boolean;
  isRevoked: boolean;
  revocationReason?: SessionRevocationReason;
  maxIdleMinutes: number;
  maxSessionHours: number;
  rememberDevice: boolean;
  trustScore: number; // 0-100
}

export type SessionRevocationReason =
  | 'manual_logout'
  | 'idle_timeout'
  | 'absolute_timeout'
  | 'security_violation'
  | 'admin_action'
  | 'multiple_devices'
  | 'suspicious_activity'
  | 'policy_violation'
  | 'system_maintenance';

export interface SessionValidationResult<TSession = SessionMetadata> {
  isValid: boolean;
  session?: TSession;
  user?: {
    id: string;
    email: string;
    role: UserRole;
    clinicId: string;
    isActive: boolean;
  };
  reason?: SessionInvalidReason;
  warnings?: SessionWarning[];
}

export type SessionInvalidReason =
  | 'session_not_found'
  | 'session_expired'
  | 'session_revoked'
  | 'idle_timeout'
  | 'user_inactive'
  | 'invalid_token'
  | 'tampered_token'
  | 'policy_violation';

export interface SessionWarning {
  type:
    | 'location_change'
    | 'device_change'
    | 'suspicious_activity'
    | 'policy_update';
  message: string;
  severity: ThreatSeverity;
  action?: 'reauthenticate' | 'verify_device' | 'contact_admin' | 'none';
}

// ================================================================
// セキュリティ脅威型定義
// ================================================================

export interface SecurityThreat {
  id?: string;
  type: ThreatType;
  severity: ThreatSeverity;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  userId?: string;
  clinicId?: string;
  sessionId?: string;
  ipAddress: string;
  userAgent?: string;
  geolocation?: GeolocationInfo;
  timestamp: Date;
  detectionMethod: DetectionMethod;
  confidence: number; // 0-100
  falsePositiveRisk: number; // 0-100
  recommendedAction: RecommendedAction[];
  status: ThreatStatus;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionNotes?: string;
}

export type DetectionMethod =
  | 'rule_based'
  | 'anomaly_detection'
  | 'machine_learning'
  | 'manual_review'
  | 'external_intelligence'
  | 'pattern_matching';

export interface RecommendedAction {
  action: SecurityAction;
  priority: 'immediate' | 'high' | 'medium' | 'low';
  description: string;
  automated: boolean;
  requiresApproval: boolean;
}

export type SecurityAction =
  | 'terminate_session'
  | 'block_ip'
  | 'require_mfa'
  | 'notify_admin'
  | 'log_only'
  | 'send_alert'
  | 'quarantine_account'
  | 'escalate_investigation';

export type ThreatStatus =
  | 'active'
  | 'investigating'
  | 'mitigated'
  | 'resolved'
  | 'false_positive'
  | 'ignored';

// ================================================================
// セキュリティイベント型定義
// ================================================================

export interface SecurityEvent {
  id?: string;
  eventType: SecurityEventType;
  userId: string;
  clinicId: string;
  sessionId?: string;
  ipAddress: string;
  userAgent: string;
  geolocation?: GeolocationInfo;
  eventDetails: Record<string, unknown>;
  severity: ThreatSeverity;
  success: boolean;
  timestamp: Date;
  relatedThreatId?: string;
  metadata?: Record<string, unknown>;
}

// ================================================================
// セキュリティ統計・レポート型定義
// ================================================================

export interface ThreatStatistics {
  totalEvents: number;
  timeRange: {
    from: Date;
    to: Date;
  };
  threatsByType: Record<ThreatType, number>;
  threatsBySeverity: Record<ThreatSeverity, number>;
  topSourceIPs: Array<{
    ipAddress: string;
    count: number;
    threatLevel: ThreatSeverity;
  }>;
  recentTrends: Array<{
    date: string;
    totalThreats: number;
    criticalThreats: number;
  }>;
  mitigationEffectiveness: {
    blocked: number;
    mitigated: number;
    investigated: number;
    falsePositives: number;
  };
}

export interface SecurityRecommendation {
  id: string;
  type:
    | 'security_policy'
    | 'system_configuration'
    | 'user_training'
    | 'technical_control';
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  timeline: string;
  actionRequired: boolean;
  implementationGuide?: string;
  relatedThreats: ThreatType[];
  expectedRiskReduction: number; // 0-100
}

// ================================================================
// 多要素認証（MFA）型定義（Phase 3B準備）
// ================================================================

export type MFAMethod =
  | 'totp'
  | 'sms'
  | 'email'
  | 'backup_codes'
  | 'hardware_key';

export interface MFAConfiguration {
  userId: string;
  clinicId: string;
  enabledMethods: MFAMethod[];
  primaryMethod: MFAMethod;
  backupCodes: string[];
  totpSecret?: string;
  phoneNumber?: string;
  isEnforced: boolean;
  enforcedAt?: Date;
  lastVerification?: Date;
  failedAttempts: number;
  lockedUntil?: Date;
}

export interface MFAChallenge {
  id: string;
  userId: string;
  method: MFAMethod;
  challenge: string;
  expiresAt: Date;
  attemptsRemaining: number;
  isCompleted: boolean;
  completedAt?: Date;
}

// ================================================================
// API レスポンス型定義
// ================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  warnings?: string[];
  metadata?: {
    timestamp: Date;
    requestId: string;
    processingTime: number;
  };
}

export interface SecurityApiResponse<T = any> extends ApiResponse<T> {
  securityContext?: {
    threatLevel: ThreatSeverity;
    requiresAction: boolean;
    recommendations: string[];
  };
}

// ================================================================
// 設定・ポリシー型定義
// ================================================================

export interface SessionPolicy {
  clinicId: string;
  maxIdleMinutes: number;
  maxSessionHours: number;
  maxConcurrentSessions: number;
  allowRememberDevice: boolean;
  requireMfaForAdmin: boolean;
  blockSuspiciousIPs: boolean;
  allowedIPRanges?: string[];
  blockedCountries?: string[];
  sessionExtensionLimit: number;
  forceLogoutOnPolicyChange: boolean;
}

export interface SecurityConfiguration {
  clinicId: string;
  bruteForceProtection: {
    enabled: boolean;
    maxAttempts: number;
    lockoutDurationMinutes: number;
    progressiveDelay: boolean;
  };
  anomalyDetection: {
    enabled: boolean;
    sensitivityLevel: 'low' | 'medium' | 'high';
    locationTracking: boolean;
    deviceTracking: boolean;
  };
  alerting: {
    enabled: boolean;
    emailAlerts: boolean;
    smsAlerts: boolean;
    slackWebhook?: string;
    alertThresholds: Record<ThreatSeverity, boolean>;
  };
  compliance: {
    auditLogging: boolean;
    dataRetentionDays: number;
    encryptionRequired: boolean;
    hipaaCompliance: boolean;
  };
}

// ================================================================
// ユーティリティ型定義
// ================================================================

export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

// セキュリティ関連のZodスキーマ型（将来的な実装準備）
export interface SecurityValidationSchema {
  sessionToken: string;
  ipAddress: string;
  userAgent: string;
  deviceFingerprint: object;
  geolocation: object;
}
