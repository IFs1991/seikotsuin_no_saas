# Audit v2 条件付き確認の根拠と限界

2026-09-09。開始HEADは `2f1434e0ffa410e97672ea8956e65231843ff250`。原本の既存修正を含むローカルorigin/mainは取り込んでいない。今回のmock/静的確認を実DB・配備先・復旧成功へ読み替えない。

## VERIFY-01 / VERIFY-03 業務データ

- V01: `spec-daily-report-items-v0.1.md` は日報を集約表、明細を集約入力と定め、明細triggerがtotal_patients/total_revenue/insurance/privateを書き換えるがnew_patientsは維持すると明記する。`20260507000100_daily_report_items.sql::sync_daily_report_item_totals` と整合する。手入力summaryと明細を同時に独立正本とは判断しない。
- 明細の手動override/確定値は `20260525000100_phase4a_menu_billing_patient_coverage_snapshot.sql::sync_arrived_reservation_daily_report_item` が `amount_source='override'` / `pricing_snapshot_status in ('confirmed','recalculated')` で保護する。予約の取消・soft deleteで自動削除するのはsource=reservationかつpendingの明細。適用済みmigrationと実DB trigger動作はENV-01で未検証。
- V02: `api/menus/route.ts::DELETE` / `api/resources/route.ts::DELETE` は同clinicのis_deletedを更新し、物理参照を消さない。公開予約のmenu/resource/customer新規利用チェックはis_deleted=false。来院triggerの名称/価格取得は物理行を参照し、削除済みを除外しない。これだけで履歴全経路の受入PASSとはしない。既存予約の編集・来院・取消と削除が競合するDB試験、運用上の禁止/許可条件が残る。
- V03: `PublicReservationService.createReservation` はprice/actual_price/staff_nomination_feeを指定していない。baselineのprice/actual_priceはnullable（0 defaultではない）、指名料migrationは0 default。来院triggerは `coalesce(new.actual_price, new.price, v_menu_price + v_option_delta, 0)` を使用するため、公開予約が常に0円の日報になるとは断定しない。ただし `spec-reservation-staff-nomination-fee-2026-05-07.md` の予約時snapshot要件に対し、公開/空き枠通知予約・公開画面の提示料金への適用範囲が未確定。予約後のmaster変更と指名有無の実DB再現、公開画面で提示する料金契約を揃えることが次の作業。過去予約を最新masterで一括上書きしていない。
- V06: 公開予約の日単位割当は `toJSTDateString` / `parseJSTDateStart` / `addJSTCalendarDays`、来院triggerはAsia/Tokyoでreport_dateを決定する。共通helperと公開availability schemaが2月30日を通すこと、Date.UTCが0099年を1999年に補正することをREDで再現。`79d433f6` で実在する暦日のみを受理し、ISO形式のJST parseに統一。APIはDB前400、月末・閏日・JST深夜を含む関連88 tests PASS。金額はnumeric(10,2)が正本。通常・mobile・公開・日報の丸め統一、birth_date/start_time全境界とtimestampマイクロ秒の編集version往復は未完了。JS DateでCAS用timestampを丸める変更はしていない。
- F19: 日報明細APIはfeeの手動入力、amount_source=manual/overrideを扱う。元の日報仕様もfee編集を許すため、catalog価格を全任意調整へ強制していない。通常予約のselected_optionsには価格deltaの入力経路が残る。catalog IDからの正価と、権限・上限・理由・監査を伴う任意調整の正式な区別が必要。無条件クランプや過去snapshot置換を実装していない。

## VERIFY-02 Stripe replay

- 原本F18の再確認で、通常 `claimStripeWebhookEvent` はprocessingをbusyにする一方、内部 `replay-webhook-event` はclaimせず `processStripeEvent` を呼ぶことを再現した。原本baseと開始HEADの当該routeは同一で、未取込修正の再実装ではない。
- 最小修正はreceived/failed/ignored/明示forceされたprocessedから、event IDと読取時statusの条件付きUPDATEでprocessingへ遷移した実行者だけがaudit/process/markを行う。processingはforceでも409。claimのDB失敗・敗者は他実行者の状態を更新しない。audit障害は所有したイベントをfailedへ記録する。
- 新規回帰は実Supabase SDK＋fetch fixtureでリクエスト条件を評価。通常Webhookとreplayの同一イベント競合を扱うが、PostgreSQLの実行排他・実Stripe課金・停止復帰試験の証拠ではない。
- **F18全面受入は未完了**。処理中に強制終了したイベントの回復、滞留検知、異なる新旧イベントとresyncが並行した場合の課金状態巻戻り防止が残る。`syncStripeSubscription` のlast_stripe_event_created保存だけでは原子的な順序制御の証明にならない。
- stopped処理の手動回復では、対象event/worker/実行環境を特定し、元実行者と並行実行が停止した証拠、現在Stripe状態とDB差分の確認が必要。経過時間だけでprocessingを奪わない。状態補正・実replay/resyncは対象と操作の承認後に行う。今回は自動lease基盤、DB変更、実課金操作を導入していない。

## VERIFY-05 依存パッチ

- 対象lock base `1befb6387a11b2f53b838941d44d60376870c08a` のnextは15.5.21。2026-09-09に公式勧告 [Next画像最適化RCE](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) / [WindowsでのRCE](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) を確認（ともに2026-08-25公開、修正版15.5.24）。該当rangeのruntime依存であるため必要最小パッチを実施。
- `next.config.js` は画像最適化を有効にしpublic StorageのremotePatternsを持つ。画像のformatsは出力設定であり、それ自体が攻撃AVIF入力の到達証明ではない。Windows開発環境は確認済み、本番OS・実際のアップロード可能主体は未確認。実exploitは実行していない。
- `npm view next@15.5.24 version dependencies --json --ignore-scripts --no-audit --no-fund` はsandbox内EACCES後、公開metadata取得として承認された実行で成功。`npm install --save-exact next@15.5.24 --ignore-scripts --no-audit --no-fund` を実行。source commit `b21161ab70425a1954d110a4c51ebb579267e6c0`。
- lockの1123 entriesを維持。Next/@next/env/SWC8種の計10パッケージとroot pinのみ更新、新規依存・無関係な更新なし。runtimeは15.5.24。既存sharp0.34.5は維持、Next側の対応範囲変更のみ。独立2 reviewerが固定SHA差分を確認し指摘なし。
- runtime/devを分離: Next/react/react-dom/Supabase/Upstash/DOMPurifyとそのjsdomはruntime、jest側jsdomはdev。undiciはdev宣言だけでなくruntimeの依存経路もある。React19.0.0の番号だけをNext内蔵RSCの脆弱判定へ転用しない。
- npm audit APIへの全依存一覧送信は未実施、現在audit件数を報告していない。公式勧告を照合した最小更新であり、全依存の脆弱性ゼロ判定ではない。新版の最終build/統合回帰は実行台帳を参照。
