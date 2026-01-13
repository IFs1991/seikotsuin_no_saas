# 管理設定永続化_MVP仕様書

## 目的
- 管理設定がブラウザ内の擬似保存から脱却し、DBに永続化される。
- 画面再訪時に保存済み設定が復元される。

## 背景/課題
- 現状は `useAdminSettings` が `setTimeout` を用いた疑似保存のみ。
- 設定画面の一部は「準備中」表示で運用不可。

## 対象範囲
- `src/components/admin/clinic-basic-settings.tsx`
- `src/components/admin/clinic-hours-settings.tsx`
- `src/components/admin/booking-calendar-settings.tsx`
- `src/components/admin/communication-settings.tsx`
- `src/components/admin/system-settings.tsx`
- `src/components/admin/services-pricing-settings.tsx`
- `src/components/admin/insurance-billing-settings.tsx`
- `src/components/admin/data-management-settings.tsx`
- スタッフ管理は `admin/users` と `onboarding/invites` のAPIで実装

## 非対象
- 請求/レセプト処理の詳細業務ロジック
- 外部メール/SMS配信の本実装（接続情報の保存まで）

## データモデル（新規）
### `clinic_settings` テーブル（新規）
- `id` (uuid)
- `clinic_id` (uuid)
- `category` (text)
- `settings` (jsonb)
- `updated_by` (uuid)
- `updated_at` (timestamptz)
- UNIQUE `(clinic_id, category)`

### カテゴリ一覧とJSONスキーマ
- `clinic_basic`: `{ name, zipCode, address, phone, fax, email, website, description, logoUrl }`
- `clinic_hours`: `{ hoursByDay, holidays, specialClosures }`
- `booking_calendar`: `{ slotMinutes, maxConcurrent, weekStartDay, allowOnlineBooking }`
- `communication`: `{ emailEnabled, smsEnabled, lineEnabled, pushEnabled, smtpSettings, templates }`
- `system_security`: `{ passwordPolicy, twoFactorEnabled, sessionTimeout, loginAttempts, lockoutDuration }`
- `system_backup`: `{ autoBackup, backupFrequency, backupTime, retentionDays, cloudStorage, storageProvider }`
- `services_pricing`: `{ menus, categories, insuranceOptions }`
- `insurance_billing`: `{ insuranceTypes, receiptSettings, billingCycle }`
- `data_management`: `{ importMode, exportFormat, retentionDays }`

## API仕様
### GET `/api/admin/settings`
- Query: `clinic_id`, `category`
- Response: `settings`（未登録の場合はカテゴリ別のデフォルトを返す）

### PUT `/api/admin/settings`
- Body: `clinic_id`, `category`, `settings`
- 動作: upsert + `updated_by` 付与
- 監査ログ: `AuditLogger.logAdminAction`

### スタッフ管理
- 一覧: `GET /api/admin/users`
- 権限付与: `POST /api/admin/users`
- 招待: `POST /api/onboarding/invites`

## UI/UX
- 保存成功/失敗メッセージは既存のトーンで表示。
- 初回ロード時に保存済み値をフォームへ反映。
- 保存中はボタンを無効化。

## エラーハンドリング
- APIエラーは画面上部に表示し、入力値は保持。
- バリデーションエラーは該当フィールドに表示。

## テスト戦略（TDD）
### 先に書くテスト（fail-first）
- `GET /api/admin/settings` が未登録でもデフォルトを返す。
- `PUT /api/admin/settings` が upsert される。
- UIの保存クリックでAPIが呼ばれ、画面が成功メッセージを表示。

### テスト一覧
- `src/__tests__/api/admin-settings.test.ts`（新規）
  - 入力バリデーション
  - clinic_id 未指定は 400
  - upsert 動作
- `src/__tests__/components/admin-settings.test.tsx`（新規）
  - 初期ロードで値が反映される
  - 保存ボタンでAPI呼び出し
- `src/__tests__/api/admin-users.test.ts`（必要なら拡張）
  - 招待/権限付与の権限制御

## AI駆動開発の進め方
- 「カテゴリ=1 JSONスキーマ」を固定し、UI/バリデーション/APIを同一スキーマで実装する。
- 作業分割は「DB/マイグレーション」「API」「UI/フック」「テスト」で担当を分ける。
- スキーマ変更が発生する場合は、`types` とAPIレスポンスの更新を同一変更に含める。

## コンフリクト回避ルール
- `clinic_settings` の `category` 名は変更禁止（変更時はマイグレーションと互換対応が必須）。
- UIはカテゴリ単位で保存し、複数カテゴリを跨ぐ一括更新は行わない。
- 既存の `admin/users` と `onboarding/invites` のAPI契約は変更しない。

## E2Eテスト仕様
### 前提データ
- `TEST_ADMIN`（role=admin, clinic_id=clinic-A）
- `clinic_settings` は未登録状態から開始

### シナリオ
1. 管理者で `/admin/settings` → クリニック基本情報を変更 → 保存 → 再読み込みで値が保持される。
2. コミュニケーション設定のSMTPを変更 → 保存 → APIで同じ設定が返る。
3. セキュリティ設定のポリシー変更 → 保存 → 再訪で反映される。
4. スタッフ招待 → 一覧に「招待中」が追加される（テスト環境では送信を無効化）。
5. バリデーションエラー時に保存が失敗し、入力値が保持される。

## 受け入れ基準
- 設定変更がDBに保存され、再訪時に復元される。
- 管理設定画面で「準備中」表示がMVP範囲から消える。
- 権限のないユーザーは設定APIにアクセスできない。

## 変更対象ファイル
- `src/components/admin/*-settings.tsx`
- `src/hooks/useAdminSettings.ts`
- `src/app/api/admin/settings/route.ts`（新規）
- `src/database/schemas/*`（新規テーブル追加）

---

## 実装状況（2025-12-31 更新）

### Phase 1: 基盤実装 ✅ 完了

#### 完了項目

| 項目 | ステータス | 作成/更新ファイル |
|------|----------|------------------|
| DBマイグレーション | ✅ 完了 | `supabase/migrations/20251231000100_clinic_settings_table.sql` |
| API実装（GET/PUT） | ✅ 完了 | `src/app/api/admin/settings/route.ts` |
| useAdminSettingsフック更新 | ✅ 完了 | `src/hooks/useAdminSettings.ts` |
| 型定義 | ✅ 完了 | `src/types/settings.ts` |
| clinic-basic-settings永続化対応 | ✅ 完了 | `src/components/admin/clinic-basic-settings.tsx` |
| APIテスト | ✅ 完了 | `src/__tests__/api/admin-settings.test.ts` (12件パス) |
| E2Eテスト仕様作成 | ✅ 完了 | `src/__tests__/e2e-playwright/admin-settings.spec.ts` |

#### 実装詳細

**DBマイグレーション (`20251231000100_clinic_settings_table.sql`)**
- `clinic_settings` テーブル作成
- カテゴリ制約チェック（9種類）
- RLSポリシー（メンバー参照可、admin/clinic_manager のみ更新可）
- `get_clinic_settings` RPC関数（デフォルト値返却対応）
- `upsert_clinic_settings` RPC関数

**API (`/api/admin/settings`)**
- GET: 設定取得（未登録時はカテゴリ別デフォルト値を返す）
- PUT: 設定保存（upsert）+ 監査ログ出力
- Zodバリデーション（カテゴリ別スキーマ）
- 権限チェック（admin/clinic_manager/manager のみ更新可）

**useAdminSettingsフック**
- `persistOptions` 指定でAPI経由自動保存
- 初回ロード時にDBから値復元
- 既存コードとの後方互換性維持（オプション未指定時は従来動作）

**APIテスト結果**
```
PASS  src/__tests__/api/admin-settings.test.ts
  admin settings API
    GET /api/admin/settings
      ✓ clinic_id未指定で400エラーを返す
      ✓ category未指定で400エラーを返す
      ✓ 未登録の場合にデフォルト値を返す
      ✓ 登録済みの場合に保存された値を返す
    PUT /api/admin/settings
      ✓ upsertで新規作成される
      ✓ upsertで更新される
      ✓ 監査ログが出力される
      ✓ 不正なcategoryでエラーを返す
      ✓ 権限がない場合に403エラーを返す
    バリデーション
      ✓ clinic_basic: 院名が空の場合にエラー
      ✓ booking_calendar: slotMinutesが不正な値
  settings default values
    ✓ すべてのカテゴリにデフォルト値がある

Tests: 12 passed
```

---

### Phase 2: 設定コンポーネント永続化対応 ✅ 完了（2025-12-31）

#### 完了項目

| コンポーネント | カテゴリ | ステータス |
|--------------|---------|----------|
| `clinic-hours-settings.tsx` | `clinic_hours` | ✅ 完了 |
| `booking-calendar-settings.tsx` | `booking_calendar` | ✅ 完了 |
| `communication-settings.tsx` | `communication` | ✅ 完了 |
| `system-settings.tsx` | `system_security` | ✅ 完了 |
| `services-pricing-settings.tsx` | `services_pricing` | ✅ 完了 |
| `insurance-billing-settings.tsx` | `insurance_billing` | ✅ 完了 |
| `data-management-settings.tsx` | `data_management` | ✅ 完了 |

#### 変更パターン（全コンポーネント共通）

1. `useAdminSettings`, `useUserProfile` フックをインポート
2. `AdminMessage` コンポーネントと `Loader2` アイコンをインポート
3. 統一データインターフェースと `initialData` 定数を作成
4. 複数の `useState` を単一の `useAdminSettings` フックに置換
5. ローディング状態のチェックを追加
6. ヘルパー関数（`updateXxx`）を作成
7. メッセージ表示を `AdminMessage` コンポーネントに変更
8. 保存ボタンを `loadingState.isLoading` で制御

```tsx
// 更新後のパターン
const { profile, loading: profileLoading } = useUserProfile();
const clinicId = profile?.clinicId;

const {
  data: formData,
  updateData,
  loadingState,
  handleSave,
  isInitialized,
} = useAdminSettings(initialData, clinicId ? {
  clinicId,
  category: 'clinic_hours',
  autoLoad: true,
} : undefined);

if (profileLoading || !isInitialized) {
  return <LoadingSpinner />;
}
```

---

## 次のステップ（Phase 3）

### 1. マイグレーション適用 ⚠️ 未完了
```bash
# Docker起動後に実行
docker start supabase_db_seikotsuin

# Supabase ローカル環境
npx supabase db push

# または本番環境
npx supabase db push --linked
```

### 2. E2Eテスト実行
```bash
# Playwright E2Eテスト実行
npx playwright test admin-settings

# UIモードで実行（デバッグ用）
npx playwright test admin-settings --ui
```

### 3. 動作確認チェックリスト

- [ ] マイグレーション適用後、テーブルが作成されていること
- [ ] 管理画面で設定を保存し、ページ再読み込み後に復元されること
- [ ] 異なるブラウザ/セッションでも設定が共有されること
- [ ] 権限のないユーザー（staff）が設定を変更できないこと
- [ ] 監査ログに設定変更が記録されること

---

## 技術的な補足

### フックの使い方

```tsx
import { useAdminSettings, SettingsCategory } from '@/hooks/useAdminSettings';
import { useUserProfile } from '@/hooks/useUserProfile';

// 永続化あり
const { profile } = useUserProfile();
const { data, handleSave, isInitialized, reload } = useAdminSettings(
  initialData,
  profile?.clinicId ? {
    clinicId: profile.clinicId,
    category: 'clinic_basic' as SettingsCategory,
    autoLoad: true,
  } : undefined
);

// 永続化なし（従来互換）
const { data, handleSave } = useAdminSettings(initialData);
```

### APIエンドポイント

```
GET  /api/admin/settings?clinic_id={uuid}&category={category}
PUT  /api/admin/settings
     Body: { clinic_id, category, settings }
```

### RLSポリシー概要

| 操作 | 条件 |
|------|------|
| SELECT | 同一クリニックのメンバー |
| INSERT | admin, clinic_manager, manager |
| UPDATE | admin, clinic_manager, manager |
| DELETE | admin のみ |
