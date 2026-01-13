# Organization Multi-Clinic Access Spec v0.1

## Overview
- Purpose: 同一組織内の複数クリニックの予約を横断閲覧可能にする
- Phase: **Phase 7**（Stabilization完了後）
- 依存: DOD-08, DOD-09 完了済み、Phase 2-6完了後
- Priority: Medium
- Risk: RLSポリシー変更、認可ロジック拡張

## Background

### 現在のアーキテクチャ
```
user_permissions
├── user_id
├── clinic_id: 単一クリニックに紐づく（HQはNULL）
└── role: admin（HQ）のみclinic_id=NULLで全クリニック閲覧可能
```

### 要件
- 親テナント（本部）が作成した子テナント（支店クリニック）間で予約を横断閲覧
- ドロップダウンでクリニックを切り替えて予約一覧を表示
- **閲覧のみ**（編集・作成・削除は不可）
- 対象データ: **予約（reservations）のみ**

### ユースケース
1. フランチャイズ本部が各店舗の予約状況を確認
2. グループクリニックの管理者が複数院の予約を一覧
3. エリアマネージャーが担当エリアの予約を横断確認

## Design Decision

### 採用: Option 2 - 組織（Organization）レイヤー追加

```
organizations (新規)
├── id UUID PK
├── name TEXT
├── created_at TIMESTAMPTZ
└── updated_at TIMESTAMPTZ

clinics (変更)
├── id UUID PK
├── organization_id UUID FK → organizations.id (新規、NULL許可)
├── name TEXT
└── ...

user_permissions (変更)
├── user_id UUID
├── clinic_id UUID
├── role TEXT
├── can_view_organization BOOLEAN (新規、DEFAULT FALSE)
└── ...
```

### 理由
- 明確な組織概念により、将来的な拡張（組織レベルの設定、請求など）が容易
- 親子クリニック構造より柔軟（複数階層不要、フラットな組織構造に対応）
- アクセス可能クリニックリスト方式より管理が単純

## Implementation Phases

### Phase 7.1: DB Schema Migration

**新規テーブル: organizations**
```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 更新トリガー
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**clinicsテーブル変更**
```sql
ALTER TABLE clinics
ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX idx_clinics_organization_id ON clinics(organization_id);
```

**user_permissionsテーブル変更**
```sql
ALTER TABLE user_permissions
ADD COLUMN can_view_organization BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN user_permissions.can_view_organization IS
  '同一組織内の他クリニックの予約を閲覧可能かどうか';
```

### Phase 7.2: RLS Policy Updates

**reservationsテーブルのRLSポリシー拡張**
```sql
-- 既存ポリシーを拡張（組織閲覧権限を追加）
CREATE OR REPLACE FUNCTION can_view_reservation(reservation_clinic_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_clinic_id UUID;
  user_org_id UUID;
  reservation_org_id UUID;
  has_org_view BOOLEAN;
BEGIN
  -- ユーザーの権限情報を取得
  SELECT
    up.clinic_id,
    c.organization_id,
    up.can_view_organization
  INTO user_clinic_id, user_org_id, has_org_view
  FROM user_permissions up
  LEFT JOIN clinics c ON c.id = up.clinic_id
  WHERE up.user_id = auth.uid();

  -- HQロールは全て閲覧可能
  IF user_clinic_id IS NULL THEN
    RETURN TRUE;
  END IF;

  -- 自クリニックの予約は閲覧可能
  IF user_clinic_id = reservation_clinic_id THEN
    RETURN TRUE;
  END IF;

  -- 組織閲覧権限がある場合、同一組織の予約を閲覧可能
  IF has_org_view AND user_org_id IS NOT NULL THEN
    SELECT organization_id INTO reservation_org_id
    FROM clinics WHERE id = reservation_clinic_id;

    IF user_org_id = reservation_org_id THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SELECTポリシー（閲覧のみ）
CREATE POLICY reservations_organization_view ON reservations
  FOR SELECT
  USING (can_view_reservation(clinic_id));
```

### Phase 7.3: Backend Implementation

**新規ガード関数: src/lib/supabase/guards.ts**
```typescript
/**
 * ユーザーがアクセス可能なクリニックIDリストを取得
 * @spec docs/stabilization/spec-organization-multi-clinic-v0.1.md
 */
export async function getAccessibleClinicIds(
  userId: string,
  supabase: SupabaseServerClient,
  options: { includeOrganization?: boolean } = {}
): Promise<string[]> {
  const permissions = await getUserPermissions(userId, supabase);

  if (!permissions) {
    return [];
  }

  // HQロールは全クリニック
  if (isHQRole(permissions.role)) {
    const { data } = await supabase.from('clinics').select('id');
    return data?.map(c => c.id) ?? [];
  }

  // 自クリニックがない場合は空
  if (!permissions.clinic_id) {
    return [];
  }

  const clinicIds = [permissions.clinic_id];

  // 組織閲覧権限がある場合、同一組織のクリニックを追加
  if (options.includeOrganization && permissions.can_view_organization) {
    const { data: userClinic } = await supabase
      .from('clinics')
      .select('organization_id')
      .eq('id', permissions.clinic_id)
      .single();

    if (userClinic?.organization_id) {
      const { data: orgClinics } = await supabase
        .from('clinics')
        .select('id')
        .eq('organization_id', userClinic.organization_id)
        .neq('id', permissions.clinic_id);

      if (orgClinics) {
        clinicIds.push(...orgClinics.map(c => c.id));
      }
    }
  }

  return clinicIds;
}
```

**予約API拡張: src/app/api/reservations/route.ts**
```typescript
export async function GET(request: NextRequest) {
  // ... 既存の認証処理 ...

  const { permissions, supabase } = await ensureClinicAccess(request, PATH, null, {
    allowedRoles: Array.from(STAFF_ROLES),
    requireClinicMatch: false, // 組織閲覧の場合はfalse
  });

  // アクセス可能なクリニックIDを取得
  const accessibleClinicIds = await getAccessibleClinicIds(
    user.id,
    supabase,
    { includeOrganization: true }
  );

  // クエリパラメータのclinic_idが許可範囲内か確認
  const requestedClinicId = searchParams.get('clinic_id');
  if (requestedClinicId && !accessibleClinicIds.includes(requestedClinicId)) {
    return createErrorResponse('このクリニックの予約を閲覧する権限がありません', 403);
  }

  // クエリ実行
  const targetClinicId = requestedClinicId || permissions.clinic_id;
  const { data: reservations } = await supabase
    .from('reservations')
    .select('*')
    .eq('clinic_id', targetClinicId);

  return createSuccessResponse({ reservations, accessibleClinicIds });
}
```

### Phase 7.4: Frontend Implementation

**クリニック選択コンポーネント: src/components/clinic-selector.tsx**
```typescript
'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Clinic {
  id: string;
  name: string;
}

interface ClinicSelectorProps {
  accessibleClinics: Clinic[];
  selectedClinicId: string;
  onChange: (clinicId: string) => void;
  disabled?: boolean;
}

export function ClinicSelector({
  accessibleClinics,
  selectedClinicId,
  onChange,
  disabled = false,
}: ClinicSelectorProps) {
  // 単一クリニックの場合は表示しない
  if (accessibleClinics.length <= 1) {
    return null;
  }

  return (
    <Select value={selectedClinicId} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="クリニックを選択" />
      </SelectTrigger>
      <SelectContent>
        {accessibleClinics.map((clinic) => (
          <SelectItem key={clinic.id} value={clinic.id}>
            {clinic.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

**予約ページへの統合: src/app/reservations/page.tsx**
```typescript
// クリニック選択状態を追加
const [selectedClinicId, setSelectedClinicId] = useState<string>(userClinicId);
const [accessibleClinics, setAccessibleClinics] = useState<Clinic[]>([]);

// アクセス可能クリニック取得
useEffect(() => {
  async function fetchAccessibleClinics() {
    const response = await fetch('/api/clinics/accessible');
    const { data } = await response.json();
    setAccessibleClinics(data.clinics);
  }
  fetchAccessibleClinics();
}, []);

// UIに追加
<div className="flex items-center gap-4">
  <ClinicSelector
    accessibleClinics={accessibleClinics}
    selectedClinicId={selectedClinicId}
    onChange={setSelectedClinicId}
  />
  {selectedClinicId !== userClinicId && (
    <Badge variant="secondary">閲覧モード（編集不可）</Badge>
  )}
</div>
```

### Phase 7.5: API Endpoint for Accessible Clinics

**新規API: src/app/api/clinics/accessible/route.ts**
```typescript
import { NextRequest } from 'next/server';
import { createSuccessResponse, createErrorResponse } from '@/lib/api-helpers';
import { ensureClinicAccess, getAccessibleClinicIds } from '@/lib/supabase/guards';
import { STAFF_ROLES } from '@/lib/constants/roles';

const PATH = '/api/clinics/accessible';

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await ensureClinicAccess(request, PATH, null, {
      allowedRoles: Array.from(STAFF_ROLES),
      requireClinicMatch: false,
    });

    const clinicIds = await getAccessibleClinicIds(user.id, supabase, {
      includeOrganization: true,
    });

    const { data: clinics } = await supabase
      .from('clinics')
      .select('id, name')
      .in('id', clinicIds)
      .order('name');

    return createSuccessResponse({ clinics: clinics ?? [] });
  } catch (error) {
    return createErrorResponse('クリニック一覧の取得に失敗しました', 500);
  }
}
```

## Testing Plan

### Unit Tests
- `getAccessibleClinicIds()` のテスト
  - HQロール: 全クリニック返却
  - 組織閲覧権限あり: 同一組織のクリニック返却
  - 組織閲覧権限なし: 自クリニックのみ返却
  - clinic_id未設定: 空配列返却

### Integration Tests
- 予約API: 組織閲覧権限での他クリニック予約取得
- 予約API: 権限なしでの他クリニック予約取得拒否

### E2E Tests
- クリニック選択ドロップダウンの表示/非表示
- クリニック切り替え時の予約一覧更新
- 閲覧モードバッジの表示

## Non-goals
- 予約の編集・作成・削除（閲覧のみ）
- 予約以外のデータ（患者、売上など）の横断閲覧
- 組織の階層構造（フラットのみ）
- 組織管理UI（管理者が組織を作成・編集するUI）

## Acceptance Criteria
- [ ] 組織閲覧権限を持つユーザーが、同一組織内の他クリニックの予約を閲覧できる
- [ ] クリニック選択ドロップダウンで、アクセス可能なクリニックのみ表示される
- [ ] 他クリニックの予約を閲覧中は「閲覧モード」が表示され、編集UIが無効化される
- [ ] 組織閲覧権限を持たないユーザーは、自クリニックの予約のみ閲覧可能
- [ ] HQロール（admin）は従来通り全クリニックの予約を閲覧可能

## Rollback
- マイグレーション: `organization_id`, `can_view_organization` カラムを削除
- RLSポリシー: 組織ベースのポリシーを削除し、従来のclinic_idベースに戻す
- コード: `getAccessibleClinicIds()` の `includeOrganization` オプションを無効化

## Files to Create/Modify

### New Files
- `supabase/migrations/YYYYMMDD_organization_layer.sql`
- `src/app/api/clinics/accessible/route.ts`
- `src/components/clinic-selector.tsx`

### Modified Files
- `src/lib/supabase/guards.ts` - `getAccessibleClinicIds()` 追加
- `src/types/supabase.ts` - organizations型追加
- `src/app/reservations/page.tsx` - クリニック選択UI追加
- `src/app/api/reservations/route.ts` - 組織スコープ対応

## Dependencies

| Phase | Spec | Status |
|-------|------|--------|
| 1 | spec-auth-role-alignment-v0.1.md | ✅ COMPLETED |
| 2 | spec-rls-tenant-boundary-v0.1.md | Pending |
| 3 | spec-tenant-table-api-guard-v0.1.md | Pending |
| 4 | spec-admin-settings-contract-v0.1.md | Pending |
| 5 | spec-e2e-preflight-fixtures-v0.1.md | Pending |
| 6 | spec-playwright-baseurl-windows-v0.1.md | Pending |
| **7** | **spec-organization-multi-clinic-v0.1.md** | **This Spec** |

## Security Considerations

1. **最小権限の原則**: `can_view_organization` は明示的にTRUEに設定されたユーザーのみ
2. **閲覧のみ**: 他クリニックの予約は閲覧のみ、編集権限は付与しない
3. **RLS多層防御**: アプリケーション層とRLS層の両方でアクセス制御
4. **監査ログ**: 組織横断アクセスは監査ログに記録

## Future Extensions (Out of Scope)

- 組織レベルの設定管理
- 組織レベルの請求・課金
- 組織管理者ロールの追加
- 他データ（患者、売上）の横断閲覧
- 組織階層構造（親組織・子組織）
