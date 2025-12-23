# GitHub公開計画（整骨院管理SaaS）

この文書は、本プロジェクトをGitHubで公開（Public）するための方針・手順・チェックリストをまとめた計画書です。機密情報の流出を防ぎつつ、第三者がセットアップ可能な最低限の情報を提供することを目的とします。

## 1. 目的

- 機密情報や個人情報を公開しない運用ルールを定義する。
- 公開対象/非公開対象を明確化し、`.gitignore`/`.gitattributes`/CIを整備する。
- 公開前チェックの抜け漏れを防ぐためのチェックリストを提供する。

## 2. 公開レベルと前提

- 公開レベル: Public（一般公開）
- サンプルデータ/SQL: 公開可（PIIを含まない合成データに限定）
- GitHub Actions: 利用する（lint, type-check, test まで）
- ライセンス: 社内限定（Proprietary/Source-available）を前提。OSSライセンスは適用しない。

## 3. 公開対象 / 非公開対象

公開する（例）

- アプリ本体ソース: `src/`, `middleware.ts`, `next.config.js`
- ドキュメント/設定例: `README.md`, `docs/`, `*.example`, `DEPLOYMENT_CHECKLIST.md`
- スキーマ/マイグレーション: `sql/`（接続情報を含めない）
- ビルド・テスト設定: `package.json`, `jest.*`, `eslint.*`, `tailwind.config.ts`

公開しない（例）

- 環境変数ファイル: `.env`, `.env.*`（例ファイルのみ公開：`*.example`）
- 資格情報/鍵: `*.pem`, `*.key`, `*.p12`, 証明書, サービスアカウントJSON
- 個人情報/バックアップ/エクスポート: `/backups`, `/exports`, `*.csv`, `*.backup`
- 生成物/依存/キャッシュ: `.next/`, `node_modules/`, `.swc/`, `coverage/`, `*.tsbuildinfo`
- ローカル環境/ツール: `pipx_env/`, `serena_env/`, `.claude/`, `.serena/`, エディタ設定
- ログ: `*.log`, `logs/`, `dev.log`

## 4. 実施手順（フェーズ）

フェーズA: 設計と準備

1. 公開範囲ポリシー確定（本計画の承認）
2. `.gitignore` 強化、`.gitattributes` 追加
3. `.env.*.example` の整備方針確定（キー名は維持、値はダミー）

フェーズB: 秘密情報と履歴対策 4) ワーキングツリーの秘密漏れ確認（ローカルで gitleaks / trufflehog など）5) 過去コミットに秘密がある場合は履歴除去（git filter-repo / BFG）＋鍵ローテーション

フェーズC: リポジトリ整頓6) 除外対象の未追跡化、例ファイルの整備7) README/セットアップ手順の公開前最終化

フェーズD: CI/セキュリティ8) GitHub Actions（lint, type-check, test）導入9) Secret Scanning / Dependabot / Branch protection 設定

フェーズE: 公開前チェック 10) チェックリスト実行、最終レビュー、初回プッシュ

## 5. 成果物（この作業で作成/更新）

- 強化版 `.gitignore`（ローカル環境/環境変数の追加除外）
- `.gitattributes`（EOL正規化・バイナリ扱いの明示）
- `SECURITY.md`（脆弱性報告窓口）
- GitHub Actions ワークフロー `/.github/workflows/ci.yml`
- 必要に応じて `*.env.example` の更新

## 6. GitHub側の推奨設定

- Default branch: `main`
- Security: Secret Scanning, Dependabot alerts を有効化
- Branch protection: レビュー必須、必須ステータスチェック（CI）有効、force push禁止
- Actions 権限: `permissions: contents: read` を基本、必要最小限で昇格
- 公開手順: まずPrivateで検証→問題なければPublic切替（今回Public前提のため、公開前チェックを厳格に）

## 7. 公開前チェックリスト

- 秘密情報
  - `.env*` が未追跡である（`*.example` のみ公開）
  - 鍵/証明書/サービスアカウントファイルが存在しない
- 生成物
  - `.next/`, `node_modules/`, キャッシュ類が未追跡である
- データ
  - サンプルデータは合成（PIIなし）である
  - ダンプ/バックアップ類（`*.csv`, `*.backup`）が未追跡である
- ドキュメント
  - READMEにセットアップ/ENV説明/開発・テスト手順がある
  - ライセンス方針が明記されている（Proprietary/社内限定）
  - `SECURITY.md` が存在し、報告窓口が明記されている
- CI
  - Lint / Typecheck / Test がCIでパスする
  - CIで秘密情報を参照していない（必要時はGitHub Secretsで）

## 8. ライセンス方針（社内限定の考え方）

- OSSライセンス（MIT/Apache-2.0等）は、第三者への利用・改変・再配布を許諾する前提。
- 社内限定（Proprietary/Source-available）の場合は、社外での利用・再配布・SaaS提供などを禁止する。
- 選択肢（例）
  - A) LICENSEを置かない（事実上 All rights reserved）。`package.json`の`license`は`UNLICENSED`。
  - B) 明示的な独自ライセンスを設置（例: “Internal Use Only”）。GitHub上でも権利範囲が明確になる。
  - C) PolyForm Internal Use 等の既成ソース可視ライセンスを採用（内部利用の範囲を明文化）。
- 公開はPublicでも、ライセンス上は社外での利用を許可しないため、クローン・参照は可能でも再利用は不可となる。
- どの方式にするか決定後、`LICENSE`を追加し、READMEにも方針を明記する。

## 9. 運用メモ

- サンプルデータは常に合成値を用い、生成プロセス/注意事項を `docs/` に残す。
- 新規ツール導入時は`.gitignore`の更新を忘れない（キャッシュ/生成物）。
- 秘密情報の可能性があるファイルは原則リポジトリに含めない（例: `.npmrc`のトークン等）。

---

最終更新: v1.0（公開準備初期セット）
