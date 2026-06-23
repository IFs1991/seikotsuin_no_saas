# リファクタリング総合分析レポート

**作成日**: 2026-03-16
**対象**: `src/` ディレクトリ + Supabase統合
**ファイル数**: 462 TypeScript/TSX (本番コード約8,246行)

---

## 目次

1. [概要サマリ](#1-概要サマリ)
2. [デッドコード・未使用ファイル](#2-デッドコード未使用ファイル)
3. [型定義の乖離と統一](#3-型定義の乖離と統一)
4. [Supabaseクエリパターン](#4-supabaseクエリパターン)
5. [マイグレーション・DBスキーマ](#5-マイグレーションdbスキーマ)
6. [RLS（Row Level Security）](#6-rlsrow-level-security)
7. [コンポーネント・フック構造](#7-コンポーネントフック構造)
8. [優先度マトリックス](#8-優先度マトリックス)
9. [問題なし（変更不要）の領域](#9-問題なし変更不要の領域)

---

## 1. 概要サマリ

| カテゴリ | 状態 | 影響度 |
|----------|------|--------|
| デッドコード | 候補7ファイルあり。ただし一部は内部参照・検証資産あり | MEDIUM |
| 型定義 | DB構造と重大な乖離あり（`index.ts`, `reservation.ts`） | CRITICAL |
| クエリ重複 | `security_events` INSERT 5箇所、`user_sessions` SELECT 6箇所 | HIGH |
| RLS | 40/46テーブルで有効。未適用は6テーブル | MEDIUM |
| コンポーネント構造 | lazy-load + コロケーション適切 | OK |
| Provider | 3つとも小さく責務明確 | OK |

### 1.1 2026-03-17 追記（P0-01 / P0-02 後）

- 進行状況:
  - P0-01 完了: `src/app/terms/page.tsx`, `src/app/privacy/page.tsx`, `src/app/register/page.tsx`, `src/app/client-layout.tsx`
  - P0-02 完了: `src/components/navigation/sidebar.tsx`, `src/components/navigation/mobile-bottom-nav.tsx`
  - 未着手: P0-03 `/api/health`, P0-04 エラー監視, P0-05 `POST /api/public/reservations`
- `src/lib/feature-flags.ts` は依然として本番未使用だが、`docs/specs/pilot-release-spec-v0.1.md` の P2-05 でフィーチャーフラグ基盤整備が予定されているため、「即削除候補」から「保留」に下げる。
- P0-02 では `src/components/navigation/sidebar.tsx` と `src/components/navigation/mobile-bottom-nav.tsx` に同一の `NEXT_PUBLIC_ENABLE_AI_INSIGHTS` 判定が入ったが、spec 上は P0 の暫定実装として妥当。現時点では追加リファクタリング不要で、P2-05 で集約するのが適切。
- P0-01 では `src/components/legal/legal-page.tsx` と `src/components/legal/legal-footer-links.tsx` を新設し、法務ページ表示とリンク導線を最小限で共通化済み。法務リンク周りは現時点で過分な抽象化は不要。

---

## 2. デッドコード・未使用ファイル

### 2.1 未使用ユーティリティ候補（計811行）

| ファイル | 行数 | 説明 |
|----------|------|------|
| `src/lib/accessibility-test.ts` | 268 | `src/lib/integration-tests.ts` から参照あり。本番導線の有無は別途確認要 |
| `src/lib/feature-flags.ts` | 6 | `isMockEnabled()` — 完全未使用 |
| `src/lib/middleware-optimizer.ts` | 269 | 現時点で明示参照なし。削除前に生成物・動的import確認要 |
| `src/lib/performance.ts` | 268 | `src/lib/integration-tests.ts` から参照あり。本番導線の有無は別途確認要 |

**推奨アクション**: 「即削除」ではなく 3分類で扱う。
- 保留: `feature-flags.ts`（P2-05 のフィーチャーフラグ基盤整備までは維持）
- 要再計測: `middleware-optimizer.ts`
- 保留: `accessibility-test.ts`, `performance.ts`（`integration-tests.ts` 参照あり）

### 2.2 非推奨フック群（計556行）

| ファイル | 行数 | 状態 |
|----------|------|------|
| `src/hooks/useSystemSettings.ts` | 207 | `useAdminMaster` から参照。deprecated導線の維持用途 |
| `src/hooks/useAdminMaster.ts` | 190 | `@deprecated` マーク済み。安定化テストが存在前提 |
| `src/hooks/useSystemSettingsV2.ts` | 159 | React Query版。`useSystemSettings` として re-export 済み |

**推奨アクション**: 現時点では削除ではなく整理対象。
- `useSystemSettings.ts` は deprecated stub として扱う
- `useAdminMaster.ts` は削除前に stabilization テスト更新が必要
- `useSystemSettingsV2.ts` は正式実装候補として位置づけを明文化する
- 関連DoD/検証: `src/__tests__/stabilization/R04-system-settings-hook-unification.test.ts`

### 2.3 非推奨Supabaseクライアント

| ファイル | 状態 |
|----------|------|
| `src/lib/supabase-browser.ts` | 非推奨。現時点のプロダクション参照は確認できず、未使用候補 |
| `src/api/database/supabase-client.ts` | 参照専用、本番import 0件 |

**推奨アクション**: `supabase-browser.ts` は削除候補。ただし先に stabilization テストとの不整合を解消する。
- 実装実態: `useSessionManagement.ts` と `session-timeout.ts` は `@supabase/ssr` の `createBrowserClient` を直接利用
- 関連DoD/検証: `src/__tests__/stabilization/R03-supabase-client-unification.test.ts`, `src/__tests__/stabilization/R08-unused-code-cleanup.test.ts`

### 2.4 隔離済み（変更不要）

| ディレクトリ | 状態 |
|--------------|------|
| `src/legacy/Reservation/` (20ファイル) | 本番コードからの参照 0件。完全に隔離済み |
| `src/database/` | 参照専用と明記済み。Source of Truthは `supabase/migrations/` |

---

## 3. 型定義の乖離と統一

### 3.1 現状: 型定義が4ファイルに分散

DB: **46テーブル** + **5ビュー** + **1マテリアライズドビュー**。自動生成型 `supabase.ts` は Source of Truth。

```
src/types/
├── supabase.ts      ← 自動生成（Source of Truth）
├── index.ts         ← 手書き（陳腐化、DB構造と不一致）
├── api.ts           ← 手書き（DBと90%一致、最も信頼）
├── reservation.ts   ← 手書き（camelCase、DBと不一致）
├── admin.ts         ← アプリケーション型（ApiResponse重複）
├── security.ts      ← アプリケーション型（ApiResponse重複）
├── settings.ts      ← 設定型（問題なし）
├── onboarding.ts    ← DB一致（問題なし）
└── beta.ts          ← 分析型（問題なし）
```

### 3.2 `ApiResponse<T>` の4重複

```typescript
// 4ファイルで別々に定義されている
src/types/index.ts      → ApiResponse<T>
src/types/api.ts        → ApiResponse<T = unknown>
src/types/admin.ts      → ApiResponse<T = unknown>
src/types/security.ts   → ApiResponse<T = any>
```

**推奨**: 1箇所に統一（専用ファイル推奨）。

### 3.3 `src/types/index.ts` — DB構造との重大な乖離

| 手書き型 | 問題 | DB実態 |
|----------|------|--------|
| `Clinic.manager_id` | DBに存在しないフィールド | — |
| `Clinic.created_at: Date` | 型不一致 | `string` (ISO format) |
| `Staff.certifications: string[]` | DBに存在しないフィールド | — |
| `Staff.phone` | フィールド名不一致 | `phone_number` |
| `Patient.birth_date` | フィールド名不一致 | `date_of_birth` |
| `Patient.medical_history: string[]` | DBに存在しないフィールド | — |
| `Visit.staff_id` | フィールド名不一致 | `therapist_id` |
| `Revenue` | フィールド大幅不足 | `visit_id`, `patient_id` 等なし |
| `AIComment.highlights[]` | DBに存在しない | DB: `good_points`, `improvement_points` |

### 3.4 `src/types/reservation.ts` — camelCaseでDB不一致

| 手書き型 | 問題 | DB実態 |
|----------|------|--------|
| `Customer.customAttributes` | camelCase | `custom_attributes` |
| `Menu.clinicId` | camelCase | `clinic_id` |
| `Reservation.customerId` | camelCase | `customer_id` |
| `Reservation.menuId` | camelCase | `menu_id` |
| `Block.resourceId` | camelCase | `resource_id` |
| 全型の `Date` フィールド | 型不一致 | `string` (ISO format) |

**欠落フィールド例**:
- `Customer`: `line_display_name`, `name_kana`, `lifetime_value`, `consent_date` 等
- `Menu`: `code`, `color`, `buffer_*_minutes`, `equipment_required`, `icon` 等
- `Reservation`: `actual_price`, `booker_name`, `is_recurring`, `no_show_reason` 等
- `Block`: `clinic_id`, `block_type`, `is_active`, `recurrence_end_date` 等

### 3.5 `src/types/api.ts` — 相対的に整合度が高い

- `string` 型でタイムスタンプが揃っている ✓
- フィールド名は概ねDB準拠 ✓
- `Revenue` は `index.ts` よりかなり完全 ✓
- `AIComment` はDB構造に近いが、最終的な Source of Truth は `supabase.ts`

### 3.6 自動生成型の使用状況

`Database` 型は API schema・サービス層・一部管理画面で使用中:
- APIスキーマ: `src/app/api/**/schema.ts` — `Database['public']['Tables']['xxx']['Insert']` ✓
- サービス層: `reservation-service.ts`, `block-service.ts`, `session-manager.ts` ✓
- 管理画面: `session-management/page.tsx`, `callback/route.ts` ✓

### 3.7 推奨統一方針

```typescript
// ベストプラクティス: supabase.ts から直接派生
type Customer = Database['public']['Tables']['customers']['Row'];
type CustomerInsert = Database['public']['Tables']['customers']['Insert'];
type CustomerUpdate = Database['public']['Tables']['customers']['Update'];

// UIで追加プロパティが必要な場合のみ拡張
interface CustomerWithUI extends Customer {
  displayName: string; // UI専用の計算プロパティ
}
```

---

## 4. Supabaseクエリパターン

### 4.1 全体統計

- `.from()` 呼び出し: **307箇所**（テスト・レガシー除く）
- エラーハンドリング: **90%以上** が `{ data, error }` パターンで一貫 ✓

### 4.2 クエリ頻度上位テーブル

| テーブル | 呼び出し数 | 主要ファイル |
|----------|-----------|-------------|
| `user_sessions` | 16 | session-manager, multi-device-manager, security-monitor |
| `reservations` | 14 | reservation-service, API routes |
| `security_events` | 10 | session-manager, mfa/*, security-monitor |
| `profiles` | 9 | session-manager, invite/actions, callback |
| `blocks` | 6 | block-service, /api/blocks |
| `user_mfa_settings` | 5 | mfa/backup-codes, mfa/mfa-manager |

### 4.3 クエリ重複（統合候補）

#### `security_events` INSERT — 4ファイル, 5+箇所

```
src/lib/session-manager.ts
src/lib/mfa/backup-codes.ts
src/lib/mfa/mfa-manager.ts
src/lib/security-monitor.ts
```

同一INSERTパターンが繰り返されている。`SecurityEventService` に統合すべき。

#### `user_sessions` SELECT — 4ファイル, 6+箇所

```
src/lib/session-manager.ts (複数箇所)
src/lib/multi-device-manager.ts
src/lib/security-monitor.ts
```

同じ `.select()` カラムセットが繰り返し。ヘルパーメソッド抽出が有効。

#### `user_mfa_settings` — 2ファイル, 5箇所

```
src/lib/mfa/backup-codes.ts
src/lib/mfa/mfa-manager.ts
```

`MFASettingsService` に統合候補。

### 4.4 クライアント使用パターン

| クライアント | 用途 | 状態 |
|-------------|------|------|
| `createBrowserClient` (`@/lib/supabase/client`) | クライアントコンポーネント | ✓ 正しい |
| `createServerClient` (`@/lib/supabase/server`) | サーバーアクション, API routes | ✓ 正しい |
| `createAdminClient` (service_role) | Public API, 内部処理 | ✓ 概ね適切 |
| `supabase-browser.ts` (非推奨) | 現時点の参照なし。未使用候補 | ⚠️ 削除候補 |

#### コンテキスト不一致

- `src/api/gemini/ai-analysis-service.ts` — ブラウザクライアント利用自体は現行呼び出し元と整合するが、配置が誤解を招く ⚠️
- 実装実態: `src/components/dashboard/ai-analysis.tsx` からクライアントサイドで直接呼ばれている
- 推奨: 「ブラウザ→サーバー」単純置換ではなく、`app/api` か Server Action に移し、呼び出し側も合わせて変更する
- 関連DoD: `docs/stabilization/DoD-v0.1.md` の DOD-09

### 4.5 型安全性の問題

#### 二重型キャスト（コードスメル）

```typescript
// src/lib/services/reservation-service.ts:38
(row.selected_options as unknown as Reservation['selectedOptions'])
```

→ Zodバリデーションに置き換えるべき。

#### `any` 使用

```typescript
// src/app/api/staff/shifts/route.ts:107
const formattedShifts = (shifts || []).map((shift: any) => { ... })
```

→ 適切な型に置き換えるべき。

### 4.6 エラーハンドリング評価

| パターン | 割合 | 評価 |
|----------|------|------|
| `const { data, error }` + error check | ~90% | ✓ 優秀 |
| try-catch ラッパー | ~8% | ✓ 良好 |
| フォールバック/リトライ | ~2% | ✓ 適切 |
| サイレント失敗 | <1% | ⚠️ ドキュメント済み |

---

## 5. マイグレーション・DBスキーマ

### 5.1 マイグレーション構成

| 項目 | 状態 |
|------|------|
| ファイル | `00000000000001_squashed_baseline.sql` (221KB) |
| テーブル数 | 46テーブル + 5ビュー + 1 Materialized View |
| 最終更新 | 2025-03-05 |
| 形式 | 単一squashedベースライン |

### 5.2 ビュー

| ビュー | 種別 | 使用箇所 |
|--------|------|----------|
| `clinic_hierarchy` | Regular View | 生成型・RLS関連参照 |
| `daily_revenue_summary` | Regular View | `ai-analysis-service.ts` |
| `staff_performance_summary` | Regular View | `ai-analysis-service.ts` |
| `patient_visit_summary` | Regular View | `ai-analysis-service.ts` |
| `reservation_list_view` | Regular View | 生成型に存在 |
| `daily_reservation_stats` | Materialized View | — |

### 5.3 型生成パイプライン

```bash
npm run supabase:types
# → scripts/generate-supabase-types.mjs
# → supabase gen types typescript --local --schema public
# → src/types/supabase.ts
```

- 5必須テーブル（`clinics`, `reservations`, `blocks`, `security_events`, `user_permissions`）のバリデーション付き ✓
- Prettier フォーマット付き ✓

### 5.4 参照用SQLファイル

| ディレクトリ | 状態 | 注意 |
|-------------|------|------|
| `src/database/` | 参照専用（READMEに明記） | Source of Truthは `supabase/migrations/` |
| `src/api/database/` | 参照専用 | 本番import 0件 |

### 5.5 スキーマドリフト

- コード読解ベースでは大きなドリフトは見当たらない
- ただし確証は `supabase db push --local --dry-run` で取るべき
- 関連DoD: `docs/stabilization/DoD-v0.1.md` の DOD-04, DOD-12

---

## 6. RLS（Row Level Security）

### 6.1 カバレッジ

- **148個のCREATE POLICY** が定義済み
- **40/46テーブル** でRLS有効（約87%）

### 6.2 RLS未適用テーブル（6テーブル）

| テーブル | リスク | 理由 |
|----------|--------|------|
| `master_categories` | LOW | 共有マスタデータ |
| `master_patient_types` | LOW | 共有マスタデータ |
| `master_payment_methods` | LOW | 共有マスタデータ |
| `menu_categories` | LOW | 共有マスタの可能性が高い |
| `treatment_menu_records` | MEDIUM | 治療記録 — テナント分離が必要な可能性 |
| `treatments` | MEDIUM | テナント境界の意図確認が必要 |

**推奨**: `treatment_menu_records` と `treatments` は優先監査対象。共有マスタ系4テーブルは意図的な非RLSなら明文化する。
- 関連DoD: `docs/stabilization/DoD-v0.1.md` の DOD-08

### 6.3 認証関数（SECURITY DEFINER）

| 関数 | 目的 | パフォーマンス |
|------|------|-------------|
| `can_access_clinic(target_clinic_id)` | テナント分離 | O(1) JWT比較 |
| `get_current_role()` | ロール解決（5段階フォールバック） | O(1)〜O(n) |
| `jwt_is_admin()` | 管理者判定 | O(1) JWT直接チェック |
| `jwt_clinic_id()` | プライマリclinic_id抽出 | O(1) |

### 6.4 JWT Claims構造

```json
{
  "user_role": "admin|clinic_admin|manager|therapist|staff",
  "clinic_id": "uuid-of-primary-clinic",
  "clinic_scope_ids": ["uuid1", "uuid2"]
}
```

### 6.5 フロントエンドとの整合性

| 項目 | 状態 |
|------|------|
| クロステナントクエリ防止 | ✓ サーバーガード + RLS二重防御 |
| service_roleのフロントエンド露出 | ✓ なし（サーバーサイドのみ） |
| 冗長なclinic_idフィルタ | 意図的（Defense in Depth） |
| RLSポリシーの操作網羅性 | ⚠️ テーブルごとに操作差分あり。監査はDoDベースで継続要 |

### 6.6 service_role使用箇所

| ファイル | 用途 | 評価 |
|----------|------|------|
| `src/lib/supabase/server.ts` | `createAdminClient()` | ✓ 適切 |
| `src/app/api/public/menus/route.ts` | 未認証Public API | ✓ clinic_idバリデーション付き |
| `src/app/api/public/reservations/route.ts` | 未認証Public API | ✓ clinic_idバリデーション付き |
| 各admin API routes | 管理操作 | ✓ 適切 |

### 6.7 Edge Functions

**なし** — 全バックエンドロジックは `src/app/api/` のNext.js API routesで実装。

---

## 7. コンポーネント・フック構造

### 7.1 大きなフック（分割候補）

| フック | 行数 | 分割案 |
|--------|------|--------|
| `useChat.ts` | 364 | メッセージ変換ロジックをヘルパーに抽出 |
| `useTableManager.ts` | 361 | フィルタ/ソート/ページネーションを分離 |
| `useDailyReports.ts` | 350 | レポートバリデーションをサービスに抽出 |
| `useSessionManagement.ts` | 334 | `session-timeout.ts` と統合 |
| `useUserProfile.ts` | 298 | プロファイルキャッシュ戦略を抽出 |

### 7.2 大きなページ（リファクタリング候補）

| ページ | 行数 | 問題 |
|--------|------|------|
| `daily-reports/input/page.tsx` | 574 | インラインフォームロジック |
| `blocks/page.tsx` | 543 | カレンダー+スケジューリングロジック |
| `daily-reports/edit/[id]/page.tsx` | 442 | インライン編集ロジック |
| `invite/page.tsx` | 441 | インライン招待フォーム |

### 7.3 フォームバリデーション重複

6+ページで同じstateパターンが繰り返し:

```typescript
const [formError, setFormError] = useState<string | null>(null);
const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
```

→ `useFormValidation()` フックに抽出可能。

### 7.4 大きなライブラリファイル（必要な複雑性）

| ファイル | 行数 | 評価 |
|----------|------|------|
| `session-manager.ts` | 992 | エンタープライズセッション管理。構造は良好 |
| `multi-device-manager.ts` | 725 | デバイストラッキング。session-managerと密結合 |
| `reservation-service.ts` | 697 | 予約ビジネスロジック。適切な分離 |
| `security-monitor.ts` | 679 | セキュリティ脅威検知。整理済み |
| `error-handler.ts` | 543 | エラーマッピング。18箇所から参照 |

### 7.5 Provider構造

| Provider | 行数 | 評価 |
|----------|------|------|
| `query-provider.tsx` | 99 | ✓ React Query設定 |
| `user-profile-context.tsx` | 40 | ✓ グローバルユーザー状態 |
| `selected-clinic-context.tsx` | 55 | ✓ マルチテナント選択 |

### 7.6 直近変更の評価（P0-01 / P0-02）

| 領域 | ファイル | 評価 |
|------|---------|------|
| legal pages | `src/app/terms/page.tsx`, `src/app/privacy/page.tsx`, `src/components/legal/legal-page.tsx` | ✓ 最小構成で十分。追加リファクタリング不要 |
| legal links | `src/components/legal/legal-footer-links.tsx`, `src/app/register/page.tsx`, `src/app/client-layout.tsx` | ✓ 共通リンク化済み。責務は明確 |
| pilot nav gating | `src/components/navigation/sidebar.tsx`, `src/components/navigation/mobile-bottom-nav.tsx` | △ 判定重複あり。ただし P0 段階では許容、P2-05 で集約推奨 |

---

## 8. 優先度マトリックス

### 🔴 最優先（型安全性・アーキテクチャ）

| # | 項目 | 工数 | 効果 |
|---|------|------|------|
| 1 | `types/index.ts` 廃止 → `supabase.ts` 派生に統一 | 3-4h | DB不一致バグの根絶 |
| 2 | `types/reservation.ts` リビルド（camelCase→snake_case, DB準拠） | 2-3h | 予約機能の型安全性確保 |
| 3 | `SecurityEventService` 作成（5箇所のINSERT統合） | 2h | DRY原則、保守性向上 |
| 4 | `ApiResponse<T>` 統一（4ファイル→1箇所） | 1h | メンテナンス性向上 |

### 🟡 中優先（保守性・整理）

| # | 項目 | 工数 | 効果 |
|---|------|------|------|
| 5 | `user_sessions` クエリヘルパー抽出（6箇所統合） | 1.5h | DRY原則 |
| 6 | デッドコード候補の再計測と分類更新 | 1h | 誤削除防止 |
| 7 | `ai-analysis-service.ts` を server/client 境界に合わせて再配置 | 1-2h | DOD-09整合 |
| 8 | 二重型キャスト → Zodバリデーション | 1h | 型安全性 |
| 9 | `supabase-browser.ts` 廃止と関連stabilization test更新 | 30min-1h | 保守性 |
| 10 | RLS操作タイプ網羅性監査（DoD-08基準） | 2h | セキュリティ |

### 🟢 低優先（Nice to Have）

| # | 項目 | 工数 | 効果 |
|---|------|------|------|
| 11 | `treatment_menu_records` / `treatments` のRLS要否判断 | 30-60min | セキュリティ |
| 12 | `useFormValidation()` フック抽出 | 2-3h | DRY |
| 13 | 大きなフック分割（5フック × 4-6h） | 20-30h | テスタビリティ |
| 14 | 大きなページからロジック抽出 | 8-12h | 保守性 |

### 合計工数見積もり

| レベル | 工数 | 対象 |
|--------|------|------|
| 🔴 最優先のみ | 約8-10h | #1-4 |
| 🔴 + 🟡 | 約16-19h | #1-10 |
| 全項目 | 約45-55h | #1-14 |

---

## 9. 問題なし（変更不要）の領域

| 領域 | 評価 |
|------|------|
| コンポーネント構造（lazy-load + コロケーション） | ✓ 適切 |
| Provider（3つとも小さく責務明確） | ✓ 適切 |
| RLSカバレッジ（40/46テーブル） | ✓ 良好だが未適用6テーブルの意図確認要 |
| service_role使用（サーバーサイドのみ） | ✓ 適切 |
| マイグレーション/型生成パイプライン | ✓ 安定 |
| Supabaseクライアント基本構造 | ✓ 正しい分離 |
| エラーハンドリング一貫性（90%以上） | ✓ 良好 |
| `legacy/` ディレクトリ隔離 | ✓ 完全隔離 |
| Seed/Config設定 | 要コマンド実行確認（DOD-01〜05未実施のため断定保留） |
| 認証関数（can_access_clinic等） | ✓ O(1)パフォーマンス |
