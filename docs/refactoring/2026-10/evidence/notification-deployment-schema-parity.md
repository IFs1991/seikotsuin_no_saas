# 稼働アプリと通知永続化migrationの対応照合（#145）

- Issue: [#145](https://github.com/IFs1991/seikotsuin_no_saas/issues/145)（親: [#134](https://github.com/IFs1991/seikotsuin_no_saas/issues/134)、関連: #136 / #139）
- 種別: INVESTIGATION / read-only / docs-only。本文書の作成で production DB・deployment・環境変数・worker・outbox・通知配送には一切触れていない。
- 確認日時: 2026-10-20T17:30Z（UTC）
- 基準main: `8e7ab4c139d749eadf883eecb6f475bed00dc147`（2026-09-20T21:29:29+09:00 commit。確認時点の `origin/main` と同一）
- 対象migration: `supabase/migrations/20260906003219_post_core100_notification_durability.sql`
- 総合判定: **UNKNOWN**（production deployment と接続DBのcatalogをこのsessionから参照できなかったため）

## 1. 判定一覧

| ID  | 照合項目                                                                                                                      | 判定        | 根拠                                                                                                                                                                                        | 判定に必要な確認元                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| P1  | production deployment の ID・作成時刻・commit SHA・production alias                                                           | **UNKNOWN** | Vercel connector がこのsessionで無効。GitHub から見えたのは PR #133 head `3c03e3f` の **preview** status のみ（§3.1）                                                                       | Vercel project `seikotsuin-no-saas` の production deployment 一覧（read-only）、または owner の提示 |
| P2  | 稼働アプリが接続するDBの project ref                                                                                          | **UNKNOWN** | P1 と同じ理由で production 環境変数のホスト部を確認できない                                                                                                                                 | Vercel production の `NEXT_PUBLIC_SUPABASE_URL` のホスト部のみ（鍵・秘密値は出力しない）            |
| P3  | P2 の DB が監査時の接続先 `seikotsuin-management`（`qnanuoqveidwvacvbhqp`）と同一か                                           | **UNKNOWN** | 監査時の接続先は Issue 記載の値。稼働アプリ側の値は未確認                                                                                                                                   | P2                                                                                                  |
| P4  | 稼働DBの migration 履歴に `20260906003219` があるか                                                                           | **UNKNOWN** | Supabase connector がこのsessionで無効。Issue 記載の監査観測（2026-10-20）は「repo 68件・履歴67件・当該versionなし」で、本sessionでは未再確認                                               | `supabase_migrations.schema_migrations` の version 一覧（read-only）                                |
| P5  | trigger `reservation_notification_durable_enqueue`（AFTER INSERT OR UPDATE OF status, detail）の存在・有効状態                | **UNKNOWN** | 同上。Issue 記載の監査観測は「当該triggerなし、updated_at用triggerのみ」で、本sessionでは未再確認                                                                                           | `pg_trigger`（`tgrelid = public.reservation_notifications`、`tgenabled`）                           |
| P6  | `app_private.persist_reservation_notification_outbox()` の定義・SECURITY INVOKER・`search_path=''`・EXECUTE=service_role のみ | **UNKNOWN** | 同上                                                                                                                                                                                        | `pg_proc` / `pg_get_functiondef` / `aclexplode(proacl)`                                             |
| P7  | `public.update_email_outbox_updated_at()` の単調revision定義、`email_outbox_processing_lease_idx`                             | **UNKNOWN** | 同上                                                                                                                                                                                        | `pg_get_functiondef`、`pg_indexes`                                                                  |
| P8  | repo 内の整合（migration が clean replay で期待どおりの catalog を作り、既存SQL suiteが通る）                                 | **MATCH**   | 隔離ローカルDBで main の68 migration + seed を0から再生し、§3.3 の catalog と `20260906003219_post_core100_notification_durability_test.sql` を含む pgTAP 21 file / 858 test の PASS を確認 | （production の証拠ではない。正本ゲートは CI Database Contract）                                    |

MISMATCH と判定した項目はない。P4/P5 の監査観測は MISMATCH を示唆するが、本sessionで同じ catalog を再確認できていないため UNKNOWN のまま扱い、推測で埋めない。

## 2. 稼働コードの migration 依存（固定SHAのソースで確定）

- 依存は commit `8602f6e`（2026-09-06T10:20:43+09:00、「fix(notifications): 予約通知の永続化とメールclaim復旧を修正」）で **migration と同時に** main へ入った。したがって production の稼働SHAが `8602f6e` 以降の main 系列なら依存あり、それより前なら当該確認処理自体が存在しない。稼働SHAは P1 が UNKNOWN のため未確定。
- [`src/lib/notifications/reservation-notifications.ts:145-182`](https://github.com/IFs1991/seikotsuin_no_saas/blob/8e7ab4c139d749eadf883eecb6f475bed00dc147/src/lib/notifications/reservation-notifications.ts#L145-L182) `persistNotificationIntent` は `reservation_notifications` に `status='claimed'` と `detail.enqueue`（宛先・テンプレート・payload を含む一時intent）を書いた後、同じ行を再SELECTし、`status` が `enqueued` でなければ `Durable notification enqueue was not confirmed` を投げる。`enqueued` への遷移と intent の除去は migration の AFTER trigger だけが行う。
- [`supabase/migrations/20260906003219_post_core100_notification_durability.sql:143-145`](https://github.com/IFs1991/seikotsuin_no_saas/blob/8e7ab4c139d749eadf883eecb6f475bed00dc147/supabase/migrations/20260906003219_post_core100_notification_durability.sql#L143-L145) が当該 trigger を作成する。
- [`src/lib/notifications/email/reservation-enqueue.ts:182-195`](https://github.com/IFs1991/seikotsuin_no_saas/blob/8e7ab4c139d749eadf883eecb6f475bed00dc147/src/lib/notifications/email/reservation-enqueue.ts#L182-L195) は通常予約作成時の enqueue 例外を捕捉し、予約を失敗に戻さず、`insertEnqueueLookupFailureLog`（`captureOperationalError` と `email_logs.event_type = 'enqueue_failed'`）と `logger.error` に残す。
- [`docs/stabilization/spec-post-core100-notification-durability-v0.1.md:17-19`](https://github.com/IFs1991/seikotsuin_no_saas/blob/8e7ab4c139d749eadf883eecb6f475bed00dc147/docs/stabilization/spec-post-core100-notification-durability-v0.1.md#L17-L19) は「migration を先に承認・検証し、その後アプリを展開する」順序を定めている。

## 3. 本sessionで確認した事実と手段

### 3.1 deployment metadata

- GitHub の commit status（PR #133 head `3c03e3f95489d2f656c8a975beb9e0482c96a267`）: context `Vercel`、`Deployment has completed`、2026-09-20T12:19:40Z。これは PR の **preview** であり、production deployment・production alias・main merge commit `8e7ab4c` の deployment を示す証拠ではない。
- Vercel / Supabase connector は org では接続済みだが、このsessionでは無効（`enabledInChat: false`）。有効化はこの作業の許可範囲外の設定変更のため行っていない。

### 3.2 実施していないこと

production DB・Auth・migration履歴・catalog への接続、環境変数の参照、deployment の promote/rollback、worker/cron の起動、outbox/通知行・患者行・宛先・本文の読取、実通知。いずれも NOT_RUN。

### 3.3 repo 内整合（P8）の手段と限界

- Docker image の取得が proxy/registry 制限で失敗したため、Supabase CLI の `supabase start` は使えなかった。代わりに npm 配布の PostgreSQL 17.6 バイナリで使い捨てクラスタを作り、Supabase の role/auth/拡張の最小shimを入れて、`supabase/migrations/*.sql` を0から順に適用し `supabase/seed.sql` を投入した。
- 観測した catalog（shim 上の値）:
  - `reservation_notification_durable_enqueue`: `AFTER INSERT OR UPDATE OF status, detail ON public.reservation_notifications FOR EACH ROW EXECUTE FUNCTION app_private.persist_reservation_notification_outbox()`、有効（`O`）
  - `reservation_notifications_updated_at_trigger`: BEFORE UPDATE、有効
  - `app_private.persist_reservation_notification_outbox()` / `public.update_email_outbox_updated_at()`: SECURITY INVOKER、`search_path=""`、EXECUTE は service_role のみ
  - `email_outbox_processing_lease_idx`: 存在
  - `supabase_migrations.schema_migrations`: 68 行
- 既存 pgTAP 全21 file / 858 test PASS（`pg_prove`）。shim は Supabase 公式 image と同一ではない。canonical な replay/pgTAP/型diff は CI Database Contract（固定 CLI 2.109.0）。

## 4. 「契約差分」と「実際の患者通知障害」の区別

確定しているのは §2 のコード依存だけである。次は **条件付きの影響** で、実測していない。

- 条件: 稼働SHA ≥ `8602f6e` かつ 稼働DBに §1 P5/P6 の trigger/function がない。
- 影響（条件が両方成立した場合）:
  1. 予約作成・変更は成功するが、通知の durable enqueue は `Durable notification enqueue was not confirmed` で失敗し、`email_outbox` / LINE outbox に行が作られない可能性がある。
  2. `reservation_notifications` に `status='claimed'` の行が残り、`detail.enqueue` に宛先・payload を含む一時intentが除去されずに残る可能性がある（trigger が除去を担うため）。
  3. 失敗は `email_logs`（`event_type = 'enqueue_failed'`）、operational error capture、server log に残る想定。
- 「現在通知が届いていない」とは断定しない。断定には別承認の read-only 集計（下記）が必要。

## 5. MISMATCH 確定時の別作業の提案（本Issueでは実施しない）

本Issueは read-only で閉じる。以下は新しい独立Issue（Risk: **High**、通知・患者データ・production DB）として扱う提案である。

1. **確定のための read-only 集計（承認後）**: 患者行・宛先・本文を読まず、件数だけを取る。例: `select status, (detail ? 'enqueue') as has_intent, count(*) from public.reservation_notifications group by 1, 2;`、`select count(*) from public.email_logs where event_type = 'enqueue_failed' and created_at >= '<deploy時刻>';`（列名は実行前に catalog で確認する）。
2. **適用順序**（既存 spec §検証と展開に従う）: production 承認 → 適用前 catalog snapshot（migration履歴、`pg_trigger`、`pg_proc` 定義/ACL、index）→ `20260906003219` の適用（`db push` は人間承認が必要）→ 適用後 catalog snapshot と差分確認 → 既存 pgTAP 相当の read-only 確認 → アプリ（既に稼働中なら再確認のみ）。
3. **停止条件**: migration履歴と実DDLが食い違う（手動適用・同等DDLの存在）、適用前に `claimed` + intent 行が残っている、他の未適用 migration が見つかる、適用中にエラー。いずれも中断して owner 判断へ戻す。
4. **残存 claim 行の扱い**: trigger は `status` / `detail` の UPDATE でも発火するため、適用後の再試行で過去予約の通知が遅れて送られ得る。自動再送はせず、owner が対象期間と再送可否を決める（データ補正は別承認）。
5. **復旧方針**: 当該 migration の rollback は `supabase/rollbacks/20260906003219_post_core100_notification_durability_rollback.sql` が設計上ブロックしている。問題時は reviewed forward-fix のみ。
6. **完了ゲート**: High のため、RED となる実DB negative（未適用状態で enqueue 確認が fail-closed になること、tenant A/B、PHI intent 除去）、2件の独立 read-only review、spec・rollback/forward-fix runbook、production 承認者の記録を必須とする。read-only 照合（本文書）をこれらの PASS に流用しない。

## 6. 本Issueを再開・完了させるために必要な情報

- Vercel: production deployment の ID・作成時刻・commit SHA・production alias（connector を read-only で有効化、または owner がダッシュボードから提示）。preview と取り違えないこと。
- Vercel production 環境変数 `NEXT_PUBLIC_SUPABASE_URL` のホスト部（project ref のみ）。
- Supabase（P2 の project）: migration 履歴の version 一覧と、§1 P5–P7 の catalog（`pg_trigger` / `pg_proc` 定義・ACL / `pg_indexes`）。いずれもメタデータのみで、行データは読まない。

上記が揃えば、P1–P7 を MATCH / MISMATCH に確定し、本文書を更新する。
