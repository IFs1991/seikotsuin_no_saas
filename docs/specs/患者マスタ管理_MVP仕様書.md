# 患者マスタ管理_MVP仕様書

> **ステータス**: 実装完了（2026-01-01）
>
> E2Eテストの実行待ち。詳細は `docs/次にやるべきリスト_2026-01-01.md` を参照。

## 目的
- 患者マスタ（顧客）の一覧・検索・編集を提供し、運用を可能にする。

## 背景/課題
- 現状は患者分析/詳細のみで、一覧・検索・編集が欠如している。

## 対象範囲
- 患者一覧/検索/編集UI
- `/api/customers`（既存API）

## 非対象
- 医療カルテの詳細機能
- 保険請求ロジック

## 機能要件
### 一覧
- `/patients` にタブ追加、または `/patients/list` を新設
- 最新順で最大50件を表示
- 検索（氏名/電話番号）

### 編集
- 一覧から編集モーダルを開ける
- 氏名/電話/メール/メモ/カスタム属性を更新可能

### 新規登録
- 最小項目: 氏名/電話番号

## API利用
- `GET /api/customers?clinic_id=...&q=...`
- `POST /api/customers`
- `PATCH /api/customers`

## UI/UX
- 検索入力はデバウンス（300ms）
- 保存成功時にトースト表示

## テスト戦略（TDD）
### 先に書くテスト（fail-first）
- 検索入力でAPIが `q` 付きで呼ばれる
- 編集保存でPATCHが呼ばれ、一覧が更新される

### テスト一覧
- `src/__tests__/pages/patients-list.test.tsx`（新規）
- `src/__tests__/api/patient-schema.test.ts`（既存確認）

## AI駆動開発の進め方
- 既存の `/api/customers` を唯一のデータソースとする。
- 一覧/検索/編集UIは同じテーブル（`customers`）への操作に限定する。

## コンフリクト回避ルール
- `customers` スキーマは変更しない（必要な追加属性は `custom_attributes` に格納）。
- 新規エンドポイントは追加せず、GET/POST/PATCH を拡張範囲で利用する。

## E2Eテスト仕様
### 前提データ
- `customers` に5件のテスト患者

### シナリオ
1. 患者一覧が表示される（最新順）。
2. 検索入力で `q` 付きAPIが呼ばれ、結果が絞り込まれる。
3. 編集モーダルで電話番号を更新 → 一覧に反映される。
4. 新規登録で患者が追加される。

## 受け入れ基準
- 患者一覧/検索/編集が実運用できる
- `patients` 画面から患者詳細へ遷移できる

## 変更対象ファイル
- `src/app/patients/page.tsx`（タブ or 遷移追加）- 未着手
- `src/app/patients/list/page.tsx`（新規）- ✅ 完了
- `src/components/patients/*`（新規/更新）- ✅ 完了

## 実装済みファイル一覧

| ファイル | 説明 |
|----------|------|
| `src/app/patients/list/page.tsx` | 患者一覧ページ |
| `src/hooks/usePatientsList.ts` | データ取得・操作フック（デバウンス300ms） |
| `src/components/patients/patients-table.tsx` | 一覧テーブルコンポーネント |
| `src/components/patients/patient-modal.tsx` | 編集/新規登録モーダル |
| `src/__tests__/e2e-playwright/patients-list.spec.ts` | E2Eテスト（Playwright） |
| `src/__tests__/pages/patients-list.test.tsx` | Jestテスト |
