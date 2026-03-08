# MVP Release Readiness 2026-03-06

## 1. 結論

- **限定パイロット向けMVP**: 条件付きで到達可能
- **公開SaaSとしてのMVP**: まだ未達

理由:

- 認証、オンボーディング、スタッフ招待、公開メニュー、公開予約のコア導線は存在する
- 一方で、出荷品質、秘密情報管理、法務導線、運用監視、課金/プラン管理が未完成
- MVPコアより先に、ベータ運用・多店舗分析・セキュリティ運用UIなどの管理面が厚くなっている

補足:

- **初期顧客が多店舗前提の場合、`多店舗分析` と `HQ/tenant 管理` は過剰機能ではなくMVPコア寄り**
- そのため、本書の「過剰機能」は単店舗前提ではなく、**初期導入で本当に必要な多店舗要件を残したうえで再解釈する**

## 1.1 多店舗前提での補正

初期顧客が多店舗運営であるため、以下はMVPで必要とみなす。

- HQまたは本部ユーザーが複数店舗を横断して閲覧できること
- 店舗単位の権限境界が壊れないこと
- 複数店舗のKPI比較が最低限できること
- 店舗追加、スタッフ招待、初期設定が複数店舗でも破綻しないこと

関連実装:

- `src/app/multi-store/page.tsx`
- `src/app/api/admin/tenants/route.ts`
- `src/app/api/admin/tenants/[clinic_id]/route.ts`
- `src/app/api/onboarding/clinic/route.ts`
- `middleware.ts`

## 2. 既にあるMVPコア

| 領域 | 状態 | 証拠 |
| --- | --- | --- |
| アカウント登録 | 実装あり | `src/app/register/actions.ts` `registerOwner`, `src/app/register/schema.ts` `registerSchema` |
| 利用規約同意の取得 | 実装あり | `src/app/register/page.tsx` `termsAccepted`, `src/app/register/actions.ts` `terms_accepted`, `terms_version` |
| オンボーディング | 実装あり | `src/app/onboarding/page.tsx`, `src/app/api/onboarding/status/route.ts` `GET`, `src/app/api/onboarding/clinic/route.ts` `POST` |
| スタッフ招待 | 実装あり | `src/app/api/admin/staff/invites/route.ts` `POST` |
| 公開メニュー | 実装あり | `src/app/api/public/menus/route.ts` `GET` |
| 公開予約登録 | 実装あり | `src/app/api/public/reservations/route.ts` `POST` |
| 認証・権限制御の土台 | 実装あり | `middleware.ts`, `src/app/admin/(protected)/layout.tsx` |
| CI骨格 | 実装あり | `.github/workflows/ci.yml` `Quality Checks`, `Unit & Integration Tests`, `Security Tests`, `E2E Tests` |

## 3. 2026-03-06 時点の検証メモ

- `docs/stabilization/DoD-verification-report-2026-03-06.md` では **DOD-01〜DOD-04** のみ検証済み
- `docs/stabilization/DoD-v0.1.md` 上の **DOD-05〜DOD-12** は未完了
- 2026-03-06 にローカルで `npm run type-check` と `npm run build` を実行したところ、どちらも失敗
- よって、現時点では「再現可能に出荷できる状態」とは言えない

関連ファイル:

- `package.json` `scripts.type-check`, `scripts.build`, `scripts.test:e2e:pw`, `scripts.supabase:types`
- `docs/stabilization/DoD-v0.1.md` `DOD-05` 〜 `DOD-12`
- `docs/stabilization/DoD-verification-report-2026-03-06.md`

## 4. 限定パイロット前に必須の要件（P0）

| 要件 | 現状 | 具体内容 | 証拠 | 関連DoD |
| --- | --- | --- | --- | --- |
| ビルドと型検査を通す | NG | `npm run build` と `npm run type-check` を安定して通す | `package.json` `scripts.build`, `scripts.type-check`; `docs/stabilization/DoD-v0.1.md` `DOD-10`, `DOD-12` | DOD-10, DOD-12 |
| E2E/Playwrightを出荷基準に載せる | NG | 公開予約、ログイン、オンボーディング、管理設定の主要導線をE2Eで固定化する | `package.json` `scripts.test:e2e:pw`; `docs/stabilization/DoD-v0.1.md` `DOD-05`, `DOD-06`, `DOD-07`, `DOD-11` | DOD-05, 06, 07, 11 |
| SMTP秘密情報の扱いを修正する | NG | SMTPパスワードを `clinic_settings` に保存しない。Vercel/Supabase Secret等に移す | `src/components/admin/communication-settings.tsx` `smtpSettings.password`, `src/app/api/admin/settings/route.ts` `PUT`, `clinic_settings`, `settings: parseResult.data` | DOD外だが出荷必須 |
| 公開予約設定を永続化するか、UIを閉じる | NG | オンライン予約URL/通知設定がローカルstateのまま。保存されない設定を管理UIに出さない | `src/components/admin/booking-calendar-settings.tsx` `Online/notification settings remain local until API support is added.` | DOD-09, DOD-10 |
| 多店舗権限境界を出荷基準に含める | NG | HQ/clinic の権限差と tenant boundary を E2E/手順で保証する | `middleware.ts`, `src/app/admin/(protected)/layout.tsx`, `docs/stabilization/DoD-v0.1.md` `DOD-08`, `DOD-09` | DOD-08, DOD-09 |
| 多店舗KPIの最低限を固定する | 要確認 | 初期顧客が多店舗のため、単一店舗画面だけでは不足。店舗別比較の最低限のKPIを定義する | `src/app/multi-store/page.tsx` `多店舗分析`, `店舗別KPI比較`; `src/app/api/admin/tenants/route.ts` | DOD外だがMVP必須 |
| 法務ページを公開する | NG | 利用規約同意は取っているが、公開導線がない。最低限 `terms` / `privacy` を用意する | `src/app/register/page.tsx` `利用規約に同意する`, `src/app/register/actions.ts` `terms_version`; 2026-03-06 時点で `src/app` に `terms` / `privacy` ルート未確認 | DOD外だが公開前必須 |
| 監視をアプリ内表示から運用実体へ寄せる | NG | `/api/health` の `ok: true` と固定 `aiAnalysisStatus` だけでは監視として弱い。最低限、外部通知と障害検知を定義する | `src/hooks/useSystemStatus.ts` `useSystemStatus`, `aiAnalysisStatus: 'active'`; `src/app/api/health/route.ts` `ok: true`; `.env.production.example` `SLACK_WEBHOOK_URL` | DOD外だが運用必須 |
| 未完成画面をMVP導線から外す | NG | 「準備中」の設定画面をナビゲーション/営業資料から外す | `src/app/admin/(protected)/settings/page.tsx` `settingsCategories`, `componentMap`, `設定画面を準備中` | DOD-10 |

## 5. 公開SaaSとして出すなら追加で必須の要件（P0-public）

| 要件 | 現状 | 具体内容 | 証拠 |
| --- | --- | --- | --- |
| 課金/プラン管理 | NG | 請求、プラン変更、契約状態反映、解約導線を実装する | `src/database/schemas/01_core_tables.sql` `clinics.subscription_plan`; `docs/onboarding_spec.md` `課金/プラン管理（Stripe/PAY.JP）` はスコープ外 |
| サポート/連絡導線 | NG | 問い合わせ先、障害時の案内、運用窓口を公開する | 2026-03-06 時点で `src/app` に `support` / `contact` / `help` ルート未確認 |
| 価格・契約説明 | NG | 料金ページ、利用条件、提供範囲を明文化する | 2026-03-06 時点で `src/app` に `pricing` ルート未確認 |
| 外部監視/通知 | NG | Sentry/APM、アラート通知、障害時の一次対応フローを実装/運用する | `.env.production.example` `SLACK_WEBHOOK_URL`, `SMTP_SERVER`; `src/lib/api-helpers.ts` に外部送信TODOあり |

## 6. 過剰、またはMVPでは凍結推奨の機能

| 領域 | 推奨判断 | 理由 | 証拠 |
| --- | --- | --- | --- |
| ベータ運用モニタリング | 凍結/非表示 | MVPコアより後でよい。運用KPIとGo/No-Go支援は初期導入時には重い | `src/app/admin/(protected)/beta-monitoring/page.tsx` `ベータ運用モニタリング`, `Go/No-Go判定` |
| セッション管理UI | 凍結/限定公開 | セキュリティ運用面としては有用だが、初回販売の必須導線ではない | `src/app/admin/(protected)/session-management/page.tsx` |
| セキュリティ監視/異常検知 | 限定公開 | 実装規模が大きく、まだTODOが残る | `src/lib/security-monitor.ts` `TODO: 解決状態の管理`, `TODO: 実際の通知システム実装` |
| 多店舗分析の過度な拡張 | 縮小して残す | 初期顧客が多店舗のため削除ではなく、KPI比較の最小スコープに絞るべき | `src/app/multi-store/page.tsx` `多店舗分析`, `店舗別KPI比較` |
| 管理者AIチャット | 凍結 | UIは大きいが、応答生成はまだ簡易ロジック | `src/components/chat/admin-chat-interface.tsx` `46店舗の統合データ`, `src/app/api/chat/route.ts` `generateAIResponse`, `簡易的なAI応答生成` |
| 汎用テーブル管理 | 凍結 | メンテコストと事故リスクが高い。MVPでは必要最低限の専用画面に絞る方が安全 | `src/app/api/admin/tables/route.ts` `POST`, `DELETE`, `table_name` |

## 7. 追加で整理すべき不整合

| 項目 | 状態 | 内容 | 証拠 |
| --- | --- | --- | --- |
| 廃止済みAPIと利用コードの残存 | NG | `/api/admin/master-data` は 410 だが、それを参照する hook が残る | `src/app/api/admin/master-data/route.ts` `GONE_RESPONSE`, `status: 410`; `src/hooks/queries/useSystemSettingsQuery.ts` `systemSettingsApi.getAll/create/update/delete` |
| 管理設定の表示面積が実装密度を超えている | NG | カテゴリ数に対して実装済みコンポーネントが少ない | `src/app/admin/(protected)/settings/page.tsx` `settingsCategories`, `componentMap` |

## 8. 推奨MVPスコープ

### 残す

- 認証: `/login`, `/admin/login`, `/register`, `/invite`
- 初期導線: `/onboarding`
- 業務コア: `/dashboard`, `/patients`, `/reservations`, `/revenue`, `/daily-reports`
- 最小管理: 実装済みカテゴリに限定した `/admin/settings`
- 多店舗コア: `/multi-store`, `/api/admin/tenants`
- 公開導線: `/api/public/menus`, `/api/public/reservations`

### いったん隠す

- `/admin/beta-monitoring`
- `/admin/session-management`
- `/admin/chat`
- 汎用 `/api/admin/tables`
- 準備中表示しかない設定項目

## 9. Go / No-Go 判定基準

### 限定パイロットの Go 条件

1. `npm run build` が通る
2. `npm run type-check` が通る
3. `DOD-05` 〜 `DOD-12` のうち、少なくとも対象フローに関係する項目を完了または例外承認する
4. 多店舗の権限境界とHQ閲覧権限を検証する
5. SMTP秘密情報を `clinic_settings` から外す、またはメール送信機能自体を一時停止する
6. 利用規約とプライバシーポリシーを公開する
7. 公開予約の作成導線をE2Eまたは手順書で再現確認する
8. 非MVP画面をナビゲーションから外す

### 公開SaaSの Go 条件

1. 限定パイロットの Go 条件をすべて満たす
2. 課金/プラン管理を実装する
3. 価格、契約、問い合わせ、障害案内の公開導線を持つ
4. 外部監視/アラートと一次対応Runbookを運用に載せる

## 10. 次の実行順

1. `build` / `type-check` を通す
2. 多店舗の権限境界とKPI最小要件を確定する
3. SMTP秘密情報の保存方式を修正する
4. 法務ページを追加する
5. 公開予約設定の永続化、または未接続UIの非表示化
6. 非MVPページをナビゲーションから外す
7. 最小フローのE2Eを固定する
