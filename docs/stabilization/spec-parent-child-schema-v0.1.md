# Parent-Child Clinic Schema Specification v0.1

## Overview

親子スコープモデルを完全に実装するためのスキーマ変更仕様書。

- 関連仕様: `spec-rls-tenant-boundary-v0.1.md`
- DoD: DOD-02, DOD-08
- 優先度: **High**（親スコープモデルの完全動作に必須）

## Implementation Status

| Item | Status | File |
|------|--------|------|
| Migration file | ✅ | `supabase/migrations/20260112000100_add_clinics_parent_id.sql` |
| Rollback file | ✅ | `supabase/migrations/20260112000101_add_clinics_parent_id_rollback.sql.backup` |

## Current State

現在の `clinics` テーブルには `parent_id` カラムが存在しません。

```sql
CREATE TABLE clinics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    address TEXT,
    phone_number VARCHAR(20),
    opening_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

## Required Schema Change

### Option A: clinics.parent_id (Recommended)

自己参照外部キーを使用したシンプルな親子関係。

```sql
-- Migration: Add parent_id to clinics table
ALTER TABLE public.clinics
ADD COLUMN parent_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

-- Index for efficient parent-scope queries
CREATE INDEX idx_clinics_parent_id ON public.clinics(parent_id);

-- Comment for documentation
COMMENT ON COLUMN public.clinics.parent_id IS
'Parent clinic ID for hierarchical organization. NULL means this is a top-level (HQ) clinic.
All clinics with the same parent_id (or the parent itself) share tenant boundary.';
```

### Option B: Separate tenants Table

より複雑なマルチテナント構造に適したアプローチ。

```sql
CREATE TABLE public.tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.clinics
ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);

CREATE INDEX idx_clinics_tenant_id ON public.clinics(tenant_id);
```

### Option C: External ID Mapping

外部システム（CRM、ERP等）との連携用。

```sql
ALTER TABLE public.clinics
ADD COLUMN external_org_id VARCHAR(255);

CREATE INDEX idx_clinics_external_org_id ON public.clinics(external_org_id);
```

## Recommended Approach

**Option A (parent_id)** を推奨。理由：

1. **シンプル**: 既存の `clinics` テーブルのみ変更
2. **柔軟**: 任意の深さの階層に対応可能
3. **効率的**: 自己結合1回で同一組織のクリニックを取得可能
4. **互換性**: 既存のRLSポリシーとの統合が容易

## Migration Plan

### Phase 1: Schema Change

```sql
-- File: supabase/migrations/20260112000100_add_clinics_parent_id.sql

BEGIN;

-- Add parent_id column
ALTER TABLE public.clinics
ADD COLUMN parent_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX idx_clinics_parent_id ON public.clinics(parent_id);

-- Comment for documentation
COMMENT ON COLUMN public.clinics.parent_id IS
'Parent clinic ID. NULL = top-level HQ. Same parent = sibling access allowed.';

COMMIT;
```

### Phase 2: Data Migration (if needed)

```sql
-- Example: Set existing clinics as their own parent (single-clinic orgs)
-- UPDATE public.clinics SET parent_id = id WHERE parent_id IS NULL;

-- Or: Assign to specific parent based on business rules
-- UPDATE public.clinics SET parent_id = 'HQ_CLINIC_UUID' WHERE name LIKE '%支店%';
```

### Phase 3: Rollback Plan

```sql
-- File: supabase/migrations/20260112000101_add_clinics_parent_id_rollback.sql.backup

BEGIN;

-- Drop view and helper function first
DROP VIEW IF EXISTS public.clinic_hierarchy;
DROP FUNCTION IF EXISTS public.get_sibling_clinic_ids(UUID);

-- Drop index and column
DROP INDEX IF EXISTS public.idx_clinics_parent_id;
ALTER TABLE public.clinics DROP COLUMN IF EXISTS parent_id;

COMMIT;
```

**Note**: ロールバックファイルは `.backup` 拡張子のため自動適用されません。
ロールバックが必要な場合は `.sql` にリネームして適用してください。

## Impact on existing code

### custom_access_token_hook

既に `parent_id` カラムの有無をチェックするロジックを実装済み。
カラム追加後、自動的に親スコープでの `clinic_scope_ids` が生成される。

```sql
-- Current implementation (20260111000200_rls_parent_scope_alignment.sql):
-- Checks if parent_id column exists
PERFORM 1 FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'clinics'
  AND column_name = 'parent_id';

IF FOUND AND user_clinic_id IS NOT NULL THEN
    -- Get parent organization ID
    EXECUTE format(
        'SELECT parent_id FROM public.clinics WHERE id = $1'
    ) INTO parent_clinic_id USING user_clinic_id;
    -- ...
END IF;
```

### can_access_clinic()

変更不要。`clinic_scope_ids` 配列ベースのチェックを既に実装。

### guards.ts (Server API)

変更不要。`canAccessClinicScope()` 関数がJWTの `clinic_scope_ids` を使用。

## Verification

### After Migration

```sql
-- Verify column exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'clinics' AND column_name = 'parent_id';

-- Verify index exists
SELECT indexname FROM pg_indexes
WHERE tablename = 'clinics' AND indexname = 'idx_clinics_parent_id';
```

### JWT Claims Verification

```sql
-- After login, verify JWT contains clinic_scope_ids
SELECT
  current_setting('request.jwt.claims', true)::jsonb->'clinic_scope_ids'
AS clinic_scope_ids;
```

## Test Cases

### Unit Test: Sibling Access

```typescript
test('user can access sibling clinic data', async () => {
  // User belongs to Clinic A-1 under Parent A
  // Should be able to access Clinic A-2 (sibling)
  const { data, error } = await clinicA1User.client
    .from('reservations')
    .select('*')
    .eq('clinic_id', CLINIC_A2_ID);

  expect(error).toBeNull();
  expect(data).not.toBeNull();
});
```

### Unit Test: Cross-Parent Isolation

```typescript
test('user cannot access cross-parent clinic data', async () => {
  // User belongs to Clinic A-1 under Parent A
  // Should NOT be able to access Clinic B-1 (different parent)
  const { data } = await clinicA1User.client
    .from('reservations')
    .select('*')
    .eq('clinic_id', CLINIC_B1_ID);

  expect(data).toEqual([]); // Empty due to RLS
});
```

## Timeline

| Phase | Task | Priority |
|-------|------|----------|
| 1 | Add parent_id column | High |
| 2 | Seed data migration | Medium |
| 3 | Full E2E sibling access tests | Medium |
| 4 | Admin UI for parent assignment | Low |

## Notes

- 親子関係の設定は管理画面から行うUIが必要（将来的に）
- 初期移行時は全クリニックを独立した組織として扱う（parent_id = NULL）
- ビジネス要件に基づいて親子関係を手動で設定
