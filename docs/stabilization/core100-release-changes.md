# core-100 実装差分・既存ゲートとの関係

対象: [10社100院仕様](tiramisu-os-codex-release-spec-10companies-100clinics-v1.0.md)。基点は `806a5afab8e976a48cf2ecb771a1bc277bb53500`、実装コミットは `7dca4a530a0308f5b5baf55caac579c9b140a794`（`codex/line-crm-data-foundation`）。検証はcommit前の同一内容の作業ツリーで実施した。結果は [結果記録](core100-release-result.md)、手順は [runbook](../operations/CORE100_RUNBOOK.md)。

| Task | 変更と理由 | 既存実装を維持したもの |
| --- | --- | --- |
| 01 | `auth-attempt-guard.ts` を3つの実認証入口に適用。15分のaccount 10/IP 100を単一Redis Luaで確保し、HMACキー・信頼proxy・本番fail-closedを使用。ログイン画面GETへの旧制限を除去 | 登録・回復の目的別制限、既存認証処理、DBの権限判定 |
| 02A | managerの予約・取消・前週・要確認件数をDB exact HEAD countへ変更。本部集計で上限付き生データへのfallbackを除去し失敗を明示 | 日報モデル、JST、会社・担当院のscope、既存集計レスポンス |
| 02B | 予約GETを日時+IDのkeyset paginationへ変更。予約表は全ページ完了を待ち、履歴は追加読込。失敗時は再試行。UTC端末でもJST時刻の作成・更新・翌日終了を維持 | 予約競合制約、書込DTO、mobile専用API、既存UIスタイル |
| 03 | `configuration-policy.ts`を課金ガード・health・offline preflightで共有。提供プランに必要な価格だけを要求し設定503/契約402を分離 | Stripe状態機械、webhook再送・順序逆転処理、数量制御、期限付きoverride |
| 04 | postgres-metaの一時的な取得障害だけ最大3回retry。主要業務・実manager担当院・A/B境界E2Eを追加。CIへ既存GoTrue取消試験とoffline toolingを追加 | pinned CLI、DB replay/pgTAP/type diffの必須gate、既存Jest除外範囲 |
| 05 | A/Bの決定的合成fixture、安全なseed、通常ユーザーsessionの負荷runner、件数・ID・金額照合を追加 | 通常CIに大規模投入・負荷を混ぜない。RLS/trigger/制約を変更しない |
| 06 | 公開DSNの直接参照でbrowser初期化。自動例外から患者情報・request・breadcrumb等を除去。処理済み500/503もSentryへ送る | 既存Sentry、DR/復元テンプレート、有人運用 |
| 07 | 提供範囲未確定を明示してBLOCKED | 稼働中の通知API・enqueue・Cron、既存顧客向け経路・未送信outboxを無断停止/削除しない |

## API契約

`GET /api/reservations` のID取得は維持。一覧は `data` 配列に加え `pagination: { has_more, next_cursor }` を返す。clinic必須、`id`/`customer_id`/両方の日時範囲のいずれかを要求。期間は最大6週、既定100・最大200件。`cursor`はclinic/期間/担当者/患者/orderに結び付き、日時のマイクロ秒を保持する。全ページの同一スナップショットは保証しない。

呼出し元は `src/app/(app)/reservations/api.ts`、`hooks/useAppointments.ts`、`AppointmentDetail.tsx`、`src/hooks/useReservations.ts` を追従。途中失敗を完全な一覧として表示しない。履歴はAPIの降順を維持し、ブラウザで日時精度を落として再ソートしない。

managerのexact countは4院ずつ、最大16リクエスト同時実行。50院の実性能は実測待ち。本部の既存PostgREST aggregateは対象環境で有効であることが必要。ローカルconfigの `max_rows=1000` を本番設定とみなさず、aggregate有効化は今回行っていない。

## 設定・依存・DB

- migration、RLS、生成Supabase型の変更なし。新規の直接依存は追加していない。到達可能なServer ActionsのDoS対策として既存Nextを15.5.19から15.5.21へ限定更新し、`package.json`とnpm lockfileを更新（同梱env/SWCも追従）。[公式修正勧告](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj)。
- `.env.production.example`へ `NEXT_PUBLIC_SENTRY_DSN` を追加。公開用DSNをビルド時に供給し、server/edgeは既存 `SENTRY_DSN`。DSNだけでは担当者への到達証明にならない。
- 認証は既存 `UPSTASH_REDIS_REST_URL/TOKEN` とサーバー秘密値をHMACに使用。proxyはVercel環境、明示的な `TRUST_CF_HEADERS=true`、または正の `TRUSTED_PROXY_COUNT` のいずれか。実際の転送段数を調べてから設定する。
- `release:preflight`はprocess環境だけを読み、値を表示しない。デプロイされた `NEXT_PUBLIC_*`、契約プラン、region、DB上限、通知範囲は自動でPASSにしない。
- `jest.config.js`の探索rootと`tsconfig.json`のincludeを本アプリのsrc・root設定・scripts・supabaseへ限定。未追跡の入れ子worktreeを本アプリとして検査していた問題を解消し、既存テストは除外していない。
- secret scanは新しい2箇所を理由付きで登録。server-only HMAC参照と設定名の純粋検証に限定し、client側秘密値公開は許可していない。

## owner確定が必要な差分案（未承認）

1. `core-100`は10社100院の有人運用に対する別の容量受入とする。既存[Commercial Release Qualification](../releases/commercial-release-qualification-v1.0.md)を免除しない。PR-11の過去dense benchmark FAILを残し、固定benchmarkの適用範囲だけowner Toshuが決める。
2. 既存DRのベータ目標RPO24時間/RTO8時間を無断変更しない。core-100の提案RPO1時間/RTO4時間は未承認。バックアップ方式・費用・実測に基づき決める。
3. 予約通知を提供する場合はTASK-07の永続enqueue・lease回収・provider結果不明時の扱い・容量試験を完了する。提供しない場合もownerが契約影響を確認してAPI/enqueue/Cronまで止める必要がある。現状はNOT_APPLICABLEにできない。
4. `main`のbranch protectionは読取APIで未設定を確認。現行CIの全blocking checkと既存review要件をrequiredにする案。設定変更・本番デプロイは未実施。

セキュリティ、会社分離、課金整合性、データ損失防止、復元は縮小しない。旧DoDのDOD-05/06/08/09/10/11/12へ対応しつつ、現行Change DoDと商用gateで出荷判定する。
