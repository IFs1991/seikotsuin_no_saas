# Onboarding仕様書（アカウント作成 + Supabase連携）

## 1. 目的
新規テナント（整骨院/サロングループ）が自分でアカウント作成し、初期設定（店舗・権限・スタッフ招待）を完了できるオンボーディング機能を提供する。

## 2. スコープ
- メール/パスワードによるアカウント作成（既存Supabase Auth）
- Google認証によるアカウント作成/ログイン（Supabase OAuth）
- 初回ログイン後のオンボーディングウィザード
- クリニック（テナント）作成と管理者割り当て
- スタッフ招待（メール招待）
- 基本設定の初期化（営業時間/支払方法/メニュー/患者分類の最低限）

## 3. スコープ外（今回やらない）
- 課金/プラン管理（Stripe/PAY.JP）
- 大規模なデータ移行（CSV一括 import の本格対応）
- SSO/外部IDP連携

## 4. 現状把握（構造と関連実装）
### 4.1 srcディレクトリ概要（主要のみ）
- `src/app`: 画面/ルーティング（App Router）
- `src/app/api`: APIルート（Supabase連携）
- `src/lib/supabase`: Supabase client/guards
- `src/providers`: プロファイルコンテキスト
- `src/hooks`: UI側データ取得
- `src/database`: DBスキーマ/ポリシー/seed
- `src/components`: UI部品

### 4.2 認証/プロフィール周り（既存）
- `/admin/login` でログイン/サインアップ（`src/app/admin/login/page.tsx`）
- サーバーアクションで `supabase.auth.signUp/signIn`（`src/app/admin/actions.ts`）
- ログイン後は `/admin/callback` でセッション確立（`src/app/admin/callback/route.ts`）
- `/api/auth/profile` が `profiles` を参照してプロフィール返却（`src/app/api/auth/profile/route.ts`）

### 4.3 主要テーブル（既存）
- `public.clinics`, `public.profiles`, `public.staff`（`src/database/schemas/01_core_tables.sql`）
- `public.roles`, `public.permissions`, `public.role_permissions`（`src/database/schemas/02_master_data.sql`）
- `public.system_settings`（`src/database/schemas/02_master_data.sql`）

### 4.4 現状ギャップ
- `user_permissions` テーブルがコード上で参照されるが、スキーマに定義がない
  - `src/lib/supabase/server.ts`, `src/app/api/admin/users/route.ts` 等
  - 仕様上は `profiles` と役割が重複しているため、統一が必要

## 5. 要件（オンボーディング）
### 5.1 ユーザーストーリー
1. 新規ユーザーはメール/パスワードでアカウント作成できる
2. メール認証完了後、オンボーディングに誘導される
3. クリニック情報を入力して自店舗（テナント）を作成できる
4. そのユーザーが初期管理者として割り当てられる
5. スタッフをメール招待できる
6. 必須の初期設定が一通り整えばダッシュボードに遷移する

### 5.2 オンボーディングステップ（案）
1. 基本情報（管理者名/電話/運営名）
2. クリニック作成（名称/住所/電話/営業時間）
3. スタッフ招待（任意）
4. 基本マスタ初期化（施術メニュー/支払方法/患者分類）
5. 完了（ダッシュボードへ）

## 6. 仕様（機能・画面）
### 6.1 画面構成
- `src/app/onboarding/page.tsx`（ウィザード起点）
- `src/app/onboarding/steps/*`（分割ステップ）
- `src/components/onboarding/*`（入力フォーム）

### 6.2 リダイレクト条件
- ログイン後、プロフィールに `clinic_id` が無い場合は `/onboarding` へ誘導
- `is_active=false` の場合は `/admin/login?error=inactive`

### 6.3 画面要件（最低限）
**Step 1: 管理者基本情報**
- 氏名/電話
- `profiles.full_name`, `profiles.phone_number` を更新

**Step 2: クリニック作成**
- クリニック名、住所、電話、営業時間
- `clinics` 新規作成
- `profiles.clinic_id` を更新
- `profiles.role` を `admin` に設定

**Step 3: スタッフ招待（任意）**
- メール/ロール/権限
- 招待リンク発行 → メール送信（Supabase Authのinvite or magic link）

**Step 4: 初期マスタ**
- 施術メニュー（最低1件）
- 支払い方法（現金/カード）
- 患者タイプ（初診/再診）

### 6.4 完了条件
- `profiles.clinic_id` が存在
- `profiles.role` が `admin` or `clinic_manager`
- 必須マスタが1件以上
- オンボーディング完了フラグ

## 7. Supabase連携仕様
### 7.1 認証
既存の `supabase.auth.signUp` を継続利用。メール認証後、`/admin/callback` でセッション確立。
Google OAuth も有効化し、`/admin/login` にGoogleログイン導線を追加する。

### 7.2 DB更新（推奨手順）
- `createAdminClient()` を利用して初回のみ `clinics` と `profiles` を更新
- `profiles` は `auth.users` と1:1で紐付け
- RLSにより通常は本人のみが更新可能

### 7.3 新規/追加テーブル（提案）
**A. onboarding_states**
- `id`, `user_id`, `clinic_id`, `current_step`, `completed_at`, `metadata`, `created_at`, `updated_at`
- 進捗管理用（UI制御と再開）

**B. staff_invites**
- `id`, `clinic_id`, `email`, `role`, `token`, `expires_at`, `accepted_at`, `created_by`
- 招待管理用

**C. user_permissions（維持・活用）**
- 既存テーブルをそのまま活用（改修コスト削減）
- オンボーディング完了時に `profiles` と `user_permissions` を同時に作成
- 既存の admin API（`/api/admin/users`）との整合性を維持

## 8. API設計（案）
### 8.1 `/api/onboarding/status` (GET)
- 認証済みユーザーの進捗を返す

### 8.2 `/api/onboarding/profile` (POST)
- 管理者基本情報の更新

### 8.3 `/api/onboarding/clinic` (POST)
- クリニック作成
- `clinics` 作成 + `profiles` 更新

### 8.4 `/api/onboarding/invites` (POST)
- Supabase invite を使用（`auth.admin.inviteUserByEmail`）
- 招待後に `profiles` を作成/更新（role, clinic_id）

### 8.5 `/api/onboarding/seed` (POST)
- 初期マスタの投入（treatment_menus / payment_methods / patient_types）

## 9. RLS/セキュリティ
- `onboarding_states` と `staff_invites` は `user_id` / `clinic_id` で制限
- `createAdminClient()` は初回作成時のみ使用（API側で厳格に認証）
- 監査ログは `audit_logs` に記録

## 10. 受け入れ条件
- 新規ユーザーが自力で「アカウント作成 → クリニック作成 → 初期設定 → ダッシュボード」まで到達できる
- 再ログイン時にオンボーディングが再開できる
- 管理者以外はオンボーディング完了前に管理画面へアクセスできない

## 11. 未決事項（要確認）
- ~~`user_permissions` を新設するか、`profiles` で一本化するか~~ → **維持で確定**
- ~~招待メール送信の方法~~ → **Supabase invite で確定**
- スタッフ登録時の入力項目（氏名/電話/役職）
- Google OAuth のリダイレクトURLとアカウント連携ポリシー

## 12. 方針決定（確定）
- 招待メールは Supabase invite を採用
- Google認証をオンボーディングに含める

### 権限管理方針
- **`user_permissions` を維持**（既存コード活用・将来拡張性確保）
- オンボーディング時: `profiles` 作成後、`user_permissions` も同時に作成
- 権限チェックの優先順位: `user_permissions` → `profiles` フォールバック（既存ロジック維持）

### オンボーディング時の権限設定フロー
1. `profiles` を作成（user_id, clinic_id, role, email, full_name）
2. `user_permissions` を作成（staff_id=user_id, clinic_id, role, username=email）
3. 両テーブルの `role` は同期させる（source of truth は `user_permissions`）

### 将来拡張への対応
- 1ユーザーが複数clinicを管理するケースに対応可能
- 権限の細分化（閲覧のみ/編集可など）も追加可能

---

## 13. 実装記録（2025-12-25）

### 13.1 TDD実装完了

TDD（テスト駆動開発）で以下を実装完了。

#### Phase 1: DB層
- マイグレーション: `supabase/migrations/20251225000100_onboarding_tables.sql`
- E2E RLSテスト: `src/__tests__/e2e/onboarding-rls.e2e.test.ts`

#### Phase 2: API層
- Zodスキーマ: `src/app/api/onboarding/schema.ts`
- APIルート:
  - `GET /api/onboarding/status` - 進捗確認
  - `POST /api/onboarding/profile` - 管理者基本情報更新
  - `POST /api/onboarding/clinic` - クリニック作成（RPC関数使用）
  - `POST /api/onboarding/invites` - スタッフ招待
  - `POST /api/onboarding/seed` - 初期マスタ投入
- スキーマテスト: `src/__tests__/api/onboarding-schema.test.ts` (25件)
- 統合テスト: `src/__tests__/integration/onboarding-api.test.ts` (13件)

#### Phase 3: フロントエンド層
- 型定義: `src/types/onboarding.ts`
- カスタムフック: `src/hooks/useOnboarding.ts`
- コンポーネント: `src/components/onboarding/`
  - `OnboardingProgress.tsx` - 進捗表示
  - `ProfileStep.tsx` - Step 1
  - `ClinicStep.tsx` - Step 2
  - `InvitesStep.tsx` - Step 3
  - `SeedStep.tsx` - Step 4
  - `CompletedStep.tsx` - 完了画面
- ページ: `src/app/onboarding/page.tsx`

#### 修正ファイル
- `src/app/admin/callback/route.ts` - clinic_idがない場合は `/onboarding` へリダイレクト

### 13.2 コードレビュー・修正事項

#### RLSポリシーの修正
- **問題**: `staff_invites_token_select` が `USING(TRUE)` で全レコード公開
- **修正**: クリニック管理者のみ閲覧可能に変更。招待トークン検証はRPC関数で実装

#### トランザクション対応
- **問題**: `clinic/route.ts` でクリニック作成・プロフィール更新・権限作成が個別実行
- **修正**: `create_clinic_with_admin` RPC関数を作成し、トランザクション内で一括処理

#### マスタデータへのclinic_id追加
- **問題**: `seed/route.ts` でマスタデータ投入時に `clinic_id` 未設定
- **修正**: 全マスタテーブルへの投入時に `clinic_id` を設定

#### stale closure対策
- **問題**: `useOnboarding` の `skipCurrentStep` でstale closureの可能性
- **修正**: `useRef` を使用して最新のステータスを参照

#### ロール選択肢の拡充
- **問題**: `InvitesStep` でロール選択肢が2種類のみ
- **修正**: 5種類のロール（clinic_manager, therapist, staff, manager）に対応

#### 認証エラー処理
- **追加**: オンボーディングページで認証エラー時にログインページへリダイレクト

### 13.3 追加されたRPC関数

```sql
-- クリニック作成（トランザクション）
create_clinic_with_admin(p_name, p_address, p_phone_number, p_opening_date)

-- 招待トークン検証
get_invite_by_token(invite_token)

-- 招待受諾
accept_invite(invite_token)
```

### 13.4 テスト結果

| カテゴリ | テスト数 | 結果 |
|---------|---------|------|
| スキーマテスト | 25件 | PASS |
| API統合テスト | 13件 | PASS |
| **合計** | **38件** | **PASS** |

### 13.5 残タスク

- [ ] マイグレーション適用: `npx supabase db push`
- [ ] E2E RLSテスト実行（実Supabase環境必要）
- [ ] E2Eフローテスト作成（ブラウザテスト）
- [ ] Google OAuth対応（スコープ外として後日実装）
