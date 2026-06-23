# TypeScript エラー修正 引き継ぎドキュメント

## 現状サマリー（2025-10-08 15:30更新）

### 進捗状況
- **初期エラー数**: 1200+ errors
- **現在のエラー数**: 608 errors
- **削減率**: 49.3% (592 errors削減)

### 完了したタスク

#### ✓ TS-001: Supabase型定義の追加
**場所**: `src/types/supabase.ts`

追加した定義:
```typescript
// profilesテーブル
profiles: {
  Row: {
    id: string;
    user_id: string;
    clinic_id: string | null;
    role: string;
    is_active: boolean;
    is_approved: boolean;
    created_at: string | null;
    updated_at: string | null;
  };
  // Insert, Update型も追加済み
}

// user_permissionsテーブル
user_permissions: {
  Row: {
    id: string;
    staff_id: string;
    clinic_id: string | null;
    role: string;
    created_at: string | null;
    updated_at: string | null;
  };
  // Insert, Update型も追加済み
}

// RPC関数
Functions: {
  get_table_columns: {
    Args: { table_name_param: string };
    Returns: Array<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>;
  };
}
```

#### ✓ TS-002: コア機能のPromise処理修正

**修正パターン**: `const supabase = createClient()` → `const supabase = await createClient()`

修正完了ファイル:
1. `src/lib/session-manager.ts` (7箇所)
   - すべての `this.supabase` 使用前に `const supabase = await this.supabase;` を追加

2. `src/lib/supabase/guards.ts`
   - `createClient()` に await追加
   - 演算子優先順位修正: `??` と `&&` を括弧で囲む

3. `middleware.ts`
   - `profile` データに型アサーション追加
   ```typescript
   type ProfileData = { role: string; clinic_id: string | null; is_active: boolean } | null;
   const typedProfile = profile as ProfileData;
   ```

4. `src/app/admin/(protected)/layout.tsx` (2箇所)
5. `src/app/admin/actions.ts` (3箇所)
6. `src/app/api/security/csp-report/route.ts`
7. `src/app/api/auth/profile/route.ts`
8. `src/app/api/admin/security/csp-violations/route.ts`
9. `src/app/api/admin/security/csp-stats/route.ts`

#### 🔄 TS-002A: APIルートのPromise処理修正（進行中）

**進捗**: 9/~215 ファイル完了

まだ修正が必要なファイル:
- `src/lib/mfa/mfa-manager.ts` (~20箇所)
- `src/lib/mfa/backup-codes.ts` (~15箇所)
- その他のAPIルートファイル (~180箇所)

---

## 残りの作業詳細

### Priority 1: lib/mfa ファイルの修正 (~35箇所)

**ファイル**:
- `src/lib/mfa/mfa-manager.ts`
- `src/lib/mfa/backup-codes.ts`

**修正パターン**:
```typescript
// Before
class MFAManager {
  private supabase;
  constructor() {
    this.supabase = createClient();
  }

  async someMethod() {
    await this.supabase.from('table')... // ❌ エラー
  }
}

// After
class MFAManager {
  private supabase;
  constructor() {
    this.supabase = createClient();
  }

  async someMethod() {
    const supabase = await this.supabase;
    await supabase.from('table')... // ✓ OK
  }
}
```

**検索コマンド**:
```bash
grep -n "await this\.supabase\.from" src/lib/mfa/*.ts
```

**修正が必要な行番号** (mfa-manager.ts):
- 96, 132, 159, 172, 203, 224, 267, 295, 335, 372, 412, 494行目 など

### Priority 2: テストデータの型修正 (~450箇所)

#### 問題1: UserSession に必須フィールドが不足

**エラー例**:
```
Type '{ id: string; user_id: string; ... }' is missing the following properties
from type 'UserSession': session_token, expires_at, absolute_timeout_at, is_active, and 4 more.
```

**解決策**: テストデータファクトリを作成

```typescript
// src/__tests__/helpers/test-factories.ts (新規作成推奨)
export function createTestUserSession(overrides?: Partial<UserSession>): UserSession {
  const now = new Date();
  return {
    id: 'test-session-id',
    user_id: 'test-user-id',
    clinic_id: 'test-clinic-id',
    session_token: 'test-token',
    device_info: {
      device: 'desktop',
      os: 'Linux',
      browser: 'Chrome',
    },
    created_at: now.toISOString(),
    last_activity: now.toISOString(),
    expires_at: new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString(),
    idle_timeout_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    absolute_timeout_at: new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString(),
    is_active: true,
    is_revoked: false,
    max_idle_minutes: 30,
    max_session_hours: 8,
    remember_device: false,
    ...overrides,
  };
}
```

**対象ファイル**:
- `src/__tests__/security/advanced-security.test.ts`
- `src/__tests__/session-management/security-monitor.test.ts`
- `src/__tests__/session-management/session-integration.test.ts`
- `src/__tests__/session-management/session-performance.test.ts`

#### 問題2: DeviceInfo に isMobile が不足

**エラー例**:
```
Object literal may only specify known properties, and 'isMobile' does not exist in type 'DeviceInfo'.
```

**解決策**: DeviceInfo 型定義を更新

```typescript
// src/lib/session-manager.ts
export interface DeviceInfo {
  device: string; // 'desktop' | 'mobile' | 'tablet'
  os: string;
  browser: string;
  version?: string;
  isMobile?: boolean; // ← 追加
}
```

#### 問題3: SecurityThreat severity に 'critical' が不足

**エラー例**:
```
Type '"critical"' is not assignable to type '"low" | "medium" | "high"'.
```

**解決策**: SecurityThreat 型の severity に 'critical' を追加

```typescript
// src/lib/security-monitor.ts (または該当する型定義ファイル)
export interface SecurityThreat {
  // ...
  severity: 'low' | 'medium' | 'high' | 'critical'; // ← 'critical' を追加
}
```

### Priority 3: Database query results の 'never' 型エラー (~40箇所)

**エラーパターン**:
```
Property 'id' does not exist on type 'never'.
Property 'clinic_id' does not exist on type 'never'.
```

**原因**: Supabase クエリの結果型が推論されていない

**解決策**: 型アサーションまたは明示的な型指定

```typescript
// パターン1: 型アサーション
const { data: clinic } = await supabase
  .from('clinics')
  .select('id, name')
  .single();

type ClinicData = { id: string; name: string } | null;
const typedClinic = clinic as ClinicData;

// パターン2: 型定義の確認
// supabase.ts に該当テーブルの定義があるか確認
```

**対象ファイル**:
- `src/app/api/admin/dashboard/route.ts`
- `src/app/api/admin/master-data/route.ts`
- その他の API route ファイル

### Priority 4: exactOptionalPropertyTypes エラー (2箇所)

**場所**: `middleware.ts:201, 224`

**エラー例**:
```
Type 'string | null | undefined' is not assignable to type 'string | undefined'
with 'exactOptionalPropertyTypes: true'.
```

**解決策**:
```typescript
// Before
clinicId: profile?.clinic_id, // clinic_id は string | null

// After
clinicId: profile?.clinic_id ?? undefined, // null を undefined に変換
```

---

## 実行コマンド集

### 型チェック
```bash
npm run type-check
```

### エラー数カウント
```bash
npm run type-check 2>&1 | grep "error TS" | wc -l
```

### エラータイプ分析
```bash
npm run type-check 2>&1 | grep "error TS" | sed 's/.*error TS[0-9]*: //' | sort | uniq -c | sort -rn | head -n 20
```

### 特定パターンの検索
```bash
# await が不足している箇所
grep -r "const supabase = createClient()" src/app/api --include="*.ts"
grep -r "const supabase = getServerClient()" src --include="*.ts"
grep -r "await this\.supabase\.from" src/lib --include="*.ts"

# never 型エラーの原因調査
grep -r "\.from\('profiles'\)" src --include="*.ts"
grep -r "\.from\('user_permissions'\)" src --include="*.ts"
```

---

## 推奨作業順序

1. **lib/mfa ファイルの修正** (1-2時間)
   - 最も修正箇所が集中しているため効率的
   - パターンが統一されているため機械的に修正可能

2. **DeviceInfo と SecurityThreat 型定義の修正** (15分)
   - 小さな変更で多くのエラーを解消できる

3. **テストデータファクトリの作成** (1時間)
   - 一度作成すれば多くのテストファイルで再利用可能

4. **残りのAPIルートの修正** (2-3時間)
   - 数が多いが、パターンは同じ

5. **never 型エラーの調査と修正** (1-2時間)
   - ケースバイケースで対応が必要

---

## 注意事項

### やってはいけないこと
- ❌ `// @ts-ignore` や `// @ts-expect-error` で黙らせる
- ❌ 型定義を `any` に変更する
- ❌ strict モードを無効化する

### 推奨される対応
- ✓ 型アサーション (`as` キーワード) を使う
- ✓ 型ガードを実装する
- ✓ 明示的な型定義を追加する
- ✓ テストデータファクトリを作成する

---

## 関連ドキュメント

- `docs/typescript_refactor_plan.yaml` - 全体計画と進捗
- `docs/MVP実装計画.yaml` - MVP実装の全体計画
- `src/types/supabase.ts` - Supabase型定義

---

## 最後に実行したコマンド

```bash
npm run type-check 2>&1 | tee /tmp/typecheck-output.txt
# Result: 608 errors
```

**日時**: 2025-10-08 15:30
**担当者**: Claude (Sonnet 4.5)
**次の担当者へ**: 上記のPriority順に従って修正を進めてください。質問があれば `typescript_refactor_plan.yaml` を参照してください。
