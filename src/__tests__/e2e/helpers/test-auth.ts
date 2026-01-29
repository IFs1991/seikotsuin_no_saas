/**
 * E2Eテスト用認証ヘルパー
 *
 * 環境変数に設定されたテストユーザーを使用してSupabaseクライアントを作成
 * RLSポリシーの動作検証に使用
 *
 * @spec docs/stabilization/jest-mock-unification-spec-v0.1.md - Error Class 5
 *
 * 注意: E2E RLSテストは実際のSupabaseインスタンスに依存するため、
 * Jest環境ではデフォルトでスキップされます。
 * 実環境でテストを実行するには E2E_RLS_ENABLED=true を設定してください。
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// E2E RLSテストの有効化フラグ
// Jest環境ではデフォルトで無効、Playwright/実環境では有効
export const E2E_RLS_ENABLED = process.env.E2E_RLS_ENABLED === 'true';

// テスト用環境変数（.env.test または環境変数で設定）
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// テストユーザー情報（環境変数で設定）
export const TEST_USERS = {
  admin: {
    email: process.env.TEST_ADMIN_EMAIL || 'e2e-admin@clinic.local',
    password: process.env.TEST_ADMIN_PASSWORD || 'Admin#12345',
  },
  therapist: {
    email: process.env.TEST_THERAPIST_EMAIL || 'e2e-staff@clinic.local',
    password: process.env.TEST_THERAPIST_PASSWORD || 'Staff#12345',
  },
  clinicA: {
    email: process.env.TEST_CLINIC_A_EMAIL || 'e2e-manager@clinic.local',
    password: process.env.TEST_CLINIC_A_PASSWORD || 'Manager#12345',
  },
  clinicB: {
    email: process.env.TEST_CLINIC_B_EMAIL || 'e2e-clinic-b@clinic.local',
    password: process.env.TEST_CLINIC_B_PASSWORD || 'Staff#12345',
  },
};

/**
 * 匿名（未認証）Supabaseクライアントを作成
 */
export function createAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * 認証済みSupabaseクライアントを作成
 */
export async function createAuthenticatedClient(
  email: string,
  password: string
): Promise<{ client: SupabaseClient; userId: string } | null> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    console.error('認証失敗:', error?.message);
    return null;
  }

  return {
    client,
    userId: data.user.id,
  };
}

/**
 * adminユーザーとして認証されたクライアントを作成
 */
export async function createAdminClient(): Promise<{
  client: SupabaseClient;
  userId: string;
} | null> {
  return createAuthenticatedClient(
    TEST_USERS.admin.email,
    TEST_USERS.admin.password
  );
}

/**
 * therapistユーザーとして認証されたクライアントを作成
 */
export async function createTherapistClient(): Promise<{
  client: SupabaseClient;
  userId: string;
} | null> {
  return createAuthenticatedClient(
    TEST_USERS.therapist.email,
    TEST_USERS.therapist.password
  );
}

/**
 * クリニックAのユーザーとして認証されたクライアントを作成
 */
export async function createClinicAClient(): Promise<{
  client: SupabaseClient;
  userId: string;
} | null> {
  return createAuthenticatedClient(
    TEST_USERS.clinicA.email,
    TEST_USERS.clinicA.password
  );
}

/**
 * クリニックBのユーザーとして認証されたクライアントを作成
 */
export async function createClinicBClient(): Promise<{
  client: SupabaseClient;
  userId: string;
} | null> {
  return createAuthenticatedClient(
    TEST_USERS.clinicB.email,
    TEST_USERS.clinicB.password
  );
}

/**
 * テスト用のランダム文字列を生成
 */
export function generateTestId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * テスト環境の検証
 *
 * @returns {object} 環境の検証結果
 *   - isValid: 環境変数が正しく設定されているか
 *   - shouldSkip: テストをスキップすべきか（E2E_RLS_ENABLED=false の場合）
 *   - reason: スキップ理由（スキップする場合のみ）
 */
export function validateTestEnvironment(): {
  isValid: boolean;
  shouldSkip: boolean;
  reason?: string;
} {
  // E2E_RLS_ENABLEDが設定されていない場合はスキップ
  if (!E2E_RLS_ENABLED) {
    return {
      isValid: true,
      shouldSkip: true,
      reason:
        'E2E RLSテストはスキップされます。実行するには E2E_RLS_ENABLED=true を設定してください。',
    };
  }

  // 環境変数の検証
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      isValid: false,
      shouldSkip: true,
      reason: 'Supabase環境変数が設定されていません',
    };
  }

  return {
    isValid: true,
    shouldSkip: false,
  };
}

/**
 * @deprecated 後方互換性のため残存。validateTestEnvironment() を使用してください。
 */
export function isE2ERLSEnabled(): boolean {
  return E2E_RLS_ENABLED;
}
