# マスタ編集保存_MVP仕様書（詳細版）

## 目的
- フロントの編集結果を永続保存する。

## 依存テーブル
- public.system_settings

## 仕様
- src/components/master/master-data-form.tsx
- 保存は /api/admin/master-data
- 權限に応じて clinic_id を切り替え

## 競合回避
- 輸入/輸出/ロールバックは別仕様

## 受け入れ基準
- リロード後に値が保持される

## 実装メモ
- 取得/保存対象: system_settings の key=menu_items, category=menu
- 保存形式: value にメニュー配列を保存 (data_type=array)
- 権限分岐:
  - admin は clinic_id を null (global) として保存/取得
  - clinic_manager は自身の clinic_id を保存/取得

## 次にやること
- 初期データの投入方針を決める (seed or 初回保存)
- API での重複キー (clinic_id + key) の扱いを確認
- 画面上の保存成功/失敗の通知方針を確定

## テスト環境の既知の問題と解決策

### MESSAGEPORT open handle 問題 (2024-12-30 解決済み)

**症状:**
```
Jest has detected the following 1 open handle potentially keeping Jest from exiting:
  ●  MESSAGEPORT
```

**根本原因:**
- React 19 の scheduler が `MessageChannel` を使用して並行レンダリングをスケジュール
- jsdom + worker_threads の `MessageChannel` はテスト終了後も適切にクローズされない
- `jest.setup.js` が `jest.setup.messagechannel.ts` の設定を上書きしていた

**解決策:**
1. `jest.setup.js` から `MessageChannel`/`MessagePort` ポリフィルを削除
2. `jest.setup.messagechannel.ts` で `Object.defineProperty` を使用して確実に `undefined` 化
3. `jest.setup.after.js` で `@testing-library/react` の `cleanup()` を明示的に呼び出し

**技術的詳細:**
```
MessageChannel = undefined → React scheduler が setTimeout fallback を使用 → リークなし
```

**変更ファイル:**
- `jest.setup.js:26-34`
- `jest.setup.messagechannel.ts`
- `jest.setup.after.js:5-7, 383-387`
