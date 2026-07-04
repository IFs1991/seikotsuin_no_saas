## CI修繕計画表

- 目的: CIの「Lint, Typecheck, Test」失敗を解消し、mainブランチのチェックを安定化。
- 範囲: ESLint違反の解消、型エラー確認、テスト失敗の洗い出しと最小修正、CI設定の整合性確認。

### 現状把握

- CIジョブ: Lint → Type check → Test を node:20 で実行（`.github/workflows/ci.yml`）。
- 失敗状況: 1 failing check（詳細ログ未確認）。
- 有力箇所:
  - `@typescript-eslint/no-var-requires` 違反の可能性:
    - `src/lib/security/csp-config.ts` の `require('crypto')`
    - `src/lib/mfa/backup-codes.ts` の `require('crypto')`
    - `src/app/admin/settings/page.tsx` の `require(...)` による同期読込
  - テストファイルにも `require` 使用箇所あり（ESLintが tests まで対象）。

### 失敗要因の仮説

- Lint: `no-var-requires` などの厳しめルールに抵触。
- Type check: 低リスク（が、型の軽微不整合の可能性は残る）。
- Test: 実行環境差（JSDOM/Node）や import/require 混在による不整合。

### 修繕方針

- 最小修正でESLint違反を解消。Node20のWeb Crypto標準化に合わせ `require('crypto')` を排除。
- 同期require撤廃: Next.jsの動的importへ統一。
- テスト限定の緩和: testファイルでは `no-var-requires` をオフにし、本番コードは厳格維持。
- 段階検証: Lint → Type check → Test の順に局所確認して前進。

### 対応詳細

1. `src/lib/security/csp-config.ts`
   - 修正: `generateNonce()` 内の `else if (typeof require !== 'undefined') { ... }` 分岐を削除し、`globalThis.crypto.getRandomValues` のみを使用。
   - 狙い: `no-var-requires`解消 + Node20/ブラウザ双方での動作統一。

2. `src/lib/mfa/backup-codes.ts`
   - 修正: `getSecureRandomInt()` の `else if (typeof require !== 'undefined') { ... }` を削除し、`crypto.getRandomValues` を第一選択、最終フォールバックは `Math.random()`。
   - 狙い: 同上。

3. `src/app/admin/settings/page.tsx`
   - 修正: `renderSettingsComponent()` の `require(...)` スイッチを撤廃し、既存 `componentMap` を使った動的importに統一（例: Next.js の `dynamic()` で `loading` 表示を付与）。
   - 狙い: ルール準拠とSSR/分割の一貫性確保。

4. `eslint.config.mjs`（テスト限定のルール緩和）
   - 追加: 下記オーバーライドを追加。
     - files: `['**/*.test.ts', '**/*.test.tsx']`
     - rules: `{ '@typescript-eslint/no-var-requires': 'off' }`
   - 狙い: 本番コードは厳格、testsは柔軟という線引き。

5)（必要時）CIログで発覚した追加のESLint/型/テスト不具合をピンポイント修正

- 例）Nextのルール（`@next/next/no-html-link-for-pages` 等）に触れる場合は当該箇所のみ是正。

### スケジュール（目安）

- Day 0: CIログ取得・確証（30分）
- Day 0: ①〜④の修正実装（1.5〜2.0時間）
- Day 0: ローカル検証（`npm run lint`, `npm run type-check`, `npm test`）（30〜45分）
- Day 0: PR作成・CI通過確認（10〜20分）
- 合計: 約2.5〜3.5時間

### 受け入れ条件

- Lint: `npm run lint` がエラー0
- Type: `npm run type-check` がエラー0
- Test: `npm test` 全グリーン（既存の失敗テストがあれば最小修正）
- CI: main への PR で CI 成功（Actions の quality ジョブ green）
- 差分: 変更は上記ファイル群＋ESLint設定のみ（周辺へ波及なし）

### ロールバック

- 変更は範囲限定。万一の不具合時は該当コミットをリバート（機能面のリスクは低）。
- `require` の削除は標準API準拠で、ロールバック不要が基本。

### リスクと対策

- Web Crypto非対応環境: Node20/現行ブラウザ前提で問題なし。フォールバックは残置。
- テスト環境差: JSDOMとNodeでAPI差異が出た場合、該当テストに環境モックを追加。
- 追加Lint違反: CIログを都度反映し、個別に対処（ルール緩和は最小限・局所）。

### 実行コマンド

- ローカル検証:
  - `npm ci`
  - `npm run lint`
  - `npm run type-check`
  - `npm test`
- CI確認:
  - PR作成 → Actions の「Lint, Typecheck, Test」ジョブ確認

### 成果物

- 本計画書（`docs/ci-fix-plan.md`）
- 修正コミット（4ファイル想定）
  - `src/lib/security/csp-config.ts`
  - `src/lib/mfa/backup-codes.ts`
  - `src/app/admin/settings/page.tsx`
  - `eslint.config.mjs`（tests向けoverride追加）
