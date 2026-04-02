# 限定パイロットリリース仕様書 v0.1

## 文書情報

| 項目 | 内容 |
|------|------|
| 作成日 | 2026-03-16 |
| 対象 | 整骨院管理SaaS 限定パイロット版 |
| 導入規模 | 2〜3院（内部パイロット） |
| 前提コミット | `b133f6c`（CI/CD MVP 実装後） |

---

## 1. パイロットの目的とスコープ

### 目的

- 実際の整骨院業務で主要機能を検証し、UX・業務フローの改善点を収集する
- テナント境界（RLS）と権限制御が実運用で正しく動作することを確認する
- 公開 SaaS リリース前の品質ベースラインを確立する

### パイロット対象ユーザー

| ロール | 人数（想定） | 利用機能 |
|--------|-------------|----------|
| admin（本部管理者） | 1 名 | 多店舗 KPI・テナント管理・全管理設定 |
| clinic_admin / manager（院管理者） | 2〜3 名 | 自院のダッシュボード・予約・患者・日報・収益・設定 |
| therapist / staff（スタッフ） | 5〜10 名 | 予約管理・患者管理・日報入力 |

**注記**: 上表は「パイロットで主に想定する利用機能」を示す。現行実装では `therapist` / `staff` も `/revenue`・`/staff` に到達可能なため、パイロットで利用を制限したい場合は別途権限制御仕様を追加すること。

### パイロット対象機能

以下の機能をパイロットで提供する。**ここに含まれない機能はナビゲーションから非表示にする。**

| 機能 | ルート | 対象ロール |
|------|--------|-----------|
| ダッシュボード | `/dashboard` | 全ロール |
| 予約管理（タイムライン・一覧・新規・詳細） | `/reservations/**` | 全ロール |
| 患者管理（一覧・詳細） | `/patients/**` | 全ロール |
| 日報管理（入力・一覧・編集） | `/daily-reports/**` | 全ロール |
| 収益分析 | `/revenue` | `admin` / `clinic_admin` / `manager` / `therapist` / `staff` |
| スタッフ管理 | `/staff` | `admin` / `clinic_admin` / `manager` / `therapist` / `staff` |
| 多店舗分析 | `/multi-store` | `admin` のみ |
| テナント管理 | `/admin/tenants` | `admin` / `clinic_admin` |
| ユーザー権限管理 | `/admin/users` | `admin` / `clinic_admin` |
| システム設定（実装済みカテゴリのみ） | `/admin/settings` | `admin` / `clinic_admin` |
| MFA 設定 | `/admin/mfa-setup` | `admin` / `clinic_admin` |
| 利用規約 | `/terms` | 全ユーザー（新規作成） |
| プライバシーポリシー | `/privacy` | 全ユーザー（新規作成） |

### パイロット対象外（非表示化）

| 機能 | ルート | 非表示方法 | 理由 |
|------|--------|-----------|------|
| AI チャット | `/chat`, `/admin/chat` | P1-05 middleware | Gemini 連携が簡易実装。サイドバーに `/chat` メニューなし（URL 直打ちのみ到達可能） |
| AI 分析 | `/ai-insights` | P0-02 ナビ非表示 + P1-05 middleware | サイドバー `CORE_MENU` 行 61 に存在 |
| セキュリティダッシュボード | `/admin/security-dashboard` | P1-05 middleware | 通知システムが TODO。サイドバーに掲載なし |
| セキュリティモニタリング | `/admin/security-monitor` | P1-05 middleware | 同上 |
| セッション管理 | `/admin/session-management` | P1-05 middleware | 「準備中」表示が残る。サイドバーに掲載なし |
| ベータ監視 | `/admin/beta-monitoring` | P1-05 middleware | 内部ツール。サイドバーに掲載なし |
| マスターデータ管理 | `/admin/master`, `/master-data` | P1-05 middleware | 旧導線 `/master-data` も残存。サイドバーに掲載なし |
| ブロック管理 | `/blocks` | P1-05 middleware | ナビ未掲載だが URL 直打ちアクセス可能 |

**注意**: 上記のうちサイドバー `CORE_MENU` / `ADMIN_MENU` に実際に存在するパイロット対象外項目は `/ai-insights` のみ。他はナビ非掲載のため P1-05 middleware でのルートブロックが主な対策。なお現行ナビには仕様表に未記載の `/`（トップ）と `/admin`（管理ダッシュボード）が存在する。

---

## 2. リリースブロッカー（P0）

パイロット開始前に**必ず完了する**タスク。

### P0-01: 利用規約ページの作成

- **進行状況**: 完了（2026-03-17）
- **現状**: 登録ページで `termsAccepted` チェックボックスあり（`register/page.tsx` 行 266）、`terms_version: 'v1'` をユーザーメタデータに保存済み（`register/actions.ts` 行 93-98）。しかし利用規約本文を表示するページが存在しない。
- **対応ファイル**:
  - 新規: `src/app/terms/page.tsx`
  - 新規: `src/app/privacy/page.tsx`
  - 修正: `src/app/register/page.tsx`（行 266）— `<span>利用規約に同意する</span>` を `/terms` へのリンクに変更
  - 修正: `src/app/client-layout.tsx` または共通フッター用コンポーネント — 規約・ポリシーへのリンクを追加
- **要件**:
  - 利用規約ページ（`/terms`）— 認証不要でアクセス可能
  - プライバシーポリシーページ（`/privacy`）— 認証不要でアクセス可能
  - `middleware.ts` でこれらのルートが認証なしで通過することを確認（現状 `PROTECTED_ROUTE_PREFIXES` に含まれていないため追加対応は不要な見込み。要動作確認。）
  - コンテンツは Markdown またはハードコードの JSX でよい（パイロット規模）
  - 医療情報を扱うため、個人情報保護法・医療情報ガイドラインへの対応を明記
- **受入基準**:
  - `/terms` にアクセスすると利用規約が表示される
  - `/privacy` にアクセスするとプライバシーポリシーが表示される
  - 登録ページの「利用規約に同意する」が `/terms` へのリンクになっている
  - 未認証でもアクセス可能

### P0-02: ナビゲーションのパイロット対象外メニュー非表示化

- **進行状況**: 完了（2026-03-17）
- **現状**: サイドバー（`sidebar.tsx`）の `CORE_MENU`（行 24-62）に `/ai-insights` が含まれている。`ADMIN_MENU`（行 64-70）には対象外項目なし。ヘッダー（`header.tsx`）の `ADMIN_LINKS`（行 24-30）にも対象外項目はない。フィーチャーフラグ `NEXT_PUBLIC_ENABLE_AI_INSIGHTS` が `.env` に存在するが、ナビゲーション側で参照していない。なお `/chat` はサイドバー・ヘッダーいずれにも存在しない（URL 直打ちのみ到達可能で、P1-05 の middleware で対処）。
- **対応ファイル**:
  - 修正: `src/components/navigation/sidebar.tsx`（行 24-62: `CORE_MENU` 定義）
  - 修正: `src/components/navigation/mobile-bottom-nav.tsx`（モバイル導線の同等制御）
- **要件**:
  - `NEXT_PUBLIC_ENABLE_AI_INSIGHTS=false` の場合、サイドバーの `ai-insights` メニュー項目を非表示
  - フィルタリングは `CORE_MENU` 配列の `.filter()` で実装（`src/lib/feature-flags.ts` の本格拡張は P2-05 で行うため、P0-02 では直接 `process.env.NEXT_PUBLIC_ENABLE_AI_INSIGHTS !== 'true'` チェックで十分）
  - P0-02 の責務は**ナビメニューの非表示化のみ**。URL 直打ちアクセスの middleware ブロックは P1-05 で対処する。
- **受入基準**:
  - `NEXT_PUBLIC_ENABLE_AI_INSIGHTS=false` でサイドバーから AI 分析が消える
  - `NEXT_PUBLIC_ENABLE_AI_INSIGHTS=false` で mobile nav から AI 分析が消える
  - パイロット対象外の AI 分析メニューがナビから消える

### P0-03: ヘルスチェック API の強化

- **進行状況**: 完了（2026-03-18）
- **現状**: `src/app/api/health/route.ts` で `createAdminClient` を用いた DB 疎通確認を実装済み。正常時は `200 { ok: true, database: 'connected', timestamp }`、接続エラーまたは 5 秒タイムアウト時は `503 { ok: false, database: 'disconnected', timestamp }` を返す。ユニットテストは `src/__tests__/api/health-route.test.ts` で追加済み。
- **対応ファイル**:
  - 修正: `src/app/api/health/route.ts`
  - 新規テスト: `src/__tests__/api/health-route.test.ts`
- **要件**:
  - Supabase への接続テスト（`SELECT 1` 相当）を追加
  - **`createAdminClient` で `SUPABASE_SERVICE_ROLE_KEY` を使用**（health check ルートには cookie がないため `createServerClient` は不適切。admin client を使用する）
  - DB 接続失敗時は `ok: false` + HTTP 503 を返す
  - レスポンスに `database: 'connected' | 'disconnected'` を含める
  - タイムアウト 5 秒で失敗判定
- **受入基準**:
  - Supabase が正常時: `GET /api/health` → `200 { ok: true, database: 'connected', timestamp }`
  - Supabase が停止時: `GET /api/health` → `503 { ok: false, database: 'disconnected', timestamp }`

### P0-04: エラー監視の最小導入

- **進行状況**: 完了（2026-03-24）
- **現状**: `@sentry/nextjs` を導入し、server / edge / client の初期化導線を追加済み。`src/instrumentation.ts` で server / edge、`instrumentation-client.ts` で client を初期化し、`src/app/global-error.tsx` で App Router の描画例外を `captureException` する。管理者向けのテストイベント API `POST /api/admin/monitoring/sentry-test` も追加済み。`SENTRY_DSN` 未設定時は no-op。ユニットテストは追加済みだが、**実 DSN でのイベント着弾確認は未実施**。
- **対応ファイル**:
  - 新規: `instrumentation-client.ts`
  - 新規: `sentry.server.config.ts`
  - 新規: `sentry.edge.config.ts`
  - 新規: `src/instrumentation.ts`（Next.js instrumentation hook）
  - 新規: `src/app/global-error.tsx`
  - 新規: `src/app/api/admin/monitoring/sentry-test/route.ts`
  - 新規: `src/lib/monitoring/sentry.ts`
  - 新規テスト: `src/__tests__/monitoring/sentry-setup.test.ts`
  - 新規テスト: `src/__tests__/monitoring/instrumentation-client.test.ts`
  - 新規テスト: `src/__tests__/config/next-sentry-config.test.ts`
  - 新規テスト: `src/__tests__/pages/global-error.test.tsx`
  - 新規テスト: `src/__tests__/api/admin-sentry-test-route.test.ts`
  - 修正: `package.json`（`@sentry/nextjs` 追加）
  - 修正: `next.config.js`（`withSentryConfig` でラップ。既存の `output: 'standalone'` 設定・カスタム `webpack` 設定との互換性に注意）
- **要件**:
  - 最低限のエラーキャプチャ — 未捕捉例外・未処理 Promise rejection を収集
  - API ルートのエラーも捕捉
  - 環境変数 `SENTRY_DSN` で有効/無効を切替
  - パイロットでは Sentry Free Tier で十分
  - **代替案**: Sentry 統合が `next.config.js` の既存設定と衝突する場合、Vercel Analytics + Vercel Log Drain で代替可能。この場合のファイル変更は大幅に軽減される。
- **受入基準**:
  - 意図的にエラーを発生させた場合、Sentry（または代替サービス）にイベントが記録される
  - `SENTRY_DSN` 未設定時はエラー監視が無効（ローカル開発に影響しない）
- **確認状況**:
  - `npm run type-check` 通過
  - Sentry 関連ユニットテスト通過
  - `SENTRY_DSN` ありの `npm run build` は Sentry 組み込み後も compile 自体は通過するが、最終的に既存の `spawn EPERM` で停止
- **2026-03-19 確認**:
  - repo 直下の `.env.local`, `.env.production`, `.env.staging`, `.env.test`, `.env.development`, `.env.local.example`, `.env.production.example`, `.env.test.example` には `SENTRY_DSN=` 定義なし
  - そのためローカルでは「実 DSN 着弾確認」は未実施。受入継続条件は実運用環境または安全な共有手段で DSN が提供されること
- **2026-03-24 受入確認**:
  - `.env.local` に実 `SENTRY_DSN` を設定
  - 管理者ログイン後に `POST /api/admin/monitoring/sentry-test` を実行し、`200` と `eventId: f018cb21893a4755aeddb9abf260eac7` を確認
  - API 応答は `success: true`, `message: 'Sentry test event captured'`
- **リスク**: 既存の `next.config.js` が `output: 'standalone'` + カスタム webpack + CSP headers を含むため、`withSentryConfig` ラップで設定衝突の可能性がある。現時点では compile までは通ることを確認済み。

### P0-05: 公開予約 API のアクセス制御

- **進行状況**: 完了（2026-03-17）
- **現状**: `POST /api/public/reservations`（`route.ts`）が `allowOnlineBooking` フラグを参照せず、常にリクエストを受け付ける。公開予約用の患者向けページも存在しない。
- **対応ファイル**:
  - 修正: `src/app/api/public/reservations/route.ts`
  - 新規テスト: `src/__tests__/api/public-reservations-route.test.ts`
- **要件**:
  - パイロットでは公開予約 API を**デフォルト無効**とする
  - リクエストの `clinic_id` から `clinic_settings` テーブルを参照し、`booking_calendar` JSON カラム内の `allowOnlineBooking` が `false`（またはレコード不在）の場合は `403` を返す
  - **DB クエリパス**: `supabase.from('clinic_settings').select('settings').eq('clinic_id', clinicId).eq('category', 'booking_calendar').single()` → `settings.allowOnlineBooking` を確認。レコードが存在しない場合もデフォルト `false` 扱い。
  - パイロット期間中は管理者・スタッフによる内部予約（`/reservations/new`）のみで運用
- **受入基準**:
  - `clinic_settings` に `booking_calendar` レコードが存在しない状態で `POST /api/public/reservations` → `403`
  - `allowOnlineBooking: false` の状態で `POST /api/public/reservations` → `403`
  - `allowOnlineBooking: true` に設定変更後は `POST /api/public/reservations` → 通常動作

---

## 3. パイロット品質改善（P1）

パイロット開始前に**強く推奨**するタスク。

### P1-01: バックアップボタンのダミー動作修正

- **進行状況**: 完了（2026-03-18）
- **現状**: `system-settings.tsx` の `handleBackupNow`（行 134-137 付近）が `setTimeout` 2 秒で解決するだけの no-op。成功メッセージは出ない。「バックアップから復元」ボタン（行 494 付近）も同様にダミー。
- **対応**:
  - 両ボタンを無効化し「Supabase ダッシュボードで管理してください」の案内テキストに差し替え
- **対応ファイル**: `src/components/admin/system-settings.tsx`

### P1-02: システム情報のハードコード修正

- **進行状況**: 完了（2026-03-18）
- **現状**: `system-settings.tsx` 行 97-102 の `useState<SystemInfo>` 初期値に `version: '2.1.0'`、`lastUpdate: '2024-08-10'` がハードコード。
- **対応**:
  - 環境変数 `NEXT_PUBLIC_APP_VERSION` で注入（`.env` への追加が必要）
  - パイロット版では `0.1.0-pilot` に更新
  - `lastUpdate` はビルド時の日付を `NEXT_PUBLIC_BUILD_DATE` で注入するか、削除
- **対応ファイル**: `src/components/admin/system-settings.tsx`, `package.json`
- **実装内容**:
  - `src/components/admin/system-settings.tsx` の `SystemInfo` 初期表示を `NEXT_PUBLIC_APP_VERSION` / `NEXT_PUBLIC_BUILD_DATE` 参照に変更
  - `package.json` の `version` を `0.1.0-pilot` に更新
  - コンポーネントテストを追加し、旧ハードコード値が表示されないことを確認
- **確認状況**:
  - `npm test -- src/__tests__/components/system-settings.test.tsx` 通過
  - `npm run type-check` 通過
- **受入確認**:
  - `/admin/settings` の「システム情報」で version が `NEXT_PUBLIC_APP_VERSION`、最終更新日が `NEXT_PUBLIC_BUILD_DATE` を表示する実装を [src/components/admin/system-settings.tsx](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/components/admin/system-settings.tsx) で確認
  - [src/__tests__/components/system-settings.test.tsx](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/__tests__/components/system-settings.test.tsx) で env 表示と旧ハードコード値非表示を確認
- **セルフレビュー**:
  - 受入条件に含まれる表示責務は `process.env.NEXT_PUBLIC_APP_VERSION` / `process.env.NEXT_PUBLIC_BUILD_DATE` 参照に限定されており、P1-02 以外の責務追加はなし

### P1-03: 管理設定の表示改善

- **進行状況**: 完了（2026-03-18）
- **現状**: `IMPLEMENTED_SETTINGS_ITEM_IDS` に含まれない設定項目は `visibleCategories` フィルタリング（行 229-236）で既にナビに表示されない設計。設定項目はクライアントサイドの React state で管理されており、URL ルーティングは存在しない（`/admin/settings` 単一ページ内の状態切替）。フォールバックの「設定画面を準備中」メッセージ（行 458-475）は `SelectedComponent` が null の場合に表示されるが、現在の設計では到達しにくい。
- **対応**:
  - 「準備中」メッセージを「パイロット版では提供しておりません。今後のアップデートで追加予定です。」に変更
  - `IMPLEMENTED_SETTINGS_ITEM_IDS` からパイロットで不要な項目をさらに精査：
    - `data-import` → パイロット初期データは手動 seed で対応するなら除外
    - `system-backup` → P1-01 でダミーを修正するため「Supabase で管理」の案内のみに
- **対応ファイル**: `src/app/admin/(protected)/settings/page.tsx`
- **実装内容**:
  - [src/app/admin/(protected)/settings/page.tsx](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/admin/(protected)/settings/page.tsx) の `IMPLEMENTED_SETTINGS_ITEM_IDS` から `data-import` を除外し、`データ管理` カテゴリ自体がパイロット画面に出ないよう調整
  - 同ファイルの未実装フォールバック文言を「パイロット版では提供しておりません。今後のアップデートで追加予定です。」へ更新
- **確認テスト**:
  - `npm test -- src/__tests__/components/admin-settings-navigation.test.tsx` 通過
  - `npm run type-check` 通過
- **セルフレビュー**:
  - 変更は `/admin/settings` 表示制御に限定し、P0-02 のナビ非表示や P1-05 の middleware ルート保護には未着手
  - `system-backup` は P1-01 の Supabase 案内 UI を引き続き表示するため残置し、責務を広げていない

### P1-04: 通知設定の「送信されない」旨の明記

- **進行状況**: 完了（2026-03-19）
- **現状**: `communication-settings.tsx` で予約確認メール・リマインダーメールのテンプレート設定 UI があるが、実際のメール送信機能は未実装。
- **対応**:
  - 通知設定画面の冒頭に「パイロット版ではメール送信は行われません。設定内容は保存されますが、実際の通知送信は今後のアップデートで対応予定です。」のバナーを追加
- **対応ファイル**: `src/components/admin/communication-settings.tsx`
- **実装内容**:
  - `src/components/admin/communication-settings.tsx` の冒頭に info バナーを追加し、保存はできても送信は行われないことを明示
  - `src/__tests__/components/communication-settings.test.tsx` を追加し、告知文言を固定
- **受入確認**:
  - `/admin/settings` の通知設定画面で非送信バナーが表示される
  - UI は既存の保存責務に留まり、通知送信機能の追加は行わない
- **DoD 紐づけ**:
  - DOD-10: 仕様と UI 表示の整合を最小差分で維持

### P1-05: middleware による対象外ルートの保護

- **進行状況**: 完了（2026-03-19）
- **現状**: `middleware.ts` でロールベースのルート保護はあるが、パイロット対象外ルートの明示的ブロックはない。URL 直打ちでアクセス可能。P0-02 はナビメニュー非表示のみを担当するため、URL 直打ち対策はこのタスクが担う。
- **対応**:
  - middleware にパイロット対象外ルートのリストを追加（`startsWith` で判定。glob 記法は使用しない）：
    - `/chat`
    - `/ai-insights`
    - `/admin/security-` （`startsWith` で `/admin/security-dashboard`, `/admin/security-monitor` の両方をカバー）
    - `/admin/beta-monitoring`
    - `/admin/session-management`
    - `/admin/master`
    - `/admin/chat`
    - `/blocks`
    - `/master-data`
  - これらのルートへのアクセスを `/dashboard` へリダイレクト
  - 環境変数 `NEXT_PUBLIC_PILOT_MODE=true` でパイロットモードを有効化。`false` または未設定の場合はブロックしない（開発環境では全ルートアクセス可能）。
  - `.env.local.example` に `NEXT_PUBLIC_PILOT_MODE` を追加すること。
- **対応ファイル**: `middleware.ts`, `.env.local.example`
- **2026-03-19 受入確認**:
  - `middleware.ts` に `PILOT_BLOCKED_ROUTE_PREFIXES` と `NEXT_PUBLIC_PILOT_MODE` 判定あり
  - `src/__tests__/auth/middleware-auth.test.ts` で `/chat`, `/ai-insights`, `/admin/security-dashboard`, `/admin/security-monitor`, `/admin/beta-monitoring`, `/admin/session-management`, `/admin/master`, `/admin/chat`, `/blocks`, `/master-data` の `/dashboard` リダイレクトを検証済み
  - `.env.local.example` に `NEXT_PUBLIC_PILOT_MODE=false` が記載済み

---

## 4. 運用改善（P2）

パイロット開始後でも対応可能。パイロット期間中に段階的に実施する。

### P2-01: Slack 通知の実装

- `src/lib/notifications/security-alerts.ts` に Slack Webhook 送信コードを実装
- `SLACK_WEBHOOK_URL` 設定時のみ有効化
- セキュリティアラート・重大エラーを通知

### P2-02: オンライン予約設定の API 永続化

- `booking-calendar-settings.tsx` のオンライン予約設定（`publicUrl`, `allowGuestBooking` 等）と通知設定（`confirmationEmail`, `reminderEmail` 等）のローカル state を `useAdminSettings` で API 保存に変更
- 注意: `allowOnlineBooking` は既に `booking_calendar` カテゴリで API 永続化されている（P0-05 で参照済み）。P2-02 の対象は `onlineSettings` と `notifications` のローカル state のみ。

### P2-03: Playwright E2E の Linux CI 検証

- Windows `spawn EPERM` を回避し、GitHub Actions の Linux runner で Playwright を実行
- `test:e2e:pw` を CI の optional job として追加
- DOD-06/DOD-07 の PASS 証跡を取得（現時点では両方 OPEN/BLOCKED）

### P2-04: セキュリティイベントの DB 書き込み

- `rate-limiter.ts` 行 487 の TODO を実装
- レート制限超過イベントを `security_events` テーブルに記録

### P2-05: フィーチャーフラグ基盤の整備

- `src/lib/feature-flags.ts` を拡張し、`NEXT_PUBLIC_ENABLE_*` フラグを一元管理
- 各コンポーネントからフラグを参照する共通 hook `useFeatureFlag` を作成
- P0-02 で直接 `process.env` チェックしている箇所をこの hook に移行

---

## 5. 環境構成

### デプロイフロー

```
ローカル検証 → Staging 環境 → パイロット（本番）環境
```

**Staging 環境**: デプロイチェックリスト（`docs/operations/deployment-checklist-supabase-vercel-v0.1.md`）の Section 2-3 に従い、パイロット本番投入前に Staging で検証を行うこと。

### パイロット環境

| 項目 | 構成 |
|------|------|
| フロントエンド | Vercel（Production デプロイ） |
| バックエンド | Supabase（Pro Plan 推奨） |
| レート制限 | Upstash Redis |
| エラー監視 | Sentry Free Tier（P0-04）または Vercel Analytics |
| ドメイン | サブドメイン（例: `pilot.example.com`） |

### 必須環境変数（パイロット用）

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# アプリケーション
NEXT_PUBLIC_APP_URL=https://pilot.example.com
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_APP_VERSION=0.1.0-pilot
NEXT_PUBLIC_DEFAULT_CLINIC_ID=<uuid-of-default-clinic>
NEXT_PUBLIC_DEFAULT_TIMEZONE=Asia/Tokyo
NEXT_PUBLIC_CLINIC_GROUP_NAME=<group-name>
JWT_SECRET=<random-secret>
ENCRYPTION_KEY=<random-secret>

# CSP（本番では full-enforce を推奨）
CSP_ROLLOUT_PHASE=full-enforce

# フィーチャーフラグ（パイロット用）
NEXT_PUBLIC_ENABLE_CHAT=false
NEXT_PUBLIC_ENABLE_AI_INSIGHTS=false
NEXT_PUBLIC_ENABLE_ADMIN_FEATURES=true
NEXT_PUBLIC_PILOT_MODE=true
NEXT_PUBLIC_MAX_CLINICS=3

# Upstash Redis（レート制限）
UPSTASH_REDIS_REST_URL=<url>
UPSTASH_REDIS_REST_TOKEN=<token>

# エラー監視（P0-04 完了後）
SENTRY_DSN=<dsn>

# AI（パイロットでは無効だが、将来有効化時に必要）
# GEMINI_API_KEY=<key>
```

**注意**: このプロジェクトは Supabase Auth を使用しています。`NEXTAUTH_SECRET` / `NEXTAUTH_URL` は不要です（`.env.local` に存在するが未使用）。

### DB 初期設定（デプロイ時に実施）

```sql
-- MFA 暗号化キー設定（必須）
ALTER DATABASE postgres SET "app.settings.mfa_encryption_key" = '<random-secret>';
```

### CI 必須ゲート（パイロットデプロイ前に全て PASS）

```
quality        → lint / type-check / scan:secrets
build          → npm run build
supabase-contract → src/types/supabase.ts header 検証
fixture-preflight → E2E fixture 静的チェック
focused-regression → PR-05 9-suite Jest
```

---

## 6. データ準備

### 初期データ投入

| 対象 | 方法 | 備考 |
|------|------|------|
| テナント（クリニック） | `supabase/seed.sql` + 管理画面 | 2〜3 院分 |
| admin ユーザー | `src/app/register` で登録後、DB で role を `admin` に設定 | 1 名 |
| clinic_admin / manager ユーザー | `user_permissions` または関連管理導線で role を設定 | 院ごと 1 名 |
| therapist / staff ユーザー | スタッフ招待機能を使用 | 院ごと 2〜5 名 |
| メニュー・保険種別 | 管理設定（`/admin/settings`）で入力 | 院ごとに異なる |
| 患者データ | パイロット院が実運用で入力 | 初期は空 |

### テナント境界の事前検証

パイロット開始前に DOD-08 / DOD-09 の検証を実施すること。

```sql
-- DOD-08: RLS ポリシーの一貫性
SELECT schemaname, tablename, policyname, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'reservations', 'blocks', 'customers', 'menus',
    'resources', 'reservation_history', 'ai_comments'
  )
ORDER BY tablename, policyname;
-- 全テーブルの qual が can_access_clinic(clinic_id) を使用していること
```

```bash
# DOD-09: クライアントパスがサーバー側 clinic guard をバイパスしていないことを確認
rg -n "createClient\(|from\('blocks'\)|from\('reservations'\)" src/
# hit の大半が src/app/api/**, src/lib/services/**, src/__tests__/** であること
# browser component から tenant table への直接アクセス経路がないこと
```

---

## 7. パイロット運用ルール

### インシデント対応

詳細は `docs/operations/RUNBOOK.md` を参照。

| 重大度 | 例 | 対応 |
|--------|-----|------|
| P0（即時対応） | データ漏洩・テナント境界突破・ログイン不可 | 即座にメンテナンスモードへ。Slack 通知（P2-01 完了後）。`RUNBOOK.md` の緊急対応手順に従う |
| P1（当日対応） | 予約が保存されない・日報データの不整合 | Supabase ログ + Sentry 確認、hotfix |
| P2（翌営業日） | UI 表示崩れ・軽微な操作性問題 | Issue 起票、次回デプロイで対応 |

### フィードバック収集

- パイロットユーザーには Google Forms または専用チャネルでフィードバックを収集
- 週次で収集内容をレビューし、P1/P2 の優先度を調整

### パイロット期間

| フェーズ | 期間 | 内容 |
|----------|------|------|
| Week 1 | 導入・初期設定 | Staging 検証 → 本番デプロイ、初期データ投入、ユーザー登録、操作トレーニング |
| Week 2-3 | 本格運用 | 実業務での利用、フィードバック収集 |
| Week 4 | 評価・判定 | 品質評価、Go/No-Go 判定、公開リリースロードマップ策定 |

---

## 8. 実装順序

```
P0-01 利用規約・プライバシーポリシー ─┐
P0-02 ナビゲーション非表示化 ─────────┤  ← ナビからの除外のみ
P0-05 公開予約 API アクセス制御 ──────┤
P0-03 ヘルスチェック強化 ─────────────┤
P0-04 エラー監視導入 ─────────────────┘
                                      │
P1-01 バックアップダミー修正 ─────────┤
P1-02 システム情報修正 ───────────────┤
P1-03 管理設定表示改善 ───────────────┤
P1-04 通知設定バナー追加 ─────────────┤
P1-05 middleware ルート保護 ──────────┘  ← URL 直打ち対策
                                      │
                              パイロットデプロイ
```

**P0-02 と P1-05 の責務分担**:
- P0-02: サイドバーから対象外メニュー項目を非表示にする（クライアントサイド）
- P1-05: middleware で URL 直打ちアクセスをブロックし `/dashboard` にリダイレクト（サーバーサイド）

### 見積もり

| 優先度 | タスク数 | 想定工数 |
|--------|---------|---------|
| P0（ブロッカー） | 5 件 | 3〜5 日（P0-04 の Sentry/next.config.js 統合が最大リスク） |
| P1（品質改善） | 5 件 | 2〜3 日 |
| P2（運用改善） | 5 件 | パイロット期間中に段階的に |
| **合計（デプロイまで）** | **10 件** | **1〜2 週間** |

---

## 9. 受入基準（パイロットリリース Go/No-Go）

### P0 タスク完了

- [x] P0-01: `/terms` と `/privacy` が認証なしでアクセス可能。登録ページに規約リンクあり
- [x] P0-02: パイロット対象外メニューがナビに表示されない
- [x] P0-03: `/api/health` が DB 接続を確認し、障害時に `503` を返す
- [x] P0-04: エラー監視サービスでテストイベントが受信できている
- [x] P0-05: `POST /api/public/reservations` がデフォルトで `403` を返す

### CI / ビルド

- [ ] CI 5 ゲートが全て PASS（DOD-05, DOD-10, DOD-11, DOD-12 に対応）
- [ ] `npm run build` が Staging 環境変数で成功する

### テナント境界（DOD-08, DOD-09）

- [ ] DOD-08: RLS ポリシーの一貫性が検証済み（上記 SQL クエリ結果を記録）
- [ ] DOD-09: クライアントパスのバイパスがないことを確認済み（`rg` 結果を記録）

### DB / インフラ

- [ ] MFA 暗号化キーが本番 DB に設定済み（`ALTER DATABASE postgres SET ...`）
- [ ] 2 院分のテナントデータが投入済み
- [ ] パイロットユーザーのアカウントが作成済み

### P1 タスク（推奨）

- [x] P1-01〜P1-05 が完了している
- [x] P1-01: バックアップ UI が無効化され、Supabase ダッシュボード案内が表示される
- [x] P1-02〜P1-04 が完了している
- [x] P1-02: システム情報の version が `NEXT_PUBLIC_APP_VERSION`、最終更新日が `NEXT_PUBLIC_BUILD_DATE` を参照して表示される
- [x] P1-04: 通知設定画面に「送信されない」旨のバナーが表示される
- [x] P1-05: URL 直打ちでパイロット対象外ルートにアクセスすると `/dashboard` にリダイレクトされる

### 既知の未解決事項（パイロット承認時に例外として記録）

- DOD-06/DOD-07: Playwright は Windows `spawn EPERM` でブロック中（P2-03 で Linux CI 検証予定）
- `test-security` ジョブは informational（`continue-on-error: true`）— 必須 gate 外

---

## 付録 A: 変更対象ファイル一覧

| タスク | 新規ファイル | 修正ファイル |
|--------|-------------|-------------|
| P0-01 | `src/app/terms/page.tsx`, `src/app/privacy/page.tsx` | `src/app/register/page.tsx`, `src/app/client-layout.tsx`（または共通フッター） |
| P0-02 | — | `src/components/navigation/sidebar.tsx` |
| P0-03 | `src/__tests__/api/health-route.test.ts` | `src/app/api/health/route.ts` |
| P0-04 | `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation.ts`, `src/app/global-error.tsx`, `src/app/api/admin/monitoring/sentry-test/route.ts`, `src/lib/monitoring/sentry.ts`, `src/__tests__/monitoring/sentry-setup.test.ts`, `src/__tests__/monitoring/instrumentation-client.test.ts`, `src/__tests__/config/next-sentry-config.test.ts`, `src/__tests__/pages/global-error.test.tsx`, `src/__tests__/api/admin-sentry-test-route.test.ts` | `package.json`, `next.config.js` |
| P0-05 | — | `src/app/api/public/reservations/route.ts` |
| P1-01 | — | `src/components/admin/system-settings.tsx` |
| P1-02 | — | `src/components/admin/system-settings.tsx`, `package.json` |
| P1-03 | — | `src/app/admin/(protected)/settings/page.tsx` |
| P1-04 | — | `src/components/admin/communication-settings.tsx` |
| P1-05 | — | `middleware.ts`, `.env.local.example` |
