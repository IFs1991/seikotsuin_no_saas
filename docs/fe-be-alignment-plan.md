# フロントエンド/バックエンド整合 計画書（MVP向け）

目的: 日報・収益・患者分析のフロントUIとAPI/SQLの整合を取り、MVP稼働に必要な最小接続と不具合修正を完了する。

## スコープ
- 対象UI: ダッシュボード（確認のみ）、日報、収益分析、患者分析
- 対象API: `/api/daily-reports`, `/api/revenue`, `/api/patients`
- SQL: 既存のテーブル/ビュー/関数（`schema.sql`/`functions.sql`）を前提

## 現状のギャップと方針
- 日報
  - ギャップ: フロントはモック表示/ローカルステートで未送信、型がDB列と不一致
  - 方針: ページからAPI接続（取得/送信）。送信は`staff_id`省略、集計値を計算してPOST
- 収益
  - ギャップ: フックがモック。APIのキー（`menu_name/total_revenue/transaction_count`）とUI期待（`menu/revenue/count`）に差
  - 方針: フックでAPI接続し、UI期待形へ変換（フォールバックあり）
- 患者
  - ギャップ: フックがモック。APIのキー（`riskScores.category/riskScore`）とUI期待（`riskLevel/score`）に差
  - 方針: フックでAPI接続し、UI期待形へ変換（フォールバックあり）
- 不具合
  - `src/app/api/patients/route.ts` POST: `supabase`未定義
  - `AuditLogger.logUnauthorizedAccess`の引数順ミス

## 変更計画（ステップ）
1) API不具合修正
- patients POSTで`createClient()`を使用し`supabase`を定義
- `logUnauthorizedAccess`呼び出しの引数順を`(path, message, userId, userEmail, ip, ua)`へ修正

2) 日報UIのAPI接続
- `src/app/daily-reports/page.tsx`: `/api/daily-reports`から取得、UI型に整形（失敗時モック）
- `src/app/daily-reports/input/page.tsx`: 入力値から集計し`/api/daily-reports`へPOST、成功時リセット

3) 収益・患者フックのAPI接続
- `useRevenue`: `/api/revenue`呼出、`menuRanking`等を期待形へ変換
- `usePatientAnalysis`: `/api/patients`呼出、`conversionData/riskScores/ltvRanking/segmentData`等を期待形へ変換

4) 動作確認・最終調整
- 環境変数で`NEXT_PUBLIC_DEFAULT_CLINIC_ID`を使用
- API失敗時は既存サンプルにフォールバック

## 受け入れ基準
- 日報ページ: 一覧がAPIデータで表示され、入力→保存が成功する
- 収益ページ: API値が反映され、UIに破綻なし
- 患者ページ: API値が反映され、UIに破綻なし
- API: 400/401/403/500時のハンドリングが継続できる

## リスクと回避
- `staff_id`未指定: MVPでは省略（将来は認証連携で補完）
- データ欠損: 変換時に`null/undefined`は0や空配列へフォールバック

最終更新: v1.0（MVP整合 初版）
