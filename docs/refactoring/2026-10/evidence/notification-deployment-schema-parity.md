# 稼働アプリと通知永続化migrationの対応照合（#145）

- Issue: [#145](https://github.com/IFs1991/seikotsuin_no_saas/issues/145)（親: [#134](https://github.com/IFs1991/seikotsuin_no_saas/issues/134)、関連: [#136](https://github.com/IFs1991/seikotsuin_no_saas/issues/136) / [#139](https://github.com/IFs1991/seikotsuin_no_saas/issues/139)）
- 種別: INVESTIGATION / read-only / docs-only。本文書の作成で production DB・deployment・環境変数・worker・outbox・通知配送には一切触れていない。本ブランチの push で Vercel の **Preview** deployment が自動作成されたが、production ではなく cron も動かない。
- 確認日時: 2026-10-20T17:30Z〜18:00Z（UTC）
- 基準main: `8e7ab4c139d749eadf883eecb6f475bed00dc147`（2026-09-20T21:29:29+09:00 commit。確認時点の `origin/main` と同一）
- 対象migration: `supabase/migrations/20260906003219_post_core100_notification_durability.sql`
- 総合判定: **UNKNOWN**（現在の production alias が指す deployment と、接続DBの migration 履歴・catalog をこのsessionから確認できなかったため）

## 1. 判定一覧

| ID  | 照合項目                                                                                                                                    | 判定        | 根拠                                                                                                                                                                                                          | 判定に必要な確認元                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| P1  | 現在の production alias が指す deployment の ID・作成時刻・commit SHA                                                                       | **UNKNOWN** | GitHub Deployments の Production 記録では最新が `8e7ab4c`（§3.1）。ただし instant rollback・promote・CLI deploy は GitHub Deployments に現れないため、alias が今どれを指すかは確定できない                    | Vercel project `seikotsuin-no-saas` の production alias と現行 deployment（read-only）、または owner の提示 |
| P2  | 稼働アプリが接続するDBの project ref                                                                                                        | **UNKNOWN** | production 環境変数のホスト部を確認する手段がこのsessionになかった（Vercel connector 無効）                                                                                                                   | Vercel production の `NEXT_PUBLIC_SUPABASE_URL` のホスト部のみ（鍵・秘密値は出力しない）                    |
| P3  | P2 の DB が監査時の接続先 `seikotsuin-management`（`qnanuoqveidwvacvbhqp`）と同一か                                                         | **UNKNOWN** | 監査時の接続先は Issue 記載の値。稼働アプリ側の値は未確認                                                                                                                                                     | P2                                                                                                          |
| P4  | 稼働DBの migration 履歴に `20260906003219` があるか                                                                                         | **UNKNOWN** | Supabase connector がこのsessionで無効。Issue 記載の監査観測（2026-10-20）は「repo 68件・履歴67件・当該versionなし」で、本sessionでは未再確認                                                                 | `supabase_migrations.schema_migrations` の version 一覧（read-only）                                        |
| P5  | trigger `reservation_notification_durable_enqueue`（AFTER INSERT OR UPDATE OF status, detail）の存在・有効状態                              | **UNKNOWN** | 同上。Issue 記載の監査観測は「当該triggerなし、updated_at用triggerのみ」で、本sessionでは未再確認                                                                                                             | `pg_trigger`（`tgrelid = public.reservation_notifications`、`tgenabled`）                                   |
| P6  | `app_private.persist_reservation_notification_outbox()` の定義・SECURITY INVOKER・`search_path=''`・EXECUTE は owner 以外 service_role のみ | **UNKNOWN** | 同上                                                                                                                                                                                                          | `pg_proc` / `pg_get_functiondef` / `aclexplode(proacl)`                                                     |
| P7  | `public.update_email_outbox_updated_at()` の単調revision定義、`email_outbox_processing_lease_idx`                                           | **UNKNOWN** | 同上。未適用なら同関数は以前の定義（SECURITY DEFINER、`search_path=public, auth, extensions`。`20260413001000` L92-98、`20260507000200` L422-423）のままで、判別に使える                                      | `pg_get_functiondef`、`pg_indexes`                                                                          |
| P8  | repo 内の整合（migration が clean replay で期待どおりの catalog を作り、既存SQL suiteが通る）                                               | **MATCH**   | 正本: `8e7ab4c` の push で走った [CI 35510763477](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/35510763477)（Database Contract を含む CI 全体が success）。補助: 隔離ローカルDBでの再生（§3.3） | （production の証拠ではない）                                                                               |

MISMATCH と判定した項目はない。P4/P5 の監査観測は MISMATCH を示唆するが、本sessionで同じ catalog を再確認できていないため UNKNOWN のまま扱い、推測で埋めない。

## 2. 稼働コードの migration 依存（固定SHAのソースで確定）

- 依存コードと migration は同じ commit `8602f6e`（PR-D ブランチ上、2026-09-06）で作られ、main には merge `fcb64ec`（[PR #121](https://github.com/IFs1991/seikotsuin_no_saas/pull/121)、2026-09-06T12:33:50+09:00）で入った。判定は時刻ではなく祖先関係で行う（`git merge-base --is-ancestor 8602f6e <SHA>`）。main の first-parent 上では `fcb64ec` 以降が依存あり、`fcb64ec^1` 以前（`f8dd988`、`d636e71`、`03fc8b6`、`c028573` など）は依存なし。
- GitHub Deployments の Production 記録で最新の `8e7ab4c` は依存を含む（§3.1）。
- [`src/lib/notifications/reservation-notifications.ts:145-182`](https://github.com/IFs1991/seikotsuin_no_saas/blob/8e7ab4c139d749eadf883eecb6f475bed00dc147/src/lib/notifications/reservation-notifications.ts#L145-L182) `persistNotificationIntent` は `reservation_notifications` に `status='claimed'` と `detail.enqueue`（宛先・テンプレート・payload を含む一時intent）を書いた後、同じ行を再SELECTし、`status` が `enqueued` でなければ `Durable notification enqueue was not confirmed` を投げる。通常の enqueue 経路で `enqueued` への遷移と intent の除去を行うのは migration の AFTER trigger である（LINE→email fallback の `line-processor.ts` は別途 `enqueued` を設定する）。
- [`supabase/migrations/20260906003219_post_core100_notification_durability.sql:143-145`](https://github.com/IFs1991/seikotsuin_no_saas/blob/8e7ab4c139d749eadf883eecb6f475bed00dc147/supabase/migrations/20260906003219_post_core100_notification_durability.sql#L143-L145) が当該 trigger を作成する。
- [`docs/stabilization/spec-post-core100-notification-durability-v0.1.md:17-19`](https://github.com/IFs1991/seikotsuin_no_saas/blob/8e7ab4c139d749eadf883eecb6f475bed00dc147/docs/stabilization/spec-post-core100-notification-durability-v0.1.md#L17-L19) は「migration を先に承認・検証し、その後アプリを展開する」順序を定めている。
- repo の結果記録 [`docs/stabilization/post-core100-remediation-result.md`](https://github.com/IFs1991/seikotsuin_no_saas/blob/8e7ab4c139d749eadf883eecb6f475bed00dc147/docs/stabilization/post-core100-remediation-result.md)（L18 の PR-D 行、L99、L125）は、配備先への migration 適用・実通知・worker 停止復帰を未完了（BLOCKED）として記録している。

## 3. 本sessionで確認した事実と手段

### 3.1 deployment metadata

- GitHub commit status（PR #133 head `3c03e3f95489d2f656c8a975beb9e0482c96a267`）: context `Vercel`、`Deployment has completed`、2026-09-20T12:19:40Z。これは PR の **Preview**。
- GitHub Deployments（`environment=Production`、vercel[bot]）: 独立reviewが read-only の GitHub REST で取得した値。作成者sessionの GitHub MCP には deployments 取得手段がなく、同じ値を再取得できていない。
  - 最新の Production 記録は `8e7ab4c` の deployment id `6552792468`、作成 2026-09-20T12:33:37Z。status は 12:33:37Z と 16:04:26Z の2回 success（別の Vercel URL。同一SHAの再deployとみられる）。
  - `fcb64ec`（2026-09-06T03:39:39Z）以降の Production 記録はすべて依存を含む。それ以前の `f8dd988`、`d636e71`、`03fc8b6`、`c028573` は含まない。
  - main merge 後およそ6分で依存コードが Production へ自動 deploy されていたことになるが、現在のDB状態の証拠ではない。
- Vercel / Supabase connector は org では接続済みだが、このsessionでは無効（`enabledInChat: false`）。有効化はこの作業の許可範囲外の設定変更のため行っていない。

### 3.2 実施していないこと

production DB・Auth・migration履歴・catalog への接続、環境変数の参照、deployment の promote/rollback、worker/cron の起動、outbox/通知行・患者行・宛先・本文の読取、実通知。いずれも NOT_RUN。

### 3.3 repo 内整合（P8 補助）の手段と限界

- Docker image の取得が registry/proxy 制限で失敗したため、`supabase start` / `supabase test db` はローカルで使えなかった。代わりに npm 配布の PostgreSQL 17.6 バイナリで使い捨てクラスタを作り、Supabase の role/auth/拡張の最小shimを入れて、`supabase/migrations/*.sql` を0から順に適用し `supabase/seed.sql` を投入した（`supabase db reset` / `db push` / `migration up` は不使用）。
- 観測した catalog（shim 上の値）:
  - `reservation_notification_durable_enqueue`: `AFTER INSERT OR UPDATE OF status, detail ON public.reservation_notifications FOR EACH ROW EXECUTE FUNCTION app_private.persist_reservation_notification_outbox()`、有効（`O`）
  - `reservation_notifications_updated_at_trigger`: BEFORE UPDATE、有効
  - `app_private.persist_reservation_notification_outbox()` / `public.update_email_outbox_updated_at()`: SECURITY INVOKER、`search_path=""`、EXECUTE は owner 以外 service_role のみ
  - `email_outbox_processing_lease_idx`: 存在
  - `supabase_migrations.schema_migrations`: 68 行
- 既存 pgTAP 全21 file / 858 test PASS（`pg_prove`）。shim は Supabase 公式 image と同一ではないため補助証跡に留める。

## 4. 「契約差分」と「実際の患者通知障害」の区別

確定しているのは §2 のコード依存だけである。次は **条件付きの影響** で、実測していない。

- 条件: 稼働SHA が `8602f6e` を祖先に含み（main では `fcb64ec` 以降）、かつ稼働DBに §1 P5/P6 の trigger/function がない。
- 影響（条件が両方成立した場合。経路ごとに異なる）:

| 経路                                                                                 | 失敗時の挙動（コード上）                                                                                                                                         | 記録先                                                                    |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| スタッフ/モバイルの予約作成・変更（`reservation-enqueue.ts`）                        | 予約は成功、患者通知の durable enqueue だけ失敗                                                                                                                  | `email_logs.event_type='enqueue_failed'`、operational capture、server log |
| 公開予約（`src/app/api/public/reservations/route.ts` L572-594）                      | 予約は成功。患者通知で先に例外になるため、trigger に依存しない院向け `public-reservation-received` メールも送られない（`reservation-notifications.ts` L632-679） | server log のみ（`email_logs` 行なし）                                    |
| リマインダー cron（`vercel.json` の `/api/internal/reservation-reminders`、5分毎）   | 最初の送信対象で例外になり run 全体が中断。`updateSuccessfulReminderRun`（`reservation-reminders.ts` L396）に届かず、毎回 24h lookback を再走査して再失敗する    | route の operational capture のみ                                         |
| 直接 enqueue のテンプレート（`reservation_updated`、公開キャンセルの院向けメール等） | trigger に依存しないため影響なし                                                                                                                                 | —                                                                         |

- いずれの失敗経路でも `reservation_notifications` に `status='claimed'` の行が残り、`detail.enqueue` に宛先と payload（氏名・日時・メニュー・担当）を含む一時intentが除去されずに残る可能性がある（trigger が除去を担うため）。
- 「現在通知が届いていない」とは断定しない。断定には別承認の read-only 集計（§5.1）が必要。

## 5. MISMATCH 確定時の別作業の提案（本Issueでは実施しない）

以下は新しい独立Issue（Risk: **High**、通知・患者データ・production DB）として扱う提案である。

1. **確定のための read-only 集計（承認後）**: 患者行・宛先・本文を読まず、件数と期間だけを取る。
   - 包括的な指標: `select status, channel, notification_type, (detail ? 'enqueue') as has_intent, count(*), min(created_at), max(created_at) from public.reservation_notifications group by 1, 2, 3, 4;`
   - 補助: `select count(*) from public.email_logs where event_type = 'enqueue_failed' and created_at >= '<deploy時刻>';`（公開予約・cron の失敗は含まれないため過少になる）、`internal_job_runs` の `reservation_reminders` の `last_successful_run_at`。
   - 列名は実行前に catalog で確認する。
2. **適用手順**（既存 spec と [commercial release qualification](../../../releases/commercial-release-qualification-v1.0.md) の COMM-OPS-001/002/003/007/008 に従う）: production 承認 → backup → isolated staging での apply rehearsal と lock/影響評価（`email_outbox` への非 concurrent index 作成は作成中の outbox 書込を止める。`reservation_notifications` への trigger 作成）→ 適用前 catalog snapshot（`npm run commercial:inventory:db:remote` に加え、trigger は `pg_trigger` を別途取得）→ `20260906003219` の適用（`db push` は人間承認が必要）→ 適用後 catalog snapshot と差分確認 → post-deploy smoke。
3. **停止条件**: migration履歴と実DDLが食い違う（手動適用・同等DDLの存在）、適用前に `claimed` + intent 行が残っている、他の未適用 migration が見つかる、適用中にエラー。いずれも中断して owner 判断へ戻す。
4. **残存 claim 行と遅延送信（owner 判断）**:
   - `received` は作成時にしか送られず、`(reservation_id, notification_type)` が一意のため、後続処理で再 claim されない。intent（宛先・氏名・日時など）が無期限に残り得る（spec の intent 除去方針と矛盾）。
   - 適用後、リマインダー cron が 24h lookback 内の未送信分をまとめて送る可能性がある。
   - 補正を `status` / `detail` の UPDATE で行うと trigger が発火する。送信しない補正は `enqueue` キーの除去、または `claimed` 以外への status 変更が必要。
   - 自動再送はしない。対象期間・再送可否・intent 除去を owner が決める（データ補正は別承認）。
5. **復旧方針**: 当該 migration の rollback は `supabase/rollbacks/20260906003219_post_core100_notification_durability_rollback.sql` が設計上ブロックしている。問題時は reviewed forward-fix のみ。
6. **完了ゲート**: High のため、既存 SQL suite 相当の実DB検証（email/LINE の atomic enqueue、clinic A/B、途中失敗 rollback、重複/順序逆転、claim 再試行、PHI intent 除去）と、未適用状態で enqueue 確認が fail-closed になる RED、2件の独立 read-only review、spec・rollback/forward-fix runbook、production 承認者の記録を必須とする。read-only 照合（本文書）をこれらの PASS に流用しない。

## 6. 受入条件の状況と再開に必要な情報

| 受入条件（#145）                                                                | 状況                                                                      |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| deployment SHA・DB ref・catalog観測時刻の対応を明示し、UNKNOWN を推測で埋めない | 一部: Production 記録の SHA は §3.1。現 alias・DB ref・catalog は UNKNOWN |
| 適用履歴と実DDLの両方を照合                                                     | 未達: 稼働DBへアクセスできず NOT_RUN                                      |
| 稼働コードの依存を固定SHAのソースで示す                                         | 達成（§2）                                                                |
| 契約差分と患者通知障害を分ける                                                  | 達成（§4）                                                                |
| 将来の修正/適用条件を明記                                                       | 達成（§5）                                                                |
| 患者行・payload・秘密を読まず、worker/cron を起動しない                         | 達成（§3.2）                                                              |

本PRは #145 を close しない。本Issueでは適用しない。完了させるには次が必要:

- Vercel: production alias が現在指す deployment の ID・SHA（GitHub Deployments 記録との一致確認）。connector を read-only で有効化、または owner がダッシュボードから提示。preview と取り違えないこと。
- Vercel production 環境変数 `NEXT_PUBLIC_SUPABASE_URL` のホスト部（project ref のみ）。
- Supabase（P2 の project）: migration 履歴の version 一覧と、§1 P5–P7 の catalog（`pg_trigger` / `pg_proc` 定義・ACL / `pg_indexes`）。いずれもメタデータのみで、行データは読まない。

上記が揃えば、P1–P7 を MATCH / MISMATCH に確定し、本文書を更新する。
