# PR-C: 予約の保存境界と同時更新

## 対象と現行確認

- 基点: `main c028573d089cb6085ab3e29121fa9fe4d2f923c0`。
- 依頼 §5 / §8: 通常・mobile の予約 POST/PATCH。既存 Core100 の clinic scope、認可、billing gate、FK/RLS、重複時間制約は維持する。
- 確認済みの問題: DB 保存後の `reservation_list_view` 取得エラー・0件が 500 となり、再登録を促す。PATCH が読み取った状態の後に別リクエストが保存しても、id + clinic_id だけの UPDATE が上書きする。

## 最小修正

`src/lib/reservations/mutation-result.ts` の `readCommittedReservation` は、保存後の view 取得が成功した場合は既存の `ReservationListItem` を返す。失敗した場合は保存済み Row の明示した列だけを同じ serializer へ渡し、POST は 201、PATCH は 200 を維持して `projectionStatus: 'unavailable'` を追加する。氏名は null とし、内部列、電話番号、作成者、DB の生エラーは返さない。通常の成功レスポンスには新規フィールドを加えない。

表示情報の障害は `captureOperationalError` へ固定メッセージ・source・operation・status だけを渡す。予約IDや患者情報を監視タグへ追加しない。通知処理は保存が成功してから呼び出し、view 取得の障害で未呼び出しにしない。通知の await・lease・冪等性は別 PR-D の範囲とする。

PATCH は最初の SELECT に既存の NOT NULL `updated_at` を含め、UPDATE に `.eq('updated_at', existing.updated_at)` を追加する。DB から返る文字列を Date に変換せずマイクロ秒を保つ。更新対象が0件の `PGRST116` は 409 とし、通知の enqueue 前に返す。版が取得できない場合は 503 として保存しない。既存の `update_reservations_updated_at` トリガーを利用し、migration は追加しない。

この比較が防ぐ範囲は、同じ予約を API が読み取ってから保存するまでの競合である。画面を長時間開いたままの編集開始時点からの競合や、他経路を含む全予約操作の直列化は追加しない。

## UI 契約（EXTEND）

- PC は作成・更新・移動・キャンセルの成功を維持し、「予約は保存済み」「再保存せず、一覧を再読み込み」を案内する。更新の楽観表示を失敗状態へ戻さない。
- mobile bridge は同じフラグを受けると成功案内を表示し、欠けた view の表示変換で再送扱いにしない。
- Design.md Section C に従い既存予約画面内の案内だけを追加する。既存の色・余白を用い、グローバルスタイル・共有デフォルトを変えない。
- Ethics Gate: 保存結果を事実通りに説明し、患者予約の重複・意図しない再送を防ぐための変更。誘導、希少性、追加費用、CVR 最適化は含まない。

## 検証記録

| 検証 | 結果 |
| --- | --- |
| 新規 API 回帰の初回 RED | 14 failed。通常/mobile の POST/PATCH × view エラー/0件が 500、キャンセル/時間/担当の競合更新が 200 |
| 修正後 API focused | 6 suites / 127 tests PASS。`reservations-commit-boundary.test.ts`、既存 reservations/mobile/email/schema と bridge 契約を含む |
| UI 初回 RED | 保存後の表示障害で notice が未定義。1 failed / 12 passed |
| 修正後 UI focused | 2 suites / 39 tests PASS。`useAppointments.reservations.test.tsx` と `AppointmentForm.test.tsx` |
| TypeScript | `npm run type-check` / `npm run type-check:commercial` PASS |
| lint | `npm run lint:ci` PASS（0 errors / 129 warnings、許容上限183は変更なし） |
| inventory / 生成物 | `commercial:inventory:routes:check`、`commercial:inventory:source:check`、`security:verify-mutating-routes`（132 mutations / 9 GET例外）、`mobile-uiux:check-production-assets` PASS |
| 実 DB CAS | BLOCKED（ローカル既存 DB の書換え・reset は行わない）。`supabase/tests/reservation_optimistic_concurrency_test.sql` を既存 CI の使い捨て DB `supabase test db --local` 用に追加 |
| 全体 Jest / build / E2E / preview | この実装担当では未実行。親担当が push 後の既存 CI と preview で確認する |

SQL 契約テストは8項目で、マイクロ秒、先行1件更新、既存トリガーの版更新、古い版によるキャンセル/時間/担当変更0件、clinic 不一致0件、先行保存の保持を検証する。トランザクションは rollback し、RLS・トリガーを無効化しない。これは stale version の DB 比較とトリガーの検証であり、独立した2接続を同時実行した実測とは区別する。

DoD 対応: `DoD-v0.1.md` DOD-08（既存テナント境界維持）、DOD-09（API clinic guard 維持）、DOD-10（build は CI 待ち）、DOD-11（focused 回帰）。現在の出荷判断は `docs/quality/change-dod-v1.0.md` / release gate の別証跡に従う。

独立 read-only 監査: `/root/audit_merge_gates` が API の clinic/id/version 比較、409 の通知前返却、degraded の列制限・監視秘匿、PC/mobile 案内と SQL test を確認し PASS。監査者によるテスト実行および実 DB 合格の主張は含まない。2名目の監査は親担当が統合前に記録する。
