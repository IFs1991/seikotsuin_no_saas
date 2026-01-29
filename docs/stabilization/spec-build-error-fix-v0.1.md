# Build Error Fix Implementation Plan

## 概要

ビルドエラー（webpack + TypeScript）を修正し、`npm run build` を成功させます。

---

## エラー一覧

### 🔴 Webpack Error (1件) - ブロッカー

| ファイル | 問題 |
|---------|------|
| `src/lib/multi-device-manager.ts` | `server-only` な `@/lib/supabase` をインポートしているが、React Hook (`useMultiDeviceManager`) を含むためクライアントコンポーネントから使用される |

**インポートチェーン**:
```
SessionManager.tsx (use client)
  → multi-device-manager.ts
    → @/lib/supabase (index.ts)
      → server.ts (import 'server-only')
```

### 🟠 TypeScript Errors (6件)

| ファイル | 行 | 問題 |
|---------|-----|------|
| `src/api/gemini/ai-analysis-service.ts` | 425-426 | Zod パース結果の optional プロパティを required 型に代入 |
| `src/app/api/ai-insights/route.ts` | 233-234 | 同上 |
| `src/app/api/admin/master-data/export/route.ts` | 55 | `updated_by` が `SystemSettingRow` に存在しない |
| `src/app/api/admin/master-data/route.ts` | 57 | 同上 |
| `src/app/api/admin/users/route.ts` | 88 | `clinics` の join 結果が `{ name: any; }[]` になっている（配列 vs 単一オブジェクト） |

---

## Proposed Changes

### Component 1: Server/Client Boundary Fix

#### [MODIFY] [multi-device-manager.ts](file:///c:/Users/seekf/Desktop/seikotsuin_management_saas/src/lib/multi-device-manager.ts)

**問題**: サーバー専用の `createClient` を使用しつつ React Hook を同じファイルに含む

**解決策**: ブラウザクライアントを使用するように変更

```diff
- import { createClient } from '@/lib/supabase';
+ import { createClient } from '@/lib/supabase-browser';
```

> [!NOTE]
> `multi-device-manager.ts` はクライアントから使用されるため、ブラウザ用の Supabase クライアントを使用する必要があります。この変更により `server-only` インポートが解消されます。

---

### Component 2: AI Insights Type Fixes

#### [MODIFY] [ai-analysis-service.ts](file:///c:/Users/seekf/Desktop/seikotsuin_management_saas/src/api/gemini/ai-analysis-service.ts)

行 423-427 の `requestAiInsights` 関数で、Zod パース結果を適切にマッピング

```diff
  if (parsed.success) {
    return {
      summary: parsed.data.summary,
-     insights: parsed.data.insights,
-     anomalies: parsed.data.anomalies ?? [],
+     insights: parsed.data.insights.map(i => ({
+       title: i.title,
+       why: i.why,
+       action: i.action,
+       impact: i.impact,
+     })),
+     anomalies: (parsed.data.anomalies ?? []).map(a => ({
+       title: a.title,
+       evidence: a.evidence,
+       action: a.action,
+     })),
    };
  }
```

#### [MODIFY] [route.ts (ai-insights)](file:///c:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/api/ai-insights/route.ts)

行 230-235 で同様の修正

---

### Component 3: Master Data Type Fixes

#### [MODIFY] [route.ts (export)](file:///c:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/api/admin/master-data/export/route.ts)

行 14-27 の `SystemSettingRow` 型に `updated_by` を追加

```diff
  type SystemSettingRow = {
    // ... existing fields ...
    updated_at: string;
+   updated_by?: string;
  };
```

#### [MODIFY] [route.ts (master-data)](file:///c:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/api/admin/master-data/route.ts)

同様に `updated_by` を型定義に追加

---

### Component 4: Users API Type Fix

#### [MODIFY] [route.ts (users)](file:///c:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/api/admin/users/route.ts)

行 28-36 の `PermissionRow` 型を修正

```diff
  type PermissionRow = {
    // ... existing fields ...
-   clinics?: { name: string | null } | null;
+   clinics?: { name: string | null }[] | { name: string | null } | null;
  };
```

行 88 のキャストを削除し、適切な型処理を追加

---

## Verification Plan

### Automated Tests

```bash
# 1. TypeScript チェック（エラー0件を確認）
npm run type-check

# 2. ビルド成功確認
npm run build

# 3. 既存テスト実行（リグレッションチェック）
npm test -- --testPathPattern="supabase|session|multi-device"
```

### Manual Verification

1. `npm run dev` でアプリが起動することを確認
2. ブラウザでログイン後、セッション管理ページ（もしあれば）が動作することを確認

---

## 修正ファイル一覧

| ファイル | 変更種別 |
|---------|---------|
| `src/lib/multi-device-manager.ts` | MODIFY |
| `src/api/gemini/ai-analysis-service.ts` | MODIFY |
| `src/app/api/ai-insights/route.ts` | MODIFY |
| `src/app/api/admin/master-data/export/route.ts` | MODIFY |
| `src/app/api/admin/master-data/route.ts` | MODIFY（調査必要） |
| `src/app/api/admin/users/route.ts` | MODIFY |

---

## リスク評価

| リスク | 影響 | 対策 |
|--------|------|------|
| `multi-device-manager.ts` のブラウザクライアント変更 | セッション管理機能の動作変更 | 既存テストで検証 |
| 型定義変更 | ランタイム影響なし（型のみ） | TypeScript チェックで検証 |
