# Documentation Index

このフォルダは、プロジェクトの仕様書、運用手順、調査レポート、安定化メモを集約する場所です。

## ルートに残す Markdown

- `../README.md`: プロジェクト概要、セットアップ、主要コマンド
- `../AGENTS.md`: Codex / エージェント向け作業ルール
- `../CLAUDE.md`: Claude 向け作業ルール
- `../SECURITY.md`: セキュリティポリシー

## 主な配置先

- `setup/`: ローカル環境、バックエンド、MCP、開発ガイド
- `operations/`: デプロイ、RLS 適用、監査、環境変数、運用ランブック
- `specs/`: 機能仕様、UI/UX 仕様、ドメイン仕様
- `stabilization/`: 安定化 DoD、修正仕様、検証計画、エラー調査、ロードマップ
- `reports/`: 完了報告、評価レポート、脆弱性レポート、型安全性改善記録
- `database/`: SQL 配置方針、スキーマ変更メモ
- `handoffs/`: 引き継ぎ資料、作業継続メモ
- `memory/`: Serena / Context7 など作業メモ
- `product/`: プロダクト概要、リリース条件、価格・LP・発信資料、将来案
- `architecture/`: アーキテクチャ方針
- `milestones/`: マイルストーン別の計画・完了報告
- `test-specs/`: テスト仕様
- `beta/`: ベータ運用テンプレート
- `blog/`: 記事・発信メモ
- `オンボーディングやCS資料/`: CS、FAQ、オンボーディング資料

## 配置ルール

- 新しい仕様書は原則 `docs/specs/` または `docs/stabilization/` に置く。
- 運用手順やチェックリストは `docs/operations/` に置く。
- 完了報告や評価資料は `docs/reports/` に置く。
- 引き継ぎや作業再開用メモは `docs/handoffs/` に置く。
- プロダクト概要、LP、価格、発信、将来案は `docs/product/` に置く。
- `docs/` 直下には原則この `README.md` だけを置く。
- ルート直下に Markdown を増やす場合は、README やエージェント指示など、リポジトリ直下にある必要があるものに限定する。
