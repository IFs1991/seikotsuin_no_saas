# Plan PR-04: Navigation / Test Alignment v0.1

## 1. 目的

非MVP導線や未接続画面をナビゲーションから外す変更を、関連テスト修正まで含めて 1 本で閉じる。

本計画は `docs/stabilization/refactor-plan-mvp-multistore-self-review-v0.1.md` の Finding 4 に対応する。

## 2. 現状

- `docs/stabilization/refactor-plan-mvp-multistore-v0.1.md` では PR-04 にナビ整理が含まれている
- `docs/stabilization/mvp-release-readiness-2026-03-06.md` でも、非MVP画面をナビから外す必要が指摘されている
- 既存テストには `/multi-store` や管理画面導線を前提とするものがある
- 導線削除だけ先に行うと、component test / Playwright / integration test の期待値が崩れる

## 3. 対象

- `src/components/navigation/header.tsx`
- `src/components/navigation/sidebar.tsx`
- `src/components/navigation/mobile-bottom-nav.tsx`
- `src/app/admin/(protected)/settings/page.tsx`
- `src/__tests__/components/**`
- `src/__tests__/e2e-playwright/**`
- `src/__tests__/integration/**`

## 4. 方針

- UI 変更とテスト修正は同一 PR で完結させる
- `/multi-store` は多店舗 MVP コアのため削除対象にしない
- 削除対象は「非MVP」「未接続」「準備中」の導線に限定する
- 410 API 参照や廃止済み画面の導線も同時に切る

## 5. 実行手順

1. 現行ナビ項目を棚卸しし、以下に分類する。
   - MVP 残置
   - 一時非表示
   - 廃止
2. `settings/page.tsx` の `componentMap` とカテゴリ表示を確認する。
3. ナビ変更で影響するテストを洗い出す。
   - 表示件数
   - リンク存在確認
   - role ベース表示制御
4. UI 修正と同時に test fixture / expected route を更新する。
5. 「導線が無いが URL 直打ちは残る」状態にするか、「URL 自体を閉じる」かを画面ごとに決める。

## 6. 導線判定の基準

### 残す

- 認証導線
- 業務コア
- 管理設定のうち MVP 実装済み項目
- 多店舗コア

### 一時非表示

- 準備中表示しかない管理カテゴリ
- セキュリティ運用系で未完成のもの
- ベータ運用色が強い画面

### 廃止

- 410 API に依存する通常導線
- 利用想定が無い旧ページ

## 7. 受け入れ条件

- 非MVP画面がナビに残らない
- `/multi-store` は削除せず、多店舗 MVP 導線として残す
- 関連 component test / E2E / integration test が新導線に一致する
- 410 API を通常導線が叩かない

## 8. DoD

- `docs/stabilization/DoD-v0.1.md` `DOD-10`

## 9. リスク

- UI 変更だけ先に入れると、既存テストが連鎖的に落ちる
- `/multi-store` を非MVP導線と誤認して外すと、多店舗 MVP 要件に反する
- 廃止対象と一時非表示対象を混同すると、復帰コストが上がる

## 10. 完了証跡

- navigation コンポーネント差分
- `settings/page.tsx` の表示カテゴリ差分
- 関連テストの更新
- 必要に応じて MVP 導線一覧の文書更新
