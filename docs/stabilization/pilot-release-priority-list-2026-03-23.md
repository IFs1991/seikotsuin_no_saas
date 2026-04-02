# パイロットリリース優先順位リスト 2026-03-23

参照:
- `docs/specs/pilot-release-spec-v0.1.md`
- `docs/stabilization/DoD-v0.1.md`

目的:
- 2026年4月初旬のパイロット版リリースに向けて、未完了項目を優先順位順に処理する
- 実装よりも Go/No-Go 判定に必要な確認と運用準備を優先する

## 最優先

1. `P0-04` 実 DSN 着弾確認
   - 対象: `docs/specs/pilot-release-spec-v0.1.md` `P0-04`
   - 内容: `SENTRY_DSN` を設定し、`POST /api/admin/monitoring/sentry-test` のイベントが Sentry に着弾することを確認する
   - 根拠ファイル:
     - `src/app/api/admin/monitoring/sentry-test/route.ts`
     - `src/lib/monitoring/sentry.ts`
   - 完了条件: Sentry 側で test event が受信でき、仕様書の `P0-04` を完了に更新できる

2. Staging 環境変数で `npm run build` 成功
   - 対象: `docs/specs/pilot-release-spec-v0.1.md` `CI / ビルド`
   - 内容: Staging 用 env を使って build を通し、デプロイ直前の停止要因を先に潰す
   - 根拠ファイル:
     - `package.json` `scripts.build`
     - `next.config.js`
   - 完了条件: Staging 構成で `npm run build` が成功する

3. CI 5ゲートを全て PASS
   - 対象: `docs/specs/pilot-release-spec-v0.1.md` `CI 必須ゲート`
   - 内容:
     - `quality`
     - `build`
     - `supabase-contract`
     - `fixture-preflight`
     - `focused-regression`
   - 完了条件: 必須 5 ゲートが全て PASS

## 高優先

4. `DOD-08` の記録
   - 対象: `docs/stabilization/DoD-v0.1.md` `DOD-08`
   - 内容: tenant boundary と RLS source-of-truth の整合確認を記録する
   - 完了条件: SQL クエリ結果を保全し、仕様書の Go/No-Go 項目を更新できる

5. `DOD-09` の記録
   - 対象: `docs/stabilization/DoD-v0.1.md` `DOD-09`
   - 内容: client path が server-side clinic guard をバイパスしていないことを確認する
   - 完了条件: `rg` の確認結果を保全し、仕様書の Go/No-Go 項目を更新できる

6. 本番 DB の MFA 暗号化キー設定
   - 対象: `docs/specs/pilot-release-spec-v0.1.md` `DB / インフラ`
   - 内容: `ALTER DATABASE postgres SET "app.settings.mfa_encryption_key" = '<random-secret>';` を本番 DB に適用する
   - 完了条件: DB 設定が反映済みであることを確認できる

## 中優先

7. 2院分の初期データ投入
   - 対象: `docs/specs/pilot-release-spec-v0.1.md` `DB / インフラ`
   - 内容:
     - テナント
     - 必要なマスタ
     - パイロット運用に必要な基本設定
   - 完了条件: 2院分の運用開始データが投入済み

8. パイロットユーザー作成
   - 対象: `docs/specs/pilot-release-spec-v0.1.md` `DB / インフラ`
   - 内容:
     - `admin`
     - `clinic_admin` / `manager`
     - `therapist` / `staff`
   - 完了条件: パイロット利用者がログイン可能な状態になる

## 最終確認

9. 仕様書と Go/No-Go チェック更新
   - 対象: `docs/specs/pilot-release-spec-v0.1.md`
   - 内容: 実施済み項目を仕様書に反映し、未完了を明確にする
   - 完了条件: 仕様書の進行状況と実態が一致している

10. パイロット実施判断
   - 対象: `docs/specs/pilot-release-spec-v0.1.md` `受入基準（パイロットリリース Go/No-Go）`
   - 内容: 未解決事項を例外管理に載せたうえで、開始可否を判断する
   - 完了条件: Go/No-Go 判定ができる

## 実務上の順序

1. `P0-04` を閉じる
2. Staging build と CI 5ゲートを通す
3. `DOD-08` / `DOD-09` を記録する
4. MFA キー、初期データ、パイロットユーザーを準備する
5. 仕様書を更新して Go/No-Go を判断する
