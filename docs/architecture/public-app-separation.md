# 公開面/認証後面 分離設計仕様書

本書は仕様書 `docs/tiramisu_public_login_spec_v0.1.md` に基づき、UXアーキテクトとして公開面と認証後面の分離に必要な画面一覧・ルーティング表・遷移表・レイアウト責務表を定義する。

コードは含まない。実装判断は含まない。仕様の固定のみを目的とする。

---

## 成果物1: 画面一覧

### 公開面 `(public)`

| # | 画面名 | URL | 認証要否 | 役割 |
|---|--------|-----|----------|------|
| P-01 | 公開トップ（入口ページ） | `/` | 不要 | サービス紹介、スタッフ/管理者ログインへのCTA、利用規約・プライバシーへの導線 |
| P-02 | スタッフログイン | `/login` | 不要 | 院スタッフ向けログインフォーム。管理者ログインへの切替導線あり |
| P-03 | 管理者ログイン | `/admin/login` | 不要 | HQ/管理者向けログインフォーム。スタッフログイン・新規登録への導線あり |
| P-04 | 管理者コールバック | `/admin/callback` | 不要 | OAuth/メール確認コールバック処理（Route Handler）。UIなし |
| P-05 | 招待受諾 | `/invite` | 不要 | 招待トークン付きでアクセス。未認証時はサインアップ/ログインフォーム表示。認証済み時は受諾確認表示 |
| P-06 | 利用規約 | `/terms` | 不要 | 利用規約の表示 |
| P-07 | プライバシーポリシー | `/privacy` | 不要 | プライバシーポリシーの表示 |
| P-08 | 新規登録（オーナー） | `/register` | 不要 | 初回オーナー登録フォーム。メール/パスワード/規約同意 |
| P-09 | メール確認案内 | `/register/verify` | 不要 | 登録後のメール確認案内。再送機能あり |
| P-10 | 権限エラー | `/unauthorized` | 不要 | 認証済みだが権限不足の場合に表示。ダッシュボードへの戻り導線、再ログイン導線あり |

### 認証後面 `(app)`

| # | 画面名 | URL | 認証要否 | role制約 | 役割 |
|---|--------|-----|----------|----------|------|
| A-01 | ダッシュボード | `/dashboard` | 必須 | なし（全ロール） | 経営データのリアルタイム表示 |
| A-02 | 予約一覧 | `/reservations` | 必須 | clinic系ロール（adminはリダイレクト） | 予約管理 |
| A-03 | 予約詳細 | `/reservations/[id]` | 必須 | clinic系ロール | 個別予約の詳細・編集 |
| A-04 | 新規予約 | `/reservations/new` | 必須 | clinic系ロール | 新規予約作成 |
| A-05 | 予約一覧（list） | `/reservations/list` | 必須 | clinic系ロール | 予約リスト表示 |
| A-06 | 予約設定 | `/reservations/settings` | 必須 | clinic系ロール | 予約関連設定 |
| A-07 | 予約登録 | `/reservations/register` | 必須 | clinic系ロール | 予約登録処理 |
| A-08 | 患者一覧 | `/patients` | 必須 | なし | 患者管理 |
| A-09 | 収益分析 | `/revenue` | 必須 | なし | 収益データ分析 |
| A-10 | スタッフ管理 | `/staff` | 必須 | なし | スタッフ一覧・管理 |
| A-11 | 日報一覧 | `/daily-reports` | 必須 | なし | 日報管理 |
| A-12 | 日報入力 | `/daily-reports/input` | 必須 | なし | 日報入力フォーム |
| A-13 | 日報編集 | `/daily-reports/edit` | 必須 | なし | 日報編集 |
| A-14 | AIチャット | `/chat` | 必須 | なし（パイロットモードでブロック対象） | AI経営分析チャット |
| A-15 | AIインサイト | `/ai-insights` | 必須 | なし（パイロットモードでブロック対象） | AI分析インサイト |
| A-16 | ブロック管理 | `/blocks` | 必須 | なし（パイロットモードでブロック対象） | 予約ブロック管理 |
| A-17 | オンボーディング | `/onboarding` | 必須 | なし | 初期セットアップウィザード |
| A-18 | 複数店舗管理 | `/multi-store` | 必須 | HQロールのみ | マルチテナント管理 |
| A-19 | マスタデータ管理 | `/master-data` | 必須 | なし（パイロットモードでブロック対象） | マスタデータ設定 |
| A-20 | 管理者トップ | `/admin` | 必須 | Admin UIロール | Admin統合管理ダッシュボード |
| A-21 | 管理者設定 | `/admin/settings` | 必須 | Admin UIロール | システム設定 |
| A-22 | ベータ監視 | `/admin/beta-monitoring` | 必須 | Admin UIロール（パイロットモードでブロック対象） | ベータ版監視 |
| A-23 | 管理者チャット | `/admin/chat` | 必須 | Admin UIロール（パイロットモードでブロック対象） | 管理者用AIチャット |
| A-24 | マスタ管理 | `/admin/master` | 必須 | Admin UIロール（パイロットモードでブロック対象） | マスタデータ管理（管理者側） |
| A-25 | MFA設定 | `/admin/mfa-setup` | 必須 | Admin UIロール | 多要素認証設定 |
| A-26 | セキュリティダッシュボード | `/admin/security-dashboard` | 必須 | Admin UIロール（パイロットモードでブロック対象） | セキュリティ監視 |
| A-27 | セキュリティモニター | `/admin/security-monitor` | 必須 | Admin UIロール（パイロットモードでブロック対象） | セキュリティイベント監視 |
| A-28 | セッション管理 | `/admin/session-management` | 必須 | Admin UIロール（パイロットモードでブロック対象） | セッション管理 |
| A-29 | テナント管理 | `/admin/tenants` | 必須 | Admin UIロール | テナント管理 |
| A-30 | ユーザー管理 | `/admin/users` | 必須 | Admin UIロール | ユーザー管理 |

### ルートレベル（route groupに属さない）

| # | 画面名 | URL | 認証要否 | 役割 |
|---|--------|-----|----------|------|
| R-01 | スタッフログアウト | `/logout` | 認証前提（Server Action実行） | ログアウト処理実行後 `/login` へリダイレクト |
| R-02 | 管理者ログアウト | `/admin/logout` | 認証前提（Server Action実行） | ログアウト処理実行後 `/admin/login` へリダイレクト |
| R-03 | グローバルエラー | `global-error.tsx` | 不要 | Next.js root error boundary。独自html/bodyを持つ |

### 補足: `global-error.tsx` の配置

`global-error.tsx` はNext.jsの仕様上、`src/app/` 直下に配置する必要がある。route groupの影響を受けない。独自の `<html>` `<body>` を含むため、どのレイアウトにも属さない。

### 補足: `api/` ルートの扱い

`src/app/api/` 配下のすべてのRoute Handlerは、route group `(public)` `(app)` のいずれにも属さない。`api/` ルートはレイアウトを持たないため、route groupの影響を一切受けない。現在の `src/app/api/` 配下の位置をそのまま維持する。

### 補足: `test-dashboard/` の扱い

`src/app/test-dashboard/` は空ディレクトリである。移行対象外とし、削除を推奨する。

---

## 成果物2: ルーティング表

### 凡例

- **route group**: `(public)` = 公開面、`(app)` = 認証後面、`root` = どちらにも属さない、`n/a` = route groupの影響を受けない
- **認証**: `不要` = 誰でもアクセス可、`必須` = ログイン必須、`前提` = 実行時に認証済みである想定だが未認証でもエラーにはならない
- **role制約**: `なし` = 全認証ユーザー、`Admin UI` = `canAccessAdminUIWithCompat()` が true のロール、`HQ` = `canAccessCrossClinicWithCompat()` が true のロール、`clinic系` = adminロール以外

### 公開面ルート

| URL パス | route group | ファイルパス | 認証 | role制約 | 備考 |
|----------|-------------|-------------|------|----------|------|
| `/` | `(public)` | `src/app/(public)/page.tsx` | 不要 | なし | 認証済みユーザーは役割別ホームへリダイレクト |
| `/login` | `(public)` | `src/app/(public)/login/page.tsx` | 不要 | なし | 認証済みユーザーは役割別ホームへリダイレクト |
| `/admin/login` | `(public)` | `src/app/(public)/admin/login/page.tsx` | 不要 | なし | 認証済みユーザーは役割別ホームへリダイレクト |
| `/admin/callback` | `(public)` | `src/app/(public)/admin/callback/route.ts` | 不要 | なし | Route Handler。OAuth/メール確認コールバック |
| `/invite` | `(public)` | `src/app/(public)/invite/page.tsx` | 不要 | なし | 認証済み時は招待受諾UI、未認証時はサインアップ/ログインUI |
| `/terms` | `(public)` | `src/app/(public)/terms/page.tsx` | 不要 | なし | |
| `/privacy` | `(public)` | `src/app/(public)/privacy/page.tsx` | 不要 | なし | |
| `/register` | `(public)` | `src/app/(public)/register/page.tsx` | 不要 | なし | 初回オーナー登録 |
| `/register/verify` | `(public)` | `src/app/(public)/register/verify/page.tsx` | 不要 | なし | メール確認案内 |
| `/unauthorized` | `(public)` | `src/app/(public)/unauthorized/page.tsx` | 不要 | なし | 権限エラー表示。認証の有無に関わらずアクセス可能 |

### 認証後面ルート

| URL パス | route group | ファイルパス | 認証 | role制約 | 備考 |
|----------|-------------|-------------|------|----------|------|
| `/dashboard` | `(app)` | `src/app/(app)/dashboard/page.tsx` | 必須 | なし | |
| `/reservations` | `(app)` | `src/app/(app)/reservations/page.tsx` | 必須 | clinic系 | adminロールは `/admin` へリダイレクト |
| `/reservations/[id]` | `(app)` | `src/app/(app)/reservations/[id]/page.tsx` | 必須 | clinic系 | |
| `/reservations/new` | `(app)` | `src/app/(app)/reservations/new/page.tsx` | 必須 | clinic系 | |
| `/reservations/list` | `(app)` | `src/app/(app)/reservations/list/page.tsx` | 必須 | clinic系 | |
| `/reservations/settings` | `(app)` | `src/app/(app)/reservations/settings/page.tsx` | 必須 | clinic系 | |
| `/reservations/register` | `(app)` | `src/app/(app)/reservations/register/page.tsx` | 必須 | clinic系 | |
| `/patients` | `(app)` | `src/app/(app)/patients/page.tsx` | 必須 | なし | |
| `/revenue` | `(app)` | `src/app/(app)/revenue/page.tsx` | 必須 | なし | |
| `/staff` | `(app)` | `src/app/(app)/staff/page.tsx` | 必須 | なし | |
| `/daily-reports` | `(app)` | `src/app/(app)/daily-reports/page.tsx` | 必須 | なし | |
| `/daily-reports/input` | `(app)` | `src/app/(app)/daily-reports/input/page.tsx` | 必須 | なし | |
| `/daily-reports/edit` | `(app)` | `src/app/(app)/daily-reports/edit/page.tsx` | 必須 | なし | |
| `/chat` | `(app)` | `src/app/(app)/chat/page.tsx` | 必須 | なし | パイロットモードでブロック |
| `/ai-insights` | `(app)` | `src/app/(app)/ai-insights/page.tsx` | 必須 | なし | パイロットモードでブロック |
| `/blocks` | `(app)` | `src/app/(app)/blocks/page.tsx` | 必須 | なし | パイロットモードでブロック |
| `/onboarding` | `(app)` | `src/app/(app)/onboarding/page.tsx` | 必須 | なし | |
| `/multi-store` | `(app)` | `src/app/(app)/multi-store/page.tsx` | 必須 | HQ | |
| `/master-data` | `(app)` | `src/app/(app)/master-data/page.tsx` | 必須 | なし | パイロットモードでブロック |
| `/admin` | `(app)` | `src/app/(app)/admin/(protected)/page.tsx` | 必須 | Admin UI | |
| `/admin/settings` | `(app)` | `src/app/(app)/admin/(protected)/settings/page.tsx` | 必須 | Admin UI | |
| `/admin/beta-monitoring` | `(app)` | `src/app/(app)/admin/(protected)/beta-monitoring/page.tsx` | 必須 | Admin UI | パイロットモードでブロック |
| `/admin/chat` | `(app)` | `src/app/(app)/admin/(protected)/chat/page.tsx` | 必須 | Admin UI | パイロットモードでブロック |
| `/admin/master` | `(app)` | `src/app/(app)/admin/(protected)/master/page.tsx` | 必須 | Admin UI | パイロットモードでブロック |
| `/admin/mfa-setup` | `(app)` | `src/app/(app)/admin/(protected)/mfa-setup/page.tsx` | 必須 | Admin UI | |
| `/admin/security-dashboard` | `(app)` | `src/app/(app)/admin/(protected)/security-dashboard/page.tsx` | 必須 | Admin UI | パイロットモードでブロック |
| `/admin/security-monitor` | `(app)` | `src/app/(app)/admin/(protected)/security-monitor/page.tsx` | 必須 | Admin UI | パイロットモードでブロック |
| `/admin/session-management` | `(app)` | `src/app/(app)/admin/(protected)/session-management/page.tsx` | 必須 | Admin UI | パイロットモードでブロック |
| `/admin/tenants` | `(app)` | `src/app/(app)/admin/(protected)/tenants/page.tsx` | 必須 | Admin UI | |
| `/admin/users` | `(app)` | `src/app/(app)/admin/(protected)/users/page.tsx` | 必須 | Admin UI | |

### ルートレベル（route group外）

| URL パス | route group | ファイルパス | 認証 | role制約 | 備考 |
|----------|-------------|-------------|------|----------|------|
| `/logout` | root | `src/app/logout/page.tsx` | 前提 | なし | Server Actionでログアウト実行。`/login` へリダイレクト |
| `/admin/logout` | root | `src/app/admin/logout/page.tsx` | 前提 | なし | Server Actionでログアウト実行。`/admin/login` へリダイレクト |
| `global-error.tsx` | root | `src/app/global-error.tsx` | 不要 | なし | Next.js root error boundary |

### `/logout` と `/admin/logout` の配置判断

`/logout` と `/admin/logout` は route group に属させない。理由は以下の通り。

1. ログアウトページはServer Actionを即時実行し、UIを表示しない（`return null`）
2. 公開レイアウトもアプリレイアウトも不要
3. `(public)` に置くと公開レイアウトが無駄に適用される
4. `(app)` に置くとClientLayoutが読み込まれ、profile fetchが走った直後にログアウトするという無駄が発生する
5. root直下に置くことで、root layoutのみが適用される（最小構成）

### `api/` ルートの位置

`src/app/api/` はそのまま維持する。route groupを導入しても `api/` ルートは影響を受けない。

| URL パス | ファイルパス | 備考 |
|----------|-------------|------|
| `/api/admin/**` | `src/app/api/admin/` | 管理者API |
| `/api/ai-comments/**` | `src/app/api/ai-comments/` | AIコメントAPI |
| `/api/ai-insights/**` | `src/app/api/ai-insights/` | AIインサイトAPI |
| `/api/auth/**` | `src/app/api/auth/` | 認証API |
| `/api/beta/**` | `src/app/api/beta/` | ベータAPI |
| `/api/blocks/**` | `src/app/api/blocks/` | ブロックAPI |
| `/api/chat/**` | `src/app/api/chat/` | チャットAPI |
| `/api/clinic/**` | `src/app/api/clinic/` | クリニックAPI |
| `/api/clinics/**` | `src/app/api/clinics/` | クリニック一覧API |
| `/api/customers/**` | `src/app/api/customers/` | 顧客API |
| `/api/daily-reports/**` | `src/app/api/daily-reports/` | 日報API |
| `/api/dashboard/**` | `src/app/api/dashboard/` | ダッシュボードAPI |
| `/api/health/**` | `src/app/api/health/` | ヘルスチェックAPI |
| `/api/menus/**` | `src/app/api/menus/` | メニューAPI |
| `/api/mfa/**` | `src/app/api/mfa/` | MFA API |
| `/api/notifications/**` | `src/app/api/notifications/` | 通知API |
| `/api/onboarding/**` | `src/app/api/onboarding/` | オンボーディングAPI |
| `/api/patients/**` | `src/app/api/patients/` | 患者API |
| `/api/public/**` | `src/app/api/public/` | 公開API |
| `/api/reservations/**` | `src/app/api/reservations/` | 予約API |
| `/api/resources/**` | `src/app/api/resources/` | リソースAPI |
| `/api/revenue/**` | `src/app/api/revenue/` | 収益API |
| `/api/security/**` | `src/app/api/security/` | セキュリティAPI |
| `/api/staff/**` | `src/app/api/staff/` | スタッフAPI |
| `/api/system/**` | `src/app/api/system/` | システムAPI |

---

## 成果物3: 遷移表

### 凡例

- **ユーザー状態**: 未認証 / 認証済みスタッフ（staff/manager/clinic_managerロール） / 認証済み管理者（adminロール）
- **結果**: 表示 = そのページを表示する / リダイレクト先 = 別URLへ遷移する
- 管理者ログイン（`/admin/login`）経由のログインの場合、`getDefaultRedirect` に従いadminロールは `/admin/settings`、manager/staffロールは `/dashboard` へリダイレクトする
- スタッフログイン（`/login`）経由のログインの場合、HQロールは `/admin`、clinic_id未設定は `/onboarding`、それ以外は `/dashboard` へリダイレクトする

### 3-1. 未認証ユーザーのアクセス

| アクセス先 | 挙動 | リダイレクト先 | 備考 |
|-----------|------|---------------|------|
| `/` | 表示 | - | 公開入口ページを表示 |
| `/login` | 表示 | - | スタッフログインフォームを表示 |
| `/admin/login` | 表示 | - | 管理者ログインフォームを表示 |
| `/admin/callback` | 処理 | 認証成功: 役割別ホーム / 失敗: `/admin/login?error=auth_failed` | Route Handler |
| `/invite` | 表示 | - | 招待トークンに基づきサインアップ/ログインフォームを表示 |
| `/terms` | 表示 | - | 利用規約を表示 |
| `/privacy` | 表示 | - | プライバシーポリシーを表示 |
| `/register` | 表示 | - | 新規登録フォームを表示 |
| `/register/verify` | 表示 | - | メール確認案内を表示 |
| `/unauthorized` | 表示 | - | 権限エラーページを表示 |
| `/dashboard` | リダイレクト | `/login?redirectTo=/dashboard` | middleware による |
| `/reservations` | リダイレクト | `/login?redirectTo=/reservations` | middleware による |
| `/patients` | リダイレクト | `/login?redirectTo=/patients` | middleware による |
| `/revenue` | リダイレクト | `/login?redirectTo=/revenue` | middleware による |
| `/staff` | リダイレクト | `/login?redirectTo=/staff` | middleware による |
| `/daily-reports` | リダイレクト | `/login?redirectTo=/daily-reports` | middleware による |
| `/chat` | リダイレクト | `/login?redirectTo=/chat` | middleware による |
| `/ai-insights` | リダイレクト | `/login?redirectTo=/ai-insights` | middleware による |
| `/blocks` | リダイレクト | `/login?redirectTo=/blocks` | middleware による |
| `/onboarding` | リダイレクト | `/login?redirectTo=/onboarding` | middleware による |
| `/multi-store` | リダイレクト | `/login?redirectTo=/multi-store` | middleware による |
| `/master-data` | リダイレクト | `/login?redirectTo=/master-data` | middleware による |
| `/admin` | リダイレクト | `/admin/login?redirectTo=/admin` | middleware による（/admin/** は /admin/login へ） |
| `/admin/settings` | リダイレクト | `/admin/login?redirectTo=/admin/settings` | middleware による |
| `/admin/*` (protected) | リダイレクト | `/admin/login?redirectTo=...` | middleware による |
| `/logout` | 処理 | `/login?message=ログアウトしました` | Server Action実行（セッションなしでも安全に処理） |
| `/admin/logout` | 処理 | `/admin/login?message=ログアウトしました` | Server Action実行（セッションなしでも安全に処理） |
| `/api/**` | 処理 | - | 各APIの認証ロジックに従う |

### 3-2. 認証済みスタッフのアクセス

| アクセス先 | 挙動 | リダイレクト先 | 備考 |
|-----------|------|---------------|------|
| `/` | リダイレクト | `/dashboard` | 認証済みユーザーは入口に滞在させない。仕様書推奨により `/reservations` も選択肢 |
| `/login` | リダイレクト | `/dashboard` | 認証済みならログインページに滞在させない |
| `/admin/login` | リダイレクト | `/dashboard` | 認証済みならログインページに滞在させない |
| `/invite` | 表示 | - | 認証済みユーザー向け招待受諾UIを表示 |
| `/terms` | 表示 | - | |
| `/privacy` | 表示 | - | |
| `/register` | リダイレクト | `/dashboard` | 既に認証済みなので登録不要 |
| `/register/verify` | リダイレクト | `/dashboard` | 既に認証済みなので確認不要 |
| `/unauthorized` | 表示 | - | 権限不足時に到達する可能性あり |
| `/dashboard` | 表示 | - | |
| `/reservations` | 表示 | - | |
| `/patients` | 表示 | - | |
| `/revenue` | 表示 | - | |
| `/staff` | 表示 | - | |
| `/daily-reports` | 表示 | - | |
| `/chat` | 表示 or `/dashboard` | - | パイロットモード時は `/dashboard` へリダイレクト |
| `/ai-insights` | 表示 or `/dashboard` | - | パイロットモード時は `/dashboard` へリダイレクト |
| `/blocks` | 表示 or `/dashboard` | - | パイロットモード時は `/dashboard` へリダイレクト |
| `/onboarding` | 表示 | - | |
| `/multi-store` | リダイレクト | `/unauthorized` | HQロールのみ。スタッフは権限不足 |
| `/master-data` | 表示 or `/dashboard` | - | パイロットモード時は `/dashboard` へリダイレクト |
| `/admin` | リダイレクト | `/unauthorized` | Admin UIロールのみ。スタッフは権限不足 |
| `/admin/*` (protected) | リダイレクト | `/unauthorized` | Admin UIロールのみ |
| `/logout` | 処理 | `/login?message=ログアウトしました` | ログアウト実行 |
| `/admin/logout` | 処理 | `/admin/login?message=ログアウトしました` | ログアウト実行 |

### 3-3. 認証済み管理者（adminロール）のアクセス

| アクセス先 | 挙動 | リダイレクト先 | 備考 |
|-----------|------|---------------|------|
| `/` | リダイレクト | `/admin` | 管理者は管理画面へ。仕様書推奨により `/dashboard` も選択肢 |
| `/login` | リダイレクト | `/admin` | 認証済みならログインページに滞在させない |
| `/admin/login` | リダイレクト | `/admin` | 認証済みならログインページに滞在させない |
| `/invite` | 表示 | - | 認証済みユーザー向け招待受諾UIを表示 |
| `/terms` | 表示 | - | |
| `/privacy` | 表示 | - | |
| `/register` | リダイレクト | `/admin` | 既に認証済みなので登録不要 |
| `/register/verify` | リダイレクト | `/admin` | 既に認証済みなので確認不要 |
| `/unauthorized` | 表示 | - | 通常ここには到達しないが、表示は可能 |
| `/dashboard` | 表示 | - | |
| `/reservations` | リダイレクト | `/admin` | middleware によりadminロールは `/admin` へリダイレクト |
| `/patients` | 表示 | - | |
| `/revenue` | 表示 | - | |
| `/staff` | 表示 | - | |
| `/daily-reports` | 表示 | - | |
| `/chat` | 表示 or `/dashboard` | - | パイロットモード時は `/dashboard` へリダイレクト |
| `/ai-insights` | 表示 or `/dashboard` | - | パイロットモード時は `/dashboard` へリダイレクト |
| `/blocks` | 表示 or `/dashboard` | - | パイロットモード時は `/dashboard` へリダイレクト |
| `/onboarding` | 表示 | - | |
| `/multi-store` | 表示 | - | HQロール条件を満たす場合 |
| `/master-data` | 表示 or `/dashboard` | - | パイロットモード時は `/dashboard` へリダイレクト |
| `/admin` | 表示 | - | Admin統合管理ダッシュボード |
| `/admin/settings` | 表示 | - | |
| `/admin/beta-monitoring` | 表示 or `/dashboard` | - | パイロットモード時は `/dashboard` へリダイレクト |
| `/admin/chat` | 表示 or `/dashboard` | - | パイロットモード時は `/dashboard` へリダイレクト |
| `/admin/master` | 表示 or `/dashboard` | - | パイロットモード時は `/dashboard` へリダイレクト |
| `/admin/mfa-setup` | 表示 | - | |
| `/admin/security-dashboard` | 表示 or `/dashboard` | - | パイロットモード時は `/dashboard` へリダイレクト |
| `/admin/security-monitor` | 表示 or `/dashboard` | - | パイロットモード時は `/dashboard` へリダイレクト |
| `/admin/session-management` | 表示 or `/dashboard` | - | パイロットモード時は `/dashboard` へリダイレクト |
| `/admin/tenants` | 表示 | - | |
| `/admin/users` | 表示 | - | |
| `/logout` | 処理 | `/login?message=ログアウトしました` | ログアウト実行 |
| `/admin/logout` | 処理 | `/admin/login?message=ログアウトしました` | ログアウト実行 |

### 3-4. ログイン成功後のリダイレクト先

| ログイン経路 | ロール | clinic_id | リダイレクト先 | 備考 |
|-------------|--------|-----------|---------------|------|
| `/login` (clinicLogin) | HQロール（admin） | 問わず | `/admin` | |
| `/login` (clinicLogin) | 非HQロール | なし | `/onboarding` | 初回セットアップへ |
| `/login` (clinicLogin) | 非HQロール | あり | `/dashboard` | |
| `/admin/login` (login) | admin | 問わず | `/admin/settings` | `getDefaultRedirect('admin')` |
| `/admin/login` (login) | manager | 問わず | `/dashboard` | `getDefaultRedirect('manager')` |
| `/admin/login` (login) | staff | 問わず | `/dashboard` | `getDefaultRedirect('staff')` |
| `/admin/login` (login) | その他/未定義 | 問わず | `/admin/settings` | `getDefaultRedirect(default)` |
| `/admin/callback` | 任意 | なし | `/onboarding` | OAuth/メール確認コールバック |
| `/admin/callback` | 任意 | あり + redirectTo | redirectTo先 | 安全なURL検証済み |
| `/admin/callback` | admin | あり + redirectToなし | `/admin/settings` | `getDefaultRedirect('admin')` |
| `/admin/callback` | staff/manager | あり + redirectToなし | `/dashboard` | `getDefaultRedirect(role)` |
| `/invite` (signupAndAcceptInvite) | 任意 | - | `/dashboard` | 招待受諾後 |
| `/invite` (loginAndAcceptInvite) | 任意 | - | `/dashboard` | 既存アカウントで招待受諾後 |
| `/invite` (acceptInvite) | 任意 | - | `/dashboard` | 認証済みユーザーの招待受諾後 |

### 3-5. ログアウト後のリダイレクト先

| ログアウト経路 | リダイレクト先 | 備考 |
|---------------|---------------|------|
| `/logout` (clinicLogout) | `/login?message=ログアウトしました` | 正常時 |
| `/logout` (clinicLogout) | `/login?error=logout_failed` | エラー時 |
| `/admin/logout` (logout) | `/admin/login?message=ログアウトしました` | 正常時 |
| `/admin/logout` (logout) | `/admin/login?error=logout_failed` | エラー時 |

---

## 成果物4: レイアウト責務表

### 4-1. Root Layout (`src/app/layout.tsx`)

#### 含むもの

| 責務 | 説明 |
|------|------|
| `<html lang="ja">` | HTML要素 |
| `<body>` | body要素（`suppressHydrationWarning` 付き） |
| `globals.css` の読み込み | グローバルCSS |
| `Metadata` | title, description, favicon |

#### 含まないもの

| 除外対象 | 理由 |
|----------|------|
| `ClientLayout` | 現在ここに置かれているが、`(app)` に移動する |
| `Header` | 認証後面のみに必要 |
| `Sidebar` | 認証後面のみに必要 |
| `MobileBottomNav` | 認証後面のみに必要 |
| `QueryProvider` | 認証後面のみに必要 |
| `UserProfileProvider` | 認証後面のみに必要 |
| `SelectedClinicProvider` | 認証後面のみに必要 |
| profile fetch | 認証後面のみに必要 |
| clinic fetch | 認証後面のみに必要 |
| 通知件数取得 | 認証後面のみに必要 |
| ダークモード制御 | 認証後面のみに必要 |

#### Provider責務

Root Layoutには一切のProviderを置かない。子route groupのレイアウトに委譲する。

---

### 4-2. Public Layout (`src/app/(public)/layout.tsx`)

#### 含むもの

| 責務 | 説明 |
|------|------|
| 公開ページ共通ラッパー | シンプルなコンテナ |
| フッターリンク（任意） | 利用規約・プライバシーポリシーへのリンク（必要に応じて） |

#### 含まないもの

| 除外対象 | 理由 |
|----------|------|
| `Header`（アプリ用） | 公開面にアプリヘッダーは不要 |
| `Sidebar` | 公開面にサイドバーは不要 |
| `MobileBottomNav` | 公開面にモバイルナビは不要 |
| `QueryProvider` | 公開面では React Query 不要 |
| `UserProfileProvider` | 公開面ではユーザープロフィール不要 |
| `SelectedClinicProvider` | 公開面ではクリニック選択不要 |
| profile fetch | 公開面では実行しない |
| clinic fetch | 公開面では実行しない |
| 通知件数取得 | 公開面では実行しない |
| ダークモード制御 | 公開面では不要（各ページが独自にスタイル制御） |

#### Provider責務

Public Layoutには認証依存のProviderを一切置かない。公開ページは認証依存のデータ取得を行わない。

#### 補足

各公開ページ（login, admin/login, invite, register等）は現在、ページ内部で独自に `min-h-screen` + 背景グラデーション + センタリングを行っている。Public Layoutはこれを妨げないシンプルな構成とする。

---

### 4-3. App Layout (`src/app/(app)/layout.tsx`)

#### 含むもの

| 責務 | 説明 |
|------|------|
| `QueryProvider` | React Query のグローバル設定 |
| `UserProfileProvider` | ユーザープロフィール情報の提供 |
| `SelectedClinicProvider` | 選択中クリニック情報の提供 |
| `Header` | アプリケーションヘッダー（サイドバートグル、ダークモード切替、プロフィール表示、クリニック選択、通知バッジ） |
| `Sidebar` | ナビゲーションサイドバー（ロールに応じたメニュー表示） |
| `MobileBottomNav` | モバイル用ボトムナビゲーション |
| `LegalFooterLinks` | フッターの法務リンク |
| profile fetch (`useUserProfile`) | ログインユーザーのプロフィール取得 |
| clinic fetch (`useAccessibleClinics`) | アクセス可能なクリニック一覧の取得 |
| 通知件数取得 | 管理者のみ通知件数を取得 |
| ダークモード制御 | テーマ切替（localStorage連動） |
| サイドバー開閉状態管理 | サイドバーのトグル制御 |

#### 含まないもの

| 除外対象 | 理由 |
|----------|------|
| `<html>` / `<body>` | Root Layoutの責務 |
| `globals.css` | Root Layoutで読み込み済み |
| `Metadata` | Root Layoutで定義済み |
| 認証チェック | middlewareの責務 |
| ロールチェック | middlewareおよび `admin/(protected)/layout.tsx` の責務 |

#### Provider責務

App Layoutは以下のProvider階層を持つ。

```
QueryProvider
  └── UserProfileProvider
        └── SelectedClinicProvider
              └── children（各ページ）
```

#### 補足: `admin/(protected)/layout.tsx` の位置

`admin/(protected)/layout.tsx` は `(app)` route group内の `admin/(protected)/` に配置される。App Layoutの子として機能し、Admin UIロールのサーバーサイド権限チェックを行う。この既存の構造はそのまま維持する。

---

### レイアウト階層の全体像

```
src/app/layout.tsx                    ← Root Layout (html/body/metadata/globals.css のみ)
  |
  +-- src/app/(public)/layout.tsx     ← Public Layout (シンプルなラッパー、認証依存なし)
  |     +-- page.tsx                     /
  |     +-- login/page.tsx               /login
  |     +-- admin/login/page.tsx         /admin/login
  |     +-- admin/callback/route.ts      /admin/callback
  |     +-- invite/page.tsx              /invite
  |     +-- terms/page.tsx               /terms
  |     +-- privacy/page.tsx             /privacy
  |     +-- register/page.tsx            /register
  |     +-- register/verify/page.tsx     /register/verify
  |     +-- unauthorized/page.tsx        /unauthorized
  |
  +-- src/app/(app)/layout.tsx        ← App Layout (ClientLayout相当: Header/Sidebar/Provider群)
  |     +-- dashboard/page.tsx           /dashboard
  |     +-- reservations/...             /reservations/**
  |     +-- patients/page.tsx            /patients
  |     +-- revenue/page.tsx             /revenue
  |     +-- staff/page.tsx               /staff
  |     +-- daily-reports/...            /daily-reports/**
  |     +-- chat/page.tsx                /chat
  |     +-- ai-insights/page.tsx         /ai-insights
  |     +-- blocks/page.tsx              /blocks
  |     +-- onboarding/page.tsx          /onboarding
  |     +-- multi-store/page.tsx         /multi-store
  |     +-- master-data/page.tsx         /master-data
  |     +-- admin/
  |           +-- (protected)/layout.tsx  ← Admin Protected Layout (role check)
  |           +-- (protected)/page.tsx    /admin
  |           +-- (protected)/settings/   /admin/settings
  |           +-- (protected)/...         /admin/**
  |
  +-- src/app/logout/page.tsx         ← Root直下 (route group外)
  +-- src/app/admin/logout/page.tsx   ← Root直下 (route group外、(app)/admin/ とは別パス)
  +-- src/app/global-error.tsx        ← Root直下 (Next.js仕様)
  +-- src/app/api/                    ← Root直下 (route groupの影響を受けない)
```

---

## 注意事項と制約

### middleware への影響

本仕様に基づくroute group導入は、`middleware.ts` のルーティングロジックに変更を要求しない。Next.jsのroute group `(public)` `(app)` はURLパスに影響を与えないため、`PROTECTED_ROUTE_PREFIXES` や `ADMIN_PUBLIC_ROUTES` 等の定義はそのまま維持できる。

ただし、以下の新しい挙動を追加する必要がある。

1. 認証済みユーザーが `/` にアクセスした場合の役割別リダイレクト
2. 認証済みユーザーが `/login` `/admin/login` にアクセスした場合のリダイレクト
3. 認証済みユーザーが `/register` `/register/verify` にアクセスした場合のリダイレクト

これらは middleware での実装が推奨される。

### `/admin/logout` のファイルパス問題

`(app)/admin/(protected)/` 内に `logout` を置くと、Admin UIロールチェックが適用されてしまう。ログアウトは権限に関係なく実行可能であるべきなので、`/admin/logout` は `(app)` route group の外に置く。

具体的には、`src/app/admin/logout/page.tsx` として root 直下の `admin/` ディレクトリに残す。`(app)/admin/` とは別の物理パスとなるが、`(app)` が route group であるため URL パスの衝突は起こらない。ただし、Next.js の route 解決において `src/app/admin/logout/` と `src/app/(app)/admin/logout/` の両方が存在する場合は衝突する。したがって `src/app/admin/logout/` を root 直下に残し、`(app)` 側には `admin/logout` を配置しない。

### `(public)/admin/` と `(app)/admin/` の共存

`(public)/admin/login/` と `(public)/admin/callback/` は公開面に属する。  
`(app)/admin/(protected)/` 以下は認証後面に属する。

これらはファイルシステム上の物理パスが異なる（`(public)/admin/` vs `(app)/admin/`）が、URL 上は同じ `/admin/` プレフィックスを共有する。Next.js の route group はURL に影響しないため、`/admin/login` は `(public)` 側、`/admin/settings` は `(app)` 側と正しく解決される。ただし、同一URL パスに対して両方の route group にページが存在してはならない。
