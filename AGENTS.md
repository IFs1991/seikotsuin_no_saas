# AGENTS.md — 作業規約（正本）

本ファイルは**規範（してはいけないこと・必須事項）のみ**を定める。
アーキテクチャ・コマンド・落とし穴などの事実情報は `CLAUDE.md` を参照。

## 基本方針

- フェーズは**安定化**（`0.1.0-pilot`）。小さく・可逆に・レビューしやすく。1 task = 1 PR
- 依頼されていない機能追加・広範囲リファクタはしない
- コミットは Conventional Commits（`feat:` / `fix:` / `refactor:` / `test:` / `docs:`、scope任意）で小さく刻む

## セキュリティ不変条件（絶対）

- RLS・認可・テナント分離・clinic scope を「テストを通すため」「型を通すため」に弱めない
- `clinic_id` / `tenant_id` / `organization_id` / `user_id` / `staff_id` / `role` / clinic scope に触れる変更は**テスト追加が必須**
- 認可・テナントスコープ付きデータアクセスは **fail-closed**。判断に迷ったら拒否側に倒す
- クライアント側チェックだけで認可を済ませない（RLSが最後の砦）。テナント分離をUIだけの関心事にしない

## 型安全

- `any` 系エスケープハッチ（`any` / `as any` / `any` 経由キャスト / `@ts-ignore`）は禁止（ESLintも強制）。`@ts-expect-error` は意図的な負のテスト + 理由コメント付きのみ
- 型が不明なら: `unknown` + 絞り込み / 型ガード / 判別可能ユニオン / Supabase生成型 / API境界でのZod検証。DB由来のデータでは Row / Insert / Update / APIリクエスト / レスポンス / フォーム / ドメインモデルの型を区別する
- `value as unknown as T` や不変条件のない `value!` は避ける
- 既存の `any` は依頼と直接関係する場合のみ置換。無関係な一括駆除リファクタはしない

## 破壊的操作は事前承認

以下は実行・提案の前に明示的な承認を得る:

- `supabase db reset` / `db push` / `migration up`
- Dockerボリューム・コンテナの削除
- `git reset --hard` / force-push
- ファイル・ディレクトリの再帰削除
- 破壊的なマイグレーション変更

## マイグレーション

- 仕様書（`docs/stabilization/spec-*.md`）+ ロールバックSQL（`supabase/rollbacks/`）をセットで用意せずにマイグレーションを追加・変更しない

## UI/UX変更

UI/UXに触れる変更（画面・フォーム・導線・コピー・スタイル）は `Design.md`（行動UX + ビジュアル規範の正本）に従う。要点:

- 作業前にモードを判定する: 既存UIの追加・修正は **EXTEND**（デフォルト）。「改善して」等の曖昧な依頼を REDESIGN と解釈しない。REDESIGN はユーザーの明示指示がある場合のみ
- EXTEND では **Section C（既存デザイン保全）が最優先**。既存トークン・共有コンポーネント（`src/components/ui/`）を再利用し、グローバルスタイル・テーマ・共有デフォルトをタスク外の画面に波及する形で変更しない。頼まれていないリスタイルは禁止
- 行動UXパターン（P01–P11）を使う変更は **Ethics Gate（Design.md §6）を通す**。自動リジェクトリスト（偽の希少性・隠れコスト・confirmshaming・有料オプションのプリセレクト等）に該当する実装は拒否する
- 患者・医療系の導線（予約・キャンセル・同意・価格）は Design.md §11 の高リスク領域。CVR最適化のみを目的とした変更をしない

- 開発者のローカルは**Windows**。提示するコマンドはPowerShell互換を優先し、Unixシェル前提（`rm -rf`、`export VAR=value` 等）を仮定しない
- **npm固定**。他パッケージマネージャへの切替・ロックファイル導入・混在は禁止。依存変更が不要なタスクで依存ファイルを再生成しない

## テスト

- 優先領域: テナント分離 / 認可・ロール境界 / clinic scope / 予約の可視性 / 患者データアクセス / API・フォーム検証 / RLS / fixture整合性
- テスト失敗時は「実装・fixture・環境・期待値のどれが悪いか」を見極める。**壊れた実装に合わせてテストを変えない**

## 報告・エビデンス

- 主張にはrepoファイルパス + 該当する設定名・関数名・ポリシー名・ルート・テスト名を添える
- 安定化タスクは `docs/stabilization/DoD-v0.1.md` のDoD項目に紐付ける
- 実行していない検証を「実施済み」と報告しない。検証できなかった場合は、何を検証していないか・なぜかを明記する

## 商用ハードニング・migration program

- `docs/stabilization/spec-commercial-hardening-migration-v1.0.md` を実装正本とする
- 本programはPR-00から依存順に実施し、複数PRを1本へ統合しない
- DB/RLS/auth/billing変更はRED testを先に追加する
- 実装後、read-only監査subagentを最低2つ走らせる
- 実装者自身のレビューだけでPASSにしない
- production DB・Auth設定・branch protection変更は人間承認が必要
