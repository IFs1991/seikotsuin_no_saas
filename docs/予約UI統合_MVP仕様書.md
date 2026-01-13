# 予約UI統合_MVP仕様書

## ステータス: ✅ 完了（2026-01-01）

### 実装サマリー
| 項目 | 状態 |
|------|------|
| 旧プロトタイプのアーカイブ | ✅ `src/legacy/Reservation` へ移動 |
| モックAPIの除去 | ✅ `_App.tsx` 削除 |
| ナビゲーション一本化 | ✅ 全導線が `/reservations` を参照 |
| ユニットテスト | ✅ 7件パス |
| E2Eテスト | ✅ 作成済み（環境依存） |
| TypeScript設定 | ✅ `src/legacy` を除外 |

---

## 目的
- 旧プロトタイプ（Vite構成）と現行Next.js予約機能を統合し、実装の重複を解消する。

## 背景/課題
- `src/app/Reservation` にモックAPIを持つ別実装が残存。
- 本番ルートは `src/app/reservations` のため二重管理になっている。

## 対象範囲
- `src/app/Reservation/*`（旧プロトタイプ）
- `src/app/reservations/*`（現行予約UI）

## 統合方針（MVP）
1. **現行Next.js予約UIを正式版とする**
2. **旧プロトタイプはアーカイブへ移動**（`src/legacy/Reservation` など）
3. モックAPI (`src/app/Reservation/api.ts`) を削除し、実APIのみ残す
4. 予約UIで不足している機能があれば `src/app/reservations` に移植

## 変更内容
- 旧プロトタイプの依存を完全に切る
- ナビゲーション/ルーティングに旧プロトタイプへの導線を残さない

## テスト戦略（TDD）
### 先に書くテスト（fail-first）
- 予約UIが `src/app/reservations/api.ts` を利用していること
- 旧プロトタイプのモックAPIが参照されないこと

### テスト一覧
- `src/__tests__/pages/reservations.test.tsx`（新規/既存更新）
- `src/__tests__/lib/reservation-service.test.ts`（既存更新）

## AI駆動開発の進め方
- 旧プロトタイプは「移動 or 削除」で完結させ、参照を完全に断つ。
- 実装の正は `src/app/reservations` のみとする。

## コンフリクト回避ルール
- 予約APIは `src/app/reservations/api.ts` の契約を固定し、旧APIを再利用しない。
- 旧プロトタイプの資産を再利用する場合は必ず移植してから削除する。

## E2Eテスト仕様
### 前提データ
- `resources` / `menus` / `customers` にテストデータ

### シナリオ
1. `/reservations` で一覧が表示される。
2. 新規予約を作成 → 一覧に追加される。
3. `/Reservation` へアクセスすると 404 になる（旧プロトタイプの除去確認）。

## 受け入れ基準
- ビルド成果物に旧プロトタイプが含まれない
- 予約機能の導線がNext.js実装に一本化される

## 変更対象ファイル
- `src/app/Reservation/*`
- `src/app/reservations/*`
- `src/app/reservations/api.ts`
