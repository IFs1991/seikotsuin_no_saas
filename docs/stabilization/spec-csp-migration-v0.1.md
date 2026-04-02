# CSP/Security Alerts Migration SSOT Spec v0.1

- 作成日: 2026-03-31
- バージョン: v0.1
- ステータス: APPROVED
- 優先度: P2 (DOD-11 Jest 残課題)
- 関連: `diff-instructions-2026-03-30.md §4 "Jest 残1 suite"`, `DoD-v0.1.md DOD-11`

---

## 1. 目的

`src/lib/database/csp-violations-schema.sql` および `src/lib/database/security-alerts-schema.sql` に記載されていたスキーマを、正式な名前付き migration ファイルとして形式化する（SSOT 統合）。

両テーブルはすでに squashed baseline migration に存在するため、本 migration は **スキーマ変更ではなく冪等な SSOT 宣言**である。

### 達成目標

- `src/__tests__/api/csp-security-migration.test.ts` の Red 1（7テスト）を green にする
- `describe.skip` を `describe` に戻し、全 Jest suite が 117/117 pass の状態を維持する
- deprecated 参照ファイルを migration SSOT に置き換え、`clinic_users` パターンの廃止を記録する

---

## 2. スコープ

### 対象ファイル（作成）

| ファイル | 内容 |
|---------|------|
| `supabase/migrations/20260304000100_csp_security_alerts_migration_ssot.sql` | 冪等な SSOT migration SQL |
| `supabase/migrations/20260304000100_csp_security_alerts_migration_ssot_rollback.sql` | rollback SQL |

### 対象ファイル（変更）

| ファイル | 変更内容 |
|---------|---------|
| `src/__tests__/api/csp-security-migration.test.ts` | `describe.skip` → `describe`（コメント更新） |
| `docs/stabilization/rollbacks/20260304000100_csp_security_alerts_migration_ssot_rollback.sql` | `.superseded` にリネーム（破壊的な旧 stub を無効化） |

### 非スコープ

- VIEW (`csp_violation_stats`, `csp_threat_analysis`, `security_alert_summary`, `high_frequency_alert_ips`) の変更
- FUNCTION / TRIGGER の変更
- `src/lib/database/*.sql` の内容変更（DEPRECATED ヘッダーは既存のまま維持）
- データマイグレーション

---

## 3. 現状証跡（Baseline スキーマ）

### 3.1 `csp_violations` テーブル

**出典**: `supabase/migrations/00000000000001_squashed_baseline.sql` L1894-L1921

```sql
CREATE TABLE IF NOT EXISTS "public"."csp_violations" (
    "id"                  uuid DEFAULT gen_random_uuid() NOT NULL,
    "clinic_id"           uuid,                          -- FK → clinics.id ON DELETE SET NULL
    "document_uri"        text NOT NULL,
    "violated_directive"  text NOT NULL,
    "blocked_uri"         text,
    "effective_directive" text,
    "original_policy"     text,
    "disposition"         text DEFAULT 'report',         -- CHECK: enforce | report
    "line_number"         integer,
    "column_number"       integer,
    "source_file"         text,
    "script_sample"       text,
    "referrer"            text,
    "client_ip"           inet,
    "user_agent"          text,
    "severity"            text DEFAULT 'low' NOT NULL,   -- CHECK: low | medium | high | critical
    "threat_score"        integer DEFAULT 0,             -- CHECK: 0 ≤ x ≤ 100
    "is_false_positive"   boolean DEFAULT false,
    "notes"               text,
    "reviewed_by"         uuid,                          -- FK → auth.users.id
    "reviewed_at"         timestamp with time zone,
    "created_at"          timestamp with time zone DEFAULT now(),
    "updated_at"          timestamp with time zone DEFAULT now()
);
```

**INDEX**（baseline L3531-L3539）:

| インデックス名 | カラム |
|---------------|--------|
| `idx_csp_violations_clinic_id` | `clinic_id` |
| `idx_csp_violations_created_at` | `created_at DESC` |
| `idx_csp_violations_severity` | `severity` |

**FK**（baseline L4258-L4264）:
- `clinic_id` → `clinics.id` ON DELETE SET NULL
- `reviewed_by` → `auth.users.id`

**RLS**（baseline L4931-L4942）:

| ポリシー名 | 操作 | 条件 |
|-----------|------|------|
| `csp_violations_insert_any` | INSERT | `WITH CHECK (true)` — 未認証含む全ユーザー許可 |
| `csp_violations_select_admin` | SELECT | `get_current_role() IN ('admin','clinic_admin') AND (clinic_id IS NULL OR can_access_clinic(clinic_id))` |
| `csp_violations_update_admin` | UPDATE | 同上 |

---

### 3.2 `security_alerts` テーブル

**出典**: `supabase/migrations/00000000000001_squashed_baseline.sql` L2645-L2664

```sql
CREATE TABLE IF NOT EXISTS "public"."security_alerts" (
    "id"         uuid DEFAULT gen_random_uuid() NOT NULL,
    "clinic_id"  uuid,                     -- FK → clinics.id ON DELETE SET NULL
    "type"       text NOT NULL,            -- CHECK: csp_violation | rate_limit | authentication | data_breach | system
    "severity"   text NOT NULL,            -- CHECK: low | medium | high | critical
    "title"      text NOT NULL,
    "message"    text NOT NULL,
    "details"    jsonb,
    "client_ip"  inet,
    "user_agent" text,
    "source"     text,
    "status"     text DEFAULT 'new',       -- CHECK: new | reviewing | resolved | false_positive
    "resolved_at" timestamp with time zone,
    "resolved_by" uuid,                    -- FK → auth.users.id
    "created_at"  timestamp with time zone DEFAULT now(),
    "updated_at"  timestamp with time zone DEFAULT now()
);
```

**INDEX**（baseline L3867-L3879）:

| インデックス名 | カラム |
|---------------|--------|
| `idx_security_alerts_clinic_id` | `clinic_id` |
| `idx_security_alerts_created_at` | `created_at DESC` |
| `idx_security_alerts_severity` | `severity` |
| `idx_security_alerts_type` | `type` |

**FK**（baseline L4483-L4489）:
- `clinic_id` → `clinics.id` ON DELETE SET NULL
- `resolved_by` → `auth.users.id`

**RLS**（baseline L5192-L5203）:

| ポリシー名 | 操作 | 条件 |
|-----------|------|------|
| `security_alerts_insert_any` | INSERT | `WITH CHECK (true)` |
| `security_alerts_select_admin` | SELECT | `get_current_role() IN ('admin','clinic_admin') AND (clinic_id IS NULL OR can_access_clinic(clinic_id))` |
| `security_alerts_update_admin` | UPDATE | 同上 |

---

### 3.3 ヘルパー関数

**出典**: baseline L340-L382

- `can_access_clinic(target_clinic_id uuid) RETURNS boolean` — JWT claims の `clinic_scope_ids` で判定。parent-scope モデル対応。
- `get_current_role() RETURNS text` — JWT metadata の role を返す。

いずれもベースラインに存在済み。migration での再定義は不要。

---

### 3.4 廃止対象のパターン

`src/lib/database/csp-violations-schema.sql` および `src/lib/database/security-alerts-schema.sql`（両ファイル L99-L107 付近）には `clinic_users` テーブルを直接参照する旧 RLS パターンが存在する:

```sql
-- ❌ 廃止パターン（使用禁止）
EXISTS (SELECT 1 FROM clinic_users cu WHERE cu.user_id = auth.uid() AND cu.role IN ('admin', 'owner'))
```

migration SQL では `clinic_users` を **一切参照しない**。テスト 7 がこれを保証する。

---

## 4. Migration SQL 設計方針

### 冪等性

migration は既存 DB に安全に適用できる冪等な SQL のみ使用する:

| DDL | 冪等パターン |
|-----|------------|
| テーブル作成 | `CREATE TABLE IF NOT EXISTS` |
| インデックス作成 | `CREATE INDEX IF NOT EXISTS` |
| RLS ポリシー | `DROP POLICY IF EXISTS` → `CREATE POLICY` |
| FK 制約 | `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$` |

### RLS パターン統一

- ✅ `get_current_role()` + `can_access_clinic(clinic_id)`
- ❌ `clinic_users` テーブル直接参照（禁止）

---

## 5. Migration SQL ドラフト

> ここに記載する SQL が migration ファイルの正本となる。

```sql
-- ================================================================
-- Migration: CSP/Security Alerts テーブル SSOT
-- ================================================================
-- ファイル: 20260304000100_csp_security_alerts_migration_ssot.sql
-- 作成日:  2026-03-04 (タイムスタンプ) / 文書化: 2026-03-31
-- 目的:    csp_violations + security_alerts を SSOT migration として形式化
-- 背景:    両テーブルは squashed baseline (00000000000001) に存在済み。
--          本 migration は冪等宣言であり、スキーマ変更ではない。
-- 関連:    docs/stabilization/spec-csp-migration-v0.1.md
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1. csp_violations テーブル（冪等）
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.csp_violations (
    id                  uuid    DEFAULT gen_random_uuid() NOT NULL,
    clinic_id           uuid,
    document_uri        text    NOT NULL,
    violated_directive  text    NOT NULL,
    blocked_uri         text,
    effective_directive text,
    original_policy     text,
    disposition         text    DEFAULT 'report',
    line_number         integer,
    column_number       integer,
    source_file         text,
    script_sample       text,
    referrer            text,
    client_ip           inet,
    user_agent          text,
    severity            text    DEFAULT 'low' NOT NULL,
    threat_score        integer DEFAULT 0,
    is_false_positive   boolean DEFAULT false,
    notes               text,
    reviewed_by         uuid,
    reviewed_at         timestamp with time zone,
    created_at          timestamp with time zone DEFAULT now(),
    updated_at          timestamp with time zone DEFAULT now(),
    CONSTRAINT csp_violations_pkey               PRIMARY KEY (id),
    CONSTRAINT csp_violations_disposition_check  CHECK (disposition IN ('enforce', 'report')),
    CONSTRAINT csp_violations_severity_check     CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT csp_violations_threat_score_check CHECK (threat_score >= 0 AND threat_score <= 100)
);

-- FK: clinic_id → clinics.id
DO $$ BEGIN
    ALTER TABLE public.csp_violations
        ADD CONSTRAINT csp_violations_clinic_id_fkey
        FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: reviewed_by → auth.users
DO $$ BEGIN
    ALTER TABLE public.csp_violations
        ADD CONSTRAINT csp_violations_reviewed_by_fkey
        FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- INDEX
CREATE INDEX IF NOT EXISTS idx_csp_violations_clinic_id  ON public.csp_violations (clinic_id);
CREATE INDEX IF NOT EXISTS idx_csp_violations_created_at ON public.csp_violations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_csp_violations_severity   ON public.csp_violations (severity);

-- RLS
ALTER TABLE public.csp_violations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "csp_violations_insert_any"   ON public.csp_violations;
DROP POLICY IF EXISTS "csp_violations_select_admin" ON public.csp_violations;
DROP POLICY IF EXISTS "csp_violations_update_admin" ON public.csp_violations;

-- 未認証ユーザーからの CSP レポートも受け付けるため INSERT は全許可
CREATE POLICY "csp_violations_insert_any" ON public.csp_violations
    FOR INSERT WITH CHECK (true);

-- 閲覧・更新は admin/clinic_admin かつクリニックスコープ内のみ
CREATE POLICY "csp_violations_select_admin" ON public.csp_violations
    FOR SELECT USING (
        public.get_current_role() = ANY (ARRAY['admin', 'clinic_admin'])
        AND (clinic_id IS NULL OR public.can_access_clinic(clinic_id))
    );

CREATE POLICY "csp_violations_update_admin" ON public.csp_violations
    FOR UPDATE USING (
        public.get_current_role() = ANY (ARRAY['admin', 'clinic_admin'])
        AND (clinic_id IS NULL OR public.can_access_clinic(clinic_id))
    );

-- ----------------------------------------------------------------
-- 2. security_alerts テーブル（冪等）
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_alerts (
    id          uuid  DEFAULT gen_random_uuid() NOT NULL,
    clinic_id   uuid,
    type        text  NOT NULL,
    severity    text  NOT NULL,
    title       text  NOT NULL,
    message     text  NOT NULL,
    details     jsonb,
    client_ip   inet,
    user_agent  text,
    source      text,
    status      text  DEFAULT 'new',
    resolved_at timestamp with time zone,
    resolved_by uuid,
    created_at  timestamp with time zone DEFAULT now(),
    updated_at  timestamp with time zone DEFAULT now(),
    CONSTRAINT security_alerts_pkey         PRIMARY KEY (id),
    CONSTRAINT security_alerts_type_check   CHECK (type IN ('csp_violation', 'rate_limit', 'authentication', 'data_breach', 'system')),
    CONSTRAINT security_alerts_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT security_alerts_status_check CHECK (status IN ('new', 'reviewing', 'resolved', 'false_positive'))
);

-- FK: clinic_id → clinics.id
DO $$ BEGIN
    ALTER TABLE public.security_alerts
        ADD CONSTRAINT security_alerts_clinic_id_fkey
        FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: resolved_by → auth.users
DO $$ BEGIN
    ALTER TABLE public.security_alerts
        ADD CONSTRAINT security_alerts_resolved_by_fkey
        FOREIGN KEY (resolved_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- INDEX
CREATE INDEX IF NOT EXISTS idx_security_alerts_clinic_id  ON public.security_alerts (clinic_id);
CREATE INDEX IF NOT EXISTS idx_security_alerts_created_at ON public.security_alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_alerts_severity   ON public.security_alerts (severity);
CREATE INDEX IF NOT EXISTS idx_security_alerts_type       ON public.security_alerts (type);

-- RLS
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "security_alerts_insert_any"   ON public.security_alerts;
DROP POLICY IF EXISTS "security_alerts_select_admin" ON public.security_alerts;
DROP POLICY IF EXISTS "security_alerts_update_admin" ON public.security_alerts;

CREATE POLICY "security_alerts_insert_any" ON public.security_alerts
    FOR INSERT WITH CHECK (true);

CREATE POLICY "security_alerts_select_admin" ON public.security_alerts
    FOR SELECT USING (
        public.get_current_role() = ANY (ARRAY['admin', 'clinic_admin'])
        AND (clinic_id IS NULL OR public.can_access_clinic(clinic_id))
    );

CREATE POLICY "security_alerts_update_admin" ON public.security_alerts
    FOR UPDATE USING (
        public.get_current_role() = ANY (ARRAY['admin', 'clinic_admin'])
        AND (clinic_id IS NULL OR public.can_access_clinic(clinic_id))
    );

COMMIT;
```

---

## 6. テスト対応表

| # | テスト assertion | Migration SQL の対応箇所 |
|---|-----------------|------------------------|
| 1 | `fs.existsSync(migrationFile)` | ファイル `20260304000100_csp_security_alerts_migration_ssot.sql` を作成 |
| 2 | `fs.existsSync(rollbackFile)` | ファイル `20260304000100_csp_security_alerts_migration_ssot_rollback.sql` を作成 |
| 3 | `/csp_violations[\s\S]*?clinic_id/` | `CREATE TABLE IF NOT EXISTS public.csp_violations (... clinic_id uuid, ...)` |
| 4 | `/security_alerts[\s\S]*?clinic_id/` | `CREATE TABLE IF NOT EXISTS public.security_alerts (... clinic_id uuid, ...)` |
| 5 | `/['"]system['"]/` | `type CHECK (..., 'system')` |
| 6 | `/can_access_clinic/` | RLS POLICY USING 節の `public.can_access_clinic(clinic_id)` |
| 7 | `not.toMatch(/clinic_users/)` | migration SQL に `clinic_users` を一切含まない |

---

## 7. DoD マッピング

| DoD 項目 | 本 migration との関連 |
|---------|---------------------|
| DOD-02 冪等 | `IF NOT EXISTS` / `EXCEPTION WHEN duplicate_object` で保証 |
| DOD-08 RLS パターン | `can_access_clinic()` 統一。`clinic_users` 参照なし |
| DOD-09 clinic_id guard | `security_alerts.clinic_id` FK + RLS で保護 |
| DOD-11 Jest green | Red 1 × 7 tests が pass → 全 suite green |

---

## 8. 受入条件

1. `supabase db reset --local --no-seed` が成功する（migration 冪等性）
2. `npm test -- --testPathPattern=csp-security-migration` で 13/13 pass（Red 1: 7 + Red 2: 2 + Red 3: 2 + Legacy: 2）
3. `supabase db push --local --dry-run` で予期しない差分が出ない
4. 全 Jest suite: `npm run test -- --ci --testPathIgnorePatterns=e2e` が 117/117 pass
