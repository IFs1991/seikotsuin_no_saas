# セキュリティ多層防御強化 TDD仕様書

## 概要

本仕様書は、セキュリティレビューで特定された3つの改善ポイントについて、TDD（テスト駆動開発）アプローチで実装するための仕様を定義する。

**実装ステータス: 完了** (2026-01-01)

### 改善対象

| # | 対象 | ファイル | 優先度 | ステータス |
|---|------|----------|--------|------------|
| 1 | PostgRESTフィルターインジェクション対策 | `src/app/api/customers/route.ts` | 高 | 完了 |
| 2 | 検索クエリ入力バリデーション強化 | `src/app/api/customers/schema.ts` | 中 | 完了 |
| 3 | セキュリティイベント更新時のクリニック認可チェック | `src/app/api/admin/security/events/route.ts` | 中 | 完了 |

### 現状のセキュリティ層

```
┌─────────────────────────────────────────────────────────────┐
│ 1. アプリケーション層                                        │
│    - Zod入力バリデーション                                   │
│    - processApiRequest() による認証・認可チェック             │
│    - Allowlist方式サニタイザー（NEW）                        │
│    - JWT/permissions基盤のclinic_id取得（NEW）               │
├─────────────────────────────────────────────────────────────┤
│ 2. データベース層                                            │
│    - Supabase RLS (Row Level Security)                      │
│    - PostgREST パラメータ化クエリ                            │
└─────────────────────────────────────────────────────────────┘
```

### 目標

既存のRLSによる保護に加え、アプリケーション層での多層防御を強化する。

---

## 1. PostgRESTフィルターインジェクション対策

### 1.1 問題と解決策

**問題:**
```typescript
// 修正前: src/app/api/customers/route.ts:66-68
if (q) {
  query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
}
```

検索クエリ `q` が直接PostgRESTフィルター文字列に挿入されており、特殊文字（`,`, `.`, `%`）によるフィルター構文の操作が理論上可能。

**解決策:**
- ~~エスケープ方式~~ → **Allowlist方式**を採用
- エスケープ方式は`.or()`構文でバイパス可能なリスクがあるため不採用
- 許可された文字のみを通過させ、それ以外は削除

### 1.2 テストケース

**ファイル:** `src/__tests__/lib/postgrest-sanitizer.test.ts`

```typescript
import { sanitizePostgrestValue, buildSafeSearchFilter, isValidSearchInput } from '@/lib/postgrest-sanitizer';

describe('PostgREST Sanitizer (Allowlist方式)', () => {
  describe('sanitizePostgrestValue', () => {
    it('通常の文字列はそのまま返す', () => {
      expect(sanitizePostgrestValue('田中太郎')).toBe('田中太郎');
      expect(sanitizePostgrestValue('tanaka')).toBe('tanaka');
      expect(sanitizePostgrestValue('090-1234-5678')).toBe('090-1234-5678');
    });

    it('PostgREST特殊文字（カンマ）を削除する', () => {
      // カンマはフィルター区切り文字 - Allowlistにないので削除
      expect(sanitizePostgrestValue('test,injection')).toBe('testinjection');
    });

    it('ピリオドは許可する（メールアドレス用）', () => {
      // ピリオドはメールアドレス検索で必要なため許可
      expect(sanitizePostgrestValue('test.injection')).toBe('test.injection');
      expect(sanitizePostgrestValue('user@example.com')).toBe('user@example.com');
    });

    it('パーセント記号を削除する', () => {
      // パーセントはワイルドカード - 削除
      expect(sanitizePostgrestValue('100%')).toBe('100');
    });

    it('括弧を削除する', () => {
      expect(sanitizePostgrestValue('test(injection)')).toBe('testinjection');
      expect(sanitizePostgrestValue('test[injection]')).toBe('testinjection');
    });

    it('複合的なインジェクション試行から危険な文字を削除する', () => {
      const malicious = '%,is_deleted.eq.true,name.ilike.%';
      const sanitized = sanitizePostgrestValue(malicious);
      // カンマとパーセントが削除される
      expect(sanitized).not.toContain('%');
      expect(sanitized).not.toContain(',');
      // 安全な文字のみ残る
      expect(sanitized).toBe('is_deleted.eq.truename.ilike.');
    });

    it('空文字列を処理する', () => {
      expect(sanitizePostgrestValue('')).toBe('');
    });

    it('null/undefinedを安全に処理する', () => {
      expect(sanitizePostgrestValue(null as unknown as string)).toBe('');
      expect(sanitizePostgrestValue(undefined as unknown as string)).toBe('');
    });

    it('Unicode文字を正しく処理する', () => {
      expect(sanitizePostgrestValue('佐藤花子')).toBe('佐藤花子');
      expect(sanitizePostgrestValue('カタカナ')).toBe('カタカナ');
      expect(sanitizePostgrestValue('ひらがな')).toBe('ひらがな');
    });

    it('全角文字を正しく処理する', () => {
      expect(sanitizePostgrestValue('０９０ー１２３４ー５６７８')).toBe('０９０ー１２３４ー５６７８');
    });
  });

  describe('isValidSearchInput', () => {
    it('許可された文字のみの入力はtrueを返す', () => {
      expect(isValidSearchInput('田中太郎')).toBe(true);
      expect(isValidSearchInput('tanaka')).toBe(true);
      expect(isValidSearchInput('090-1234-5678')).toBe(true);
      expect(isValidSearchInput('user@example.com')).toBe(true);
    });

    it('危険な文字を含む入力はfalseを返す', () => {
      expect(isValidSearchInput('test,injection')).toBe(false);
      expect(isValidSearchInput('100%')).toBe(false);
      expect(isValidSearchInput('test()')).toBe(false);
    });

    it('空文字列はtrueを返す', () => {
      expect(isValidSearchInput('')).toBe(true);
    });
  });

  describe('buildSafeSearchFilter', () => {
    it('単一カラムの検索フィルターを構築する', () => {
      const filter = buildSafeSearchFilter('田中', ['name']);
      expect(filter).toBe('name.ilike.%田中%');
    });

    it('複数カラムの検索フィルターを構築する', () => {
      const filter = buildSafeSearchFilter('田中', ['name', 'phone']);
      expect(filter).toBe('name.ilike.%田中%,phone.ilike.%田中%');
    });

    it('特殊文字を含むクエリから危険な文字を削除して処理する', () => {
      const filter = buildSafeSearchFilter('test,injection', ['name']);
      // カンマが削除されて安全に処理
      expect(filter).toBe('name.ilike.%testinjection%');
    });

    it('空のクエリでnullを返す', () => {
      expect(buildSafeSearchFilter('', ['name'])).toBeNull();
      expect(buildSafeSearchFilter('   ', ['name'])).toBeNull();
    });

    it('clinic_idインジェクション試行を防ぐ', () => {
      const maliciousQuery = '%,clinic_id.neq.550e8400,name.ilike.%';
      const filter = buildSafeSearchFilter(maliciousQuery, ['name']);
      // カンマとパーセントが削除されるため、インジェクションは成立しない
      expect(filter).not.toContain(',clinic_id');
      expect(filter).not.toContain('%,');
    });

    it('メールアドレス検索が正しく動作する', () => {
      const filter = buildSafeSearchFilter('user@example.com', ['email']);
      expect(filter).toBe('email.ilike.%user@example.com%');
    });
  });
});
```

### 1.3 実装仕様

**ファイル:** `src/lib/postgrest-sanitizer.ts`

```typescript
/**
 * PostgRESTクエリ用サニタイザー
 * フィルター構文インジェクションを防止するためのユーティリティ
 *
 * セキュリティ設計方針：Allowlist方式
 * - 許可された文字のみを通過させる
 * - エスケープ方式は.or()構文でバイパス可能なリスクがあるため不採用
 *
 * 許可文字：
 * - 日本語文字（ひらがな、カタカナ、漢字）
 * - 英数字（a-z, A-Z, 0-9）
 * - ハイフン、スペース（電話番号・姓名区切り用）
 * - 一部記号（@._- メールアドレス用）
 */

// 許可文字のパターン（Allowlist）
// 日本語: \u3040-\u309F（ひらがな）, \u30A0-\u30FF（カタカナ）, \u4E00-\u9FFF（漢字）
// 英数字: a-zA-Z0-9
// 許可記号: スペース, ハイフン, アンダースコア, @, .（メールアドレス用）
const ALLOWED_CHARS_PATTERN =
  /^[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEFa-zA-Z0-9\s\-_@.]+$/;

// 許可されていない文字を削除するパターン
const DISALLOWED_CHARS_PATTERN =
  /[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEFa-zA-Z0-9\s\-_@.]/g;

/**
 * PostgRESTフィルター値をサニタイズする（Allowlist方式）
 * 許可されていない文字を削除
 */
export function sanitizePostgrestValue(
  value: string | null | undefined
): string {
  if (value == null) return '';
  return value.replace(DISALLOWED_CHARS_PATTERN, '');
}

/**
 * 入力値がAllowlistに適合しているか検証
 */
export function isValidSearchInput(value: string): boolean {
  if (!value) return true;
  return ALLOWED_CHARS_PATTERN.test(value);
}

/**
 * 安全な検索フィルター文字列を構築する
 */
export function buildSafeSearchFilter(
  query: string,
  columns: string[]
): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const sanitized = sanitizePostgrestValue(trimmed);
  return columns.map(col => `${col}.ilike.%${sanitized}%`).join(',');
}
```

**修正ファイル:** `src/app/api/customers/route.ts`

```typescript
// インポート追加
import { buildSafeSearchFilter } from '@/lib/postgrest-sanitizer';

// 修正箇所（66-73行目）
let query = guard.supabase.from('customers').select('*').eq('clinic_id', clinic_id).eq('is_deleted', false);
if (q) {
  // PostgRESTフィルターインジェクション対策: 特殊文字をエスケープ
  const searchFilter = buildSafeSearchFilter(q, ['name', 'phone']);
  if (searchFilter) {
    query = query.or(searchFilter);
  }
}
```

---

## 2. 検索クエリ入力バリデーション強化

### 2.1 問題と解決策

**問題:**
```typescript
// 修正前: src/app/api/customers/schema.ts:20
q: z.string().optional(),  // 長さ制限・文字制限なし
```

**解決策:**
- 最大100文字の長さ制限
- 前後の空白をトリム
- 空白のみの場合はundefinedに変換

### 2.2 テストケース

**ファイル:** `src/__tests__/api/customers-schema.test.ts`

```typescript
import { customersQuerySchema, searchQuerySchema } from '@/app/api/customers/schema';

describe('customersQuerySchema', () => {
  describe('検索クエリ (q) バリデーション', () => {
    it('有効な検索クエリを受け入れる', () => {
      const validCases = [
        { clinic_id: '550e8400-e29b-41d4-a716-446655440000', q: '田中' },
        { clinic_id: '550e8400-e29b-41d4-a716-446655440000', q: '090-1234-5678' },
        { clinic_id: '550e8400-e29b-41d4-a716-446655440000', q: 'tanaka' },
        { clinic_id: '550e8400-e29b-41d4-a716-446655440000', q: '田中 太郎' },
        { clinic_id: '550e8400-e29b-41d4-a716-446655440000' }, // qはオプション
      ];

      validCases.forEach(testCase => {
        const result = customersQuerySchema.safeParse(testCase);
        expect(result.success).toBe(true);
      });
    });

    it('長すぎる検索クエリを拒否する（100文字超）', () => {
      const result = customersQuerySchema.safeParse({
        clinic_id: '550e8400-e29b-41d4-a716-446655440000',
        q: 'a'.repeat(101),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('q');
      }
    });

    it('100文字ちょうどの検索クエリを受け入れる', () => {
      const result = customersQuerySchema.safeParse({
        clinic_id: '550e8400-e29b-41d4-a716-446655440000',
        q: 'a'.repeat(100),
      });
      expect(result.success).toBe(true);
    });

    it('空白のみの検索クエリをundefinedに変換する', () => {
      const result = customersQuerySchema.safeParse({
        clinic_id: '550e8400-e29b-41d4-a716-446655440000',
        q: '   ',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.q).toBeUndefined();
      }
    });

    it('前後の空白をトリムする', () => {
      const result = customersQuerySchema.safeParse({
        clinic_id: '550e8400-e29b-41d4-a716-446655440000',
        q: '  田中  ',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.q).toBe('田中');
      }
    });
  });
});

describe('searchQuerySchema', () => {
  it('日本語文字を許可する', () => {
    expect(searchQuerySchema.safeParse('漢字ひらがなカタカナ').success).toBe(true);
  });

  it('英数字を許可する', () => {
    expect(searchQuerySchema.safeParse('abc123').success).toBe(true);
  });

  it('電話番号形式を許可する', () => {
    expect(searchQuerySchema.safeParse('090-1234-5678').success).toBe(true);
    expect(searchQuerySchema.safeParse('03-1234-5678').success).toBe(true);
  });

  it('スペースを許可する', () => {
    expect(searchQuerySchema.safeParse('田中 太郎').success).toBe(true);
  });

  it('特殊文字を含む入力もバリデーションを通過する（サニタイザーで処理）', () => {
    // 特殊文字はスキーマレベルでは許可し、サニタイザーでエスケープする
    const cases = ['%%%', '...', ',,,', '()'];
    cases.forEach(testCase => {
      const result = searchQuerySchema.safeParse(testCase);
      expect(result.success).toBe(true);
    });
  });

  it('空文字列はundefinedに変換される', () => {
    const result = searchQuerySchema.safeParse('');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });
});
```

### 2.3 実装仕様

**修正ファイル:** `src/app/api/customers/schema.ts`

```typescript
import { z } from 'zod';
import type { Database } from '@/types/supabase';

/**
 * 検索クエリ用スキーマ
 * - 最大100文字
 * - 前後の空白をトリム
 * - 空白のみの場合はundefinedに変換
 */
export const searchQuerySchema = z
  .string()
  .max(100, '検索クエリは100文字以内で入力してください')
  .transform(value => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  })
  .optional();

// ... 既存コード ...

export const customersQuerySchema = z.object({
  clinic_id: z.string().uuid('有効なクリニックIDを指定してください'),
  q: searchQuerySchema,
  id: z.string().uuid('有効な顧客IDを指定してください').optional(),
});
```

---

## 3. セキュリティイベント更新時のクリニック認可チェック

### 3.1 問題と解決策

**問題:**
```typescript
// 修正前: src/app/api/admin/security/events/route.ts:191-197
const { data: updatedEvent, error } = await supabase
  .from('security_events')
  .update(updateData)
  .eq('id', id)  // clinic_idチェックなし
  .select()
  .single();
```

**解決策:**
- ~~リクエストからclinic_idを受け取る~~ → **JWT/permissionsからclinic_idを取得**
- リクエストパラメータは信頼せず、認証済みのpermissionsを正とする
- これにより、テナント間データ漏洩のリスクを根本的に排除

### 3.2 テストケース

**ファイル:** `src/__tests__/api/security-events-authorization.test.ts`

```typescript
import { PATCH } from '@/app/api/admin/security/events/route';
import { NextRequest } from 'next/server';

jest.mock('@/lib/api-helpers', () => ({
  processApiRequest: jest.fn(),
  createSuccessResponse: jest.fn((data) =>
    new Response(JSON.stringify(data), { status: 200 })
  ),
  createErrorResponse: jest.fn((msg, status) =>
    new Response(JSON.stringify({ error: msg }), { status })
  ),
  logError: jest.fn(),
}));

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logAdminAction: jest.fn(),
  },
}));

// テスト用UUID
const CLINIC_A_ID = '550e8400-e29b-41d4-a716-446655440001';
const CLINIC_B_ID = '550e8400-e29b-41d4-a716-446655440002';
const CLINIC_ID = '550e8400-e29b-41d4-a716-446655440003';
const EVENT_ID = '660e8400-e29b-41d4-a716-446655440001';
const ADMIN_ID = '770e8400-e29b-41d4-a716-446655440001';

describe('PATCH /api/admin/security/events - クリニック認可', () => {
  const createMockSupabase = () => ({
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
  });

  const createMockRequest = (body: object) => {
    return new NextRequest('http://localhost/api/admin/security/events', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('permissions.clinic_idを使用してイベント更新を許可する', async () => {
    const mockSupabase = createMockSupabase();
    const { processApiRequest } = require('@/lib/api-helpers');

    // clinic_idはpermissionsから取得（リクエストには含まない）
    processApiRequest.mockResolvedValue({
      success: true,
      supabase: mockSupabase,
      auth: { id: ADMIN_ID, email: 'admin@clinic-a.com' },
      permissions: { clinic_id: CLINIC_A_ID, role: 'admin' },
      body: { id: EVENT_ID, status: 'resolved' }, // clinic_idは不要
    });

    mockSupabase.single.mockResolvedValue({
      data: { id: EVENT_ID, clinic_id: CLINIC_A_ID, status: 'resolved' },
      error: null,
    });

    const request = createMockRequest({
      id: EVENT_ID,
      status: 'resolved',
      // clinic_idは不要（JWTから取得）
    });
    const response = await PATCH(request);

    expect(response.status).toBe(200);
    // permissions.clinic_idでフィルタリングされることを確認
    expect(mockSupabase.eq).toHaveBeenCalledWith('clinic_id', CLINIC_A_ID);
  });

  it('permissions.clinic_idが未設定の場合は403を返す', async () => {
    const mockSupabase = createMockSupabase();
    const { processApiRequest, createErrorResponse } = require('@/lib/api-helpers');

    // clinic_idがpermissionsに含まれていない
    processApiRequest.mockResolvedValue({
      success: true,
      supabase: mockSupabase,
      auth: { id: ADMIN_ID, email: 'admin@test.com' },
      permissions: { role: 'admin' }, // clinic_idなし
      body: { id: EVENT_ID, status: 'resolved' },
    });

    const request = createMockRequest({
      id: EVENT_ID,
      status: 'resolved',
    });
    const response = await PATCH(request);

    // clinic_idが特定できないため403
    expect(response.status).toBe(403);
    expect(createErrorResponse).toHaveBeenCalledWith(
      expect.stringContaining('クリニックID'),
      403
    );
  });

  it('更新クエリにpermissions.clinic_idフィルターが含まれる', async () => {
    const mockSupabase = createMockSupabase();
    const { processApiRequest } = require('@/lib/api-helpers');

    processApiRequest.mockResolvedValue({
      success: true,
      supabase: mockSupabase,
      auth: { id: ADMIN_ID, email: 'admin@test.com' },
      permissions: { clinic_id: CLINIC_ID, role: 'admin' },
      body: { id: EVENT_ID, status: 'resolved' },
    });

    mockSupabase.single.mockResolvedValue({
      data: { id: EVENT_ID, clinic_id: CLINIC_ID },
      error: null,
    });

    const request = createMockRequest({
      id: EVENT_ID,
      status: 'resolved',
    });

    await PATCH(request);

    // updateクエリにclinic_id条件（permissionsから取得）が含まれることを確認
    const eqCalls = mockSupabase.eq.mock.calls;
    const clinicIdCall = eqCalls.find(
      (call: [string, string]) => call[0] === 'clinic_id'
    );
    expect(clinicIdCall).toBeDefined();
    expect(clinicIdCall?.[1]).toBe(CLINIC_ID);
  });

  it('イベントが見つからない場合は404を返す', async () => {
    const mockSupabase = createMockSupabase();
    const { processApiRequest } = require('@/lib/api-helpers');
    const nonExistentEventId = '880e8400-e29b-41d4-a716-446655440001';

    processApiRequest.mockResolvedValue({
      success: true,
      supabase: mockSupabase,
      auth: { id: ADMIN_ID, email: 'admin@test.com' },
      permissions: { clinic_id: CLINIC_ID, role: 'admin' },
      body: { id: nonExistentEventId, status: 'resolved' },
    });

    // clinic_idフィルター後、該当なしでPGRST116エラー
    mockSupabase.single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'not found' },
    });

    const request = createMockRequest({
      id: nonExistentEventId,
      status: 'resolved',
    });
    const response = await PATCH(request);

    expect(response.status).toBe(404);
  });

  it('監査ログにpermissions.clinic_idが含まれる', async () => {
    const mockSupabase = createMockSupabase();
    const { processApiRequest } = require('@/lib/api-helpers');
    const { AuditLogger } = require('@/lib/audit-logger');

    processApiRequest.mockResolvedValue({
      success: true,
      supabase: mockSupabase,
      auth: { id: ADMIN_ID, email: 'admin@test.com' },
      permissions: { clinic_id: CLINIC_ID, role: 'admin' },
      body: { id: EVENT_ID, status: 'resolved' },
    });

    mockSupabase.single.mockResolvedValue({
      data: { id: EVENT_ID, clinic_id: CLINIC_ID, status: 'resolved' },
      error: null,
    });

    const request = createMockRequest({
      id: EVENT_ID,
      status: 'resolved',
    });

    await PATCH(request);

    // 監査ログにpermissionsから取得したclinic_idが含まれる
    expect(AuditLogger.logAdminAction).toHaveBeenCalledWith(
      ADMIN_ID,
      'admin@test.com',
      'update_security_event',
      EVENT_ID,
      expect.objectContaining({ clinic_id: CLINIC_ID })
    );
  });
});
```

### 3.3 実装仕様

**修正ファイル:** `src/app/api/admin/security/events/route.ts`

```typescript
// イベント更新スキーマ
// 注意: clinic_idはリクエストから受け取らず、JWTのpermissionsから取得する（設計改善）
const UpdateEventSchema = z.object({
  id: z.string().uuid('有効なイベントIDを指定してください'),
  status: z.enum(VALID_STATUSES).optional(),
  resolution_notes: z
    .string()
    .max(2000, '解決メモは2000文字以内で入力してください')
    .optional(),
  actions_taken: z.array(z.string()).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
});

// PATCH関数内の修正箇所
const { id, status, resolution_notes, actions_taken, assigned_to } =
  parseResult.data;

// clinic_idはJWT/permissionsから取得（リクエストから受け取らない）
// これにより、テナント間データ漏洩のリスクを根本的に排除
const clinic_id = permissions.clinic_id;
if (!clinic_id) {
  return createErrorResponse('クリニックIDが特定できません', 403);
}

// ... 更新データ構築 ...

// 更新実行（clinic_idフィルターを追加して多層防御）
const { data: updatedEvent, error } = await supabase
  .from('security_events')
  .update(updateData)
  .eq('id', id)
  .eq('clinic_id', clinic_id)  // permissions.clinic_idでフィルター
  .select()
  .single();
```

---

## 4. 実装順序（TDDフロー）

### Phase 1: PostgRESTサニタイザー ✅ 完了

```mermaid
graph TD
    A[1. テスト作成: postgrest-sanitizer.test.ts] --> B[2. 実装: postgrest-sanitizer.ts]
    B --> C[3. テスト実行・GREEN確認]
    C --> D[4. route.tsに統合]
    D --> E[5. 統合テスト実行]
```

### Phase 2: スキーマバリデーション強化 ✅ 完了

```mermaid
graph TD
    A[1. テスト作成: customers-schema.test.ts] --> B[2. スキーマ修正: schema.ts]
    B --> C[3. テスト実行・GREEN確認]
    C --> D[4. 既存テストの確認]
```

### Phase 3: セキュリティイベント認可強化 ✅ 完了

```mermaid
graph TD
    A[1. テスト作成: security-events-authorization.test.ts] --> B[2. route.ts修正]
    B --> C[3. テスト実行・GREEN確認]
    C --> D[4. 既存テストの確認]
```

---

## 5. 受け入れ基準

### 5.1 機能要件 ✅ 全て達成

| # | 要件 | テスト | ステータス |
|---|------|--------|------------|
| 1 | PostgREST特殊文字がAllowlistで除外される | `postgrest-sanitizer.test.ts` | ✅ Pass |
| 2 | 検索クエリが100文字以内に制限される | `customers-schema.test.ts` | ✅ Pass |
| 3 | セキュリティイベント更新時にpermissions.clinic_idでフィルタリング | `security-events-authorization.test.ts` | ✅ Pass |

### 5.2 非機能要件 ✅ 全て達成

| # | 要件 | 確認方法 | ステータス |
|---|------|----------|------------|
| 1 | 既存機能に影響がない | 全テストスイートがパス | ✅ 49 tests passed |
| 2 | パフォーマンスに影響がない | サニタイズ処理は O(n) | ✅ 達成 |
| 3 | エラーメッセージが適切 | テストでエラーメッセージを確認 | ✅ 達成 |

### 5.3 テスト結果

```bash
Test Suites: 4 passed, 4 total
Tests:       49 passed, 49 total
```

---

## 6. リスクと考慮事項

### 6.1 後方互換性

- 検索クエリの100文字制限により、既存のUIで長いクエリを入力していた場合は影響あり
- フロントエンド側でも同様の制限を追加することを推奨
- **セキュリティイベントAPI**: clinic_idをリクエストから受け取らなくなったため、フロントエンド側の修正が必要

### 6.2 RLSとの関係

- アプリケーション層のチェックはRLSの代替ではなく、多層防御として機能
- RLSが引き続き最終的なセキュリティ境界となる

### 6.3 監査ログ

- セキュリティイベント更新時にpermissions.clinic_idを監査ログに含めることで、追跡可能性が向上

### 6.4 設計改善ポイント（セキュリティPMレビュー反映）

1. **Allowlist方式の採用**: エスケープ方式は`.or()`構文でバイパス可能なリスクがあったため、Allowlist方式に変更
2. **clinic_idの取得元変更**: リクエストパラメータではなくJWT/permissionsから取得することで、設計負債を解消し、テナント間データ漏洩リスクを根本排除

---

## 7. チェックリスト

- [x] Phase 1: PostgRESTサニタイザー
  - [x] テストファイル作成: `src/__tests__/lib/postgrest-sanitizer.test.ts`
  - [x] 実装ファイル作成: `src/lib/postgrest-sanitizer.ts`
  - [x] `src/app/api/customers/route.ts` への統合
  - [x] 全テストパス確認

- [x] Phase 2: スキーマバリデーション強化
  - [x] テストファイル作成: `src/__tests__/api/customers-schema.test.ts`
  - [x] `src/app/api/customers/schema.ts` の修正
  - [x] 全テストパス確認

- [x] Phase 3: セキュリティイベント認可強化
  - [x] テストファイル作成: `src/__tests__/api/security-events-authorization.test.ts`
  - [x] `src/app/api/admin/security/events/route.ts` の修正
  - [x] 全テストパス確認

- [x] 最終確認
  - [x] 関連テスト実行: 49 tests passed
  - [x] フォーマット実行: prettier --write

---

## 8. 変更履歴

| 日付 | 変更内容 | 担当 |
|------|----------|------|
| 2026-01-01 | 初版作成 | - |
| 2026-01-01 | Phase 1-3 実装完了 | Claude |
| 2026-01-01 | セキュリティPMレビュー反映: Allowlist方式採用、clinic_id取得元変更 | Claude |
