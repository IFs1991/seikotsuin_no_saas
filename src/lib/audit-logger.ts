import { createAdminClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

// 監査ログの種類
export enum AuditEventType {
  LOGIN = 'login',
  LOGOUT = 'logout',
  DATA_ACCESS = 'data_access',
  DATA_MODIFY = 'data_modify',
  DATA_DELETE = 'data_delete',
  ADMIN_ACTION = 'admin_action',
  PERMISSION_CHANGE = 'permission_change',
  SYSTEM_CONFIG = 'system_config',
  EXPORT_DATA = 'export_data',
  FAILED_LOGIN = 'failed_login',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
}

// 監査ログエントリの型定義
export interface AuditLogEntry {
  event_type: AuditEventType;
  user_id?: string;
  user_email?: string;
  target_table?: string;
  target_id?: string;
  clinic_id?: string;
  ip_address?: string;
  user_agent?: string;
  details?: Record<string, unknown>;
  success: boolean;
  error_message?: string;
}

// 監査ログ記録クラス
export class AuditLogger {
  private static async createLogEntry(entry: AuditLogEntry) {
    try {
      const supabase = createAdminClient();

      const logData = {
        event_type: entry.event_type,
        user_id: entry.user_id,
        user_email: entry.user_email,
        target_table: entry.target_table,
        target_id: entry.target_id,
        clinic_id: entry.clinic_id,
        ip_address: entry.ip_address,
        user_agent: entry.user_agent,
        details: entry.details,
        success: entry.success,
        error_message: entry.error_message,
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('audit_logs').insert([logData]);

      if (error) {
        logger.error('監査ログの記録に失敗しました:', error);
      }
    } catch (error) {
      logger.error('監査ログシステムエラー:', error);
    }
  }

  // ログイン成功
  static async logLogin(
    userId: string,
    userEmail: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    const entry: AuditLogEntry = {
      event_type: AuditEventType.LOGIN,
      user_id: userId,
      user_email: userEmail,
      success: true,
    };

    if (ipAddress !== undefined) entry.ip_address = ipAddress;
    if (userAgent !== undefined) entry.user_agent = userAgent;

    await this.createLogEntry(entry);
  }

  // ログイン失敗
  static async logFailedLogin(
    email: string,
    ipAddress?: string,
    userAgent?: string,
    errorMessage?: string
  ) {
    const entry: AuditLogEntry = {
      event_type: AuditEventType.FAILED_LOGIN,
      user_email: email,
      success: false,
    };

    if (ipAddress !== undefined) entry.ip_address = ipAddress;
    if (userAgent !== undefined) entry.user_agent = userAgent;
    if (errorMessage !== undefined) entry.error_message = errorMessage;

    await this.createLogEntry(entry);
  }

  // ログアウト
  static async logLogout(
    userId: string,
    userEmail: string,
    ipAddress?: string
  ) {
    const entry: AuditLogEntry = {
      event_type: AuditEventType.LOGOUT,
      user_id: userId,
      user_email: userEmail,
      success: true,
    };

    if (ipAddress !== undefined) entry.ip_address = ipAddress;

    await this.createLogEntry(entry);
  }

  // データアクセス（患者情報参照など）
  static async logDataAccess(
    userId: string,
    userEmail: string,
    targetTable: string,
    targetId: string,
    clinicId?: string,
    ipAddress?: string,
    details?: Record<string, unknown>
  ) {
    const entry: AuditLogEntry = {
      event_type: AuditEventType.DATA_ACCESS,
      user_id: userId,
      user_email: userEmail,
      target_table: targetTable,
      target_id: targetId,
      success: true,
    };

    if (clinicId !== undefined) entry.clinic_id = clinicId;
    if (ipAddress !== undefined) entry.ip_address = ipAddress;
    if (details !== undefined) entry.details = details;

    await this.createLogEntry(entry);
  }

  // データ変更
  static async logDataModify(
    userId: string,
    userEmail: string,
    targetTable: string,
    targetId: string,
    changes: Record<string, unknown>,
    clinicId?: string,
    ipAddress?: string
  ) {
    const entry: AuditLogEntry = {
      event_type: AuditEventType.DATA_MODIFY,
      user_id: userId,
      user_email: userEmail,
      target_table: targetTable,
      target_id: targetId,
      details: { changes },
      success: true,
    };

    if (clinicId !== undefined) entry.clinic_id = clinicId;
    if (ipAddress !== undefined) entry.ip_address = ipAddress;

    await this.createLogEntry(entry);
  }

  // データ削除
  static async logDataDelete(
    userId: string,
    userEmail: string,
    targetTable: string,
    targetId: string,
    clinicId?: string,
    ipAddress?: string,
    deletedData?: Record<string, unknown>
  ) {
    const entry: AuditLogEntry = {
      event_type: AuditEventType.DATA_DELETE,
      user_id: userId,
      user_email: userEmail,
      target_table: targetTable,
      target_id: targetId,
      details: { deleted_data: deletedData },
      success: true,
    };

    // オプショナルプロパティは値がある場合のみ設定
    if (clinicId !== undefined) entry.clinic_id = clinicId;
    if (ipAddress !== undefined) entry.ip_address = ipAddress;

    await this.createLogEntry(entry);
  }

  // 権限なしアクセス試行
  static async logUnauthorizedAccess(
    attemptedResource: string,
    errorMessage: string,
    userId?: string | null,
    userEmail?: string | null,
    ipAddress?: string,
    userAgent?: string
  ) {
    const entry: AuditLogEntry = {
      event_type: AuditEventType.UNAUTHORIZED_ACCESS,
      details: { attempted_resource: attemptedResource },
      success: false,
      error_message: errorMessage,
    };

    // オプショナルプロパティは値がある場合のみ設定
    if (userId) entry.user_id = userId;
    if (userEmail) entry.user_email = userEmail;
    if (ipAddress !== undefined) entry.ip_address = ipAddress;
    if (userAgent !== undefined) entry.user_agent = userAgent;

    await this.createLogEntry(entry);
  }

  // 管理者操作
  static async logAdminAction(
    userId: string,
    userEmail: string,
    action: string,
    targetId?: string,
    details?: Record<string, unknown>,
    ipAddress?: string
  ) {
    const entry: AuditLogEntry = {
      event_type: AuditEventType.ADMIN_ACTION,
      user_id: userId,
      user_email: userEmail,
      details: { action, ...details },
      success: true,
    };

    // オプショナルプロパティは値がある場合のみ設定
    if (targetId !== undefined) entry.target_id = targetId;
    if (ipAddress !== undefined) entry.ip_address = ipAddress;

    await this.createLogEntry(entry);
  }

  // データエクスポート
  static async logDataExport(
    userId: string,
    userEmail: string,
    exportType: string,
    recordCount: number,
    clinicId?: string,
    ipAddress?: string
  ) {
    const entry: AuditLogEntry = {
      event_type: AuditEventType.EXPORT_DATA,
      user_id: userId,
      user_email: userEmail,
      details: {
        export_type: exportType,
        record_count: recordCount,
        timestamp: new Date().toISOString(),
      },
      success: true,
    };

    // オプショナルプロパティは値がある場合のみ設定
    if (clinicId !== undefined) entry.clinic_id = clinicId;
    if (ipAddress !== undefined) entry.ip_address = ipAddress;

    await this.createLogEntry(entry);
  }
}

// リクエストから IP アドレスとUser-Agentを取得するヘルパー
export function getRequestInfo(request: Request) {
  const ipAddress =
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  return { ipAddress, userAgent };
}
