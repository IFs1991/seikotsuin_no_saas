# M0: Supabase 環境構築・接続確認ガイド

本ドキュメントは、M0の成果物として要求されている「ステージング/本番Supabase環境の初期構築と接続確認」を満たすための具体的な手順を整理したものです。既存のリポジトリ資産（`sql/` 配下のマイグレーション、`deploy_rls.sh` 等）を活用し、再現性の高い構築フローと検証項目を定義します。

## 1. 前提条件
- Supabase CLI v1.216.7 以降
- チーム用Supabase組織に以下2プロジェクトを準備済み、または作成可能であること
  - `seikotsuin-mgmt-stg`
  - `seikotsuin-mgmt-prod`
- プロジェクトごとの `Project API Key` と `Project ID`
- `.env.staging.local` / `.env.production` などの環境ファイルを格納するセキュアストレージ（1Password, Doppler 等）
- リポジトリルートで `supabase/config.toml` を管理（本ガイドでは自動生成手順を記載）

## 2. 環境別設定ファイルの雛形
`.env.local.example` をベースに、ステージング/本番のためのファイルを以下の命名で作成します。

```
cp .env.local.example .env.staging
cp .env.local.example .env.production
```

書き換え必須項目（両環境共通）:

| 変数 | 説明 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクトの `Project URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase アノンキー |
| `SUPABASE_SERVICE_ROLE_KEY` | サービスロールキー（CI/CD・バッチ用）|
| `NEXTAUTH_SECRET` | Supabase Auth と整合する NextAuth シークレット |
| `NEXT_PUBLIC_APP_ENV` | `staging` / `production` |

本番のみ差し替え推奨項目:

- `NEXT_PUBLIC_ENABLE_AI_INSIGHTS=false`（未対応機能のサーフェス抑制）
- `NEXT_PUBLIC_APP_ENV=production`
- `NODE_ENV=production`

## 3. Supabase プロジェクト初期化手順

1. Supabase CLI ログイン
   ```bash
   supabase login
   ```
2. リポジトリルートで config を生成（環境別に設定）
   ```bash
   supabase init
   ```
   生成された `supabase/config.toml` にプロジェクト ID を追記:
   ```toml
   [projects.staging]
   project_id = "<STAGING_PROJECT_ID>"
   anon_key = "${NEXT_PUBLIC_SUPABASE_ANON_KEY}"
   service_role_key = "${SUPABASE_SERVICE_ROLE_KEY}"

   [projects.production]
   project_id = "<PRODUCTION_PROJECT_ID>"
   anon_key = "${NEXT_PUBLIC_SUPABASE_ANON_KEY}"
   service_role_key = "${SUPABASE_SERVICE_ROLE_KEY}"
   ```
3. 共通拡張とマイグレーションのデプロイ
   ```bash
   # ステージング
   supabase link --project-ref <STAGING_PROJECT_ID>
   supabase db push  # sql/migrations, src/database/schemas を順次適用
   supabase db execute --file src/database/functions/triggers.sql
   supabase db execute --file src/database/policies/auth_policies.sql

   # 本番（レビュー後）
   supabase link --project-ref <PRODUCTION_PROJECT_ID>
   supabase db push
   supabase db execute --file src/database/functions/triggers.sql
   supabase db execute --file src/database/policies/auth_policies.sql
   ```
4. RLS ポリシーの適用
   ```bash
   DATABASE_URL="postgresql://postgres:<password>@db.<region>.supabase.co:5432/postgres"
   ./deploy_rls.sh
   ```

## 4. 接続確認チェックリスト

| チェック項目 | コマンド/方法 | 期待結果 |
| --- | --- | --- |
| Postgres 接続 | `psql $DATABASE_URL -c '\l'` | DB一覧が表示される |
| JWT Claim | `select auth.get_current_role();` | `clinic_admin` 等が返る |
| RLS 有効化 | `select * from security_policy_status;` | 対象テーブルが `enabled` |
| 監査トリガー | `select * from audit.event_subscriptions;` | 既定イベントが登録済 |
| Supabase Storage | `supabase storage list --project-id <ID>` | `clinical-documents` 等のバケット確認 |
| API ヘルス | `curl https://<project>.supabase.co/rest/v1/health` | `{"status":"ok"}` |

接続確認は CI でも自動化し、`scripts/` 配下に `verify_supabase_connection.mjs` を追加予定です（M1で統合）。

## 5. 環境差分と運用ポリシー
- ステージング: サニタイズ済みデータ + 直近30日の KPI を投入し E2E テストを実施
- 本番: 実データ格納、直結するバッチ/ETL は必ず RLS 対応
- サービスロールキーの保管: Vault/1Password のみで管理し、CI は GitHub OIDC + Supabase JWT Exchange を利用
- Backups: Supabase 自動バックアップに加え、`supabase db dump` を週次で取得し S3 アーカイブ

## 6. 未決事項 / 次ステップ（M1 以降）
- `scripts/verify_supabase_connection.mjs` の実装と CI 組み込み
- Supabase Storage バケットポリシー（監査ログ、帳票PDF）設定
- 本番環境の監査ログ連携（CloudWatch or Logflare）

---
本ガイドに沿って構築・検証を完了すると、M0 の「Supabase 環境の初期構築と接続確認」が充足されます。運用手順は `DEPLOYMENT_CHECKLIST.md` と連携し、変更があった場合は本ドキュメントを更新してください。
