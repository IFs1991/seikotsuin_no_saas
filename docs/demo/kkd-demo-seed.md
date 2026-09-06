# KKDデモ用 deterministic seed

## 目的

KKD向けの社内デモで、以下の3ロールを同じ合成データ上で通し確認する。

1. 施術者: 予約確認、日報、希望シフト
2. 院長: 自院の日報、患者、売上、スタッフ状況
3. エリアマネージャー: 担当3院の比較、売上、スタッフ、シフト確認

このseedは**合成データ専用**であり、患者実データ、KKD実店舗名、実メールアドレス、実電話番号を含まない。商用リリース判定、ステージング移行リハーサル、バックアップ／リストア証跡を代替しない。

## 実装ファイル

- `scripts/demo/kkd-demo-base.mjs`: 固定UUID、組織、ユーザー、メニュー、スタッフ基礎データ
- `scripts/demo/kkd-demo-activity.mjs`: 顧客、保険、過去／未来予約
- `scripts/demo/kkd-demo-reporting.mjs`: 日報、日報明細、売上文脈、AIコメント
- `scripts/demo/kkd-demo-workforce.mjs`: 希望シフト、確定シフト、ブロック、試用契約
- `scripts/demo/kkd-demo-fixtures.mjs`: 上記を統合し、参照整合を検証する公開fixture API
- `scripts/demo/kkd-demo-db.mjs`: migration preflight、FK順seed/reset、read model検証
- `scripts/demo/kkd-demo-contract.mjs`: `src/types/supabase.ts`とのInsert契約検証
- `scripts/demo/kkd-demo-seed.mjs`: CLI、安全確認、dry-run、seed、validate、reset
- `package.json`: `demo:*` コマンド

新規マイグレーションは追加しない。現行スキーマを正本とし、必要なテーブル・マスタ・RPCが不足している環境ではseed開始前に停止する。

## 前提マイグレーション

最低限、以下を含む現在のmigration headが適用済みであること。

| 領域 | 主なマイグレーション／契約 |
|---|---|
| 基本テナント・予約・日報 | `00000000000001_squashed_baseline.sql` と後続の現行migration |
| 日報明細 | `20260507000100_daily_report_items.sql` |
| 売上文脈・日報タグ | `20260514000100_revenue_context_phase1.sql` |
| 希望シフト | `20260602000100_shift_request_workflow.sql` |
| エリアマネージャー担当院 | `20260604000100_manager_clinic_assignments.sql` |
| エリア売上RPC | `20260611000200_manager_revenue_analysis_rpcs.sql` |
| 契約・書き込みゲート | `20260622000100_stripe_billing_core.sql` |
| スタッフプロフィール・所属 | `20260625000100_staff_profiles_memberships.sql` |
| Mobile UIUX entitlement | `20260702000100_mobile_uiux_clinic_feature_flags.sql` |
| 認可・RLS・API hardening | 現在のcommercial hardening migration一式 |

実行時preflightは、必要テーブル、`revenue_contexts`、日報タグ定義を直接確認する。さらに`src/types/supabase.ts`が存在する場合、fixtureの全Insertフィールドと必須列を生成型へ照合する。

## UI/UX → API／read model → seed対象

| デモ導線 | 主なUI／API・read model | 正本データ |
|---|---|---|
| ログイン・権限別ナビ | Auth、`profiles`、`user_permissions`、manager scope | `auth.users`, `profiles`, `user_permissions`, `manager_clinic_assignments` |
| ダッシュボード | dashboard read model | `reservations`, `daily_reports`, `ai_comments`, `staff_shifts` と集計view |
| 予約タイムライン・登録 | `/api/reservations`、予約画面 | `customers`, `menus`, `resources`, `reservations`, `blocks` |
| 日報入力・一覧 | `/api/daily-reports`、daily-report read model | `daily_reports`, `daily_report_items`, `daily_report_item_tags` |
| 患者分析 | patient analysis service／manager patient analysis | `customers`, `reservations`, `patient_visit_summary` |
| 収益分析 | revenue service、`manager_revenue_period_totals` | `daily_reports`, `daily_report_items`, `menu_billing_profiles` |
| スタッフ分析 | staff performance read model／manager staff APIs | `resources`, `reservations`, `staff_shifts`, `staff_performance_summary` |
| 担当院比較 | `/api/manager/dashboard`, `/api/manager/clinic-comparison` | `manager_clinic_assignments` と3院の同期間データ |
| 希望シフト | `/api/staff/shift-requests` | `staff_profiles`, `staff_clinic_memberships`, `shift_request_periods`, `shift_requests` |
| 確定シフト | `/api/staff/shifts`、manager roster APIs | `staff_shifts`, `staff_preferences` |
| Mobile UIUX | mobile context／write APIs | `clinic_feature_flags`, 実データテーブル一式 |
| 書き込み許可 | business write gate | root clinicの`subscriptions`を`group`／`trialing`で作成 |

`staff`は日報一覧の旧表示互換用ブリッジとしてのみ投入する。予約・シフト・担当者の正本は`resources`である。旧`staff`が利用できない環境では、その処理だけをスキップして`daily_reports.staff_id`をNULLにする。

## データストーリー

### 組織

- 親組織: 1
- 子院: 3
- 本部管理者: 1
- エリアマネージャー: 1
- 院長: 各院1
- 施術者: 各院1
- 追加デモスタッフ: 各院1

### 3院の差分

| 院 | 意図 |
|---|---|
| KKDデモ 渋谷院 | 売上・継続率が安定した好調院 |
| KKDデモ 横浜院 | 新規流入は強いが再来転換が弱い院 |
| KKDデモ 川崎院 | 高稼働だが特定スタッフへ予約が偏る院 |

デフォルトの56日履歴・14日未来データでは、概ね以下を生成する。

- 98名の合成顧客
- 600件超の過去／当日／未来予約
- 160日超の院別日報
- 500件超の日報明細
- manager担当院3件
- 希望シフト期間・申請・確定シフト・ブロック
- Mobile UIUXの読取／書込entitlement
- Stripe外部通信を伴わない`trialing`契約行

件数は`--history-days`と`--future-days`で変わる。

## コマンド

### 1. fixtureだけを静的検証

```bash
npm run demo:fixtures:check
```

DBへ接続せず、以下を検証する。

- 固定UUIDの重複
- 外部キー相当の参照整合
- 予約・シフトの時刻範囲
- 3院のmanager assignment
- `src/types/supabase.ts`とのInsert契約差分

基準日を固定して確認する場合:

```bash
node scripts/demo/kkd-demo-seed.mjs seed --dry-run --today 2026-07-22
```

### 2. ローカルSupabaseへ投入

```bash
export NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:54321'
export SUPABASE_SERVICE_ROLE_KEY='<local service role key>'
export KKD_DEMO_PASSWORD='<12文字以上の一時パスワード>'
export KKD_DEMO_CONFIRM='SEED_KKD_DEMO_V1'
npm run demo:seed
```

seedは固定デモnamespaceをFK順で消してから再投入するため、同じコマンドを再実行できる。

### 3. Hostedデモ環境へ投入

Hosted URLを検知した場合、追加の明示承認が必要。

```bash
export KKD_DEMO_ALLOW_HOSTED='ALLOW_HOSTED_KKD_DEMO_V1'
export KKD_DEMO_CONFIRM='SEED_KKD_DEMO_V1'
npm run demo:seed
```

`SUPABASE_SERVICE_ROLE_KEY`はサーバー側の一時実行環境だけに設定し、ブラウザ、Vercel public env、ログ、資料へ出さない。

### 4. 投入済みデータを検証

```bash
npm run demo:validate
```

以下を確認する。

- 各テーブルの固定demo件数
- `reservation_list_view`
- `patient_visit_summary`
- `staff_performance_summary`
- `daily_revenue_summary`
- `manager_revenue_period_totals`
- root clinicの`group`／`trialing`契約

### 5. 固定デモnamespaceを削除

```bash
export KKD_DEMO_RESET_CONFIRM='RESET_KKD_DEMO_V1'
# Hostedの場合はKKD_DEMO_ALLOW_HOSTEDも必要
npm run demo:reset
```

削除条件は固定UUIDだけで、名前前方一致や全件削除は使用しない。

## ログインアカウント

パスワードは全アカウント共通で、環境変数`KKD_DEMO_PASSWORD`から投入する。リポジトリには保存しない。

| ロール | メール |
|---|---|
| 本部管理者 | `admin@demo.tiramisu.invalid` |
| エリアマネージャー | `area-manager@demo.tiramisu.invalid` |
| 渋谷院長 | `shibuya-director@demo.tiramisu.invalid` |
| 渋谷施術者 | `shibuya-therapist@demo.tiramisu.invalid` |
| 横浜院長 | `yokohama-director@demo.tiramisu.invalid` |
| 横浜施術者 | `yokohama-therapist@demo.tiramisu.invalid` |
| 川崎院長 | `kawasaki-director@demo.tiramisu.invalid` |
| 川崎施術者 | `kawasaki-therapist@demo.tiramisu.invalid` |

`.invalid`は外部配送されない予約済みドメインであり、実在メールとして使用しない。

## 安全境界

- 患者・スタッフ・院名はすべて合成
- 固定UUIDのdemo namespace以外を削除しない
- seed／resetは明示confirmなしで実行しない
- Hosted環境は追加confirmなしで実行しない
- Stripe Checkout、Webhook、LINE送信、メール送信を実行しない
- service role keyをコード・ログ・クライアントへ出さない
- 本seedは単一DBトランザクションではないが、固定namespaceのclean→upsertで再実行可能
- `demo:validate`成功はデモデータ整合を示すだけで、商用リリースの54 blocking gateをPASSへ変更しない
