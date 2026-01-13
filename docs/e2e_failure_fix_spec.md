# E2E失敗原因と修正仕様書（Option 3）

## 目的
- Docker環境でのE2E（Playwright）失敗を、実装と仕様の整合性から解消する。
- 失敗原因の推測を明示し、最小限の修正でE2Eが再現可能にする。

## 前提・参照
- `docs/Playwright_E2E手引書.md`
- `docs/E2E共通フィクスチャ仕様書.md`
- `docs/認証コンテキスト連携_MVP仕様書.md`
- `docs/認証と権限制御_MVP仕様書.md`

## 失敗対象（再現状況）
- `src/__tests__/e2e-playwright/admin-settings.spec.ts`
- `src/__tests__/e2e-playwright/auth-context.spec.ts`

## 推測される原因（精査）
1. **DBスキーマ未適用**
   - Docker側のDBに `clinic_settings` テーブルが存在せず、管理設定の保存/取得で500が発生する可能性。
2. **認証仕様の矛盾**
   - `認証と権限制御_MVP仕様書` は `clinic_id` 必須のログイン制約を要求。
   - `認証コンテキスト連携_MVP仕様書` とE2Eは「clinic未割当でもログインし、画面上で無効化表示」を前提。
3. **UIラベルのセレクタ不一致**
   - E2Eは `getByLabel(/予約枠.*分|時間単位/)` などのラベル依存。
   - 現行ラベルが「予約時間間隔（分）」「同時予約可能数」「最小文字数」などで一致しない。
4. **MFAロール名の不整合**
   - MFAページが `clinic_admin` を許可ロールとしているが、共通フィクスチャ/仕様は `clinic_manager`。

## 修正方針
- **仕様の整合を先に確定**し、実装はそれに合わせて最小修正する。
- 変更は認証/ラベル/環境起因の3点に限定し、既存の機能設計を崩さない。

## 仕様詳細

### 1) 認証（clinic未割当ユーザーの扱い）
**目的:** Auth-context E2Eと仕様の整合を取る。

**仕様:**
- `clinic_id=null` でもログインは成功させる（ログアウトは行わない）。
- 画面側で操作を無効化し、案内文を表示する（既存仕様と一致）。
- ログイン後のリダイレクトは現行の `/dashboard` を維持。

**影響ファイル:**
- `src/app/login/actions.ts`
- 仕様書の整合: `docs/認証と権限制御_MVP仕様書.md` に「clinic未割当はログイン可、操作制限」の追記。

### 2) MFA許可ロールの整合
**目的:** 仕様書およびE2E前提に合わせる。

**仕様:**
- MFAアクセス許可ロールを `admin` と `clinic_manager` に統一する。

**影響ファイル:**
- `src/app/admin/(protected)/mfa-setup/page.tsx`

### 3) 管理設定UIラベルの整合
**目的:** Playwrightの `getByLabel` が安定してヒットするようにする。

**仕様（いずれかで満たせばOK）:**
- **表示ラベルを更新**してE2Eの正規表現に一致させる。
- もしくは **inputに `aria-label` を付与**してE2Eの正規表現を満たす。

**対象ラベル案:**
- 予約枠時間: 「予約枠時間（分）」または「予約枠（分）」/「時間単位」
- 同時予約: 「同時予約数（上限）」
- パスワード最小: 「パスワード最小文字数」
- 2FA: 「二要素認証（2FA）を有効にする」

**影響ファイル:**
- `src/components/admin/booking-calendar-settings.tsx`
- `src/components/admin/system-settings.tsx`

### 4) `clinic_settings` テーブルの存在保証
**目的:** Docker環境でE2Eの保存/再読込が成功するようにする。

**仕様:**
- Docker起動時に `supabase/migrations` が確実に適用される手順を明記する。
- もしくは E2E開始前に `clinic_settings` の存在チェックを行い、未作成なら停止する（明示エラー）。

**影響ファイル（候補）:**
- `docs/test-runbook.md` への手順追記
- `scripts/e2e/seed-e2e-data.mjs` に事前チェック追加（存在確認のみ）

## 受け入れ基準
- `admin-settings.spec.ts` が保存→再読込まで通過する。
- `auth-context.spec.ts` の clinic未割当シナリオが通過する。
- MFAページの管理者シナリオが通過する。
- Docker環境で `clinic_settings` 不在による500が発生しない。

## 非対象
- E2Eテストコードの大幅なリライト
- 既存の認証フロー全体の再設計
