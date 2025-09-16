# MVPをリリースする前の必須条件（チェックリスト）

本ドキュメントは、整骨院/鍼灸院向けデータ分析SaaSのMVPを限定パイロットに出す前に“必ず”満たすべき最低条件を整理したものです。技術・セキュリティ・運用・品質の観点で抜け漏れを防ぎます。

## 技術要件（DB/アプリ）
- Supabase(Postgres) ステージング環境が作成済みであること
  - リージョン/プランを選定済み
  - プロジェクトIDを控え、CI/CDや型生成に利用できる
- スキーマ整合（実装と一致）
  - `user_sessions`, `security_events`, `registered_devices`, `session_policies` を実装どおり作成
  - 必須インデックスを設定（例: `user_sessions(user_id, clinic_id, is_active, is_revoked)`、`security_events(clinic_id, created_at)`）
- RLS（Row Level Security）
  - 全テーブルで RLS 有効化
  - クライアント（anon key）は閲覧系のみ、作成/更新はサーバ（サービスロール）で実施できること
  - ポリシーの疎通確認（意図どおり拒否/許可される）
- 型同期（DB→TS）
  - `supabase gen types --project-id <PROJECT_ID> --schema public > src/types/supabase.ts` を実行・コミット
  - TypeScript ビルドが型不整合なしで通る
- 環境変数の設定（ステージング/本番）
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`（サーバ専用・クライアントへ露出禁止）
  - 任意: `CSP_ROLLOUT_PHASE=report-only`, Realtime/レート制限が必要なら Upstash 変数
- UIビルド依存の解消
  - `@heroicons/react` の導入
  - `@/components/ui/*` の参照を解消（存在しない場合は代替UIに置換）
  - Next.js のビルドが成功する
- 最低限のKPI可視化
  - 新患→再診ファネル、施術者別パフォーマンス、売上/自費比率の3〜5KPIを実データ（またはCSV）で表示可能

## セキュリティ要件
- キー管理
  - サービスロールキーはサーバ側のみで使用（ルート/サーバハンドラに限定）
  - .envのアクセス権限と保管ルールを明文化
- 監査ログ
  - 重要操作が `security_events` に記録される（イベント種別/説明/ユーザー/IP/UA）
  - 閲覧権限の運用（誰がどの粒度で見られるか）を定義
- CSP の段階導入
  - 本番はまず `report-only` で導入し、レポート収集→ポリシー調整→enforce へ
- バックアップ/復旧
  - DB自動バックアップ設定と、復旧手順書（RTO/RPOの目安を記載）
- アクセス制御
  - 管理者/スタッフ等のロール設計と画面/データアクセスの整合
- 脅威検知
  - ブルートフォース/セッション乗っ取り/多デバイス検知の基本がONであり、過検知時の緩和方針を定義

## 運用要件（SRE/DevOps）
- 監視・アラート
  - 最低限のアラート（クラッシュ、レイテンシ、ETL/集計失敗、CSPレポート異常）
  - ログの収集・保管（期間とアクセス権）
- ランブック/運用手順
  - 重大アラート時の一次対応手順、連絡体制（オンコールの有無）
  - ユーザー問い合わせのエスカレーションフロー
- CI/CDとロックポリシー
  - パッケージマネージャは npm に統一、`npm ci` を使用
  - ロックファイルは `package-lock.json` のみ（重複ロックの排除）

## 品質保証（QA）
- テスト
  - セキュリティ/セッション系の主要テストが安定（ローカル/CIでグリーン）
  - 仕様変更に備え、モック/フィクスチャのメンテ戦略を共有
- パフォーマンス基準（MVP目安）
  - セッション検証: 平均 < 50ms、最大 < 100ms
  - 脅威分析: < 200ms（通常データセット）、1000件でも < 1s
  - 並行検証100件: 平均 < 100ms/req、全体 < 2s

## リリース前 最終チェック
- [ ] ステージングでスキーマ/RLS/型の疎通（insert/select/deny）
- [ ] UIビルド成功・主要画面の動作確認（KPI可視化）
- [ ] 監査ログ記録の確認（`security_events`）
- [ ] バックアップ設定と復旧手順書レビュー
- [ ] 環境変数・サービスロール取り扱いのダブルチェック
- [ ] 監視/アラートの有効化（最低限）
- [ ] 既知の制約と回避策を公開（CSV運用など）

## 既知の許容（MVP範囲）
- 外部システムとの本格連携（レセコン/予約/EMR）は次フェーズ。初期はCSV/サンプルデータ運用
- 高負荷集計の最適化（マテビュー/集計テーブル/夜間バッチ等）は次フェーズで段階導入
- CSPは `report-only` で導入し、運用しながら厳格化

---

### 参考コマンド
- 型生成: `supabase gen types --project-id <PROJECT_ID> --schema public > src/types/supabase.ts`
- 依存・テスト（npm統一）:
  - `rm -rf node_modules && npm ci`
  - `npm test`

