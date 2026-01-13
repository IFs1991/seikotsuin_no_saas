# 認証コンテキスト連携_MVP仕様書

## 実装ステータス

| 項目 | ステータス | 完了日 |
|------|-----------|--------|
| ChatPage 認証連携 | ✅ 完了 | 2025-12-31 |
| MFA設定ページ 認証連携 | ✅ 完了 | 2025-12-31 |
| Blocksページ 認証連携 | ✅ 完了 | 2025-12-31 |
| ユニットテスト | ✅ 完了 | 2025-12-31 |
| E2Eテスト作成 | ✅ 完了 | 2025-12-31 |
| E2Eテスト実行・検証 | ⏳ 未実施 | - |

## 目的
- ハードコードされた `clinicId` / `userId` を排除し、実運用の認証文脈で動作させる。
- 未ログイン・未割当・権限不足時の挙動を統一する。

## 背景/課題
- チャット: `demo-clinic-id` が固定で実データ参照ができない。
- MFA設定: `current-user-id` / `current-clinic-id` / `isAdmin=true` が固定。
- 販売停止設定: `createdBy` が固定で監査・RLSが成立しない。

## 対象範囲
- `src/app/chat/page.tsx`
- `src/app/admin/(protected)/mfa-setup/page.tsx`
- `src/app/blocks/page.tsx`
- 既存の認証/プロフィール取得コンテキスト（`useUserProfileContext` / `useUserProfile`）

## 非対象
- 認証フロー自体（サインイン/サインアップ）
- RLSポリシー設計の見直し

## 依存/前提
- `useUserProfileContext` で `clinicId` / `userId` / `role` が取得できること
- API: `/api/resources` が `clinic_id` を要求すること

## 機能要件
### 共通
- 画面ロード時にプロフィール取得を実行し、読み込み中はローディング表示。
- `clinicId` が未設定の場合は操作を無効化し、明確な説明を表示。

### チャット (`/chat`)
- `useChat` の引数に `profile.clinicId` を渡す。
- `clinicId` が無い場合は送信・トグルを無効化し、案内メッセージを表示。

### MFA設定 (`/admin/(protected)/mfa-setup`)
- `userId` / `clinicId` は `profile` から取得。
- `role` が `admin` / `clinic_manager` 以外の場合は `unauthorized` へ誘導。
- `isAdmin` は `role` 判定で決定。

### 販売停止設定 (`/blocks`)
- `createdBy` は `profile.userId` を使用。
- `sampleResources` を廃止し、`/api/resources?clinic_id=...` から取得。
- `clinicId` が無い場合は新規作成を不可にする。

## UI/UX
- 権限不足時は `src/app/unauthorized/page.tsx` と同一トーンのメッセージ。
- `clinicId` 未割当は「管理者に権限割当を依頼してください」を表示。

## エラーハンドリング
- プロフィール取得失敗時はページ上部にエラー表示。
- API失敗時は該当コンポーネントの空状態 + 再読み込み導線。

## テスト戦略（TDD）
### 先に書くテスト（fail-first）
- ChatPage: `demo-clinic-id` が使われないことを検証。
- MFASetupPage: `profile.role` が admin 以外のとき `unauthorized` 表示。
- BlockManagementPage: `createdBy` が `profile.userId` で送信される。

### テスト一覧
- `src/__tests__/components/ChatPage.test.tsx`
  - clinicIdあり: `useChat` が正しい clinicId を受け取る
  - clinicIdなし: 送信ボタンが disabled
- `src/__tests__/pages/mfa-setup.test.tsx`（新規）
  - admin: MFAダッシュボードが表示
  - non-admin: unauthorized
- `src/__tests__/pages/blocks.test.tsx`（新規）
  - resource取得が `/api/resources?clinic_id=...` で呼ばれる
  - createBlockのpayloadに `createdBy=profile.userId`

## AI駆動開発の進め方
- 変更はUI配線に限定し、認証フロー/ガード/DBスキーマは変更しない。
- `clinicId`/`userId`/`role` は `useUserProfileContext`/`useUserProfile` からのみ取得する。
- 作業分割は「Chat」「MFA」「Blocks」で担当を分け、同一ファイルを同時に編集しない。

## コンフリクト回避ルール
- `profile` の型は固定とし、拡張が必要な場合は別PRで合意してから一括変更する。
- `useChat` のAPI契約（引数/返却）に影響する変更は禁止。
- `/blocks` は `/api/resources` と `BlockService` のみを使用し、DB列名変更は行わない。

## E2Eテスト仕様
### 前提データ
- `TEST_ADMIN`（role=admin, clinic_id=clinic-A）
- `TEST_STAFF`（role=staff, clinic_id=clinic-A）
- `TEST_NO_CLINIC`（role=staff, clinic_id=null）
- `TEST_RESOURCE`（clinic-Aに紐づく staff/room）

### シナリオ
1. Adminでログイン → `/chat` を開く → 入力が有効で送信できる → `/api/chat` が `clinic_id=clinic-A` で実行され、履歴が表示される。
2. clinic未割当ユーザーで `/chat` を開く → 入力/送信が無効になり、権限割当の案内が表示される。
3. 非管理者で `/admin/mfa-setup` を開く → `unauthorized` へ遷移する。
4. 管理者で `/admin/mfa-setup` を開く → MFAダッシュボードが表示され、`userId` はプロフィール由来である。
5. `/blocks` で販売停止を作成 → 一覧に反映され、作成者が `profile.userId` で保存される。

## 受け入れ基準
- ハードコードIDが削除され、認証文脈で動作する。
- `clinicId` 未割当時に誤操作できない。
- 権限不足時に管理画面へアクセスできない。

## 変更対象ファイル
- `src/app/chat/page.tsx`
- `src/app/admin/(protected)/mfa-setup/page.tsx`
- `src/app/blocks/page.tsx`
- （必要に応じて）`src/hooks/useUserProfile.ts` / `src/providers/user-profile-context.tsx`

---

## 実装詳細（2025-12-31 完了）

### ChatPage (`src/app/chat/page.tsx`)
**変更内容:**
- ハードコード `clinicId = 'demo-clinic-id'` を削除
- `useUserProfileContext()` から `profile` を取得
- `clinicId = profile?.clinicId ?? null` で動的に設定
- `isClinicAssigned` フラグで clinicId 未割当を判定
- ローディング中は「読み込み中...」を表示
- プロフィール取得エラー時はエラーメッセージを表示
- clinicId 未割当時は入力フィールド・送信ボタンを disabled に設定
- 「管理者に権限割当を依頼してください」メッセージを表示

### MFA設定ページ (`src/app/admin/(protected)/mfa-setup/page.tsx`)
**変更内容:**
- ハードコード `userId = 'current-user-id'`、`clinicId = 'current-clinic-id'`、`isAdmin = true` を削除
- `useUserProfileContext()` から `profile` を取得
- `userId = profile?.id ?? ''`、`clinicId = profile?.clinicId ?? ''` で動的に設定
- `ADMIN_ROLES = ['admin', 'clinic_manager']` で権限判定
- `isAdmin = ADMIN_ROLES.includes(role)` でロール判定
- `useEffect` で権限チェック、非管理者は `/unauthorized` へリダイレクト
- ローディング中・エラー時の UI を追加
- clinicId 未割当時の案内メッセージを表示

### Blocksページ (`src/app/blocks/page.tsx`)
**変更内容:**
- ハードコード `createdBy: 'current-user-id'` を削除
- ハードコード `sampleResources` 配列を削除
- `useUserProfileContext()` から `profile` を取得
- `userId = profile?.id ?? null`、`clinicId = profile?.clinicId ?? null` で動的に設定
- `fetchResources()` で `/api/resources?clinic_id=${clinicId}` から動的に取得
- `createdBy: userId ?? ''` でブロック作成時に認証ユーザー ID を使用
- clinicId 未割当時は新規作成ボタンを disabled に設定
- リソース取得エラー時は再読み込みボタンを表示

### 作成したテストファイル

| ファイル | テスト数 | 内容 |
|----------|---------|------|
| `src/__tests__/components/ChatPage.test.tsx` | 22件 | 既存 + 認証コンテキスト連携テスト 7件追加 |
| `src/__tests__/pages/mfa-setup.test.tsx` | 16件 | 新規作成（ロール判定・リダイレクト・ローディング等） |
| `src/__tests__/pages/blocks.test.tsx` | 16件 | 新規作成（API取得・createdBy検証・clinicId未割当等） |
| `src/__tests__/e2e-playwright/auth-context.spec.ts` | 10件 | 新規作成（E2E シナリオ 5つをカバー） |
| `src/__tests__/e2e-playwright/fixtures.ts` | - | `NO_CLINIC_EMAIL` / `NO_CLINIC_PASSWORD` 追加 |

### テスト結果
```
Unit Tests: 54 passed (ChatPage 22 + MFA 16 + Blocks 16)
E2E Tests: 作成完了、シードデータ投入後に実行可能
```

---

## 次のステップ

### 1. E2Eテストの実行・検証（優先度: 高）
**タスク:**
- Supabase にテスト用シードデータを投入
  - `TEST_ADMIN` (role=admin, clinic_id=clinic-A)
  - `TEST_STAFF` (role=staff, clinic_id=clinic-A)
  - `TEST_NO_CLINIC` (role=staff, clinic_id=null)
  - `TEST_RESOURCE` (clinic-A に紐づく staff/room)
- `npx playwright test src/__tests__/e2e-playwright/auth-context.spec.ts` を実行
- 失敗したテストがあれば修正

**参照:** `docs/E2E共通フィクスチャ仕様書.md`

### 2. /api/resources エンドポイントの確認（優先度: 高）
**タスク:**
- `/api/resources` が `clinic_id` パラメータを受け取り、適切なリソースを返すことを確認
- 存在しない場合は実装が必要

### 3. MFADashboard コンポーネントの data-testid 追加（優先度: 中）
**タスク:**
- `MFADashboard` コンポーネントに `data-testid="mfa-dashboard"` を追加
- E2E テストでの要素検出を確実にする

### 4. 統合テスト環境の構築（優先度: 中）
**タスク:**
- CI/CD パイプラインに E2E テストを組み込む
- テスト用データベースのセットアップ自動化

### 5. 本番デプロイ前の確認事項（優先度: 高）
- [ ] ユニットテスト全件パス
- [ ] E2Eテスト全件パス
- [ ] TypeScript エラーなし（対象ファイル）
- [ ] Linter 警告なし
- [ ] セキュリティレビュー完了

---

## 備考
- 本実装は TDD（テスト駆動開発）アプローチで実施
- 先にテストを作成し、失敗を確認してから実装を行った
- 既存の認証コンテキスト（`useUserProfileContext`）を活用し、新規の認証ロジックは追加していない
